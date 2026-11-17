"""Validadores de campos de texto compartidos por los esquemas de entrada.

Los límites coinciden con las columnas de la BD: así un valor demasiado largo
da un 422 con un mensaje claro en vez de un 500 de Postgres.
"""
import re
from typing import Annotated

from pydantic import BeforeValidator

_TEL_PERMITIDOS = re.compile(r"^[0-9+()\-. ]+$")


def normalizar_telefono(v: object) -> str | None:
    """Acepta dígitos, espacios y + - ( ) .; exige 7 a 15 dígitos (E.164) y
    máximo 20 caracteres. Vacío → None."""
    if v is None:
        return None
    if not isinstance(v, str):
        raise ValueError("El teléfono debe ser texto")
    v = re.sub(r"\s+", " ", v.strip())
    if not v:
        return None
    if not _TEL_PERMITIDOS.match(v):
        raise ValueError("El teléfono solo puede contener números, espacios y los signos + - ( )")
    digitos = len(re.sub(r"\D", "", v))
    if digitos < 7 or digitos > 15:
        raise ValueError("El teléfono debe tener entre 7 y 15 dígitos")
    if len(v) > 20:
        raise ValueError("El teléfono no puede tener más de 20 caracteres")
    return v


def _texto_limpio(maximo: int):
    def _v(v: object) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            raise ValueError("Debe ser texto")
        v = v.strip()
        if len(v) > maximo:
            raise ValueError(f"No puede tener más de {maximo} caracteres")
        return v
    return _v


def _rfc(v: object) -> str | None:
    v = _texto_limpio(13)(v)
    if not v:
        return None
    v = v.upper()
    # Persona moral (12) o física (13): letras/&/Ñ + fecha AAMMDD + homoclave.
    if not re.fullmatch(r"[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}", v):
        raise ValueError("RFC no válido (ej. ABC123456XY1)")
    return v


Telefono = Annotated[str | None, BeforeValidator(normalizar_telefono)]
Texto255 = Annotated[str | None, BeforeValidator(_texto_limpio(255))]
RFC = Annotated[str | None, BeforeValidator(_rfc)]
