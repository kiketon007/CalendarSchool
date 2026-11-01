## Context

US-PROF-ASSIGN creó `professor_assignments` con `ON DELETE CASCADE` desde `subject_courses`, `classes (id, course_id)`, `professors` y, por ellas, desde `subjects` y `courses`. Las asignaciones caen hoy sin aviso. US19_b resolvió lo mismo para las reglas de reparto con un `constraintCount` en `CourseWorkloadSubject`, `SubjectCourse` y `CourseImpact`, avisos en la carga, la edición de la asignatura y los diálogos de borrado, y `constraint_count` en `COURSE_DELETED`. Esta historia repite ese patrón con las asignaciones y lo extiende a dos sitios más: quitar una clase (`ConfirmRemoveClassModal`, que hoy solo se abre con alumnos) y borrar un profesor (`DeleteProfessorModal`, que ya pide el profesor con sus `subjects`).

Prisma ya tiene las relaciones inversas `assignments` en `SubjectCourse`, `SchoolClass` y `Professor`, así que los recuentos son `_count` sin migración.

## Goals / Non-Goals

**Goals:**
- Un `assignmentCount` requerido en `CourseWorkloadSubject`, `SubjectCourse`, `SchoolClass` y `CourseImpact`, contado en la misma consulta que ya existe.
- Avisos en las seis pantallas con un único vocabulario («asignaciones de profesores») y, donde se suman a las reglas, una sola frase compuesta.
- `assignment_count` en `COURSE_DELETED`, `SUBJECT_DELETED` y `PROFESSOR_DELETED`.

**Non-Goals:**
- Impedir el cambio, pedir una segunda confirmación o deshacerlo.
- Recuentos en los listados de asignaturas y cursos (US-PROF-SUMMARY).
- Cambiar la respuesta del `DELETE` de asignatura o de profesor.
- Avisar de horarios generados (US-ALGO).

## Decisions

### 1. El recuento en el esquema existente, no en un endpoint de impacto nuevo
Cada pantalla ya recibe el objeto donde va el número (la fila de la carga, el curso de la asignatura, la clase del curso, el impacto del curso, el profesor con `subjects`). Añadir el campo evita peticiones extra y estados de carga nuevos en los diálogos.
- *Alternativa descartada:* `GET /api/subjects/{id}/impact` y `GET /api/professors/{id}/impact`. Más superficie de API y un estado «Comprobando…» más en `DeleteSubjectModal`, que hoy abre sin pedir nada.
- El campo es **requerido** (como `constraintCount`): los servicios del frontend lo validan de forma estricta y un backend antiguo da `unavailable` en lugar de avisos falsos a 0. El coste es tocar los fixtures que construyen esos objetos.

### 2. Capas
- **Dominio** (`domain/workload`, `domain/subject`, `domain/course`, `domain/professor`): `assignmentCount` en los tipos de lectura y en `CourseImpact`; `DeletedProfessor.assignmentCount`; el puerto `SubjectRepository.delete` pasa de `boolean` a `{ assignmentCount: number } | null`.
- **Infraestructura** (Prisma):
  - carga y asignaturas: `_count: { select: { assignments: true } }` en el `select` de `subject_courses` que ya existe;
  - cursos: lo mismo en el `select` de `classes` (`CLASS`, junto a `STUDENT_COUNT`);
  - impacto y borrado del curso: `professorAssignment.count({ where: { courseId } })`, como `schedulingConstraint.count`; en el borrado, dentro de la transacción con el curso bloqueado;
  - borrado de asignatura y de profesor: `professorAssignment.count` por `subjectId` o `professorId` dentro de su transacción, tras el `FOR UPDATE` de la fila principal y antes de borrar.
- **Aplicación:** `DeleteCourse`, `DeleteSubject` y `DeleteProfessor` añaden `assignment_count` a su evento. `DeleteSubject` sigue devolviendo `{ id }`.
- **Presentación:** `professorsRouter` envía `{ deleted: { freedClass } }` explícitamente, no el objeto del caso de uso, para que `assignmentCount` no salga en la respuesta (el contrato tiene `additionalProperties: false`). El de asignaturas no cambia.

