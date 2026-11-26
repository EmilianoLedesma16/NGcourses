# Seguridad

Resumen de los controles que ya existen y de dónde viven. Los códigos `FND-0xx` que
aparecen en comentarios del código vienen de la auditoría de seguridad
([`historico/reporte_seguridad.pdf`](historico/reporte_seguridad.pdf)).

## Sesión

| Pieza | Detalle |
|---|---|
| Access token | JWT HS256 firmado con `SECRET_KEY`, 15 minutos, en cookie **HttpOnly** `access_token` |
| Refresh token | Aleatorio (64 bytes), 30 días, cookie HttpOnly `refresh_token`. En la BD solo se guarda su **SHA-256** (`refresh_tokens`) |
| Rotación | Cada `POST /login/refresh-token` revoca el token usado y emite uno nuevo (`reemplazado_por_token_hash`) |
| "Recordarme" | Sin él, las cookies no tienen `max_age` y se borran al cerrar el navegador |
| Logout | Revoca el refresh token y borra ambas cookies |
| Cuentas dadas de baja | `inactivo` o `suspendido` reciben 401 tanto en peticiones como al renovar: la baja corta la sesión |
| Cookies | `SameSite` configurable (`AUTH_COOKIE_SAMESITE`, `lax` por defecto), `Secure` con `ENABLE_HTTPS` |

El navegador nunca ve el JWT. Las cookies legibles `user_rol` y `user_superuser` solo sirven
para redirigir; el rol real lo valida el backend (y `proxy.ts` vía `GET /auth/session`).

## Contraseñas y tokens de un solo uso

- Contraseñas con bcrypt (`passlib`), mínimo 8 caracteres.
- Recuperación de contraseña: token con vencimiento (`EMAIL_RESET_TOKEN_EXPIRE_HOURS`, 48 h).
- Activación de cuenta: token por correo, guardado en la BD como hash; la contraseña la
  define el usuario y **nunca** se genera ni se envía por correo.
- Invitaciones: en la BD solo el **hash** del token; vencen y son de un solo uso.

## Autorización

Guardias en `api/deps.py` (`CurrentUser`, `InstructorOrAbove`, `SupervisorOrAbove`,
`AdminOrSuperuser`) más reglas por recurso dentro de cada endpoint: el instructor solo edita
sus cursos, el supervisor solo ve su organización, el contenido de un curso solo lo ve quien
tiene acceso. Detalle por rol en [Roles y permisos](roles-y-permisos.md).

## Límites de peticiones

`slowapi` con la IP real del cliente (`core/limiter.py`): `X-Forwarded-For` solo se acepta
si la conexión viene de un proxy de `TRUSTED_PROXIES` (IP o CIDR), recorriendo la cadena de
derecha a izquierda para que el cliente no pueda falsificar su IP.

| Endpoint | Límite |
|---|---|
| `POST /login/access-token` | 5/min |
| `POST /login/refresh-token` | 20/min |
| `POST /password-recovery` | 3/h |
| `POST /reset-password/` | 5/min |
| `POST /users/activar` | 10/min |
| `POST /users/solicitar-reactivacion` | 5/h |
| `POST /invitaciones/canjear` | 10/min |
| Comentarios | 10 por minuto por usuario (regla propia, 429) |

## Cabeceras y CSP

- **Backend** (`SecurityHeadersMiddleware`): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Content-Security-Policy: default-src 'none'`,
  `Permissions-Policy` y HSTS con `ENABLE_HTTPS`.
- **Frontend**: `next.config.ts` pone cabeceras base; `proxy.ts` genera una CSP con
  **nonce por petición** y `'strict-dynamic'`, limitada a los dominios de PayPal, Bunny y
  Sentry. Si integras un servicio nuevo (scripts, iframes, imágenes o `fetch` a otro
  dominio), agrégalo ahí o el navegador lo bloqueará.
- CORS con orígenes, métodos y cabeceras explícitos (incluidas las de TUS).

## Archivos

- Solo `media/covers` (portadas) y `media/avatars` (fotos con nombre aleatorio) son públicos.
- Certificados y recursos de lección se sirven por endpoints que validan sesión y acceso.
- Imágenes subidas: se valida el `content-type` **y** la firma real de bytes
  (`_check_magic_image`).
- Videos: se suben directo a Bunny con una firma temporal; el webhook exige firma HMAC y
  falla cerrado si falta el secreto.

## Configuración y secretos

- La app no arranca con `SECRET_KEY` (o `BUNNY_WEBHOOK_SECRET`) vacía, corta o por defecto.
- En producción se apagan `/docs`, `/redoc` y `openapi.json`; el router `/private` solo
  existe en `local`.
- Sentry no envía PII y filtra claves sensibles antes de mandar un evento.
- `.env`, `.env.prod` y `ncourses.md` están en `.gitignore`; `gitleaks` corre como hook de
  pre-commit (`.pre-commit-config.yaml`, reglas en `.gitleaks.toml`).

## Cadena de dependencias

- `.npmrc`: `ignore-scripts=true` (no corre scripts de instalación) y `save-exact=true`.
- Dependabot semanal con periodo de espera para versiones recién publicadas
  (`.github/dependabot.yml`).
- CI: `npm audit --omit=dev --audit-level=high` y `pip-audit` sobre las dependencias de
  producción del backend.

## Pendientes de seguridad conocidos

Ver [Deuda técnica y mejoras](deuda-tecnica-y-mejoras.md#seguridad). Lo más relevante: la URL
HLS de Bunny es pública (quien la tenga puede ver el video sin sesión) y quedan cuentas
pendientes de activación con el token guardado sin hash, anteriores a la corrección del
2026-11-17.
