import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Index, Text
from sqlmodel import Field, SQLModel


def _ahora() -> datetime:
    # Con zona horaria (UTC): no depende de datetime.utcnow() y el navegador
    # interpreta bien la fecha al mostrar "hace 5 minutos".
    return datetime.now(timezone.utc)


# ── Comentarios de lección ──────────────────────────────────────────────────


class ComentarioLeccion(SQLModel, table=True):
    """Comentario bajo una lección (estilo YouTube).

    Un solo nivel de respuestas: `parent_id` apunta siempre a un comentario raíz
    (si alguien responde a una respuesta, el backend la cuelga del raíz).
    Borrar la lección, el usuario o el comentario raíz borra en cascada.
    """

    __tablename__ = "comentarios_leccion"
    __table_args__ = (
        Index("ix_comentarios_leccion_leccion_creado", "leccion_id", "creado_en"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    leccion_id: uuid.UUID = Field(
        foreign_key="lecciones.id", nullable=False, ondelete="CASCADE"
    )
    usuario_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    parent_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="comentarios_leccion.id",
        ondelete="CASCADE",
        index=True,
    )
    contenido: str = Field(sa_column=Column("contenido", Text, nullable=False))
    creado_en: datetime = Field(
        default_factory=_ahora,
        sa_column=Column("creado_en", DateTime(timezone=True), nullable=False),
    )
    editado_en: datetime | None = Field(
        default=None,
        sa_column=Column("editado_en", DateTime(timezone=True), nullable=True),
    )


class LikeComentario(SQLModel, table=True):
    """Un like por usuario por comentario."""

    __tablename__ = "likes_comentario"

    comentario_id: uuid.UUID = Field(
        foreign_key="comentarios_leccion.id", primary_key=True, ondelete="CASCADE"
    )
    usuario_id: uuid.UUID = Field(
        foreign_key="user.id", primary_key=True, ondelete="CASCADE"
    )
    creado_en: datetime = Field(
        default_factory=_ahora,
        sa_column=Column("creado_en", DateTime(timezone=True), nullable=False),
    )


# ── Schemas ─────────────────────────────────────────────────────────────────

COMENTARIO_MAX_CHARS = 2000


class ComentarioCreate(SQLModel):
    contenido: str
    parent_id: uuid.UUID | None = None


class ComentarioUpdate(SQLModel):
    contenido: str


class ComentarioAutor(SQLModel):
    id: uuid.UUID
    nombre: str
    avatar_url: str | None = None


class ComentarioPublic(SQLModel):
    id: uuid.UUID
    leccion_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    contenido: str
    creado_en: datetime
    editado_en: datetime | None = None
    autor: ComentarioAutor
    likes: int = 0
    me_gusta: bool = False
    es_mio: bool = False
    puede_borrar: bool = False
    respuestas: list["ComentarioPublic"] = []


class ComentariosPublic(SQLModel):
    data: list[ComentarioPublic]
    # Total de comentarios raíz (para paginar) y total incluyendo respuestas.
    count: int
    total: int


class LikePublic(SQLModel):
    likes: int
    me_gusta: bool
