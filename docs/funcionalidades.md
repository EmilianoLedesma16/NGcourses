# Funcionalidades a nivel técnico

Cómo funciona por dentro cada flujo de negocio: qué endpoints participan, qué reglas se
aplican y dónde está el código. Las rutas de backend son relativas a `/api/v1`.

- [Acceso a cursos](#acceso-a-cursos)
- [Procesos (cursos globales)](#procesos-cursos-globales)
- [Creación, revisión y publicación de cursos](#creación-revisión-y-publicación-de-cursos)
- [Video con Bunny Stream](#video-con-bunny-stream)
- [Progreso, finalización y certificados](#progreso-finalización-y-certificados)
- [Cuestionarios](#cuestionarios)
- [Lecturas y recursos](#lecturas-y-recursos)
- [Comentarios en lecciones](#comentarios-en-lecciones)
- [Reseñas](#reseñas)
- [Invitaciones y activación de cuentas](#invitaciones-y-activación-de-cuentas)
- [Organizaciones, supervisores y licencias](#organizaciones-supervisores-y-licencias)
- [Pagos con PayPal](#pagos-con-paypal)
- [Perfil y foto](#perfil-y-foto)
- [Feature flags](#feature-flags)

## Acceso a cursos

Hay tres formas de tener acceso a un curso:

| Vía | Para qué cursos | Cómo se crea la inscripción |
|---|---|---|
| Catálogo abierto | `marca = nextgen` y gratis | El alumno se inscribe con `POST /inscripciones/` |
| Licencia de su organización | Cualquier marca, si la organización tiene `licencias_curso` activa, vigente y con cupo | `POST /inscripciones/` |
| Compra o cortesía | `marca = nextgen` de paga | Al confirmar el pago (o la cortesía de un admin) |
| Invitación | El curso de la invitación (típicamente `ram`) | Al canjear la invitación |

**Qué ve el alumno** (`crud.list_cursos_for_student`): cursos `publicado` que sean `nextgen`,
o en los que esté inscrito (no cancelado), o cubiertos por una licencia activa de
**cualquiera** de sus organizaciones, incluidos los cursos hijos de un proceso licenciado.

**Candado de inscripción** (`inscripciones.py::inscribirse`): solo alumnos (el admin puede,
para pruebas); el curso debe estar publicado; si no es público, se exige licencia o pago.
Una inscripción `cancelado` se **reactiva** en lugar de crear otra (hay un único
`usuario_id + curso_id`).

**Baja de una organización** (`crud._revocar_inscripciones_tras_baja_org`): al sacar a un
alumno de su organización se cancelan las inscripciones que dependían de esa licencia.

**Acceso al contenido** (reproductor, comentarios, recursos): admin, instructor dueño,
supervisor con licencia de su organización, y alumno con inscripción activa o finalizada.

## Procesos (cursos globales)

Un curso con `tipo = global` es un **proceso**: agrupa cursos individuales en orden
(`curso_padre_id`, `orden_en_padre`), por ejemplo "Limpieza" → "Plásticos", "Tarjeta".

- Se arma con `PUT /cursos/{id}/subcursos` (`crud.set_subcursos`).
- No tiene inscripción propia: inscribirse o canjear una invitación a un proceso inscribe en
  **todos** sus cursos publicados.
- `crud.expandir_con_subcursos` aplica el acceso en los dos sentidos: una licencia del
  proceso cubre a sus cursos, y tener acceso a todos los cursos de un proceso da acceso a
  verlo agrupado.
- En el frontend, `/curso/[id]` de un proceso muestra `GlobalCourseContent` con pestañas por
  curso, avance del proceso y "Continúa con…". Al terminar el último video de un curso, el
  aula ofrece pasar al **siguiente curso del proceso**.

## Creación, revisión y publicación de cursos

1. El instructor (o admin) crea el curso en `borrador`, con módulos, lecciones y recursos.
2. Lo manda a `revision`.
3. El admin lo revisa en `/admin/solicitudes`: lo **publica**, lo regresa a `borrador` con
   una nota (`notas_revision`) o lo **rechaza**.
4. Solo los cursos `publicado` aparecen a los alumnos y aceptan inscripciones o invitaciones.

El rol instructor se puede apagar con el feature flag `instructores` (ver abajo).

## Video con Bunny Stream

**Subida** (editor de cursos → `VideoUploadButton.tsx`):
1. `POST /cursos/{c}/modulos/{m}/lecciones/{l}/video-init`: el backend borra el video
   anterior si existía, crea el video en Bunny (`bunny.create_video`) y responde con la URL
   TUS y las cabeceras firmadas (`AuthorizationSignature` = SHA-256 de
   `libraryId + apiKey + expiración + videoId`).
2. El navegador sube el archivo **directo a Bunny** con `tus-js-client` (reanudable, con
   progreso). El backend nunca recibe el archivo.
3. Bunny procesa el video y llama a `POST /webhooks/bunny`. El backend valida la firma HMAC
   con `BUNNY_WEBHOOK_SECRET` (sin secreto responde 503; firma mala, 401), busca la lección
   por `bunny_video_id` y:
   - estados 3/4 (terminado): guarda `hls_url`, `thumbnail_url` y `duracion_seg`;
   - estados 5/6 (falló): limpia el video para poder reintentar.
4. `GET …/video-status` permite consultar el estado mientras tanto.

**Reproducción** (`VideoPlayer.tsx`): iframe `iframe.mediadelivery.net/embed/{library}/{video}`.
El frontend se suscribe a `timeupdate` y `ended` del reproductor por `postMessage`
(protocolo player.js), después del aviso `ready`. Con eso registra el avance y dispara el
avance automático.

**Miniaturas**: `https://{BUNNY_CDN_HOSTNAME}/{video}/thumbnail.jpg`. La zona de Bunny
restringe por dominio de origen (Referer): si un dominio no está en la lista de permitidos
(por ejemplo `localhost`), Bunny responde 403 y el temario muestra el ícono de la lección
en lugar de la imagen.

## Progreso, finalización y certificados

**Registro de avance** (`POST /progreso/` → `crud.upsert_progreso`):
- El aula manda el avance periódicamente mientras se reproduce y al terminar.
- `visto_seg` y `progreso_pct` solo crecen (se guarda el máximo).
- Al llegar a `UMBRAL_COMPLETADO_PCT` (90 %) la lección queda `completado`.
- Lecturas: se completan con "Marcar como completada". Cuestionarios: al aprobar.
- Dos peticiones simultáneas de la misma lección no fallan: se reintenta como actualización.

**Finalización** (`crud.curso_completado`): el curso está completo cuando **todas las
lecciones visibles actuales** están completadas. Se recalcula siempre contra el contenido
vigente: si se agregan lecciones después, el curso deja de estar completo y la inscripción
regresa de `finalizada` a `activa`.

**Certificado** (`crud.check_and_emit_certificate`, se llama al registrar avance y al
consultar `GET /certificados/me`):
1. Si el curso está completo, marca la inscripción `finalizada`.
2. Exige un nombre real en el perfil (no vacío y sin `@`); si no, no emite y lo reintenta
   la próxima vez que el alumno consulte sus certificados.
3. Crea el certificado con folio `NG-…` aleatorio y `hash_verificacion`. El `unique` por
   inscripción evita duplicados en carreras.
4. Genera el PDF con ReportLab (`services/certificado_pdf.py`) con la marca del curso. Si el
   PDF falla, el registro se conserva y se puede regenerar con
   `POST /certificados/regenerar/{folio}`.

Descarga y vista previa requieren sesión del dueño o staff; `GET /certificados/verificar/{folio}`
es público para validar un certificado.

**Sincronización entre pestañas** (`lib/progresoSync.ts`): al completar una lección el aula
publica en un `BroadcastChannel`; la ficha del curso, la del proceso y otras pestañas
actualizan sus palomitas sin recargar, y vuelven a pedir el avance al recuperar el foco.

## Cuestionarios

- Las preguntas viven como JSON en `lecciones.contenido`:
  `{ preguntas: [{ id, enunciado, tipo, orden, opciones: [{ id, texto, esCorrecta }] }] }`.
  El editor es `QuizBuilder.tsx` y valida cada pregunta con `lib/quizValidation.ts`.
- Al alumno se le entrega el quiz **sin** `esCorrecta` y sin preguntas incompletas
  (`cursos.py::_sanitize_quiz_for_student`). La calificación la hace solo el backend.
- `POST /quiz/lecciones/{l}/enviar` (`crud.crear_intento_quiz`): guarda el intento y sus
  respuestas; aprueba con **≥ 60 %** de aciertos (`UMBRAL_APROBACION_QUIZ`). Al aprobar, la
  lección queda completada.
- **Máximo 3 intentos** (`MAX_INTENTOS_QUIZ`). Con el quiz aprobado o los intentos agotados,
  un nuevo envío responde 409.
- `POST /quiz/lecciones/{l}/reiniciar-intentos` (admin o instructor dueño): borra los
  intentos **y el progreso** de esa lección, y si el curso estaba finalizado lo regresa a
  `activa`. Se hace desde la pestaña Quiz de `/admin/alumnos`.
- `GET /quiz/cursos/{c}/resultados`: resultados por alumno para el panel.

## Lecturas y recursos

- Lección `lectura`: el texto está en `lecciones.resumen` y se muestra justificado en el aula.
- Recursos por lección (`recursos_leccion`): ligas o archivos (`pdf`, `docx`, `xlsx`,
  `pptx`, …). Los archivos se suben con `POST …/recursos/upload` y se descargan por
  `GET /cursos/recursos/{id}/download`, que valida acceso: **no** hay URL pública directa.

## Comentarios en lecciones

`comentarios.py` + `LessonComments.tsx`, estilo YouTube:
- Lee y comenta quien tiene acceso al contenido del curso. Los quizzes no tienen comentarios.
- Un nivel de respuestas (responder a una respuesta cuelga del comentario raíz).
- Likes (`PUT|DELETE /comentarios/{id}/like`), orden por recientes o populares, paginación
  de hasta 50.
- El autor edita el suyo; el autor, el admin o el instructor del curso pueden borrar
  (borrar un comentario raíz borra sus respuestas).
- Máximo 2 000 caracteres y 10 comentarios por minuto por usuario (429).

## Reseñas

`calificaciones.py` + `CourseReviews.tsx`: una reseña por alumno y curso, de 1 a 5
estrellas, solo si **terminó** el curso. Crear o editar recalcula `calificacion_prom` y
`total_resenas` del curso. Hay votos de utilidad en la API (`/calificaciones/{id}/votar`)
que la interfaz no usa.

## Invitaciones y activación de cuentas

**Invitar** (admin por curso, o supervisor para su organización): se crea
`invitaciones_curso` con el **hash** del token y se manda el token en claro por correo
(`/invitacion?token=…`).

**Canjear** (`POST /invitaciones/canjear`, público, 10/min):
1. Busca por hash; valida que no esté usada (409) ni vencida (410) y que el curso siga
   publicado.
2. `crud.get_or_create_user_by_email`: si el correo no tiene cuenta, la crea `ESTUDIANTE` en
   `pendiente_activacion` y manda el correo de activación. **Nunca** se genera ni se envía
   una contraseña.
3. Rechaza si la cuenta existente tiene otro rol (las invitaciones son solo para alumnos).
4. Inscribe (o reactiva una inscripción cancelada); en un proceso, en todos sus cursos.

**Activar** (`/activar` → `POST /users/activar`): el usuario define su contraseña con el
token de activación. `POST /users/solicitar-reactivacion` reenvía el enlace (5/h) y el admin
puede reenviarlo desde `/admin/usuarios`.

## Organizaciones, supervisores y licencias

- El admin crea organizaciones, agrega miembros y asigna un supervisor (`admin_org`). Por
  defecto hay un supervisor por organización; el flag `multiples_supervisores` permite más.
- El admin asigna licencias por curso o por proceso (`/organizaciones/{id}/licencias`) con
  cupos y vigencia. Al asignar la licencia de un proceso se borran las licencias sueltas de
  sus cursos (`crud.quitar_licencias_de_subcursos`), porque la del proceso ya los cubre.
- El supervisor (`/supervisor/*`) solo ve **su** organización: sus usuarios, invitaciones,
  cursos licenciados, estadísticas y avance de su gente. Puede invitar y dar de baja a
  empleados y mandar **solicitudes de curso** al admin.

## Pagos con PayPal

1. `POST /pagos/crear-orden`: solo cursos `nextgen` de paga. Rechaza si el curso ya está
   cubierto por la empresa del alumno o si ya tiene un pago completado. Crea `pagos` en
   `pendiente` y la orden en PayPal.
2. El alumno aprueba en el botón de PayPal (`PayPalCheckout.tsx`).
3. `POST /pagos/confirmar`: captura la orden, verifica que el `order_id` sea el del pago, que
   PayPal la marque completada y que **el monto coincida**. Marca el pago `completado` y crea
   la inscripción en la misma transacción. Es idempotente.
4. `POST /pagos/admin/cortesia` da acceso sin cobro (`status = cortesia`); hoy solo por API.

## Perfil y foto

- `PATCH /users/me` (nombre, correo, teléfono), `PATCH /users/me/password`.
- Foto: `POST /users/me/avatar` valida tipo y contenido real de la imagen (firma de bytes) y
  la guarda con nombre aleatorio en `media/avatars/`, servida como estático. Sin foto, el
  frontend muestra un `AnimalAvatar` determinista por usuario.

## Feature flags

Tabla `feature_flags`, editable desde `/admin/configuracion` (`PATCH /feature-flags/{nombre}`):

| Flag | Apagado significa |
|---|---|
| `instructores` | Las cuentas instructor no pueden iniciar sesión ni crearse; el admin y los superusuarios no se ven afectados |
| `multiples_supervisores` | Una organización solo admite un supervisor |

El frontend los lee con `useFeatureFlags()` para ocultar las opciones correspondientes.
