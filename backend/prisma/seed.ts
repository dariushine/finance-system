import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./finance.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // Categorías de sistema (siempre presentes)
  const systemCategories = [
    { name: "fee", type: "expense", color: "#e67e22" },
    { name: "exchange_out", type: "expense", color: "#9c27b0" },
    { name: "exchange_in", type: "income", color: "#673ab7" },
  ];
  for (const c of systemCategories) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
  }

  // Zona horaria por defecto
  await prisma.setting.upsert({
    where: { key: "user_timezone" },
    update: {},
    create: { key: "user_timezone", value: "America/Caracas" },
  });

  console.log("✅ Seed completado (categorías de sistema + timezone).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
