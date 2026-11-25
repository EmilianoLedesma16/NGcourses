# Modelo de datos

PostgreSQL 17 con SQLModel. Las tablas están en `backend/app/models/`; los enums en
`models/_enums.py`. Todas las llaves primarias son UUID salvo `feature_flags` (por nombre) y
`likes_comentario` (llave compuesta). Varias tablas tienen una columna JSONB `metadata_`
para datos sin esquema fijo.

## Diagrama general

```
organizaciones ─┬─< usuarios_organizacion >── user ──┬─< inscripciones ──┬─< progreso_lecciones >── lecciones
                ├─< licencias_curso >── cursos        │                    ├─< quiz_intentos ─< quiz_respuestas
                └─< solicitudes_curso ─< comentarios_solicitud              └── certificados (1:1)
                                                      ├─< pagos >── cursos
cursos ─┬─< modulos ─< lecciones ─< recursos_leccion  ├─< calificaciones ─< votos_resena
        ├── cursos (curso_padre_id: proceso → cursos) ├─< comentarios_leccion ─< likes_comentario
        ├─< curso_etiquetas >── etiquetas             ├─< refresh_tokens
        ├── categorias                                ├─< notificaciones
        └─< invitaciones_curso                        └─< eventos_sistema / eventos_analytics
```

## Usuarios y organizaciones

**`user`** (`models/user.py`)
- `email` único, `hashed_password` (bcrypt), `full_name`, `telefono`, `avatar_url`.
- `rol`: `estudiante` · `instructor` · `supervisor` · `administrador` · `usuario_control`
  (heredado, sin uso). `is_superuser` es independiente del rol.
- `estado`: `activo` · `suspendido` · `pendiente_activacion`, además de `is_active`.
- Tokens de un solo uso guardados en la fila: `password_reset_token(_expira)`,
  `token_activacion(_expira)`.

**`organizaciones`**: empresa cliente (`nombre`, `rfc`, `dominio_corporativo`, contacto,
`estado` activa/inactiva).

**`usuarios_organizacion`**: pertenencia de un usuario a una organización, con
`rol_org` = `miembro` o `admin_org`. Es la fuente de verdad de "a qué empresa pertenece" y
"quién la administra". Un alumno puede estar en varias organizaciones.

**`licencias_curso`**: la organización tiene acceso a un curso. `cupos_total` (0 = sin
límite), `cupos_usados`, vigencia `inicia_en`/`termina_en` y `estado`
(`activa`/`agotada`/`expirada`). Una licencia sobre un **proceso** cubre todos sus cursos.

**`solicitudes_curso`** y **`comentarios_solicitud`**: el supervisor pide un curso nuevo; el
admin cambia el estado (`abierta`, `en_revision`, `aprobada`, `rechazada`, `cerrada`).

## Contenido

**`cursos`**
- `tipo`: `individual` o `global`. Un curso `global` es un **proceso**: agrupa cursos
  individuales (`curso_padre_id`, ordenados por `orden_en_padre`) y no tiene módulos propios.
- `marca`: `nextgen` (catálogo abierto, gratis o de paga) o `ram` (solo por licencia o
  invitación).
- `estado`: `borrador` → `revision` → `publicado` (o `rechazado`, `archivado`).
- `es_gratis`, `precio`, `moneda`, `destacado`, `portada_url`, `calificacion_prom` y
  `total_resenas` (desnormalizados, se recalculan al reseñar), `bunny_collection_id`.

**`modulos`** (`orden`) → **`lecciones`**
- `tipo`: `video`, `lectura` o `quiz`.
- Video: `bunny_video_id`, `hls_url`, `thumbnail_url`, `duracion_seg` (los llena el webhook).
- Lectura: el texto va en `resumen`.
- Quiz: las preguntas van como JSON en `contenido` (ver
  [Funcionalidades › Cuestionarios](funcionalidades.md#cuestionarios)).
- `umbral_completado_pct` por lección y `es_visible` (las ocultas no cuentan para terminar
  el curso).

**`recursos_leccion`**: archivos o ligas por lección (`pdf`, `docx`, `xlsx`, `pptx`,
`archivo`, `link`). Los archivos se descargan por endpoint autenticado.

**`categorias`**, **`etiquetas`**, **`curso_etiquetas`**: catálogos. Las etiquetas existen
en la API pero la interfaz no las usa.

## Aula

**`inscripciones`**: único por (`usuario_id`, `curso_id`). `estado`: `activa`,
`finalizada` (se termina el curso) o `cancelado` (baja de la organización o cancelación).
Una inscripción cancelada se **reactiva** en lugar de crear otra.

**`progreso_lecciones`**: único por (`inscripcion_id`, `leccion_id`). `visto_seg`,
`progreso_pct` (solo crecen), `completado`, `completado_en`.

**`quiz_intentos`** / **`quiz_respuestas`**: un intento por envío con `correctas`,
`total_preguntas` y `aprobado`; las respuestas guardan `pregunta_id` y `opcion_id` del JSON
del quiz.

**`certificados`**: uno por inscripción (`inscripcion_id` único). `folio` público
(`NG-XXXXXXXX`), `hash_verificacion`, `url_pdf`, `emitido_en`.

**`calificaciones`**: una reseña por alumno y curso (1–5 estrellas, título, comentario,
`estado` pública/oculta/pendiente). **`votos_resena`**: votos de utilidad.

**`comentarios_leccion`**: comentarios por lección con `parent_id` para respuestas;
**`likes_comentario`**: llave compuesta (comentario, usuario).

## Pagos e invitaciones

**`pagos`**: `monto`, `moneda`, `referencia_paypal` (id de la orden), `status`
(`pendiente`, `completado`, `fallido`, `cortesia`).

**`invitaciones_curso`**: `email`, `token_hash` (SHA-256; el token en claro solo viaja en el
correo), `expira_en`, `usado_en`, `creado_por`.

## Sistema

| Tabla | Uso |
|---|---|
| `refresh_tokens` | Un registro por refresh token emitido: `token_hash`, `expira_en`, `revocado_en`, `reemplazado_por_token_hash` (rotación) |
| `feature_flags` | Interruptores por nombre: `instructores`, `multiples_supervisores` |
| `eventos_sistema`, `notificaciones`, `eventos_analytics` | Pensadas para auditoría, notificaciones y analítica de video. **Hoy ningún código escribe en ellas**; solo se limpian al borrar un usuario |
| `item` | Resto de la plantilla original, sin uso |

## Borrados

No hay `ON DELETE CASCADE` declarativo en todas las relaciones: los borrados de usuario,
organización, módulo y lección limpian sus dependientes a mano en `crud.py`
(`_delete_user_cascade`, `delete_organizacion`, `_purgar_dependientes_leccion`). Si agregas
una tabla que apunte a `user`, `lecciones` u `organizaciones`, agrégala también ahí o el
borrado fallará por llave foránea.
