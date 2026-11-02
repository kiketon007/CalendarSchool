# Informe del paso 7 - Pruebas manuales con curl

- Fecha: 2026-11-02
- Cambio: us-prof-summary-b
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Backend de desarrollo (`node --env-file=<env sin límites de intentos> --import tsx src/server.ts`) contra `calendarschool` migrada, puerto 3000.
- Un script de bash con `curl` y `jq` que registra dos colegios por la API, prepara los datos y comprueba cada caso (31 comprobaciones); no imprime contraseñas, tokens ni cookies. Los resultados esperados están calculados a mano en sus comentarios.
- Preparación (colegio A): cuatro cursos de dos clases y dos calendarios: «Mixto» (3 sesiones de 60 min, recreo y 2 de 45: 15 de 60 y 10 de 45 a la semana) en el curso 1, y «Largo» (3 de 60 y 2 de 90) en los cursos 2 y 4; el curso 3 sin calendario. Once asignaturas, cinco profesores y las asignaciones que dan los cuatro estados. Un colegio B sin datos.

## Casos comprobados

- **Desglose por calendario** (`ProfessorLoad.calendars`), en orden de nombre del calendario:
  - Garcia: `[Mixto, 10 sesiones, 25 libres, 450–600]`.
  - Perez: `[Largo, 2, 25, 120–180]` y `[Mixto, 3, 25, 135–180]`; el curso sin calendario no tiene entrada.
  - Ruiz: `[]`.
  - Soto: `[Largo, 20, 25, 1350–1500]`.
  - Vega: `[Largo, 22, 25, 1530–1620]`.
  - Cada calendario lleva un id UUID, y la suma del desglose es el rango de cada profesor.
- **La disponibilidad cambia las sesiones libres:** con lunes a jueves bloqueados, Garcia pasa a `[Mixto, 10, 5, 450–600]` (5 libres para 10 de carga; el rango usa todas las sesiones) y su aviso `AVAILABILITY_INSUFFICIENT` coincide con el desglose (Mixto, 10 y 5).
- **Los endpoints que usa el detalle no cambian:**
  - `GET /api/calendars`: dos calendarios; «Mixto» con 6 periodos y el curso 1; «Largo» con 5 periodos y los cursos 2 y 4; los ids del resumen están entre los del colegio.
  - `GET /api/professors/{id}/availability`: cuatro tramos de lunes a jueves de 09:00 a 14:00 para Ana, y ninguno para Luis.
- **Errores y aislamiento:** `401` sin token en los calendarios, la disponibilidad y el resumen; `404 NOT_FOUND` en la disponibilidad de un profesor de otro colegio; el otro colegio ve el resumen vacío.
- **Log:** ningún evento lleva nombres de profesores.

## Resultados

- **Pasada del script:** 0 fallos a la primera (31 comprobaciones en verde, repetida una vez para comprobar que se ejecutaban).

## Estado de la base de datos

- `calendarschool` restaurada con `TRUNCATE schools CASCADE` y `rate_limit_attempts`; los recuentos coinciden con la línea base (`diff` idéntico).
- Backend parado y puerto 3000 libre.

## Resultado

- Estado del paso 7: **PASS**
- Incidencias bloqueantes: ninguna.
