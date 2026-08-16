# Sistema de Finanzas Personal

Sistema completo de gestión de finanzas personales con billeteras múltiples (USD/VES/EUR), transacciones por categorías, exchanges entre billeteras, tasas diarias BCV/paralelo y un dashboard web **mobile-first**.

## ✨ Características

- **🏦 Billeteras múltiples**: Banco, Efectivo, Tarjeta, Cripto e Inversión, en USD/VES/EUR, con alias, icono y color. **Soft-delete** (las eliminadas quedan en "Billeteras eliminadas" y se pueden reactivar).
- **💸 Transacciones**: Gastos e ingresos con categorías, comisión opcional (fee aparte del monto) y moneda tomada automáticamente de la billetera.
- **💱 Exchanges**: Cambios entre billeteras con **transacciones separadas** (débito `exchange_out` + crédito `exchange_in` + comisión `fee`), validación de fondos y tasa calculada como `toAmount / fromAmount`.
- **📊 Balance total**: En USD, con conversión de billeteras no-USD usando tasas diarias (BCV o paralelo).
- **📱 Dashboard web**: Next.js 15 + React 19 + Material UI 6, App Router, **mobile-first**.
- **🧩 Tablas responsivas tipo acordeón**: En pantallas < 600px las listas se convierten en tarjetas expandibles; en escritorio se mantienen tablas completas.
- **🗓️ Filtros por período y rango de fechas**: Presets (Hoy, Semana, Mes, 3 meses, Año, Todo) o rango personalizado en el detalle de billetera.
- **🕐 Tasas diarias BCV/paralelo**: CRUD completo + sincronización desde la API de **Dolarapi** (`ve.dolarapi.com`).
- **🐳 Docker Compose**: Despliegue completo con un comando (producción) y override de desarrollo con hot reload.
- **📄 Reportes**: Resumen (ingresos, gastos, neto, billeteras), rendimiento mensual, desglose por categoría, balances por billetera, stats de exchanges y exportación JSON.

## 🏗️ Arquitectura

El frontend se comunica con el backend a través de un **reverse proxy de Next.js**: todas las rutas `/api/*` del frontend se redirigen al backend real (ver `frontend/next.config.js`).

```
Sistema de Finanzas
├── 📦 Backend API (Node.js + Express 5 + SQLite)
│   ├── backend/exchange-server.js   # Servidor real (puerto 3002)
│   ├── backend/data/finance.db      # Base de datos SQLite (bind mount)
│   └── backend/src/                 # Código NestJS (alternativo, no es el servidor de producción)
├── 🌐 Frontend Dashboard (Next.js 15 + React 19 + MUI 6, App Router)
│   ├── frontend/app/                # Páginas: dashboard, wallets, exchanges, rates, reports
│   └── frontend/app/components/     # BalanceCard, WalletList, formularios, acordeones, layout
└── 🐳 Docker Compose
    ├── backend (3002)  ── healthcheck
    └── frontend (3000) ── espera a que backend esté healthy
```

> **Nota sobre NestJS**: en `backend/src/` existe un desarrollo experimental con NestJS + TypeORM (entidades wallets, transactions, etc.), pero **no** es el servidor que corre el sistema. El backend real y desplegado es `backend/exchange-server.js` (Express + `sqlite3`), que es el que usa el Docker Compose.

## 🔌 Endpoints de la API

