/** Acción con la que se obtienen los tokens v3 del registro: el backend la comprueba. */
export const REGISTER_ACTION = 'register';

/**
 * No se ha podido obtener el captcha: el script de Google no carga (red, bloqueador de anuncios) o
 * no responde a tiempo. El formulario lo trata como indisponibilidad, sin llamar al backend.
 */
export class CaptchaUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('No se ha podido cargar reCAPTCHA', { cause });
    this.name = 'CaptchaUnavailableError';
  }
}

/** Control del reto v2 pintado en pantalla. */
export interface CaptchaChallenge {
  /** Vuelve a dejar el reto sin resolver (p. ej. tras un fallo de verificación). */
  reset(): void;
  /** Quita el reto de la pantalla. */
  remove(): void;
}

/**
 * Cliente de captcha del navegador: el real habla con Google y el falso, que se usa sin claves de
 * sitio, devuelve tokens fijos y pinta un reto simulado.
 */
export interface CaptchaClient {
  /**
   * Obtiene un token v3 nuevo para la acción. Cada token sirve una sola vez y caduca a los 2
   * minutos, así que se pide uno en cada envío.
   *
   * @throws CaptchaUnavailableError si el script no carga o no responde a tiempo
   */
  executeV3(action: string): Promise<string>;

  /**
   * Pinta el reto v2 en el contenedor. `onToken` recibe el token al resolverlo y `undefined`
   * cuando caduca.
   *
   * @throws CaptchaUnavailableError si el script no carga o no responde a tiempo
   */
  renderV2(
    container: HTMLElement,
    onToken: (token: string | undefined) => void,
  ): Promise<CaptchaChallenge>;
}