### 3. La frase compuesta con `Intl.ListFormat`
Una utilidad pura en `frontend/src/utils/lostItemsText.ts` recibe `{ rules, assignments }` y el idioma activo (`i18n.language`) y devuelve las piezas traducidas (`lost.rules_one` «su regla», `lost.rules_other` «sus {{count}} reglas», `lost.assignments_one` «su asignación de profesor», `lost.assignments_other` «sus {{count}} asignaciones de profesores»), sin las que son 0, unidas con `new Intl.ListFormat(language, { type: 'conjunction' })`, y el número de cosas para el plural del verbo (`count` = reglas + asignaciones: el singular solo sale con exactamente una cosa). Las frases que la usan:
- carga: `workload.matrix.lose_one` / `lose_other` («Al guardar se borrará / se borrarán {{items}} en este curso»);
- asignatura: `subjects.form.courses.lose_one` / `lose_other` («… en {{course}}»).

Las claves `loseRules_*` actuales desaparecen: con solo reglas, la frase nueva produce exactamente el mismo texto («Al guardar se borrarán sus 2 reglas en este curso»), y los tests existentes lo comprueban.
- *Alternativa descartada:* cuatro claves por combinación (`rulesAndAssignments_one_one`…): i18next no pluraliza dos números en una clave, y crece con cada cosa nueva que se pierda.
- *Alternativa descartada:* una línea por cosa. Más ruido en una fila de la matriz y no es lo validado.

`courseWorkloadDraft.rulesLostOf` pasa a `lostOf(workload, draft, subjectId)`, que devuelve `{ rules, assignments }` (los dos a 0 salvo que la fila pase a «No se imparte»). `SubjectForm` recibe `assignmentCounts` junto a `ruleCounts`.

### 4. Diálogos: un párrafo por cosa
Los diálogos de borrado (curso y asignatura) ya listan cada pérdida en su párrafo; las asignaciones siguen esa forma («Se quitarán también {{count}} asignaciones de profesores.»). `ConfirmRemoveClassModal` recibe `{ name, studentCount, assignmentCount }` y pinta los párrafos que tocan; `CourseForm` lo abre si cualquiera de los dos es mayor que 0 (con un mapa por id de clase cargado en `EditCoursePage`, como `studentCount`). Una fila nueva no tiene id y no abre nada.

### 5. Borrar un profesor: reutilizar `subjectsTextOf`
`DeleteProfessorModal` ya tiene el `Professor` con `subjects`. El texto agrupado por asignatura sale de la misma función que la columna «Asignaturas» de `ProfessorsPage`; pasa a `frontend/src/utils/professorSubjects.ts` para no duplicarla. El número es `subjects.length`.

### 6. Seguridad y rendimiento
Sin endpoints nuevos: la autenticación y el aislamiento por colegio son los de cada endpoint. Los recuentos van en la misma consulta (`_count` es una subconsulta correlacionada por fila, indexada por `subject_id`/`class_id`/`course_id`/`professor_id`). Sin impacto en el motor de generación.

## Risks / Trade-offs

- [Volumen de fixtures por el campo requerido en cuatro esquemas] → buscar los constructores de dobles (`appDoubles`, tests de servicios y páginas) antes de empezar y cambiarlos en el mismo paso que el contrato; `api:types:check` y `typecheck` señalan lo que falte.
- [El recuento es una foto: puede cambiar entre el aviso y la confirmación] → igual que con las reglas: solo informa. El del borrado y el del log se cuentan dentro de la transacción.
- [Borrado de asignatura simultáneo a un `PUT` de asignaciones: el `PUT` bloquea el curso, no la asignatura, así que puede insertar una asignación después del recuento; el borrado la arrastra igual por la cascada] → el `assignment_count` del log puede quedarse corto en ese caso; se acepta, porque es trazabilidad y no la respuesta. En el curso (mismo `FOR UPDATE`) y en el profesor (el `PUT` lo toma `FOR SHARE`) el recuento es exacto.
- [Concordancia de la frase en inglés] → cada idioma tiene su clave de frase y sus piezas; tests de la utilidad en `es` y `en`.
- [`Intl.ListFormat` en el navegador] → soportado por todos los navegadores objetivo y por jsdom/Node 24.

## Migration Plan

Sin migración de datos. El despliegue es el habitual: backend y frontend juntos. Los campos nuevos solo están en respuestas, así que un frontend antiguo en caché los ignora; un frontend nuevo contra un backend antiguo da `unavailable` hasta que termina el despliegue (minutos). Rollback: revertir el commit.

## Open Questions

Ninguna.
