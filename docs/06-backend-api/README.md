# 6. API del backend (routers y servicios)

Este capítulo explica **cómo está organizada la API REST** de NGCourse, cómo se protege cada grupo de
rutas y qué hace cada módulo de `backend/app/api/routes/` y `backend/app/services/`. La lista completa de
los 137 endpoints, uno por uno, está en [`endpoints.md`](endpoints.md).

> Las reglas de negocio que los endpoints aplican (candados de inscripción, cálculo de avance, quiz,
> certificados, licencias) están explicadas en el capítulo [5](../05-reglas-de-negocio/README.md). Aquí se
> describe **dónde vive** cada regla y cómo se encadenan las piezas.

## 6.1 Montaje de la API

```
backend/app/main.py
 └─ app.include_router(api_router, prefix=settings.API_V1_STR)   # "/api/v1"
     └─ backend/app/api/main.py
         ├─ login, admin_stats, users, utils, items, categorias, etiquetas,
         │  cursos, inscripciones, invitaciones, progreso, quiz, calificaciones,
         │  comentarios, certificados, organizaciones, pagos, supervisor,
         │  solicitudes, webhooks, feature_flags            (21 routers siempre)
         └─ private                                         (solo ENVIRONMENT == "local")
```

- Todas las rutas cuelgan de **`/api/v1`**. Ejemplo: `GET /api/v1/cursos/`.
- La documentación interactiva de FastAPI (`/docs`, `/redoc`, `/api/v1/openapi.json`) solo se publica
  cuando `ENVIRONMENT` no es `production` (ver capítulo 2, `main.py`).
- El orden de `include_router` importa solo cuando dos routers comparten prefijo: `etiquetas.py` registra
  `POST /cursos/{curso_id}/etiquetas` sin prefijo propio y `comentarios.py` registra
  `/lecciones/{id}/comentarios` y `/comentarios/{id}`; ninguna colisiona con `cursos.py`.
- Para agregar un router nuevo: crear `app/api/routes/<nombre>.py` con
  `router = APIRouter(prefix="/<nombre>", tags=["<nombre>"])`, importarlo en `app/api/main.py` y llamar
  `api_router.include_router(<nombre>.router)`.

## 6.2 Cómo se protege una ruta

Las dependencias viven en `backend/app/api/deps.py` (detalle en el capítulo 2):

| Dependencia | Qué exige | Error si no cumple |
|---|---|---|
| *(ninguna)* | Ruta pública | — |
| `SessionDep` | Abre una `Session` de SQLModel por petición (`get_db`) | — |
| `CurrentUser` | Cookie `access_token` válida (JWT HS256), usuario existente y `is_active` | 401 / 403 / 404 |
| `get_current_active_superuser` | `is_superuser = true` | 403 |
| `InstructorOrAbove` | Rol instructor o administrador, o superusuario | 403 |
| `AdminOrSuperuser` (`require_admin_or_superuser`) | Rol administrador o superusuario | 403 |
| `SupervisorOrAbove` | Rol supervisor o administrador, o superusuario | 403 |

Hay **dos estilos** en el código y conviene reconocerlos:

1. **Guardia declarativa**: la dependencia va en la firma (`current_user: AdminOrSuperuser`) o en
   `dependencies=[Depends(require_admin_or_superuser)]` del decorador. FastAPI rechaza antes de entrar.
2. **Guardia en el cuerpo**: el endpoint recibe `CurrentUser` y llama a un helper que lanza
   `HTTPException`. Es lo que hace `cursos.py`, porque la decisión depende del curso concreto:

| Helper (`cursos.py`) | Regla |
|---|---|
| `_require_instructor_or_admin` | Rol instructor/administrador o superusuario (crear curso). |
| `_require_curso_owner_or_admin(user, instructor_id)` | Admin/superusuario o el instructor dueño (editar, borrar, portada, módulos, lecciones, video, recursos). |
| `_tiene_acceso_contenido(session, user, curso)` | Admin, dueño, supervisor con licencia ACTIVA de su org sobre un curso PUBLICADO, o alumno con inscripción ACTIVA/FINALIZADA. |
| `_supervisor_tiene_acceso_lectura` | El supervisor lee el contenido completo (con respuestas del quiz) sin inscribirse ni generar progreso. |
| `_puede_ver_quiz_con_respuestas` | Admin, dueño o supervisor lector reciben `esCorrecta`; el alumno no. |
| `_strip_leccion_sin_acceso` | Sin acceso borra `hls_url`, `bunny_video_id`, `thumbnail_url`, `contenido` y `recursos` (se ve la estructura como vista previa). |
| `_sanitize_quiz_for_student` | Quita preguntas incompletas y el campo `esCorrecta` antes de mandar el quiz al alumno. |

