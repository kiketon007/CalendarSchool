## Context

`POST /api/auth/register` sigue el orden de US01: captcha → validación → email → colegio → alta, más la sesión de US01_c. Falta el paso 1, el límite de intentos. `registerSchool.ts` ya lo anticipa como «un middleware previo que añade US01_d», y el contrato ya define `429 TOO_MANY_REQUESTS` con `Retry-After` desde US01_a (`components.responses.TooManyRequests`). `TOO_MANY_REQUESTS` ya está en `ERROR_CODES`, pero nada lo lanza todavía.

Restricciones del entorno:

- **Producción** (`despliegue-aws`, aún no implementado): CloudFront → API Gateway → AWS Lambda, con varias instancias simultáneas. Un contador en memoria no se comparte entre ellas.
- **IP del cliente:** detrás de CloudFront y API Gateway, Express ve la IP del último proxy; la del cliente llega en `X-Forwarded-For`, que el cliente también puede escribir. Hoy `createApp` no configura `trust proxy`, así que `req.ip` es la dirección del socket.
- **Local y E2E:** el proxy de Vite no añade `X-Forwarded-For`, así que todas las peticiones llegan desde `::1`. Con un máximo de 5, el propio E2E (más de 16 altas por ejecución) y quien pruebe el registro en `npm run dev` se bloquearían.
- **Reutilización:** el login (US02 CA6: 5 intentos fallidos en 15 minutos) y la aceptación de invitaciones (US02_b, US02_c) piden «el mismo mecanismo que US01_d».

Historia de referencia: US01_d (CA9) de `docs/User_Stories_MVP.md`.

## Goals / Non-Goals

**Goals:**

- Como máximo 5 intentos de registro por IP en cualquier ventana de 15 minutos, compartido entre instancias y sin carreras que lo superen.
- `429` con `Retry-After` exacto, antes del captcha, la validación y cualquier consulta de usuarios o colegios.
- Un limitador reutilizable por US02, US02_b y US02_c sin rediseñarlo.
- IP real del cliente configurable para producción, sin poder falsearse.
- Aviso claro en el formulario.

**Non-Goals:**

- Límite por «fingerprint», límite del login y de las invitaciones, cabecera secreta entre CloudFront y API Gateway, reglas de AWS WAF y limpieza programada (ver «Fuera de alcance» de la propuesta).

## Decisions

### D1. Contador en PostgreSQL con ventana deslizante

Tabla `rate_limit_attempts`:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (PK) | UUIDv7 de la aplicación, como el resto del modelo |
| `key` | VARCHAR(200) | `<operación>:<ip>`, p. ej. `register:203.0.113.7` |
| `attemptedAt` | TIMESTAMPTZ | instante del intento según el reloj de la aplicación |

Índice compuesto `(key, attempted_at)`: tanto el recuento como el borrado filtran por clave y por instante.

La ventana es deslizante: un intento cuenta durante los 15 minutos siguientes, que es lo que dice CA9 («en los últimos 15 minutos»).

Alternativas descartadas:

- *Memoria del proceso:* cada instancia de Lambda contaría por separado; el límite real sería 5 × instancias.
- *Throttling de API Gateway:* limita por ruta o etapa, no por IP.
- *Reglas de tasa de AWS WAF:* sus ventanas son de 1 a 10 minutos y el mínimo es de 10 peticiones, así que no expresa «5 en 15 minutos»; además depende de un despliegue que aún no existe. Puede añadirse después como protección extra.
- *Ventana fija por intervalos (un contador por cuarto de hora):* más barata, pero permite 10 intentos seguidos en el cambio de intervalo.

### D2. Serialización por clave con un bloqueo de PostgreSQL

`PrismaAttemptRepository.register(key, now, window, max)` ejecuta en una transacción:

