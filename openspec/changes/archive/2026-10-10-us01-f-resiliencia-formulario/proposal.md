## Why

Si el navegador recarga la página de registro (F5, un fallo de red que obliga a recargar o la restauración tras un cierre inesperado), el visitante pierde todo lo que había escrito y tiene que empezar de cero. US01_f (CA10) es la última parte de US01: conservar el formulario en la pestaña, salvo la contraseña, y garantizar que un envío repetido no crea cuentas duplicadas. Con ella, US01 queda completa.

## What Changes

- **Conservación del formulario (CA10):** el formulario guarda en `sessionStorage` de la pestaña, en cada cambio, el nombre del colegio, el municipio, el nombre, los apellidos y el email. La contraseña nunca se guarda. Al volver a cargar `/registro` en esa pestaña se restauran los valores, sin mostrar errores hasta que el usuario toque el campo o envíe. Tras un registro correcto (`201`) el borrador se borra, tanto si se llega a `/onboarding` como si se muestra el aviso de sesión fallida; ante cualquier otra respuesta se conserva.
- **Lectura defensiva:** un borrador con forma desconocida se descarta, un valor que no es texto o es desmesurado no se restaura (sin recortar nunca lo que escribió el usuario) y un municipio que no está en la lista se borra al cargarla. Si el navegador no permite usar el almacenamiento (modo privado, cuota, bloqueo), el formulario funciona igual, sin conservar nada.
- **Envíos repetidos:** mientras un envío está en curso, otro envío del mismo formulario (doble clic, Enter repetido) no llega al servidor. Entre pestañas o navegadores, la unicidad del email y del colegio en la base de datos (US01_b) ya garantiza un único alta y la segunda pestaña recibe su `409`.
- **Se descarta el «token de formulario único por sesión»** de la historia: antes del registro no hay sesión, y la unicidad de la base de datos junto con el bloqueo del envío cubren el caso sin un endpoint ni una tabla nuevos. Se anota la decisión en la historia.
- **Documentación:** README, `CLAUDE.md`, estándares si procede e historia de usuario (decisiones pendientes de US01_f resueltas y US01 completa).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `user-registration`: requisitos nuevos de conservación del formulario en la pestaña (CA10) y de envíos repetidos.

## Impact

- **Frontend:** módulo nuevo de borrador del registro (cargar, guardar y borrar, con el almacenamiento inyectable en los tests) y su uso en `RegisterPage`; la guarda de envío en curso de `RegisterPage` se refuerza si los tests lo exigen. Sin textos nuevos visibles salvo que el diseño lo pida.
- **Backend:** sin cambios. Los registros simultáneos ya están cubiertos por `registration.int.test.ts` («creates only one of two simultaneous registrations…»).
- **API (`docs/api-spec.yml`):** sin cambios.
- **Base de datos:** sin cambios.
- **Pruebas:** unitarias del borrador, de componente de `RegisterPage` (restauración, borrado tras el `201`, conservación ante errores, un único envío) y E2E (recargar conserva los datos sin la contraseña; tras registrarse, el formulario vuelve vacío).
- **Referencias:** US01_f (CA10) de `docs/User_Stories_MVP.md`; PRD §3.1 (registro); reglas comunes de US01.

### Fuera de alcance

Conservar el formulario al cerrar la pestaña o el navegador a propósito (exigiría `localStorage`, con riesgo de exponer datos personales en equipos compartidos), compartir el borrador entre pestañas, conservar el estado del captcha (reto v2) o del aviso de demasiados intentos, un token de formulario o de idempotencia en el servidor, y lo pendiente antes de publicar de US01_d y US01_e (claves de Google, consentimiento, CSP, `despliegue-aws`).