Otros routers tienen helpers equivalentes: `quiz._require_instructor_or_admin`,
`comentarios._leccion_con_acceso` / `_es_staff_del_curso`, `supervisor._get_user_org` /
`_invitacion_de_mi_org`, `pagos._validar_curso_pagable`, `cursos._require_curso_instructor_access`.

### Límites de peticiones (slowapi)

Decorador `@limiter.limit(...)`; la llave es la IP real (`get_client_ip`, capítulo 2). Las rutas con límite
**deben** recibir `request: Request` como parámetro.

| Endpoint | Límite |
|---|---|
| `POST /login/access-token` | 5/minuto |
| `POST /login/refresh-token` | 20/minuto |
| `POST /password-recovery` y `/password-recovery/{email}` | 3/hora |
| `POST /reset-password/` | 5/minuto |
| `POST /users/activar` | 10/minuto |
| `POST /users/solicitar-reactivacion` | 5/hora |
| `POST /invitaciones/canjear` | 10/minuto |
| Comentarios | 10 por minuto por usuario (`MAX_COMENTARIOS_POR_MINUTO`, se cuenta en BD dentro de `crud`) |

### Convenciones de respuesta

- Listados paginados devuelven `{ "data": [...], "count": N }` (`CursosPublic`, `UsersPublic`, etc.) con
  `skip` y `limit` como query params.
- Mensajes simples devuelven `Message` (`{"message": "..."}`), definido en `app/models/schemas.py`.
- Errores: siempre `HTTPException(status_code, detail="texto en español")`. Los códigos más usados:
  400 (dato inválido), 401 (sin sesión), 403 (sin permiso), 404 (no existe **o** no lo puedes ver), 409
  (conflicto de estado: duplicado, curso no publicable, ya inscrito), 429 (rate limit), 502 (PayPal o
  Bunny fallaron), 503 (integración no configurada).
- Los cursos no publicados se responden con **404** a quien no es admin ni dueño, para no revelar que
  existen.

## 6.3 Mapa de routers

| Router (archivo) | Prefijo | Líneas | Endpoints | Para qué sirve |
|---|---|---|---|---|
| `login.py` | *(sin prefijo)* | 328 | 8 | Login con cookies, refresh rotativo, logout, sesión, recuperación y reseteo de contraseña. |
| `users.py` | `/users` | 504 | 14 | Alta de usuarios por admin, perfil propio, avatar, activación de cuenta, reenvío de activación. |
| `utils.py` | `/utils` | 31 | 2 | `health-check` (usado por Docker y por el deploy) y correo de prueba. |
| `items.py` | `/items` | 109 | 5 | CRUD heredado de la plantilla FastAPI; no lo usa el frontend. |
| `categorias.py` | `/categorias` | 66 | 5 | Catálogo de categorías (lectura para todos, escritura admin). |
| `etiquetas.py` | `/etiquetas`, `/cursos/{id}/etiquetas` | 116 | 6 | Etiquetas y su asignación a cursos. |
| `cursos.py` | `/cursos` | 1595 | 28 | Núcleo del catálogo: cursos, cursos globales, portada, módulos, lecciones, video Bunny, recursos, invitaciones por curso. |
| `inscripciones.py` | `/inscripciones` | 280 | 6 | Inscribirse (con los 5 candados), listar, ver detalle, dar de baja. |
| `invitaciones.py` | `/invitaciones` | 383 | 5 | Invitaciones por correo (admin) y canje público del token. |
| `progreso.py` | `/progreso` | 146 | 2 | Registrar avance de lección y consultar avance del curso. Dispara la emisión de certificado. |
| `quiz.py` | `/quiz` | 269 | 4 | Enviar quiz (calificación en servidor), último intento, reiniciar intentos, resultados del curso. |
| `calificaciones.py` | `/calificaciones` | 171 | 4 | Reseñas (estrellas + texto) y votos de utilidad. |
| `comentarios.py` | *(sin prefijo)* | 355 | 6 | Comentarios por lección con respuestas y likes. |
| `certificados.py` | `/certificados` | 243 | 5 | Mis certificados, descarga PDF, miniatura WebP, verificación por folio, regenerar. |
| `organizaciones.py` | `/organizaciones` | 439 | 14 | Empresas: alta con supervisor, miembros, licencias de curso. |
| `supervisor.py` | `/supervisor` | 533 | 12 | Panel del supervisor de empresa: su organización, cursos, usuarios, invitaciones, estadísticas, solicitudes. |
| `solicitudes.py` | `/solicitudes` | 146 | 2 | El admin atiende solicitudes de curso de las empresas. |
| `pagos.py` | `/pagos` | 322 | 4 | Checkout PayPal, historial de compras, acceso de cortesía. |
| `webhooks.py` | `/webhooks` | 114 | 1 | Webhook de Bunny.net (video codificado). |
| `feature_flags.py` | `/feature-flags` | 43 | 2 | Leer y prender/apagar banderas (`instructores`). |
| `admin_stats.py` | `/admin` | 204 | 1 | Estadísticas del panel de administración. |
| `private.py` | `/private` | 45 | 1 | Crear usuario sin restricciones. **Solo en local.** |

