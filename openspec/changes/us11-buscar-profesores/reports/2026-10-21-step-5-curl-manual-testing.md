# Informe del paso 5 - Pruebas manuales con curl

- Fecha: 2026-10-21
- Cambio: us11-buscar-profesores
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool`, con el verificador de captcha falso (variables de la plantilla `.env.example`, sin `RECAPTCHA_*`).
- Este cambio **no modifica la API**: la búsqueda es del navegador. Las pruebas comprueban que `GET /api/professors` sigue devolviendo los nombres con tildes, `ñ`, guiones y apóstrofos tal cual (UTF-8, sin escapar ni normalizar) y que ignora parámetros de búsqueda.
- Un colegio registrado por la API («Colegio Curl Once A»). Los tokens se obtienen con `POST /api/auth/refresh` desde la cookie del registro. Los cuerpos con tildes se envían desde fichero (`--data-binary @fichero`). No se imprimen ni se guardan contraseñas, tokens ni cookies. El script (`curl_us11.sh`, en el directorio temporal de la sesión) se ejecutó una vez: **15 comprobaciones correctas, ninguna fallida**.

## Resultados

| Caso | Respuesta |
|---|---|
| Altas de «José María García-López», «Mary O'Neill», «Íñigo Núñez» y «Ana García» | `201` las cuatro |
| `GET /api/professors` | `200`; los 4; «José María» con su tilde, «O'Neill» con su apóstrofo y «Núñez» con su `ñ`, tal cual; orden por apellidos: García, García-López, Núñez, O'Neill |
| `GET /api/professors?q=garcia` y `?search=zzz` | `200`; los 4 en cada caso: los parámetros se ignoran |
| Sin token | `401` |
| Token inválido | `401` |

## Eventos del log

- Ningún nombre de profesor aparece en el log (se buscaron los nombres usados: 0 coincidencias).

## Limpieza y estado final

- Se borraron los datos del colegio de la prueba (`professors` → `courses` → `refresh_tokens` → `access_links` → `users` → `schools`, y los intentos limitados).
- Comparado con la línea base del paso 4 (`diff`): **idéntico** en la base de desarrollo y en todos los esquemas de la base de test.
- Se paró el backend (con `taskkill` sobre el árbol del proceso) y se comprobó que el puerto 3000 queda libre (0 conexiones en escucha).

## Resultado

- Estado del paso 5: PASA
- Problemas bloqueantes: ninguno
