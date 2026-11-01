# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-11-01
- Cambio: us-prof-summary
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/professorsSummary.cy.ts` (spec nueva), dos veces: la primera con 1 fallo, la segunda limpia.
- `npm run test:e2e` (suite completa, headless).
- `npm run typecheck -w frontend` y ESLint sobre la spec.

## Escenarios de `professorsSummary.cy.ts` (describe «Resumen de carga de los profesores»)

El colegio se crea entero por la API: tres cursos de dos clases (1º Primaria con el calendario «Mixto», 3º Primaria con «Largo» y 6º Primaria sin calendario), siete asignaturas, cuatro profesores y sus asignaciones; Ana García no puede de lunes a jueves.

1. **Abrir desde «Profesores» y ver el resumen:** el enlace «Resumen de carga» lleva a `/profesores/resumen`; cuatro profesores y «4 profesores»; Ana, «7 h 30 min – 10 h», «Cabe» y «En «Mixto» tiene 10 sesiones y solo puede dar 5»; Eva, «2 h 15 min – 3 h» y «1 asignación en 6º Primaria, que no tiene calendario, no se cuenta»; Luis, «Sin carga» y «—»; Pedro, «22 h 30 min – 25 h», «Puede pasar de 23 h» y su aviso; y el aviso de los cursos sin profesor (1º: 1; 3º: 4; 6º: 1).
2. **Enlaces:** «1º Primaria: 1 sin profesor» lleva a `/cursos/{id}/profesores`; «Editar la disponibilidad de García, Ana» lleva a `/profesores/{id}/disponibilidad`.
3. **Filtros:** por estado (1 profesor, «1 profesor»), volver a «Todos», por asignatura (Lengua: solo Ana), búsqueda «perez», «Solo con avisos» (3 filas, sin Luis), un resultado vacío con «No hay profesores que coincidan» y «Limpiar filtros», que devuelve el foco a la búsqueda.
4. **Un `MEMBER`:** ve el mismo resumen (cuatro filas y los avisos).
5. **360 px:** tarjetas en lugar de tabla, con los datos de Pedro, sin desplazamiento horizontal, también filtrando por estado.

## Specs existentes (11.2)

- Ninguna comprobaba el conjunto de enlaces de la cabecera de `/profesores`; no hizo falta cambiar nada y la suite completa lo confirma.

## Resultados

- **Spec nueva, primera ejecución:** 4 de 5. Falló el tercero porque busqué «Limpiar filtros» con un resultado visible; ese botón solo aparece cuando no hay coincidencias (así lo dice la spec y lo comprueban los tests de la página). Era una expectativa errónea de la spec, no un fallo de la página. Se corrigió (se vuelve a «Todos» desde el selector y el foco se comprueba al limpiar desde el resultado vacío).
- **Spec nueva, segunda ejecución:** 5 de 5.
- **Suite completa:** 319 de 319 (314 anteriores y 5 nuevos), 0 fallos, 5 min 54 s.
- **Puertos:** 3000, 3001 y 4173 libres tras la ejecución.

## Base de datos

- El E2E deja datos en `calendarschool_test` (por diseño solo limpia al empezar). Se vaciaron con `TRUNCATE ... CASCADE` y la comparación con `diff` coincide con la línea base del paso 9.

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
