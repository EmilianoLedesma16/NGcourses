# Frontend (Next.js)

Next.js 16 con App Router y Turbopack, React 19 y TypeScript estricto. Next 16 trae cambios
de API respecto a versiones anteriores (por ejemplo, el middleware se llama `proxy.ts`);
`frontend/AGENTS.md` lo recuerda y apunta a la documentación incluida en
`node_modules/next/dist/docs/`.

## Estructura

```
frontend/
├── src/
│   ├── proxy.ts            # middleware: CSP con nonce, sesión, renovación y guardia de rol
│   ├── app/                # rutas (App Router)
│   │   ├── api/[...path]/  # proxy de todas las llamadas al backend
│   │   ├── media/[...path]/# proxy de /media (portadas y avatares)
│   │   ├── admin/ supervisor/ instructor/   # paneles por rol
│   │   ├── cursos/ curso/ mis-cursos/ certificados/ perfil/   # alumno
│   │   └── activar/ invitacion/ forgot-password/ reset-password/ terminos/ privacidad/
│   ├── components/         # por dominio: course/, admin/, supervisor/, instructor/, shared/, …
│   ├── lib/                # cliente de API, sesión, tema, utilidades de dominio
│   ├── schemas/            # validación de formularios con zod
│   └── types/              # tipos compartidos (course.ts, admin.ts)
├── sentry.*.config.ts      # Sentry cliente, servidor y edge
├── next.config.ts          # cabeceras de seguridad, imágenes remotas, Sentry
└── Dockerfile
```

## Rutas por rol

| Rol | Rutas | Layout |
|---|---|---|
| Público | `/` (login), `/activar`, `/invitacion`, `/forgot-password`, `/reset-password`, `/terminos`, `/privacidad` | `app/layout.tsx` |
| Alumno | `/cursos` (dashboard), `/curso/[id]` (ficha del curso o del proceso), `/curso/[id]/videos` (aula), `/mis-cursos` (Mi progreso), `/certificados`, `/perfil` | `StudentHeader` + barra inferior en móvil |
| Instructor | `/instructor`, `/instructor/cursos` (crear, editar, estadísticas), `/instructor/alumnos`, `/instructor/perfil` | `InstructorLayout` |
| Supervisor | `/supervisor`, `/supervisor/usuarios`, `/supervisor/invitaciones`, `/supervisor/cursos`, `/supervisor/solicitudes`, `/supervisor/mi-organizacion` | `SupervisorLayout` |
| Administrador | `/admin` y `/admin/{usuarios, alumnos, instructores, cursos, organizaciones, solicitudes, solicitudes-empresas, configuracion, perfil}` | `AdminLayout` |

El admin puede ver el contenido de un curso como alumno en
`/admin/cursos/[id]/preview`, y cualquier miembro del staff abre el aula en modo solo
lectura con `?from=admin`.

## `proxy.ts` (middleware)

Corre en cada navegación (excepto estáticos):

1. **CSP con nonce por petición.** Arma `Content-Security-Policy` con `script-src 'nonce-…'
   'strict-dynamic'` y dominios permitidos de PayPal, Bunny (`iframe.mediadelivery.net`,
   `*.b-cdn.net`, `video.bunnycdn.com`) y Sentry. El nonce también viaja en la cabecera de
   la petición para que Next lo aplique a sus propios scripts.
2. **Rutas que piden sesión** (`/cursos`, `/curso`, `/mis-cursos`, `/certificados`,
   `/perfil`, `/pagos` y los paneles): sin `access_token` pero con `refresh_token`, renueva la
   sesión del lado del servidor y repite la navegación con las cookies nuevas.
3. **Guardia de rol** para `/admin`, `/supervisor` e `/instructor`: valida contra
   `GET /api/v1/auth/session` (no confía en cookies que el navegador pueda editar). Un rol
   equivocado se redirige a su propio inicio con `?error=role`. En desarrollo, si el backend
   no responde, usa la cookie `user_rol` como respaldo.
4. En `/` con sesión, redirige al inicio del rol.

## Llamadas al backend

- **Proxy único** `app/api/[...path]/route.ts`: reenvía método, cabeceras, cuerpo (texto o
  binario para `multipart/form-data`) y cookies a `BACKEND_URL`; sigue a mano los 307/308
  para no perder el cuerpo y devuelve cada `Set-Cookie` por separado.
- **Cliente** `lib/api/client.ts`: clase `ApiClient` (`get/post/patch/put/delete`,
  `uploadFile`, `loginForm`) y objetos por recurso (`cursosApi`, `inscripcionesApi`,
  `progresoApi`, `quizApi`, `comentariosApi`, `supervisorApi`, `pagosApi`, …).
  - `cache: 'no-store'` en todas las peticiones.
  - Ante un **401** intenta **una** renovación (`/login/refresh-token`, compartida entre
    peticiones simultáneas) y repite la petición. Si falla, borra las cookies de rol y manda
    al login, salvo en rutas públicas.
  - Errores normalizados como `ApiError { detail, status }`.

