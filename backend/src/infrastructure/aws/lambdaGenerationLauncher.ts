import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import type { GenerationLauncher } from '../../domain/schedule/generationLauncher.js';

/** Lo único que se usa del cliente de Lambda: así los tests inyectan un doble sin AWS. */
export type LambdaInvoker = Pick<LambdaClient, 'send'>;

/**
 * Lanza una generación invocando de forma asíncrona la Lambda del worker (`InvocationType: 'Event'`): Lambda acepta el
 * evento con un `202` y la ejecución sigue sin que nadie la espere. Solo viaja el id de la generación; el worker lee
 * todo lo demás de la base de datos. Rechaza si la invocación falla o Lambda no acepta el evento.
 */
export class LambdaGenerationLauncher implements GenerationLauncher {
  constructor(
    private readonly client: LambdaInvoker,
    private readonly functionName: string,
  ) {}

  async launch(generationId: string): Promise<void> {
    const response = await this.client.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ generationId })),
      }),
    );
    if (response.StatusCode !== 202) {
      throw new Error(
        `Lambda no aceptó el evento de la generación (estado ${response.StatusCode})`,
      );
    }
  }
}
