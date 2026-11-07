## MODIFIED Requirements

### Requirement: Enlace a las asignaturas en la navegación
La navegación de la barra lateral MUST mostrar «Asignaturas» hacia `/asignaturas` a los dos roles, en «Espacio de trabajo» entre «Calendarios» y «Reglas», con `aria-current="page"` en `/asignaturas` y sus subrutas.

#### Scenario: Navegación
- **GIVEN** un usuario `MEMBER` con sesión
- **THEN** la navegación muestra «Cursos», «Profesores», «Alumnos», «Calendarios» y «Asignaturas», y no «Usuarios»