## Sesión en el navegador

- El JWT vive en cookies **HttpOnly** que pone el backend (`access_token`, `refresh_token`);
  el JavaScript del navegador no las lee.
- `lib/auth.ts` pone además cookies legibles `user_rol` y `user_superuser` (y
  `session_persist` con "Recordarme") solo para decidir a dónde redirigir. **No dan acceso a
  nada**: el backend y `proxy.ts` validan el rol de verdad.
- `components/auth/ProfileSetupGate.tsx` envuelve toda la app y pide el nombre completo a
  los alumnos que no lo tienen (el certificado lo necesita).

## Estilos y tema

- **CSS Modules** por componente y variables CSS en `app/globals.css` (≈80 tokens de color,
  superficies, bordes y sombras). Los componentes usan `var(--color-…)`; no hay colores sueltos.
- **Tema claro/oscuro** con `data-theme` en `<html>` (`lib/theme.ts`, `ThemeToggle`).
  `globals.css` redefine los tokens bajo `[data-theme="dark"]`.
- `globals.css` importa Tailwind v4 pero el código no usa clases de Tailwind; solo aporta el
  reset base (ver [deuda técnica](deuda-tecnica-y-mejoras.md)).
- Diseño móvil: barra de pestañas inferior para el alumno, áreas táctiles de 44 px y campos
  de 16 px para evitar el zoom de iOS.

## Piezas principales

**Aula** (`components/course/`)
- `CourseVideoContent.tsx`: orquesta la lección actual, el avance automático con cuenta
  atrás (`UpNextCard`), la navegación anterior/siguiente, el paso al siguiente curso de un
  proceso y el modal de curso terminado.
- `components/video/VideoPlayer.tsx`: iframe de Bunny; se suscribe a `timeupdate` y `ended`
  por `postMessage` (protocolo player.js) al recibir `ready`, con respaldo si el aviso llega
  antes. También soporta `<video>` nativo para URLs locales.
- `LessonsSidebar.tsx` (contenido del curso), `VideoControls.tsx` (resumen, recursos,
  progreso, marcar completada), `QuizPlayer.tsx` / `QuizResult.tsx`, `LessonComments.tsx`.

**Ficha del curso y procesos**
- `CourseInfoContent.tsx`: ficha de un curso (portada, temario, reseñas, botón de acción).
- `GlobalCourseContent.tsx` + `ProcessCoursePanel.tsx`: ficha de un proceso con pestañas por
  curso, avance del proceso y "Continúa con…".
- `CourseSyllabus.tsx` + `LessonThumb.tsx`: temario con miniaturas de Bunny.

**Editor de cursos** (instructor/admin): páginas `…/cursos/crear` y `…/cursos/[id]/editar`,
`QuizBuilder.tsx`, `LessonTypeSelector.tsx`, `LessonMoveButtons.tsx`,
`video/VideoUploadButton.tsx` (subida TUS a Bunny con progreso).

**Compartidos** (`components/shared/`): `BrandLoader`, `Toast`, `BackLink`, `CourseCover`,
`AnimalAvatar` (avatar por defecto determinista), `AccessNotice`, menús de usuario.

## Utilidades de dominio (`lib/`)

| Archivo | Para qué |
|---|---|
| `progresoSync.ts` | Avance en tiempo real entre pestañas con `BroadcastChannel` (`ng-progreso`) y recarga al volver a la pestaña |
| `syllabus.ts` | Normaliza módulos y lecciones de la API al formato del temario |
| `quizData.ts`, `quizValidation.ts` | Lectura del JSON del quiz y validación de preguntas en el editor |
| `avatar.ts` | URL de la foto de perfil |
| `inputRules.ts` | Límites de captura alineados con el backend |
| `hooks/useFeatureFlags.ts` | Lee `/feature-flags` para mostrar u ocultar funcionalidad |
| `logger.ts` | Registro centralizado de errores (`logError`) |
| `theme.ts` | Preferencia de tema |

## Variables de entorno

`frontend/.env.local` (ver `frontend/.env.local.example`):

| Variable | Uso |
|---|---|
| `BACKEND_URL` | A dónde reenvían `proxy.ts`, el proxy de API y el de media (lado servidor) |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_CURRENCY` | Botón de PayPal |
| `NEXT_PUBLIC_BUNNY_LIBRARY_ID` | Biblioteca de Bunny para armar el embed |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_ENVIRONMENT`, `SENTRY_AUTH_TOKEN` | Sentry (el token solo para subir source maps en el build) |
| `ENABLE_HTTPS` | Activa HSTS y `upgrade-insecure-requests` |

`NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_PAYPAL_MODE` aparecen en el ejemplo pero el código ya
no los lee: las URLs de media son relativas (`const API_URL = ''`) y pasan por `/media`.
