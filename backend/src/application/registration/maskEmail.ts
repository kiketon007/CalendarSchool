/**
 * Enmascara un email para los logs (RGPD): primer carácter, `***` y dominio, p. ej.
 * `j***@example.com`. Devuelve `***` si no tiene forma de email y `undefined` si no es texto.
 */
export function maskEmail(email: unknown): string | undefined {
  if (typeof email !== 'string') {
    return undefined;
  }
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at < 1) {
    return '***';
  }
  return `${trimmed.charAt(0)}***${trimmed.slice(at)}`;
}
