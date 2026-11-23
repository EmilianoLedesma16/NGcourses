# Capítulo 2 · Núcleo del backend y contratos compartidos

Este capítulo explica las piezas del backend que **todos** los routers usan: el arranque de la aplicación
(`app/main.py`), la configuración (`app/core/config.py`), la conexión a la base de datos (`app/core/db.py`),
las primitivas de seguridad (`app/core/security.py`), el rate limit (`app/core/limiter.py`), las
dependencias de FastAPI (`app/api/deps.py`), los enums y validadores de `app/models/` y los utilitarios de
correo (`app/utils.py`). Si vas a tocar cualquier endpoint, empieza aquí.

---

## 2.1 Arranque de la aplicación (`backend/app/main.py`)

Orden de lo que ocurre al importar `app.main`:

1. **Sentry.** Si `SENTRY_DSN` tiene valor y `ENVIRONMENT != "local"`, se llama a `sentry_sdk.init()` con
   `traces_sample_rate=0.1`, `send_default_pii=False` y el *hook* `before_send=_scrub_sentry_event`.
   `_scrub_sentry_event` recorre de forma recursiva las secciones `request` y `extra` del evento y reemplaza
   por `"[Filtered]"` el valor de cualquier llave cuyo nombre (en minúsculas) esté en
   `_SENTRY_SENSITIVE_KEYS` (`password`, `token`, `secret`, `authorization`, `cookie`, `x-api-key`,
   `access_token`).
2. **Instancia FastAPI.** En `ENVIRONMENT == "production"` se desactivan `openapi_url`, `docs_url` y
   `redoc_url`: en producción **no hay Swagger**. En local y staging, la documentación interactiva está en
   `/docs` y el esquema en `/api/v1/openapi.json`. `generate_unique_id_function=custom_generate_unique_id`
   nombra cada operación como `"{tag}-{nombre_función}"`; esos IDs los usa `scripts/generate-client.sh`.
3. **Rate limiting.** `app.state.limiter = limiter` y se registra `_rate_limit_exceeded_handler` de slowapi
   para responder `429` cuando se rebasa un límite (ver 2.4).
4. **`SecurityHeadersMiddleware`.** Middleware propio (hereda de `BaseHTTPMiddleware`) que añade a **todas**
   las respuestas del API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy: default-src 'none'`
   (la API solo sirve JSON y archivos), `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
   y, si `ENABLE_HTTPS` es verdadero, `Strict-Transport-Security` de dos años con `preload`.
5. **CORS.** Solo se registra si `settings.all_cors_origins` no está vacío (siempre incluye
   `FRONTEND_HOST`). Métodos permitidos explícitos (`GET, POST, PUT, PATCH, DELETE, OPTIONS`), cabeceras
   explícitas (`Authorization`, `Content-Type`, `X-Requested-With` y las cabeceras del protocolo TUS:
   `Tus-Resumable`, `Upload-Length`, `Upload-Offset`, `Upload-Metadata`, `Upload-Concat`,
   `Upload-Defer-Length`), `allow_credentials=True`, expone `X-Total-Count` y cachea el *preflight* 1 hora.
   En `local` acepta además los orígenes de túneles `*.loca.lt` y `*.ngrok(-free).app` por regex.
6. **Routers.** `app.include_router(api_router, prefix="/api/v1")`.
7. **Archivos estáticos.** Crea `MEDIA_DIR = /app/app/media`. Salvo que `SERVE_MEDIA=false`, monta como
   estáticos **solo** `/media/covers` (portadas de curso) y `/media/avatars` (fotos de perfil con nombre
   aleatorio). Los certificados y los recursos de lección **no** se montan: contienen datos personales o
   material restringido y se sirven por endpoints autenticados (`/certificados/descargar/{folio}` y
   `/cursos/recursos/{id}/download`).

## 2.2 Configuración (`backend/app/core/config.py`)

`Settings` es un `BaseSettings` de pydantic-settings que lee el archivo `../.env` (el `.env` de la raíz del
repositorio, un nivel arriba de `backend/`), ignora variables vacías y variables extra. Se instancia una
sola vez como `settings` y se importa desde cualquier módulo.

