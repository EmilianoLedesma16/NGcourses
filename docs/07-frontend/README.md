# 7. Frontend (Next.js)

El frontend vive en `frontend/` y es una aplicación **Next.js 16 (App Router) + React 19 + TypeScript 5**.
Estilos con **CSS Modules** (un `.module.css` junto a cada componente o página; Tailwind 4 está instalado
pero no se usa en los componentes). Validación de formularios con **Zod 4**, subida de video con
**tus-js-client**, pagos con **@paypal/react-paypal-js** y monitoreo con **@sentry/nextjs**.

```
frontend/
├── Dockerfile               # 3 etapas sobre node:24-alpine (deps → build → runner)
├── next.config.ts           # encabezados de seguridad + envoltorio de Sentry
├── sentry.{client,server,edge}.config.ts
├── public/                  # imágenes estáticas (favicon, placeholder-course.jpg, images/, resources/, videos/)
└── src/
    ├── proxy.ts             # middleware: CSP con nonce, guardias por rol, renovación de sesión
    ├── app/                 # rutas (App Router): 43 page.tsx + 2 route handlers
    ├── components/          # componentes por dominio (admin, course, video, shared, ui, ...)
    ├── lib/                 # cliente de API, sesión, utilidades, hooks
    ├── schemas/             # esquemas Zod (auth, profile, user)
    ├── types/               # tipos TS (admin, course, instructor)
    ├── constants/ui.ts      # constantes de UI (paginación, throttles, tiempos de aviso)
    └── data/                # datos de ejemplo (mocks) sin uso en producción
```

## 7.1 Cómo habla el navegador con el backend

El navegador **nunca** llama directo al backend. Todo pasa por el mismo origen del frontend, lo que permite
que las cookies HttpOnly viajen solas y evita CORS en producción.

```
Navegador ──fetch('/api/v1/...')──▶ Next.js  app/api/[...path]/route.ts ──▶ BACKEND_URL/api/v1/...
Navegador ──<img src='/media/...'>─▶ Next.js  app/media/[...path]/route.ts ─▶ BACKEND_URL/media/...
Next.js (proxy.ts) ──server-to-server──▶ BACKEND_URL/api/v1/auth/session  y  /login/refresh-token
```

### `app/api/[...path]/route.ts` (BFF)

- Exporta el mismo `handler` para `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- Reenvía todos los encabezados salvo `host`; el cuerpo se lee como `blob` si es `multipart/form-data`
  (subidas) y como texto en los demás casos.
- Usa `redirect: 'manual'` y **sigue a mano los 307/308** reinyectando el cuerpo (FastAPI redirige
  `/cursos` → `/cursos/` y Node perdería el body).
- Copia cada `Set-Cookie` por separado con `getSetCookie()` para no fusionar cookies.
- `BACKEND_URL` se lee en **tiempo de ejecución** (en Docker vale `http://backend:8000`).

### `app/media/[...path]/route.ts`

Proxy de solo lectura para lo que el backend monta como estático en `/media`: **solo** portadas
(`/media/covers`) y avatares (`/media/avatars`), con `SERVE_MEDIA=true`. Certificados y recursos **no** pasan
por aquí: se descargan por endpoints autenticados. Si el backend no responde devuelve 502.

### `lib/api/client.ts` (cliente único de la API)

- `API_URL = ''`: todas las rutas son relativas (`/api/v1/...`).
- Clase `ApiClient` con `get`, `post`, `put`, `patch`, `delete`, `loginForm` y `uploadFile`. Siempre usa
  `cache: 'no-store'` (no servir datos autenticados viejos tras una baja o revocación).
- **Renovación automática**: ante un 401 llama una sola vez a `POST /api/v1/login/refresh-token`
  (`tryRefresh` es *single-flight*: varias peticiones simultáneas comparten la misma renovación) y repite
  la petición. Si la renovación falla, borra las cookies `user_rol`/`user_superuser` y redirige a
  `/?error=session_expired`, excepto en rutas públicas (`/`, `/invitacion`, `/activar`,
  `/reset-password`, `/forgot-password`).
- Los errores se lanzan como `ApiError { detail, status }`; `detail` se formatea con
  `formatApiDetail` (`lib/inputRules.ts`) para mostrar mensajes de validación de FastAPI en español.
- `fetchConRefresh` replica la renovación para descargas y subidas que no pasan por `ApiClient`
  (recursos, certificados).

Objetos exportados (uno por dominio del backend):

