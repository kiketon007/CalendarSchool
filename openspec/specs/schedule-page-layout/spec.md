# schedule-page-layout Specification

## Purpose
Presentación de la pantalla «Generar horarios» (`/horarios`): cabecera de página, veredicto con icono, tarjeta de la generación con insignia de estado, resultado de la generación completada, tarjetas de cifras y problemas en bloques de listado, con su accesibilidad, su adaptación a la pantalla y su presupuesto de CSS. Solo describe la presentación; el comportamiento está en `schedule-readiness`, `schedule-generation`, `schedule-score` y `schedule-confirmation`.
## Requirements
### Requirement: Cabecera y contenedor de «Generar horarios»
`/horarios` MUST usar el contenedor de las páginas del tema (`Container as="main" fluid="xxl"`) y conservar su `data-testid="schedule-readiness-page"`. MUST abrir con la cabecera de página reutilizable (`PageHeader`) con el sobretítulo «Planificación académica», el `h1` «Generar horarios» con su `id` y la descripción «Comprueba si el colegio está listo para generar los horarios y qué hay que corregir antes.», sin acciones. El aviso de borrador descartado (`role="status"`) y el resumen del horario oficial MUST seguir entre la cabecera y el veredicto, con los mismos textos y enlaces. Todos los textos MUST venir de i18n en `es.json` y `en.json`.

#### Scenario: Cabecera
- **WHEN** un usuario abre `/horarios`
- **THEN** ve el sobretítulo «Planificación académica», el `h1` «Generar horarios» y la descripción corta, y el `h1` conserva su `id`

#### Scenario: Resumen del oficial
- **GIVEN** un horario oficial confirmado por Kiketon RF y un horario anterior
- **WHEN** abre `/horarios`
- **THEN** bajo la cabecera ve «Horario oficial: confirmado el … por Kiketon RF», «Ver horario oficial» y «Horarios anteriores (1)»

#### Scenario: Borrador descartado
- **GIVEN** que se llega a `/horarios` tras descartar el borrador
- **THEN** el aviso «borrador descartado» sigue apareciendo con `role="status"`

### Requirement: Veredicto con icono
El veredicto de la comprobación (`data-testid="schedule-readiness-verdict"`, `role="status"`) MUST pintarse como un texto destacado precedido de un círculo con un icono decorativo (`aria-hidden`): una marca de verificación sobre el tono menta del tema cuando se puede generar, y una cruz sobre un fondo de peligro suave, con el texto en un tono de peligro legible, cuando no. Los textos («Se puede generar» y «No se puede generar todavía: {n} problema(s)», con plural) y la nota «Que no haya problemas no garantiza que exista un horario: la generación lo comprueba» MUST ser los de hoy. El color MUST NOT ser la única pista.

#### Scenario: Se puede generar
- **GIVEN** una comprobación sin bloqueantes
- **WHEN** se abre `/horarios`
- **THEN** el veredicto dice «Se puede generar» con un círculo con una marca de verificación decorativa y debajo la nota

#### Scenario: No se puede generar
- **GIVEN** una comprobación con 2 bloqueantes
- **WHEN** se abre `/horarios`
- **THEN** el veredicto dice «No se puede generar todavía: 2 problemas» con un círculo con una cruz decorativa, y con 1 bloqueante dice «1 problema»

### Requirement: Tarjeta de la generación con insignia de estado
El panel de la generación (`data-testid="schedule-generation-panel"`, con el `h2` «Generación del horario») MUST pintarse como una tarjeta del tema con una franja superior de degradado hecha solo con CSS. Su cabecera MUST llevar a la izquierda un sobretítulo y el `h2` y a la derecha una insignia de estado con texto, según el estado de la generación:

