## ADDED Requirements

### Requirement: Conservación del formulario en la pestaña
El formulario de registro MUST guardar en `sessionStorage`, en cada cambio, el nombre del colegio, el municipio, el nombre, los apellidos y el email tal como están escritos, y MUST NOT guardar nunca la contraseña. Al cargar `/registro` en la misma pestaña MUST restaurar esos valores, con la contraseña vacía y sin mostrar errores hasta que el usuario salga del campo o envíe. Tras un `201` MUST borrar el borrador y no volver a escribirlo, tanto si se llega a Onboarding como si se muestra el aviso de cookies deshabilitadas o de sesión no iniciada; ante cualquier otra respuesta MUST conservarlo. Un borrador que no sea un objeto `JSON` MUST ignorarse entero, y un campo desconocido, que no sea texto o de más de 1000 caracteres MUST ignorarse sin recortar los demás. Un municipio restaurado que no esté en la lista cargada MUST borrarse. Si el navegador no permite usar `sessionStorage`, el formulario MUST funcionar igual, sin conservar los datos y sin mostrar errores.

#### Scenario: Recarga con datos a medias
- **GIVEN** he escrito el nombre del colegio, elegido un municipio y escrito el nombre, los apellidos, el email y la contraseña
- **WHEN** recargo la página
- **THEN** los campos conservan lo que escribí salvo la contraseña, que está vacía
- **AND** no se muestra ningún error bajo los campos

#### Scenario: La contraseña nunca se guarda
- **WHEN** escribo en cualquier campo, contraseña incluida
- **THEN** el borrador guardado contiene los cinco campos conservables y ningún dato de la contraseña

#### Scenario: Borrado tras un registro correcto
- **GIVEN** he enviado el formulario y el servidor responde `201`
- **WHEN** se llega a Onboarding o se muestra el aviso de sesión no iniciada
- **THEN** el borrador ya no existe
- **AND** si vuelvo a `/registro`, el formulario está vacío

#### Scenario: Se conserva ante un error
- **WHEN** el servidor responde `400`, `409`, `422`, `429`, `503` o con un error inesperado
- **THEN** el borrador se conserva y al recargar se restauran los datos

#### Scenario: Borrador corrupto o manipulado
- **GIVEN** el borrador no es `JSON` válido, no es un objeto, o tiene campos que no son texto, desconocidos o de más de 1000 caracteres
- **WHEN** cargo `/registro`
- **THEN** la página se muestra sin errores y solo se restauran los campos válidos

#### Scenario: Municipio que no está en la lista
- **GIVEN** el borrador tiene un código de municipio que no está en la lista
- **WHEN** la lista termina de cargarse
- **THEN** el municipio queda sin elegir

#### Scenario: Almacenamiento no disponible
- **GIVEN** el navegador bloquea `sessionStorage` o no admite más datos
- **WHEN** relleno y envío el formulario
- **THEN** el registro funciona igual y no se muestra ningún error relacionado con el almacenamiento

#### Scenario: Solo en la misma pestaña
- **WHEN** abro `/registro` en otra pestaña nueva
- **THEN** el formulario está vacío

### Requirement: Envíos repetidos del formulario
Mientras un envío del formulario de registro está en curso, el frontend MUST ignorar cualquier otro envío del mismo formulario (doble clic, Enter repetido o envíos lanzados antes de volver a renderizar) sin llamar al servidor, con el botón de envío deshabilitado. Si dos pestañas o navegadores envían a la vez los mismos datos, MUST crearse una sola cuenta (requisitos «Email ya registrado» y «Colegio ya registrado en el municipio») y el otro envío MUST recibir el mensaje del `409` correspondiente. No existe un token de formulario.

#### Scenario: Doble envío
- **GIVEN** el formulario es válido
- **WHEN** se envía dos veces seguidas antes de que llegue la respuesta
- **THEN** se hace una sola petición a `POST /api/auth/register`
- **AND** el botón de envío está deshabilitado mientras dura

#### Scenario: Nuevo envío tras la respuesta
- **GIVEN** un envío terminó con un error que se puede corregir
- **WHEN** corrijo el dato y vuelvo a enviar
- **THEN** se hace una nueva petición

#### Scenario: Dos pestañas con el mismo email
- **WHEN** dos pestañas envían a la vez un registro con el mismo email
- **THEN** solo se crea una cuenta
- **AND** la otra pestaña muestra «Este email ya está registrado» con el enlace a login