| Objeto | Endpoints que envuelve |
|---|---|
| `authApi` | `login` (form OAuth2 + `remember`), `me` (`/users/me`). |
| `cursosApi` | Cursos, destacados, portada, subcursos, módulos, lecciones, recursos (`uploadRecurso`, `descargarRecurso`), `saveQuizData`. |
| `videoApi` | `initUpload`, `status`, `delete` del video de una lección. |
| `inscripcionesApi` | `mis`, `inscribirse`, `porCurso`, `porUsuario`, `cancelar`. |
| `progresoApi` | `registrar`, `curso`. |
| `quizApi` | `enviar`, `ultimoIntento`, `resultadosCurso`, `reiniciarIntentos` y lectores de la lección. |
| `calificacionesApi` / `comentariosApi` | Reseñas y votos; comentarios, respuestas y likes (con tipos `Comentario`, `OrdenComentarios`). |
| `certificadosApi` | `mis`, `verificar`, `descargar` (descarga como blob). |
| `pagosApi` | `crearOrden`, `confirmar`, `misCompras`, `cortesia`. |
| `usersApi` | Listado con filtros, CRUD admin, `updateMe`, `changePassword`, avatar. |
| `categoriasApi` / `etiquetasApi` | Catálogos y asignación de etiquetas a cursos. |
| `invitacionesApi` | `crear`, `porCurso`, `revocar`, `canjear`, `reenviar`. |
| `organizacionesApi` | Organizaciones, miembros, supervisor, licencias y listas de reparación. |
| `supervisorApi` | Todo `/supervisor/*`. |
| `solicitudesAdminApi` | `listar`, `actualizar` (admin). |
| `featureFlagsApi` | `list`, `set`. |
| `adminApi` | `stats`. |

> **Regla**: ningún componente usa `fetch` directo contra la API; siempre pasa por estos objetos. Si
> agregas un endpoint, agrega aquí su método.

## 7.2 `proxy.ts` (middleware)

Next.js 16 llama `proxy` al antiguo `middleware.ts`. Se ejecuta antes de renderizar cada página (el
`matcher` excluye `/_next/static`, `/_next/image`, `/api/*`, imágenes y las peticiones de *prefetch*).

1. **CSP con nonce**: genera un nonce por petición, arma la política con `buildCsp(nonce)` y la pone en la
   respuesta y en el encabezado de la petición (`x-nonce` y `Content-Security-Policy`) para que Next lo
   aplique a sus scripts. Por eso `app/layout.tsx` declara `export const dynamic = 'force-dynamic'`: una
   página prerenderizada no tendría nonce y `'strict-dynamic'` bloquearía sus scripts.
2. **Renovación del lado del servidor**: si la ruta es protegida, no hay `access_token` pero sí
   `refresh_token`, llama a `/login/refresh-token`, reescribe las cookies (incluidas `user_rol` y
   `user_superuser`, persistentes 30 días si `session_persist=1`) y redirige a la misma URL.
3. **Login (`/`)**: con sesión, redirige al inicio del rol (`ROL_HOME`: admin → `/admin`, supervisor →
   `/supervisor`, instructor → `/instructor`, alumno → `/cursos`).
4. **Rutas por rol** (`ROLE_ROUTES`): `/admin` exige rol `administrador` (o superusuario), `/supervisor`
   rol `supervisor`, `/instructor` rol `instructor`. El rol se valida **contra el backend**
   (`GET /api/v1/auth/session` con la cookie HttpOnly), no contra la cookie `user_rol`. Si no coincide,
   redirige al inicio de su rol con `?error=role`. En desarrollo, si el backend no responde, usa la cookie
   de rol como respaldo.
5. **Rutas que solo piden sesión** (`AUTH_ROUTES`): `/cursos`, `/curso`, `/mis-cursos`, `/certificados`,
   `/perfil`, `/pagos`. Sin `access_token` redirige a `/?error=auth`.