1. `SELECT pg_advisory_xact_lock(hashtextextended(key, 0))`: las peticiones de la misma clave esperan su turno; las de otras claves no se bloquean (una colisión del hash solo haría esperar a otra clave, nunca contar mal). El bloqueo se libera al terminar la transacción. Se ejecuta con `$executeRaw`, porque la función devuelve `void` y el adaptador de Prisma no deserializa ese tipo en `$queryRaw`.
2. Borra los intentos de esa clave anteriores a `now - window` (la tabla no crece sin límite para las claves activas).
3. Cuenta los intentos de la ventana y obtiene el más antiguo.
4. Si hay menos de `max`, inserta el intento y lo acepta. Si no, lo rechaza **sin insertarlo** y devuelve el instante en que el más antiguo sale de la ventana.

Alternativas descartadas:

- *Insertar primero y contar después:* dos peticiones simultáneas se rechazarían las dos (falla del lado seguro), pero el intento rechazado quedaría contado, y se decidió que un `429` no cuente.
- *Contar primero sin bloqueo:* dos peticiones simultáneas podrían contar 4 y pasar las dos.

Consecuencia: el repositorio expresa la regla completa dentro de la transacción. Es aceptable porque la atomicidad solo puede garantizarla la base de datos.

### D3. Un intento rechazado no cuenta

Si el `429` contara, quien reintenta durante el bloqueo lo alargaría indefinidamente, incluido el usuario legítimo que pulsa varias veces. Sin contarlo, el bloqueo dura como máximo 15 minutos desde el quinto intento y `Retry-After` se cumple. Al atacante no le da ventaja: sigue limitado a 5 cada 15 minutos.

`Retry-After` = segundos que faltan para que el intento más antiguo de la ventana cumpla 15 minutos, redondeado hacia arriba y como mínimo 1.

### D4. Capas y piezas nuevas

```
domain/attempts/
  attemptRepository.ts      # puerto: register(key, now, windowMs, max) → { accepted } | { accepted: false, retryAt }
  tooManyAttempts.ts        # error con retryAfterSeconds
application/attempts/
  attemptLimiter.ts         # AttemptLimiter.consume(key): aplica la política (máximo y ventana) y lanza TooManyAttempts
application/registration/
  limitRegistrationAttempts.ts  # caso de uso: clave register:<ip>, evento USER_REGISTER_RATE_LIMITED
infrastructure/prisma/
  prismaAttemptRepository.ts
presentation/auth/
  authRouter.ts             # middleware del límite antes del handler de /register
presentation/http/
  errorHandler.ts           # TooManyAttempts → 429 TOO_MANY_REQUESTS + Retry-After
```

`AttemptLimiter` es genérico: recibe la política (`maxAttempts`, `windowMs`) y la clave, y no sabe de registros. `LimitRegistrationAttempts` construye la clave y registra el evento, como hacen los demás casos de uso del registro; US02 creará su `LimitLoginAttempts` sobre el mismo limitador. `server.ts` cablea un `AttemptLimiter` por operación con su política, y `createApp` recibe el caso de uso ya construido.

### D5. IP real con `TRUST_PROXY_HOPS`

`createApp` aplica `app.set('trust proxy', trustProxyHops)`. Con `N > 0`, Express toma la IP que está N saltos desde la derecha de `X-Forwarded-For` e ignora lo que el cliente haya escrito antes; con `0` usa la del socket. Es la opción estándar de Express y no hay que analizar la cabecera a mano.

- `TRUST_PROXY_HOPS`: entero ≥ 0, opcional, por defecto `0`. Lo valida `loadConfig`.
- El valor de producción (CloudFront y API Gateway delante) y la cabecera secreta que impide saltarse CloudFront los decide `despliegue-aws`. Hasta entonces, este cambio deja anotado en la historia que sin esa cabecera alguien podría llamar a API Gateway directamente y elegir su IP.
- Si `req.ip` no está disponible, la clave usa `unknown`: esas peticiones comparten contador, lo que falla del lado seguro.

### D6. Máximo configurable y tests

