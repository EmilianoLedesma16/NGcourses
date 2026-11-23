# Capítulo 3 · Base de datos (PostgreSQL 17) — las 30 tablas

El esquema se define con **SQLModel** en `backend/app/models/*.py` y se materializa con **Alembic**
(`backend/app/alembic/versions/`). PostgreSQL 17 corre en el servicio `db` de Docker Compose con el volumen
`app-db-data`.

Convenciones del esquema:

- **PK UUID** (`uuid4` generado en Python) en todas las tablas salvo `feature_flags` (PK `nombre`) y
  `likes_comentario` (PK compuesta `comentario_id + usuario_id`).
- Los nombres de tabla están en español y en plural (`cursos`, `lecciones`…), excepto `user` e `item`, que
  vienen de la plantilla original de FastAPI.
- Las columnas `metadata` (JSONB) se mapean en Python como `metadata_` porque `metadata` es un nombre
  reservado de SQLAlchemy.
- Las fechas se guardan como `TIMESTAMP` sin zona (UTC por convención, `datetime.utcnow`), excepto
  `comentarios_leccion` y `likes_comentario`, que usan `TIMESTAMP WITH TIME ZONE`. Por esto `sqlmodel` está
  fijado a `<0.0.25`.
- Los enums se guardan como tipos `ENUM` nativos de Postgres (creados en la migración inicial) salvo
  `cursos.marca` y `cursos.tipo`, que son `VARCHAR(20)`.

Las 30 tablas se agrupan en **5 dominios**:

```
D1 Identidad, sesiones y sistema (6)      D2 Catálogo y contenido (7)
  user, refresh_tokens, feature_flags,      categorias, etiquetas, curso_etiquetas,
  notificaciones, eventos_sistema, item     cursos, modulos, lecciones, recursos_leccion

D3 Aprendizaje y evaluación (6)          D4 Comunidad (4)
  inscripciones, progreso_lecciones,        calificaciones, votos_resena,
  quiz_intentos, quiz_respuestas,           comentarios_leccion, likes_comentario
  certificados, eventos_analytics
                                          D5 Empresas y comercial (7)
                                            organizaciones, usuarios_organizacion,
                                            licencias_curso, solicitudes_curso,
                                            comentarios_solicitud, invitaciones_curso, pagos
```

---

## 3.1 Dominio 1 · Identidad, sesiones y sistema

| Tabla (modelo) | Columnas, tipos y restricciones | Relaciones y rol funcional |
|---|---|---|
| `user` (`User`, `models/user.py`) | `id` UUID PK; `email` VARCHAR(255) **único e indexado**; `hashed_password`; `is_active` bool (default true); `is_superuser` bool; `full_name` VARCHAR(255)?; `rol` ENUM `rolusuario` (default `estudiante`); `estado` ENUM `estadousuario` (default `activo`); `telefono`, `telefono_e164` VARCHAR(20)?; `whatsapp_opt_in` bool; `notif_prefs` JSONB?; `password_reset_token` VARCHAR(255)?, `password_reset_expira`; `token_activacion` VARCHAR(255)?, `token_activacion_expira`; `avatar_url` VARCHAR(255)? | 1:N con `cursos` (como instructor), `inscripciones`, `calificaciones`, `certificados`, `notificaciones`, `item` (cascade). Cuenta de cualquier rol. `is_active` es el candado que valida `get_current_user`; `crud.update_user` lo mantiene sincronizado con `estado`. El token de activación se guarda **hasheado**. |
| `refresh_tokens` (`RefreshToken`, `models/sistema.py`) | `id`; `usuario_id` FK `user`; `token_hash` (indexado, SHA-256 del token); `expira_en`; `revocado_en`?; `reemplazado_por_token_hash`?; `ip_creacion` VARCHAR(45)?; `creado_en` | Una fila por sesión emitida. Al rotar se marca `revocado_en` y se apunta al hash nuevo; así queda la cadena de rotación para auditoría. |
| `feature_flags` (`FeatureFlag`) | `nombre` VARCHAR(100) **PK**; `habilitado` bool; `actualizado_en` | Interruptores en caliente. Flags usados en el código: `instructores` (sembrado en `false` por la migración `c3d4e5f6a7b8`) y `multiples_supervisores`. |
| `notificaciones` (`Notificacion`) | `id`; `usuario_id` FK; `canal` ENUM; `tipo` ENUM; `titulo`; `cuerpo`?; `estado` ENUM (default `pendiente`); `proveedor` ENUM?; `proveedor_message_id`?; `metadata` JSONB; `creado_en`, `enviado_en`, `leido_en` | Bandeja de notificaciones multicanal **reservada**: el código actual no inserta filas; solo se purgan al borrar un usuario. |
| `eventos_sistema` (`EventoSistema`) | `id`; `actor_usuario_id` FK?; `categoria` ENUM; `accion` VARCHAR(100); `entidad` VARCHAR(100)?; `entidad_id` UUID?; `ip` VARCHAR(45)?; `user_agent`?; `metadata`; `creado_en` | Bitácora de auditoría **reservada** (sin escrituras en el código actual). |
| `item` (`Item`, `models/item.py`) | `id`; `title` VARCHAR(255); `description` VARCHAR(255)?; `owner_id` FK `user` ON DELETE CASCADE | Herencia de la plantilla *full-stack-fastapi-template*. Tiene CRUD en `/items` pero ninguna pantalla lo usa. |

