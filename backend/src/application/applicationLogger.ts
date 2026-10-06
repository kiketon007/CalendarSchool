/**
 * Puerto de log de la capa de aplicación. Los casos de uso registran a través de él para no
 * depender de la infraestructura (pino). El logger de infraestructura lo satisface sin adaptador.
 */
export interface ApplicationLogger {
  warn(context: Record<string, unknown>, message: string): void;
}