| Grupo | Variables | Detalle |
|---|---|---|
| API | `API_V1_STR="/api/v1"`, `PROJECT_NAME` (obligatoria), `ENVIRONMENT` (`local`/`staging`/`production`, default `local`) | `ENVIRONMENT` decide si hay Swagger, si se monta el router `/private` y si se inicializa Sentry. |
| JWT | `SECRET_KEY` (obligatoria, sin default), `ACCESS_TOKEN_EXPIRE_MINUTES=15`, `REFRESH_TOKEN_EXPIRE_DAYS=30` | |
| Frontend / CORS | `FRONTEND_HOST="http://localhost:3000"`, `BACKEND_CORS_ORIGINS` | `parse_cors` acepta una lista JSON o una cadena separada por comas. `all_cors_origins` = orígenes sin `/` final + `FRONTEND_HOST`. |
| HTTPS y cookies | `ENABLE_HTTPS=False`, `AUTH_COOKIE_SAMESITE="lax"`, `AUTH_COOKIE_DOMAIN=None` | `ENABLE_HTTPS` activa HSTS y el flag `Secure` en las cookies. |
| Proxies | `TRUSTED_PROXIES` | IPs o rangos CIDR desde los que se confía en `X-Forwarded-For` (ver 2.4). |
| PostgreSQL | `POSTGRES_SERVER`, `POSTGRES_PORT=5432`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `SQLALCHEMY_DATABASE_URI` se construye como `postgresql+psycopg://…` (driver psycopg 3). |
| Correo | `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_TLS=True`, `SMTP_SSL=False`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAILS_FROM_EMAIL`, `EMAILS_FROM_NAME`, `EMAIL_RESET_TOKEN_EXPIRE_HOURS=48` | `emails_enabled` es verdadero si hay Resend + remitente, o SMTP + remitente. Si no se da `EMAILS_FROM_NAME`, se usa `PROJECT_NAME`. |
| Superusuario | `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD` | Lo crea `init_db` al arrancar. |
| Bunny | `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY` (no se usa para firmar), `BUNNY_LIBRARY_ID`, `BUNNY_CDN_HOSTNAME`, `BUNNY_WEBHOOK_SECRET` | `bunny_enabled` = hay API key y library id. |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE` (`sandbox`/`live`) | `paypal_enabled` y `paypal_api_base` (`api-m.sandbox.paypal.com` o `api-m.paypal.com`). |
| Observabilidad | `SENTRY_DSN` | |

**Validación de secretos.** `_enforce_non_default_secrets` (validador `mode="after"`) llama a
`_check_default_secret` con `SECRET_KEY` y, si Bunny está activo, con `BUNNY_WEBHOOK_SECRET`. Si el valor es
vacío, `changethis`, `secret` o `CAMBIAR`, o mide menos de 32 caracteres, **la aplicación no arranca**
(`ValueError`). El mensaje sugiere generar uno con
`python -c "import secrets; print(secrets.token_urlsafe(64))"`.

## 2.3 Base de datos (`backend/app/core/db.py`)

- `engine = create_engine(SQLALCHEMY_DATABASE_URI, pool_size=20, max_overflow=10, pool_pre_ping=True)`.
  `pool_pre_ping` descarta conexiones muertas antes de usarlas (útil tras reinicios de Postgres).
- Las tablas **no** se crean con `SQLModel.metadata.create_all`; las crea Alembic (`alembic upgrade head`).
- `init_db(session)` se ejecuta en cada arranque (desde `initial_data.py`):
  - Si no existe un usuario con `email == FIRST_SUPERUSER`, lo crea con `is_superuser=True` y
    `rol=administrador`.
  - Si existe pero quedó desactivado, suspendido o sin `is_superuser`, lo **reactiva** ("break-glass"):
    un redeploy siempre recupera el acceso del superusuario. `routes/users.update_user` además impide
    suspenderlo desde el panel.

Scripts de soporte en `backend/app/`:

| Archivo | Qué hace |
|---|---|
| `backend_pre_start.py` | Reintenta `SELECT 1` cada segundo hasta 300 veces (5 minutos) con `tenacity`. Evita que las migraciones corran antes de que Postgres acepte conexiones. |
| `initial_data.py` | Abre una sesión y llama a `init_db`. |
| `tests_pre_start.py` | Igual que `backend_pre_start.py`, para el contenedor de pruebas. |
| `wipe_schema.py` | `DROP SCHEMA public CASCADE; CREATE SCHEMA public`. Solo para reinicios totales sin datos que conservar. **Destructivo.** |

`backend/scripts/prestart.sh` encadena: `backend_pre_start.py` → `alembic upgrade head` → `initial_data.py`.
Es el comando del servicio `prestart` de Docker Compose; el `backend` no arranca hasta que termina bien.

## 2.4 Seguridad básica y rate limit

### `backend/app/core/security.py`

| Función | Implementación |
|---|---|
| `create_access_token(subject, expires_delta)` | JWT HS256 firmado con `SECRET_KEY`; *claims* `exp`, `sub` (UUID del usuario como texto) y `jti` (UUID aleatorio, hace único cada token). |
| `create_refresh_token_raw()` | `secrets.token_urlsafe(64)`: el valor que viaja en la cookie `refresh_token`. |
| `hash_token(raw)` | SHA-256 en hexadecimal. En la BD solo se guarda este hash (`refresh_tokens.token_hash`), nunca el token. |
| `get_password_hash` / `verify_password` | `passlib.CryptContext(schemes=["bcrypt"])`. `bcrypt` está fijado a `4.3.0`. |

### `backend/app/core/limiter.py`

`limiter = Limiter(key_func=get_client_ip)` (slowapi). La llave del límite es la IP real del cliente, que
`get_client_ip(request)` calcula así:

1. Toma la IP de la conexión directa (`request.client.host`).
2. Solo si esa IP pertenece a `TRUSTED_PROXIES` (IPs sueltas o CIDR, parseadas una vez con `lru_cache`), lee
   `X-Forwarded-For` y lo recorre **de derecha a izquierda**, saltando los saltos que también son proxies de
   confianza. La primera IP que no lo es se toma como la del cliente.
3. Si no hay proxy confiable, usa la IP directa (o `127.0.0.1`).

Así un cliente no puede falsificar su IP mandando su propio `X-Forwarded-For`: lo que escriba queda a la
izquierda de lo que añaden Traefik y el BFF. En producción conviene poner en `TRUSTED_PROXIES` el rango de la
red de Docker (los contenedores cambian de IP en cada deploy).

Límites declarados con `@limiter.limit(...)`:

| Endpoint | Límite |
|---|---|
| `POST /login/access-token` | 5/minuto |
| `POST /login/refresh-token` | 20/minuto |
| `POST /password-recovery` y `/password-recovery/{email}` | 3/hora |
| `POST /reset-password/` | 5/minuto |
| `POST /users/activar` | 10/minuto |
| `POST /users/solicitar-reactivacion` | 5/hora |
| `POST /invitaciones/canjear` | 10/minuto |

Además `routes/comentarios.py` limita a **10 comentarios por minuto por usuario** contando filas en la BD
(`MAX_COMENTARIOS_POR_MINUTO`).

## 2.5 Dependencias de FastAPI (`backend/app/api/deps.py`)

Son las piezas que se inyectan en la firma de los endpoints. Todas se declaran como `Annotated[...]` para
usarlas como tipo.

| Dependencia | Tipo anotado | Regla |
|---|---|---|
| `get_db()` | `SessionDep` | Abre una `Session(engine)` por petición y la cierra al terminar. |
| `get_current_user()` | `CurrentUser` | Lee el JWT de la cookie HttpOnly `access_token`; si no existe, de `Authorization: Bearer …` (para Swagger y clientes de API). Sin token → `401 "No autenticado"`. Token inválido o vencido → `401 "Sesión expirada"` (no 403: el frontend reacciona a 401 renovando la sesión). Usuario inexistente → `404`. `is_active == False` o `estado == suspendido` → `401 "Cuenta inactiva o suspendida"`. |
| `get_current_active_superuser()` | — | Exige `is_superuser`. `403` si no. |
| `require_admin_or_superuser()` | `AdminOrSuperuser` | `rol == administrador` o `is_superuser`. |
| `require_supervisor_or_above()` | `SupervisorOrAbove` | `rol ∈ {supervisor, administrador}` o `is_superuser`. |
| `require_instructor_or_above()` | `InstructorOrAbove` | `rol ∈ {instructor, administrador}` o `is_superuser`. |