- `REGISTRATION_ATTEMPTS_MAX`: entero ≥ 1, opcional, por defecto `5`. La ventana (15 minutos) es fija.
- `scripts/e2e.mjs` arranca el backend con un máximo alto (1000): el E2E no prueba el límite real, porque todas sus peticiones vienen de la misma IP.
- El límite real (5) y la concurrencia se prueban en integración con PostgreSQL, donde es determinista y cada test parte de tablas vacías. El aviso del frontend se prueba en el E2E simulando el `429` con `cy.intercept`.

Alternativa descartada: vaciar la tabla de intentos entre specs del E2E. Varias specs hacen más de 5 altas por sí solas.

### D7. Orden respecto al resto de la petición

El middleware va justo antes del handler de `/register`, así que precede al captcha, la validación y las consultas (CA9). `express.json()` sigue ejecutándose antes, de modo que un cuerpo que no es JSON responde `400 INVALID_JSON` (o `413`, `415`) sin contar como intento. Es aceptable: esas respuestas no consultan la base de datos ni revelan nada, y mover el parseo solo para esta ruta complicaría `createApp`.

### D8. Fallo de la base de datos y log

- Si PostgreSQL no responde, el repositorio lanza `DatabaseUnavailable` (`503`) y la petición no sigue: el limitador falla cerrado. El registro no podría completarse de todos modos.
- `USER_REGISTER_RATE_LIMITED` se registra con nivel `warn`, con `ip`, `user_agent` y `retry_after`. No incluye el email: el límite se aplica antes de leer el payload.

### D9. Contrato y frontend

- **Contrato:** solo cambia la descripción del `429` de `POST /api/auth/register` («5 intentos por IP cada 15 minutos»). Por ese cambio de texto se regenera `frontend/src/api/generated/schema.ts`.
- **`registrationService`:** nuevo resultado `{ status: 'tooManyRequests', retryAfterSeconds }`, que lee `Retry-After` (o `undefined` si falta o no es un entero válido).
- **`RegisterPage`:** muestra con `role="alert"` «Has superado el número de intentos de registro. Vuelve a intentarlo dentro de N minutos.» (N = minutos redondeados hacia arriba; sin `Retry-After`, una variante sin número). Conserva los datos salvo la contraseña, como el error inesperado. Textos en `es.json` y `en.json`.

## Risks / Trade-offs

- **[Sin la cabecera secreta de CloudFront, se puede elegir la IP llamando a API Gateway directamente]** → lo cierra `despliegue-aws`; queda anotado en la historia. El registro no se publica en producción hasta entonces (US01_e también lo impide).
- **[Varios usuarios detrás de la misma IP (un colegio con NAT)]** → comparten los 5 intentos. Es improbable que un colegio registre más de 5 cuentas nuevas en 15 minutos, porque el registro crea colegios y no usuarios; los demás usuarios entran por invitación (US02_b).
- **[El bloqueo por clave serializa los intentos de una misma IP]** → solo afecta a quien hace varios intentos a la vez, que es justo lo que se limita; las demás IP no esperan.
- **[La tabla crece con claves que no vuelven]** → cada clave borra sus intentos viejos al usarse; las abandonadas quedan hasta la limpieza programada, fuera de este cambio. Con 5 filas como máximo por IP activa, el volumen es pequeño.
- **[El E2E no ejercita el límite real]** → lo cubren los tests de integración contra PostgreSQL, incluida la concurrencia.
- **[Desarrolladores bloqueados en local]** → `REGISTRATION_ATTEMPTS_MAX` se puede subir en `backend/.env`; queda comentado en `.env.example`.

## Migration Plan

1. Migración Prisma aditiva (`rate_limit_attempts`); no toca datos. Se aplica con `npm run db:migrate`.
2. Las dos variables nuevas son opcionales: el backend arranca igual sin ellas.
3. Reversión: revertir el commit y borrar la tabla con una migración nueva.

## Open Questions

- Ninguna bloqueante. `despliegue-aws` fijará `TRUST_PROXY_HOPS` y la cabecera secreta de CloudFront.
