"""QA de integridad de datos — SOLO LOCAL (crea y borra datos de prueba).

Uso (desde la raíz del repo):
    docker compose cp scripts/qa/qa_integridad.py backend:/tmp/qa.py
    docker compose exec -w /app backend python /tmp/qa.py seed    # escenario "QA ..." (limpia antes)
    docker compose exec -w /app backend python /tmp/qa.py check   # compara APIs vs BD
    docker compose exec -w /app backend python /tmp/qa.py clean   # borra lo creado

Todo lo creado lleva el prefijo "QA " / dominio @qa-integridad.com. NUNCA correr en prod.
"""
import sys
import uuid
from datetime import datetime, timedelta

import requests
from sqlmodel import Session, select

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.models import User
from app.models._enums import (
    EstadoCurso, EstadoInscripcion, EstadoLicencia, EstadoUsuario, RolOrganizacion, RolUsuario,
    TipoLeccion,
)
from app.models.contenido import Curso, Leccion, Modulo
from app.models._enums import MarcaCurso, TipoCurso
from app.models.inscripcion import Certificado, Inscripcion, ProgresoLeccion
from app.models.organizacion import LicenciaCurso, Organizacion, UsuarioOrganizacion

API = "http://localhost:8000" + settings.API_V1_STR
DOM = "@qa-integridad.com"
P = "QA "


def token(u: User) -> dict:
    return {"access_token": security.create_access_token(u.id, timedelta(hours=1))}


def call(method: str, path: str, u: User, **kw):
    r = requests.request(method, API + path, cookies=token(u), timeout=30, **kw)
    return r


# ── limpieza ────────────────────────────────────────────────────────────────

def clean(s: Session) -> None:
    from app import crud
    cursos = s.exec(select(Curso).where(Curso.titulo.startswith(P))).all()
    ids = [c.id for c in cursos]
    users = s.exec(select(User).where(User.email.endswith(DOM))).all()
    uids = [u.id for u in users]
    orgs = s.exec(select(Organizacion).where(Organizacion.nombre.startswith(P))).all()
    for o in orgs:
        for lic in s.exec(select(LicenciaCurso).where(LicenciaCurso.organizacion_id == o.id)).all():
            s.delete(lic)
        for m in s.exec(select(UsuarioOrganizacion).where(UsuarioOrganizacion.organizacion_id == o.id)).all():
            s.delete(m)
        s.flush()
        s.delete(o)
    s.commit()
    for lic in s.exec(select(LicenciaCurso).where(LicenciaCurso.curso_id.in_(ids))).all():
        s.delete(lic)
    s.commit()
    for u in users:
        crud._delete_user_cascade(session=s, user_id=u.id)
    s.commit()
    # inscripciones remanentes (cascade de progreso por relación)
    for i in s.exec(select(Inscripcion).where(Inscripcion.curso_id.in_(ids))).all():
        for c in s.exec(select(Certificado).where(Certificado.inscripcion_id == i.id)).all():
            s.delete(c)
        for p in s.exec(select(ProgresoLeccion).where(ProgresoLeccion.inscripcion_id == i.id)).all():
            s.delete(p)
        s.flush()
        s.delete(i)
    s.commit()
    # hijos antes que padres
    for c in sorted(cursos, key=lambda c: c.curso_padre_id is None):
        s.delete(c)
    s.commit()
    print(f"limpio: {len(cursos)} cursos, {len(users)} usuarios, {len(orgs)} orgs")


# ── escenario ───────────────────────────────────────────────────────────────

def mk_user(s, email, rol, nombre):
    u = User(
        email=email + DOM, full_name=nombre, rol=rol, is_active=True,
        estado=EstadoUsuario.ACTIVO, hashed_password=security.get_password_hash("QaIntegridad#2026"),
    )
    s.add(u)
    s.flush()
    return u


