"""Ayudantes de los tests: construyen peticiones y comprueban un horario sin usar el modelo."""

from collections import defaultdict

DAYS = range(1, 6)
MAX_TEACHING_MINUTES = 1380  # 23 horas, como en el backend


def course(
    course_id: str,
    sessions: int = 5,
    minutes: int = 45,
    start: int = 540,
    breaks_after: tuple[int, ...] = (),
) -> dict:
    """Un curso con `sessions` sesiones seguidas; `breaks_after` deja 20 minutos tras esas sesiones."""
    cells, cursor = [], start
    for number in range(1, sessions + 1):
        cells.append(
            {"sessionNumber": number, "startMinute": cursor, "endMinute": cursor + minutes}
        )
        cursor += minutes + (20 if number in breaks_after else 0)
    return {"id": course_id, "cells": cells}


def lesson(
    index: int,
    course_id: str,
    class_id: str,
    professor_id: str,
    max_per_day: int = 1,
    block_size: int | None = None,
) -> dict:
    return {
        "index": index,
        "courseId": course_id,
        "classId": class_id,
        "professorId": professor_id,
        "maxPerDay": max_per_day,
        "blockSize": block_size,
    }


def unit(
    index: int,
    lesson_index: int,
    size: int = 1,
    placements: list[tuple[int, int]] | None = None,
    sessions: int = 5,
    days: tuple[int, ...] = (1, 2, 3, 4, 5),
) -> dict:
    """Una unidad; sin `placements`, todos los de `days` y primeras sesiones que caben en `sessions`."""
    if placements is None:
        placements = [(d, s) for d in days for s in range(1, sessions - size + 2)]
    return {
        "index": index,
        "lessonIndex": lesson_index,
        "size": size,
        "placements": [{"dayOfWeek": d, "firstSession": s} for d, s in placements],
    }


def request(courses: list[dict], lessons: list[dict], units: list[dict], limit: float = 30) -> dict:
    return {
        "version": 1,
        "limitSeconds": limit,
        "courses": courses,
        "lessons": lessons,
        "units": units,
    }


def chosen(req: dict, response: dict) -> dict[int, tuple[int, int]]:
    """unitIndex -> (día, primera sesión) de una respuesta `solved`."""
    assert response["status"] == "solved", response
    return {p["unitIndex"]: (p["dayOfWeek"], p["firstSession"]) for p in response["placements"]}


def violations(req: dict, response: dict) -> list[str]:
    """HC1, HC2, HC3, HC5 y que cada emplazamiento sea del dominio, calculados aparte del modelo."""
    picks = chosen(req, response)
    found: list[str] = []
    units = {u["index"]: u for u in req["units"]}
    lessons = {x["index"]: x for x in req["lessons"]}
    courses = {
        c["id"]: {cell["sessionNumber"]: cell for cell in c["cells"]} for c in req["courses"]
    }
    if set(picks) != set(units):
        found.append("HC1")
    class_cells: dict[tuple, int] = defaultdict(int)
    prof_spans: dict[tuple, list[tuple[int, int]]] = defaultdict(list)
    per_day: dict[tuple, dict[str, int]] = defaultdict(lambda: {"blocks": 0, "singles": 0})
    for idx, (day, first) in picks.items():
        u = units[idx]
        domain = {(p["dayOfWeek"], p["firstSession"]) for p in u["placements"]}
        if (day, first) not in domain:
            found.append("DOMAIN")
        lsn = lessons[u["lessonIndex"]]
        cells = courses[lsn["courseId"]]
        for number in range(first, first + u["size"]):
            class_cells[(lsn["classId"], day, number)] += 1
        start = cells[first]["startMinute"]
        end = cells[first + u["size"] - 1]["endMinute"]
        prof_spans[(lsn["professorId"], day)].append((start, end))
        key = (lsn["index"], day)
        per_day[key]["blocks" if u["size"] > 1 else "singles"] += 1
    if any(n > 1 for n in class_cells.values()):
        found.append("HC5")
    for spans in prof_spans.values():
        ordered = sorted(spans)
        if any(
            a_end > b_start for (_, a_end), (b_start, _) in zip(ordered, ordered[1:], strict=False)
        ):
            found.append("HC2")
    minutes: dict[str, int] = defaultdict(int)
    for (professor, _day), spans in prof_spans.items():
        minutes[professor] += sum(end - start for start, end in spans)
    if any(total > MAX_TEACHING_MINUTES for total in minutes.values()):
        found.append("HC7")
    for (lesson_index, _day), count in per_day.items():
        maximum = lessons[lesson_index]["maxPerDay"]
        if (
            count["blocks"] > 1
            or (count["blocks"] == 1 and count["singles"] > 0)
            or count["singles"] > maximum
        ):
            found.append("HC3")
    return found
