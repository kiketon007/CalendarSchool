"""La imagen de la Lambda (Dockerfile y .dockerignore): se comprueban como texto, sin construirla."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCKERFILE = (ROOT / "Dockerfile").read_text(encoding="utf-8")
DOCKERIGNORE = {
    line.strip()
    for line in (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
    if line.strip() and not line.startswith("#")
}


def test_dockerfile_starts_from_the_lambda_python_312_base_image():
    first = next(line for line in DOCKERFILE.splitlines() if line.startswith("FROM"))
    assert first == "FROM public.ecr.aws/lambda/python:3.12"


def test_dockerfile_installs_only_the_runtime_requirements():
    assert "requirements.txt" in DOCKERFILE
    assert "requirements-dev.txt" not in DOCKERFILE


def test_dockerfile_copies_the_solver_files_and_sets_the_handler():
    copied = " ".join(line for line in DOCKERFILE.splitlines() if line.startswith("COPY"))
    for name in ("solver.py", "cli.py", "handler.py"):
        assert name in copied
    assert 'CMD ["handler.handler"]' in DOCKERFILE


def test_dockerfile_does_not_copy_the_tests_nor_the_virtual_environment():
    assert "tests" not in DOCKERFILE
    assert ".venv" not in DOCKERFILE


def test_dockerignore_leaves_out_what_is_for_development():
    for excluded in (
        ".venv",
        "tests",
        "__pycache__",
        ".pytest_cache",
        ".ruff_cache",
        "requirements-dev.txt",
    ):
        assert excluded in DOCKERIGNORE, excluded
