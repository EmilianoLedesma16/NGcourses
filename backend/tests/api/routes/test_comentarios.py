"""Comentarios en lecciones: acceso, respuestas, likes, edición, borrado y anti-spam.

Usa su propia sesión de BD y fija el usuario actual con dependency_overrides:
no depende del login (limitado a 5/minuto) ni de la sesión compartida de
conftest, que queda inservible en cuanto otro test falla.
"""
import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, col, delete

from app import crud
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.db import engine
from app.main import app
from app.models._enums import EstadoCurso, MarcaCurso, TipoLeccion
from app.models.comentario import ComentarioLeccion
from app.models.contenido import Curso, CursoCreate, Leccion, Modulo
from app.models.inscripcion import Inscripcion
from app.models.user import User, UserCreate
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


class Escenario:
    def __init__(self, s: Session) -> None:
        self.s = s
        self.users: list[User] = []
        self.instructor = self._user("Instructora Ana")
        self.alumno = self._user("Alumno Beto")
        self.alumno2 = self._user(None)  # sin nombre: se muestra la parte antes de la @
        self.extrano = self._user("Sin Inscripción")

        self.curso = crud.create_curso(
            session=s,
            curso_in=CursoCreate(
                titulo="Curso comentarios",
                slug=f"curso-comentarios-{uuid.uuid4().hex[:8]}",
                descripcion="test",
                estado=EstadoCurso.PUBLICADO,
                marca=MarcaCurso.NEXTGEN,
                es_gratis=True,
            ),
            instructor_id=self.instructor.id,
        )
        self.curso.estado = EstadoCurso.PUBLICADO
        s.add(self.curso)
        s.commit()
        modulo = Modulo(curso_id=self.curso.id, titulo="Módulo 1")
        s.add(modulo)
        s.commit()
        self.video = Leccion(modulo_id=modulo.id, titulo="Video", tipo=TipoLeccion.VIDEO)
        self.quiz = Leccion(modulo_id=modulo.id, titulo="Quiz", tipo=TipoLeccion.QUIZ)
        self.oculta = Leccion(modulo_id=modulo.id, titulo="Oculta", es_visible=False)
        s.add_all([self.video, self.quiz, self.oculta])
        for u in (self.alumno, self.alumno2):
            s.add(Inscripcion(usuario_id=u.id, curso_id=self.curso.id))
        s.commit()
        for obj in (self.video, self.quiz, self.oculta):
            s.refresh(obj)

    def _user(self, nombre: str | None) -> User:
        u = crud.create_user(
            session=self.s,
            user_create=UserCreate(
                email=random_email(), password=random_lower_string(), full_name=nombre
            ),
        )
        self.users.append(u)
        return u

    def limpiar(self) -> None:
        s = self.s
        s.rollback()
        user_ids = [u.id for u in self.users]
        s.exec(delete(Inscripcion).where(col(Inscripcion.curso_id) == self.curso.id))  # type: ignore[call-overload]
        # Lecciones, comentarios y likes se van en cascada con el curso.
        s.exec(delete(Curso).where(col(Curso.id) == self.curso.id))  # type: ignore[call-overload]
        s.exec(delete(User).where(col(User.id).in_(user_ids)))  # type: ignore[call-overload]
        s.commit()


@pytest.fixture()
def esc() -> Generator[Escenario, None, None]:
    with Session(engine) as s:
        e = Escenario(s)
        try:
            yield e
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            e.limpiar()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