## 3.2 Dominio 2 · Catálogo y contenido

| Tabla (modelo) | Columnas, tipos y restricciones | Relaciones y rol funcional |
|---|---|---|
| `categorias` (`Categoria`, `models/contenido.py`) | `id`; `nombre` VARCHAR(255); `slug` **único e indexado**; `descripcion`?; `orden` int; `activa` bool; `creado_en` | 1:N con `cursos`. Clasificación del catálogo (filtro `categoria_id`). |
| `etiquetas` (`Etiqueta`) | `id`; `nombre`; `slug` único; `creado_en` | N:M con `cursos` por `curso_etiquetas`. |
| `curso_etiquetas` (`CursoEtiqueta`) | `id`; `curso_id` FK; `etiqueta_id` FK; `creado_en`; **UNIQUE(curso_id, etiqueta_id)** | Tabla puente curso ↔ etiqueta. |
| `cursos` (`Curso`) | `id`; `categoria_id` FK?; `instructor_id` FK `user` (obligatorio); `titulo` VARCHAR(255); `slug` único; `descripcion`?; `estado` ENUM (default `borrador`); `marca` VARCHAR(20) (default `ram`); `duracion_seg`; `calificacion_prom` float; `total_resenas`; `es_gratis` bool; `precio` NUMERIC(10,2)?; `moneda` VARCHAR(3) (default `MXN`); `destacado` bool; `portada_url` VARCHAR(500)?; `bunny_library_id` VARCHAR(50)?; `bunny_collection_id` VARCHAR(100)?; `metadata` JSONB; `publicado_en`; `creado_en`; `actualizado_en`; `tipo` VARCHAR(20) (`individual`/`global`); `curso_padre_id` FK `cursos` ON DELETE SET NULL, indexado; `orden_en_padre` int | 1:N con `modulos` (cascade), `inscripciones`, `calificaciones`, `licencias_curso`. **Auto-relación**: un curso `global` agrupa cursos `individual` que lo apuntan con `curso_padre_id`, ordenados por `orden_en_padre`; si se borra el global, los hijos quedan sueltos. `metadata` guarda `nivel`, `lo_que_aprenderas`, `requisitos` y `notas_revision`. `calificacion_prom`/`total_resenas` son agregados que recalcula `crud._recalcular_rating_curso`. |
| `modulos` (`Modulo`) | `id`; `curso_id` FK ON DELETE CASCADE; `titulo`; `descripcion`?; `orden`; `creado_en` | 1:N con `lecciones` (cascade). Agrupa lecciones; el orden lo da `orden`. |
| `lecciones` (`Leccion`) | `id`; `modulo_id` FK ON DELETE CASCADE; `titulo`; `resumen` TEXT?; `tipo` ENUM (`video`/`quiz`/`lectura`); `orden`; `duracion_seg`; `umbral_completado_pct` (default 90); `es_visible` bool (server default `true`); `bunny_video_id` VARCHAR(255)?; `hls_url`?; `thumbnail_url`?; `contenido` TEXT? (JSON del quiz o texto de lectura); `metadata`; `creado_en`; `actualizado_en` | 1:N con `recursos_leccion` (cascade), `progreso_lecciones`, `eventos_analytics`. Una lección oculta (`es_visible=false`) no se muestra al alumno ni cuenta para el avance ni para el certificado. |
| `recursos_leccion` (`RecursoLeccion`) | `id`; `leccion_id` FK ON DELETE CASCADE; `tipo` ENUM (`pdf`, `link`, `archivo`, `docx`, `xlsx`, `pptx`); `titulo`; `url`; `metadata`; `creado_en` | Material descargable o enlaces de una lección. Los archivos subidos se guardan en el volumen de media y se descargan por endpoint autenticado. |

