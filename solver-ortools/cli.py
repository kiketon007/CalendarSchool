"""Punto de entrada del proceso hijo: lee la petición JSON de stdin y escribe la respuesta en stdout.

Con una petición inválida (JSON roto, otra versión, forma incorrecta) termina con código 2, explica el
error en stderr y no escribe nada en stdout. Ver README.md para el contrato.
"""

import json
import sys

from solver import VERSION, solve


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate(request: object) -> dict:
    """Comprueba la forma de la petición; lanza ValueError con el campo que falla."""
    _require(isinstance(request, dict), "la petición debe ser un objeto")
    assert isinstance(request, dict)
    _require(request.get("version") == VERSION, f"version debe ser {VERSION}")
    limit = request.get("limitSeconds")
    _require(
        isinstance(limit, int | float) and not isinstance(limit, bool) and limit > 0,
        "limitSeconds debe ser un número positivo",
    )
    for key in ("courses", "lessons", "units"):
        _require(isinstance(request.get(key), list), f"{key} debe ser una lista")
    cells_by_course: dict[str, set[int]] = {}
    for course in request["courses"]:
        _require(isinstance(course, dict) and isinstance(course.get("id"), str), "courses[].id")
        _require(isinstance(course.get("cells"), list), "courses[].cells")
        for cell in course["cells"]:
            _require(
                isinstance(cell, dict)
                and all(
                    _is_int(cell.get(k)) for k in ("sessionNumber", "startMinute", "endMinute")
                ),
                "courses[].cells[]",
            )
        cells_by_course[course["id"]] = {cell["sessionNumber"] for cell in course["cells"]}
    lesson_courses: dict[int, str] = {}
    for lesson in request["lessons"]:
        _require(isinstance(lesson, dict) and _is_int(lesson.get("index")), "lessons[].index")
        for key in ("courseId", "classId", "professorId"):
            _require(isinstance(lesson.get(key), str), f"lessons[].{key}")
        _require(
            _is_int(lesson.get("maxPerDay")) and lesson["maxPerDay"] >= 1, "lessons[].maxPerDay"
        )
        _require(
            lesson.get("blockSize") is None or _is_int(lesson["blockSize"]), "lessons[].blockSize"
        )
        _require(lesson["courseId"] in cells_by_course, "lessons[].courseId desconocido")
        lesson_courses[lesson["index"]] = lesson["courseId"]
    for unit in request["units"]:
        _require(isinstance(unit, dict) and _is_int(unit.get("index")), "units[].index")
        _require(unit.get("lessonIndex") in lesson_courses, "units[].lessonIndex desconocido")
        _require(_is_int(unit.get("size")) and unit["size"] >= 1, "units[].size")
        _require(isinstance(unit.get("placements"), list), "units[].placements")
        sessions = cells_by_course[lesson_courses[unit["lessonIndex"]]]
        for placement in unit["placements"]:
            _require(
                isinstance(placement, dict)
                and _is_int(placement.get("dayOfWeek"))
                and _is_int(placement.get("firstSession")),
                "units[].placements[]",
            )
            first = placement["firstSession"]
            _require(
                all(n in sessions for n in range(first, first + unit["size"])),
                "units[].placements[] fuera de las celdas del curso",
            )
    return request


def main() -> int:
    try:
        request = validate(json.loads(sys.stdin.read()))
    except (ValueError, json.JSONDecodeError) as error:
        print(f"Petición inválida: {error}", file=sys.stderr)
        return 2
    sys.stdout.write(json.dumps(solve(request)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
