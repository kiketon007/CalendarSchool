import { InvokeCommand, LambdaClient, type InvokeCommandOutput } from '@aws-sdk/client-lambda';
import type { OrToolsRequest, OrToolsTransport } from '../../domain/schedule/orToolsTransport.js';
import { ORTOOLS_LIMIT_MS } from '../../domain/schedule/orToolsSolver.js';

/** Lo único que se usa del cliente de Lambda: así los tests inyectan un doble sin AWS. */
export interface LambdaInvoker {
  send(
    command: InvokeCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<InvokeCommandOutput>;
}

/** Margen sobre el límite de CP-SAT para el arranque en frío de la imagen y la red. */
const COLD_START_MARGIN_MS = 30_000;

/** La invocación de la Lambda de OR-Tools falló. El mensaje no lleva lo que devolvió la función. */
export class OrToolsInvokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrToolsInvokeError';
  }
}

/**
 * El cliente de Lambda para el motor de OR-Tools: **sin reintentos** (`maxAttempts: 1`), porque un reintento volvería
 * a ejecutar CP-SAT, y con un tiempo de petición que cubre los 60 s de CP-SAT más el arranque en frío de la imagen.
 */
export function createOrToolsLambdaClient(region?: string): LambdaClient {
  return new LambdaClient({
    ...(region === undefined ? {} : { region }),
    maxAttempts: 1,
    requestHandler: { requestTimeout: ORTOOLS_LIMIT_MS + COLD_START_MARGIN_MS },
  });
}

/**
 * Lanza el motor de OR-Tools en su Lambda de Python (AWS): una invocación síncrona (`RequestResponse`) con la
 * petición como cuerpo y el JSON de la respuesta como resultado. Rechaza con {@link OrToolsInvokeError} si la función
 * falla (`FunctionError`), Lambda no contesta con un 200 o la respuesta no es JSON; `OrToolsSolver` lo trata entonces
 * como un fallo de OR-Tools y usa el motor actual. Una Lambda en curso no se puede cancelar: al abortar la señal se
 * deja de esperar y la función termina sola por el límite de CP-SAT, con su resultado descartado.
 */
export class LambdaOrToolsTransport implements OrToolsTransport {
  constructor(
    private readonly client: LambdaInvoker,
    private readonly functionName: string,
  ) {}

  async solve(request: OrToolsRequest, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) {
      throw new DOMException('Se abortó antes de invocar el motor', 'AbortError');
    }
    const response = await this.client.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(request)),
      }),
      { abortSignal: signal },
    );
    if (response.FunctionError !== undefined) {
      throw new OrToolsInvokeError(`La Lambda de OR-Tools falló (${response.FunctionError})`);
    }
    if (response.StatusCode !== 200) {
      throw new OrToolsInvokeError(
        `La Lambda de OR-Tools respondió con el estado ${String(response.StatusCode)}`,
      );
    }
    try {
      return JSON.parse(Buffer.from(response.Payload ?? []).toString('utf8')) as unknown;
    } catch {
      throw new OrToolsInvokeError('La Lambda de OR-Tools no devolvió un JSON válido');
    }
  }
}
