# Capítulo 5 · Ciclos de vida, reglas de acceso y candados de negocio

NGCourse no tiene un motor de estados genérico: las reglas viven en los routers y en `crud.py`. Este capítulo
las reúne en un solo lugar. Si cambias una de estas reglas, búscala en **todos** los puntos que se indican:
varias se repiten a propósito en backend y frontend para que la interfaz no ofrezca acciones que la API va a
rechazar.

---

## 5.1 Ciclo de vida de un curso (`cursos.estado`)

```
            PATCH estado=revision                  PATCH estado=publicado
 borrador ───────────────────────▶ revision ───────────────────────────▶ publicado
    ▲   (instructor pide publicar)   │   (admin aprueba en /admin/solicitudes)   │
    │                                │ PATCH estado=rechazado                    │ PATCH estado=archivado
    └──────── el autor corrige ◀── rechazado (se conserva, no se borra)          ▼
                                                                             archivado
```

- Las transiciones se hacen con `PATCH /cursos/{id}` (campo `estado`). El backend no impone el orden de los
  estados; lo impone la interfaz (el instructor solo ve "Enviar a revisión"; el admin ve "Publicar" y
  "Rechazar"). `notas_revision` (en `metadata`) guarda el motivo de un rechazo.
- **Candado de publicación** (`routes/cursos.py::update_curso`): al pasar a `publicado` o `revision`
  responde `409` si
  - el curso es **global** y no tiene al menos un curso hijo publicado, o
  - hay lecciones **visibles** de tipo `video` sin `bunny_video_id` (se listan hasta 3 títulos).
- Solo los cursos `publicado` se pueden **licenciar** a una organización (`POST /organizaciones/{id}/licencias`),
  **invitar** (`/invitaciones/`, `/supervisor/invitaciones`) o **canjear** (`/invitaciones/canjear`).
- Alumnos y supervisores ven únicamente cursos `publicado`. El admin y el instructor dueño ven todos.

## 5.2 Ciclo de vida de una inscripción (`inscripciones.estado`)

```
 (sin fila) ──inscribirse / pagar / canjear──▶ activa ──completa todas las lecciones visibles──▶ finalizada
                                                ▲  │                                              │
                                    reactivar   │  │ baja (admin, instructor dueño,               │ se agregan
                         (inscribirse/canjear)  │  ▼  o salida de la empresa)                     │ lecciones nuevas
                                             cancelado                                  activa ◀──┘
```

- **Una fila por alumno y curso** (UNIQUE). Nunca se borra al dar de baja: pasa a `cancelado`, y cualquier
  vía de acceso posterior (inscribirse, canjear invitación, pago) la reactiva en lugar de crear otra.
- `finalizada` no es definitivo: `crud.check_and_emit_certificate` y la descarga del certificado vuelven a
  calcular si el curso sigue completo. Si el autor agregó lecciones nuevas, la inscripción regresa a `activa`
  y el certificado no se puede descargar hasta completarlas (`409`).
- `cancelado` quita el acceso al contenido de inmediato y la oculta de "Mis cursos".

## 5.3 Los cinco candados de acceso

### Candado 1 · Visibilidad en el catálogo (`crud.list_cursos_for_student`)

Un alumno (o supervisor) ve un curso **publicado** si se cumple al menos una:

1. `marca = nextgen` (visible para todos, gratis o de paga),
2. tiene una inscripción no cancelada en él,
3. alguna de sus organizaciones tiene una licencia `activa` del curso,
4. el curso está dentro de un curso global licenciado a alguna de sus organizaciones.

Después `routes/cursos.py::_agrupar_en_cursos_globales` muestra los cursos que pertenecen a un global
publicado (y accesible) como **una sola tarjeta del global**.

### Candado 2 · Auto-inscripción (`POST /inscripciones/`)

| Condición | Respuesta |
|---|---|
| Curso no publicado (y no es admin) | `404` |
| El usuario no es alumno (y no es admin) | `403` "Solo los alumnos pueden inscribirse" |
| Ya tiene inscripción `activa` o `finalizada` | `409` |
| No es público (NEXTGEN gratis), no lo cubre una licencia activa de sus organizaciones y no tiene pago completado o cortesía | `403` |
| Curso global | Inscribe en **todos** sus cursos publicados (`crud.inscribir_en_curso_global`) y devuelve la primera inscripción; `409` si el global aún no tiene cursos publicados. |
| Tenía una inscripción `cancelado` | La reactiva. |