| Estado | Sobretítulo | Insignia |
|---|---|---|
| Sin generación | ninguno | ninguna |
| En cola o buscando | «Generación en curso» | «En curso» |
| Mejorando | «Generación en curso» | «Mejorando» |
| Completada y es el borrador vigente (o se desconoce qué horarios hay) | «Resultado de la última generación» | «Borrador listo» |
| Completada y es el oficial | «Resultado de la última generación» | «Horario oficial» |
| Completada y el borrador ya no existe | «Resultado de la última generación» | «Ya no vigente» |
| Fallida | «Resultado de la última generación» | «Sin horario» |
| Cancelada | «Resultado de la última generación» | «Cancelada» |

Cada insignia MUST decir su estado con texto, con tono lavanda (en curso y mejorando), menta (borrador listo y horario oficial), amarillo (ya no vigente y cancelada) o peligro suave (sin horario); las menta MAY llevar una marca de verificación decorativa. El texto de cada insignia y de cada sobretítulo MUST ser legible con contraste AA.

#### Scenario: Borrador listo
- **GIVEN** una generación completada cuyo horario es el borrador vigente
- **WHEN** se abre `/horarios`
- **THEN** la tarjeta dice «Resultado de la última generación» y la insignia «Borrador listo»

#### Scenario: En curso
- **GIVEN** una generación en la fase de búsqueda
- **THEN** la tarjeta dice «Generación en curso» con la insignia «En curso», y en la fase de mejora la insignia dice «Mejorando»

#### Scenario: Horario oficial, ya no vigente, fallida y cancelada
- **THEN** una generación cuyo horario es el oficial muestra «Horario oficial», una cuyo borrador se descartó o se sustituyó muestra «Ya no vigente», una fallida muestra «Sin horario» y una cancelada muestra «Cancelada»

#### Scenario: Sin generación
- **GIVEN** que el colegio nunca ha generado un horario
- **THEN** la tarjeta solo muestra el `h2` «Generación del horario», sin sobretítulo ni insignia

### Requirement: Resultado de la generación completada
Con una generación completada, el panel MUST mostrar «Horario borrador generado: {n} sesiones colocadas» con «{n} sesiones colocadas» en el color primario (con plural, como hoy), el desglose de la puntuación en dos columnas con la etiqueta en texto normal y la cifra en negrita (la penalización, con su aclaración «(antes de mejorar: {x}; cuanto menos, mejor)» en texto normal), y un recuadro tintado con la nota «Revísalo antes de confirmarlo como oficial. Si generas de nuevo, el borrador se sustituye.», el enlace «Ver horario» y, solo para un `ADMIN`, «Confirmar como oficial». Los botones «Generar horarios» y «Generar de nuevo» MUST llevar delante un icono de calendario decorativo y una sombra suave. El nombre accesible del botón MUST seguir siendo su texto, y el texto, la lógica y los permisos MUST ser los de hoy. El desglose lo comparte la página del horario borrador: su marcado MUST seguir siendo una lista de descripción con las mismas etiquetas.

#### Scenario: Resumen de una generación
- **GIVEN** una generación completada de 360 sesiones con 51 huecos, 152 asignaturas en días seguidos y una penalización de 305 (458 antes de mejorar)
- **WHEN** un `ADMIN` abre `/horarios`
- **THEN** ve «Horario borrador generado: 360 sesiones colocadas», el desglose con «Huecos de profesores» 51, «Asignaturas en días seguidos» 152 y «Penalización» «305 (antes de mejorar: 458; cuanto menos, mejor)», y el recuadro con «Ver horario» y «Confirmar como oficial»

#### Scenario: Un miembro
- **GIVEN** la misma generación
- **WHEN** un `MEMBER` abre `/horarios`
- **THEN** ve el desglose y «Ver horario», y no ve «Confirmar como oficial» ni «Generar de nuevo»

#### Scenario: Botón de generar
- **WHEN** un `ADMIN` abre `/horarios` sin bloqueantes
- **THEN** «Generar horarios» (o «Generar de nuevo») lleva un icono decorativo y su nombre accesible es solo su texto

