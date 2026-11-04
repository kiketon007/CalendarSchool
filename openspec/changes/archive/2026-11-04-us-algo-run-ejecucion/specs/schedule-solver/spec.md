## MODIFIED Requirements

### Requirement: Rendimiento y tablas de casos
El motor MUST resolver un colegio de tamaño real (12 cursos de 2 clases, 15 profesores y dos calendarios) dentro del tiempo del test, y también un colegio **sin ningún hueco libre**: 6 cursos de 2 clases con 30 sesiones para 30 franjas cada una, un tutor por clase y especialistas compartidos entre las 12 clases (dos de inglés, dos de educación física, música y religión). Para no quedarse atascado en una mala decisión temprana, la búsqueda MUST ordenar las unidades por dominio y peso (las que más veces se han quedado sin opciones, antes) y MUST reiniciarse con un límite de retrocesos creciente, probando los valores en otro orden obtenido con una semilla fija, de modo que siga siendo determinista y que `infeasible` siga significando que se agotó el árbol. El backend MUST recorrer `test-fixtures/schedule-generation.json`, con problemas pequeños calculados a mano y su resultado (`solved`, con el horario exacto en los más pequeños, o `infeasible` con su causa), con al menos un caso por restricción, calendarios distintos, bloques con recreo, máximo al día, inactivas, huecos libres y el tutor libre.

#### Scenario: Tamaño real
- **WHEN** se resuelve el caso de tamaño real
- **THEN** el resultado es `solved` antes del límite del test y pasa el validador

#### Scenario: Colegio sin huecos libres
- **GIVEN** 12 clases de 30 sesiones para 30 franjas, con seis especialistas compartidos
- **WHEN** se resuelve
- **THEN** el resultado es `solved` con 360 entradas, pasa el validador y es el mismo en dos ejecuciones
