# Capítulo 4 · Seguridad, autenticación y control de sesiones

Este capítulo describe cómo se autentica una persona, cómo vive su sesión entre el navegador, el frontend
(Next.js) y el backend (FastAPI), cómo se autorizan los roles y qué defensas adicionales existen (cabeceras,
CSP, rate limit, validación de archivos, webhooks firmados). Archivos involucrados:

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Backend | `backend/app/api/routes/login.py` | Login, logout, refresh, sesión, recuperación de contraseña. |
| Backend | `backend/app/api/routes/users.py` | Alta sin contraseña, activación, cambio de contraseña, guardas de privilegios. |
| Backend | `backend/app/api/deps.py` | `get_current_user` y dependencias de rol. |
| Backend | `backend/app/core/security.py`, `core/limiter.py` | JWT, hashes, bcrypt, rate limit por IP real. |
| Backend | `backend/app/main.py` | Cabeceras de seguridad, CORS, Sentry sin PII. |
| Frontend | `frontend/src/proxy.ts` | Guardias de ruta por rol, renovación de sesión del lado del servidor, CSP con *nonce*. |
| Frontend | `frontend/src/app/api/[...path]/route.ts` | BFF: reenvía `/api/*` al backend conservando cookies. |
| Frontend | `frontend/src/lib/api/client.ts`, `lib/auth.ts` | Reintento con refresh ante 401, cookies de rol. |
| Frontend | `frontend/next.config.ts` | Cabeceras de seguridad del sitio. |

---

## 4.1 Modelo de sesión: dos tokens en cookies HttpOnly

| Cookie | Contenido | Vida | Flags |
|---|---|---|---|
| `access_token` | JWT HS256 (`sub` = id del usuario, `exp`, `jti`) | 15 min (`ACCESS_TOKEN_EXPIRE_MINUTES`) | `HttpOnly`, `SameSite=AUTH_COOKIE_SAMESITE` (lax), `Secure` si `ENABLE_HTTPS`, `Path=/`, `Domain=AUTH_COOKIE_DOMAIN` |
| `refresh_token` | Cadena aleatoria de 64 bytes (`token_urlsafe(64)`) | Con "Recordarme": 30 días. Sin él: cookie de sesión (se borra al cerrar el navegador) | Iguales |
| `session_persist` | `"1"` si el usuario marcó "Recordarme" | 30 días | `HttpOnly` |
| `user_rol`, `user_superuser` | Rol y bandera de superusuario (no secretos) | Igual que la sesión | **No** HttpOnly; `SameSite=Strict`. Las escribe el frontend (`lib/auth.ts::setRolCookies`) para que `proxy.ts` decida redirecciones rápidas. **No otorgan permisos**: el backend siempre valida el JWT. |

El access token **siempre** caduca a los 15 minutos aunque el usuario haya pedido "Recordarme": si la
cookie sobreviviera al JWT, el navegador mandaría un token vencido. Lo que se alarga es el refresh token.

En la BD solo se guarda el **SHA-256** del refresh token (`refresh_tokens.token_hash`), con su expiración,
la IP de creación y, al rotarlo, `revocado_en` y `reemplazado_por_token_hash`.

## 4.2 Flujo de autenticación

```
 [Navegador]                [Next.js (frontend)]                   [FastAPI]                [PostgreSQL]
     │ POST /api/v1/login/access-token (form: username, password; ?remember=)
     │──────────────────────────▶│ BFF reenvía con cookies ─────────▶│ crud.authenticate (bcrypt)
     │                           │                                   │ ¿is_active? ¿flag instructores?
     │                           │                                   │ crea JWT + refresh ─────────▶ INSERT refresh_tokens(hash)
     │◀── Set-Cookie access_token, refresh_token, session_persist ───│ responde UserPublic
     │ lib/auth.ts guarda cookies user_rol / user_superuser
     │
     │ GET /admin (navegación)    proxy.ts: ¿hay access_token?
     │──────────────────────────▶│   no → ¿hay refresh_token? → POST /login/refresh-token ▶ rota
     │                           │   sí → GET /auth/session (server-to-server) ─────────▶ valida JWT
     │                           │        rol == requerido → sigue; otro rol → home del rol
     │
     │ fetch /api/v1/... → 401   ApiClient.tryRefresh() (una sola en vuelo) → reintenta la petición
```

