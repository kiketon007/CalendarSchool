# Paso 5 - Comparación de los dos motores

- Fecha: 2026-11-09
- Cambio: us-algo-ortools-motor
- Agente: Claude

## Qué se midió

`backend/src/infrastructure/orToolsEquivalence.int.test.ts` resuelve cada problema con `BacktrackingSolver` y con `OrToolsSolver` (proceso hijo real de Python, `ortools 9.15.6755`), **sin mejora** y con un límite de 60 s. Los dos motores dan el mismo estado en los 13 problemas (11 de la tabla `test-fixtures/schedule-generation.json`, el colegio de tamaño real y el colegio sin ningún hueco libre), los horarios de los dos pasan `validateSchedule`, `OrToolsSolver` entrega siempre `engine: 'ORTOOLS'` y no registró ningún aviso de alternativa.

Es una medición informativa de una sola ejecución, en una máquina de desarrollo con Windows: no bloquea nada y no pretende ser una prueba de rendimiento.

## Tiempos (ms)

| Problema | Backtracking | OR-Tools |
|---|---:|---:|
| Colegio pequeño | 2 | 626 |
| Tutor libre en otra clase | 0 | 638 |
| Profesor con dos calendarios | 0 | 626 |
| Bloque dentro de un tramo sin recreo | 1 | 594 |
| Bloque con una sesión suelta | 0 | 605 |
| Máximo al día | 0 | 603 |
| Disponibilidad y franjas prohibidas | 0 | 586 |
| Asignatura inactiva | 0 | 603 |
| Sin celdas libres (infeasible) | 0 | 603 |
| Un único hueco para el profesor (infeasible) | 0 | 594 |
| Profesor que pasaría de 23 horas (infeasible) | 0 | 587 |
| **Colegio de tamaño real (192 lecciones)** | **10** | **1 804** |
| **Colegio sin huecos libres (12 clases de 30 sesiones)** | **485** | **2 230** |

## Lectura

- **En ninguno de estos problemas OR-Tools mejora al motor actual.** Todos se resuelven en menos de 0,5 s con el backtracking.
- **Unos 0,6 s de cada medida de OR-Tools son el arranque de Python** y la importación de `ortools` (proceso hijo nuevo en cada generación). En la Lambda de Python del cambio siguiente, ese coste solo se paga en el arranque en frío.
- El problema más difícil que hay hoy, el colegio sin huecos libres, es el único donde el motor actual tarda un tiempo apreciable (485 ms), y OR-Tools es más lento (2,2 s).
- Esto coincide con lo que dijo la historia: OR-Tools solo tiene sentido si aparece un colegio en el que el motor actual se queda corto. Estos problemas no lo muestran. Con `BACKTRACKING` por defecto, este cambio no altera nada hasta que alguien active `ORTOOLS` en un despliegue.
