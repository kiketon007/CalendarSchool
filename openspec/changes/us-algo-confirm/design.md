## Context

US-ALGO-RUN dejó `schedules` (`status` `DRAFT | OFFICIAL`, con el enum ya creado pero sin usar `OFFICIAL`), `schedule_entries` (cascada desde `schedules`) y `schedule_generations.schedule_id` (`ON DELETE SET NULL`), con el índice único parcial `schedules_draft_key` (un `DRAFT` por colegio) y `ScheduleRepository.replaceDraft`, que en una transacción borra el `DRAFT` del colegio y crea el nuevo sin tocar los `OFFICIAL`. US-ALGO-VIEW añadió la lectura normalizada (`ScheduleDraftRepository.findDraft` → `GetScheduleDraft` → `GET /api/schedule/draft`) y la página `ScheduleDraftPage`, y US-ALGO-VIEW_b la exportación en el navegador (`utils/scheduleExport.ts`). El panel de generación (`ScheduleGenerationPanel`) enlaza siempre a `/horarios/borrador` en el estado completado.

US-ALGO-CONFIRM (ficha enriquecida el 2026-11-05) pide confirmar el borrador como oficial, descartarlo y ver el oficial; los oficiales sustituidos se conservan para US-ALGO-CONFIRM_b.

## Goals / Non-Goals

**Goals:**

- Un único oficial vigente por colegio, garantizado por la base, y el histórico conservado sin copiar entradas.
- Confirmar y descartar seguros frente a la concurrencia (otro administrador, una generación en curso) sin bloqueos explícitos.
- Reutilizar la lectura, la página, las vistas y la exportación del borrador para el oficial, generalizándolas en lugar de duplicarlas.

**Non-Goals:**

- Listar o abrir los horarios anteriores (US-ALGO-CONFIRM_b), revertir, editar a mano, borrar un oficial, varios borradores, el aviso general de borrador desfasado.

## Decisions

### D1. Vigente = `OFFICIAL` sin `replaced_at`; sin estado nuevo

`schedules` gana `confirmed_at`, `confirmed_by_id` (FK a `users`, `RESTRICT`, como `created_by_id`) y `replaced_at`. El vigente es `OFFICIAL AND replaced_at IS NULL`, con el índice único parcial `schedules_official_key`, y tres `CHECK` atan las columnas al estado.

**Alternativa descartada:** un estado `ARCHIVED`. PostgreSQL no deja usar un valor de enum en la misma transacción que lo añade (`ALTER TYPE … ADD VALUE`), así que el índice parcial que lo usara obligaría a partir la migración en dos (y a vigilar cómo la ejecuta Prisma); además `replaced_at` es un dato que se quiere guardar igualmente (cuándo dejó de estar vigente). **Otra descartada:** copiar el borrador a un horario nuevo al confirmar: duplicaría unas 1000 entradas por confirmación sin necesidad y rompería el enlace con su generación.

Los horarios existentes son `DRAFT` con las columnas nuevas a `NULL`: cumplen los `CHECK` y no hace falta migrar datos.

### D2. Confirmar en una transacción de dos `UPDATE`, sin bloqueos

```
BEGIN
  UPDATE schedules SET replaced_at = now()
   WHERE school_id = $school AND status = 'OFFICIAL' AND replaced_at IS NULL      -- 0 o 1 fila
  UPDATE schedules SET status = 'OFFICIAL', confirmed_at = now(), confirmed_by_id = $actor
   WHERE id = $id AND school_id = $school AND status = 'DRAFT'                     -- 0 o 1 fila
  -- 0 filas en el segundo → se deshace todo; se distingue 404 de 409 leyendo el id
COMMIT
```

Con READ COMMITTED, dos confirmaciones del mismo borrador se serializan en el bloqueo de la fila: la segunda reevalúa `status = 'DRAFT'` tras la primera, no actualiza nada y se deshace (`409 SCHEDULE_NOT_DRAFT`), incluido su primer `UPDATE`. La violación de `schedules_official_key` (que exigiría dos borradores, imposible por `schedules_draft_key`) se traduce igualmente a `409` con `violatedUniqueIndex`, como red de seguridad.

