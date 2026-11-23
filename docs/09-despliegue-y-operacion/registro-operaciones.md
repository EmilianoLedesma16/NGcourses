# Bitácora de operaciones en producción

Registro de cambios hechos **a mano** sobre datos de producción (SQL directo, scripts o cambios desde el
panel que no quedan en git). Cada entrada debe decir qué se tocó, el estado antes y después, en qué se
basó la decisión y cómo revertirlo.

Formato sugerido para nuevas entradas:

```markdown
## AAAA-MM-DD · Título corto
- Entorno: producción / local
- Qué se cambió (tablas y columnas):
- Antes:
- Después:
- Motivo / quién lo pidió:
- Cómo revertir:
```

---

## 2026-11-19 · Orden de cursos dentro de los procesos RAM

- **Entorno**: producción y local.
- **Qué se cambió**: solo `cursos.orden_en_padre` de los subcursos de tres procesos (cursos globales). No
  se borró ni movió ningún curso, módulo o lección. Los procesos Reparación y Limpieza y los cursos de
  NextGenIA (Excel, etc.) no se tocaron.

### Antes

| Proceso | Orden anterior |
|---|---|
| Testeo | 1 Desensamble (91aad315), 2 Quitar tapa (c0efbbc9), 3 Test Funcional (bfc540b5), 4 Escaneo (bf519185), 5 Test Inicial (e1a86e59), 6 Test Visual (2e32ae0d) |
| Cosmética | 1 Lijado (c9d84015), 2 Serigrafía (c0c343f5), 3 Pintura (d4a520f9) |
| Laboratorio | 1 Ensamble (6c8f26a4), 2 Etiqueta (12332c97), 3 Retest (628c1b1b) |

### Después

| Proceso | Orden nuevo |
|---|---|
| Testeo | 1 Test Inicial, 2 Test Visual, 3 Test Funcional, 4 Escaneo, 5 Quitar tapa, 6 Desensamble |
| Cosmética | 1 Lijado, 2 Pintura, 3 Serigrafía |
| Laboratorio | 1 Etiqueta, 2 Ensamble, 3 Retest |

- **Motivo**: orden general de procesos de la empresa (Test → Lavado → Lavado de tarjeta → Lijado →
  Pintura → Liberación → Retest → Empaque). Supuestos: Escaneo después de Test Funcional; Quitar tapa antes
  de Desensamble; Serigrafía al final de Cosmética.
- **Cómo revertir**: Admin → Cursos → editar el proceso → flechas de orden, o reasignar los números de la
  tabla "Antes" (`PUT /api/v1/cursos/{id}/subcursos` con la lista en el orden anterior).
