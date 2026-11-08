## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-ui-home` desde `main` actualizada (`08be55d`, con US-UI-LISTS_c archivada), con los artefactos de este cambio y la concreción de la ficha en `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene esos ficheros y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Piezas sueltas: fecha, icono y lista de la barra

- [x] 1.1 Test que falla en `src/utils/longDate.test.ts` para `longDate(date, locale)` (D2): `es` («Domingo, 8 de noviembre de 2026», `2026-11-08`), `en` («Sunday, November 8, 2026») y un instante local a las 0:30 cuyo `iso` es el día local y no el UTC. Después, crear `src/utils/longDate.ts` hasta que pase
- [x] 1.2 Crear `components/icons/ArrowRightIcon.tsx` (Lucide, `IconProps`, `aria-hidden` y `focusable="false"` como el resto)
- [x] 1.3 Mover `NavItem`, `WORKSPACE_LINKS` y `ADMIN_LINKS` de `components/AppShell.tsx` a `components/navigation.ts` (la regla `react-refresh/only-export-components` impide exportarlos desde un fichero de componente) y que `AppShell` los importe, sin otro cambio; `AppShell.test.tsx` sigue en verde

## 2. `FeatureCard`

- [x] 2.1 Reescribir `FeatureCard.test.tsx` en rojo (D4):
  - enlace a su ruta con el nombre y la descripción;
  - `h3` con el nombre;
  - icono en un cuadro con su tono (`cs-tone-<tone>`);
  - icono y flecha con `aria-hidden`;
  - sin «Próximamente»;
  - `axe` limpio.
  
  Se quitan los casos sin ruta.
- [x] 2.2 Cambiar `FeatureCard.tsx` (`to` obligatoria, `tone`, `Link.cs-feature-card` sin `Card`, sin la rama `article` ni la `Badge`) hasta que pase 2.1

## 3. Estilos de la portada

- [x] 3.1 Tests que fallan en `styles/theme.test.ts`: contraste ≥ 4,5:1 del texto de `.cs-home-banner` sobre su fondo, y ninguna `transition` ni `transform` de `.cs-feature-card` fuera de `@media (prefers-reduced-motion: no-preference)`
- [x] 3.2 Crear `styles/_home.scss` (D5) e importarlo en `theme.scss` hasta que pase 3.1; anotar el gzip del CSS del build antes y después

## 4. Textos

- [x] 4.1 Cambiar y añadir en `es.json` y `en.json` las claves de D7 y eliminar `onboarding.features.canteen` y `onboarding.comingSoon`. Comprobar a mano que los nombres en inglés coinciden con `header.*` de `en.json`. `locales.test.ts` en verde

## 5. `/onboarding`

- [x] 5.1 Tests que fallan en `OnboardingPage.test.tsx`, con la fecha fijada (`vi.useFakeTimers({ toFake: ['Date'] })`):
  - **Banner:** una región nombrada «Hola, José María» con el `time` «Domingo, 8 de noviembre de 2026» y `dateTime="2026-11-08"`, el `h1` y «Aquí tienes todo lo de CEIP Lluís Vives», con el colegio en `strong`; en inglés, «Sunday, November 8, 2026» y «Hello, José María».
  - **Secciones:** el sobretítulo «Tu colegio» y el `h2` «¿Qué quieres gestionar hoy?»; siete enlaces en orden (Horarios, Cursos, Profesores, Alumnos, Calendarios, Asignaturas y Reglas) con su `href` y su descripción; sin «Gestión de comedor» ni «Próximamente».
  - **Una sola fuente:** los destinos son los de `WORKSPACE_LINKS` sin `/onboarding`, y el nombre de cada tarjeta es el de su enlace de la barra.
  - **Administración:** «Usuarios» con `href` `/usuarios` para `ADMIN`; nada para `MEMBER`.
  - **Encabezados:** `H1`, `H2`, siete `H3`, `H2` y `H3` para `ADMIN`, y `H1`, `H2` y siete `H3` para `MEMBER`.
- [x] 5.2 Cambiar `OnboardingPage.tsx` (D1, D3, D6: banner, `SECTIONS`, cuadrícula `xs={1} sm={2} xl={4}`, contenedor `fluid="xxl"`) hasta que pasen 5.1
- [x] 5.3 Ajustar el resto de `OnboardingPage.test.tsx` (texto plano con marcas y apóstrofos sobre el banner, nada en almacenamiento y `axe` para `ADMIN` y `MEMBER`) y quitar los casos de «Próximamente»; toda la suite del fichero en verde
- [x] 5.4 Eliminar `CutleryIcon`, `CalendarIcon` y `UsersIcon` tras comprobar con `grep` que nadie más los importa (D8)

