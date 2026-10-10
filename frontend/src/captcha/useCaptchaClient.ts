import { useContext } from 'react';
import type { CaptchaClient } from './captchaClient';
import { captchaConfig } from './captchaConfig';
import { CaptchaClientContext } from './captchaClientContext';
import { createCaptchaClient } from './createCaptchaClient';

/** Cliente del build: se crea una sola vez, para que el script de Google se cargue una sola vez. */
let buildClient: CaptchaClient | undefined;

/** Cliente de captcha del formulario: el del contexto si hay uno, y si no, el de la configuración del build. */
export function useCaptchaClient(): CaptchaClient {
  const provided = useContext(CaptchaClientContext);
  buildClient ??= createCaptchaClient(captchaConfig);
  return provided ?? buildClient;
}
