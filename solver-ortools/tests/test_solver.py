import random

from solver import solve
from tests.helpers import chosen, course, lesson, request, unit, violations


def test_hc1_exactly_one_placement_per_unit():
    req = request(
        [course("c1")], [lesson(0, "c1", "a", "p1")], [unit(0, 0), unit(1, 0), unit(2, 0)]
    )
    answer = solve(req)
    assert answer["status"] == "solved"
    assert len(chosen(req, answer)) == 3
    assert violations(req, answer) == []


def test_hc5_one_subject_per_class_and_slot():
    # Una clase con una sola celda libre al día: dos lecciones tienen que ir en días distintos.
    cells = [(d, 1) for d in range(1, 6)]
    req = request(
        [course("c1", sessions=1)],
        [lesson(0, "c1", "a", "p1"), lesson(1, "c1", "a", "p2")],
        [unit(0, 0, placements=cells), unit(1, 1, placements=cells)],
    )
    answer = solve(req)
    picks = chosen(req, answer)
    assert picks[0] != picks[1]
    assert violations(req, answer) == []


def test_hc2_professor_not_in_two_places_with_different_calendars():
    # El curso A tiene sesiones de 45 min y el B de 60 min desde las 9:00. El mismo profesor solo
    # puede dar las dos lecciones de 1 sesión si no se solapan en hora: lunes en las dos primeras
    # sesiones sería un choque, así que se le deja un único día en el que encajan sin solaparse.
    a = course("ca", sessions=2, minutes=45, start=540)  # 9:00-9:45, 9:45-10:30
    b = course("cb", sessions=2, minutes=60, start=540)  # 9:00-10:00, 10:00-11:00
    req = request(
        [a, b],
        [lesson(0, "ca", "a", "p1"), lesson(1, "cb", "b", "p1")],
        [unit(0, 0, placements=[(1, 1), (1, 2)]), unit(1, 1, placements=[(1, 1), (1, 2)])],
    )
    answer = solve(req)
    picks = chosen(req, answer)
    # (A,2) 9:45-10:30 choca con (B,1) 9:00-10:00 y con (B,2) 10:00-11:00; (A,1) 9:00-9:45 solo con (B,1).
    assert picks == {0: (1, 1), 1: (1, 2)}
    assert violations(req, answer) == []


def test_hc2_touching_intervals_are_not_a_clash():
    # Sesiones seguidas del mismo profesor en clases distintas: terminan y empiezan en el mismo minuto.
    req = request(
        [course("c1", sessions=2)],
        [lesson(0, "c1", "a", "p1"), lesson(1, "c1", "b", "p1")],
        [unit(0, 0, placements=[(1, 1)], sessions=2), unit(1, 1, placements=[(1, 2)], sessions=2)],
    )
    answer = solve(req)
    assert answer["status"] == "solved"
    assert violations(req, answer) == []


def test_hc3_block_does_not_cross_the_break():
    # 3 sesiones, recreo tras la 2.ª; un bloque de 2 solo cabe empezando en la 1.ª (dominio ya filtrado).
    c = course("c1", sessions=3, breaks_after=(2,))
    req = request(
        [c],
        [lesson(0, "c1", "a", "p1", block_size=2)],
        [unit(0, 0, size=2, placements=[(d, 1) for d in range(1, 6)])],
    )
    answer = solve(req)
    assert all(first == 1 for _day, first in chosen(req, answer).values())
    assert violations(req, answer) == []


def test_hc3_day_with_a_block_has_no_singles():
    # Lección de 3 sesiones con bloque de 2: un bloque y una suelta, en días distintos.
    req = request(
        [course("c1")],
        [lesson(0, "c1", "a", "p1", max_per_day=2, block_size=2)],
        [unit(0, 0, size=2, days=(1,)), unit(1, 0, size=1, days=(1, 2))],
    )
    answer = solve(req)
    picks = chosen(req, answer)
    assert picks[0][0] == 1
    assert picks[1][0] == 2
    assert violations(req, answer) == []


def test_hc3_max_per_day_of_two():
    # 5 sueltas con máximo 2 al día: nunca más de 2 el mismo día.
    req = request(
        [course("c1")], [lesson(0, "c1", "a", "p1", max_per_day=2)], [unit(i, 0) for i in range(5)]
    )
    answer = solve(req)
    days = [day for day, _first in chosen(req, answer).values()]
    assert max(days.count(d) for d in set(days)) <= 2
    assert violations(req, answer) == []


