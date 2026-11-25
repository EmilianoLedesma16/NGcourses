# Deuda técnica y áreas de mejora

Hallazgos de la revisión completa del código del 2026-11-25, ordenados por prioridad. Los
problemas puntuales ya registrados siguen en [pendientes técnicos](pendientes-tecnicos.md) y
el plan por fases en [plan de mantenimiento](plan-mantenimiento.md); aquí se enlazan en
lugar de repetirse.

## Alta

### Pruebas del backend
- La suite de pytest está parcialmente rota y en CI corre como informativa
  ([pendientes #1](pendientes-tecnicos.md)). Mientras no se arregle, **no hay red de
  seguridad automática para el backend**: un cambio en `crud.py` solo se valida a mano.
- `tests/conftest.py` borra todos los usuarios al terminar ([pendientes #2](pendientes-tecnicos.md)).
  Mejora sugerida: que el fixture aborte si `POSTGRES_DB` no termina en `_test`.

### Peso del repositorio
La limpieza quitó ~173 MB de videos de ejemplo de `frontend/public/videos`, pero **siguen en
el historial de git**: cada `git clone` los descarga. Quitarlos de verdad requiere reescribir
el historial (`git filter-repo`) y que todos vuelvan a clonar; solo vale la pena si el tamaño
del clon se vuelve un problema.

### Bloqueo del cuestionario tras 3 intentos
El flujo funciona, pero tiene huecos de producto y de datos:
1. El admin no ve quién está bloqueado: la pestaña Quiz de `/admin/alumnos` muestra solo el
   último intento, sin indicador "3/3" ni filtro.
2. "Reiniciar intentos" aparece también en filas **aprobadas**: reiniciar borra los intentos
   **y el progreso** de la lección y regresa un curso terminado a `activa`.
3. El alumno bloqueado no tiene cómo pedir ayuda desde la interfaz, y el supervisor no puede
   reiniciar.
4. Reiniciar borra el historial de intentos (no queda rastro de auditoría).
5. No se avisa "este es tu último intento" antes de empezar.

## Media

### Tamaño y responsabilidades del código
| Archivo | Líneas | Qué conviene |
|---|---|---|
| `backend/app/crud.py` | ≈2 270 (121 funciones) | Separar por dominio (`crud/cursos.py`, `crud/acceso.py`, `crud/organizaciones.py`, …) manteniendo `from app import crud` como fachada |
| `backend/app/api/routes/cursos.py` | ≈1 600 | Separar módulos/lecciones, video, recursos e invitaciones en routers propios |
| `frontend/src/app/admin/alumnos/page.tsx` | ≈750 | Extraer las pestañas a componentes |
| `frontend/src/components/course/CourseVideoContent.tsx` | ≈640 | Extraer la navegación y el avance automático a hooks |

La lógica de acceso (licencias, procesos, inscripción, contenido) está repartida entre
`crud.py`, `inscripciones.py`, `cursos.py` y `comentarios.py`. Centralizarla en un módulo de
"políticas de acceso" reduciría el riesgo de que dos pantallas apliquen reglas distintas.

### Borrados en cascada manuales
Los borrados de usuario, organización, módulo y lección limpian dependientes a mano en
`crud.py`. Una tabla nueva que apunte a esas entidades rompe el borrado si nadie la agrega
ahí. Mejora: declarar `ON DELETE CASCADE` (o `SET NULL`) en las llaves foráneas con una
migración y simplificar esas funciones.

### Código y tablas sin uso que requieren migración
No se borraron en la limpieza porque implican cambiar la base de datos:
- `item` y su router `/items` (y `tests/api/routes/test_items.py`): restos de la plantilla de
  FastAPI.
- `notificaciones`, `eventos_sistema`, `eventos_analytics`: definidas pero nadie escribe en
  ellas. O se implementan (auditoría de acciones de admin, analítica de reproducción) o se
  eliminan.
- Rol `usuario_control`: heredado, sin uso.
- API sin interfaz: etiquetas (`/etiquetas`, `curso_etiquetas`), votos de reseñas
  (`/calificaciones/{id}/votar`), cortesía de pagos (`/pagos/admin/cortesia`) y verificación
  pública de certificados (`/certificados/verificar/{folio}`). Decidir si se construye la
  pantalla o se retira el endpoint.

### Seguridad
- **URL HLS de Bunny pública**: quien tenga la URL del video lo ve sin sesión
  ([pendientes #6](pendientes-tecnicos.md)). Solución: activar la autenticación por token de
  Bunny (embed firmado con vencimiento) y firmar la URL en el backend al entregar la lección.
- Cuentas pendientes con token de activación anterior al 2026-11-17 guardado sin hash
  ([pendientes #3](pendientes-tecnicos.md)).
- `next.config.ts` tiene en `allowedDevOrigins` una IP privada fija; conviene moverla a una
  variable de entorno.

### Calidad estática
- `ruff check app` reporta 83 avisos ya existentes: 35 argumentos sin uso (muchos son
  dependencias de FastAPI que solo sirven de guardia), 23 imports fuera de lugar, 16 imports
  desordenados (autocorregibles), 7 nombres ambiguos.
- `eslint src` marca 7 errores ya existentes: 4 de `react-hooks/set-state-in-effect`
  (`setState` síncrono dentro de un efecto, p. ej. en `components/video/VideoPlayer.tsx`) y 3
  de `no-explicit-any`. CI no corre `eslint`, solo `tsc` y el build.
- 28 usos de `datetime.utcnow()`, obsoleto desde Python 3.12; migrar a
  `datetime.now(timezone.utc)` con cuidado (hoy se mezclan fechas con y sin zona horaria).

### Versión de Python sin fijar
`pyproject.toml` declara `requires-python = ">=3.10,<4.0"`, pero el código solo funciona con
3.12 (la del Dockerfile y CI): con 3.14 falla al cargar los modelos. Conviene fijar
`requires-python = ">=3.12,<3.13"` o agregar `.python-version`, y revisar la compatibilidad
antes de subir de versión.

### Licencia del repositorio
`LICENSE` es la licencia MIT de la plantilla original de FastAPI, con el copyright de su
autor. Si el producto no es de código abierto, hay que reemplazarla por la licencia que
corresponda (decisión del dueño del producto, no técnica).

## Baja

- **Tailwind**: `globals.css` hace `@import "tailwindcss"` pero no se usa ninguna clase; solo
  aporta el reset base. Se puede reemplazar por un reset propio y quitar `tailwindcss` y
  `@tailwindcss/postcss`; requiere revisar visualmente todas las pantallas.
- **Variables de entorno huérfanas**: `BUNNY_TOKEN_KEY` (backend), `NEXT_PUBLIC_API_URL` y
  `NEXT_PUBLIC_PAYPAL_MODE` (frontend) siguen en los ejemplos pero el código no las lee.
- **Plantillas de correo**: `activacion_cuenta.html` e `invitation_course.html` solo existen en
  `email-templates/build`, sin su fuente MJML en `src`. Editarlas obliga a tocar el HTML
  generado.
- **`docker-compose.yml` base** conserva convenciones de la plantilla (`DOCKER_IMAGE_*`,
  host `dashboard.${DOMAIN}`); en la práctica solo se usa en local junto con el override.
  Producción usa `docker-compose.prod.yml`.
- **Miniaturas en local**: Bunny bloquea por Referer los dominios no permitidos; documentado
  en [desarrollo local](desarrollo-local-y-pruebas.md).
- **Comentario desactualizado** en `next.config.ts`: menciona `src/middleware.ts`, que en
  Next 16 es `src/proxy.ts`.
- El aula no refleja la lección actual en la URL (`?leccion=`) al avanzar, así que recargar
  regresa a la lección inicial.

## Hecho en la limpieza del 2026-11-25

Para referencia de qué se quitó y por qué (todo verificado sin referencias en el código):

- Frontend: componentes `ui/*` (Badge, Button, Card, Input, Select), `FilterDropdown`,
  `constants/ui.ts`, datos de ejemplo `data/courses.ts` y `data/instructor.ts`,
  `types/instructor.ts`.
- `frontend/public`: videos y recursos del curso demo de Excel (~176 MB), imágenes de cursos
  de ejemplo y los SVG de `create-next-app`.
- Cliente de API: 15 métodos que ninguna pantalla llamaba.
- Backend: 7 imports sin uso.
- Raíz: `copier.yml`, `hooks/`, `img/`, `.DS_Store`, scripts de la plantilla para Docker Swarm
  (`build.sh`, `build-push.sh`, `deploy.sh`, `test-local.sh`), `generate-client.sh` (apuntaba
  a un script que ya no existe) y `deploy-frontend.sh` (flujo de ECR obsoleto).
- Documentación: todo se movió a `docs/`; se eliminaron los README de plantilla del frontend,
  `PROYECTO.md` (desactualizado) y `PRE-DEPLOY.html` (copia del `.md`).
