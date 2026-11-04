/**
 * Puerto que lanza la ejecución de una generación sin esperarla (US-ALGO-RUN): en AWS, una invocación asíncrona de la
 * Lambda del worker; en local y en los tests, la ejecución en el mismo proceso. Devuelve cuando la petición de
 * lanzamiento está hecha, no cuando termina la generación; si no se puede lanzar, rechaza.
 */
export interface GenerationLauncher {
  launch(generationId: string): Promise<void>;
}
