# 9. Despliegue, operación y mantenimiento

Este capítulo explica cómo levantar NGCourse en local, cómo llega a producción (AWS EC2 detrás de Traefik
en `nextgenia.lat`), qué revisa el CI y cómo operar el sistema día a día (verificación, respaldo,
restauración, rollback y problemas comunes).

Archivos complementarios:

- [`pendientes-y-roadmap.md`](pendientes-y-roadmap.md): deuda técnica priorizada y plan de mantenimiento.
- [`registro-operaciones.md`](registro-operaciones.md): bitácora de cambios hechos a mano en producción.

## 9.1 Archivos de Docker Compose

| Archivo | Para qué | Servicios |
|---|---|---|
| `docker-compose.yml` | Base heredada de la plantilla (imágenes `${DOCKER_IMAGE_*}:${TAG}`). Se combina automáticamente con el override en local. | `db`, `prestart`, `backend`, `frontend` |
| `docker-compose.override.yml` | **Desarrollo local** (se aplica solo con `docker compose up`). | `proxy` (Traefik 3.0, puertos 80 y 8090), `db` (5432 expuesto), `prestart`, `backend` (8000, `uvicorn --reload`, monta `./backend/app` y `./backend/app/media`), `mailcatcher` (1080/1025), `frontend` (perfil `frontend`), `playwright` (perfil `testing`) |
| `docker-compose.dev.yml` | Extra opcional: Adminer en `:8080`. | `adminer` |
| `docker-compose.prod.yml` | **Producción** (lo usa `deploy.yml`). Construye en el servidor. | `db`, `prestart`, `backend`, `frontend` |
| `docker-compose.traefik.yml` | Traefik v3.7 con Let's Encrypt, red externa `traefik-public`. Se levanta una vez. | `traefik` |
| `docker-compose.prod-build.yml` | Override para reconstruir solo el frontend en el servidor. | `frontend` |

### Producción (`docker-compose.prod.yml`)

| Servicio | Imagen / build | Detalles |
|---|---|---|
| `db` | `postgres:17` | Volumen `app-db-data`, healthcheck `pg_isready`. Sin puerto al host. |
| `prestart` | build `./backend` | `bash scripts/prestart.sh`: espera la BD (`backend_pre_start.py`) → `alembic upgrade head` → `initial_data.py` (crea `FIRST_SUPERUSER` si no existe). Debe terminar con éxito para que arranque el backend. |
| `backend` | build `./backend` | `WEB_CONCURRENCY=2`, `SERVE_MEDIA=true`, `ENVIRONMENT=production`, volumen `media_data:/app/app/media`, healthcheck `curl /api/v1/utils/health-check/`. Traefik: `api.${DOMAIN}` → puerto 8000. |
| `frontend` | build `frontend/Dockerfile` | `BACKEND_URL=http://backend:8000`, `ENABLE_HTTPS=true`. Traefik: `ngcourse.${DOMAIN}` o `app.${DOMAIN}` → puerto 3000. Espera a que el backend esté sano. |

Volúmenes: `app-db-data` (datos de Postgres) y `media_data` (portadas, avatares, recursos y certificados).
**Ambos contienen datos que no están en git**: nunca borrarlos con `docker compose down -v`.

### Imágenes

- `backend/Dockerfile`: `python:3.12` + `uv 0.11.6`, `uv sync --frozen`, usuario sin privilegios
  `appuser`, crea `media/covers`, `media/recursos`, `media/certificados`; arranca con
  `fastapi run --workers ${WEB_CONCURRENCY:-4} app/main.py`.
- `frontend/Dockerfile`: tres etapas sobre `node:24-alpine` (dependencias con `npm ci`, build, runner con
  `npm run start` en el puerto 3000). Argumentos de build: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`,
  `NEXT_PUBLIC_PAYPAL_MODE` (sandbox), `NEXT_PUBLIC_PAYPAL_CURRENCY` (MXN).

> En `docker-compose.prod.yml` el frontend solo recibe `NODE_ENV=production` como argumento de build. Si
> se quiere activar PayPal en producción hay que pasar ahí `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (ver pendientes).

## 9.2 Desarrollo local

Requisitos: Docker con Compose v2, Node ≥ 24 y npm ≥ 10 (solo si corres el frontend fuera de Docker),
`uv` si corres el backend fuera de Docker.

```bash
cp .env.example .env            # y llenar los valores (ver 9.5)
docker compose up -d            # db + prestart + backend (http://localhost:8000) + mailcatcher
docker compose logs -f backend  # ver logs
```

