/** Directivas de la CSP: nombre de la directiva y sus fuentes, en el orden en que se escriben. */
export type ContentSecurityPolicy = Readonly<Record<string, readonly string[]>>;

/**
 * Convierte la política de `frontend/content-security-policy.json` en el valor de la cabecera
 * `Content-Security-Policy`. Es una función pura y sin dependencias para que la usen tanto
 * `vite.config.ts` (`vite preview`) como la infraestructura de CDK (CloudFront): las dos sirven
 * la misma cabecera. El orden de las directivas es el del JSON.
 */
export function serializeContentSecurityPolicy(policy: ContentSecurityPolicy): string {
  return Object.entries(policy)
    .map(([directive, sources]) => [directive, ...sources].join(' '))
    .join('; ');
}
