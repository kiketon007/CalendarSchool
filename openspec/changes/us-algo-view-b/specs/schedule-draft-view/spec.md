## MODIFIED Requirements

### Requirement: Página del horario borrador
`/horarios/borrador` (`pages/ScheduleDraftPage.tsx`, bajo `AuthenticatedLayout` sin `RequireRole`, para `ADMIN` y `MEMBER`) MUST pedir el borrador una sola vez por visita (también con `StrictMode`), mostrar un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. Con borrador MUST mostrar «Borrador», la fecha de generación, un selector de vista («Por clase», «Por profesor», «Todo el colegio») y el botón «Exportar» (ver la capacidad `schedule-export`). Sin borrador MUST decir «Todavía no hay ningún horario generado» con un enlace a `/horarios`, sin «Exportar»; tampoco hay «Exportar» mientras carga ni tras un fallo. Las tres vistas MUST construirse en el navegador desde la misma respuesta: cambiar de vista, clase, profesor o día MUST NOT hacer peticiones. No hay acciones de escritura y exportar está al alcance de los dos roles, así que un `MEMBER` ve lo mismo que un `ADMIN`.

#### Scenario: Abrir el borrador
- **GIVEN** un borrador generado
- **WHEN** abro `/horarios/borrador`
- **THEN** veo «Borrador», la fecha de generación, «Exportar» y la vista por clase con la primera clase del primer curso

#### Scenario: Sin borrador
- **WHEN** abro `/horarios/borrador` en un colegio que nunca ha generado
- **THEN** leo «Todavía no hay ningún horario generado» y un enlace a «Generar horarios», y no hay «Exportar»

#### Scenario: Fallo al cargar
- **WHEN** la petición falla
- **THEN** veo un aviso con «Reintentar», que vuelve a pedirla, y no hay «Exportar»

#### Scenario: Miembro
- **WHEN** un `MEMBER` abre la página
- **THEN** ve las tres vistas y «Exportar» igual que un `ADMIN`
