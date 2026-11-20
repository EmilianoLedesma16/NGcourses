"""
Comentarios en las lecciones (estilo YouTube).

Pueden leer y comentar quienes tienen acceso al contenido del curso: la misma
regla que el reproductor (`_tiene_acceso_contenido`): admin, instructor dueño,
supervisor con licencia de su organización y alumno con inscripción activa o
finalizada. Un nivel de respuestas, likes y edición del comentario propio.
El autor borra el suyo; admin e instructor del curso pueden borrar cualquiera.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.api.deps import CurrentUser, SessionDep
from app.api.routes.cursos import _tiene_acceso_contenido
from app.models._enums import RolUsuario, TipoLeccion
from app.models.comentario import (
    COMENTARIO_MAX_CHARS,
    ComentarioAutor,
    ComentarioCreate,
    ComentarioLeccion,
    ComentarioPublic,
    ComentariosPublic,
    ComentarioUpdate,
    LikeComentario,
    LikePublic,
)
from app.models.contenido import Curso, Leccion, Modulo
from app.models.schemas import Message
from app.models.user import User

router = APIRouter(tags=["comentarios"])

# Anti-spam por usuario (no por IP: una empresa entera puede salir por la misma IP).
MAX_COMENTARIOS_POR_MINUTO = 10


# ── Helpers ───────────────────────────────────────────────────────────────────


def _es_staff_del_curso(user: User, curso: Curso) -> bool:
    return (
        user.is_superuser
        or user.rol == RolUsuario.ADMINISTRADOR
        or user.id == curso.instructor_id
    )


def _leccion_con_acceso(session: Session, user: User, leccion_id: uuid.UUID) -> tuple[Leccion, Curso]:
    """Devuelve la lección y su curso si el usuario puede ver sus comentarios.

    404 si no existe o está oculta (para el alumno, una lección oculta no existe);
    403 si no tiene acceso al contenido del curso. Los quizzes no tienen
    comentarios (se podrían filtrar las respuestas).
    """
    leccion = session.get(Leccion, leccion_id)
    if not leccion:
        raise HTTPException(status_code=404, detail="Lección no encontrada")
    modulo = session.get(Modulo, leccion.modulo_id)
    curso = session.get(Curso, modulo.curso_id) if modulo else None
    if not curso:
        raise HTTPException(status_code=404, detail="Lección no encontrada")
    staff = _es_staff_del_curso(user, curso)
    if not leccion.es_visible and not staff:
        raise HTTPException(status_code=404, detail="Lección no encontrada")
    if leccion.tipo == TipoLeccion.QUIZ:
        raise HTTPException(status_code=400, detail="Las evaluaciones no tienen comentarios")
    if not _tiene_acceso_contenido(session, user, curso):
        raise HTTPException(
            status_code=403,
            detail="Inscríbete en el curso para ver y escribir comentarios",
        )
    return leccion, curso


def _comentario_con_acceso(
    session: Session, user: User, comentario_id: uuid.UUID
) -> tuple[ComentarioLeccion, Curso]:
    comentario = session.get(ComentarioLeccion, comentario_id)
    if not comentario:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    _, curso = _leccion_con_acceso(session, user, comentario.leccion_id)
    return comentario, curso


def _limpiar_contenido(texto: str) -> str:
    contenido = (texto or "").strip()
    if not contenido:
        raise HTTPException(status_code=422, detail="El comentario no puede estar vacío")
    if len(contenido) > COMENTARIO_MAX_CHARS:
        raise HTTPException(
            status_code=422,
            detail=f"El comentario no puede pasar de {COMENTARIO_MAX_CHARS} caracteres",
        )
    return contenido


def _serializar(
    session: Session,
    user: User,
    curso: Curso,
    comentarios: list[ComentarioLeccion],
) -> list[ComentarioPublic]:
    """Arma la respuesta con autor, likes y permisos en pocas consultas."""
    if not comentarios:
        return []
    ids = [c.id for c in comentarios]

    likes_por_id: dict[uuid.UUID, int] = dict(
        session.exec(  # type: ignore[arg-type]
            select(LikeComentario.comentario_id, func.count())
            .where(col(LikeComentario.comentario_id).in_(ids))
            .group_by(LikeComentario.comentario_id)
        ).all()
    )
    mis_likes = set(
        session.exec(
            select(LikeComentario.comentario_id).where(
                col(LikeComentario.comentario_id).in_(ids),
                LikeComentario.usuario_id == user.id,
            )
        ).all()
    )
    autores = {
        u.id: u
        for u in session.exec(
            select(User).where(col(User.id).in_({c.usuario_id for c in comentarios}))
        ).all()
    }
    staff = _es_staff_del_curso(user, curso)

    out: list[ComentarioPublic] = []
    for c in comentarios:
        autor = autores.get(c.usuario_id)
        nombre = (autor.full_name or "").strip() if autor else ""
        if not nombre and autor:
            # Sin nombre capturado: la parte antes de la @, nunca el correo completo.
            nombre = autor.email.split("@")[0]
        out.append(
            ComentarioPublic(
                id=c.id,
                leccion_id=c.leccion_id,
                parent_id=c.parent_id,
                contenido=c.contenido,
                creado_en=c.creado_en,
                editado_en=c.editado_en,
                autor=ComentarioAutor(
                    id=c.usuario_id,
                    nombre=nombre or "Usuario",
                    avatar_url=autor.avatar_url if autor else None,
                ),
                likes=likes_por_id.get(c.id, 0),
                me_gusta=c.id in mis_likes,
                es_mio=c.usuario_id == user.id,
                puede_borrar=c.usuario_id == user.id or staff,
            )
        )
    return out


def _contar_likes(session: Session, comentario_id: uuid.UUID) -> int:
    return session.exec(
        select(func.count()).select_from(LikeComentario).where(
            LikeComentario.comentario_id == comentario_id
        )
    ).one()


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/lecciones/{leccion_id}/comentarios", response_model=ComentariosPublic)
def listar_comentarios(
    leccion_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 20,
    orden: Literal["recientes", "populares"] = "recientes",
) -> Any:
    """Comentarios raíz paginados, cada uno con todas sus respuestas (más viejas primero)."""
    _, curso = _leccion_con_acceso(session, current_user, leccion_id)
    limit = max(1, min(limit, 50))
    skip = max(0, skip)

    es_raiz = (ComentarioLeccion.leccion_id == leccion_id) & (
        col(ComentarioLeccion.parent_id).is_(None)
    )
    count = session.exec(
        select(func.count()).select_from(ComentarioLeccion).where(es_raiz)
    ).one()
    total = session.exec(
        select(func.count())
        .select_from(ComentarioLeccion)
        .where(ComentarioLeccion.leccion_id == leccion_id)
    ).one()

    query = select(ComentarioLeccion).where(es_raiz)
    if orden == "populares":
        likes_sq = (
            select(func.count())
            .select_from(LikeComentario)
            .where(LikeComentario.comentario_id == ComentarioLeccion.id)
            .correlate(ComentarioLeccion)
            .scalar_subquery()
        )
        query = query.order_by(likes_sq.desc(), col(ComentarioLeccion.creado_en).desc())
    else:
        query = query.order_by(col(ComentarioLeccion.creado_en).desc())
    raices = list(session.exec(query.offset(skip).limit(limit)).all())

    respuestas: list[ComentarioLeccion] = []
    if raices:
        respuestas = list(
            session.exec(
                select(ComentarioLeccion)
                .where(col(ComentarioLeccion.parent_id).in_([r.id for r in raices]))
                .order_by(col(ComentarioLeccion.creado_en).asc())
            ).all()
        )

    serializados = _serializar(session, current_user, curso, raices + respuestas)
    por_id = {c.id: c for c in serializados}
    data: list[ComentarioPublic] = []
    for r in raices:
        data.append(por_id[r.id])
    for resp in respuestas:
        if resp.parent_id in por_id:
            por_id[resp.parent_id].respuestas.append(por_id[resp.id])
    return ComentariosPublic(data=data, count=count, total=total)


@router.post(
    "/lecciones/{leccion_id}/comentarios",
    response_model=ComentarioPublic,
    status_code=201,
)
def crear_comentario(
    *,
    leccion_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    comentario_in: ComentarioCreate,
) -> Any:
    _, curso = _leccion_con_acceso(session, current_user, leccion_id)
    contenido = _limpiar_contenido(comentario_in.contenido)

    hace_un_minuto = datetime.now(timezone.utc) - timedelta(minutes=1)
    recientes = session.exec(
        select(func.count())
        .select_from(ComentarioLeccion)
        .where(
            ComentarioLeccion.usuario_id == current_user.id,
            col(ComentarioLeccion.creado_en) >= hace_un_minuto,
        )
    ).one()
    if recientes >= MAX_COMENTARIOS_POR_MINUTO:
        raise HTTPException(
            status_code=429,
            detail="Estás comentando muy rápido. Espera un momento e inténtalo de nuevo.",
        )

    parent_id: uuid.UUID | None = None
    if comentario_in.parent_id:
        padre = session.get(ComentarioLeccion, comentario_in.parent_id)
        if not padre or padre.leccion_id != leccion_id:
            raise HTTPException(status_code=404, detail="El comentario que respondes ya no existe")
        # Un solo nivel: responder a una respuesta cuelga del comentario raíz.
        parent_id = padre.parent_id or padre.id

    comentario = ComentarioLeccion(
        leccion_id=leccion_id,
        usuario_id=current_user.id,
        parent_id=parent_id,
        contenido=contenido,
    )
    session.add(comentario)
    session.commit()
    session.refresh(comentario)
    return _serializar(session, current_user, curso, [comentario])[0]


@router.patch("/comentarios/{comentario_id}", response_model=ComentarioPublic)
def editar_comentario(
    *,
    comentario_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    comentario_in: ComentarioUpdate,
) -> Any:
    """Solo el autor puede editar su comentario."""
    comentario, curso = _comentario_con_acceso(session, current_user, comentario_id)
    if comentario.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo puedes editar tus comentarios")
    contenido = _limpiar_contenido(comentario_in.contenido)
    if contenido != comentario.contenido:
        comentario.contenido = contenido
        comentario.editado_en = datetime.now(timezone.utc)
        session.add(comentario)
        session.commit()
        session.refresh(comentario)
    return _serializar(session, current_user, curso, [comentario])[0]


@router.delete("/comentarios/{comentario_id}", response_model=Message)
def borrar_comentario(
    comentario_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """El autor borra el suyo; admin e instructor del curso, cualquiera.
    Borrar un comentario raíz borra también sus respuestas."""
    comentario, curso = _comentario_con_acceso(session, current_user, comentario_id)
    if comentario.usuario_id != current_user.id and not _es_staff_del_curso(current_user, curso):
        raise HTTPException(status_code=403, detail="No puedes borrar este comentario")
    session.delete(comentario)
    session.commit()
    return Message(message="Comentario eliminado")


@router.put("/comentarios/{comentario_id}/like", response_model=LikePublic)
def dar_like(
    comentario_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Idempotente: dar like dos veces deja un solo like."""
    _comentario_con_acceso(session, current_user, comentario_id)
    if not session.get(LikeComentario, (comentario_id, current_user.id)):
        session.add(LikeComentario(comentario_id=comentario_id, usuario_id=current_user.id))
        try:
            session.commit()
        except IntegrityError:
            # Doble clic simultáneo: el otro request ya lo guardó.
            session.rollback()
    return LikePublic(likes=_contar_likes(session, comentario_id), me_gusta=True)


@router.delete("/comentarios/{comentario_id}/like", response_model=LikePublic)
def quitar_like(
    comentario_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    _comentario_con_acceso(session, current_user, comentario_id)
    like = session.get(LikeComentario, (comentario_id, current_user.id))
    if like:
        session.delete(like)
        session.commit()
    return LikePublic(likes=_contar_likes(session, comentario_id), me_gusta=False)
