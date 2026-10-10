import { createContext } from 'react';
import type { CaptchaClient } from './captchaClient';

/**
 * Permite sustituir el cliente de captcha, que normalmente sale de la configuración del build. Los
 * tests de las páginas lo usan para controlar los tokens y el reto sin tocar `window`.
 */
export const CaptchaClientContext = createContext<CaptchaClient | undefined>(undefined);