def como(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def url(leccion: Leccion) -> str:
    return f"{API}/lecciones/{leccion.id}/comentarios"


def test_sin_inscripcion_no_ve_ni_comenta(esc: Escenario, client: TestClient) -> None:
    como(esc.extrano)
    assert client.get(url(esc.video)).status_code == 403
    assert client.post(url(esc.video), json={"contenido": "hola"}).status_code == 403


def test_quiz_y_leccion_oculta(esc: Escenario, client: TestClient) -> None:
    como(esc.alumno)
    assert client.get(url(esc.quiz)).status_code == 400
    assert client.get(url(esc.oculta)).status_code == 404
    # El instructor sí ve la lección oculta.
    como(esc.instructor)
    assert client.get(url(esc.oculta)).status_code == 200


def test_comentar_responder_y_listar(esc: Escenario, client: TestClient) -> None:
    como(esc.alumno)
    r = client.post(url(esc.video), json={"contenido": "  ¿Qué versión usan?  "})
    assert r.status_code == 201, r.text
    raiz = r.json()
    assert raiz["contenido"] == "¿Qué versión usan?"
    assert raiz["autor"]["nombre"] == "Alumno Beto"
    assert raiz["es_mio"] is True and raiz["puede_borrar"] is True

    como(esc.alumno2)
    r = client.post(url(esc.video), json={"contenido": "La 3.12", "parent_id": raiz["id"]})
    assert r.status_code == 201
    resp = r.json()
    assert resp["parent_id"] == raiz["id"]
    assert resp["autor"]["nombre"] == esc.alumno2.email.split("@")[0]
    assert "@" not in resp["autor"]["nombre"]

    # Responder a una respuesta la cuelga del comentario raíz (un solo nivel).
    como(esc.instructor)
    r = client.post(url(esc.video), json={"contenido": "Correcto", "parent_id": resp["id"]})
    assert r.status_code == 201
    assert r.json()["parent_id"] == raiz["id"]

    como(esc.alumno2)
    body = client.get(url(esc.video)).json()
    assert body["count"] == 1 and body["total"] == 3
    assert [c["contenido"] for c in body["data"][0]["respuestas"]] == ["La 3.12", "Correcto"]
    assert body["data"][0]["es_mio"] is False and body["data"][0]["puede_borrar"] is False


def test_validaciones(esc: Escenario, client: TestClient) -> None:
    como(esc.alumno)
    assert client.post(url(esc.video), json={"contenido": "   "}).status_code == 422
    assert client.post(url(esc.video), json={"contenido": "x" * 2001}).status_code == 422
    r = client.post(url(esc.video), json={"contenido": "hola", "parent_id": str(uuid.uuid4())})
    assert r.status_code == 404


def test_likes_y_orden_populares(esc: Escenario, client: TestClient) -> None:
    como(esc.alumno)
    viejo = client.post(url(esc.video), json={"contenido": "viejo"}).json()
    nuevo = client.post(url(esc.video), json={"contenido": "nuevo"}).json()

    como(esc.alumno2)
    like = f"{API}/comentarios/{viejo['id']}/like"
    assert client.put(like).json() == {"likes": 1, "me_gusta": True}
    assert client.put(like).json() == {"likes": 1, "me_gusta": True}  # idempotente

    recientes = client.get(url(esc.video)).json()["data"]
    assert [c["id"] for c in recientes] == [nuevo["id"], viejo["id"]]
    populares = client.get(url(esc.video), params={"orden": "populares"}).json()["data"]
    assert [c["id"] for c in populares] == [viejo["id"], nuevo["id"]]
    assert populares[0]["likes"] == 1 and populares[0]["me_gusta"] is True

    assert client.delete(like).json() == {"likes": 0, "me_gusta": False}


def test_editar_solo_el_autor(esc: Escenario, client: TestClient) -> None:
    como(esc.alumno)
    c = client.post(url(esc.video), json={"contenido": "original"}).json()
    assert c["editado_en"] is None

    como(esc.instructor)  # ni el instructor edita comentarios ajenos
    assert client.patch(f"{API}/comentarios/{c['id']}", json={"contenido": "x"}).status_code == 403

    como(esc.alumno)
    r = client.patch(f"{API}/comentarios/{c['id']}", json={"contenido": "corregido"})
    assert r.status_code == 200
    assert r.json()["contenido"] == "corregido" and r.json()["editado_en"] is not None


def test_borrar(esc: Escenario, client: TestClient) -> None:
    como(esc.alumno)
    raiz = client.post(url(esc.video), json={"contenido": "raiz"}).json()
    como(esc.alumno2)
    client.post(url(esc.video), json={"contenido": "respuesta", "parent_id": raiz["id"]})

    # Otro alumno no puede borrarlo.
    assert client.delete(f"{API}/comentarios/{raiz['id']}").status_code == 403

    # El instructor del curso sí; se lleva las respuestas.
    como(esc.instructor)
    assert client.delete(f"{API}/comentarios/{raiz['id']}").status_code == 200
    assert client.get(url(esc.video)).json()["total"] == 0


def test_anti_spam_por_usuario(esc: Escenario, client: TestClient) -> None:
    como(esc.alumno)
    for i in range(10):
        assert client.post(url(esc.video), json={"contenido": f"c{i}"}).status_code == 201
    assert client.post(url(esc.video), json={"contenido": "otro"}).status_code == 429
    # El límite es por usuario: otro alumno sigue pudiendo comentar.
    como(esc.alumno2)
    assert client.post(url(esc.video), json={"contenido": "yo sí"}).status_code == 201
    total = esc.s.exec(
        delete(ComentarioLeccion).where(col(ComentarioLeccion.leccion_id) == esc.video.id)  # type: ignore[call-overload]
    )
    assert total.rowcount == 11
    esc.s.commit()
