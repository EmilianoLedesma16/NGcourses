# Capítulo 1 · Resumen ejecutivo, visión del ecosistema y stack tecnológico

## 1.1 Qué es NGCourse

NGCourse es la plataforma de cursos en línea de NEXTGEN IA. Sirve dos tipos de contenido con la misma base
de código, distinguidos por la columna `cursos.marca`:

- **NEXTGEN** (`marca = nextgen`): cursos propios que se pueden ofrecer gratis o vender de forma individual
  con PayPal.
- **RAM** (`marca = ram`): capacitación interna de la empresa cliente. No se venden: el acceso llega por
  la **licencia** que el administrador asigna a una organización o por una **invitación**.

La plataforma cubre el ciclo completo de un curso: el administrador o instructor lo crea (módulos,
lecciones de video, lectura o quiz, recursos descargables), lo publica, lo asigna a organizaciones o lo pone
a la venta; el alumno se inscribe, ve los videos (servidos por Bunny Stream), contesta los quizzes, comenta
lecciones, deja una reseña y, al completar todas las lecciones visibles, recibe un certificado PDF con folio
verificable.

Los cursos pueden agruparse en **cursos globales** (en la interfaz, "procesos"): un curso `tipo=global` no
tiene módulos propios; contiene cursos `individual` ordenados por `orden_en_padre`. La licencia de un global
cubre todos sus cursos.

## 1.2 Arquitectura general

```
Navegador ──HTTPS──▶ Traefik ──▶ frontend (Next.js 16, :3000)
                                   │  proxy.ts  → guardias por rol + CSP con nonce
                                   │  /api/*    → BFF: reenvía a BACKEND_URL con cookies
                                   │  /media/*  → reenvía portadas y avatares
                                   ▼
                       backend (FastAPI, :8000, /api/v1)
                                   │  SQLModel / SQLAlchemy (psycopg 3)
                                   ▼
                       db (PostgreSQL 17, volumen app-db-data)

Servicios externos: Bunny Stream (video, TUS, webhooks) · PayPal Orders v2 · Resend o SMTP (correo) · Sentry
```

El navegador **solo habla con el dominio del frontend**. Las llamadas a la API van a `/api/v1/...` en el
mismo origen y el *route handler* `frontend/src/app/api/[...path]/route.ts` las reenvía al backend del lado
del servidor, conservando las cookies HttpOnly. Por eso en producción no hace falta CORS para la app.

## 1.3 Stack tecnológico

| Capa | Tecnología | Uso en NGCourse |
|---|---|---|
| Monorepo | npm workspaces (`package.json` raíz) | El workspace incluye `frontend/`. El backend se gestiona aparte con `uv`. Node ≥ 24. |
| Frontend | Next.js 16 (App Router), React 19.2, TypeScript 5 | Páginas por rol en `frontend/src/app`, guardias en `src/proxy.ts`, BFF en `app/api/[...path]`. |
| Estilos | CSS Modules + variables CSS (`globals.css`), tema claro/oscuro | `data-theme` en `<html>`, preferencia en `localStorage` (`ng-theme`). Tailwind 4 está instalado pero el código usa CSS Modules. |
| Validación de formularios | Zod 4 | `src/schemas/auth.ts`, `profile.ts`, `user.ts`. |
| Video | Bunny Stream + `tus-js-client` | Subida reanudable directa a Bunny; reproducción en iframe `iframe.mediadelivery.net` con protocolo player.js. |
| Pagos | PayPal (`@paypal/react-paypal-js` + API Orders v2) | Venta individual de cursos NEXTGEN en MXN. |
| Backend | FastAPI (Python 3.12 en Docker, ≥ 3.10), SQLModel, Pydantic 2 | API en `backend/app`, prefijo `/api/v1`, 22 routers. |
| Base de datos | PostgreSQL 17 + Alembic | 30 tablas con UUID como PK; 9 migraciones. |
| Seguridad | PyJWT (HS256), passlib/bcrypt, slowapi | JWT de 15 min en cookie HttpOnly + refresh token rotativo de 30 días. |
| Documentos | ReportLab, pypdfium2 | Certificados PDF y su vista previa como imagen. |
| Correo | Resend (prioritario) o SMTP, plantillas MJML/Jinja2 | Activación de cuenta, recuperación de contraseña, invitaciones. |
| Observabilidad | Sentry (backend y frontend) | Con depuración de datos sensibles antes de enviar. |
| Infraestructura | Docker Compose, Traefik + Let's Encrypt, AWS EC2 | Deploy automático desde `main` con GitHub Actions. |

## 1.4 Estructura del repositorio

```
ngcourses/
├── backend/                     API FastAPI
│   ├── app/
│   │   ├── main.py              Instancia FastAPI, middlewares, Sentry, montaje de /media
│   │   ├── api/
│   │   │   ├── main.py          Registro de los 22 routers
│   │   │   ├── deps.py          Sesión de BD, usuario actual y dependencias de rol
│   │   │   └── routes/          Un archivo por recurso (cursos, inscripciones, pagos…)
│   │   ├── core/                config.py, db.py, security.py, limiter.py
│   │   ├── models/              Tablas SQLModel y esquemas Pydantic por dominio
│   │   ├── services/            bunny.py, paypal.py, certificado_pdf.py
│   │   ├── crud.py              Acceso a datos y reglas de negocio reutilizables
│   │   ├── utils.py             Envío de correo y plantillas
│   │   ├── alembic/versions/    Migraciones
│   │   ├── email-templates/     MJML fuente y HTML compilado
│   │   └── static/logos/        Logos, sellos y firmas para certificados
│   ├── scripts/                 prestart.sh, test.sh, lint.sh, format.sh
│   ├── tests/                   pytest (api/routes, crud, scripts)
│   ├── Dockerfile               python:3.12 + uv
│   └── pyproject.toml / uv.lock
├── frontend/                    Aplicación Next.js
│   ├── src/app/                 Rutas (alumno, /admin, /instructor, /supervisor, /api, /media)
│   ├── src/components/          Componentes por área (course, admin, supervisor, ui, video…)
│   ├── src/lib/                 Cliente API, auth, tema, progreso en vivo, quiz
│   ├── src/proxy.ts             Guardias de ruta por rol + CSP
│   └── Dockerfile               node:24-alpine, build en 3 etapas
├── docker-compose*.yml          Desarrollo, producción y Traefik
├── scripts/                     Deploy, build, restauración de BD, QA de integridad
├── .github/workflows/           ci.yml y deploy.yml
└── docs/                        Esta documentación
```

## 1.5 Números del sistema (al 23/11/2026)

| Elemento | Cantidad | Dónde |
|---|---|---|
| Routers de la API | 22 | `backend/app/api/main.py` |
| Endpoints HTTP | 137 (136 en producción; `/private` solo existe en local) | `backend/app/api/routes/*.py` |
| Tablas en PostgreSQL | 30 | `backend/app/models/*.py` |
| Enums de dominio | 21 | `backend/app/models/_enums.py` |
| Migraciones Alembic | 9 | `backend/app/alembic/versions/` |
| Páginas Next.js (`page.tsx`) | 43 | `frontend/src/app/` |
| Roles de plataforma | 4 activos (+1 heredado sin uso) | `RolUsuario` |