Patrones de uso:

```python
# Como tipo del parámetro (también te da el usuario):
def endpoint(session: SessionDep, current_user: AdminOrSuperuser): ...

# Como dependencia del decorador cuando no necesitas el usuario:
@router.delete("/{id}", dependencies=[Depends(require_admin_or_superuser)])
```

Varias rutas (por ejemplo `cursos.py` y `quiz.py`) tienen además ayudantes locales como
`_require_instructor_or_admin` o `_require_curso_owner_or_admin` que validan **propiedad** del recurso
(el instructor solo edita sus propios cursos).

## 2.6 Modelos compartidos (`backend/app/models/`)

- `__init__.py` reexporta todos los modelos con `from … import *`. Esto permite `from app.models import User`
  y, sobre todo, registra todas las tablas en `SQLModel.metadata` antes de que Alembic la lea
  (`alembic/env.py` hace `from app.models import SQLModel`). **Si agregas un archivo de modelos nuevo,
  impórtalo aquí** o Alembic no verá la tabla.
- `_base.py` define *mixins* (`UUIDModel`, `CreatedAtMixin`, `TimestampMixin`) disponibles para modelos
  nuevos.
- `schemas.py`: `Message` (respuesta genérica `{message}`), `Token`, `TokenPayload` (`sub`, `jti`),
  `NewPassword` (`token`, `new_password` de 8 a 128 caracteres), `PasswordRecoveryRequest` (`email`).

### Enums (`_enums.py`)

Todos heredan de `(str, enum.Enum)`, así que se serializan como texto. En Postgres, los que usan
`sa.Enum(..., create_type=False)` son tipos `ENUM` nativos creados por la migración inicial; `marca` y `tipo`
del curso se guardan como `VARCHAR(20)`.

| Enum | Valores |
|---|---|
| `RolUsuario` | `estudiante`, `instructor`, `supervisor`, `administrador`, `usuario_control` (heredado; no se asigna ni otorga permisos, solo se conserva para coincidir con el tipo de Postgres) |
| `EstadoUsuario` | `activo`, `suspendido`, `pendiente_activacion` |
| `EstadoCurso` | `borrador`, `revision`, `publicado`, `archivado`, `rechazado` |
| `TipoLeccion` | `video`, `quiz`, `lectura` |
| `TipoRecurso` | `pdf`, `link`, `archivo`, `docx`, `xlsx`, `pptx` |
| `EstadoInscripcion` | `activa`, `finalizada`, `cancelado` |
| `EstadoCalificacion` | `publica`, `oculta`, `pendiente` |
| `EstadoOrganizacion` | `activa`, `inactiva` |
| `RolOrganizacion` | `miembro`, `admin_org` |
| `EstadoLicencia` | `activa`, `agotada`, `expirada` |
| `EstadoSolicitud` | `abierta`, `en_revision`, `aprobada`, `rechazada`, `cerrada` |
| `CanalNotificacion` | `email`, `whatsapp`, `push`, `inapp` |
| `TipoNotificacion` | `inscripcion`, `certificado`, `solicitud`, `sistema`, `invitacion` |
| `EstadoNotificacion` | `pendiente`, `enviada`, `fallida`, `leida` |
| `ProveedorNotificacion` | `twilio`, `email`, `internal` |
| `CategoriaEvento` | `auth`, `crud`, `admin`, `sistema` |
| `EstadoInvitacion` | `pendiente`, `usada`, `expirada` |
| `TipoCurso` | `individual`, `global` |
| `MarcaCurso` | `ram`, `nextgen` |
| `EstadoPago` | `pendiente`, `completado`, `fallido`, `cortesia` |

### Validadores (`_validators.py`)

Tipos `Annotated` con `BeforeValidator` que se usan en los esquemas de entrada. Los límites coinciden con las
columnas, así un valor demasiado largo da `422` con mensaje claro en vez de un `500` de Postgres.

