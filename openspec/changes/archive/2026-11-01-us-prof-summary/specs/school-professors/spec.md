## ADDED Requirements

### Requirement: Enlace al resumen de carga desde el listado de profesores
`ProfessorsPage` MUST mostrar, a los dos roles y junto al título (también cuando el colegio no tiene profesores), un enlace «Resumen de carga» a `/profesores/resumen` (US-PROF-SUMMARY).

#### Scenario: Ir al resumen
- **WHEN** un `MEMBER` abre «Profesores» y pulsa «Resumen de carga»
- **THEN** llega a `/profesores/resumen`
