## ADDED Requirements

### Requirement: Enlace a los profesores de cada curso
Cada fila y cada tarjeta del listado `/cursos` MUST llevar, junto a «Carga horaria» y para los dos roles, un enlace «Profesores» a `/cursos/<id>/profesores`, con el nombre accesible «Profesores de {curso}». A 360 px la página MUST seguir sin desplazamiento horizontal.

#### Scenario: Enlace a los profesores del curso
- **WHEN** un `MEMBER` o un `ADMIN` pulsa «Profesores de 1º Primaria»
- **THEN** llega a `/cursos/<id>/profesores` de ese curso

#### Scenario: Sin desplazamiento a 360 px
- **WHEN** se abre `/cursos` a 360 px
- **THEN** cada tarjeta lleva el enlace, los botones de acción pasan a la línea siguiente si no caben (también con barra de desplazamiento vertical, que reduce el ancho útil) y la página no se desplaza en horizontal