def mk_curso(s, titulo, instr, *, marca, estado=EstadoCurso.PUBLICADO, gratis=True,
             tipo=TipoCurso.INDIVIDUAL, padre=None, orden=0, lecciones=(2,), ocultas=0):
    c = Curso(
        titulo=P + titulo, slug=f"qa-{uuid.uuid4().hex[:10]}", instructor_id=instr.id,
        marca=marca, estado=estado, es_gratis=gratis, precio=None if gratis else 500,
        tipo=tipo, curso_padre_id=padre.id if padre else None, orden_en_padre=orden,
        publicado_en=datetime.utcnow() if estado == EstadoCurso.PUBLICADO else None,
    )
    s.add(c)
    s.flush()
    for mi, n in enumerate(lecciones if tipo == TipoCurso.INDIVIDUAL else ()):
        m = Modulo(curso_id=c.id, titulo=f"Módulo {mi + 1}", orden=mi)
        s.add(m)
        s.flush()
        for li in range(n):
            s.add(Leccion(modulo_id=m.id, titulo=f"Lección {mi + 1}.{li + 1}", orden=li,
                          tipo=TipoLeccion.LECTURA, contenido="texto", es_visible=True))
        if mi == 0:
            for k in range(ocultas):
                s.add(Leccion(modulo_id=m.id, titulo=f"Oculta {k + 1}", orden=99 + k,
                              tipo=TipoLeccion.LECTURA, contenido="x", es_visible=False))
    s.flush()
    return c


def lecciones_de(s, curso, visibles=None):
    q = select(Leccion).join(Modulo, Leccion.modulo_id == Modulo.id).where(Modulo.curso_id == curso.id)
    if visibles is not None:
        q = q.where(Leccion.es_visible == visibles)
    return list(s.exec(q.order_by(Modulo.orden, Leccion.orden)).all())


def seed(s: Session) -> None:
    clean(s)
    admin = s.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).one()
    org = Organizacion(nombre=P + "Integridad SA")
    s.add(org)
    s.flush()
    sup = mk_user(s, "qa.sup", RolUsuario.SUPERVISOR, "QA Supervisor")
    a = mk_user(s, "qa.ana", RolUsuario.ESTUDIANTE, "QA Ana")
    b = mk_user(s, "qa.beto", RolUsuario.ESTUDIANTE, "QA Beto")
    c = mk_user(s, "qa.caro", RolUsuario.ESTUDIANTE, "QA Caro")
    d = mk_user(s, "qa.dani", RolUsuario.ESTUDIANTE, "QA Dani (sin org)")
    s.add(UsuarioOrganizacion(organizacion_id=org.id, usuario_id=sup.id, rol_org=RolOrganizacion.ADMIN_ORG))
    for u in (a, b, c):
        s.add(UsuarioOrganizacion(organizacion_id=org.id, usuario_id=u.id, rol_org=RolOrganizacion.MIEMBRO))

    N, R = MarcaCurso.NEXTGEN, MarcaCurso.RAM
    g = mk_curso(s, "Global Ventas", admin, marca=N, gratis=False, tipo=TipoCurso.GLOBAL)
    mk_curso(s, "Global Ventas · 1 Prospección", admin, marca=N, gratis=False, padre=g, orden=1, lecciones=(2, 1), ocultas=1)
    mk_curso(s, "Global Ventas · 2 Cierre", admin, marca=N, gratis=False, padre=g, orden=2, lecciones=(2,))
    mk_curso(s, "Global Ventas · 3 Borrador", admin, marca=N, gratis=False, padre=g, orden=3,
             estado=EstadoCurso.BORRADOR, lecciones=(2,))
    r1 = mk_curso(s, "RAM Seguridad", admin, marca=R, lecciones=(2, 2))
    r2 = mk_curso(s, "RAM Licencia vencida", admin, marca=R, lecciones=(1,))
    r3 = mk_curso(s, "RAM Archivado", admin, marca=R, lecciones=(1,))
    mk_curso(s, "NextGen Gratis", admin, marca=N, lecciones=(2,))
    mk_curso(s, "NextGen Paga sin licencia", admin, marca=N, gratis=False, lecciones=(1,))
    now = datetime.utcnow()
    s.add(LicenciaCurso(organizacion_id=org.id, curso_id=g.id))
    s.add(LicenciaCurso(organizacion_id=org.id, curso_id=r1.id))
    s.add(LicenciaCurso(organizacion_id=org.id, curso_id=r2.id, termina_en=now - timedelta(days=3)))
    s.add(LicenciaCurso(organizacion_id=org.id, curso_id=r3.id))
    s.commit()

    def curso(t):
        return s.exec(select(Curso).where(Curso.titulo == P + t)).one()

    def enroll(u, t):
        r = call("POST", "/inscripciones/", u, json={"curso_id": str(curso(t).id)})
        assert r.status_code in (200, 201), (t, r.status_code, r.text)

    def complete(u, t, n=None, incluir_ocultas=False):
        cu = curso(t)
        ins = s.exec(select(Inscripcion).where(Inscripcion.usuario_id == u.id, Inscripcion.curso_id == cu.id)).one()
        lecs = lecciones_de(s, cu, None if incluir_ocultas else True)
        for l in lecs[: n if n is not None else len(lecs)]:
            r = call("POST", "/progreso/", u, json={"inscripcion_id": str(ins.id), "leccion_id": str(l.id),
                                                    "visto_seg": 60, "progreso_pct": 100})
            assert r.status_code == 200, r.text
        return ins

    enroll(a, "Global Ventas")
    enroll(a, "RAM Seguridad")
    enroll(a, "NextGen Gratis")
    ins_p = complete(a, "Global Ventas · 1 Prospección")  # 3 visibles
    complete(a, "RAM Seguridad", 2)
    # Progreso de una lección OCULTA vía API, y si se rechaza, como dato legado en BD.
    oculta = lecciones_de(s, curso("Global Ventas · 1 Prospección"), False)[0]
    r = call("POST", "/progreso/", a, json={"inscripcion_id": str(ins_p.id), "leccion_id": str(oculta.id),
                                            "visto_seg": 60, "progreso_pct": 100})
    print("progreso de lección oculta →", r.status_code)
    # Progreso "cruzado": lección de otro curso registrada con la inscripción de NextGen Gratis
    ins_f = s.exec(select(Inscripcion).where(Inscripcion.usuario_id == a.id,
                                             Inscripcion.curso_id == curso("NextGen Gratis").id)).one()
    otra = lecciones_de(s, curso("NextGen Paga sin licencia"))[0]
    r = call("POST", "/progreso/", a, json={"inscripcion_id": str(ins_f.id), "leccion_id": str(otra.id),
                                            "visto_seg": 60, "progreso_pct": 100})
    print("progreso cruzado (lección de otro curso) →", r.status_code)
    if r.status_code != 200:  # datos legados previos al fix
        s.add(ProgresoLeccion(inscripcion_id=ins_f.id, leccion_id=otra.id, visto_seg=60, progreso_pct=100,
                              completado=True, completado_en=datetime.utcnow()))
        s.add(ProgresoLeccion(inscripcion_id=ins_p.id, leccion_id=oculta.id, visto_seg=60, progreso_pct=100,
                              completado=True, completado_en=datetime.utcnow()))
        s.commit()

    enroll(b, "RAM Seguridad")
    complete(b, "RAM Seguridad")
    enroll(d, "NextGen Gratis")

    # Después de inscribirse, el admin publica un 4º curso en el global y archiva r3.
    mk_curso(s, "Global Ventas · 4 Nuevo", admin, marca=N, gratis=False, padre=g, orden=4, lecciones=(1,))
    r3.estado = EstadoCurso.ARCHIVADO
    s.add(r3)
    s.commit()
    print("seed listo")