## 6. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 6.1 `App.test.tsx`: el caso «keeps the "Gestión de horarios" card of the welcome screen as coming soon, not a link» pasa a comprobar que la tarjeta Horarios de `main` enlaza a `/horarios`. Buscar con `grep` cualquier otro uso de `onboarding.features`, `onboarding.comingSoon` u `onboarding.title`
- [x] 6.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 7. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 7.1 Capturar la línea base de recuentos de `calendarschool` y `calendarschool_test`
- [x] 7.2 Ejecutar los tests de los ficheros cambiados (`longDate`, `FeatureCard`, `OnboardingPage`, `AppShell`, `theme`, `locales`, `App`)
- [x] 7.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 7.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 7.5 Crear `reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`, con el tamaño del CSS y del JS del build frente a los de `main`, y marcar el paso solo con el informe creado

## 8. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Servir el build con `vite preview` (puerto 4173, desde `frontend/`) y comprobar con `curl`:
  - que la cabecera `Content-Security-Policy` es idéntica a la de `main`;
  - que el CSS enlazado no tiene URLs externas;
  - que el CSS contiene `.cs-home-banner` y `.cs-feature-card`.
- [x] 8.2 Comprobar con `curl` que `/onboarding` devuelve la SPA. Sin endpoints nuevos: no hay peticiones de escritura que restaurar
- [x] 8.3 Parar `vite preview`, comprobar que los puertos 4173, 3000 y 3001 quedan libres y crear `reports/YYYY-MM-DD-step-8-curl-manual-testing.md`

## 9. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Reescribir `cypress/e2e/onboarding.cy.ts`:
  - **Administrador:** saludo, colegio y fecha visible; siete enlaces en `main`; ir a Horarios desde su tarjeta y volver con «Inicio»; ir a `/usuarios` desde su tarjeta y volver con la marca.
  - **Miembro:** con `createUser`, ve las siete y no «Administración».
  - **A 360 px:** una columna (misma `left`, tarjetas apiladas), `expectNoHorizontalScroll` y cada tarjeta de al menos 44 px de alto.
  - **A 1280 px:** las cuatro primeras tarjetas con la misma `top` y la quinta debajo, y `expectNoHorizontalScroll`.
- [x] 9.2 `cypress/e2e/courses.cy.ts`: el caso «keeps the welcome card "Gestión de horarios" as coming soon» pasa a comprobar que la tarjeta Horarios de `main` enlaza a `/horarios`. Buscar con `grep` en `cypress/` otros usos de `onboarding.features` o de `article` en `/onboarding`
- [x] 9.3 Ejecutar las specs cambiadas y la suite completa en modo headless (`npm run test:e2e`), en dos tandas si la memoria lo exige; los datos del E2E se limpian al empezar (`scripts/e2eData.mjs`)
- [x] 9.4 Crear `reports/YYYY-MM-DD-step-9-e2e-cypress.md`

## 10. Documentación técnica (MANDATORY)

- [x] 10.1 Actualizar con la skill `update-docs`:
  - `frontend/CLAUDE.md`: el bullet «Pantalla de bienvenida (US04)», con el banner, la fecha (`longDate`), `SECTIONS` atada a `WORKSPACE_LINKS`, `FeatureCard` siempre enlace con tono y `_home.scss`, y sin «Próximamente»;
  - en `docs/User_Stories_MVP.md`: una nota en la ficha de US04 («modificada por US-UI-HOME: sin Comedor ni Próximamente; siete secciones enlazadas»), la línea de estado de US-UI-HOME (implementada) y la fila del módulo «Interfaz de usuario».
- [ ] 10.2 Revisar a mano el `Purpose` de `openspec/specs/welcome-screen/spec.md` tras archivar: hoy menciona «Próximamente» y el archivado no lo reescribe
- [x] 10.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 10.4 Verificar con `openspec validate us-ui-home --strict` que el cambio es válido

## 11. Despliegue y comprobación en producción

- [ ] 11.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–10 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [ ] 11.2 Comprobar en producción (`https://app.calendarschools.es`):
  - **Con `curl`:** `/onboarding` devuelve la SPA, la cabecera `Content-Security-Policy` no ha cambiado y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, revisa la portada en escritorio y en móvil.
- [ ] 11.3 Documentar el resultado en `reports/YYYY-MM-DD-step-11-production.md`
