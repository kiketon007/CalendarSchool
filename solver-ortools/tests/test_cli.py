import json
import subprocess
import sys
from pathlib import Path

from tests.helpers import course, lesson, request, unit

CLI = Path(__file__).resolve().parent.parent / "cli.py"


def run_cli(payload: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(CLI)],
        input=payload,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def minimal() -> dict:
    return request([course("c1")], [lesson(0, "c1", "a", "p1")], [unit(0, 0)])


def test_valid_request_answers_solved_with_version():
    done = run_cli(json.dumps(minimal()))
    assert done.returncode == 0, done.stderr
    answer = json.loads(done.stdout)
    assert answer["version"] == 1
    assert answer["status"] == "solved"
    assert len(answer["placements"]) == 1


def test_unknown_version_exits_with_error_and_empty_stdout():
    bad = minimal() | {"version": 2}
    done = run_cli(json.dumps(bad))
    assert done.returncode != 0
    assert "version" in done.stderr
    assert done.stdout == ""


def test_invalid_shape_exits_with_error_and_empty_stdout():
    bad = minimal()
    del bad["units"]
    done = run_cli(json.dumps(bad))
    assert done.returncode != 0
    assert done.stderr != ""
    assert done.stdout == ""


def test_invalid_json_exits_with_error():
    done = run_cli("{no es json")
    assert done.returncode != 0
    assert done.stdout == ""
