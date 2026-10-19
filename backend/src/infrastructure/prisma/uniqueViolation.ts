/** Índice único del email de `users`, según lo nombra PostgreSQL. */
export const EMAIL_UNIQUE_INDEX = 'users_email_key';

/** Índice único parcial de `access_links`: un solo restablecimiento abierto por usuario. */
export const PENDING_RESET_UNIQUE_INDEX = 'access_links_pending_reset_user_key';

/**
 * Nombre del índice único violado, si el error es una violación de unicidad de Prisma (P2002).
 * Con el adaptador de PostgreSQL el índice llega en `meta.driverAdapterError.cause.constraint`,
 * no en `meta.target`.
 */
export function violatedUniqueIndex(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') {
    return undefined;
  }
  const meta = 'meta' in error ? (error.meta as Record<string, unknown> | undefined) : undefined;
  const adapterError = meta?.driverAdapterError as { cause?: { constraint?: { index?: unknown } } };
  const index = adapterError?.cause?.constraint?.index;
  return typeof index === 'string' ? index : undefined;
}
