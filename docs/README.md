# Documentación técnica de NextGen Course

Documentación del sistema a nivel de arquitectura y código. Describe lo que hay en
`main`; si cambias algo que aquí se describe, actualiza el documento en el mismo PR.

## Por dónde empezar

| Documento | Qué cubre |
|---|---|
| [Arquitectura](arquitectura.md) | Componentes del sistema, cómo viaja una petición, integraciones externas y despliegue a alto nivel |
| [Backend](backend.md) | FastAPI: estructura, configuración, capa de datos, catálogo de endpoints, servicios y migraciones |
| [Modelo de datos](modelo-de-datos.md) | Tablas, relaciones, enums y reglas que viven en la base de datos |
| [Frontend](frontend.md) | Next.js: rutas por rol, `proxy.ts`, proxy de API, sesión, estilos y componentes principales |
| [Funcionalidades](funcionalidades.md) | Cómo funciona cada flujo de negocio por dentro: acceso a cursos, video, progreso, quiz, certificados, pagos, invitaciones… |
| [Seguridad](seguridad.md) | Autenticación, cookies, roles, CSP, rate limit, secretos y manejo de archivos |
| [Roles y permisos](roles-y-permisos.md) | Referencia completa de los cuatro roles: datos, pantallas y endpoints |
| [Desarrollo local y pruebas](desarrollo-local-y-pruebas.md) | Levantar el proyecto, migraciones, pruebas, scripts y herramientas |
| [Deploy](deploy.md) | Producción en EC2 con Traefik y el workflow de GitHub Actions |
| [Deuda técnica y mejoras](deuda-tecnica-y-mejoras.md) | Complejidades conocidas y áreas de mejora detectadas, por prioridad |

## Documentos de trabajo

- [Pendientes técnicos](pendientes-tecnicos.md): lista viva de problemas concretos.
- [Plan de mantenimiento](plan-mantenimiento.md): fases de mantenimiento posteriores a producción.
- [`registros/`](registros/): bitácora de operaciones hechas a mano en producción.
- [`historico/`](historico/): documentos de entregas anteriores (pre-deploy, reporte de
  seguridad, documentación en PDF). Se conservan como referencia; pueden estar desactualizados.

## Convenciones del repositorio

- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) en español:
  `fix(aula): …`, `feat(perfil): …`, `chore(backend): …`, `docs: …`.
- Una rama por cambio (`fix/…`, `feat/…`, `chore/…`) y PR hacia `main`.
- Todo push a `main` que toque `frontend/`, `backend/` o los compose de producción
  **despliega a producción** (ver [Deploy](deploy.md)).
