## MODIFIED Requirements

### Requirement: Enlace a los calendarios en la navegación
La navegación de la barra lateral MUST mostrar «Calendarios» hacia `/calendarios` a los dos roles, en «Espacio de trabajo» entre «Alumnos» y «Asignaturas», con `aria-current="page"` en `/calendarios` y sus subrutas.

#### Scenario: Navegación
- **GIVEN** un usuario `MEMBER` con sesión
- **THEN** la navegación muestra «Cursos», «Profesores», «Alumnos» y «Calendarios», y no «Usuarios»
