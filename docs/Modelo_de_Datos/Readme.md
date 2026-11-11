# Modelo de datos de CalendarSchool

Documentación del modelo de datos del producto. La **fuente de verdad** es `backend/prisma/schema.prisma` y sus migraciones; esta carpeta lo describe y se actualiza con cada historia que toque el esquema.

| Fichero | Contenido | Estado |
|---|---|---|
| [`MODELO_DATOS.md`](./MODELO_DATOS.md) | Diccionario de datos: las 21 tablas con columnas, índices, claves ajenas, restricciones escritas a mano, reglas de borrado y qué cambió respecto a la v2.1 | Vigente (v3.0) |
| [`MODELO_DATOS_DIAGRAMA.md`](./MODELO_DATOS_DIAGRAMA.md) | Diagrama entidad-relación (Mermaid), módulos, flujos de datos, índices clave y reglas del motor | Vigente (v3.0) |

## Resumen

- **PostgreSQL 17** (la misma versión mayor en local, en CI y en Supabase) con **Prisma**; las migraciones están en `backend/prisma/migrations/`.
- **21 tablas** en 6 módulos: colegios, usuarios y autenticación; cursos, clases y alumnos; profesores; calendarios; asignaturas y reglas de reparto; y horarios generados.
- Identificadores **UUIDv7** generados por la aplicación, fechas `TIMESTAMPTZ`, horas en minutos desde las 00:00 y aislamiento por colegio (`school_id`) en todos los datos del colegio.
- Borrado real, sin papelera; las dependencias se resuelven con `ON DELETE CASCADE` o `SET NULL`.
- Los `CHECK` y los índices únicos parciales que Prisma no modela están escritos a mano en los `migration.sql`; el listado completo está en `MODELO_DATOS.md`.

## Cómo trabajar con el esquema

Los comandos están en el `CLAUDE.md` de la raíz y en el `README.md` (§1.4). Los dos que se usan con el modelo:

```bash
npm run db:migrate                                          # aplica las migraciones a la base de desarrollo
npm exec -w backend -- prisma migrate dev --name <nombre>   # crea una migración: revisa el SQL antes de aplicarla
```

Para añadir o cambiar una tabla, sigue los pasos de la sección «Cómo actualizar este documento» de `MODELO_DATOS.md`.
