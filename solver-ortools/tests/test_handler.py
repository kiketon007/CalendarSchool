import pytest

from handler import handler
from solver import solve
from tests.helpers import chosen, course, lesson, request, unit, violations


def small_request() -> dict:
    return request(
        [course("c1")],
        [lesson(0, "c1", "a", "p1"), lesson(1, "c1", "b", "p1")],
        [unit(0, 0), unit(1, 1)],
    )


def test_handler_answers_the_same_as_solve():
    req = small_request()
    answer = handler(req, None)
    assert answer["status"] == "solved"
    assert answer == solve(req)
    assert violations(req, answer) == []
    assert len(chosen(req, answer)) == 2


def test_handler_answers_infeasible_like_solve():
    req = request(
        [course("c1")],
        [lesson(0, "c1", "a", "p1"), lesson(1, "c1", "b", "p1")],
        [unit(0, 0, placements=[(1, 1)]), unit(1, 1, placements=[(1, 1)])],
    )
    assert handler(req, None) == {"version": 1, "status": "infeasible"}


def test_handler_rejects_another_version_naming_the_field():
    with pytest.raises(ValueError, match="version"):
        handler(small_request() | {"version": 2}, None)


def test_handler_rejects_a_wrong_shape():
    req = small_request()
    del req["units"]
    with pytest.raises(ValueError, match="units"):
        handler(req, None)