`next.config.ts` agrega los encabezados fijos: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy`, `Permissions-Policy` y **HSTS solo si `ENABLE_HTTPS=true`** (en HTTP rompería la carga
de recursos). También configura `images.remotePatterns` y envuelve todo con `withSentryConfig` (los
*source maps* solo se suben si hay `SENTRY_AUTH_TOKEN`).

## 7.3 Layout raíz y sesión en el cliente

- `app/layout.tsx`: idioma `es-MX`, fuentes Geist, título "NextGen Course", script inline del tema
  (`THEME_INIT_SCRIPT`, con nonce) para evitar parpadeo, y envuelve todo en `ProfileSetupGate`.
- `components/auth/ProfileSetupGate.tsx`: fuera de las rutas públicas pide `/users/me`, re-sincroniza las
  cookies de rol (`setRolCookies`) y, si un **alumno** no tiene nombre completo, muestra
  `ProfileSetupModal` (el certificado necesita un nombre real).
- `lib/auth.ts`: `login`, `logout`, `getCurrentUser` y `setRolCookies` (cookies no HttpOnly `user_rol`,
  `user_superuser`, `ng_remember`, `SameSite=Strict`). Estas cookies **solo** sirven para decidir la UI y
  las redirecciones rápidas; la autorización real siempre la hace el backend.

## 7.4 Mapa de páginas

40 de las 43 páginas son componentes de cliente (`'use client'`); las de servidor son `/` (monta
`LoginContent`), `/privacidad` y `/terminos`.

### Públicas

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/` | `app/page.tsx` → `components/auth/LoginContent.tsx` | Login con "Recordarme" y carrusel de cursos destacados (`/cursos/destacados`). |
| `/forgot-password` | `app/forgot-password/page.tsx` | Pide el correo para recuperar contraseña. |
| `/reset-password` | `app/reset-password/page.tsx` | Nueva contraseña con el token del correo. |
| `/activar` | `app/activar/page.tsx` | Activación de cuenta (token + contraseña) y solicitud de nuevo enlace. |
| `/invitacion` | `app/invitacion/page.tsx` | Canje del token de invitación a un curso. |
| `/privacidad`, `/terminos` | `components/legal/LegalPage.tsx` | Textos legales. |

### Alumno

| Ruta | Componente principal | Qué hace |
|---|---|---|
| `/cursos` | `courses/CoursesContent.tsx` | Catálogo (Dashboard): secciones "de mi organización" y NEXTGEN, filtros por categoría y nivel (`FilterDropdown`), tarjetas `CourseCard` con candado, precio o avance. |
| `/curso/[id]` | `course/CourseInfoContent.tsx` o `course/GlobalCourseContent.tsx` | Ficha del curso: temario (`CourseSyllabus`), reseñas (`CourseReviews`), botón inscribirse o pagar (`PayPalCheckout`). Si es curso global muestra la ruta de subcursos (`ProcessCoursePanel`). |
| `/curso/[id]/videos` | `course/CourseVideoContent.tsx` | El "aula": reproductor, lista de lecciones, quiz, recursos, resumen, comentarios, siguiente lección y certificado al terminar. |
| `/mis-cursos` | `my-courses/MyCoursesContent.tsx` | Mi progreso: cursos en curso y terminados con porcentaje. |
| `/certificados` | `certificates/CertificatesContent.tsx` | Certificados con miniatura y descarga PDF. |
| `/perfil` | `profile/ProfileContent.tsx`, `profile/MisCompras.tsx` | Datos personales, avatar (foto o `AnimalAvatar`), contraseña, historial de compras. |

### Administrador (`/admin`, layout `components/admin/AdminLayout.tsx`)

| Ruta | Qué hace |
|---|---|
| `/admin` | Dashboard con `dashboard/Charts.tsx` alimentado por `/admin/stats`. |
| `/admin/usuarios`, `/admin/usuarios/[id]/editar` | Listado con filtros, alta (envía activación), edición, reenviar activación. |
| `/admin/alumnos` | Alumnos, sus inscripciones y avance; dar de baja, otorgar cortesía. |
| `/admin/instructores` | Instructores (visible según el flag `instructores`). |
| `/admin/cursos` | Listado de cursos y cursos globales. |
| `/admin/cursos/crear`, `/admin/cursos/[id]/editar` | Asistente de 5 pasos: Info básica → Portada → Estructura (módulos, lecciones, video, quiz con `QuizBuilder`, recursos) → Configuración → Publicar. |
| `/admin/cursos/[id]/preview` | Vista previa del aula sin inscripción (el quiz se califica localmente). |
| `/admin/cursos/[id]/invitaciones` | Invitaciones por correo a un curso. |
| `/admin/cursos/global/[id]` | Armar un curso global: elegir subcursos y su orden. |
| `/admin/organizaciones`, `/admin/organizaciones/[id]` | Empresas, su supervisor, miembros y licencias. |
| `/admin/solicitudes` | "Revisión de cursos": cursos en estado `revision`. |
| `/admin/solicitudes-empresas` | Solicitudes de curso enviadas por supervisores. |
| `/admin/configuracion` | Feature flags (rol instructor). |
| `/admin/perfil` | Perfil del administrador. |

### Instructor (`/instructor`, layout `components/instructor/InstructorLayout.tsx`)

