# Backend (FastAPI)

## Estructura

```
backend/
├── app/
│   ├── main.py              # crea la app: Sentry, rate limit, cabeceras de seguridad, CORS, routers, /media
│   ├── api/
│   │   ├── main.py          # registra todos los routers bajo /api/v1
│   │   ├── deps.py          # sesión de BD, usuario actual y guardias de rol
│   │   └── routes/          # un módulo por recurso (cursos, quiz, pagos, …)
│   ├── core/
│   │   ├── config.py        # Settings (pydantic-settings) leídas de ../.env
│   │   ├── db.py            # engine y datos iniciales (primer superusuario)
│   │   ├── security.py      # JWT, hash de contraseñas y de tokens
│   │   └── limiter.py       # slowapi con IP real detrás de proxies de confianza
│   ├── crud.py              # capa de datos y reglas de negocio (≈2 300 líneas)
│   ├── models/              # tablas SQLModel y esquemas Pydantic de entrada/salida
│   ├── services/            # integraciones: bunny.py, paypal.py, certificado_pdf.py
│   ├── email-templates/     # src/ (MJML) y build/ (HTML que usa la app)
│   ├── alembic/             # migraciones
│   ├── utils.py             # correo (Resend/SMTP), tokens de recuperación, validaciones
│   ├── initial_data.py      # crea el primer superusuario (FIRST_SUPERUSER)
│   ├── backend_pre_start.py # espera a que la BD responda
│   └── wipe_schema.py       # borra y recrea el esquema public (uso manual, destructivo)
├── scripts/                 # prestart.sh, test.sh, tests-start.sh, lint.sh, format.sh
├── tests/                   # pytest
├── pyproject.toml / uv.lock # dependencias (uv)
└── Dockerfile
```

## Arranque

El servicio `prestart` corre `scripts/prestart.sh` antes de levantar `backend`:

1. `backend_pre_start.py`: reintenta la conexión a PostgreSQL.
2. `alembic upgrade head`: aplica migraciones.
3. `initial_data.py`: crea el superusuario de `FIRST_SUPERUSER` si no existe.

`app/main.py` además:

- Inicializa Sentry solo si hay `SENTRY_DSN` y `ENVIRONMENT != local`, con
  `before_send` que reemplaza por `[Filtered]` claves como `password`, `token`, `cookie`.
- Apaga `/docs`, `/redoc` y `openapi.json` en producción.
- Agrega `SecurityHeadersMiddleware` (`nosniff`, `DENY`, CSP `default-src 'none'`, HSTS si
  `ENABLE_HTTPS`).
- Monta como estáticos **solo** `/media/covers` y `/media/avatars`. Certificados y recursos
  de lección se sirven por endpoints autenticados.

## Configuración (`core/config.py`)

Se lee de `../.env` (raíz del repo). Las variables más relevantes:

| Grupo | Variables | Notas |
|---|---|---|
| App | `PROJECT_NAME`, `ENVIRONMENT`, `FRONTEND_HOST`, `BACKEND_CORS_ORIGINS`, `ENABLE_HTTPS` | `ENVIRONMENT` ∈ local/staging/production |
| Sesión | `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` (15), `REFRESH_TOKEN_EXPIRE_DAYS` (30), `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_DOMAIN` | `SECRET_KEY` obligatoria, ≥32 caracteres y no un valor por defecto |
| BD | `POSTGRES_SERVER`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | se arma `postgresql+psycopg://…` |
| Correo | `RESEND_API_KEY` o `SMTP_*`, `EMAILS_FROM_EMAIL`, `EMAILS_FROM_NAME` | `emails_enabled` es falso si no hay remitente |
| Bunny | `BUNNY_API_KEY`, `BUNNY_LIBRARY_ID`, `BUNNY_CDN_HOSTNAME`, `BUNNY_WEBHOOK_SECRET` (`BUNNY_TOKEN_KEY` existe pero ya no se usa) | si Bunny está activo, el secreto del webhook también se valida |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE` | sandbox por defecto |
| Proxies | `TRUSTED_PROXIES` | IPs o CIDR de los que se acepta `X-Forwarded-For` |
| Seed | `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD` | |

La app **no arranca** si `SECRET_KEY` (o `BUNNY_WEBHOOK_SECRET` con Bunny activo) está
vacía, es corta o vale `changethis`/`secret`/`CAMBIAR`.

## Autenticación y guardias (`api/deps.py`)

- `get_current_user` lee la cookie `access_token`; si no hay, acepta `Authorization: Bearer`.
  Token inválido o vencido → **401** (el frontend renueva con el refresh token). Cuenta
  inactiva o `SUSPENDIDO` → 401.
- Guardias reutilizables (tipos `Annotated` para inyectar en las rutas):

| Dependencia | Deja pasar |
|---|---|
| `CurrentUser` | cualquier sesión válida |
| `InstructorOrAbove` | instructor, administrador o superusuario |
| `SupervisorOrAbove` | supervisor, administrador o superusuario |
| `AdminOrSuperuser` | administrador o superusuario |
| `get_current_active_superuser` | solo `is_superuser` |

Las reglas finas (p. ej. "el supervisor solo ve su organización", "el instructor solo edita
sus cursos") se validan dentro de cada endpoint. Ver [Roles y permisos](roles-y-permisos.md).

## Capa de datos (`crud.py`)

Concentra consultas **y** reglas de negocio. Las constantes que gobiernan el aula están al
inicio del archivo:

| Constante | Valor | Efecto |
|---|---|---|
| `UMBRAL_COMPLETADO_PCT` | 90 | % de video visto para marcar una lección como completada |
| `UMBRAL_APROBACION_QUIZ` | 0.60 | fracción de aciertos para aprobar un cuestionario |
| `MAX_INTENTOS_QUIZ` | 3 | intentos antes de bloquear el cuestionario (un admin o el instructor lo reinicia) |

Funciones clave (todas en `crud.py`):

- `upsert_progreso`: guarda el avance tomando siempre el **máximo** (`visto_seg`,
  `progreso_pct`) y marca `completado` al cruzar el umbral. Tolera dos escrituras
  simultáneas de la misma lección (reintenta tras `IntegrityError`).
- `curso_completado` / `check_and_emit_certificate`: ver
  [Funcionalidades › Progreso y certificados](funcionalidades.md#progreso-finalización-y-certificados).
- `list_cursos_for_student`, `tiene_licencia_activa`, `cursos_con_licencia_activa(_orgs)`,
  `expandir_con_subcursos`: visibilidad y acceso por licencia y por proceso.
- `crear_intento_quiz`, `reiniciar_intentos_quiz`: calificación y reinicio del cuestionario.
- `_delete_user_cascade`, `delete_organizacion`, `_revocar_inscripciones_tras_baja_org`:
  borrados en cascada hechos a mano.

## Catálogo de endpoints

Todos bajo `/api/v1`. Entre paréntesis, la guardia principal; "público" = sin sesión.

**Sesión y cuenta** (`login.py`, `users.py`)
- `POST /login/access-token` (público, 5/min): login con formulario; emite cookies.
- `POST /login/refresh-token` (20/min): rota el refresh token y renueva el access token.
- `POST /logout`, `GET /auth/session` (rol y superusuario de la sesión, lo usa `proxy.ts`).
- `POST /password-recovery` (3/h), `POST /reset-password/` (5/min).
- `GET|PATCH|DELETE /users/me`, `PATCH /users/me/password`, `POST|DELETE /users/me/avatar`.
- `POST /users/activar` (público, 10/min), `POST /users/solicitar-reactivacion` (5/h).
- Admin: `GET /users/`, `POST /users/`, `GET|PATCH|DELETE /users/{id}`,
  `POST /users/{id}/reenviar-activacion`.

**Contenido** (`cursos.py`, `categorias.py`, `etiquetas.py`)
- `GET /cursos/` (filtra por rol: el alumno solo ve lo que su acceso permite), `GET /cursos/destacados`, `GET /cursos/{id}`.
- `POST /cursos/`, `PATCH /cursos/{id}`, `DELETE /cursos/{id}`, `POST /cursos/{id}/cover`, `PUT /cursos/{id}/subcursos` (instructor o admin).
- Módulos: `GET|POST /cursos/{id}/modulos`, `PATCH|DELETE /cursos/{id}/modulos/{m}`.
- Lecciones: `GET|POST …/modulos/{m}/lecciones`, `PATCH|DELETE …/lecciones/{l}`.
- Video: `POST …/lecciones/{l}/video-init`, `GET …/video-status`, `DELETE …/video`.
- Recursos: `GET|POST …/lecciones/{l}/recursos`, `POST …/recursos/upload`, `DELETE …/recursos/{r}`, `GET /cursos/recursos/{r}/download` (solo inscritos o staff).
- Invitaciones por curso: `GET|POST /cursos/{id}/invitaciones`, `POST …/{inv}/reenviar`, `DELETE …/{inv}`.
- Catálogos: `/categorias/` y `/etiquetas/` (CRUD de admin; las etiquetas no se usan en la interfaz).

**Aula** (`inscripciones.py`, `progreso.py`, `quiz.py`, `comentarios.py`, `calificaciones.py`, `certificados.py`)
- `POST /inscripciones/`, `GET /inscripciones/me`, `GET /inscripciones/{id}`, `PATCH /inscripciones/{id}/cancelar`, `GET /inscripciones/curso/{c}`, `GET /inscripciones/usuario/{u}`.
- `POST /progreso/`, `GET /progreso/curso/{c}`.
- `POST /quiz/lecciones/{l}/enviar`, `GET /quiz/lecciones/{l}/ultimo-intento`, `POST /quiz/lecciones/{l}/reiniciar-intentos` (admin o instructor dueño), `GET /quiz/cursos/{c}/resultados`.
- `GET|POST /lecciones/{l}/comentarios`, `PATCH|DELETE /comentarios/{id}`, `PUT|DELETE /comentarios/{id}/like`.
- `GET|POST /calificaciones/cursos/{c}`, `PATCH /calificaciones/{id}`, `POST /calificaciones/{id}/votar`.
- `GET /certificados/me`, `GET /certificados/descargar/{folio}`, `GET /certificados/vista-previa/{folio}`, `POST /certificados/regenerar/{folio}`, `GET /certificados/verificar/{folio}` (público).

**Empresas** (`organizaciones.py`, `supervisor.py`, `solicitudes.py`, `invitaciones.py`)
- Admin: CRUD de `/organizaciones/`, miembros, supervisor, licencias (`/organizaciones/{id}/licencias`), listas auxiliares (`supervisores-sin-organizacion`, `sin-supervisor`).
- Supervisor: `/supervisor/mi-organizacion`, `cursos`, `usuarios`, `invitaciones` (+ reenviar/borrar), `stats`, `dashboard`, `solicitudes`.
- Admin: `GET /solicitudes`, `PATCH /solicitudes/{id}`.
- Invitaciones: `POST /invitaciones/canjear` (público, 10/min), `POST /invitaciones/`, `GET /invitaciones/curso/{c}`, `POST /invitaciones/{id}/reenviar`, `DELETE /invitaciones/{id}`.

**Pagos y sistema** (`pagos.py`, `webhooks.py`, `admin_stats.py`, `feature_flags.py`, `utils.py`, `private.py`, `items.py`)
- `POST /pagos/crear-orden`, `POST /pagos/confirmar`, `GET /pagos/mis-compras`, `POST /pagos/admin/cortesia`.
- `POST /webhooks/bunny` (firma HMAC obligatoria).
- `GET /admin/stats`, `GET /feature-flags`, `PATCH /feature-flags/{nombre}`.
- `GET /utils/health-check/`, `POST /utils/test-email/` (solo superusuario).
- `POST /private/users/` solo existe con `ENVIRONMENT=local`.
- `/items/*`: restos de la plantilla original; sin uso (ver [deuda técnica](deuda-tecnica-y-mejoras.md)).

## Servicios (`services/`)

- `bunny.py`: crea y borra videos y colecciones, firma la subida TUS (SHA-256 de
  `library_id + api_key + expiración + video_id`; Bunny exige la API key de la biblioteca, no
  `BUNNY_TOKEN_KEY`), arma URLs de embed, HLS y miniatura, y
  verifica la firma HMAC del webhook.
- `paypal.py`: token OAuth, creación y captura de órdenes contra `paypal_api_base`.
- `certificado_pdf.py`: genera el PDF del certificado con ReportLab, con la marca del curso
  (RAM o NextGen). Se guarda en `app/media/certificados/{folio}.pdf`.

## Migraciones (Alembic)

- Modelos en `app/models/`; `alembic/env.py` importa su `metadata`.
- Crear una migración después de cambiar un modelo:
  ```bash
  docker compose exec backend bash
  alembic revision --autogenerate -m "describe el cambio"
  alembic upgrade head
  ```
- Revisa siempre el archivo generado: los `Enum` de PostgreSQL y los índices parciales no
  siempre se detectan bien con `--autogenerate`.
- En producción las migraciones corren solas en `prestart` en cada deploy. Una migración
  rota tumba el deploy; pruébala antes en local contra una copia de la base de datos
  (`scripts/restore-db.sh`).

## Correo

`utils.send_email` decide el proveedor: Resend si hay `RESEND_API_KEY`, si no SMTP. Generadores
de correo: activación de cuenta, invitación a curso, nueva cuenta, recuperación de
contraseña y correo de prueba. Las plantillas fuente están en MJML (`email-templates/src`);
la app usa el HTML de `email-templates/build`. Para editar una plantilla, cambia el `.mjml`
y expórtalo a HTML con la extensión MJML de VS Code.
