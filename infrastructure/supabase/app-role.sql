-- Rol de aplicación de CalendarSchool en Supabase (design.md D10). Se ejecuta con psql como
-- `postgres`, por el pooler en modo sesión (:5432), DESPUÉS de aplicar las migraciones:
--
--   psql "$MIGRATION_DATABASE_URL" -v app_password="$APP_PASSWORD" -f infrastructure/supabase/app-role.sql
--
-- Es idempotente: se puede repetir (p. ej. para cambiar la contraseña, o tras una migración
-- que cree tablas). `app_password` llega por variable de psql para que la contraseña no se
-- versione; no se imprime porque `\gexec` ejecuta sin mostrar las sentencias.
--
-- El rol puede leer y escribir los datos, pero no cambiar el esquema: si alguien llega a la
-- Lambda, no puede borrar tablas ni tocar el historial de migraciones.

\set ON_ERROR_STOP on

-- 1. El rol. CREATE ROLE no admite IF NOT EXISTS: se crea solo si falta.
SELECT format('CREATE ROLE calendarschool_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'calendarschool_app')
\gexec

ALTER ROLE calendarschool_app WITH LOGIN PASSWORD :'app_password';

-- Por debajo de los 10 s de límite de cada petición. El ajuste del rol llega también por el
-- pooler en modo transacción, porque las conexiones del servidor se abren por rol.
ALTER ROLE calendarschool_app SET statement_timeout = '9s';

-- 2. Acceso a la base y al esquema, sin CREATE.
SELECT format('GRANT CONNECT ON DATABASE %I TO calendarschool_app', current_database())
\gexec
GRANT USAGE ON SCHEMA public TO calendarschool_app;
REVOKE CREATE ON SCHEMA public FROM calendarschool_app;

-- 3. Datos: lectura y escritura de las tablas existentes y de las que cree `postgres` después
--    (las migraciones de Prisma se ejecutan con ese rol).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO calendarschool_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO calendarschool_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO calendarschool_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO calendarschool_app;

-- 4. El historial de migraciones es solo de quien migra. Si la tabla aún no existe, se
--    vuelve a ejecutar este script después de la primera migración.
SELECT 'REVOKE ALL ON TABLE public._prisma_migrations FROM calendarschool_app'
WHERE to_regclass('public._prisma_migrations') IS NOT NULL
\gexec

-- 5. Defensa en profundidad: los roles de la Data API de Supabase (anon y authenticated) no
--    deben tener nada en `public`, aunque la Data API esté desactivada. Solo se tocan si existen
--    (en un PostgreSQL local no están).
SELECT format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name)
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = role_name)
\gexec
SELECT format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name)
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = role_name)
\gexec
SELECT format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name)
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = role_name)
\gexec
SELECT format('REVOKE USAGE ON SCHEMA public FROM %I', role_name)
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = role_name)
\gexec
-- Los privilegios por defecto que Supabase concede a esos roles sobre lo que cree `postgres`.
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON %s FROM %I', object_type, role_name)
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
CROSS JOIN (VALUES ('TABLES'), ('SEQUENCES'), ('FUNCTIONS')) AS objects(object_type)
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = role_name)
\gexec