### Requirement: Tarjetas de cifras
Con una generación completada y con puntuación, debajo de la tarjeta del panel MUST mostrarse una fila de tres tarjetas del tema, cada una con un cuadro de icono con tono, la cifra en grande y su etiqueta: «Huecos de profesores» (los huecos de los profesores), «Asignaturas consecutivas» (las asignaturas en días seguidos) y «Penalización actual» (la penalización tras la mejora, no la de antes de mejorar). La fila MUST ser una columna por debajo de 768 px y tres columnas desde ahí. Como repite el desglose, MUST ocultarse a las tecnologías de apoyo (`aria-hidden="true"`) y no contener controles. No MUST mostrarse sin generación, con la generación en curso, fallida o cancelada, ni sin puntuación.

#### Scenario: Tres tarjetas
- **GIVEN** la generación completada con 51 huecos, 152 asignaturas consecutivas y una penalización de 305
- **WHEN** se abre `/horarios`
- **THEN** bajo la tarjeta del panel hay tres tarjetas con 51 «Huecos de profesores», 152 «Asignaturas consecutivas» y 305 «Penalización actual»

#### Scenario: Sin tarjetas
- **WHEN** la generación está en curso, fallida o cancelada, no existe o es completada sin puntuación
- **THEN** no se muestran las tarjetas de cifras

#### Scenario: No se leen dos veces
- **WHEN** se analiza la página con las tarjetas
- **THEN** la fila está oculta a las tecnologías de apoyo y las cifras solo se leen una vez, en el desglose

### Requirement: Problemas en bloques de listado
Los grupos «Impiden generar ({n})» y «Avisos ({n})» MUST pintarse como bloques de listado: una región con nombre (`ListSection` con marco, con su `h2` y el recuento dentro del título) con una lista cuyas filas son elementos de lista del tema, sin tarjetas anidadas. Cada problema MUST conservar su insignia con texto («Impide generar» o «Aviso»), su texto y sus enlaces de corrección. Un grupo sin problemas MUST NOT pintarse.

#### Scenario: Bloqueantes y avisos
- **GIVEN** 2 bloqueantes y 1 aviso
- **WHEN** se abre `/horarios`
- **THEN** hay dos regiones, «Impiden generar (2)» con dos filas y «Avisos (1)» con una, cada fila con su insignia, su texto y su enlace

#### Scenario: Sin problemas
- **GIVEN** una comprobación sin bloqueantes ni avisos
- **THEN** no hay ninguna de las dos regiones

### Requirement: Accesibilidad, adaptación a la pantalla y presupuesto de la presentación
La página MUST no tener violaciones de `axe` (WCAG 2.1 A y AA) en la lista, con problemas, cargando, con error y con el panel en cada uno de sus estados, y los encabezados MUST seguir el orden `h1`, `h2` (la generación y cada grupo de problemas). A 1280 y a 360 px MUST NOT haber desplazamiento horizontal, ni siquiera con el panel completado, en curso o fallido (con un aviso de fallo largo) y con problemas de nombres largos. La franja, el círculo y las insignias MUST hacerse con CSS sin estilos en línea ni recursos de terceros, y cualquier transición MUST aplicarse solo con `prefers-reduced-motion: no-preference`. El CSS compilado MUST seguir por debajo de 33,75 kB en gzip y la CSP MUST NO cambiar.

#### Scenario: Sin violaciones
- **WHEN** se pasa `axe` a la página con bloqueantes y avisos, con el panel completado y con el panel fallido
- **THEN** no hay violaciones

#### Scenario: Móvil y escritorio
- **GIVEN** una ventana de 360 px y otra de 1280 px de ancho
- **WHEN** se abre `/horarios` con el panel completado
- **THEN** no hay desplazamiento horizontal y las tarjetas de cifras se apilan en 360 px y comparten fila en 1280 px

#### Scenario: Presupuesto
- **WHEN** se compila el frontend
- **THEN** el CSS en gzip no supera 33,75 kB y la CSP no cambia

