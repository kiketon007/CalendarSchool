## MODIFIED Requirements

### Requirement: Resumen del oficial en «Generar horarios»
`/horarios` MUST mostrar arriba, a los dos roles, `components/OfficialScheduleSummary.tsx` con `GET /api/schedule/overview`: «Horario oficial: confirmado el … por …» y un enlace «Ver horario oficial», o «Todavía no hay ningún horario oficial». Si `previousCount` es mayor que 0, el resumen MUST enlazar además «Horarios anteriores (N)» a `/horarios/anteriores` (US-ALGO-CONFIRM_b); con 0, MUST NOT mostrar ese enlace. Debajo siguen la comprobación y el panel de generación. Un fallo del resumen MUST NOT impedir usar la comprobación ni el panel.

#### Scenario: Con oficial
- **GIVEN** un oficial
- **WHEN** un `MEMBER` abre `/horarios`
- **THEN** ve arriba «Horario oficial: confirmado el … por …» y «Ver horario oficial»

#### Scenario: Con horarios anteriores
- **GIVEN** un oficial vigente y dos sustituidos
- **WHEN** un `MEMBER` abre `/horarios`
- **THEN** el resumen enlaza «Horarios anteriores (2)» a `/horarios/anteriores`

#### Scenario: Sin horarios anteriores
- **GIVEN** un oficial vigente y ningún sustituido
- **WHEN** se abre `/horarios`
- **THEN** el resumen no tiene el enlace «Horarios anteriores»
