# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-10-29
- Cambio: us19-carga-horaria-por-curso
- Agente: Claude (Sonnet 5.5)

## Comandos ejecutados

- `npm run typecheck -w frontend` y `npm run lint -w frontend` (el spec nuevo se comprueba con los tipos de Cypress): 0. El lint avisó de un encadenamiento inseguro (`scrollIntoView().should(...)`), que se separó en dos comandos.
- `npm run test:e2e -- --spec cypress/e2e/workload.cy.ts`: compila, migra la base de test, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless. **Salida 0, 7/7.**
- `npm run test:e2e` (todos los specs): **salida 0, 261/261** en 4 min 40 s.

## Spec nuevo: `cypress/e2e/workload.cy.ts` (7 tests)

1. Abrir «Carga horaria» desde `/cursos`; el botón «Guardar» está deshabilitado al abrir, se habilita al cambiar y se deshabilita al deshacer; se sube una asignatura, se añade otra (que se imparte en otro curso) y se quita una tercera; el balance pasa de «4 de 30» a «7 de 30» antes de guardar; el `PATCH` lleva solo las tres filas cambiadas; tras guardar aparece «Carga de 1º Primaria guardada»; y en `/asignaturas` las tarjetas muestran «1º Primaria: 4 sesiones», «1º Primaria: 3 sesiones» y «2º Primaria: 2 sesiones», y la asignatura quitada dice «Sin cursos».
2. Una carga que no cabe (calendario de una sesión al día): «10 de 5 sesiones a la semana», barra en color de peligro (`bg-danger`) y el aviso «La carga supera en 5 las sesiones del calendario …»; se guarda igualmente (`200`) y, al recargar, el aviso sigue.
3. Un curso sin calendario: el aviso con el enlace a «Calendarios» (`/calendarios`), solo el total asignado («2 sesiones asignadas a la semana»), sin «N de M» ni barra, y se puede guardar.
4. Otra persona borra el curso mientras se edita: al guardar el `PATCH` responde `404` y la página muestra «Este curso no existe o ya no está disponible» con el enlace a «Cursos», sin selectores.
5. Un colegio sin asignaturas: «Todavía no hay asignaturas» con el enlace a `/asignaturas/nueva` y sin «Guardar».
6. Un `MEMBER` real (creado con la tarea `createUser`): ve el balance y «Inglés: 2 sesiones» y «Lengua: 2 sesiones» como texto, el aviso de solo administradores, y ni selectores ni «Guardar».
7. A 360 px: la lista de cursos (con el enlace «Carga horaria») y la carga, con los dos selectores visibles (uno con un nombre de asignatura muy largo) y sin desplazamiento horizontal.

Cada `cy.intercept` se registra una sola vez en el `beforeEach`.

## Resultado del E2E completo

`calendars` 25, `courses` 34, `csp` 11, `health` 1, `home` 1, `invitation-acceptance` 4, `invitations` 2, `login` 21, `logout` 6, `onboarding` 4, `password-reset` 5, `professors` 29, `registration` 33, `session` 13, `students` 32, `subjects` 23, `users-management` 4, `users` 6 y `workload` 7: **261 pasan, 0 fallan**. Los 254 anteriores siguen en verde (incluido `courses.cy.ts`, que no necesitó cambios con el enlace nuevo) y se suman los 7 nuevos.

## Verificación de la base de datos

- Tras el E2E, `calendarschool_test.public` tenía los datos de la ejecución (el E2E limpia al empezar, nunca al terminar): 216 colegios, 244 usuarios, 144 cursos, 203 clases, 36 asignaturas con 37 filas de `subject_courses`, 29 calendarios con 177 periodos, 141 alumnos, 110 profesores, entre otros.
- Se vaciaron esas tablas (`TRUNCATE … CASCADE`, salvo `municipalities` y `_prisma_migrations`). El recuento por tabla coincide con la línea base del paso 9 (`diff` vacío). La base de desarrollo no se tocó.
- Ningún proceso escucha ya en los puertos 3001 y 4173.

## Resultado

- Estado del paso 11: **PASA**.
- Problemas que bloqueen: ninguno.
