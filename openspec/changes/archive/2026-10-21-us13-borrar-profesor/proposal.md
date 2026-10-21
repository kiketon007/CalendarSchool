## Why

US13 (`docs/User_Stories_MVP.md`, épica 3, PRD §3.3 «Gestión de profesores») cierra el CRUD de profesores: hoy un profesor que deja el colegio sigue en el listado, en los desplegables de tutor (US09_b, US12) y como tutor de su clase. Con la edición (US12) ya construida, borrar es lo único que falta para mantener al día el personal docente.

## What Changes

- `DELETE /api/professors/{id}`: **borrado real**, en una transacción con la fila del profesor bloqueada; su clase queda «Sin tutor» por `ON DELETE SET NULL`. Responde `200` con lo que se liberó de verdad (`{ deleted: { freedClass: { id, name, courseName } | null } }`). Un profesor de otro colegio, inexistente o con un `id` que no es UUID es `404` indistinguible. Sin migraciones ni códigos de error nuevos.
- Evento `PROFESSOR_DELETED` (`school_id`, `actor_id`, `professor_id`, `freed_class`), sin nombres.
- Un botón «Borrar» por profesor en el listado (junto a «Editar») que abre `DeleteProfessorModal`: al abrirse consulta el profesor (`GET /api/professors/{id}`) y muestra la tutoría que se perderá; confirmar borra, quita al profesor de la lista sin volver a pedirla, avisa y lleva el foco al título; un `404` cierra el diálogo, avisa y vuelve a pedir la lista.

Decisiones validadas por la persona usuaria (2026-10-21) y recogidas en la ficha de US13.

**Fuera de alcance:** borrado lógico, papelera o deshacer; límite de borrados por minuto; borrado múltiple; sincronización en tiempo real; alumnos (US14) y horarios; avisos por email.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-professors`: nuevos requisitos del borrado (endpoint, evento y diálogo); el contrato y el acceso incluyen `DELETE /api/professors/{id}`; el listado gana «Borrar» y el aviso de profesor eliminado; accesibilidad y E2E cubren el borrado.

## Impact

- **Contrato:** `docs/api-spec.yml` (`deleteProfessor`, `DeleteProfessorResponse`); tipos del frontend regenerados.
- **Backend:** caso de uso `DeleteProfessor`, método `delete` del puerto `ProfessorRepository` y de `PrismaProfessorRepository`, ruta `DELETE /:id` en `professorsRouter`, raíz de composición.
- **Frontend:** `professorsService.delete`, `components/DeleteProfessorModal.tsx` (nuevo), `pages/ProfessorsPage.tsx`, i18n y E2E.
- **Modelo de datos:** sin migraciones; documenta el borrado real del profesor y la liberación de su clase.
- **Documentación:** `CLAUDE.md` de backend y frontend, `README.md`, `MODELO_DATOS.md`, arquitectura y notas de US14 y de las historias de horarios.
