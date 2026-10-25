## Context

- **US-BASE y US-BASE_b** dejaron `calendars`, `calendar_periods` (`ON DELETE CASCADE` hacia el calendario) y `courses.calendar_id` (nulo, `ON DELETE SET NULL`), `calendarsRouter` con `requireRole('ADMIN')` en las escrituras antes de `parseCalendarId`, `CalendarNotFound` traducido a `404 NOT_FOUND` con la respuesta reutilizable `CalendarNotFound`, y los bloqueos: el alta toma los cursos `FOR UPDATE` en orden de `id`; la edición toma el calendario y después la unión de sus cursos y los pedidos en el mismo orden. En el frontend, `CalendarsPage` pinta tarjetas con «Editar» para el `ADMIN`.
- **Patrón de borrado:** US08 (cursos), US13 (profesores) y US18 (alumnos). El borrado es real, responde `200` con lo que se borró de verdad (no `204`) y un `404` no deja evento. El diálogo de US18 (`DeleteStudentModal`) no pide nada al abrirse porque usa los datos de la fila; la página quita el registro de la lista sin volver a pedirla, muestra un aviso propio (`pageNotice`) con prioridad sobre el de llegada y lleva el foco al `h1` un turno después de `onExited`.
- **Decisiones de producto** (ficha de US-BASE_c, 2026-10-25): se puede borrar un calendario con cursos (quedan sin calendario); el diálogo usa los datos de la tarjeta.

## Goals / Non-Goals

**Goals:**

- Borrar un calendario y sus periodos de forma atómica, dejando sus cursos sin calendario, solo para `ADMIN`.
- Un recuento exacto de los cursos liberados, sin interbloqueos con el alta, la edición ni el borrado de cursos.
- Un diálogo inmediato que diga qué se pierde, con el patrón de borrado ya conocido.

**Non-Goals:**

- Papelera o deshacer, borrado múltiple, impedir el borrado con cursos, «calendario en uso», horarios `NEEDS_REVIEW` y borrar desde la página de edición.

## Decisions

### 1. Contrato: `deleteCalendar` con `DeleteCalendarResponse` y ningún código nuevo

`DELETE /api/calendars/{id}`, sin cuerpo, responde `200 { deleted: { id, courseCount } }`. El `id` se devuelve como en `DeleteStudentResponse`, para que el cliente no dependa de lo que envió. El `404` reutiliza `CalendarNotFound`. Alternativa descartada: `204` sin cuerpo; el aviso de la página y el evento necesitan el recuento real.

### 2. Dominio y aplicación

- El puerto `CalendarRepository` gana `delete(schoolId, calendarId): Promise<{ courseCount: number } | null>` (`null` si no es del colegio).
- `DeleteCalendar` convierte `null` en `CalendarNotFound` **sin registrar nada** y, con éxito, registra `CALENDAR_DELETED` (`school_id`, `actor_id`, `calendar_id`, `course_count`) y devuelve `{ id, courseCount }`. No necesita parser de cuerpo: el `id` lo valida `parseCalendarId` en el router.
- El router monta `requireRole('ADMIN')` en `DELETE /:id` antes de `parseCalendarId`, como el `PUT`: rol → `id` → existencia.

### 3. Transacción y bloqueos en `PrismaCalendarRepository.delete`

Dentro de `$transaction`:

1. `SELECT id FROM calendars WHERE id = $1 AND school_id = $2 FOR UPDATE`. Sin fila, `null` sin tocar nada.
2. `SELECT id FROM courses WHERE calendar_id = $1 ORDER BY id FOR UPDATE`: sus cursos, en orden de `id`; su número es `courseCount`. Con los cursos bloqueados, nadie puede llevárselos ni traer otros hasta el final, así que el recuento es exactamente lo que el `SET NULL` va a liberar.
3. `DELETE` del calendario: los periodos caen por `ON DELETE CASCADE` y los cursos quedan con `calendar_id` nulo por `ON DELETE SET NULL`. No se tocan a mano.

- **Sin ciclos de bloqueo:** el borrado toma su calendario y después sus cursos en orden de `id`; la edición, su calendario y después cursos en el mismo orden; el alta solo cursos en ese orden; el borrado de un curso, solo ese curso. Dos operaciones sobre calendarios distintos nunca esperan una por el calendario de la otra mientras retienen un curso que la otra necesita en orden inverso.
- **Contra la edición de otro calendario que se lleva un curso:** si la edición bloquea el curso primero, el borrado espera en el paso 2 y, al seguir, el curso ya no es suyo (PostgreSQL reevalúa la condición `calendar_id = $1` de la fila actualizada en `READ COMMITTED`), así que no lo cuenta ni lo libera; si el borrado bloquea primero, la edición espera y después mueve el curso, que ya estaba sin calendario.
- **Alternativa descartada:** contar con un `count` sin bloquear los cursos. Una edición simultánea podría llevarse o traer un curso entre el recuento y el `DELETE`, y el aviso diría un número falso.

### 4. Frontend

- `calendarsService.delete(authorizedFetch, id)` envía `DELETE` sin cuerpo y devuelve `deleted` (con `{ id, courseCount }`, validado: entero no negativo), `notFound`, `forbidden`, `unauthenticated` o `unavailable`; codifica el `id` y nunca lanza.
- `components/DeleteCalendarModal.tsx` sigue a `DeleteStudentModal`: recibe `calendar` (`{ id, name, courses }` o `null`), no pide nada al abrirse, foco inicial en «Cancelar», guarda síncrona (`ref`) contra la doble pulsación, `backdrop="static"` y `keyboard={false}` mientras borra, `404` → `onGone`, otro fallo → `role="alert"` dentro.
- `CalendarsPage` añade el botón «Borrar» a la tarjeta (junto a «Editar», solo `ADMIN`) y el diálogo; con `onDeleted` filtra la lista cargada, pone `pageNotice` (prioridad sobre el aviso de llegada) y enfoca el `h1` (`tabIndex={-1}`) un turno después de `onExited`; con `onGone`, aviso y recarga.

## Risks / Trade-offs

- **[Borrar por error un calendario con cursos]** → el diálogo lista los cursos que se quedan sin calendario y pide confirmar; los cursos se conservan y se reasignan editando otro calendario.
- **[El diálogo muestra datos de la carga]** → el aviso final usa el `courseCount` del servidor, contado con los cursos bloqueados.
- **[Interbloqueos]** → orden fijo (calendario, después cursos por `id`) y tests de concurrencia contra otro borrado, la edición del mismo, la edición de otro que se lleva un curso y el borrado de un curso.
- **[Foco tras cerrar el diálogo]** → el botón «Borrar» desaparece con la tarjeta; el foco va al `h1` un turno después de `onExited`, comprobado en el E2E con `have.focus` (jsdom no lo reproduce).
- **Seguridad:** el colegio sale de la identidad; el bloqueo filtra por colegio; la escritura exige `ADMIN` antes de leer el `id`; el `404` no distingue un calendario de otro colegio.
- **Rendimiento:** un calendario, como mucho 10 periodos y unos pocos cursos.

## Migration Plan

Sin migraciones. Despliegue normal. Vuelta atrás: revertir la PR; los calendarios borrados no se recuperan (es el comportamiento pedido: no hay papelera).

## Open Questions

Ninguna.
