"""Modelo de CP-SAT de las restricciones duras de un horario (US-ALGO-ORTOOLS).

Función pura: recibe la petición ya validada (ver README.md) y devuelve la respuesta. No lee ni escribe
nada fuera de ella. HC4 (disponibilidad) y HC8 (franjas prohibidas) ya vienen descontadas de los
emplazamientos de cada unidad, y HC6 y HC7 no dependen de dónde se coloque nada, así que aquí solo se
modelan HC1, HC2, HC3, HC5 y HC7.
"""

import threading
from collections import defaultdict
from collections.abc import Callable

from ortools.sat.python import cp_model

VERSION = 1
# Sin función objetivo, CP-SAT para en la primera solución. Una semilla y un número de hilos fijos, con
# `interleave_search`, hacen que la misma petición dé la misma respuesta.
NUM_WORKERS = 8
# HC7: 23 horas lectivas por profesor y semana. Es `MAX_TEACHING_MINUTES` del backend (un test lo compara).
MAX_TEACHING_MINUTES = 1380
RANDOM_SEED = 0
POLL_SECONDS = 0.05


def _answer(status: str, **extra) -> dict:
    return {"version": VERSION, "status": status, **extra}


def solve(request: dict, should_stop: Callable[[], bool] | None = None) -> dict:
    """Busca un horario que cumpla HC1, HC2, HC3 y HC5, o dice por qué no."""
    units = request["units"]
    if any(not unit["placements"] for unit in units):
        return _answer("infeasible")

    lessons = {lesson["index"]: lesson for lesson in request["lessons"]}
    cells = {
        course["id"]: {cell["sessionNumber"]: cell for cell in course["cells"]}
        for course in request["courses"]
    }

    model = cp_model.CpModel()
    chosen: dict[tuple[int, int], cp_model.IntVar] = {}  # (unidad, posición del emplazamiento)
    class_slots: dict[tuple, list] = defaultdict(list)  # (clase, día, sesión) -> variables
    professor_spans: dict[tuple, list] = defaultdict(list)  # (profesor, día) -> intervalos
    professor_minutes: dict[str, list] = defaultdict(list)  # profesor -> (variable, minutos)
    lesson_days: dict[tuple, dict[str, list]] = defaultdict(lambda: {"blocks": [], "singles": []})

    for unit in units:
        lesson = lessons[unit["lessonIndex"]]
        course_cells = cells[lesson["courseId"]]
        variables = []
        for position, placement in enumerate(unit["placements"]):
            literal = model.NewBoolVar(f"u{unit['index']}p{position}")
            chosen[(unit["index"], position)] = literal
            variables.append(literal)
            day, first = placement["dayOfWeek"], placement["firstSession"]
            last = first + unit["size"] - 1
            for number in range(first, last + 1):
                class_slots[(lesson["classId"], day, number)].append(literal)
            start = course_cells[first]["startMinute"]
            end = course_cells[last]["endMinute"]
            professor_spans[(lesson["professorId"], day)].append(
                model.NewOptionalFixedSizeIntervalVar(
                    start, end - start, literal, f"i{unit['index']}p{position}"
                )
            )
            professor_minutes[lesson["professorId"]].append((literal, end - start))
            kind = "blocks" if unit["size"] > 1 else "singles"
            lesson_days[(lesson["index"], day)][kind].append(literal)
        model.AddExactlyOne(variables)  # HC1

    for literals in class_slots.values():  # HC5
        if len(literals) > 1:
            model.AddAtMostOne(literals)

    for (
        intervals
    ) in professor_spans.values():  # HC2: intervalos [inicio, fin), tocarse no es chocar
        if len(intervals) > 1:
            model.AddNoOverlap(intervals)

    for entries in professor_minutes.values():  # HC7: los minutos dependen de dónde se coloque
        model.Add(sum(literal * minutes for literal, minutes in entries) <= MAX_TEACHING_MINUTES)

    for (lesson_index, day), groups in lesson_days.items():  # HC3
        maximum = lessons[lesson_index]["maxPerDay"]
        singles = sum(groups["singles"]) if groups["singles"] else 0
        if groups["blocks"]:
            has_block = model.NewBoolVar(f"block{lesson_index}_{day}")
            model.Add(sum(groups["blocks"]) == has_block)
            if groups["singles"]:
                model.Add(singles == 0).OnlyEnforceIf(has_block)
                model.Add(singles <= maximum).OnlyEnforceIf(has_block.Not())
        elif groups["singles"]:
            model.Add(singles <= maximum)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(request["limitSeconds"])
    solver.parameters.num_workers = NUM_WORKERS
    solver.parameters.interleave_search = True
    solver.parameters.random_seed = RANDOM_SEED

    stopped = threading.Event()
    done = threading.Event()

    def watch() -> None:
        while not done.wait(POLL_SECONDS):
            if should_stop is not None and should_stop():
                stopped.set()
                solver.StopSearch()
                return

    watcher = None
    if should_stop is not None:
        watcher = threading.Thread(target=watch, daemon=True)
        watcher.start()
    try:
        status = solver.Solve(model)
    finally:
        done.set()
        if watcher is not None:
            watcher.join()

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        placements = []
        for unit in units:
            for position, placement in enumerate(unit["placements"]):
                if solver.BooleanValue(chosen[(unit["index"], position)]):
                    placements.append(
                        {
                            "unitIndex": unit["index"],
                            "dayOfWeek": placement["dayOfWeek"],
                            "firstSession": placement["firstSession"],
                        }
                    )
                    break
        return _answer("solved", placements=placements)
    if status == cp_model.INFEASIBLE:
        return _answer("infeasible")
    if status == cp_model.UNKNOWN:
        return _answer("cancelled" if stopped.is_set() else "timeout")
    raise ValueError(f"El modelo no es válido ({solver.StatusName(status)})")