- `Telefono` / `normalizar_telefono`: recorta y colapsa espacios; acepta solo dígitos, espacios y `+ - ( ) .`;
  exige de 7 a 15 dígitos (E.164) y máximo 20 caracteres. Vacío → `None`.
- `Texto255`: recorta y limita a 255 caracteres.
- `RFC`: mayúsculas; regex `[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}` (persona moral de 12 o física de 13 caracteres).

## 2.7 Capa de datos (`backend/app/crud.py`)

`crud.py` (≈ 2,270 líneas) concentra el acceso a datos y las reglas que comparten varios routers. Las
funciones reciben siempre argumentos *keyword-only* (`*, session, ...`). Constantes al inicio del archivo:

| Constante | Valor | Uso |
|---|---|---|
| `UMBRAL_COMPLETADO_PCT` | 90 | Porcentaje de video visto para marcar una lección como completada (cada lección puede sobrescribirlo con `umbral_completado_pct`). |
| `FOLIO_TOKEN_BYTES` | 6 | Bytes aleatorios del folio del certificado (`NG-` + 12 hex). |
| `UMBRAL_APROBACION_QUIZ` | 0.60 | Fracción mínima de aciertos para aprobar un quiz. |
| `MAX_INTENTOS_QUIZ` | 3 | Intentos por quiz antes de quedar bloqueado. |
| `INVITACION_EXPIRACION_DIAS` | 7 | Vigencia de un enlace de invitación. |

Bloques del archivo, en orden:

| Bloque | Funciones principales |
|---|---|
| Usuarios | `create_user`, `update_user` (ignora cambios de `email`; sincroniza `is_active` con `estado`), `get_user_by_email`, `authenticate` |
| Categorías y etiquetas | `get/create/update/delete_categoria`, `..._etiqueta`, `assign_etiqueta_curso`, `remove_etiqueta_curso` |
| Cursos | `get_cursos` (filtros `estado`, `categoria_id`, `search`, `destacado`, `instructor_id`), `get_curso`, `create_curso`, `update_curso`, `delete_curso`, `_sync_es_gratis_with_precio` (mantiene `es_gratis` coherente con `precio`), `_METADATA_FIELDS` (`nivel`, `lo_que_aprenderas`, `requisitos`, `notas_revision` se guardan en `cursos.metadata`) |
| Módulos y lecciones | `get/create/update/delete_modulo`, `get_lecciones`, `get_lecciones_for_modulos` (una sola consulta para todos los módulos, evita N+1), `create/update/delete_leccion`, `_purgar_dependientes_leccion` (borra a mano progreso, intentos de quiz y analítica que apuntan a la lección sin `ON DELETE CASCADE`) |
| Recursos | `get_recursos_leccion`, `create_recurso_leccion`, `delete_recurso_leccion` |
| Inscripciones y progreso | `get_inscripcion`, `get_inscripcion_by_usuario_curso`, `create_inscripcion`, `cancelar_inscripcion`, `update_ultimo_acceso`, `upsert_progreso`, `curso_completado`, `nombre_certificado_valido`, `check_and_emit_certificate` |
| Reseñas | `create/update_calificacion`, `get_calificaciones_curso`, `_recalcular_rating_curso` (recalcula `calificacion_prom` y `total_resenas` del curso), `upsert_voto_resena` |
| Quiz | `crear_intento_quiz`, `get_ultimo_intento`, `contar_intentos_quiz`, `tiene_intento_aprobado_quiz`, `reiniciar_intentos_quiz`, `get_intentos_curso` |
| Invitaciones | `create_invitacion`, `get_invitacion_by_token_hash`, `canjear_invitacion`, `reenviar_invitacion`, `delete_invitacion`, `get_or_create_user_by_email` |
| Organizaciones | `create/get/list/update_organizacion`, `delete_organizacion` (borrado seguro en 3 pasos), `_delete_user_cascade`, `get_organizacion_of_user`, `get_org_ids_of_user`, `list_org_users`, `add_user_to_organizacion`, `create_supervisor_pendiente`, `remove_user_from_organizacion`, `_revocar_inscripciones_tras_baja_org`, `org_tiene_supervisor`, `list_supervisores_sin_organizacion`, `list_organizaciones_sin_supervisor` |
| Licencias | `assign_licencia` (cupos ilimitados: `cupos_total=0`), `unassign_licencia`, `quitar_licencias_de_subcursos`, `list_licencias_by_org`, `tiene_licencia_activa`, `cursos_con_licencia_activa`, `cursos_con_licencia_activa_orgs`, `list_cursos_for_student`, `get_org_stats`, `licencias_vigentes_org`, `inscripciones_org` |
| Solicitudes de empresas | `create_solicitud_curso`, `list_solicitudes_by_org`, `list_all_solicitudes`, `get_solicitud`, `set_solicitud_estado`, `add_comentario_solicitud` |
| Pagos | `create_pago_pendiente`, `get_pago_by_id`, `update_pago_status`, `get_pagos_usuario`, `usuario_tiene_pago_completado`, `cursos_con_pago_del_usuario` |
| Feature flags | `get_feature_flags`, `feature_habilitada(nombre, default=False)`, `set_feature_flag` |
| Cursos globales y avance | `expandir_con_subcursos`, `get_subcursos`, `contar_lecciones_visibles`, `avance_en_cursos`, `lecciones_completadas_validas`, `avance_por_inscripcion`, `set_subcursos`, `inscribir_en_curso_global` |