`/instructor` (dashboard), `/instructor/cursos` (mis cursos), `/instructor/cursos/crear` y
`/instructor/cursos/[id]/editar` (mismo asistente de 5 pasos, limitado a cursos propios; publicar manda a
revisión), `/instructor/cursos/[id]/estadisticas` (inscritos y resultados de quiz),
`/instructor/alumnos`, `/instructor/perfil`. El rol está **apagado** por defecto con el flag
`instructores`.

### Supervisor (`/supervisor`, layout `components/supervisor/SupervisorLayout.tsx`)

`/supervisor` (dashboard con las mismas gráficas que el admin, filtradas a su organización),
`/supervisor/mi-organizacion`, `/supervisor/cursos` (cursos licenciados, lectura completa),
`/supervisor/usuarios` (avance de su gente, quitar usuarios), `/supervisor/invitaciones`,
`/supervisor/solicitudes` (pedir cursos nuevos).

## 7.5 Componentes

| Carpeta | Componentes | Notas |
|---|---|---|
| `admin/` | `AdminHeader`, `AdminLayout`, `AdminSidebar`, `PageHeader`, `Panel.module.css` | El sidebar define el menú del admin. |
| `auth/` | `AuthFields`, `AuthShell`, `LoginContent`, `ProfileSetupGate`, `ProfileSetupModal` | Pantallas de acceso. |
| `course/` | `CourseCard`, `CourseInfoContent`, `CourseReviews`, `CourseSyllabus`, `CourseVideoContent` (639 líneas), `GlobalCourseContent`, `LessonComments`, `LessonMoveButtons`, `LessonThumb`, `LessonTypeSelector`, `LessonsSidebar`, `PayPalCheckout`, `ProcessCoursePanel`, `QuizBuilder`, `QuizPlayer`, `QuizResult`, `UpNextCard`, `VideoControls` | Todo lo del curso, del editor y del aula. |
| `video/` | `VideoPlayer`, `VideoUploadButton` | Bunny Stream. |
| `courses/`, `my-courses/`, `certificates/`, `profile/` | Contenido de las páginas del alumno. | |
| `dashboard/` | `Charts`, `Dashboard.module.css` | Gráficas SVG propias (sin librería). |
| `instructor/`, `supervisor/` | `Header`, `Layout`, `Sidebar` de cada panel. | |
| `shared/` | `AccessNotice`, `AnimalAvatar`, `BackLink`, `BrandLoader`, `CourseCover`, `StudentHeader`, `StudentUserMenu`, `ThemeToggle`, `Toast` | Reutilizables entre roles. |
| `ui/` | `Badge`, `Button`, `Card`, `Input`, `Select` | Primitivas visuales. |
| `legal/` | `LegalPage` | Plantilla de términos y privacidad. |
| raíz | `ErrorBoundary` | Captura errores de render (lo usa el aula `/curso/[id]/videos`) y los registra con `logError`. |

### El aula: `CourseVideoContent.tsx`

- Recibe el curso ya transformado (`Course` de `types/course.ts`), la inscripción, la lección inicial y el
  curso global al que pertenece (`ProcesoDelCurso`) para ofrecer "siguiente curso".
- **Progreso de video**: `handleTimeUpdate` recibe el tiempo del reproductor y, con *throttle* de 10 s
  (`PROGRESS_THROTTLE_MS`), envía `progresoApi.registrar({inscripcion_id, leccion_id, visto_seg,
  progreso_pct})`. Si no conoce la duración envía 0 % (antes cualquier reproducción contaba como 100 %).
  Al cruzar `umbralPct` (90 % por defecto) marca la palomita sin esperar al final.
- Lecciones de lectura se completan con el botón "Marcar como completada"; los quiz con `QuizPlayer`.
- Al completar la última lección abre el modal final y ofrece descargar el certificado.
- **Tiempo real entre pestañas**: `avisarLeccionCompletada` publica en el `BroadcastChannel`
  `ng-progreso` y `useProgresoEnVivo` escucha (y vuelve a pedir el avance al recuperar el foco).

### Video: `VideoPlayer.tsx` y `VideoUploadButton.tsx`

- `VideoPlayer` incrusta el iframe de Bunny (`iframe.mediadelivery.net/embed/{library}/{video}`) y escucha
  los eventos `timeupdate` y `ended` de **player.js** vía `postMessage`. La biblioteca sale del curso o de
  `NEXT_PUBLIC_BUNNY_LIBRARY_ID`.
- `VideoUploadButton` llama `videoApi.initUpload`, sube el archivo **directo a Bunny** con
  `tus-js-client` usando los encabezados firmados que devuelve el backend, muestra el avance y luego hace
  *polling* de `videoApi.status` hasta que el video queda listo.

