/** Datos de la petición HTTP que los casos de uso registran en los eventos y en la auditoría. */
export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
}
