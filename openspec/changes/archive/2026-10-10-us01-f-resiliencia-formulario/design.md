## Context

`RegisterPage` guarda los valores del formulario solo en estado de React (`values`, inicializado con `EMPTY_VALUES`): una recarga los pierde. El envío ya está protegido por `isPending` (el botón se deshabilita y `handleSubmit` sale si hay un envío en curso), pero la guarda lee el estado de la última renderización, así que dos envíos lanzados antes de volver a renderizar (por ejemplo, dos `requestSubmit()` seguidos) pasarían los dos. En el servidor, la unicidad del email y del colegio ya impide dos altas con los mismos datos aunque lleguen a la vez (`registration.int.test.ts`, «creates only one of two simultaneous registrations…»).

Hoy el frontend no usa `sessionStorage` ni `localStorage` para nada; la sesión vive solo en memoria (`SessionProvider`) y así debe seguir. US01_f es solo de frontend: sin cambios en el backend, el contrato ni la base de datos.

## Goals / Non-Goals

**Goals:**

- CA10: recargar `/registro` en la misma pestaña conserva lo escrito salvo la contraseña, y un registro correcto lo borra.
- Que el borrador no pueda romper la página: datos corruptos, manipulados o un almacenamiento no disponible se ignoran.
- Que un envío repetido mientras otro está en curso no llegue al servidor.

**Non-Goals:**

- Sobrevivir al cierre deliberado de la pestaña o del navegador, ni compartir el borrador entre pestañas (requeriría `localStorage`).
- Conservar el captcha (reto v2, tokens), el aviso de demasiados intentos, los errores o el estado `touched`.
- Un token de formulario o de idempotencia en el servidor.

## Decisions

### D1. `sessionStorage` y no `localStorage`

El borrador vive en `sessionStorage`: sobrevive a las recargas y, en los navegadores principales, a la restauración de la sesión tras un cierre inesperado, pero se borra al cerrar la pestaña. Contiene datos personales (nombre, apellidos, email); en un colegio es habitual el equipo compartido (secretaría, sala de profesores) y con `localStorage` el siguiente usuario vería los datos del anterior.

*Alternativa descartada:* `localStorage` con caducidad. Cubre el cierre deliberado, pero mantiene datos personales en disco más allá de la sesión y exige una política de caducidad; el formulario es corto y el coste de reescribirlo es bajo.

### D2. Módulo `registrationDraft` en `services/`

`frontend/src/services/registrationDraft.ts` expone `loadRegistrationDraft()`, `saveRegistrationDraft(values)` y `clearRegistrationDraft()`, y es el único que conoce la clave (`calendarschool:registration-draft:v1`) y el almacenamiento. `RegisterPage` no toca `sessionStorage`. Para los tests, el módulo exporta también una fábrica `createRegistrationDraft(getStorage)` que recibe cómo obtener el almacenamiento; las funciones por defecto usan `() => window.sessionStorage`.

- **Qué se guarda:** `schoolName`, `municipalityCode`, `firstName`, `lastName` y `email`, tal como están escritos (sin normalizar ni recortar). `saveRegistrationDraft` recibe los valores completos del formulario y descarta `password` por construcción (lista explícita de campos guardables, no «todos menos la contraseña»), para que un campo nuevo no se guarde sin decidirlo.
- **Formato:** `JSON` de un objeto con esos campos. La versión va en la clave: un cambio de formato futuro usa `:v2` y el borrador antiguo se ignora.

*Alternativa descartada:* un contexto de React inyectable, como `CaptchaClientContext`. El captcha lo necesita porque el cliente real carga un script de Google; aquí jsdom ya trae un `sessionStorage` real que los tests limpian, y los fallos se simulan con la fábrica o espiando `Storage.prototype`.

### D3. Lectura y escritura defensivas

- Obtener `window.sessionStorage`, leer, escribir y borrar van dentro de `try/catch` (el acceso puede lanzar `SecurityError` con el almacenamiento bloqueado, y `setItem` `QuotaExceededError`). Ante un fallo, `load` devuelve un borrador vacío y `save` y `clear` no hacen nada: el formulario funciona igual, sin conservar. Los fallos no se registran ni se muestran: no son accionables para el usuario.
- `load` descarta el borrador entero si no es `JSON` válido o no es un objeto. Dentro de un objeto válido, restaura solo los campos guardables cuyo valor es una cadena de como mucho 1000 caracteres (muy por encima del máximo de cualquier campo, 320 del email); el resto se ignora. Nunca se recorta un valor: lo que se restaura es exactamente lo que el usuario escribió, y la validación inline lo trata como cualquier otro valor.
- `load` devuelve un `Partial` de los valores; la página lo combina con `EMPTY_VALUES`, de modo que la contraseña siempre empieza vacía.

### D4. Integración en `RegisterPage`