- Documentación interactiva: `http://localhost:8000/docs` (solo fuera de producción).
- Correos de prueba: `http://localhost:1080` (Mailcatcher) si `SMTP_HOST=mailcatcher` y no hay
  `RESEND_API_KEY`.
- Frontend con recarga en caliente (recomendado fuera de Docker):

```bash
npm install                      # desde la RAÍZ: el lockfile del workspace vive ahí
cd frontend
BACKEND_URL=http://localhost:8000 npm run dev    # http://localhost:3000
```

- Backend fuera de Docker:

```bash
cd backend
uv sync
source .venv/bin/activate
alembic upgrade head
fastapi dev app/main.py          # o: uvicorn app.main:app --reload
```

- Restaurar un respaldo de producción en local: `bash scripts/restore-db.sh <archivo.dump>` (borra la BD
  local, restaura con `pg_restore` y vuelve a levantar el backend, que aplica migraciones pendientes).
- Datos de prueba de integridad (solo local): `scripts/qa/qa_integridad.py seed | check | clean`. Todo lo
  que crea lleva el prefijo "QA " y el dominio `@qa-integridad.com`.

### Calidad y pruebas del backend

```bash
cd backend
bash scripts/lint.sh     # mypy + ruff check + ruff format --check
bash scripts/format.sh   # ruff --fix + ruff format
```

