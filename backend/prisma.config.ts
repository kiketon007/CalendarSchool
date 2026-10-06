// Configuración de la CLI de Prisma.
// Prisma 7 ya no carga `.env` por sí mismo: se carga aquí con dotenv, que no sobrescribe
// variables ya definidas en el entorno (los tests y el E2E pasan su propia DATABASE_URL).
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Se lee process.env y no el helper env(): env() lanza un error si la variable falta y
    // haría fallar `prisma generate` en un clon limpio o en CI, donde no hay `.env`.
    url: process.env.DATABASE_URL,
  },
});