## 6.4 Detalle por router

### `login.py` (autenticación)

- `POST /login/access-token` recibe un formulario OAuth2 (`username` = correo, `password`) y el query
  param `remember`. Llama a `crud.authenticate`, valida que la cuenta esté activa y no pendiente, emite el
  **access token** (15 min) y crea un **refresh token** opaco (30 días, guardado hasheado en
  `refresh_tokens`). Ambos viajan como cookies HttpOnly; nunca en el cuerpo.
- `POST /login/refresh-token` lee la cookie del refresh, lo **rota** (revoca el viejo y emite uno nuevo)
  y genera un nuevo access. La cookie `session_persist` recuerda si el usuario marcó "recordarme" para
  decidir si las cookies son de sesión o persistentes.
- `POST /logout` revoca el refresh token en BD y borra ambas cookies.
- `GET /auth/session` devuelve `{rol, is_superuser}`; lo usa el **middleware del frontend** (`proxy.ts`)
  para decidir a qué panel puede entrar el usuario.
- Recuperación: `POST /password-recovery` (correo en JSON) genera `secrets.token_urlsafe(32)`, guarda su
  hash con vigencia de 48 h y envía el correo; siempre responde el mismo mensaje exista o no la cuenta.
  `POST /reset-password/` valida el token (uso único) y cambia la contraseña. La versión
  `/password-recovery/{email}` está **deprecada** (el correo viajaba en la URL).

### `users.py`

- `GET /users/` (admin) admite filtros `rol`, `estado`, `search`.
- `POST /users/` (admin) da de alta a un usuario **pendiente de activación** con `UserAltaAdmin`: no se
  captura contraseña; se genera un token de activación (72 h) y se envía el correo. El alta también puede
  asignar organización.
- `POST /users/activar` (público) recibe token + contraseña, activa la cuenta. `POST
  /users/solicitar-reactivacion` reenvía el enlace si expiró. `POST /users/{id}/reenviar-activacion` lo
  hace el admin.
- `/users/me*`: perfil propio; cambio de contraseña (exige la actual y que la nueva sea distinta);
  avatar (JPEG/PNG/WEBP/GIF ≤ 2 MB, se guarda en `media/avatars/<uuid>.<ext>` y borra la foto anterior);
  borrar la propia cuenta.
- `GET /users/me` regresa también la organización del usuario (`UserMePublic`).

### `cursos.py` (el router más grande)

Bloques internos, en orden dentro del archivo:

