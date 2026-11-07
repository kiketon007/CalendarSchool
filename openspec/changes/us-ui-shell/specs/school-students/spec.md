## MODIFIED Requirements

### Requirement: Enlace a los alumnos en la navegación
La navegación de la barra lateral MUST mostrar «Alumnos» hacia `/alumnos` a los dos roles, en «Espacio de trabajo» entre «Profesores» y «Calendarios», con `aria-current="page"` en `/alumnos` y sus subrutas.

#### Scenario: Navegación
- **GIVEN** un usuario `MEMBER` con sesión
- **THEN** la navegación muestra «Cursos», «Profesores» y «Alumnos», y «Alumnos» lleva `aria-current` en `/alumnos/nuevo`