### 4.2.1 `POST /login/access-token` (5/min por IP)

1. `crud.authenticate(email, password)` busca por correo y verifica con bcrypt. Si falla → `400 "Incorrect email or password"`.
2. Si `is_active` es falso → `400 "Inactive user"`. (Las cuentas `pendiente_activacion` y `suspendido` tienen `is_active=False`.)
3. **Feature flag**: si el usuario es `instructor` (y no superusuario) y `feature_flags.instructores` está apagado → `403`.
4. Emite `access_token` y crea la fila de `refresh_tokens`; fija las cookies y `session_persist`.
5. Responde el `UserPublic` (sin tokens en el cuerpo).

### 4.2.2 `POST /login/refresh-token` (20/min)

Lee la cookie `refresh_token`, busca su hash. Rechaza con `401` si no existe, si ya fue revocado o si expiró.
Rechaza también si la cuenta dejó de estar activa o está suspendida: dar de baja corta también la renovación.
Si todo está bien **rota**: revoca el token usado, crea uno nuevo, emite un access token nuevo y respeta
`session_persist` para decidir si las cookies son persistentes.

### 4.2.3 `POST /logout`

Revoca el refresh token presente (si lo hay) y borra `access_token`, `refresh_token` y `session_persist`.

### 4.2.4 `GET /auth/session`

Devuelve `{rol, is_superuser}` del usuario del JWT. Lo usa `proxy.ts` para validar del lado del servidor las
rutas `/admin`, `/supervisor` e `/instructor` sin confiar en las cookies de rol.

### 4.2.5 Renovación en el frontend

- **Navegación** (`proxy.ts::renovarSesion`): si una ruta protegida llega sin `access_token` pero con
  `refresh_token`, el proxy llama a `/login/refresh-token`, reescribe las cookies de rol con la sesión real y
  redirige a la misma URL con las cookies nuevas.
- **Llamadas a la API** (`lib/api/client.ts`): ante un `401`, `ApiClient.tryRefresh()` hace **una sola**
  petición de refresh aunque haya varias peticiones fallando a la vez (`_refreshInProgress`), y reintenta.
  Si el refresh falla, borra las cookies de rol y, si había sesión y la ruta no es pública, manda al login.
  `fetchConRefresh` aplica la misma lógica a subidas y descargas de archivos (FormData/blob).

## 4.3 Alta de cuentas sin contraseña y activación

Ninguna contraseña viaja por correo. Toda cuenta nueva nace `pendiente_activacion` con `is_active=False` y
recibe un enlace de activación:

| Origen del alta | Endpoint | Notas |
|---|---|---|
| Admin crea usuario | `POST /users/` (`UserAltaAdmin`) | Solo superusuario puede crear superusuarios. Supervisores no se crean aquí (deben tener organización). Rol instructor bloqueado si el flag está apagado. `organizacion_id` opcional, solo para alumnos. |
| Admin crea organización | `POST /organizaciones/` | Crea la empresa y su supervisor pendiente. |
| Admin agrega supervisor | `POST /organizaciones/{id}/supervisor` | Uno por empresa salvo flag `multiples_supervisores`. |
| Canje de invitación | `POST /invitaciones/canjear` | Crea la cuenta del alumno si no existe (`crud.get_or_create_user_by_email`). |

El token de activación es `secrets.token_urlsafe(32)`; se guarda su SHA-256 en `user.token_activacion` y
caduca a las **72 horas**. El correo lleva `{FRONTEND_HOST}/activar#token=…`.

- `POST /users/activar` (10/min): busca por hash, valida expiración, fija la contraseña (8 a 128 caracteres),
  pone `estado=activo`, `is_active=True` y borra el token (uso único).
- `POST /users/solicitar-reactivacion` (5/h): el usuario pide un enlace nuevo con su correo. Respuesta
  uniforme exista o no la cuenta (no permite enumerar correos).
- `POST /users/{id}/reenviar-activacion` (admin): regenera y reenvía.

## 4.4 Recuperación y cambio de contraseña