1. **Helpers de permisos y quiz** (líneas 47-150).
2. **Cursos** (`/destacados`, `/`, `/{id}`, `POST`, `PATCH`, `PUT /{id}/subcursos`, `DELETE`).
   - `GET /cursos/destacados` es **público**: alimenta el carrusel de la pantalla de login.
   - `GET /cursos/` cambia según el rol: el admin ve todo; el instructor solo sus cursos; alumno y
     supervisor ven el **catálogo** (`crud.list_cursos_for_student`: NEXTGEN publicados + cursos con
     licencia activa de sus organizaciones) y cada curso trae `bloqueado_por_licencia`, `es_de_mi_org`,
     `nivel`. Después `_agrupar_en_cursos_globales` reemplaza los subcursos por su curso global y
     `_llenar_lecciones_individuales` agrega conteos.
   - `GET /cursos/{id}` arma curso + módulos + lecciones, aplica `_strip_leccion_sin_acceso` y, si el
     curso pertenece a un curso global, `_llenar_relacion_global` agrega posición, anterior/siguiente y
     hermanos.
   - `POST /cursos/` crea el curso con `instructor_id = usuario actual` y, si Bunny está configurado, crea
     una **colección** en Bunny con el título del curso (si falla, solo se registra un warning).
   - `PATCH /cursos/{id}` bloquea con **409** pasar a `publicado` o `revision` si hay lecciones de video
     visibles sin video, o si es un curso global sin al menos un subcurso publicado.
   - `PUT /cursos/{id}/subcursos` define hijos y orden de un curso global (`crud.set_subcursos`).
3. **Portada** (`POST /{id}/cover`): JPEG/PNG/WEBP/GIF ≤ 5 MB, validación por *magic bytes*, se guarda
   como `media/covers/{curso_id}.{ext}` y se expone en `/media/covers/...`.
4. **Módulos y lecciones**: CRUD anidado `/cursos/{id}/modulos/{mid}/lecciones/{lid}`. Las lecturas usan
   `_get_leccion_with_read_access`; las escrituras exigen dueño/admin.
5. **Video** (`video-init`, `video-status`, `DELETE video`): ver 6.5.
6. **Recursos**: enlace (`POST .../recursos`) o archivo (`POST .../recursos/upload`, PDF/DOCX/XLSX/PPTX
   ≤ 20 MB, validado por *magic bytes* en `_check_magic_recurso`), descarga con control de acceso
   (`GET /cursos/recursos/{id}/download`, sirve el archivo con `FileResponse`).
7. **Invitaciones por curso** (`/cursos/{id}/invitaciones...`): mismo flujo que `invitaciones.py`, pero
   acotado a un curso y con `_require_curso_instructor_access`.

### `inscripciones.py`

`POST /inscripciones/` concentra los **5 candados** (curso publicado, no es curso global, marca/licencia,
gratis o pagado, no duplicado) descritos en el capítulo 5. Si ya existía una inscripción cancelada, la
reactiva en lugar de crear otra. `PATCH /{id}/cancelar` pone `estado = cancelado` (baja); el alumno deja
de ver el contenido pero su avance se conserva.

### `progreso.py`

`POST /progreso/` recibe `{inscripcion_id, leccion_id, visto_seg, progreso_pct}`. Valida que la
inscripción sea del usuario y que la lección sea **visible y del mismo curso** (si no, 404), hace
*upsert* en `progreso_lecciones` (`crud.upsert_progreso`, la lección se marca completada al llegar a su
`umbral_completado_pct`, 90 % por defecto), actualiza el último acceso y llama a
`crud.check_and_emit_certificate`: si todas las lecciones visibles están completas, la inscripción pasa a
**finalizada** y se emite el **certificado** (solo si el perfil tiene un nombre real,
`nombre_certificado_valido`). `GET /progreso/curso/{id}` devuelve el avance por lección y el porcentaje total.

### `quiz.py`

`POST /quiz/lecciones/{id}/enviar` califica en el servidor (`crud.crear_intento_quiz`): aprobado si
acierta al menos el 60 %, máximo 3 intentos; un quiz aprobado cuenta como lección completada.
`POST .../reiniciar-intentos` (admin o instructor dueño) borra los intentos de un alumno.
`GET /quiz/cursos/{id}/resultados` lista todos los intentos para el panel del instructor.

### `calificaciones.py` y `comentarios.py`

