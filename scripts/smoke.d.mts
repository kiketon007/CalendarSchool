export interface SmokeOptions {
  /** Origen público de la aplicación, sin barra final: `https://app.calendarschools.es`. */
  baseUrl: string;
  /** URL directa de `execute-api` (salida `ApiUrl` del stack); si falta, no se comprueba. */
  apiUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
  log?: (message: string) => void;
  /** Tiempo máximo de reintentos de cada comprobación; por defecto, 2 minutos. */
  timeoutMs?: number;
}

export declare function runSmoke(options: SmokeOptions): Promise<void>;
