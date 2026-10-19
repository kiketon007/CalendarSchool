## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us04-pantalla-bienvenida` desde `main` actualizada
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US04 en `docs/User_Stories_MVP.md` y `.claude/settings.json` (que vuelve a Sonnet con esfuerzo medio para implementar)

## 1. Frontend: iconos y tarjeta de funcionalidad

- [x] 1.1 Crear en `components/icons/` los iconos SVG en línea de horarios (calendario), comedor (cubiertos) y usuarios (personas), con `aria-hidden="true"` y `focusable="false"` y sin dependencias nuevas
- [x] 1.2 Tests que fallan (`FeatureCard.test.tsx`): sin ruta, un `article` nombrado por su `h3`, con descripción y la insignia «Próximamente», sin enlaces ni botones y sin elementos enfocables; con ruta, un enlace a esa ruta con el nombre y la descripción y sin la insignia; el icono no aparece en el árbol de accesibilidad; sin violaciones de `axe` en los dos casos
- [x] 1.3 Implementar `components/FeatureCard.tsx` (clave de textos, icono y `to` opcional) con `Badge bg="secondary"` y la tarjeta de react-bootstrap

## 2. Frontend: pantalla de bienvenida

- [x] 2.1 Tests que fallan (`OnboardingPage.test.tsx`, ampliando los existentes): el saludo y el colegio como texto plano siguen igual; el `h2` «Elige con qué quieres trabajar» y las dos tarjetas próximamente, sin enlaces ni botones en ellas; la sección «Administración» con la tarjeta «Usuarios» que enlaza a `/usuarios` solo para `ADMIN`; un `MEMBER` no la ve; encabezados `h1` → `h2` → `h3`; nada en `localStorage` ni `sessionStorage`; sin violaciones de `axe` para `ADMIN` y para `MEMBER`
- [x] 2.2 Implementar `pages/OnboardingPage.tsx` con la lista de funcionalidades como datos (`schedules` y `canteen`, sin ruta), la cuadrícula `Row xs={1} md={2}` y la sección de administración; retirar «provisional» de sus comentarios
- [x] 2.3 Reescribir `onboarding.message` y añadir `onboarding.features.*`, `onboarding.comingSoon` y `onboarding.admin.*` en `es.json` y `en.json`, y comprobar `locales.test.ts`

## 3. Frontend: cabecera

- [x] 3.1 Tests que fallan (`AppHeader.test.tsx`): el nombre de la aplicación es un enlace a `/onboarding`; lleva `aria-current="page"` en `/onboarding` y no en `/usuarios`; el resto de la cabecera no cambia
- [x] 3.2 Implementar el `NavLink` del nombre en `components/AppHeader.tsx` con el mismo aspecto y retirar «provisional» de los comentarios de `AppHeader` y de `routes/RequireRole.tsx`

## 4. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 4.1 Revisar los tests que dependen de `/onboarding`, de `onboarding-page`, del texto de la bienvenida o del nombre de la aplicación en la cabecera (`App.test.tsx`, `RequireRole.test.tsx`, `LoginPage*.test.tsx`, `RegisterPage*.test.tsx`, `UsersPage*.test.tsx`, `AppHeader.test.tsx`) y actualizarlos solo si cambia su comportamiento
- [x] 4.2 Revisar los E2E que llegan a `/onboarding` o miran la cabecera (`registration.cy.ts`, `login.cy.ts`, `session.cy.ts`, `logout.cy.ts`, `users.cy.ts`, `users-management.cy.ts`, `invitation-acceptance.cy.ts`, `password-reset.cy.ts`, `csp.cy.ts`)

## 5. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 5.1 Capturar la línea base de `calendarschool` y `calendarschool_test` (recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links` y `municipalities` por esquema)
- [x] 5.2 Ejecutar los tests de los módulos modificados del frontend
- [x] 5.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 5.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 5.5 Crear el informe `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 6. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Con `npm run build` y el backend y `vite preview` arrancados en local: `GET /onboarding` y `GET /usuarios` responden `200` con el `index.html` de la SPA y la cabecera `Content-Security-Policy` sin cambios; `GET /api/health` responde `200`; y, como no hay endpoints nuevos ni modificados, `POST /api/auth/login`, `POST /api/auth/refresh` y `GET /api/users` con la sesión de un administrador de prueba responden como antes (`204`, `200` y `200`)
- [x] 6.2 Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y `vite preview` y comprobar que los puertos 3000 y 4173 quedan libres
- [x] 6.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-6-curl-manual-testing.md`

## 7. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Escribir `onboarding.cy.ts`: un administrador recién registrado ve el saludo, el colegio y las dos tarjetas con «Próximamente» (sin enlaces), entra en `/usuarios` desde la tarjeta «Usuarios» y vuelve a `/onboarding` con el nombre de la aplicación; un `MEMBER` creado con `createUser` inicia sesión y no ve «Administración»; con la ventana a 360 px las tarjetas se apilan sin desplazamiento horizontal
- [x] 7.2 Ejecutar en modo headless `onboarding.cy.ts` y las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 7.3 Verificar y restaurar la base de datos de test
- [x] 7.4 Documentar el resultado en `reports/YYYY-MM-DD-step-7-e2e-cypress.md`

## 8. Documentación (MANDATORY)

- [x] 8.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` (una funcionalidad que aún no existe se muestra como bloque no interactivo con su estado en texto, nunca como enlace roto ni botón deshabilitado; las funcionalidades como datos con ruta opcional), si añade una regla nueva
- [x] 8.2 Actualizar `frontend/CLAUDE.md` (la bienvenida definitiva, `FeatureCard`, los iconos y el enlace del nombre de la aplicación), `CLAUDE.md` raíz (estado del repositorio: ya no es provisional), `README.md` (árbol de ficheros) y las referencias a «provisional hasta US04» de las fichas US01_c, US02 y US02_b1 en `docs/User_Stories_MVP.md`
- [x] 8.3 Devolver `.claude/settings.json` a Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 8.4 Verificar con `openspec validate us04-pantalla-bienvenida --strict` que el cambio es válido

## 9. Despliegue y comprobación en producción

- [ ] 9.1 Abrir la PR con los grupos 0–8 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [ ] 9.2 Comprobar en producción con `curl` que `GET /onboarding` sirve la SPA con la CSP, y que la persona usuaria, con un navegador real, ve la bienvenida como administrador y como miembro (si tiene uno de prueba), entra en «Usuarios» desde la tarjeta y vuelve con el nombre de la aplicación, sin violaciones de CSP
- [ ] 9.3 Documentar el resultado en `reports/YYYY-MM-DD-step-9-production.md`