Reseñas: una por alumno y curso, estrellas de 1 a 5; requiere inscripción no cancelada **y curso completado** (`crud.curso_completado`); se crean `publica`. Votos de utilidad 1/-1/0 en
`votos_resena`. Comentarios: hilos de un nivel (comentario raíz + respuestas), máximo 2000 caracteres,
texto limpiado por `_limpiar_contenido`, orden `recientes` o `populares`, likes idempotentes
(`PUT`/`DELETE /comentarios/{id}/like`). Borrar: el autor el suyo; admin o instructor del curso cualquiera.

### `certificados.py`

`_generar_pdf_certificado` centraliza la generación (la usa el alta automática, `regenerar` y la
descarga, que **auto-recupera** el PDF si el archivo no existe en disco). El PDF se escribe en
`media/certificados/{FOLIO}.pdf`. `vista-previa/{folio}` rasteriza la primera página con **pypdfium2** y
devuelve WebP. `verificar/{folio}` confirma que un folio existe y a quién pertenece.

### `organizaciones.py`, `supervisor.py`, `solicitudes.py`

- Admin: `POST /organizaciones/` crea la empresa **y su supervisor** (usuario `supervisor`, rol de org
  `ADMIN_ORG`, pendiente de activación). Miembros (`/miembros`) y licencias de curso (`/licencias`, con
  fechas, cupos y estado). `supervisores-sin-organizacion` y `sin-supervisor` sirven para reparar datos
  heredados.
- Supervisor: todo se resuelve contra **su** organización (`_get_user_org`, 404 si no tiene). Puede ver
  cursos licenciados, usuarios y su avance, invitar a cursos de su org, quitar usuarios (los da de baja de
  la org), ver estadísticas (`stats`, `dashboard` usa `admin_stats.resumen_avance`) y pedir cursos nuevos
  (`POST /supervisor/solicitudes`).
- Admin atiende esas solicitudes en `PATCH /solicitudes/{id}` (aprobar, rechazar, en revisión, con
  comentario que queda en `comentarios_solicitud`).

### `pagos.py`

1. `POST /pagos/crear-orden` valida el curso (`_validar_curso_pagable`: publicado, con precio, no gratis),
   que el usuario no tenga ya licencia ni pago completado, crea `Pago(pendiente)` y una orden en PayPal con
   `reference_id = pago.id`. Si PayPal falla, el pago queda `fallido` y responde 502.
2. El frontend muestra los botones de PayPal (`PayPalCheckout.tsx`) con el `order_id`.
3. `POST /pagos/confirmar` captura la orden; si PayPal responde `COMPLETED`, marca el pago `completado` y
   crea (o reactiva) la inscripción.
4. `POST /pagos/admin/cortesia` registra `Pago(cortesia, monto 0)` e inscribe sin cobrar.

### `webhooks.py`

`POST /webhooks/bunny` es **fail-closed**: si no hay `BUNNY_WEBHOOK_SECRET` responde 503; si la firma
HMAC-SHA256 del encabezado `BunnycdnVideoId-Signature` no coincide, 401. Busca la lección por
`bunny_video_id`, valida que `VideoLibraryId` coincida con la biblioteca del curso, y según `Status`:
3/4 → guarda `hls_url`, `thumbnail_url` y `duracion_seg`; 5/6 → limpia los campos para permitir
reintento.

### `admin_stats.py`

`GET /admin/stats` devuelve cursos por estado, totales (usuarios, alumnos, organizaciones), embudo
(inscritos, sin iniciar, en curso, terminaron, certificados), actividad de las últimas 12 semanas, top de
cursos y resumen por organización. La función pública `resumen_avance` es reutilizada por
`supervisor.dashboard` para que ambos paneles calculen igual.

### `feature_flags.py`, `utils.py`, `items.py`, `private.py`

- `GET /feature-flags` (cualquier usuario autenticado) y `PATCH /feature-flags/{nombre}` (admin). Hoy la
  única bandera es `instructores`.
- `GET /utils/health-check/` responde `true`; es lo que consulta el `healthcheck` de Docker.
- `items.py` y `private.py` vienen de la plantilla *full-stack-fastapi-template*; `private` solo se monta
  en local.

## 6.5 Servicios externos (`backend/app/services/`)

### `bunny.py` (video)

