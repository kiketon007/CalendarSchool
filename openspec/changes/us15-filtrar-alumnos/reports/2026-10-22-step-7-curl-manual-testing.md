# Informe del paso 7 - Pruebas manuales con curl

- Fecha: 2026-10-22
- Cambio: us15-filtrar-alumnos
- Agente: Claude Sonnet 5.5

## Alcance

Esta historia no añade ni cambia ningún endpoint: el filtrado y la paginación se hacen en el navegador. Las pruebas comprueban que `GET /api/students` **sigue igual** y que los parámetros de filtro de la URL de la página no llegan a la API (si llegaran, se ignorarían).

## Entorno

- Backend local (`node --env-file=<plantilla> --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool`, con el verificador de captcha falso (variables de la plantilla `.env.example`, sin `RECAPTCHA_*`). Sin migraciones.
- Script `curl_us15.sh` (no imprime contraseñas, tokens ni cookies): registra dos colegios por `POST /api/auth/register` y obtiene el token con `POST /api/auth/refresh`. Los cuerpos con tildes se envían desde fichero (`--data-binary @fichero`).

## Datos creados

- Colegio A: «1º Primaria» (clases A y B) y tres alumnos: Juan García (con clase, comedor, beca, tipo de comida y observaciones), Ana Álvarez (sin clase ni comedor) y Luis Pérez (con comedor y sin beca).
- Colegio B: «1º Primaria» (clase A) y un alumno.

## Casos y resultados (19 comprobaciones, todas correctas)

| Caso | Petición | Resultado |
| --- | --- | --- |
| Listado | `GET /api/students` | `200`; los 3 alumnos del colegio A por apellidos y nombre: Álvarez Ana, García Juan, Pérez Luis |
| Forma de cada alumno | | Claves `cafeteria, class, course, firstName, id, lastName, scholarship`: sin `foodType` ni `observations`, y sus textos no aparecen en el cuerpo |
| Curso, clase, comedor y beca | | Juan en «1º Primaria» A; Luis con comedor y beca `false` |
| Parámetros de filtro | `GET /api/students?curso=<id>&clase=<id>&comedor=si&beca=si&pagina=2&q=juan` | `200`; devuelve los 3 alumnos igualmente (los parámetros se ignoran) |
| Cabecera | | `Cache-Control: no-store` |
| Aislamiento | `GET /api/students` del colegio B | `200`; solo Soler |
| Sin sesión | `GET /api/students` sin token | `401` |

## Eventos del log

- Ningún nombre ni apellido de los alumnos, ni el tipo de comida, aparece en el log (se buscaron cinco textos: 0 coincidencias).

## Limpieza

- Datos creados borrados con `cleanup14.sql` (cuatro alumnos, dos cursos y dos colegios `Colegio Curl%`); recuentos de la base de datos **idénticos** a la línea base (todo a 0 salvo `municipalities`, 542).
- Backend parado (`taskkill` del árbol de procesos) y puerto 3000 libre.

## Resultado

- Estado del paso 7: PASA
- Problemas bloqueantes: ninguno
