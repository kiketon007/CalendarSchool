
## Proyecto

CalendarSchool es una aplicación integral para la gestión y optimización de tareas rutinarias de administración escolar, especializada en la normativa y organización de centros educativos de la Comunidad Valenciana. El PRD vive en `docs/PRD_CalendarSchool.md` y es la fuente de verdad de producto.


## Linear Integration

Todo el trabajo de CalendarSchool va a:
- **Team**: CalendarSchool
- **Proyecto por defecto**: Project Calendar School

Convenciones de naming:
- Epics → "Initiatives" o "Projects" de Linear
- User stories → "Issues" de Linear
- Subtareas → "Sub-issues" de Linear

Para cualquier issue creado, SIEMPRE:
- Usar label de t-shirt sizing: `size:S`, `size:M`, `size:L`, `size:XL`
- Usar label de tipo: `type:feature`, `type:bug`, `type:refactor`, `type:docs`, `type:spike`

Las user stories se escriben en formato "Como [rol], quiero [acción], para [beneficio]".
Los criterios de aceptación se escriben en formato Given/When/Then.

## Reglas de calidad del backlog

- Un issue no se cierra (status → Done) sin AC en formato Given/When/Then.
- Las features que no estén en `docs/PRD_CalendarSchool.md` no se crean como issues sin validación humana previa.
- Las stories marcadas `needs-splitting` no entran a sprint hasta refinarse.