Lista verificada de endpoints reales del backend (`backend/exchange-server.js`):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del sistema (health, features) |
| GET | `/api/wallets` | Listar billeteras activas |
| GET | `/api/wallets/deleted` | Listar billeteras eliminadas (soft-delete) |
| GET | `/api/wallets/:id` | Obtener billetera por id |
| POST | `/api/wallets` | Crear billetera (name, type, currency requeridos) |
| PUT | `/api/wallets/:id` | Actualizar billetera (nombre, alias, balance, descripción, icono, color) |
| DELETE | `/api/wallets/:id` | Soft-delete (marca `isActive = 0`) |
| PUT | `/api/wallets/:id/reactivate` | Reactivar billetera eliminada |
| GET | `/api/wallets/:id/report?from=&to=&period=` | Reporte de billetera: balance, ingresos/egresos, transacciones con rango de fechas |
| POST | `/api/transactions` | Crear transacción (walletId, categoryName, type, amount, opcional fee) |
| GET | `/api/transactions?page=&limit=` | Listar transacciones (paginadas, con joins de wallet y categoría) |
| GET | `/api/transactions/:id` | Obtener transacción |
| POST | `/api/exchanges` | Crear exchange (fromWalletId, toWalletId, fromAmount, toAmount, opcional fee) |
| GET | `/api/exchanges?page=&limit=` | Listar exchanges (paginados) |
| GET | `/api/balance` | Balance total en USD con desglose por moneda |
| GET | `/api/exchange-rates` | Tasas de cambio centralizadas (USD:1, VES:635, EUR:1.07) |
| GET | `/api/rates/effective?type=bcv\|paralelo&date=` | Tasa vigente para convertir VES→USD en el frontend |
| GET | `/api/daily-rates` | Listar todas las tasas diarias (descendente) |
| GET | `/api/daily-rates/today` | Obtener/crear la tasa de hoy (BD → API → error) |
| POST | `/api/daily-rates` | Crear tasa manual (date, bcv, paralelo) |
| PUT | `/api/daily-rates/:id` | Actualizar tasa |
| DELETE | `/api/daily-rates/:id` | Eliminar tasa |
| GET | `/api/stats?rate=bcv\|paralelo` | Estadísticas: ingresos, gastos, neto, mensual, por categoría |

## 🗃️ Base de datos (SQLite)

El backend crea automáticamente el esquema al arrancar y hace migraciones menores (agregar columnas) sin borrar datos. Tablas:

- **wallets**: id, name, alias, type, currency, balance, description, icon, color, isActive, createdAt.
- **categories**: id, name, type, color, icon, isActive, createdAt. Se siembran 18 categorías (incluye categorías especiales `exchange_out`, `exchange_in` y `fee`).
- **transactions**: id, wallet_id, category_id, type, amount, description, date, exchange_rate, converted_amount, fee, parent_transaction_id, created_at.
- **exchanges**: id, debit_transaction_id, credit_transaction_id, from_wallet_id, to_wallet_id, from_amount, to_amount, rate, fee, description, created_at.
- **daily_rates**: id, date (única), bcv, paralelo, source, created_at.

> 💾 La base vive en `backend/data/finance.db` y se persiste vía bind mount en Docker. Haz **backup** de esa carpeta.

## 📱 Mobile-First Design

- **Responsive completo**: 320px (iPhone SE) → 1920px.
- **Tablas → acordeones < 600px**: En transacciones, exchanges, tasas, reportes, detalle de billetera y últimas transacciones del dashboard, las tablas se convierten en **tarjetas expandibles**; en escritorio se mantienen tablas completas.
- **Bottom navigation móvil**: Aparece en pantallas < 900px (`< md`), con iconos + etiquetas, más un **Fab "+"** flotante que abre un diálogo con pestañas **Transacción / Exchange** (a pantalla completa en móvil).
- **Barra lateral colapsable (escritorio)**: Drawer permanente en desktop que se colapsa a iconos con un botón.
- **Barra superior de tasas colapsable (escritorio)**: AppBar con chips de **BCV** y **Paralelo** del día, colapsable con animación.
- **Touch-friendly**: botones ≥ 48x48px, inputs altos, safe areas.

## 📄 Páginas del frontend (App Router)

| Ruta | Página | Características |
|---|---|---|
| `/` | Dashboard | Card de balance total (telemetría cada 60s), grid de billeteras con paginación, últimas transacciones |
| `/wallets` | Billeteras | Grid de billeteras con equivalente USD (tasa BCV/paralelo), crear billetera, billeteras eliminadas + reactivar |
| `/wallets/[id]` | Detalle de billetera | Saldo, editar/eliminar (soft-delete), reporte con filtros por período y rango de fechas |
| `/transactions` | Transacciones | Historial paginado, crear transacción, tabla/acordeón con fee |
| `/exchanges` | Exchanges | Historial paginado, crear exchange, tabla/acordeón, **exportar CSV** |
| `/rates` | Tasas diarias | CRUD de tasas BCV/paralelo, **sincronizar hoy** desde Dolarapi |
| `/reports` | Reportes | Resumen, rendimiento mensual, por categoría, balances de billeteras, stats de exchanges, **exportar JSON** |

