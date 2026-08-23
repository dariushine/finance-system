import { defineConfig } from "prisma/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Prisma 7: la conexión se define aquí con el driver adapter.
// Para migrar a Postgres: cambiar provider en schema.prisma y usar
// @prisma/adapter-pg (o libsql) en lugar del adapter de sqlite.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL || "file:./finance.db",
  },
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./finance.db",
  }),
});