El mismo criterio se calcula en `GET /cursos/{id}` como `puede_inscribirse`, `es_de_mi_org` y
`bloqueado_por_licencia` para que el frontend muestre "Inscribirme", "Comprar" o "Bloqueado".

### Candado 3 · Acceso al contenido (`routes/cursos.py::_tiene_acceso_contenido`)

| Quién | ¿Ve video, quiz y recursos? | ¿Ve respuestas del quiz? |
|---|---|---|
| Admin / superusuario | Sí | Sí |
| Instructor dueño del curso | Sí (incluso lecciones ocultas) | Sí |
| Supervisor con licencia activa del curso en su empresa (curso publicado) | Sí, en modo lectura, sin inscribirse ni generar progreso | Sí |
| Alumno con inscripción `activa` o `finalizada` | Sí | No (`_sanitize_quiz_for_student`) |
| Cualquier otro | Solo la **vista previa**: títulos, orden, duración, tipo y miniatura | — |

En la vista previa se borran `hls_url`, `bunny_video_id`, `contenido` y `recursos` de cada lección. Las
lecciones con `es_visible=false` solo las ven el admin y el instructor dueño. El mismo candado protege
`GET /cursos/{id}/modulos`, la lista de lecciones, el estado del video, los recursos, la descarga de
recursos y los comentarios.

### Candado 4 · Compra (`POST /pagos/crear-orden`)

| Condición | Respuesta |
|---|---|
| PayPal no configurado | `503` |
| Curso sin precio o con precio ≤ 0 | `400` "Este curso es gratuito" |
| Curso de marca RAM | `400` "no está a la venta; el acceso es por licencia" |
| Su empresa ya lo cubre con licencia | `409` "inscríbete sin pagar" |
| Ya tiene pago completado o cortesía | `409` |

### Candado 5 · Quiz (`POST /quiz/lecciones/{id}/enviar`)

- La lección debe ser `tipo=quiz` y tener preguntas; la inscripción debe ser del usuario.
- Si ya aprobó → `409 "Ya aprobaste este quiz."`.
- Si ya hizo **3 intentos** (`MAX_INTENTOS_QUIZ`) → `409`; un admin o el instructor dueño los reinicia con
  `POST /quiz/lecciones/{id}/reiniciar-intentos`.

## 5.4 Progreso y finalización

`POST /progreso/` lo llama el reproductor periódicamente y al terminar un video:

1. Valida que la inscripción sea del usuario y que la lección pertenezca al curso de esa inscripción y esté
   visible (antes se aceptaba progreso de otra lección e inflaba métricas).
2. `crud.upsert_progreso`: `visto_seg` y `progreso_pct` solo crecen (`max`). Si `progreso_pct ≥
   umbral_completado_pct` (90 por defecto), marca `completado=True` y `completado_en`. Si dos peticiones
   crean la fila a la vez, el UNIQUE `(inscripcion_id, leccion_id)` provoca `IntegrityError` y se actualiza
   la fila existente en lugar de responder 500.
3. Actualiza `inscripciones.ultimo_acceso_en`.
4. `crud.check_and_emit_certificate`.

`GET /progreso/curso/{curso_id}` devuelve total de lecciones visibles, completadas, porcentaje (1 decimal),
progreso por lección y si ya hay certificado.

El frontend avisa a otras pestañas con `BroadcastChannel('ng-progreso')` (`lib/progresoSync.ts`) para que la
ficha del curso, la del proceso y el aula actualicen sus palomitas sin recargar.

## 5.5 Quiz: calificación

`crud.crear_intento_quiz`:

1. Construye el mapa `pregunta_id → opcion_id correcta` desde `lecciones.contenido`.
2. Crea `quiz_intentos` (con `flush` para obtener el id) y una fila de `quiz_respuestas` por respuesta.
3. `aprobado = total > 0 and correctas / total ≥ 0.60`.
4. Si aprobó, el router registra progreso 100 % en la lección y revisa el certificado.

La respuesta (`QuizIntentoPublic`) dice qué preguntas acertó, sin revelar la opción correcta, e incluye
`intentos_max`. `GET /quiz/cursos/{id}/resultados` da al instructor o admin el **último** intento por alumno
y lección.

