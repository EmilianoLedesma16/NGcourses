import hashlib
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import EmailStr
from sqlmodel import SQLModel, select

from app import crud
from app.api.deps import SessionDep, SupervisorOrAbove
from app.api.routes.admin_stats import Embudo, Semana, resumen_avance
from app.core.config import settings
from app.core.security import get_password_hash
from app.models import User, UserCreate
from app.models._enums import (
    EstadoCurso,
    EstadoInscripcion,
    EstadoLicencia,
    RolOrganizacion,
    RolUsuario,
)
from app.models._validators import Telefono, Texto255
from app.models.organizacion import LicenciaCurso, SolicitudCurso, UsuarioOrganizacion
from app.utils import email_formato_valido, generate_activacion_email, send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/supervisor", tags=["supervisor"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class MiOrganizacionPublic(SQLModel):
    id: uuid.UUID
    nombre: str
    email_contacto: str | None = None
    telefono_contacto: str | None = None
    plan_de_cursos: str | None = None
    fecha_compra: datetime | None = None
    estado: str


class UsuarioOrgPublic(SQLModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    telefono: str | None
    is_active: bool
    # Estado real de la cuenta: 'activo' | 'suspendido' | 'pendiente_activacion'.
    # Permite distinguir "Pendiente de activación" de "Suspendido" (antes el front
    # solo veía is_active=False y mostraba a los pendientes como suspendidos).
    estado: str
    rol_org: str
    progreso_promedio: float
    cursos_inscritos: int


class CrearUsuarioBody(SQLModel):
    """Alta de un alumno por el supervisor. SIN contraseña: la cuenta nace
    pendiente y el alumno crea la suya con el enlace de activación."""
    email: EmailStr
    full_name: Texto255 = None
    telefono: Telefono = None


class CursoOrgPublic(SQLModel):
    id: uuid.UUID
    titulo: str
    descripcion: str | None
    portada_url: str | None
    marca: str


class InvitarBody(SQLModel):
    curso_id: uuid.UUID
    emails: list[str]


class InvitacionEnvioResultado(SQLModel):
    email: str
    estado: str
    detalle: str | None = None


class InvitacionSupervisorPublic(SQLModel):
    id: uuid.UUID
    curso_id: uuid.UUID
    curso_titulo: str
    email: str
    expira_en: datetime
    usado_en: datetime | None
    creado_en: datetime
    estado: str


class StatsPublic(SQLModel):
    usuarios_totales: int
    usuarios_activos: int
    progreso_promedio: float
    cursos_disponibles: int
    inscripciones_totales: int


class SolicitudCreate(SQLModel):
    titulo_solicitud: str
    descripcion: str | None = None


class ComentarioPublic(SQLModel):
    comentario: str
    creado_en: datetime


class SolicitudPublic(SQLModel):
    id: uuid.UUID
    titulo_solicitud: str
    descripcion: str | None
    estado: str
    creado_en: datetime
    actualizado_en: datetime | None = None
    # Mensajes del admin (NextGen) dirigidos al supervisor sobre esta solicitud.
    comentarios: list[ComentarioPublic] = []


# ── Helpers ──────────────────────────────────────────────────────────────────


def _get_user_org(session, user_id: uuid.UUID):
    info = crud.get_organizacion_of_user(session=session, user_id=user_id)
    if not info:
        raise HTTPException(
            status_code=404,
            detail="No perteneces a ninguna organización",
        )
    return info  # (org, rol_org)


def _estado_invitacion(inv: Any) -> str:
    if inv.usado_en is not None:
        return "usada"
    if inv.expira_en < datetime.utcnow():
        return "expirada"
    return "pendiente"


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/mi-organizacion", response_model=MiOrganizacionPublic)
def mi_organizacion(
    *, session: SessionDep, current_user: SupervisorOrAbove,
) -> Any:
    org, _rol = _get_user_org(session, current_user.id)
    return MiOrganizacionPublic(
        id=org.id,
        nombre=org.nombre,
        email_contacto=org.email_contacto,
        telefono_contacto=org.telefono_contacto,
        plan_de_cursos=org.plan_de_cursos,
        fecha_compra=org.fecha_compra,
        estado=org.estado.value if hasattr(org.estado, "value") else str(org.estado),
    )


@router.get("/cursos", response_model=list[CursoOrgPublic])
def cursos_de_mi_org(
    *, session: SessionDep, current_user: SupervisorOrAbove,
) -> Any:
    org, _rol = _get_user_org(session, current_user.id)
    # Solo licencias que hoy dan acceso (fechas, cupo, curso publicado): mismo
    # criterio que la tarjeta "Cursos asignados" y que el catálogo del alumno.
    licencias = crud.licencias_vigentes_org(session=session, org_id=org.id)
    result: list[CursoOrgPublic] = []
    for lic in licencias:
        curso = crud.get_curso(session=session, curso_id=lic.curso_id)
        if not curso:
            continue
        result.append(CursoOrgPublic(
            id=curso.id, titulo=curso.titulo,
            descripcion=curso.descripcion, portada_url=curso.portada_url,
            marca=curso.marca.value if hasattr(curso.marca, "value") else str(curso.marca),
        ))
    return result


@router.get("/usuarios", response_model=list[UsuarioOrgPublic])
def usuarios_de_mi_org(
    *, session: SessionDep, current_user: SupervisorOrAbove,
) -> Any:
    org, _rol = _get_user_org(session, current_user.id)
    rows = crud.list_org_users(session=session, org_id=org.id)
    result: list[UsuarioOrgPublic] = []
    # Inscripciones vigentes en cursos de la org (crud.inscripciones_org), y su %
    # de avance con el mismo criterio que ve el alumno en su curso. Antes se
    # promediaban las filas de progreso por lección (≈100 % con una sola lección
    # vista) y solo se contaban las inscripciones activas.
    vigentes = crud.inscripciones_org(session=session, org_id=org.id)
    avance = crud.avance_por_inscripcion(session=session, inscripciones=vigentes)
    for (u, r) in rows:
        inscripciones = [i for i in vigentes if i.usuario_id == u.id]
        prom = (
            round(sum(avance[i.id] for i in inscripciones) / len(inscripciones), 2)
            if inscripciones else 0.0
        )
        result.append(UsuarioOrgPublic(
            id=u.id, email=u.email, full_name=u.full_name, telefono=u.telefono,
            is_active=u.is_active,
            estado=u.estado.value if hasattr(u.estado, "value") else str(u.estado),
            rol_org=r.value if hasattr(r, "value") else str(r),
            progreso_promedio=prom, cursos_inscritos=len(inscripciones),
        ))
    return result


@router.post("/usuarios", response_model=UsuarioOrgPublic, status_code=201)
def crear_usuario(
    *, session: SessionDep, current_user: SupervisorOrAbove, body: CrearUsuarioBody,
) -> Any:
    """Alta directa de un usuario miembro de la organización del supervisor."""
    org, _rol = _get_user_org(session, current_user.id)

    existing = crud.get_user_by_email(session=session, email=body.email)
    if existing:
        # Si existe y no es de esta org, lo agregamos. Si ya pertenece a otra, error.
        actual = crud.get_organizacion_of_user(session=session, user_id=existing.id)
        if actual and actual[0].id != org.id:
            raise HTTPException(
                status_code=409,
                detail="El usuario ya pertenece a otra organización",
            )
        user = existing
    else:
        user, _creado, token = crud.get_or_create_user_by_email(
            session=session, email=body.email
        )
        if body.full_name or body.telefono:
            user.full_name = body.full_name or user.full_name
            user.telefono = body.telefono or user.telefono
            session.add(user)
            session.commit()
            session.refresh(user)
        if token and settings.emails_enabled:
            email_data = generate_activacion_email(email_to=user.email, token=token)
            send_email(
                email_to=user.email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )

    crud.add_user_to_organizacion(
        session=session, org_id=org.id, user_id=user.id,
        rol_org=RolOrganizacion.MIEMBRO,
    )
    return UsuarioOrgPublic(
        id=user.id, email=user.email, full_name=user.full_name, telefono=user.telefono,
        is_active=user.is_active,
        estado=user.estado.value if hasattr(user.estado, "value") else str(user.estado),
        rol_org=RolOrganizacion.MIEMBRO.value,
        progreso_promedio=0.0, cursos_inscritos=0,
    )


@router.delete("/usuarios/{user_id}", status_code=204)
def quitar_usuario(
    *, user_id: uuid.UUID, session: SessionDep, current_user: SupervisorOrAbove,
) -> None:
    if user_id == current_user.id:
        raise HTTPException(
            status_code=403,
            detail="No puedes quitarte a ti mismo de la organización.",
        )
    org, _rol = _get_user_org(session, current_user.id)
    crud.remove_user_from_organizacion(
        session=session, org_id=org.id, user_id=user_id
    )


@router.post("/invitaciones", response_model=list[InvitacionEnvioResultado], status_code=201)
def invitar(
    *, session: SessionDep, current_user: SupervisorOrAbove, body: InvitarBody,
) -> Any:
    """Envía invitaciones a un curso de la organización. El usuario que canjee
    quedará automáticamente vinculado a la organización del supervisor."""
    org, _rol = _get_user_org(session, current_user.id)

    # Validar que el curso pertenezca a la org (vía licencia) o sea NEXTGEN.
    curso = crud.get_curso(session=session, curso_id=body.curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")

    # Solo se puede invitar a cursos PUBLICADOS (mismo criterio que el panel de
    # admin). Cubre el caso de un curso licenciado a la org y luego despublicado.
    if curso.estado != EstadoCurso.PUBLICADO:
        raise HTTPException(
            status_code=409,
            detail="Solo puedes enviar invitaciones de cursos publicados.",
        )

    # Un curso dentro de un curso global queda cubierto por la licencia del global.
    cubiertos = {body.curso_id} | ({curso.curso_padre_id} if curso.curso_padre_id else set())
    licencia = session.exec(
        select(LicenciaCurso).where(
            LicenciaCurso.organizacion_id == org.id,
            LicenciaCurso.curso_id.in_(cubiertos),  # type: ignore[attr-defined]
            LicenciaCurso.estado == EstadoLicencia.ACTIVA,
        )
    ).first()
    if not licencia and str(getattr(curso.marca, "value", curso.marca)) != "nextgen":
        raise HTTPException(
            status_code=403,
            detail="Tu organización no tiene licencia activa para este curso",
        )

    resultados: list[InvitacionEnvioResultado] = []
    for email in body.emails:
        email = email.strip().lower()
        if not email:
            continue
        # CP29: validar el formato del correo ANTES de crear la invitación. Un
        # correo inválido se reporta y NO se marca como enviada.
        if not email_formato_valido(email):
            resultados.append(InvitacionEnvioResultado(
                email=email, estado="invalido",
                detalle="Correo con formato inválido",
            ))
            continue
        try:
            existing_user = crud.get_user_by_email(session=session, email=email)
            if existing_user:
                insc = crud.get_inscripcion_by_usuario_curso(
                    session=session, usuario_id=existing_user.id, curso_id=body.curso_id,
                )
                # Bloquea invitar a quien ya tiene el curso (cursando o completado).
                # CANCELADO sí se permite: es el reingreso de un alumno dado de baja.
                if insc and insc.estado in (EstadoInscripcion.ACTIVA, EstadoInscripcion.FINALIZADA):
                    resultados.append(InvitacionEnvioResultado(
                        email=email, estado="ya_inscrito",
                        detalle=(
                            "El usuario ya completó este curso"
                            if insc.estado == EstadoInscripcion.FINALIZADA
                            else "El usuario ya está inscrito en este curso"
                        ),
                    ))
                    continue

            db_inv, raw_token = crud.create_invitacion(
                session=session, curso_id=body.curso_id, email=email,
                creado_por_id=current_user.id,
            )

            if settings.emails_enabled:
                from app.utils import generate_invitation_email, send_email
                email_data = generate_invitation_email(
                    email_to=email, curso_titulo=curso.titulo,
                    token=raw_token, password_temporal=None,
                )
                send_email(
                    email_to=email, subject=email_data.subject,
                    html_content=email_data.html_content,
                )

            resultados.append(InvitacionEnvioResultado(email=email, estado="enviada"))
        except Exception as exc:
            logger.error("Error al invitar %s: %s", email, exc)
            resultados.append(InvitacionEnvioResultado(
                email=email, estado="error", detalle=str(exc)
            ))
    return resultados


@router.get("/invitaciones", response_model=list[InvitacionSupervisorPublic])
def listar_invitaciones(
    *, session: SessionDep, current_user: SupervisorOrAbove,
) -> Any:
    """Lista invitaciones enviadas por este supervisor, acotadas a los cursos
    actualmente licenciados a su organización (no las de cursos ajenos/sin licencia)."""
    org, _rol = _get_user_org(session, current_user.id)
    from app.models.invitacion import InvitacionCurso

    licencias = crud.list_licencias_by_org(session=session, org_id=org.id)
    curso_ids_org = crud.expandir_con_subcursos(session=session, curso_ids={
        lic.curso_id for lic in licencias if lic.estado == EstadoLicencia.ACTIVA
    })

    invs = list(session.exec(
        select(InvitacionCurso).where(
            InvitacionCurso.creado_por == current_user.id
        ).order_by(InvitacionCurso.creado_en.desc())  # type: ignore[arg-type]
    ).all())
    invs = [inv for inv in invs if inv.curso_id in curso_ids_org]
    result: list[InvitacionSupervisorPublic] = []
    for inv in invs:
        curso = crud.get_curso(session=session, curso_id=inv.curso_id)
        result.append(InvitacionSupervisorPublic(
            id=inv.id, curso_id=inv.curso_id,
            curso_titulo=curso.titulo if curso else "",
            email=inv.email, expira_en=inv.expira_en, usado_en=inv.usado_en,
            creado_en=inv.creado_en, estado=_estado_invitacion(inv),
        ))
    return result


@router.post("/invitaciones/{invitacion_id}/reenviar", response_model=InvitacionEnvioResultado)
def reenviar_invitacion_supervisor(
    *, invitacion_id: uuid.UUID, session: SessionDep, current_user: SupervisorOrAbove,
) -> Any:
    """Reenvía el email de una invitación creada por este supervisor. Genera un
    nuevo token. No permite reenviar invitaciones ya usadas."""
    inv = crud.get_invitacion_by_id(session=session, invitacion_id=invitacion_id)
    if not inv or inv.creado_por != current_user.id:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    if inv.usado_en is not None:
        raise HTTPException(
            status_code=409, detail="No se puede reenviar una invitación ya utilizada"
        )

    curso = crud.get_curso(session=session, curso_id=inv.curso_id)
    curso_titulo = curso.titulo if curso else ""

    inv, raw_token = crud.reenviar_invitacion(session=session, invitacion_id=invitacion_id)

    if settings.emails_enabled:
        from app.utils import generate_invitation_email, send_email
        email_data = generate_invitation_email(
            email_to=inv.email, curso_titulo=curso_titulo,
            token=raw_token, password_temporal=None,
        )
        send_email(
            email_to=inv.email, subject=email_data.subject,
            html_content=email_data.html_content,
        )

    return InvitacionEnvioResultado(email=inv.email, estado="enviada")


@router.delete("/invitaciones/{invitacion_id}", status_code=204)
def revocar_invitacion_supervisor(
    *, invitacion_id: uuid.UUID, session: SessionDep, current_user: SupervisorOrAbove,
) -> None:
    """Revoca una invitación pendiente creada por este supervisor."""
    inv = crud.get_invitacion_by_id(session=session, invitacion_id=invitacion_id)
    if not inv or inv.creado_por != current_user.id:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    if inv.usado_en is not None:
        raise HTTPException(
            status_code=409, detail="No se puede revocar una invitación ya utilizada"
        )
    crud.delete_invitacion(session=session, invitacion_id=invitacion_id)


@router.get("/stats", response_model=StatsPublic)
def stats(
    *, session: SessionDep, current_user: SupervisorOrAbove,
) -> Any:
    org, _rol = _get_user_org(session, current_user.id)
    data = crud.get_org_stats(session=session, org_id=org.id)
    return StatsPublic(**data)


class CursoAvance(SQLModel):
    id: uuid.UUID
    titulo: str
    inscritos: int
    terminaron: int
    avance_promedio: float


class AlumnoAvance(SQLModel):
    id: uuid.UUID
    nombre: str
    cursos: int
    terminados: int
    avance_promedio: float


class SupervisorDashboard(SQLModel):
    embudo: Embudo
    semanas: list[Semana]
    cursos: list[CursoAvance]
    alumnos: list[AlumnoAvance]
    alumnos_sin_inscripcion: int


@router.get("/dashboard", response_model=SupervisorDashboard)
def dashboard(
    *, session: SessionDep, current_user: SupervisorOrAbove,
) -> Any:
    """Gráficas del panel del supervisor, con el mismo cálculo que el panel
    admin pero acotado a los alumnos de su org en los cursos que la org licencia."""
    org, _rol = _get_user_org(session, current_user.id)
    inscripciones = crud.inscripciones_org(session=session, org_id=org.id)
    embudo, semanas, avance = resumen_avance(session=session, inscripciones=inscripciones)

    def _fin(i: Any) -> bool:
        return i.estado == EstadoInscripcion.FINALIZADA

    # Avance por curso (un curso global se desglosa en sus cursos, que es donde
    # vive la inscripción).
    por_curso: dict[uuid.UUID, list[Any]] = {}
    for i in inscripciones:
        por_curso.setdefault(i.curso_id, []).append(i)
    cursos = []
    for cid, lst in por_curso.items():
        c = crud.get_curso(session=session, curso_id=cid)
        cursos.append(CursoAvance(
            id=cid, titulo=c.titulo if c else "Curso", inscritos=len(lst),
            terminaron=sum(1 for i in lst if _fin(i)),
            avance_promedio=round(sum(avance[i.id] for i in lst) / len(lst), 1),
        ))
    cursos.sort(key=lambda r: (-r.inscritos, r.titulo))

    # Avance por alumno (todos los alumnos de la org, incluso sin inscripciones).
    alumnos_org = [
        u for (u, _r) in crud.list_org_users(session=session, org_id=org.id)
        if u.rol == RolUsuario.ESTUDIANTE
    ]
    alumnos = []
    for u in alumnos_org:
        lst = [i for i in inscripciones if i.usuario_id == u.id]
        if not lst:
            continue
        alumnos.append(AlumnoAvance(
            id=u.id, nombre=u.full_name or u.email, cursos=len(lst),
            terminados=sum(1 for i in lst if _fin(i)),
            avance_promedio=round(sum(avance[i.id] for i in lst) / len(lst), 1),
        ))
    alumnos.sort(key=lambda r: (-r.avance_promedio, r.nombre))
    return SupervisorDashboard(
        embudo=embudo, semanas=semanas, cursos=cursos, alumnos=alumnos,
        alumnos_sin_inscripcion=len(alumnos_org) - len(alumnos),
    )


@router.post("/solicitudes", response_model=SolicitudPublic, status_code=201)
def crear_solicitud(
    *, session: SessionDep, current_user: SupervisorOrAbove, body: SolicitudCreate,
) -> Any:
    org, _rol = _get_user_org(session, current_user.id)
    s = crud.create_solicitud_curso(
        session=session, org_id=org.id, solicitante_id=current_user.id,
        titulo=body.titulo_solicitud, descripcion=body.descripcion,
    )
    return SolicitudPublic(
        id=s.id, titulo_solicitud=s.titulo_solicitud, descripcion=s.descripcion,
        estado=s.estado.value if hasattr(s.estado, "value") else str(s.estado),
        creado_en=s.creado_en,
    )


@router.get("/solicitudes", response_model=list[SolicitudPublic])
def listar_solicitudes(
    *, session: SessionDep, current_user: SupervisorOrAbove,
) -> Any:
    org, _rol = _get_user_org(session, current_user.id)
    items = crud.list_solicitudes_by_org(session=session, org_id=org.id)
    return [
        SolicitudPublic(
            id=s.id, titulo_solicitud=s.titulo_solicitud, descripcion=s.descripcion,
            estado=s.estado.value if hasattr(s.estado, "value") else str(s.estado),
            creado_en=s.creado_en,
            actualizado_en=s.actualizado_en,
            comentarios=[
                ComentarioPublic(comentario=c.comentario, creado_en=c.creado_en)
                for c in sorted(s.comentarios, key=lambda c: c.creado_en)
            ],
        ) for s in items
    ]
