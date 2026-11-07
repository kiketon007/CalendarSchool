## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-ui-theme` desde `main` actualizada (`6b7aa4c`, con las fichas US-UI integradas), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Sass y tema

- [x] 1.1 Añadir `sass` (`^1`) a las `devDependencies` del frontend desde la raíz (`npm install -D sass -w frontend`) y denegar de forma explícita en `allowScripts` el script de instalación de su dependencia opcional `@parcel/watcher` (`npm deny-scripts @parcel/watcher`), de modo que `npm install` no avise de scripts pendientes
- [x] 1.2 Crear `src/testSupport/contrast.ts` (luminancia relativa y contraste WCAG 2.1) con un test propio de valores conocidos (blanco/negro 21:1, `#94a3b8` sobre blanco 2,56:1)
- [x] 1.3 Escribir `src/styles/theme.test.ts` que compila `src/styles/theme.scss` con la API de `sass` y comprueba los tokens de D3 (`--bs-primary`, `--bs-body-bg`, `--bs-body-color`, `--bs-secondary-color`, `--bs-btn-bg` de `.btn-primary`, borde y fondo de `.form-control`) y que no hay avisos; falla porque el fichero no existe
- [x] 1.4 Crear `src/styles/theme.scss` con las variables de D3 y el `@import` de Bootstrap, y configurar en `vite.config.ts` `css.preprocessorOptions.scss` (`quietDeps`, `silenceDeprecations: ['import']`) hasta que pase 1.3
- [x] 1.5 Añadir a `theme.test.ts` los contrastes de D3 leídos del CSS compilado (texto principal, secundario y enlaces sobre `#f7f8fc` y blanco, texto del botón primario ≥ 4,5:1; borde del campo ≥ 3:1), que deben pasar, y comprobar a mano que con `#94a3b8` como secundario el test falla nombrando la pareja
- [x] 1.6 Tests que fallan e implementación de `.cs-card`, `.cs-eyebrow` y `.cs-tone-*` (D4) en `theme.scss`: presencia de las clases, primer plano y fondo de cada tono con contraste ≥ 4,5:1 y transiciones solo bajo `prefers-reduced-motion: no-preference`
- [x] 1.7 Cambiar `main.tsx` para importar `./styles/theme.scss` en lugar de `bootstrap/dist/css/bootstrap.min.css`; `npm run build -w frontend` sin avisos de Sass y una sola copia de Bootstrap en el CSS
- [x] 1.8 Medir el CSS del build (kB y gzip) y comprobar que no supera 33,75 kB en gzip; si lo supera, importar solo los parciales de Bootstrap usados

## 2. PageHeader

- [x] 2.1 Tests que fallan de `src/components/PageHeader.test.tsx`: cabecera completa (orden sobretítulo → `h1` → descripción, `id` y `tabIndex=-1`, acción en su zona), foco programático por la ref, cabecera mínima sin contenedores vacíos, textos con `<b>` como texto y `axe` sin infracciones
- [x] 2.2 Implementar `src/components/PageHeader.tsx` (D5) hasta que pasen, sin adoptarlo en ninguna página

## 3. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 3.1 Revisar que ningún test existente dependa de la hoja precompilada de Bootstrap ni de colores (`main.tsx` está excluido de la cobertura) y ajustar los que lo hagan
- [x] 3.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 4. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 4.1 Capturar la línea base de recuentos de `calendarschool` y `calendarschool_test`
- [x] 4.2 Ejecutar los tests de los ficheros nuevos (`theme.test.ts`, `contrast`, `PageHeader.test.tsx`)
- [x] 4.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 4.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 4.5 Crear `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md` (con las medidas del CSS de 1.8) y marcar el paso solo con el informe creado

## 5. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Servir el build con `vite preview` (puerto 4173) y comprobar con `curl` que la cabecera `Content-Security-Policy` es idéntica a la de `main` (sin cambios en `content-security-policy.json`)
- [x] 5.2 Descargar el CSS enlazado desde `index.html` y comprobar que contiene `--bs-primary:#5b5bd6`, `--bs-body-bg:#f7f8fc`, el `--bs-btn-bg` del botón primario y las clases `cs-`, y que no referencia fuentes ni URLs externas
- [x] 5.3 Parar `vite preview`, comprobar que los puertos 4173 y 3000 quedan libres y crear `reports/YYYY-MM-DD-step-5-curl-manual-testing.md`

## 6. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Crear `cypress/e2e/theme.cy.ts`: en `/login`, el fondo del `body` es `rgb(247, 248, 252)`, el color del texto `rgb(23, 35, 59)` y el fondo del botón de enviar `rgb(91, 91, 214)` con texto blanco; a 360 px sin desplazamiento horizontal
- [x] 6.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`), en dos tandas si la memoria lo exige
- [x] 6.3 Crear `reports/YYYY-MM-DD-step-6-e2e-cypress.md`

## 7. Documentación técnica (MANDATORY)

- [x] 7.1 Actualizar con la skill `update-docs`:
  - `frontend/CLAUDE.md`: bullet «Tema» (dónde viven los tokens, por qué Sass, las clases `cs-`, `PageHeader`, el test de contraste y que el arranque carga `theme.scss`);
  - `README.md` §2.3: Sass en el stack del frontend;
  - la ficha de US-UI-THEME y la fila del módulo «Interfaz de usuario» en `docs/User_Stories_MVP.md` (implementada).
- [x] 7.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 7.3 Verificar con `openspec validate us-ui-theme --strict` que el cambio es válido

## 8. Despliegue y comprobación en producción

- [ ] 8.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–7 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [ ] 8.2 Comprobar en producción:
  - **Con `curl`:** el CSS publicado contiene `--bs-primary:#5b5bd6` y la cabecera `Content-Security-Policy` no ha cambiado; `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, recorre varias pantallas (login, cursos, horarios) y ve el color índigo, el fondo nuevo y los campos con su borde.
- [ ] 8.3 Documentar el resultado en `reports/YYYY-MM-DD-step-8-production.md`