Validez de una pregunta (`_pregunta_quiz_valida`, igual que `frontend/src/lib/quizValidation.ts`): tiene
enunciado, una opción marcada como correcta y, si es de opción múltiple, al menos dos opciones con texto.
Las preguntas inválidas no se le muestran al alumno.

## 5.6 Certificados

Emisión (`crud.check_and_emit_certificate`), llamada tras cada progreso, cada quiz aprobado y al listar
`GET /certificados/me`:

1. Si el curso **no** está completo: si la inscripción estaba `finalizada`, vuelve a `activa`; no emite.
2. Si está completo: marca `finalizada` (idempotente).
3. Si ya hay certificado, lo regresa.
4. **Nombre válido** (`nombre_certificado_valido`): `full_name` no vacío y sin `@`. Si no, no emite; se
   reintenta cuando el alumno corrige su nombre y abre sus certificados.
5. Folio `NG-` + 12 caracteres hexadecimales en mayúsculas; `hash_verificacion = SHA-256(inscripcion_id + folio)`.
6. Si dos peticiones emiten a la vez, el UNIQUE en `inscripcion_id` rechaza la segunda y se devuelve el
   existente.
7. Genera el PDF con `services/certificado_pdf.py::generate_certificate_pdf` (carta horizontal, ReportLab):
   fondo, bordes, esquinas, logo, cuerpo con nombre, curso, fecha y folio, firmas y sello. Logos y firmas por
   marca (`static/logos/{nextgen,ram,firmas}`). Si el PDF falla no se pierde el certificado: la descarga lo
   regenera.

Endpoints: `GET /certificados/me`, `GET /certificados/descargar/{folio}` (dueño o admin; revalida que el
curso siga completo; regenera el PDF si falta), `GET /certificados/vista-previa/{folio}` (WebP de la primera
página con `pypdfium2`, en caché hasta que el PDF cambie), `GET /certificados/verificar/{folio}` y
`POST /certificados/regenerar/{folio}` (admin).

## 5.7 Cursos globales ("procesos")

| Regla | Dónde |
|---|---|
| Un curso global no tiene módulos (`POST /cursos/{id}/modulos` → `409`). | `routes/cursos.py::create_modulo` |
| `PUT /cursos/{id}/subcursos` deja exactamente la lista dada, en ese orden (`orden_en_padre` = 1..n). Rechaza duplicados, globales dentro de globales y cursos que ya están en otro global. Los que salen quedan sueltos; nadie pierde avance. | `crud.set_subcursos` |
| La licencia de un global cubre todos sus cursos; y si una empresa tiene licencia de **todos** los cursos publicados de un global publicado, también "ve" el global agrupado. | `crud.expandir_con_subcursos` |
| No se licencia un curso que ya cubre la licencia de su global; al licenciar un global se borran las licencias sueltas de sus cursos. | `routes/organizaciones.py::asignar_licencia`, `crud.quitar_licencias_de_subcursos` |
| Inscribirse o canjear una invitación de un global inscribe en todos sus cursos publicados. | `crud.inscribir_en_curso_global` |
| La ficha de un curso hijo trae `padre` con posición, anterior, siguiente y hermanos; la de un global trae `subcursos` con el avance del alumno en cada uno. | `routes/cursos.py::_llenar_relacion_global` |

## 5.8 Organizaciones, licencias y bajas

- **Licencia** (`assign_licencia`): se crea con `cupos_total=0` (ilimitado) y `estado=activa`. Si ya existía y
  no estaba activa, se reactiva. Una licencia es **vigente** si está activa, `inicia_en` ya pasó, `termina_en`
  no ha pasado y, si `cupos_total > 0`, `cupos_usados < cupos_total`.
- **Alumno multi-empresa**: el acceso por licencia es la unión de todas sus organizaciones
  (`cursos_con_licencia_activa_orgs`).
- **Baja de la empresa** (`remove_user_from_organizacion`): borra la membresía y cancela las inscripciones a
  cursos que **solo** cubría la licencia de esa empresa. Conserva las cubiertas por otra empresa del alumno o
  por un pago/cortesía.
- **Borrar organización** (`delete_organizacion`): da de baja a cada miembro con la regla anterior, borra la
  empresa (cascada a licencias, solicitudes y membresías) y borra las cuentas de supervisor que quedan sin
  empresa.