### Quiz: `QuizBuilder`, `QuizPlayer`, `QuizResult`

- `QuizBuilder` edita preguntas `multiple_choice` y `true_false`; `lib/quizValidation.ts` impide guardar o
  publicar preguntas sin enunciado o sin respuesta correcta (mismo criterio que el backend).
- `lib/quizData.ts` (`normalizeQuizData`) acepta el JSON en string u objeto y lo normaliza.
- `QuizPlayer` envía las respuestas a `quizApi.enviar`; la calificación siempre la hace el servidor.
  `QuizResult` muestra aciertos, intentos restantes (máx. 3) y si aprobó (≥ 60 %).

## 7.6 Utilidades (`lib/`)

| Archivo | Para qué |
|---|---|
| `auth.ts` | Login/logout, `getCurrentUser`, cookies de rol. |
| `avatar.ts` | `avatarOf(user)` (URL del servidor; limpia la copia vieja de `localStorage`), `AVATAR_MAX_BYTES` (2 MB), tipos aceptados. |
| `inputRules.ts` | Reglas de captura (longitudes, caracteres) y `formatApiDetail`. |
| `logger.ts` | `logError(contexto, error)` y `logWarn`: escriben en consola solo en desarrollo. Conectarlo a Sentry en producción está pendiente (marcado `TECH DEBT` en el archivo). |
| `progresoSync.ts` | Canal `ng-progreso` entre pestañas. |
| `quizData.ts`, `quizValidation.ts` | Formato y validación del quiz. |
| `syllabus.ts` | `toSyllabus`: convierte módulos/lecciones de la API al temario de la ficha. |
| `theme.ts` | Tema claro/oscuro guardado en `localStorage` (`ng-theme`) y `THEME_INIT_SCRIPT`. |
| `hooks/useFeatureFlags.ts` | Carga `/feature-flags` y expone `{ flags, loading, refetch }`. |

`schemas/` contiene los esquemas Zod de login, perfil y usuario; `types/` los tipos compartidos;
`constants/ui.ts` los valores mágicos de UI (`ITEMS_PER_PAGE = 10`, `PROGRESS_THROTTLE_MS = 10_000`,
tiempos del indicador "Guardado"). `data/courses.ts` y `data/instructor.ts` son datos de ejemplo del
prototipo y **no los importa ninguna página**.

## 7.7 Variables de entorno del frontend

| Variable | Cuándo se lee | Uso |
|---|---|---|
| `BACKEND_URL` | Ejecución (servidor) | Destino de los proxies `/api` y `/media` y de `proxy.ts`. Docker: `http://backend:8000`. |
| `ENABLE_HTTPS` | Ejecución | Activa HSTS y `upgrade-insecure-requests` en la CSP. |
| `NEXT_PUBLIC_API_URL` | Build | Argumento de build del Dockerfile (el cliente usa rutas relativas). |
| `NEXT_PUBLIC_BUNNY_LIBRARY_ID` | Build | Biblioteca por defecto del reproductor. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_MODE` (sandbox), `NEXT_PUBLIC_PAYPAL_CURRENCY` (MXN) | Build | SDK de PayPal en `PayPalCheckout.tsx`. |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_ENVIRONMENT` | Build | Sentry del navegador. |
| `SENTRY_AUTH_TOKEN` | Build | Subir *source maps* (opcional). |

> Las `NEXT_PUBLIC_*` se **incrustan en el build**: si cambian, hay que reconstruir la imagen.

## 7.8 Comandos

```bash
cd frontend
npm install          # Node >= 24 (raíz: .npmrc con ignore-scripts=true, save-exact=true)
npm run dev          # http://localhost:3000 (necesita el backend en BACKEND_URL)
npm run build        # build de producción
npx tsc --noEmit     # chequeo de tipos (lo corre el CI)
npm run lint         # eslint
```

## 7.9 Receta: agregar una pantalla

1. Crear `src/app/<ruta>/page.tsx` con `'use client'` si usa estado o efectos.
2. Si es de un rol, colgarla bajo `/admin`, `/instructor` o `/supervisor` (la guardia de `proxy.ts` aplica
   sola) y agregar la entrada al sidebar correspondiente. Si solo pide sesión y es una ruta nueva de primer
   nivel, agregarla a `AUTH_ROUTES` en `proxy.ts` y a `privatePrefixes` en `client.ts`.
3. Llamar a la API solo mediante los objetos de `lib/api/client.ts`.
4. Estilos en un `page.module.css` hermano; reutilizar `components/ui` y `components/shared`.
5. Errores con `logError` y avisos con `Toast`.