- `POST /password-recovery` (3/h, correo en el cuerpo JSON): si el usuario existe y está activo, genera un
  token aleatorio, guarda su hash en `password_reset_token` con expiración de 48 h y manda
  `{FRONTEND_HOST}/reset-password#token=…`. **Siempre** responde el mismo mensaje.
  `POST /password-recovery/{email}` es la versión antigua (correo en la URL), marcada `deprecated`.
- `POST /reset-password/` (5/min): valida hash y expiración, cambia la contraseña, invalida el token y
  **revoca todos los refresh tokens** del usuario (cierra sus otras sesiones).
- `PATCH /users/me/password`: exige la contraseña actual, prohíbe repetirla y también revoca todos los
  refresh tokens activos.

## 4.5 Autorización por roles

Roles de plataforma (`user.rol`) y su alcance:

| Rol | Dependencia que lo admite | Alcance |
|---|---|---|
| `administrador` (o `is_superuser`) | `AdminOrSuperuser`, y también `SupervisorOrAbove` e `InstructorOrAbove` | Toda la plataforma. |
| `supervisor` | `SupervisorOrAbove` | Solo su organización (`_get_user_org` en `routes/supervisor.py`). |
| `instructor` | `InstructorOrAbove` | Solo sus cursos (`instructor_id == user.id`). Rol congelado por flag. |
| `estudiante` | `CurrentUser` | Sus inscripciones, su progreso, su perfil. |

Además de la dependencia de rol, cada endpoint valida **propiedad** y **pertenencia**:

- Cursos: `_require_curso_owner_or_admin` en todas las escrituras de cursos, módulos, lecciones, recursos y
  video.
- Inscripciones, progreso y quiz: la inscripción debe ser del usuario (`inscripcion.usuario_id == current_user.id`).
- Supervisor: invitaciones solo de cursos licenciados a su empresa; no puede quitarse a sí mismo ni a otro
  supervisor.

Guardas contra escalada de privilegios en `PATCH /users/{id}`:

- `UserUpdate` tiene `extra="forbid"` y **no** incluye `is_superuser` (evita asignación masiva).
- Solo el superusuario puede cambiar `rol`, `estado` o `is_active` de una cuenta de administrador o
  superusuario.
- Nadie puede suspender ni desactivar su propia cuenta.
- El correo no se puede cambiar (es la llave de la cuenta).
- `init_db` reactiva al `FIRST_SUPERUSER` en cada arranque si quedó bloqueado.

Feature flags que afectan la autorización (`routes/feature_flags.py`, editables por el admin en
`/admin/configuracion`):

| Flag | Efecto si está apagado |
|---|---|
| `instructores` | Los instructores no pueden iniciar sesión; no se pueden crear ni asignar instructores. |
| `multiples_supervisores` | Cada organización admite un solo supervisor (`admin_org`). |

## 4.6 Frontend: guardias de ruta (`frontend/src/proxy.ts`)

`proxy.ts` es el *middleware* de Next.js 16 (antes `middleware.ts`). Corre en cada navegación excepto
assets estáticos y `/api/*`:

| Prefijo | Requisito |
|---|---|
| `/admin` | Rol `administrador` o superusuario, validado con `GET /auth/session`. |
| `/supervisor` | Rol `supervisor`, validado con `/auth/session`. |
| `/instructor` | Rol `instructor`, validado con `/auth/session`. |
| `/cursos`, `/curso`, `/mis-cursos`, `/certificados`, `/perfil`, `/pagos` | Solo que exista `access_token`. |
| `/` (login) | Con sesión, redirige al home del rol (`/admin`, `/supervisor`, `/instructor` o `/cursos`). |

Si el rol no coincide, redirige al home propio con `?error=role`; sin sesión, a `/?error=auth`. En desarrollo,
si el backend no responde, usa las cookies de rol como respaldo para no bloquear el trabajo local.

## 4.7 Cabeceras y Content Security Policy

