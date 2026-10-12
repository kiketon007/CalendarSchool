// Smoke test del despliegue (design.md D11): comprueba, contra el entorno real, que la
// aplicación está viva y que las dos puertas que cerramos siguen cerradas. Lo ejecuta
// `deploy.yml` al terminar:
//
//   node scripts/smoke.mjs https://app.calendarschools.es https://<id>.execute-api.<región>.amazonaws.com
//
// Reintenta durante 2 minutos, porque justo después de desplegar CloudFront puede tardar en
// propagar los cambios y la Lambda en arrancar en frío. No necesita ningún secreto.
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const RETRY_INTERVAL_MS = 5000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resume una respuesta para el mensaje de error: estado y, si lo hay, `error.code`. */
async function describe(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return `${response.status} ${body?.error?.code ?? ''}`.trim();
  } catch {
    return `${response.status}`;
  }
}

/**
 * Cada comprobación devuelve `undefined` si pasa, o una cadena que explica qué recibió si no.
 * Una petición que falla (DNS aún sin propagar, TLS...) cuenta como no superada y se reintenta.
 */
function buildChecks({ baseUrl, apiUrl, fetch }) {
  const checks = [
    {
      label: 'GET / (página de la aplicación)',
      run: async () => {
        const response = await fetch(`${baseUrl}/`);
        const type = response.headers.get('content-type') ?? '';
        if (response.status === 200 && type.includes('text/html')) return undefined;
        return `esperaba 200 con HTML; recibió ${response.status} ${type}`.trim();
      },
    },
    {
      label: 'GET /api/health',
      run: async () => {
        const response = await fetch(`${baseUrl}/api/health`);
        const text = await response.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
        if (response.status === 200 && body?.data?.database === 'up') return undefined;
        return `esperaba 200 con database "up"; recibió ${response.status} ${
          body?.error?.code ?? body?.data?.database ?? ''
        }`.trim();
      },
    },
    {
      // El registro está cerrado en CloudFront hasta `publicacion-registro`.
      label: 'POST /api/auth/register (registro cerrado)',
      run: async () => {
        const response = await fetch(`${baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        const received = await describe(response);
        return received === '404 NOT_FOUND'
          ? undefined
          : `esperaba 404 NOT_FOUND; recibió ${received}`;
      },
    },
  ];

  if (apiUrl !== undefined) {
    checks.push({
      // La URL directa de API Gateway solo debe atender a CloudFront (X-Origin-Verify).
      label: 'GET <execute-api>/api/health (sin X-Origin-Verify)',
      run: async () => {
        const response = await fetch(`${apiUrl}/api/health`);
        const received = await describe(response);
        return received === '403 ORIGIN_NOT_ALLOWED'
          ? undefined
          : `esperaba 403 ORIGIN_NOT_ALLOWED; recibió ${received}`;
      },
    });
  }
  return checks;
}

/** Reintenta una comprobación hasta que pasa o se agota el tiempo; devuelve su último fallo. */
async function runCheck(check, { now, sleep, deadline, log }) {
  let failure;
  for (;;) {
    try {
      failure = await check.run();
    } catch (error) {
      failure = `la petición falló: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (failure === undefined) {
      log(`OK    ${check.label}`);
      return undefined;
    }
    if (now() >= deadline) {
      log(`FALLO ${check.label}: ${failure}`);
      return `${check.label}: ${failure}`;
    }
    log(`...   ${check.label}: ${failure}; se reintenta`);
    await sleep(RETRY_INTERVAL_MS);
  }
}

/**
 * Ejecuta todas las comprobaciones a la vez con un único plazo. Lanza un error que lista las
 * que no han pasado.
 */
export async function runSmoke({
  baseUrl,
  apiUrl,
  fetch: fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = wait,
  log = console.log,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const deadline = now() + timeoutMs;
  const checks = buildChecks({ baseUrl, apiUrl, fetch: fetchImpl });

  const results = await Promise.all(
    checks.map((check) => runCheck(check, { now, sleep, deadline, log })),
  );

  const failures = results.filter((result) => result !== undefined);
  if (failures.length > 0) {
    throw new Error(`El smoke test ha fallado:\n- ${failures.join('\n- ')}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [baseUrl = process.env.SMOKE_BASE_URL, apiUrl = process.env.SMOKE_API_URL] =
    process.argv.slice(2);
  if (!baseUrl) {
    console.error(
      'Uso: node scripts/smoke.mjs <url de la aplicación> [url directa de execute-api]',
    );
    process.exit(2);
  }
  runSmoke({ baseUrl: baseUrl.replace(/\/$/, ''), apiUrl: apiUrl?.replace(/\/$/, '') }).catch(
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
