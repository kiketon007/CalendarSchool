/** Token del enlace del cuerpo: una cadena no vacía, o `undefined` si falta o tiene otra forma. */
export function readAccessLinkToken(body: unknown): string | undefined {
  const token =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).token
      : undefined;
  return typeof token === 'string' && token !== '' ? token : undefined;
}