- **Restaurar:** el estado se inicializa de forma perezosa, `useState(() => ({ ...EMPTY_VALUES, ...loadRegistrationDraft() }))`, para leer el almacenamiento una sola vez y en la primera renderización (sin parpadeo de campos vacíos). `touched` y `submitted` empiezan en falso: los errores de los valores restaurados aparecen como siempre, al salir del campo o al enviar.
- **Guardar:** un efecto sobre `values` llama a `saveRegistrationDraft(values)` en cada cambio. Son cinco campos cortos y `setItem` es síncrono y barato, así que no hace falta esperar a que el usuario deje de escribir.
- **Municipio desconocido:** el código restaurado se usa tal cual mientras se carga la lista; cuando `useMunicipalities` está listo y el código no está en la lista, los valores efectivos del formulario lo descartan (se deriva con `useMemo` de los valores escritos, sin un efecto que cambie el estado; el borrador guarda ya el valor limpio). El buscador no mostraría nada y el envío acabaría en un error que el usuario no podría ver ni corregir. Si la lista no carga, el formulario ya no se puede enviar y no se hace nada.
- **Borrar:** tras un `201`, antes de pedir la sesión, se marca el registro como completado (una `ref`) y se llama a `clearRegistrationDraft()`. Con la marca, el efecto de guardado deja de escribir: si no, el `setValue('password', '')` del aviso de sesión fallida volvería a guardar el borrador. Ante `400`, `409`, `422`, `429`, `503` o un error inesperado el borrador se conserva (el usuario va a corregir o reintentar).
- **Navegación:** al llegar a `/onboarding` la página se desmonta; si el usuario vuelve a `/registro`, el formulario empieza vacío porque el borrador ya no existe.

### D5. Un único envío en curso

La guarda de `handleSubmit` pasa de leer el estado `isPending` a una `ref` (`isSubmittingRef`) que se activa de forma síncrona al empezar el envío y se libera en todos los caminos de salida (validación del cliente no superada, reto sin resolver, captcha no disponible, respuesta del servidor), incluido un error inesperado (`try/finally`). `isPending` sigue existiendo para la interfaz (botón deshabilitado y texto «Enviando…»). Así la protección no depende de cuándo React vuelve a renderizar.

Entre pestañas o navegadores no hay coordinación en el cliente: cada pestaña tiene su propio `sessionStorage` (una pestaña duplicada recibe una copia del borrador, lo que es inofensivo), y si dos envían los mismos datos el servidor crea una sola cuenta y la otra recibe su `409` con el mensaje ya existente.

*Alternativa descartada:* el «token de formulario único por sesión» de la historia. Antes del registro no hay sesión; exigiría un endpoint para emitirlo, una tabla con caducidad y otra comprobación en el registro, para obtener la misma garantía que ya da la unicidad en la base de datos. Tampoco un `BroadcastChannel` entre pestañas: el `409` ya informa correctamente al segundo.

### D6. Estrategia de pruebas

- **Unitarias de `registrationDraft`** (con un almacenamiento falso de la fábrica): guarda solo los cinco campos y nunca la contraseña; restaura lo guardado; ignora `JSON` inválido, valores que no son objetos, campos desconocidos, valores que no son cadenas y cadenas de más de 1000 caracteres; `clear` borra; un almacenamiento que lanza al obtenerse, al leer, al escribir o al borrar no propaga el error.
- **De componente de `RegisterPage`** (con el `sessionStorage` de jsdom, vaciado antes de cada test en `setupTests.ts` para que no haya fugas entre tests): restaura al montar sin mostrar errores; guarda al escribir y nunca la contraseña; borra tras el `201` (con sesión y con sesión fallida, y sin volver a guardarlo después); conserva ante `409`, `429` y error inesperado; borra un municipio que no está en la lista; con el almacenamiento roto, el registro funciona; dos `requestSubmit()` seguidos producen una sola llamada a `register`.
- **E2E (Cypress):** rellenar, recargar y comprobar que los campos se conservan y la contraseña está vacía; registrarse y, al volver a `/registro`, encontrar el formulario vacío.
- **Backend:** ninguno nuevo; los registros simultáneos ya están probados.

## Risks / Trade-offs

- [Datos personales en `sessionStorage`, accesibles a cualquier script de la página] → Son los mismos datos que ya están en el DOM, el borrador desaparece al cerrar la pestaña y al registrarse, y nunca incluye la contraseña. La mitigación de fondo frente a XSS es la CSP, pendiente antes de publicar.
- [El borrador sobrevive a un registro abandonado mientras la pestaña siga abierta] → Es justo lo que pide CA10; al cerrar la pestaña desaparece.
- [Un efecto de guardado que vuelve a escribir tras el `201`] → La marca de registro completado (D4) y un test específico.
- [Restaurar un email ya registrado por otra pestaña] → El envío recibe el `409` con el enlace a login, igual que sin borrador.
- Rendimiento: una escritura síncrona de menos de 1 KB por pulsación, despreciable. Sin impacto en seguridad del backend, JWT ni aislamiento por colegio.

## Migration Plan

Sin migración: no hay datos previos. El despliegue es solo del frontend. Para revertir basta con quitar el uso del módulo; un borrador que quede en una pestaña abierta se ignora y desaparece al cerrarla.

## Open Questions

Ninguna.