# ── verificación ────────────────────────────────────────────────────────────

ISSUES: list[str] = []


def expect(label, shown, truth):
    ok = shown == truth
    print(f"  {'OK ' if ok else 'XX '} {label}: muestra={shown!r} real={truth!r}")
    if not ok:
        ISSUES.append(f"{label}: muestra={shown!r} real={truth!r}")


def avance_real(s, ins) -> float:
    if ins.estado == EstadoInscripcion.FINALIZADA:
        return 100.0
    vis = {l.id for l in lecciones_de(s, s.get(Curso, ins.curso_id), True)}
    if not vis:
        return 0.0
    hechas = s.exec(select(ProgresoLeccion).where(ProgresoLeccion.inscripcion_id == ins.id,
                                                  ProgresoLeccion.completado == True)).all()  # noqa: E712
    return 100.0 * len([p for p in hechas if p.leccion_id in vis]) / len(vis)


def front_grupos(cards):
    """Réplica de CoursesContent/cursos/page.tsx."""
    vis = [c for c in cards if c.get("estado") in (None, "publicado")]
    def assigned(c):
        return bool(c.get("es_de_mi_org") or (c["marca"] == "ram" and c["_enrolled"]))
    def free(c):
        return c["marca"] == "nextgen" and c["es_gratis"] and not assigned(c)
    return [c for c in vis if free(c)], [c for c in vis if assigned(c)], [c for c in vis if not free(c) and not assigned(c)]