**Formato del quiz** (`lecciones.contenido` cuando `tipo = quiz`), tal como lo guarda el editor
(`QuizBuilder`) y lo califica `crud.crear_intento_quiz`:

```json
{
  "preguntas": [
    {
      "id": "uuid-local",
      "tipo": "multiple_choice",          // o "true_false"
      "enunciado": "¿…?",
      "opciones": [
        { "id": "uuid-local", "texto": "Opción A", "esCorrecta": true },
        { "id": "uuid-local", "texto": "Opción B", "esCorrecta": false }
      ]
    }
  ]
}
```

Al alumno se le entrega sin `esCorrecta` y sin preguntas incompletas (`cursos._sanitize_quiz_for_student`).

## 3.3 Dominio 3 · Aprendizaje y evaluación

| Tabla (modelo) | Columnas, tipos y restricciones | Relaciones y rol funcional |
|---|---|---|
| `inscripciones` (`Inscripcion`, `models/inscripcion.py`) | `id`; `usuario_id` FK; `curso_id` FK; `estado` ENUM (`activa`/`finalizada`/`cancelado`); `inscrito_en`; `ultimo_acceso_en`?; `metadata`; **UNIQUE(usuario_id, curso_id)** | 1:N con `progreso_lecciones` (cascade), `quiz_intentos` (cascade en BD), 1:1 con `certificados`. Una baja **no borra** la fila: la pasa a `cancelado`, y una nueva inscripción la reactiva. |
| `progreso_lecciones` (`ProgresoLeccion`) | `id`; `inscripcion_id` FK ON DELETE CASCADE; `leccion_id` FK; `visto_seg`; `progreso_pct` (0-100); `completado` bool; `completado_en`?; `actualizado_en`?; **UNIQUE(inscripcion_id, leccion_id)** | Avance por lección. `crud.upsert_progreso` solo deja crecer `visto_seg` y `progreso_pct` (usa `max`) y marca `completado` al cruzar el umbral. El UNIQUE resuelve dos peticiones simultáneas. |
| `quiz_intentos` (`QuizIntento`, `models/quiz.py`) | `id`; `inscripcion_id` FK ON DELETE CASCADE; `leccion_id` FK; `aprobado` bool; `total_preguntas`; `correctas`; `creado_en`; índice `ix_quiz_intentos_inscripcion_leccion` | Un intento calificado. Máximo 3 por lección; aprobado con ≥ 60 %. |
| `quiz_respuestas` (`QuizRespuesta`) | `id`; `intento_id` FK ON DELETE CASCADE; `pregunta_id` VARCHAR(100); `opcion_id` VARCHAR(100); `es_correcta` bool | Respuesta elegida por pregunta. Los IDs son los IDs locales del JSON del quiz. |
| `certificados` (`Certificado`) | `id`; `inscripcion_id` FK **único**; `usuario_id` FK; `curso_id` FK; `folio` VARCHAR(100) **único** (`NG-` + 12 hex); `url_pdf`?; `hash_verificacion` (SHA-256 de `inscripcion_id + folio`); `emitido_en`; `metadata` | Se emite al completar todas las lecciones visibles. El UNIQUE en `inscripcion_id` evita duplicados por concurrencia. |
| `eventos_analytics` (`EventoAnalytics`) | `id`; `usuario_id`, `curso_id`, `leccion_id` FK; `evento` VARCHAR(50); `posicion_seg`; `metadata`; `creado_en` | Telemetría de reproducción **reservada** (sin escrituras actuales). |

