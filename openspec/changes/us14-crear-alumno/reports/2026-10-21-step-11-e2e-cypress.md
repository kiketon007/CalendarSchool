# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-10-21
- Cambio: us14-crear-alumno
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec "cypress/e2e/students.cy.ts,cypress/e2e/courses.cy.ts"` (headless).
- `npm run test:e2e` completo.

## Resultados

- `students.cy.ts` (nuevo): **8** tests, todos pasan. `courses.cy.ts`: **30** tests (1 nuevo), todos pasan.
- Suite completa: 16 specs, **178** tests (antes 169), todos pasan.
- Casos nuevos de `students.cy.ts`:
  - Crear un alumno con clase, comedor, beca, tipo de comida y observaciones: aviso «Alumno «Juan García» creado», fila «García, Juan | 1º Primaria A | Sí · Con beca» y ni el tipo de comida ni las observaciones en el listado.
  - Crear uno sin clase y sin comedor: «1º Primaria · Sin clase» y «No», y el tipo de comida no existe en el formulario.
  - Las clases ofrecidas son solo las del curso elegido, y vuelven a «Sin clase» al cambiar de curso.
  - Validación antes de enviar: errores de nombre, apellidos, curso y comedor, el foco en «Nombre» y ninguna petición.
  - El curso que otra persona borra por la API antes de guardar: `400`, «Ese curso ya no existe. Elige otro», el foco en el curso, lo escrito conservado y la lista de cursos recargada.
  - Un `MEMBER` crea un alumno.
  - 360 px: formulario con un apellido largo y observaciones largas, y listado en tarjetas, sin desplazamiento horizontal.
  - Un visitante sin sesión va a `/login`.
- Caso nuevo de `courses.cy.ts`: borrar un curso con 3 alumnos (con y sin clase) — el diálogo dice «Tiene 3 alumnos asignados», el aviso «… 3 alumnos quedan sin curso» y `/alumnos` los muestra «Sin curso».
- Ajuste de un test existente de `courses.cy.ts`: la comprobación de que la página no muestra «horario» ni «alumnos» se limita a `main`, porque la cabecera ya enlaza a «Alumnos» (conserva lo que comprobaba: que `/cursos` no tiene columnas ni acciones de historias futuras).
- Un error propio durante el desarrollo: `cy.contains('label', 'No')` encontraba antes la etiqueta «Nombre»; se resolvió con la expresión `/^No$/`.

## Base de datos de test

- Tras el E2E, `calendarschool_test.public` conservaba los datos de la ejecución (el E2E solo limpia al empezar). Se restauró con `cleanE2eData` y los recuentos quedaron a 0. Desde esta migración, `public` de la base de test también tiene la tabla `students`, así que la línea base de los recuentos incluye ese esquema (todo a 0 salvo `municipalities`, 542). Sin cambios en `scripts/` (el script temporal se eliminó).

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