def check(s: Session) -> None:
    org = s.exec(select(Organizacion).where(Organizacion.nombre == P + "Integridad SA")).one()
    users = {u.email.split("@")[0]: u for u in s.exec(select(User).where(User.email.endswith(DOM))).all()}

    for key in ("qa.ana", "qa.beto", "qa.caro", "qa.dani"):
        u = users[key]
        print(f"\n== Alumno {u.full_name}")
        insc = s.exec(select(Inscripcion).where(Inscripcion.usuario_id == u.id,
                                                Inscripcion.estado != EstadoInscripcion.CANCELADO)).all()
        mis = call("GET", "/inscripciones/me?limit=500", u).json()["data"]
        vigentes = [i for i in mis if i["estado"] != "cancelado"]
        enrolled_ids = {i["curso_id"] for i in vigentes}
        cards = [c for c in call("GET", "/cursos/?limit=100", u).json()["data"] if c["titulo"].startswith(P)]
        for c in cards:
            c["_enrolled"] = (c.get("subcursos_inscritos") or 0) > 0 if c["tipo"] == "global" else c["id"] in enrolled_ids
        free, assigned, ocultos = front_grupos(cards)
        print("  catálogo  gratis:", [c["titulo"] for c in free])
        print("  catálogo  asignados:", [c["titulo"] for c in assigned])
        if ocultos:
            print("  (devueltos por la API pero ocultos en el front):", [c["titulo"] for c in ocultos])
        # Cursos inscritos que no aparecen en ninguna tarjeta del dashboard
        visibles_ids = set()
        for c in free + assigned:
            visibles_ids.add(c["id"])
            if c["tipo"] == "global":
                visibles_ids |= {str(h.id) for h in s.exec(select(Curso).where(Curso.curso_padre_id == uuid.UUID(c["id"]))).all()}
        sin_tarjeta = [s.get(Curso, uuid.UUID(i["curso_id"])).titulo for i in vigentes if i["curso_id"] not in visibles_ids]
        expect(f"{key} cursos inscritos sin tarjeta en el dashboard", sin_tarjeta, [])

        for c in cards:
            if c["tipo"] != "global":
                continue
            det = call("GET", f"/cursos/{c['id']}", u).json()
            subs_pub = [h for h in s.exec(select(Curso).where(Curso.curso_padre_id == uuid.UUID(c["id"]),
                                                               Curso.estado == EstadoCurso.PUBLICADO)).all()]
            expect(f"{key} global '{c['titulo']}' subcursos_total (tarjeta) vs publicados",
                   c["subcursos_total"], len(subs_pub))
            expect(f"{key} global subcursos en la ficha vs tarjeta", len(det["subcursos"]), c["subcursos_total"])
            tot = sum(len(lecciones_de(s, h, True)) for h in subs_pub)
            expect(f"{key} global lecciones_total", c["lecciones_total"], tot)
            ins_sub = [h for h in subs_pub if any(i.curso_id == h.id for i in insc)]
            if c["_enrolled"]:
                expect(f"{key} global inscrito en todos sus cursos publicados", len(ins_sub), len(subs_pub))

        # Saludo "Tienes N cursos en curso" vs "Mis cursos"
        activos = [i for i in insc if i.estado == EstadoInscripcion.ACTIVA]
        expect(f"{key} saludo (inscripciones activas)", len([i for i in vigentes if i["estado"] == "activa"]), len(activos))

        for i in insc:
            pr = call("GET", f"/progreso/curso/{i.curso_id}", u).json()
            real = round(avance_real(s, i), 1)
            shown = 100.0 if i.estado == EstadoInscripcion.FINALIZADA else pr["progreso_pct"]
            expect(f"{key} % '{s.get(Curso, i.curso_id).titulo}'", shown, real)

    # ── Supervisor ──
    sup = users["qa.sup"]
    print("\n== Supervisor")
    st = call("GET", "/supervisor/stats", sup).json()
    miembros = s.exec(select(UsuarioOrganizacion).where(UsuarioOrganizacion.organizacion_id == org.id)).all()
    alumnos = [m.usuario_id for m in miembros if s.get(User, m.usuario_id).rol == RolUsuario.ESTUDIANTE]
    now = datetime.utcnow()
    lic_ok = [l for l in s.exec(select(LicenciaCurso).where(LicenciaCurso.organizacion_id == org.id,
                                                            LicenciaCurso.estado == EstadoLicencia.ACTIVA)).all()
              if not (l.termina_en and l.termina_en < now) and not (l.inicia_en and l.inicia_en > now)
              and s.get(Curso, l.curso_id).estado == EstadoCurso.PUBLICADO]
    # El supervisor solo ve avance en los cursos que licencia su org (y los de un global licenciado).
    cubiertos = {l.curso_id for l in lic_ok}
    cubiertos |= {h.id for h in s.exec(select(Curso).where(Curso.curso_padre_id.in_(list(cubiertos)))).all()}
    insc_org = [i for i in s.exec(select(Inscripcion).where(Inscripcion.usuario_id.in_(alumnos))).all()
                if i.estado != EstadoInscripcion.CANCELADO and i.curso_id in cubiertos]
    prom = round(sum(avance_real(s, i) for i in insc_org) / len(insc_org), 2) if insc_org else 0.0
    expect("sup Usuarios totales (alumnos de la org)", st["usuarios_totales"], len(alumnos))
    expect("sup Progreso promedio", round(st["progreso_promedio"]), round(prom))
    expect("sup Cursos asignados (vigentes y publicados)", st["cursos_disponibles"], len(lic_ok))
    expect("sup Inscripciones (vigentes)", st["inscripciones_totales"], len(insc_org))
    sc = call("GET", "/supervisor/cursos", sup).json()
    expect("sup listado de cursos vs tarjeta 'Cursos asignados'", len(sc), st["cursos_disponibles"])
    for row in call("GET", "/supervisor/usuarios", sup).json():
        u = s.get(User, uuid.UUID(row["id"]))
        ins_u = [i for i in insc_org if i.usuario_id == u.id]
        p = round(sum(avance_real(s, i) for i in ins_u) / len(ins_u)) if ins_u else 0
        expect(f"sup/usuarios {u.full_name} progreso", round(row["progreso_promedio"]), p)
        expect(f"sup/usuarios {u.full_name} cursos inscritos", row["cursos_inscritos"], len(ins_u))

    dash = call("GET", "/supervisor/dashboard", sup).json()
    e = dash["embudo"]
    expect("sup dashboard: inscripciones del embudo = tarjeta", e["inscritos"], st["inscripciones_totales"])
    expect("sup dashboard: etapas suman el total", e["sin_iniciar"] + e["en_curso"] + e["terminaron"], e["inscritos"])
    expect("sup dashboard: alumnos con cursos + sin cursos = alumnos", len(dash["alumnos"]) + dash["alumnos_sin_inscripcion"], len(alumnos))

    # ── Admin (global, sobre toda la BD) ──
    print("\n== Admin /admin/stats (toda la BD)")
    admin = s.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).one()
    ad = call("GET", "/admin/stats", admin).json()
    todas = [i for i in s.exec(select(Inscripcion)).all() if i.estado != EstadoInscripcion.CANCELADO]
    de_alumnos = [i for i in todas if s.get(User, i.usuario_id) and s.get(User, i.usuario_id).rol == RolUsuario.ESTUDIANTE]
    expect("admin embudo inscritos (solo alumnos, como en Alumnos)", ad["embudo"]["inscritos"], len(de_alumnos))
    e = ad["embudo"]
    expect("admin embudo suma etapas = inscritos", e["sin_iniciar"] + e["en_curso"] + e["terminaron"], e["inscritos"])
    for o in ad["por_organizacion"]:
        if o["nombre"] == org.nombre:
            expect("admin por_org alumnos (sin supervisor)", o["alumnos"], len(alumnos))
            prom_o = round(sum(avance_real(s, i) for i in insc_org) / len(insc_org), 1) if insc_org else 0.0
            expect("admin por_org avance", o["avance_promedio"], prom_o)
    for t in ad["top_cursos"]:
        lst = [i for i in de_alumnos if i.curso_id == uuid.UUID(t["id"])]
        if lst:
            expect(f"admin top '{t['titulo']}' avance", t["avance_promedio"],
                   round(sum(avance_real(s, i) for i in lst) / len(lst), 1))

    print(f"\n{len(ISSUES)} discrepancias")
    for i in ISSUES:
        print(" -", i)


if __name__ == "__main__":
    with Session(engine) as s:
        {"seed": seed, "check": check, "clean": clean}[sys.argv[1]](s)