| Función | Qué hace |
|---|---|
| `create_collection(name)` | Crea una colección en la biblioteca de Bunny Stream (una por curso). |
| `create_video(title, collection_id)` | Crea el objeto de video vacío y devuelve su `guid`. |
| `get_video(video_id)` | Consulta estado, duración y metadatos. |
| `delete_video(video_id)` | Borra el video en Bunny. |
| `update_video_metadata(...)` | Cambia título/colección. |
| `get_tus_upload_url()` / `get_tus_headers(video_id)` | URL `https://video.bunnycdn.com/tusupload` y encabezados firmados: `AuthorizationSignature = SHA256(libraryId + apiKey + expiry + videoId)`, `AuthorizationExpire` (1 h), `VideoId`, `LibraryId`. |
| `build_embed_url` / `build_hls_url` / `build_thumbnail_url` | `iframe.mediadelivery.net/embed/{lib}/{video}`, `https://{cdn}/{video}/playlist.m3u8`, `https://{cdn}/{video}/thumbnail.jpg`. |
| `verify_webhook_signature(payload, firma)` | HMAC-SHA256 con `BUNNY_WEBHOOK_SECRET`, comparación en tiempo constante. |
| `VIDEO_STATUS` / `is_video_ready` | 0 queued, 1 processing, 2 encoding, 3 finished, 4 resolution_finished, 5 failed, 6 upload_failed. |

**Flujo de subida de video** (la API key nunca llega al navegador):

```
Instructor (VideoUploadButton.tsx)                 Backend                         Bunny Stream
  │ POST .../lecciones/{id}/video-init ───────────▶ create_video() ──────────────▶ crea video (guid)
  │ ◀──── {video_id, tus_url, headers firmados} ── guarda bunny_video_id
  │ subida TUS directa (tus-js-client) ──────────────────────────────────────────▶ recibe archivo
  │ GET .../video-status (polling) ───────────────▶ get_video() ─────────────────▶ status 0..6
  │                                                 POST /webhooks/bunny ◀────────  status 3/4
  │                                                 guarda hls_url, thumbnail, duración
```

### `paypal.py` (pagos)

`get_access_token()` (OAuth `client_credentials` contra sandbox o live según `PAYPAL_MODE`),
`create_order(monto, moneda, descripcion, reference_id)` con `intent = CAPTURE` y descripción recortada a
127 caracteres, `capture_order(order_id)`, `get_order(order_id)`. Todos lanzan `PayPalError` con el
mensaje de PayPal; el router lo traduce a 502. Timeout de 30 s (`httpx`).

### `certificado_pdf.py` (certificado)

`generate_certificate_pdf(folio, student_name, course_title, issued_date, marca, output_path)` dibuja con
ReportLab una hoja carta horizontal: fondo, bordes, esquinas, logo de la marca (`app/static/logos/nextgen`
o `ram`), cuerpo con nombre, curso, fecha y folio, firmas (`app/static/logos/firmas`) y sello. Para
cambiar el diseño se editan las funciones `_draw_*`; las posiciones usan `PAGE_W`, `PAGE_H` y `CX`.

### Correo (`app/utils.py`)

No es un servicio aparte: `send_email` usa **Resend** si hay `RESEND_API_KEY` y si no, SMTP. Las
plantillas MJML compiladas están en `app/email-templates/build/*.html` y se rellenan con Jinja2 (detalle
en el capítulo 2).

## 6.6 Receta: agregar un endpoint

1. Si necesita tabla o columna nueva: modelo en `app/models/<dominio>.py` + migración Alembic (capítulo 3).
2. Esquemas de entrada/salida (`XxxCreate`, `XxxUpdate`, `XxxPublic`) junto al modelo o en el router.
3. Lógica de datos en `app/crud.py` (funciones con `*, session, ...` por nombre).
4. Endpoint en el router: elegir la guardia (tabla 6.2), validar existencia (404), permisos (403) y
   estado (409); devolver el esquema `Public`.
5. Si es público y sensible, agregar `@limiter.limit` y `request: Request`.
6. Agregar el método en `frontend/src/lib/api/client.ts` (capítulo 7) y una prueba en
   `backend/tests/api/routes/`.
7. Documentarlo en [`endpoints.md`](endpoints.md).
