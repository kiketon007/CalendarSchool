/**
 * Horas máximas que se conserva un intento en `rate_limit_attempts`: su clave contiene la IP del
 * cliente. Debe ser mayor que la ventana de cualquier política del limitador, para que la purga
 * nunca borre un intento que todavía cuenta. El mismo plazo está en
 * `infrastructure/supabase/purge-rate-limit-attempts.sql` y en la política de privacidad.
 */
export const ATTEMPT_RETENTION_HOURS = 24;