Las reglas de negocio que implementan estas funciones se explican en el
[Capítulo 5](../05-reglas-de-negocio/README.md).

## 2.8 Correo (`backend/app/utils.py` y `email-templates/`)

- `send_email(email_to, subject, html_content)`: exige `settings.emails_enabled`. Si hay `RESEND_API_KEY`,
  envía con el SDK de Resend; si no, cae a SMTP con la librería `emails` (TLS o SSL según configuración).
- `render_email_template(template_name, context)`: lee `email-templates/build/<archivo>.html` y lo rinde con
  Jinja2. Las fuentes MJML están en `email-templates/src/`; el HTML compilado vive en `build/`.

| Generador | Plantilla | Enlace que incluye |
|---|---|---|
| `generate_activacion_email` | `activacion_cuenta.html` | `{FRONTEND_HOST}/activar#token=…` |
| `generate_invitation_email` | `invitation_course.html` | `{FRONTEND_HOST}/invitacion#token=…` (7 días) |
| `generate_reset_password_email` | `reset_password.html` | `{FRONTEND_HOST}/reset-password#token=…` (48 h) |
| `generate_new_account_email` | `new_account.html` | `FRONTEND_HOST` |
| `generate_test_email` | `test_email.html` | — |

El token va en el **fragmento** (`#token=`), que el navegador nunca manda al servidor ni queda en logs de
acceso. Los tokens de activación y de recuperación que usa el flujo actual son `secrets.token_urlsafe(32)`
y en la BD se guarda solo su SHA-256 (ver Capítulo 4). `generate_password_reset_token` y
`verify_password_reset_token` (JWT con `sub=email`) siguen en el archivo como herencia de la plantilla, pero
ningún endpoint los llama. `email_formato_valido` valida la sintaxis de un correo con el mismo validador que
`EmailStr`.

## 2.9 Cómo agregar algo nuevo (receta)

1. **Modelo:** crea la clase `table=True` en el archivo del dominio de `app/models/` (o uno nuevo importado
   en `models/__init__.py`), con sus esquemas `XxxCreate`, `XxxUpdate`, `XxxPublic`.
2. **Migración:** `cd backend && alembic revision --autogenerate -m "descripcion"`, revisa el archivo
   generado (sobre todo enums y `server_default`) y `alembic upgrade head`.
3. **CRUD:** funciones en `crud.py` con `*, session: Session`.
4. **Router:** archivo en `app/api/routes/`, `router = APIRouter(prefix="/xxx", tags=["xxx"])`, protegido con
   `CurrentUser` o la dependencia de rol que corresponda; regístralo en `app/api/main.py`.
5. **Frontend:** agrega el método al objeto correspondiente de `frontend/src/lib/api/client.ts`.
6. **Pruebas:** en `backend/tests/api/routes/` (ver estado de la suite en el Capítulo 9).
