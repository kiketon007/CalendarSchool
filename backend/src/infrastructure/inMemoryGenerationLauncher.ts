import type { GenerationLauncher } from '../domain/schedule/generationLauncher.js';

/**
 * Lanza una generación en el mismo proceso, sin bloquear la respuesta (desarrollo local, tests y E2E: sin la Lambda del
 * worker). `launch` devuelve enseguida y la ejecución arranca en el siguiente turno del bucle de eventos.
 *
 * Recibe el caso de uso **por referencia tardía** (una función que lo devuelve): el lanzador se construye antes que el
 * caso de uso que lo necesita (`StartGeneration`) y el que ejecuta (`RunGeneration`) se compone después, así que se
 * resuelve al lanzar y no hay dependencia circular.
 */
export class InMemoryGenerationLauncher implements GenerationLauncher {
  constructor(
    private readonly runner: () => (generationId: string) => Promise<void>,
    private readonly logger: { error(context: Record<string, unknown>, message: string): void },
  ) {}

  launch(generationId: string): Promise<void> {
    setImmediate(() => {
      this.runner()(generationId).catch((error: unknown) => {
        // La generación ya quedó en la base; un fallo aquí lo recogerá la detección de atascadas.
        this.logger.error(
          { generation_id: generationId, err: error },
          'Falló la ejecución en memoria de la generación de horarios',
        );
      });
    });
    return Promise.resolve();
  }
}