- **Un supervisor por empresa** salvo flag `multiples_supervisores`. Un supervisor pertenece a una sola
  empresa y siempre como `admin_org`.
- **Solicitudes de curso**: el supervisor crea una (`POST /supervisor/solicitudes`); el admin la cambia de
  estado con comentario (`PATCH /solicitudes/{id}`). Si la aprueba indicando un `curso_id` publicado, se
  asigna la licencia en la misma operación.

## 5.9 Invitaciones

1. Admin (`POST /invitaciones/` o `/cursos/{id}/invitaciones`) o supervisor (`POST /supervisor/invitaciones`,
   solo cursos licenciados a su empresa o NEXTGEN) envía correos. Cada correo se normaliza a minúsculas, se
   valida su formato (estado `invalido`) y se omite si el alumno ya tiene el curso `activa` o `finalizada`
   (estado `ya_inscrito`).
2. `crud.create_invitacion` genera un token de 32 bytes, guarda su SHA-256 y caduca a los **7 días**.
3. El alumno abre `/invitacion#token=…` y el frontend llama a `POST /invitaciones/canjear` (público, 10/min):
   valida que exista, no esté usada ni vencida y que el curso siga publicado; crea la cuenta si no existe
   (pendiente de activación, liga a la empresa del supervisor que invitó si es alumno), rechaza cuentas con
   otro rol (`403`), manda el correo de activación si hace falta, crea o reactiva la inscripción (o todas las
   del global) y marca `usado_en`.
4. Reenviar genera token y expiración nuevos; revocar borra la invitación. Ninguno aplica a invitaciones ya
   usadas (`409`). Los supervisores de una misma empresa comparten sus invitaciones.

## 5.10 Pagos

1. `POST /pagos/crear-orden`: pasa el Candado 4, crea `pagos` en `pendiente`, crea la orden en PayPal
   (`intent=CAPTURE`, `reference_id = pago.id`) y guarda `referencia_paypal`. Si PayPal falla, el pago queda
   `fallido` (`502`).
2. El frontend abre el botón de PayPal con ese `paypal_order_id`.
3. `POST /pagos/confirmar`: si el pago ya está `completado` responde lo mismo (idempotente). Verifica que el
   `paypal_order_id` sea el del pago, captura la orden, exige `status == COMPLETED` y que el **monto
   capturado sea igual** al registrado (`402` si no). Marca `completado` y crea la inscripción en la **misma
   transacción**.
4. `POST /pagos/admin/cortesia`: el admin regala el acceso; registra un pago `cortesia` de monto 0 y la
   inscripción en una sola transacción.
5. `GET /pagos/mis-compras`: historial con título del curso.

## 5.11 Reseñas y comentarios

- **Reseña** (`POST /calificaciones/cursos/{id}`): exige inscripción no cancelada **y** curso completado;
  una por alumno (`409`). Estrellas 1 a 5. Al crear o editar se recalcula `calificacion_prom` y
  `total_resenas`. Votos de utilidad -1/0/1, no sobre la reseña propia.
- **Comentarios de lección**: requieren acceso al contenido; las lecciones de quiz no tienen comentarios;
  máximo 2,000 caracteres; 10 por minuto por usuario; un nivel de respuestas (responder a una respuesta la
  cuelga del comentario raíz); solo el autor edita (marca `editado_en`); el autor, el admin o el instructor
  del curso borran (borrar un raíz borra sus respuestas); orden `recientes` o `populares` (por likes); like
  idempotente.

## 5.12 Métricas de avance (paneles)

`routes/admin_stats.py::resumen_avance` es la función común del panel del admin (`GET /admin/stats`) y del
supervisor (`GET /supervisor/dashboard`), así ambos cuadran:

- **Embudo**: inscritos, sin iniciar, en curso, terminaron, con certificado.
- **Actividad**: 12 semanas (lunes a domingo) de inscripciones nuevas y lecciones completadas.
- **% por inscripción**: lecciones completadas válidas (visibles y del curso) entre lecciones visibles.
- Solo cuentan **alumnos** (rol `estudiante`).
- El admin además ve cursos por estado, totales de usuarios, alumnos y organizaciones, los cursos con más
  alumnos y el avance por organización. El supervisor ve cursos de su empresa y alumnos ordenados por avance,
  más los alumnos sin inscripción.
