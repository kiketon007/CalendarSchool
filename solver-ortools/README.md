# solver-ortools

Motor de generación de horarios con OR-Tools (CP-SAT) de US-ALGO-ORTOOLS. Es un segundo motor detrás del puerto `ScheduleSolver` del backend: el backend le envía el problema, y este encuentra un horario que cumpla las restricciones duras o dice por qué no. Las preferencias (SC1–SC4) las mejora después el backend, con la misma búsqueda local de siempre.

Se elige por despliegue con `SCHEDULE_ENGINE=ORTOOLS` (por defecto, `BACKTRACKING`). Ver `backend/CLAUDE.md`.

## Instalación

Python 3.12. Se instala en un entorno virtual, porque `ortools` exige `numpy>=2` y `protobuf>=6.33`, que chocan con otras librerías si se instalan en el Python global:

```bash
python -m venv solver-ortools/.venv
solver-ortools/.venv/Scripts/python -m pip install -r solver-ortools/requirements-dev.txt   # Windows
solver-ortools/.venv/bin/python -m pip install -r solver-ortools/requirements-dev.txt       # Linux y macOS
```

El backend lanza el motor con el ejecutable que indica `SCHEDULE_ORTOOLS_PYTHON` (en Windows, `solver-ortools/.venv/Scripts/python.exe`).

## Comandos

Desde `solver-ortools/`, con el Python del entorno virtual:

```bash
python -m pytest            # tests
python -m ruff check .      # lint
python -m ruff format .     # formato
echo '{...}' | python cli.py
```

## Contrato (versión 1)

`cli.py` lee **una petición JSON de `stdin`** y escribe **una respuesta JSON en `stdout`**. Con una petición inválida (JSON roto, otra `version`, forma incorrecta) termina con código 2, explica el error en `stderr` y no escribe nada en `stdout`.

### Petición

```json
{
  "version": 1,
  "limitSeconds": 60,
  "courses": [{ "id": "…", "cells": [{ "sessionNumber": 1, "startMinute": 540, "endMinute": 585 }] }],
  "lessons": [{ "index": 0, "courseId": "…", "classId": "…", "professorId": "…", "maxPerDay": 1, "blockSize": null }],
  "units": [{ "index": 0, "lessonIndex": 0, "size": 1, "placements": [{ "dayOfWeek": 1, "firstSession": 1 }] }]
}
```

- `courses[].cells`: las sesiones del calendario del curso (los recreos no cuentan), con su inicio y fin en minutos.
- `lessons`: una por clase y asignatura, con su profesor, el máximo de sesiones sueltas al día (1 sin regla) y el tamaño de bloque (`null` sin regla).
- `units`: lo que hay que colocar. Un bloque de `size` sesiones seguidas, o una sesión suelta (`size` 1). `placements` son los emplazamientos posibles `(día 1–5, primera sesión)`, que **ya descuentan** las franjas prohibidas (HC8), la disponibilidad del profesor (HC4) y los recreos.
- No lleva nombres de cursos, clases, asignaturas ni profesores, ni las franjas preferidas.

### Respuesta

| `status` | Cuerpo |
|---|---|
| `solved` | `placements`: un `{ unitIndex, dayOfWeek, firstSession }` por unidad, siempre uno de los emplazamientos de la petición |
| `infeasible` | Se demostró que no hay horario |
| `timeout` | Se acabó `limitSeconds` sin encontrarlo ni demostrar que no existe |
| `cancelled` | Lo paró quien llamaba (`should_stop`) |

Todas llevan `"version": 1`.

## Modelo

Una variable booleana por unidad y emplazamiento, sin función objetivo (para en la primera solución):

- **HC1:** exactamente un emplazamiento por unidad.
- **HC5:** como mucho una sesión por clase, día y sesión.
- **HC2:** un intervalo opcional por emplazamiento y `AddNoOverlap` por profesor y día, en minutos, de modo que funciona con calendarios distintos. Los intervalos son semiabiertos: que solo se toquen no es un choque.
- **HC3:** cada día, una lección tiene como mucho un bloque y, si lo tiene, ninguna suelta; si no, como mucho `maxPerDay` sueltas.
- **HC7:** para cada profesor, la suma de los minutos de las unidades colocadas no pasa de 1380 (`MAX_TEACHING_MINUTES` del backend). Si la carga mínima ya lo supera, `infeasible` sin buscar.
- **HC4, HC6 y HC8:** no se modelan. HC4 y HC8 vienen descontadas en los emplazamientos, y HC6 se cumple porque cada lección lleva su profesor. `validateSchedule`, en el backend, vuelve a comprobar las ocho.

Es determinista: `num_workers` y `random_seed` fijos con `interleave_search`. `solve(request, should_stop)` es una función pura, y `should_stop` se consulta cada 50 ms desde un hilo aparte que llama a `StopSearch()`.
