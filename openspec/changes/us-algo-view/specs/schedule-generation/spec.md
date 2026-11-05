## MODIFIED Requirements

### Requirement: Panel de generación en «Generar horarios»
`/horarios` MUST mostrar, solo a un `ADMIN` y sin bloqueantes, el botón «Generar horarios» y el panel `components/ScheduleGenerationPanel`; un `MEMBER` MUST NOT ver el botón (puede ver el estado de una generación en curso o la última), y con bloqueantes MUST NOT haber botón y la página lo explica. Al montar el panel pide `GET /api/schedule/generate`; el sondeo cada 2 segundos MUST usar un temporizador encadenado, detenerse al desmontar o al terminar y descartar respuestas tardías. El panel MUST mostrar:
- **Generando:** «Generando horarios…», un `role="progressbar"` con el valor y el texto «{placed} de {total} sesiones» y un botón «Cancelar»; el botón «Generar» deshabilitado;
- **Completada:** «Horario borrador generado: {n} sesiones colocadas» (el `placed` de la respuesta, que no lleva el número de clases), la nota de que todavía no se puede confirmar, un enlace «Ver horario» a `/horarios/borrador` (también para un `MEMBER`, que no ve los botones) y el botón para generar de nuevo; solo el estado completado ofrece «Ver horario»;
- **Fallida:** el texto del `errorCode`, con la lección y su enlace para `INFEASIBLE` (diciendo que la restricción es orientativa salvo `NO_FREE_CELLS`), el motivo de `TIMEOUT` con qué relajar, y «Error interno durante la generación. Inténtalo de nuevo o contacta con soporte (ID: {id})» para `INTERNAL`; con `NOT_READY` vuelve a mostrar la comprobación;
- **Cancelada:** «Generación cancelada» y el botón para generar de nuevo.

`services/scheduleGenerationService.ts` (`start`, `current`, `get`, `cancel`) MUST devolver resultados por caso, validar la forma y no lanzar.

#### Scenario: Generar y seguir el progreso
- **GIVEN** un administrador en `/horarios` sin bloqueantes
- **WHEN** pulsa «Generar horarios»
- **THEN** ve «Generando horarios…», la barra con «N de M sesiones» y «Cancelar», y al terminar el resumen

#### Scenario: Un miembro
- **WHEN** un `MEMBER` abre `/horarios`
- **THEN** no ve «Generar horarios» ni «Cancelar»

#### Scenario: Con bloqueantes
- **THEN** no hay botón y la página dice que hay que corregirlos primero

#### Scenario: Recargar en mitad de una generación
- **WHEN** el administrador recarga la página con una generación `RUNNING`
- **THEN** el panel retoma su progreso sin pulsar nada

#### Scenario: Sondeo que se detiene
- **WHEN** la generación termina o el panel se desmonta
- **THEN** no se hacen más peticiones y una respuesta tardía no cambia la pantalla

#### Scenario: Errores
- **THEN** cada `errorCode` muestra su texto; `INFEASIBLE` enlaza a donde se corrige y `INTERNAL` muestra el id y nunca la traza

#### Scenario: Ver el horario desde el resumen
- **GIVEN** una generación completada
- **WHEN** un `ADMIN` o un `MEMBER` abre `/horarios`
- **THEN** el resumen ofrece «Ver horario», que lleva a `/horarios/borrador`; una generación en curso, fallida o cancelada no lo ofrece
