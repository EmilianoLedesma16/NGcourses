"""Estadísticas del panel de administración (solo admin/superusuario)."""
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter
from sqlmodel import SQLModel, select

from app import crud
from app.api.deps import AdminOrSuperuser, SessionDep
from app.models import User
from app.models.contenido import Curso, Leccion, Modulo
from app.models.inscripcion import Certificado, Inscripcion, ProgresoLeccion
from app.models.organizacion import Organizacion, UsuarioOrganizacion

router = APIRouter(prefix="/admin", tags=["admin"])

SEMANAS = 12


class Embudo(SQLModel):
    inscritos: int
    sin_iniciar: int
    en_curso: int
    terminaron: int
    certificados: int


class Semana(SQLModel):
    inicio: str
    inscripciones: int
    lecciones_completadas: int


class CursoTop(SQLModel):
    id: uuid.UUID
    titulo: str
    inscritos: int
    terminaron: int
    avance_promedio: float


class OrgResumen(SQLModel):
    id: uuid.UUID
    nombre: str
    alumnos: int
    inscripciones: int
    avance_promedio: float


class AdminStats(SQLModel):
    cursos_por_estado: dict[str, int]
    usuarios: int
    alumnos: int
    organizaciones: int
    embudo: Embudo
    semanas: list[Semana]
    top_cursos: list[CursoTop]
    por_organizacion: list[OrgResumen]


def _val(e: Any) -> str:
    return e.value if hasattr(e, "value") else str(e)


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def resumen_avance(
    *, session: Any, inscripciones: list[Inscripcion]
) -> tuple[Embudo, list[Semana], dict[uuid.UUID, float]]:
    """Embudo de avance, actividad de 12 semanas y % por inscripción para un
    conjunto de inscripciones vigentes. Lo usan el panel admin (todas) y el del
    supervisor (las de su org), así ambos calculan exactamente igual."""
    insc_ids = {i.id for i in inscripciones}
    # Lecciones completadas que cuentan: visibles y del curso de la inscripción
    # (mismo criterio que la barra de avance del alumno).
    progreso = [
        p for (p, leccion, modulo, insc) in session.exec(
            select(ProgresoLeccion, Leccion, Modulo, Inscripcion)
            .where(
                ProgresoLeccion.completado == True,  # noqa: E712
                Leccion.id == ProgresoLeccion.leccion_id,
                Modulo.id == Leccion.modulo_id,
                Inscripcion.id == ProgresoLeccion.inscripcion_id,
            )
        ).all()
        if p.inscripcion_id in insc_ids and leccion.es_visible and modulo.curso_id == insc.curso_id
    ]
    certificados = sum(
        1 for c in session.exec(select(Certificado)).all() if c.inscripcion_id in insc_ids
    )
    avance_map = crud.avance_por_inscripcion(session=session, inscripciones=inscripciones)
    completadas_por_insc: Counter[uuid.UUID] = Counter(p.inscripcion_id for p in progreso)

    activas = [i for i in inscripciones if _val(i.estado) == "activa"]
    en_curso = sum(1 for i in activas if completadas_por_insc.get(i.id, 0) > 0)
    embudo = Embudo(
        inscritos=len(inscripciones),
        sin_iniciar=len(activas) - en_curso,
        en_curso=en_curso,
        terminaron=sum(1 for i in inscripciones if _val(i.estado) == "finalizada"),
        certificados=certificados,
    )

    # Últimas 12 semanas, de lunes a domingo, la más reciente al final.
    hoy = datetime.now(timezone.utc).replace(tzinfo=None)
    lunes = (hoy - timedelta(days=hoy.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    inicios = [lunes - timedelta(weeks=k) for k in range(SEMANAS - 1, -1, -1)]

    def idx(dt: datetime | None) -> int | None:
        if not dt:
            return None
        d = _naive(dt)
        if d < inicios[0]:
            return None
        return min(SEMANAS - 1, (d - inicios[0]).days // 7)

    ins_sem = [0] * SEMANAS
    for i in inscripciones:
        k = idx(i.inscrito_en)
        if k is not None:
            ins_sem[k] += 1
    lec_sem = [0] * SEMANAS
    for p in progreso:
        k = idx(p.completado_en)
        if k is not None:
            lec_sem[k] += 1
    semanas = [
        Semana(inicio=inicios[k].date().isoformat(), inscripciones=ins_sem[k], lecciones_completadas=lec_sem[k])
        for k in range(SEMANAS)
    ]
    return embudo, semanas, avance_map


@router.get("/stats", response_model=AdminStats)
def admin_stats(*, session: SessionDep, _admin: AdminOrSuperuser) -> Any:
    cursos = list(session.exec(select(Curso)).all())
    users = list(session.exec(select(User)).all())
    orgs = list(session.exec(select(Organizacion)).all())
    miembros = list(session.exec(select(UsuarioOrganizacion)).all())
    # Solo alumnos: es la misma población que Admin → Alumnos y el panel del
    # supervisor. Inscripciones de admins/instructores que probaron un curso
    # (previas al candado de solo-alumnos) no son avance de alumnos.
    alumno_ids = {u.id for u in users if _val(u.rol) == "estudiante"}
    inscripciones = [
        i for i in session.exec(select(Inscripcion)).all()
        if _val(i.estado) != "cancelado" and i.usuario_id in alumno_ids
    ]
    embudo, semanas, avance_map = resumen_avance(session=session, inscripciones=inscripciones)

    def avance(i: Inscripcion) -> float:
        return avance_map.get(i.id, 0.0)

    # Cursos con más alumnos.
    por_curso: dict[uuid.UUID, list[Inscripcion]] = defaultdict(list)
    for i in inscripciones:
        por_curso[i.curso_id].append(i)
    titulos = {c.id: c.titulo for c in cursos}
    top = sorted(por_curso.items(), key=lambda kv: len(kv[1]), reverse=True)[:5]
    top_cursos = [
        CursoTop(
            id=cid,
            titulo=titulos.get(cid, "Curso"),
            inscritos=len(lst),
            terminaron=sum(1 for i in lst if _val(i.estado) == "finalizada"),
            avance_promedio=round(sum(avance(i) for i in lst) / len(lst), 1),
        )
        for cid, lst in top
    ]

    # Avance por organización: mismo alcance que ve su supervisor (alumnos de la
    # org, en cursos que la org licencia) para que ambos paneles cuadren.
    por_org = []
    for o in orgs:
        ins = crud.inscripciones_org(session=session, org_id=o.id)
        av = crud.avance_por_inscripcion(session=session, inscripciones=ins)
        alumnos_o = {
            m.usuario_id for m in miembros
            if m.organizacion_id == o.id and m.usuario_id in alumno_ids
        }
        por_org.append(
            OrgResumen(
                id=o.id,
                nombre=o.nombre,
                alumnos=len(alumnos_o),
                inscripciones=len(ins),
                avance_promedio=round(sum(av.values()) / len(av), 1) if av else 0.0,
            )
        )
    por_org.sort(key=lambda r: r.inscripciones, reverse=True)

    return AdminStats(
        cursos_por_estado=dict(Counter(_val(c.estado) for c in cursos)),
        usuarios=len(users),
        alumnos=sum(1 for u in users if _val(u.rol) == "estudiante"),
        organizaciones=len(orgs),
        embudo=embudo,
        semanas=semanas,
        top_cursos=top_cursos,
        por_organizacion=por_org[:6],
    )
