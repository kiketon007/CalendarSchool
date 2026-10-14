-- Purga de intentos del limitador: la clave de cada intento contiene la IP del cliente, así que no
-- se conserva más de 24 horas (ATTEMPT_RETENTION_HOURS en backend/src/application/attempts). Lo
-- ejecuta a diario .github/workflows/backup.yml, antes del volcado, para que las copias tampoco
-- contengan intentos más antiguos. 24 horas es mayor que la ventana de cualquier política, así que
-- nunca borra un intento que todavía cuenta.
DELETE FROM rate_limit_attempts WHERE attempted_at < now() - interval '24 hours';