## 3.4 Dominio 4 · Comunidad

| Tabla (modelo) | Columnas, tipos y restricciones | Relaciones y rol funcional |
|---|---|---|
| `calificaciones` (`Calificacion`, `models/calificacion.py`) | `id`; `usuario_id` FK; `curso_id` FK; `estrellas` int (1-5); `titulo` VARCHAR(255)?; `comentario`?; `estado` ENUM (`publica`/`oculta`/`pendiente`, default `pendiente`); `creado_en`; `actualizado_en`; **UNIQUE(usuario_id, curso_id)** | Una reseña por alumno y curso; solo si el alumno terminó el curso. `crud.create_calificacion` la crea directamente como `publica` (el default `pendiente` del modelo no se usa hoy). Alimenta `cursos.calificacion_prom`. |
| `votos_resena` (`VotoResena`) | `id`; `calificacion_id` FK ON DELETE CASCADE; `usuario_id` FK; `voto` int (-1, 0, 1); `creado_en`; **UNIQUE(calificacion_id, usuario_id)** | "¿Te fue útil?" sobre las reseñas. |
| `comentarios_leccion` (`ComentarioLeccion`, `models/comentario.py`) | `id`; `leccion_id` FK ON DELETE CASCADE; `usuario_id` FK ON DELETE CASCADE (indexado); `parent_id` FK `comentarios_leccion` ON DELETE CASCADE (indexado)?; `contenido` TEXT (máx. 2,000 caracteres por validación); `creado_en` TIMESTAMPTZ; `editado_en` TIMESTAMPTZ?; índice `(leccion_id, creado_en)` | Comentarios bajo cada lección, un solo nivel de respuestas: `parent_id` siempre apunta a un comentario raíz. |
| `likes_comentario` (`LikeComentario`) | **PK (comentario_id, usuario_id)**, ambos FK con cascade; `creado_en` TIMESTAMPTZ | Un like por usuario y comentario. |

## 3.5 Dominio 5 · Empresas y comercial