### Formularios globales (Fab "+")

- **Transacción**: tipo (gasto/ingreso), monto, comisión opcional, billetera, categoría, descripción. Reutilizado también en `/transactions`.
- **Exchange**: billetera origen/destino, montos, comisión opcional, descripción; muestra cálculo de tasa y total a descontar.

## 💱 Sistema de Exchanges

1. **Transacciones separadas**: Cada exchange genera transacciones reales:
   - Débito `exchange_out` (expense) en la billetera origen.
   - Crédito `exchange_in` (income) en la billetera destino.
   - Si hay comisión, una transacción `fee` aparte.
2. **Tasa calculada**: `rate = toAmount / fromAmount` (la comisión NO afecta la tasa).
3. **Validación de fondos**: verifica que la billetera origen tenga `fromAmount + fee`, y que origen ≠ destino.
4. **Registro de metadata**: se guarda un registro en la tabla `exchanges` con débito/crédito, montos, tasa y fee.

## 🚀 Despliegue

### Opción 1: Producción (Docker Compose — recomendado)

Levanta los servicios desde imágenes autónomas (build multi-stage con `node:18-alpine`, sin montar el código del host).

```bash
# 1. Clonar
git clone <tu-repo> finance-system && cd finance-system

# 2. Construir y levantar (Compose v2 → usa dos palabras: docker compose)
docker compose up --build -d

# 3. Verificar estado (backend debe estar 'healthy'; el frontend espera a que lo esté)
docker compose ps

# 4. Acceder
#    Dashboard:   http://localhost:3000
#    API (proxy): http://localhost:3000/api
#    API directa: http://localhost:3002/api
```

Detener / limpiar:

```bash
docker compose down            # detiene (conserva la DB en backend/data)
docker compose down -v         # detiene (borra volúmenes anónimos; el bind backend/data queda)
```

### Opción 2: Desarrollo (hot reload — sin rebuildear)

Usa el override `docker-compose.dev.yml` para iterar sin `docker compose build`. **NO** es para producción.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

| Servicio | Cómo corre | Efecto |
|---|---|---|
| `backend` | `node --watch exchange-server.js` + bind `./backend` | recarga la API al editar `backend/` |
| `frontend` | `next dev` + bind `./frontend` | hot reload del dashboard al editar `frontend/` |

> ⚠️ Los `node_modules` y `.next` se conservan **del contenedor** (volúmenes anónimos), no del host — `sqlite3` es nativo y no portable.
> ℹ️ En dev, el rewrite de Next apunta al backend por `API_UPSTREAM=http://backend:3002`.

### Opción 3: Desarrollo local (sin Docker)

```bash
# 1. Backend (terminal 1)
cd backend
npm install
node exchange-server.js        # o: npm run dev (nodemon)

# 2. Frontend (terminal 2)
cd frontend
npm install
npm run dev

# 3. Acceder
#    Backend:  http://localhost:3002/api
#    Frontend: http://localhost:3000
```

> ℹ️ En local, el rewrite de Next apunta a `http://localhost:3002` (default cuando no hay `API_UPSTREAM` y `NODE_ENV=development`).

### Archivos de despliegue

- **`Dockerfile`**: build multi-stage con targets `backend` (Express, `node exchange-server.js`) y `frontend` (Next.js, `npm run build` / `npm start`).
- **`docker-compose.yml`**: producción — servicios `backend` (3002, healthcheck) y `frontend` (3000, depende del healthcheck del backend), red `finance-network`, bind `./backend/data`.
- **`docker-compose.dev.yml`**: override de desarrollo con bind mounts + `node --watch` / `next dev`.
- **`docker/Dockerfile.backend`**: alternativa NestJS (compila `dist/main.js`, puerto 3001) — no es la imagen usada en producción actual.

## 🔧 Variables de entorno

El backend **no necesita `.env`**: usa defaults en `exchange-server.js` (puerto 3002, DB en `backend/data/finance.db`) y crea el esquema al arrancar.

