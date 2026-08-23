import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { execSync } from "child_process";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { AppModule } from "../src/app.module";
import cookieParser from "cookie-parser";

// Tests e2e: usa una BD sqlite temporal para no tocar datos de dev.
// Definir DATABASE_URL antes de importar AppModule (Prisma la lee al construir).
const TEST_DB_NAME = `test-finance-${Date.now()}.db`;
const TEST_DB = `file:./${TEST_DB_NAME}`;
process.env.DATABASE_URL = TEST_DB;
process.env.AUTH_USERNAME = "";
process.env.AUTH_PASSWORD = "";

describe("Finance API (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Crear tablas de la BD temporal antes de levantar la app.
    execSync("npx prisma db push --accept-data-loss", {
      env: { ...process.env, DATABASE_URL: TEST_DB },
      stdio: "ignore",
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    // Plantear una wallet de prueba
    const adapter = new PrismaBetterSqlite3({ url: TEST_DB });
    const prisma = new PrismaClient({ adapter });
    // Tablas (migración de prueba); create puede fallar si ya existe → ignora.
    for (const w of [
      { name: "TestA", type: "bank", currency: "USD", balance: 10000000 },
      { name: "TestB", type: "bank", currency: "USD", balance: 5000000 },
    ]) {
      await prisma.wallet.create({ data: w }).catch(() => {});
    }
    // Categoría de sistema + una normal
    await prisma.category
      .create({ data: { name: "fee", type: "expense" } })
      .catch(() => {});
    await prisma.category
      .create({ data: { name: "food", type: "expense" } })
      .catch(() => {});
    // Categorías de sistema para exchanges
    await prisma.category
      .create({ data: { name: "exchange_out", type: "expense" } })
      .catch(() => {});
    await prisma.category
      .create({ data: { name: "exchange_in", type: "income" } })
      .catch(() => {});
    await prisma.$disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("health", () => {
    it("GET /api/health → 200 healthy", async () => {
      const res = await request(app.getHttpServer()).get("/api/health").expect(200);
      expect(res.body.status).toBe("healthy");
    });
  });

  describe("wallets", () => {
    it("GET /api/wallets → lista con balances en unidades", async () => {
      const res = await request(app.getHttpServer()).get("/api/wallets").expect(200);
      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);
      // balance está en unidades (USD), no centavos → entero pequeño
      expect(typeof data[0].balance).toBe("number");
    });

    it("crea wallet inválida (sin currency) → 400", async () => {
      await request(app.getHttpServer())
        .post("/api/wallets")
        .send({ name: "X" })
        .expect(400);
    });
  });

  describe("transactions", () => {
    it("crea transacción con fee inline → padre + comisión hija", async () => {
      const date = new Date().toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .post("/api/transactions")
        .send({
          walletId: 1,
          categoryName: "food",
          type: "expense",
          amount: 10.5,
          fee: 1.5,
          description: "test fee",
          date,
          time: "13:37",
          tz: "America/Caracas",
        })
        .expect(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.feeTransactionId).toBeDefined();
      expect(res.body.fee).toBe(1.5);
    });

    it("transacción inválida (monto negativo/sin fecha) → 400", async () => {
      await request(app.getHttpServer())
        .post("/api/transactions")
        .send({ walletId: 1, categoryName: "food", type: "expense", amount: -5 })
        .expect(400);
    });

    it("lista transacciones → paginado", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/transactions?page=1&limit=5")
        .expect(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("exchanges", () => {
    it("crea exchange con fee+creditFee → débito/crédito consistentes", async () => {
      const date = new Date().toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .post("/api/exchanges")
        .send({
          fromWalletId: 1,
          toWalletId: 2,
          fromAmount: 10,
          toAmount: 8,
          fee: 1,
          creditFee: 0.5,
          description: "test ex",
          date,
          time: "13:42",
          tz: "America/Caracas",
        })
        .expect(201);
      expect(res.body.exchange.id).toBeDefined();
      expect(res.body.transactions.debit.id).toBeDefined();
      expect(res.body.transactions.credit.id).toBeDefined();
    });

    it("exchange con wallets iguales → 400", async () => {
      const date = new Date().toISOString().slice(0, 10);
      await request(app.getHttpServer())
        .post("/api/exchanges")
        .send({
          fromWalletId: 1,
          toWalletId: 1,
          fromAmount: 10,
          toAmount: 9,
          date,
          time: "13:42",
          tz: "America/Caracas",
        })
        .expect(400);
    });
  });
});
