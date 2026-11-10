"""Punto de entrada de la Lambda de OR-Tools (US-ALGO-ORTOOLS).

Recibe como `event` la misma petición JSON que `cli.py` y devuelve la respuesta de `solve` sin cambiarla.
No lee variables de entorno, ni la base de datos, ni SSM: el worker de generación es quien la invoca y quien
guarda el resultado. Una petición inválida lanza `ValueError`, que Lambda devuelve como `FunctionError`; el
worker lo trata como un fallo de OR-Tools y pasa al motor de backtracking.
"""

from cli import validate
from solver import solve


def handler(event: dict, _context: object) -> dict:
    return solve(validate(event))