| Tabla (modelo) | Columnas, tipos y restricciones | Relaciones y rol funcional |
|---|---|---|
| `organizaciones` (`Organizacion`, `models/organizacion.py`) | `id`; `nombre` VARCHAR(255); `rfc` VARCHAR(20)?; `dominio_corporativo`?; `estado` ENUM (`activa`/`inactiva`); `email_contacto`?; `telefono_contacto` VARCHAR(20)?; `plan_de_cursos` TEXT?; `fecha_compra`?; `metadata`; `creado_en` | 1:N con `usuarios_organizacion`, `licencias_curso`, `solicitudes_curso` (todas con cascade). Empresa cliente. |
| `usuarios_organizacion` (`UsuarioOrganizacion`) | `id`; `organizacion_id` FK ON DELETE CASCADE; `usuario_id` FK; `rol_org` ENUM (`miembro`/`admin_org`); `creado_en`; **UNIQUE(organizacion_id, usuario_id)** | Pertenencia de usuarios a empresas. El supervisor de la empresa es `admin_org`; los alumnos son `miembro`. |
| `licencias_curso` (`LicenciaCurso`) | `id`; `organizacion_id` FK ON DELETE CASCADE; `curso_id` FK; `cupos_total` (0 = ilimitado); `cupos_usados`; `inicia_en`?; `termina_en`?; `estado` ENUM (`activa`/`agotada`/`expirada`); `metadata`; `creado_en` | Da acceso a un curso (o curso global, que cubre a todos sus cursos) a todos los miembros de la organización. |
| `solicitudes_curso` (`SolicitudCurso`) | `id`; `organizacion_id` FK ON DELETE CASCADE; `solicitante_id` FK `user`; `titulo_solicitud`; `descripcion`?; `estado` ENUM (`abierta`, `en_revision`, `aprobada`, `rechazada`, `cerrada`); `creado_en`; `actualizado_en` | Petición del supervisor para que se le habilite o cree un curso. 1:N con comentarios. |
| `comentarios_solicitud` (`ComentarioSolicitud`) | `id`; `solicitud_id` FK ON DELETE CASCADE; `autor_id` FK; `comentario`; `creado_en` | Conversación entre admin y supervisor sobre una solicitud. |
| `invitaciones_curso` (`InvitacionCurso`, `models/invitacion.py`) | `id`; `curso_id` FK ON DELETE CASCADE (indexado); `email` VARCHAR(255) (indexado); `token_hash` VARCHAR(64) **único**; `expira_en`; `usado_en`?; `creado_por` FK `user`; `creado_en` | Invitación de un solo uso a un curso. Solo se guarda el SHA-256 del token. El estado (`pendiente`/`usada`/`expirada`) se calcula a partir de `usado_en` y `expira_en`. |
| `pagos` (`Pago`, `models/pago.py`) | `id`; `usuario_id` FK (indexado); `curso_id` FK (indexado); `monto` NUMERIC(10,2); `moneda` VARCHAR(3) (default `MXN`); `referencia_paypal` VARCHAR(255)? (indexado, ID de la orden); `status` ENUM (`pendiente`, `completado`, `fallido`, `cortesia`); `created_at`; `updated_at` | Compra individual de un curso NEXTGEN, o "cortesía" (acceso regalado por el admin con monto 0). |

## 3.6 Integridad referencial y borrados

No todas las llaves foráneas tienen `ON DELETE CASCADE`. Por eso hay funciones de borrado que limpian a mano,
en orden hijo → padre:

| Función (`crud.py`) | Qué limpia antes de borrar |
|---|---|
| `delete_curso` | Progreso y certificado de cada inscripción, las inscripciones, los votos y las calificaciones; después borra el curso (módulos → lecciones → recursos por cascada ORM). |
| `delete_modulo` / `delete_leccion` | `_purgar_dependientes_leccion`: intentos de quiz (y sus respuestas) y progreso que apuntan a la lección. |
| `_delete_user_cascade` | Refresh tokens, notificaciones, analítica, eventos, votos, calificaciones, certificados, inscripciones, pagos, invitaciones creadas, comentarios y solicitudes, membresías e items. Pensado para cuentas de supervisor al borrar una organización. |
| `delete_organizacion` | Da de baja a cada miembro (revocando inscripciones que solo cubría la licencia de esa empresa), borra la organización (cascada a licencias, solicitudes y membresías) y borra las cuentas de supervisor que quedan sin empresa. |

## 3.7 Consultas útiles

```sql
-- Avance de un alumno en un curso (solo lecciones visibles)
SELECT count(*) FILTER (WHERE p.completado) AS completadas, count(l.id) AS total
FROM lecciones l
JOIN modulos m ON m.id = l.modulo_id
LEFT JOIN progreso_lecciones p ON p.leccion_id = l.id AND p.inscripcion_id = :inscripcion
WHERE m.curso_id = :curso AND l.es_visible;

-- Cursos dentro de un curso global, en orden
SELECT id, titulo, estado, orden_en_padre FROM cursos
WHERE curso_padre_id = :global ORDER BY orden_en_padre;

-- Licencias vigentes de una empresa
SELECT c.titulo, l.* FROM licencias_curso l JOIN cursos c ON c.id = l.curso_id
WHERE l.organizacion_id = :org AND l.estado = 'activa'
  AND (l.termina_en IS NULL OR l.termina_en > now());
```

`scripts/qa/qa_integridad.py` revisa la integridad de datos de forma automatizada (ver Capítulo 9).

Ver también: [migraciones.md](migraciones.md).