def test_infeasible_when_two_lessons_share_the_only_slot_of_a_professor():
    only = [(1, 1)]
    req = request(
        [course("c1")],
        [lesson(0, "c1", "a", "p1"), lesson(1, "c1", "b", "p1")],
        [unit(0, 0, placements=only), unit(1, 1, placements=only)],
    )
    assert solve(req) == {"version": 1, "status": "infeasible"}


def test_infeasible_when_a_unit_has_no_placements():
    req = request([course("c1")], [lesson(0, "c1", "a", "p1")], [unit(0, 0, placements=[])])
    assert solve(req) == {"version": 1, "status": "infeasible"}


def big_problem(classes: int = 40, seed: int = 7) -> dict:
    """Muchas clases compartiendo pocos profesores: grande para un límite de 1 ms."""
    rng = random.Random(seed)
    courses_ = [course(f"c{i}", sessions=6) for i in range(classes)]
    lessons_, units_ = [], []
    for i in range(classes):
        for _ in range(5):
            li = len(lessons_)
            lessons_.append(lesson(li, f"c{i}", f"k{i}", f"p{rng.randrange(12)}", max_per_day=2))
            for _ in range(3):
                units_.append(unit(len(units_), li, sessions=6))
    return request(courses_, lessons_, units_)


def test_timeout_when_the_limit_is_tiny():
    req = big_problem() | {"limitSeconds": 0.001}
    assert solve(req) == {"version": 1, "status": "timeout"}


def test_cancelled_when_should_stop_turns_true():
    req = big_problem(classes=80)
    answer = solve(req | {"limitSeconds": 60}, should_stop=lambda: True)
    assert answer == {"version": 1, "status": "cancelled"}


def test_same_request_gives_the_same_answer():
    req = big_problem(classes=6)
    first = solve(req)
    assert first["status"] == "solved"
    assert violations(req, first) == []
    for _ in range(3):
        assert solve(req) == first


def long_course(course_id: str) -> dict:
    """Una celda larga (700 minutos) y otra corta (60)."""
    return {
        "id": course_id,
        "cells": [
            {"sessionNumber": 1, "startMinute": 0, "endMinute": 700},
            {"sessionNumber": 2, "startMinute": 700, "endMinute": 760},
        ],
    }


def test_hc7_over_23_hours_is_infeasible_even_without_overlaps():
    # Dos lecciones de un profesor en días distintos, solo con la celda larga: 700 + 700 = 1400 > 1380.
    req = request(
        [long_course("c1"), long_course("c2")],
        [lesson(0, "c1", "a", "p1"), lesson(1, "c2", "b", "p1")],
        [
            unit(0, 0, placements=[(1, 1)], sessions=2),
            unit(1, 1, placements=[(2, 1)], sessions=2),
        ],
    )
    assert solve(req) == {"version": 1, "status": "infeasible"}


def test_hc7_forces_the_short_placement_to_stay_under_the_limit():
    # La primera lección puede ir en la celda larga (700) o en la corta (60); la segunda solo en la larga.
    # 700 + 700 pasa de 1380, así que la primera tiene que ir en la corta.
    req = request(
        [long_course("c1"), long_course("c2")],
        [lesson(0, "c1", "a", "p1"), lesson(1, "c2", "b", "p1")],
        [
            unit(0, 0, placements=[(1, 1), (1, 2)], sessions=2),
            unit(1, 1, placements=[(2, 1)], sessions=2),
        ],
    )
    answer = solve(req)
    assert chosen(req, answer)[0] == (1, 2)
    assert violations(req, answer) == []


def test_hc7_exactly_the_limit_is_allowed():
    # 690 + 690 = 1380: justo el máximo.
    cells = {"id": "c1", "cells": [{"sessionNumber": 1, "startMinute": 0, "endMinute": 690}]}
    other = {"id": "c2", "cells": [{"sessionNumber": 1, "startMinute": 0, "endMinute": 690}]}
    req = request(
        [cells, other],
        [lesson(0, "c1", "a", "p1"), lesson(1, "c2", "b", "p1")],
        [unit(0, 0, placements=[(1, 1)], sessions=1), unit(1, 1, placements=[(2, 1)], sessions=1)],
    )
    assert solve(req)["status"] == "solved"
