/**
 * Minutos de espera que se muestran al usuario ante un `429`: los segundos de `Retry-After`
 * redondeados hacia arriba y nunca menos de 1, porque «dentro de 0 minutos» invitaría a reintentar ya.
 */
export function retryAfterMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
