# Arquitectura

NextGen Course es una plataforma de capacitación en línea para empresas. Las empresas
(organizaciones) compran licencias de cursos; sus empleados (alumnos) toman los cursos en
video, lectura o cuestionario y obtienen un certificado al terminar. También hay cursos
propios de NextGen que cualquier alumno puede tomar, gratis o pagando con PayPal.

## Componentes

```
                    ┌──────────────────────────── EC2 (Docker) ────────────────────────────┐
 Navegador ──HTTPS──► Traefik ──► frontend (Next.js 16, puerto 3000)                          │
                    │     │          │  /api/*   → proxy a backend (route handler)            │
                    │     │          │  /media/* → proxy a backend (portadas y avatares)      │
                    │     │          ▼                                                        │
                    │     └──────► backend (FastAPI, puerto 8000) ──► db (PostgreSQL 17)      │
                    │                │        ▲                                              │
                    │                │        └── prestart: alembic upgrade + datos iniciales │
                    └────────────────┼─────────────────────────────────────────────────────────┘
                                     ├──► Bunny Stream (video: subida TUS, HLS, miniaturas, webhooks)
                                     ├──► PayPal (órdenes y captura de pagos)
                                     ├──► Resend o SMTP (correos de activación, invitación, recuperación)
                                     └──► Sentry (errores, solo fuera de local)
```

| Pieza | Tecnología | Dónde vive |
|---|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript, CSS Modules | `frontend/` |
| Backend | FastAPI, SQLModel/SQLAlchemy, Pydantic v2, Alembic, slowapi | `backend/` |
| Base de datos | PostgreSQL 17 | contenedor `db`, volumen `app-db-data` |
| Proxy de entrada | Traefik v3 con Let's Encrypt | `docker-compose.traefik.yml` |
| Video | Bunny Stream (biblioteca de video, CDN `*.b-cdn.net`, reproductor en iframe) | servicio externo |
| Pagos | PayPal REST (sandbox o live) | servicio externo |
| Correo | Resend (preferido) o SMTP | servicio externo |
| Observabilidad | Sentry (frontend y backend) | servicio externo |

## Cómo viaja una petición

1. El navegador siempre habla con el **mismo origen** del frontend. No llama al backend
   directo: todas las llamadas van a `/api/...` del propio Next.js.
2. `frontend/src/proxy.ts` (el middleware de Next 16) corre antes de cada página:
   genera el nonce de la CSP, decide si la ruta necesita sesión, renueva la sesión si solo
   queda el refresh token y valida el rol contra el backend (`GET /api/v1/auth/session`)
   para las rutas de `/admin`, `/supervisor` e `/instructor`.
3. `frontend/src/app/api/[...path]/route.ts` reenvía la petición al backend
   (`BACKEND_URL`) con las mismas cookies y cabeceras, conserva el cuerpo en redirecciones
   307/308 y devuelve las `Set-Cookie` del backend sin mezclarlas.
4. FastAPI autentica con la cookie HttpOnly `access_token` (o `Authorization: Bearer` para
   Swagger), aplica la guardia de rol que corresponda y responde.

Que todo pase por el mismo origen permite usar cookies HttpOnly con `SameSite=Lax` sin CORS
en el navegador, y que el backend no tenga que exponerse públicamente para la app (sí se
expone `api.<dominio>` para los webhooks de Bunny y PayPal).

## Integraciones externas

- **Bunny Stream.** El backend crea el video en la biblioteca y firma la subida; el navegador
  sube el archivo directo a Bunny por TUS (`tus-js-client`), sin pasar por nuestro servidor.
  Bunny avisa por webhook cuando termina de procesar y el backend guarda la URL HLS, la
  miniatura y la duración. El alumno ve el video en el iframe de Bunny; el frontend escucha
  sus eventos (`player.js`) para registrar el avance. Detalle en
  [Funcionalidades › Video](funcionalidades.md#video-con-bunny-stream).
- **PayPal.** Orden creada en el backend, aprobada por el alumno con el botón de PayPal y
  capturada en el backend, que verifica monto y estado antes de inscribir.
- **Correo.** `backend/app/utils.py::send_email` usa Resend si hay `RESEND_API_KEY`; si no,
  SMTP. Plantillas HTML en `backend/app/email-templates/build/`.
- **Sentry.** Backend: solo si `SENTRY_DSN` está definido y el entorno no es `local`, con
  limpieza de datos sensibles antes de enviar. Frontend: `sentry.*.config.ts` y
  `withSentryConfig` en `next.config.ts`.

## Entornos

| Entorno | Cómo corre | Archivos |
|---|---|---|
| Local con Docker | `docker compose up` (base + override automático) | `docker-compose.yml`, `docker-compose.override.yml`, opcional `docker-compose.dev.yml` (Adminer) |
| Local sin Docker | `uvicorn` + `next dev` | ver [Desarrollo local](desarrollo-local-y-pruebas.md) |
| Producción | EC2, build en el servidor, Traefik con TLS | `docker-compose.prod.yml`, `docker-compose.traefik.yml`, `.github/workflows/deploy.yml` |

`ENVIRONMENT` (`local`, `staging`, `production`) cambia comportamiento del backend: en
`production` se apagan `/docs`, `/redoc` y el `openapi.json`; en `local` CORS acepta túneles
(`*.loca.lt`, `*.ngrok.app`) y existe el router `/private`.