**Concurrencia con `replaceDraft`:** su `deleteMany({ status: 'DRAFT' })` y el `UPDATE` de confirmar compiten por la misma fila. Si confirmar gana, el `DELETE` reevalúa, ya no la encuentra (es `OFFICIAL`) y el oficial queda; si `replaceDraft` gana, el id visto ya no existe y confirmar da `404`. No hace falta tocar `replaceDraft` ni añadir `SELECT … FOR UPDATE`.

La transacción usa el `timeout` corto del resto de escrituras (15 s) y `translateDatabaseErrors`. Un id que no es UUID se resuelve en la ruta (`404`), como en `/schedule/generate/{id}`.

### D3. Descartar: un `DELETE` condicionado

`DELETE FROM schedules WHERE id AND school_id AND status = 'DRAFT'` (las entradas caen en cascada y la generación conserva su fila con `schedule_id` a `NULL`). Si no borra nada, se lee el id para distinguir `404` (no existe o es de otro colegio) de `409 SCHEDULE_NOT_DRAFT` (es un oficial). Sin transacción explícita: es una sola sentencia.

### D4. Generalizar la lectura en lugar de duplicarla

- Dominio: `ScheduleDraftRepository.findDraft(schoolId)` pasa a `ScheduleReadRepository.find(schoolId, which)` con `which = 'draft' | 'official'` (US-ALGO-CONFIRM_b añadirá `{ id }`); el tipo `StoredScheduleDraft` pasa a `StoredSchedule` con los campos de confirmación y el profesor que confirmó (`confirmedBy: { firstName, lastName } | null`, leído con un `select` de `users`).
- Aplicación: `GetScheduleDraft` pasa a `GetSchedule` (`execute({ schoolId, which })`), con la misma normalización y orden; `GetScheduleOverview` es nuevo.
- Prisma: la misma consulta única `schedule.findFirst` con el `where` según `which` (`{ status: 'DRAFT' }` o `{ status: 'OFFICIAL', replacedAt: null }`).
- Contrato: `ScheduleDraft` pasa a `ScheduleDetail` (renombrar en `docs/api-spec.yml` y en el frontend), con `status` `DRAFT | OFFICIAL` y los tres campos de confirmación. `GET /api/schedule/draft` mantiene su comportamiento.

El resumen (`GET /api/schedule/overview`) es una consulta de cabeceras (sin entradas): el borrador, el oficial vigente con su `confirmedBy`, y un `count` de los sustituidos.

**Alternativa descartada:** un único `GET /api/schedule/{id}` para todo. Obligaría a `/horarios/oficial` a pedir antes el resumen para saber el id (dos peticiones encadenadas); la lectura por id llegará con US-ALGO-CONFIRM_b para los anteriores.

### D5. Rutas: el router de `schedule` con un `{id}` validado

Las rutas literales (`/draft`, `/official`, `/overview`, `/readiness`, `/generate`) se declaran antes que `/:id`, y `/:id/confirm` y `DELETE /:id` validan el UUID con el mismo ayudante que `/generate/{id}`. `requireRole('ADMIN')` en las dos escrituras.

### D6. Frontend: la página elige el horario por la ruta

`ScheduleDraftPage` recibe `which: 'draft' | 'official'` desde `App.tsx` (dos `Route` con el mismo componente) y pide `getDraft` o `getOfficial`. Cambian la insignia («Borrador» o «Oficial», con texto), la línea de fechas («Generado el …» o «Confirmado el … por … · Generado el …»), el texto vacío y, solo en el borrador y para un `ADMIN`, los botones «Confirmar como oficial» y «Descartar el borrador» junto a «Exportar». El estado en la URL y las vistas no cambian. La exportación recibe el estado y la fecha que toca y escribe «Horario oficial confirmado el …» (modelo intermedio de `scheduleExport.ts`: `generatedAt` pasa a una línea de fecha según el estado).