**Backend** (`SecurityHeadersMiddleware`): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Content-Security-Policy: default-src 'none'`, `Permissions-Policy` restrictiva y HSTS con `ENABLE_HTTPS`.

**Frontend**:

- `next.config.ts` añade a todas las rutas `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()` y HSTS cuando `ENABLE_HTTPS=true`.
- `proxy.ts::buildCsp(nonce)` genera una CSP **por petición** con un *nonce* aleatorio
  (`crypto.randomUUID()` en base64) y la pone tanto en la petición (para que Next.js firme sus scripts de
  hidratación) como en la respuesta:

```
default-src 'self';
script-src 'nonce-…' 'strict-dynamic' https://www.paypal.com https://www.paypalobjects.com ['unsafe-eval' solo en dev];
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: https://*.b-cdn.net https://www.paypalobjects.com https://www.paypal.com https://t.paypal.com;
connect-src 'self' https://video.bunnycdn.com https://api-m(.sandbox).paypal.com https://www.paypal.com https://t.paypal.com https://*.sentry.io https://*.ingest.sentry.io;
frame-src https://iframe.mediadelivery.net https://www.paypal.com https://www.sandbox.paypal.com;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
[upgrade-insecure-requests si ENABLE_HTTPS=true]
```

Si agregas un servicio externo nuevo (un CDN, otro iframe), **hay que agregar su dominio aquí** o el
navegador lo bloqueará.

## 4.8 Archivos subidos

| Tipo | Endpoint | Límite | Validación | Dónde se guarda |
|---|---|---|---|---|
| Portada de curso | `POST /cursos/{id}/cover` | 5 MB | `content_type` en JPEG/PNG/WEBP/GIF **y** firma mágica (`\xff\xd8\xff`, `\x89PNG`, `GIF8`, `RIFF…WEBP`) | `media/covers/{curso_id}.{ext}` (público) |
| Avatar | `POST /users/me/avatar` | 2 MB | Igual que portada | `media/avatars/{uuid}.{ext}` (público, nombre aleatorio) |
| Recurso de lección | `POST /cursos/.../recursos/upload` | 20 MB | Firma mágica `%PDF`, ZIP de Office (`PK\x03\x04`) u OLE (`\xd0\xcf\x11\xe0`) | `media/recursos/{uuid}.{ext}` (**privado**, se descarga por `/cursos/recursos/{id}/download` con control de acceso) |
| Certificado | generado por el servidor | — | — | `media/certificados/{FOLIO}.pdf` (**privado**, `/certificados/descargar/{folio}`) |
| Video | subida directa a Bunny por TUS | — | Firma SHA-256 de 1 hora generada por el backend | Bunny Stream |

## 4.9 Webhooks firmados (Bunny)

`POST /webhooks/bunny` **falla cerrado**: si `BUNNY_WEBHOOK_SECRET` no está configurado responde `503`; si la
cabecera `BunnycdnVideoId-Signature` falta o no coincide con `HMAC-SHA256(secret, cuerpo)` (comparación en
tiempo constante con `hmac.compare_digest`) responde `401`. También ignora eventos cuyo `VideoLibraryId` no
coincide con la librería del curso o la del `.env`.

## 4.10 Otras medidas

- **Rate limit** por IP real (ver Capítulo 2, sección 2.4) y 10 comentarios/minuto por usuario.
- **Sentry** sin PII (`send_default_pii=False`) y con depuración de llaves sensibles.
- **Swagger desactivado** en producción.
- **Datos personales**: certificados y recursos no son estáticos públicos; los comentarios muestran el nombre
  del autor o la parte local del correo, nunca el correo completo.
- **Quiz**: el alumno nunca recibe `esCorrecta`; la calificación ocurre en el servidor.
- **Integridad de pagos**: se compara el monto capturado por PayPal con el registrado antes de dar acceso.
- **Cadena de dependencias**: `.npmrc` con `ignore-scripts=true`, `npm ci` y `uv sync --frozen` en Docker y CI,
  `npm audit` y `pip-audit` en CI, Dependabot con espera de 7 días.

## 4.11 Riesgos conocidos

- Las URL de video de Bunny no están firmadas: un alumno dado de baja puede seguir viendo un video ya abierto
  hasta recargar. Solución: *token authentication* de Bunny.
- `TRUSTED_PROXIES` debe incluir el rango de la red de Docker en producción; si no, el rate limit ve la IP
  del proxy y no la del cliente.
- Las tablas `eventos_sistema` (auditoría) existen pero no se escriben todavía.

Ver la lista completa en [Pendientes y roadmap](../09-despliegue-y-operacion/pendientes-y-roadmap.md).