Pruebas: **nunca** correr `pytest` contra una base con datos (el fixture `db` de `tests/conftest.py`
borra todos los usuarios al terminar). Usar una base aparte:

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ng_test;"'
docker compose exec -T -e POSTGRES_DB=ng_test backend sh -c "alembic upgrade head && pytest"
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE ng_test;"'
```

Pruebas existentes en `backend/tests/`: `api/routes/` (calificaciones, comentarios, cursos, cursos
globales, inscripciones, items, login, private, users), `crud/` y `scripts/`. Hoy la mayoría falla porque
los helpers esperan el token en el JSON del login (ver pendientes, punto 1).

## 9.3 Producción en AWS EC2

```
Internet ──▶ Traefik (80/443, Let's Encrypt)
              ├── app.nextgenia.lat / ngcourse.nextgenia.lat ──▶ frontend:3000 ──▶ backend:8000 (red interna)
              ├── api.nextgenia.lat ─────────────────────────▶ backend:8000  (webhooks, acceso directo)
              └── traefik.nextgenia.lat ─────────────────────▶ dashboard (usuario y contraseña de .env.prod)
backend ──▶ db:5432 (red interna)    backend ──▶ Bunny, PayPal, Resend (salida HTTPS)
```

### Setup inicial (una sola vez en una EC2 nueva)

1. Instalar Docker, crear *swap* y crear `~/NGcourses`.
2. `docker network create traefik-public`.
3. Crear `~/NGcourses/.env.prod` a partir de `.env.prod.example` con los valores reales. **No está en
   git** y el deploy lo preserva.
4. Levantar Traefik: `docker compose -f docker-compose.traefik.yml --env-file .env.prod up -d`.
5. Primer arranque: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`.

### DNS

Registros **A** hacia la IP pública (idealmente Elastic IP) de la EC2:

| Registro | Necesidad |
|---|---|
| `app` | Requerido: entrada de la aplicación. |
| `api` | Recomendado: webhooks de Bunny/PayPal y acceso directo a la API. |
| `traefik` | Opcional: dashboard de Traefik. |

Con Cloudflare, los registros deben estar en **"DNS only"** (sin proxy) para que funcione el reto TLS de
Let's Encrypt. Tras propagar, Traefik emite los certificados solo.

### Despliegue automático (`.github/workflows/deploy.yml`)

Se dispara en cada `push` a `main` que toque `frontend/**`, `backend/**`, `package*.json`, `.npmrc`,
`docker-compose.prod.yml`, `docker-compose.traefik.yml` o el propio workflow; también a mano
(`workflow_dispatch`). `concurrency: deploy-production` evita dos deploys a la vez.

1. Valida que existan los *secrets* `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` (limpia espacios y saltos de
   línea pegados por error).
2. Empaqueta el commit con `git archive` y lo copia por `scp` a `/tmp/ngcourses.tar.gz`.
3. En el servidor: borra todo `~/NGcourses` **excepto `.env.prod`** (para no dejar archivos fantasma),
   extrae el paquete y falla si no existe `.env.prod`.
4. Crea la red `traefik-public` si falta y levanta Traefik si no está corriendo.
5. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`. Las migraciones corren
   solas en `prestart`.
6. Muestra `ps` y hace `docker image prune -f`.

*Secrets* de GitHub (`Settings → Secrets and variables → Actions`, requiere rol Admin del repo):

| Secret | Valor |
|---|---|
| `EC2_HOST` | IP o Elastic IP pública de la EC2. |
| `EC2_USER` | Usuario SSH (`ubuntu` en Ubuntu). |
| `EC2_SSH_KEY` | Contenido completo del `.pem`, con las líneas `BEGIN` / `END`. |

Pausar el auto-deploy: `Actions → Deploy to EC2 → ··· → Disable workflow` (temporal) o borrar
`deploy.yml` (permanente).

### Verificación después de desplegar

```bash
ssh -i <llave.pem> <usuario>@<IP> 'cd ~/NGcourses && docker compose -f docker-compose.prod.yml --env-file .env.prod ps'
# salud del backend (no expone puerto al host):
ssh -i <llave.pem> <usuario>@<IP> 'docker exec ngcourses-backend-1 curl -s http://localhost:8000/api/v1/utils/health-check/'
# versión de esquema aplicada:
ssh -i <llave.pem> <usuario>@<IP> 'docker exec ngcourses-backend-1 alembic current'
```

Después, entrar a `https://app.nextgenia.lat`, iniciar sesión como admin y abrir un curso con video.

### Rollback

El build siempre es del commit desplegado. Para volver atrás: `git revert` del commit problemático en
`main` (vuelve a disparar el deploy) o, en el servidor, extraer una versión anterior y repetir
`up -d --build`. **Ojo con las migraciones**: si la versión nueva aplicó una migración, revisar que tenga
`downgrade` antes de bajar el código (capítulo 3); la migración 8 no tiene vuelta atrás automática.

## 9.4 Integración continua (`.github/workflows/ci.yml`)

Corre en cada pull request, en cada push a `main` y a mano. Permisos de solo lectura.

| Job | Pasos |
|---|---|
| **frontend** | Node 24 → `npm ci` (desde la raíz) → `npm audit --omit=dev --audit-level=high` → `npx tsc --noEmit` → `npm run build`. |
| **backend** | Servicio `postgres:17` → `uv sync --frozen` (Python 3.12, uv 0.11.6) → `pip-audit` sobre las dependencias de producción → `alembic upgrade head` → importar `app.main` (cuenta rutas) → `pytest` **informativo** (`continue-on-error: true` hasta arreglar la suite). |

Además, `.github/dependabot.yml` propone actualizaciones de npm, uv/pip, Docker y GitHub Actions con una
espera de 7 días antes de sugerir versiones recién publicadas.

> El deploy **no** espera al CI todavía: un push a `main` despliega aunque el CI falle (pendiente en el
> roadmap).

## 9.5 Variables de entorno

La lista completa y comentada está en `.env.example` (local) y `.env.prod.example` (producción). La
validación y los valores por defecto viven en `backend/app/core/config.py` (capítulo 2).

| Grupo | Variables |
|---|---|
| Proyecto | `DOMAIN`, `STACK_NAME`, `ENVIRONMENT` (`local` / `staging` / `production`), `PROJECT_NAME`, `FRONTEND_HOST`, `BACKEND_HOST`, `ENABLE_HTTPS`, `BACKEND_CORS_ORIGINS` |
| Seguridad | `SECRET_KEY` (obligatoria y distinta de `changethis` fuera de local), `ACCESS_TOKEN_COOKIE_NAME`, `REFRESH_TOKEN_COOKIE_NAME`, `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_DOMAIN` |
| Base de datos | `POSTGRES_SERVER`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| Primer admin | `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD` |
| Correo | `RESEND_API_KEY` o `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS`, `SMTP_SSL`, `SMTP_USER`, `SMTP_PASSWORD`; `EMAILS_FROM_EMAIL`, `EMAILS_FROM_NAME`, `EMAILS_ENABLED` (prod) |
| Video | `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY` (definida pero sin uso: la firma TUS usa la API key), `BUNNY_LIBRARY_ID`, `BUNNY_CDN_HOSTNAME`, `BUNNY_WEBHOOK_SECRET`; en el frontend `NEXT_PUBLIC_BUNNY_LIBRARY_ID` |
| Pagos | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE` (`sandbox` / `live`); en el frontend `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_MODE`, `NEXT_PUBLIC_PAYPAL_CURRENCY` |
| Monitoreo | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_ENVIRONMENT` |
| Traefik (prod) | `USERNAME`, `HASHED_PASSWORD`, `EMAIL` (dashboard y Let's Encrypt) |
| Heredadas (sin uso en el deploy actual) | `AWS_REGION`, `ECR_REGISTRY`, `DOCKER_IMAGE_BACKEND`, `DOCKER_IMAGE_FRONTEND` |

## 9.6 Scripts de la raíz (`scripts/`)

| Script | Estado | Uso |
|---|---|---|
| `restore-db.sh` | Vigente | Restaura un `pg_dump -Fc` en la BD local. |
| `qa/qa_integridad.py` | Vigente (solo local) | Escenario de datos QA y comparación API vs BD. |
| `generate_security_report.py` | Vigente | Genera el reporte de seguridad en PDF (`docs/04-seguridad/reporte_seguridad.pdf`). |
| `test.sh`, `test-local.sh` | Heredados de la plantilla | Construyen el stack y corren `tests-start.sh` dentro del backend. Ojo con el borrado de usuarios. |
| `build.sh`, `build-push.sh`, `deploy.sh` | **Obsoletos** | Flujo de la plantilla con imágenes en registro y `docker stack`. |
| `deploy-frontend.sh` | **Obsoleto** | Flujo anterior con ECR. No usar. |
| `generate-client.sh` | **Obsoleto** | Llama a `npm run generate-client`, que ya no existe en el frontend. |

Scripts del backend (`backend/scripts/`): `prestart.sh`, `tests-start.sh`, `test.sh`, `lint.sh`,
`format.sh`.

## 9.7 Operación diaria

| Tarea | Cómo |
|---|---|
| Ver logs | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend` (se pierden al recrear el contenedor). |
| Entrar a la BD | `docker exec -it ngcourses-db-1 psql -U $POSTGRES_USER -d $POSTGRES_DB` |
| Respaldo manual | `docker exec ngcourses-db-1 pg_dump -U $POSTGRES_USER -Fc $POSTGRES_DB > respaldo_$(date +%F).dump` |
| Respaldo de media | `docker run --rm -v ngcourses_media_data:/m -v $PWD:/b alpine tar czf /b/media_$(date +%F).tgz -C /m .` |
| Reenviar activación | Admin → Usuarios → "Reenviar activación" (`POST /users/{id}/reenviar-activacion`). |
| Regenerar un certificado | `POST /api/v1/certificados/regenerar/{folio}` como admin (la descarga también lo regenera si falta el archivo). |
| Encender el rol instructor | Admin → Configuración (flag `instructores`). |
| Cambios de datos a mano | Registrar antes y después en [`registro-operaciones.md`](registro-operaciones.md). |

## 9.8 Problemas comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El backend no arranca y `prestart` sale con error | Migración fallida o BD no disponible. | `docker compose logs prestart`; corregir la migración; `alembic current`. |
| `SECRET_KEY` rechazada al arrancar | Valor `changethis` fuera de local. | Generar una con `python -c "import secrets; print(secrets.token_urlsafe(32))"`. |
| La página carga sin estilos o con errores de CSP | Se sirve por HTTP con `ENABLE_HTTPS=true`, o una página quedó prerenderizada. | Entrar por HTTPS; mantener `dynamic = 'force-dynamic'` en el layout. |
| Usuario sale a `/?error=session_expired` | Refresh token vencido o revocado. | Normal tras 30 días o tras logout en otro equipo. |
| `429 Too Many Requests` en login | Límite de 5/min por IP. | Esperar; detrás de proxy revisar `get_client_ip` (capítulo 2). |
| El video se queda "procesando" | El webhook de Bunny no llega (secret, DNS de `api.` o firma). | Revisar `BUNNY_WEBHOOK_SECRET` y la URL del webhook en Bunny (`https://api.nextgenia.lat/api/v1/webhooks/bunny`). `GET .../video-status` solo consulta el estado en Bunny (no guarda `hls_url`); el reproductor funciona con el iframe a partir de `bunny_video_id`. |
| "Token inválido" al activar una cuenta vieja | Cuentas creadas antes del 17/11/2026 con token sin hash. | Reenviar activación. |
| 504 en picos de uso | Instancia t3.small sin memoria. | Revisar métricas; agregar swap o subir de instancia. |
| Certificado no se emite al terminar | El alumno no tiene nombre real en el perfil. | Que capture su nombre; el certificado se emite en el siguiente registro de progreso. |
