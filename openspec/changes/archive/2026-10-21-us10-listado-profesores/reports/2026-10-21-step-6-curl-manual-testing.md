# Informe del paso 6 - Pruebas manuales con curl

- Fecha: 2026-10-21
- Cambio: us10-listado-profesores
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool`, con el verificador de captcha falso (variables de la plantilla `.env.example`, sin `RECAPTCHA_*`).
- Este cambio **no modifica la API**: la paginación es del navegador. Las pruebas comprueban que `GET /api/professors` sigue cumpliendo lo que la página necesita (todos los profesores del colegio, ordenados, con `tutoredClass`) y que ignora parámetros de paginación.
- Dos colegios registrados por la API («Colegio Curl Diez A» y «Colegio Curl Diez B»), cada uno con su administrador. Los tokens se obtienen con `POST /api/auth/refresh` desde la cookie del registro. No se imprimen ni se guardan contraseñas, tokens ni cookies. El script (`curl_us10.sh`, en el directorio temporal de la sesión) se ejecutó una vez: **20 comprobaciones correctas, ninguna fallida**.

## Resultados

| Caso | Respuesta |
|---|---|
| 25 altas `POST /api/professors` en el colegio A, en orden inverso (25 → 1), la 07 con `classId` de la clase A de «1º Primaria» | `201` las 25 |
| Una alta en el colegio B | `201` |
| `GET /api/professors` del colegio A | `200`; 25 profesores; el primero «Apellido01» y el último «Apellido25» (orden por apellidos y nombre aunque se crearon al revés); el 07 con `tutoredClass` (`name: "A"`, `courseName: "1º Primaria"`); los otros 24 con `tutoredClass: null`; `subjects: []` en los 25; ninguno del colegio B |
| `GET /api/professors?page=2&limit=5` | `200`; los 25, sin cambios: los parámetros se ignoran |
| `GET /api/professors` del colegio B | `200`; solo su profesor |
| Sin token | `401` |
| Token inválido | `401` |

## Eventos del log

- 27 eventos `COURSE_CREATED` y `PROFESSOR_CREATED` (los de las altas); ningún nombre de profesor aparece en el log (se buscaron los nombres usados: 0 coincidencias).

## Limpieza y estado final

- Se borraron los datos de los dos colegios de la prueba (`professors` → `courses` → `refresh_tokens` → `access_links` → `users` → `schools`, y los intentos limitados).
- Comparado con la línea base del paso 5 (`diff`): **idéntico** en la base de desarrollo y en todos los esquemas de la base de test.
- Se paró el backend (con `taskkill` sobre el árbol del proceso) y se comprobó que el puerto 3000 queda libre (0 conexiones en escucha).

## Resultado

- Estado del paso 6: PASA
- Problemas bloqueantes: ninguno