| Variable | Dónde | Descripción |
|---|---|---|
| `NODE_ENV` | Compose (backend/frontend) | `production` en prod, `development` en dev-Docker |
| `PORT` | Compose (backend) | Puerto del backend, `3002` |
| `NEXT_PUBLIC_API_URL` | Compose (frontend) | `http://backend:3002/api` (proxy) |
| `API_UPSTREAM` | Frontend (dev-Docker) | Override del rewrite de Next para apuntar al backend por nombre de red |

## 📁 Estructura del proyecto

```
finance-system/
├── backend/                        # API Backend (Express 5 + SQLite)
│   ├── exchange-server.js          # Servidor principal (puerto 3002)
│   ├── src/                        # Código NestJS experimental (no corre en prod)
│   ├── data/                       # Base de datos SQLite (bind mount en Docker)
│   ├── __tests__/                  # Tests de validación (Jest + supertest)
│   └── package.json
├── frontend/                       # Dashboard Next.js 15 (Mobile-First)
│   ├── app/                        # App Router
│   │   ├── layout.tsx              # Layout global (ThemeProvider, Navegación, Fab)
│   │   ├── page.tsx                # Dashboard
│   │   ├── components/            # BalanceCard, WalletList, formularios, acordeones, Navigation
│   │   ├── lib/api.ts             # Cliente API + tipos
│   │   ├── lib/hooks/             # useWallets
│   │   ├── services/financeApi.ts # Cliente API alternativo
│   │   ├── transactions/          # Transacciones
│   │   ├── wallets/               # Billeteras + detalle /wallets/[id]
│   │   ├── exchanges/             # Exchanges
│   │   ├── rates/                 # Tasas diarias
│   │   └── reports/               # Reportes
│   ├── next.config.js             # Rewrites /api/* → backend
│   └── package.json
├── scripts/                        # seed-db.ts, run-server.sh, start-dev.sh
├── docker/                         # Dockerfile.backend (NestJS alternativo)
├── docker-compose.yml              # Producción
├── docker-compose.dev.yml          # Override de desarrollo
├── Dockerfile                      # Build multi-stage (backend + frontend)
└── README.md                       # Esta documentación
```

## 🚨 Notas importantes

1. **Exchanges son transacciones**: cada exchange genera transacciones reales (débito/crédito/fee) en el historial.
2. **Comisión opcional**: el fee se descuenta aparte del monto y se registra como transacción `fee` separada; la fila de fee solo se muestra cuando es > 0.
3. **Moneda automática**: las transacciones obtienen la moneda de la billetera seleccionada.
4. **Tasas diarias**: se sincronizan desde Dolarapi al cargar la página (`/api/daily-rates/today`) o manualmente desde la sección Tasas, y se pueden editar/crear a mano.
5. **Soft-delete de billeteras**: al "eliminar" una billetera se marca `isActive = 0` y queda disponible para reactivar.
6. **Mobile-first**: tablas → acordeones < 600px, bottom nav < 900px.

## ✅ Proyecto verificado contra el código

Este README se generó/actualizó revisando directamente el código fuente (backend `exchange-server.js`, frontend App Router y componentes, archivos de Docker), por lo que stack, endpoints, páginas y comandos reflejan el estado real del repositorio en el branch `fix/mobile-responsive`.

## 📈 Roadmap futuro

- [x] Reportes y estadísticas (dashboard)
- [x] Tablas responsivas en móvil (acordeones)
- [x] Filtros por rango de fechas en billeteras
- [x] Tasas diarias con CRUD y sincronización desde API (Dolarapi)
- [ ] Gráficos reales de gastos por categoría (Recharts/Chart.js) — hoy se simulan con MUI
- [ ] Notificaciones push
- [ ] Autenticación de usuarios
- [ ] Multi-usuario compartido

## 📄 Licencia

Sistema de código abierto para uso personal y educativo.

---

## ✍️ Créditos

**Desarrollado por [Mara](https://github.com/)** ☀️ — asistente IA de finanzas personales.

> *frederic: humano* — lo probó todo y lo pidió hasta dejarlo bien. 🙌

---

**✨ Sistema listo para gestionar tus finanzas de forma inteligente y automatizada.**