**El rol en el frontend** sale de `useSession()` (`user.role`), como en `/horarios`; ocultar los botones es interfaz y el `403` del backend es la regla.

### D7. Los diálogos y los desfases

`ConfirmScheduleModal` y `DiscardScheduleDraftModal` siguen el patrón de `DeleteCourseModal`: siempre montados y controlados por una prop, guarda síncrona con `ref`, sin cerrarse mientras envían. El aviso de desfases usa `draftGaps(index)` (pura, en `utils/scheduleDraftViews.ts` o junto a ella): cuenta las entradas sin profesor, las que caen fuera del calendario actual y los cursos sin calendario, con las mismas reglas que las vistas (`classView`). Desde el panel no hay borrador cargado: el diálogo lo pide al abrirse (`getDraft`) y, mientras carga, muestra el texto sin cifras con «Confirmar» habilitado (los desfases avisan, no bloquean).

### D8. `/horarios` y el panel con un solo resumen

`ScheduleReadinessPage` pide `GET /api/schedule/overview` una vez (también con `StrictMode`) y lo pasa a `OfficialScheduleSummary` (arriba) y al panel. El panel decide el enlace del estado completado comparando `generation.scheduleId` con `overview.draft?.id` y `overview.official?.id`. Cuando una generación termina mientras se ve, el panel avisa a la página (`onFinished`) y esta vuelve a pedir el resumen. Un fallo del resumen deja el resumen en un aviso con «Reintentar» y el panel con «Ver horario» por defecto (el comportamiento de US-ALGO-VIEW), sin bloquear la comprobación ni la generación.

### D9. Modelo de datos, contrato y seguridad

- Migración con `CHECK` e índice escritos a mano (revisar el SQL que genera Prisma); `MODELO_DATOS.md` actualizado.
- Contrato: tres rutas nuevas, `ScheduleDetail` y `ScheduleSummary`, y `SCHEDULE_NOT_DRAFT`.
- Seguridad: el colegio sale siempre de la sesión y entra en todos los `WHERE`; las escrituras exigen `ADMIN`; los eventos no llevan nombres.
- Rendimiento: confirmar son dos `UPDATE` por clave; descartar, un `DELETE` con cascada de unas 1000 entradas en un colegio grande; el resumen, tres lecturas de cabeceras. Nada se acerca a los límites de la Lambda.

## Risks / Trade-offs

- [El histórico crece sin límite: unas 1000 entradas por confirmación en un colegio grande] → se acepta; la purga queda para más adelante y US-ALGO-CONFIRM_b solo lo leerá.
- [Un administrador confirma un borrador desfasado] → el diálogo muestra los desfases visibles; el aviso general de borrador desfasado sigue aplazado.
- [Renombrar `ScheduleDraft` a `ScheduleDetail` toca tipos generados, el servicio y los tests de US-ALGO-VIEW] → se hace en una tarea propia al principio, con `api:types:check` y el `typecheck` como red.
- [Borrar un usuario que confirmó un oficial] → los usuarios se borran de forma lógica (`DELETED`), la FK `RESTRICT` nunca salta en el uso normal; `confirmedBy` sigue mostrando su nombre.
- [El panel y el resumen pueden desincronizarse si otro administrador confirma en otra pestaña] → la información se refresca al recargar o al terminar una generación; una acción sobre un borrador que ya cambió da `404`/`409` con su texto.

## Migration Plan

Despliegue habitual: la migración solo añade columnas nulas, `CHECK` que cumplen los datos existentes y un índice parcial sobre filas que aún no existen, así que es compatible con el código anterior durante el despliegue. Volver atrás: revertir el commit; la migración inversa (quitar índice, `CHECK` y columnas) solo es necesaria si ya hay oficiales y se quiere volver al esquema anterior.

## Open Questions

Ninguna: las decisiones abiertas se cerraron en la exploración y el enriquecimiento del 2026-11-05.
