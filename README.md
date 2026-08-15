# Sistema de Finanzas Personal

Sistema completo de gestión de finanzas personales con billeteras múltiples (USD/VES), transacciones, exchanges y dashboard web.

## ✨ Características

- **🏦 Billeteras múltiples**: Cuenta Bancaria USD/VES, Efectivo USD/VES, Crypto Wallet, Tarjeta Prepagada
- **💸 Transacciones**: Gastos e ingresos con categorías
- **💱 Exchanges**: Cambios entre billeteras con transacciones separadas (débito/crédito automáticos)
- **📊 Balance total**: En USD con conversión automática
- **📱 Dashboard web**: NextJS + Material UI, mobile-friendly
- **🤖 Skill OpenClaw**: Comandos para uso rápido
- **🐳 Docker Compose**: Despliegue completo con un comando

## 🏗️ Arquitectura

```
Sistema de Finanzas
├── 📦 Backend API (Node.js + Express + SQLite)
│   ├── GET /api/health          # Status del sistema
│   ├── GET /api/wallets         # Listar billeteras
│   ├── POST /api/transactions   # Registrar transacciones
│   ├── POST /api/exchanges      # Exchange (genera 2 transacciones)
│   └── GET /api/balance         # Balance total
├── 🌐 Frontend Dashboard (NextJS + Material UI)
│   ├── Balance total visual
│   ├── Lista de billeteras
│   ├── Formulario de transacciones
│   └── Formulario de exchanges
├── 🤖 Skill OpenClaw
│   ├── /finance-app status
│   ├── /finance-app wallets
│   ├── /finance-app add
│   └── /finance-app xchg
└── 🐳 Docker Compose
    ├── backend (3002)
    └── frontend (3000)
```

## 🚀 Despliegue

### Opción 1: Producción (Docker Compose — recomendado)

Levanta los servicios desde imágenes autónomas (sin montar el código fuente del host).

```bash
# 1. Clonar
cd /tu/directorio
git clone <tu-repo> finance-system
cd finance-system

# 2. Construir y levantar
#    (usa Docker Compose v2, con espacio: 'docker compose')
docker compose up --build -d

# 3. Verificar estado
#    backend debe estar 'healthy' (el frontend espera a que lo esté)
docker compose ps

# 4. Acceder
#    Dashboard:   http://localhost:3000
#    API (proxy): http://localhost:3000/api   ← la API se expone por el frontend
#    API directa: http://localhost:3002/api
```

**Detener / limpiar:**

```bash
docker compose down            # detiene (conserva la DB en backend/data)
docker compose down -v         # detiene (borra volúmenes anónimos; el bind backend/data queda)
```

> ℹ️ La base SQLite vive en `backend/data/finance.db` (bind mount). Haz **backup** de esa carpeta.
> ℹ️ **No** necesitas crear `.env` ni `chmod` de data: el backend crea el esquema al arrancar.

---

### Opción 2: Desarrollo (hot reload — probar cambios sin rebuildear)

Tu flujo para iterar: editas el código en el host y el contenedor lo refleja al instante, sin
`docker compose build` a cada rato. Usa el override `docker-compose.dev.yml`. **NO** es para producción.

```bash
# Levantar con override de dev (backend --watch + frontend next dev)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Detener (Ctrl+C) / limpiar contenedores dev:
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

**Qué hace el override:**

| Servicio | Como corre | Efecto |
|---|---|---|
| `backend` | `node --watch` + bind `./backend` | recarga la API al editar `backend/` |
| `frontend` | `next dev` + bind `./frontend` | hot reload del dashboard al editar `frontend/` |

> ⚠️ Los `node_modules` y `.next` se conservan **del contenedor** (volúmenes anónimos), no del
> host — importante porque `sqlite3` es nativo y no portable entre plataformas.
> ℹ️ En dev, el rewrite de Next apunta al backend por `API_UPSTREAM=http://backend:3002`
> (el proxy sigue funcionando dentro de la red Docker).

---

### Opción 3: Desarrollo local (sin Docker)

```bash
# 1. Backend (terminal 1)
cd backend
npm install
node exchange-server.js

# 2. Frontend (terminal 2)
cd frontend
npm install
npm run dev

# 3. Acceder
#    Backend:  http://localhost:3002/api
#    Frontend: http://localhost:3000
```

> ℹ️ En local, el rewrite de Next apunta a `http://localhost:3002` (default cuando NO hay
> `API_UPSTREAM` y `NODE_ENV=development`).

## 📱 Mobile-First Design

### Características móviles:

1. **Responsive completo**:
   - 320px (iPhone SE) → 1920px (4K)
   - Breakpoints optimizados: xs: 0px, sm: 600px, md: 900px, lg: 1200px
   - Contenido se adapta progresivamente

2. **Touch-friendly**:
   - Botones mínimos 48x48px en móvil
   - Espaciado táctil adecuado
   - Inputs altos para dedos

3. **Mobile UI**:
   - Bottom navigation en móvil
   - AppBar fija optimizada
   - Safe areas para notches
   - PWA ready

4. **Performance móvil**:
   - Images optimizadas
   - Font sizes responsivos
   - Minimal JavaScript en carga

## 🤖 Skill OpenClaw

### Comandos disponibles:

```bash
# Estado del sistema
/finance-app status

# Listar billeteras
/finance-app wallets

# Balance total
/finance-app balance

# Registrar transacción
/finance-app add expense 1200 food "Efectivo VES" "Perro caliente"
/finance-app add income 500 salary "Cuenta Bancaria USD" "Salario"

# Hacer exchange (nuevo sistema con transacciones separadas)
/finance-app xchg 100 "Crypto Wallet" 60000 "Efectivo VES" 635 "Cambio Binance"
/finance-app xchg 100 "Crypto Wallet" 60000 "Efectivo VES" "Cambio sin spread"
```

### Configurar el skill:

```bash
# Para Docker Compose
export FINANCE_API_URL=http://localhost:3002/api

# Para desarrollo local
export FINANCE_API_URL=http://localhost:3002/api
```

## 💱 Sistema de Exchanges

### Características únicas:

1. **Transacciones separadas**: Cada exchange genera 2 transacciones automáticas:
   - `exchange_out` (débito en billetera origen)
   - `exchange_in` (crédito en billetera destino)

2. **Validación de fondos**: Verifica fondos suficientes antes del exchange

3. **Spread opcional**: Calcula spread solo si se provee `marketRate`

4. **Sin suposiciones**: No asume tasas de mercado por defecto

### Ejemplo de flujo:

```javascript
// 1. Exchange request
POST /api/exchanges
{
  "fromWalletId": 5,      // Crypto Wallet (USD)
  "toWalletId": 4,        // Efectivo VES
  "fromAmount": 100,
  "toAmount": 60000,
  "marketRate": 635       // Opcional para spread
}

// 2. Sistema crea:
//    - Transacción 1: -100 USD (exchange_out)
//    - Transacción 2: +60000 VES (exchange_in)
//    - Metadata: tasa = 600, spread = 5.51%
```

## 📊 Dashboard Web (Mobile-First)

### Características móviles:

1. **Layout responsive**:
   - Una columna en móvil, dos en tablet+
   - Cards apiladas verticalmente en móvil
   - Grid progresivo (1 → 2 → 3 columnas)

2. **Componentes touch-friendly**:
   - Botones grandes (min 48px)
   - Inputs con spacing táctil
   - Menús bottom navigation en móvil

3. **Typography responsivo**:
   - Font sizes que escalan con viewport
   - Line heights optimizados para móvil
   - Contrastes AAA para legibilidad

4. **Performance**:
   - Lazy loading de imágenes
   - Critical CSS inline
   - Font display swap

### URLs:

- **Dashboard**: http://localhost:3000
- **API Backend**: http://localhost:3002/api
- **Health check**: http://localhost:3002/api/health

### URLs:

- **Dashboard**: http://localhost:3000
- **API Backend**: http://localhost:3002/api
- **Health check**: http://localhost:3002/api/health

## 🗃️ Base de Datos

- **SQLite**: Base de datos embebida, sin configuración externa
- **Persistencia**: Datos guardados en `backend/data/finance.db`
- **Backup automático**: Volumen Docker para persistencia

## 🔧 Desarrollo

### Estructura del proyecto:

```
finance-system/
├── backend/                    # API Backend
│   ├── exchange-server.js  # Servidor principal
│   ├── data/                  # SQLite database
│   └── package.json
├── frontend/                  # Dashboard NextJS (Mobile-First)
│   ├── app/                  # NextJS 13+ app directory
│   │   ├── layout.tsx       # Layout mobile-first
│   │   ├── page.tsx         # Homepage responsive
│   │   └── components/      # Componentes touch-friendly
│   └── package.json
├── skills/                   # Skill OpenClaw
│   └── finance-app/         # Skill files
├── docker-compose.yml       # Orquestación Docker
├── Dockerfile              # Build multi-stage
└── README.md              # Esta documentación
```

### Variables de entorno:

El backend **no necesita `.env`**: usa defaults en `exchange-server.js` (puerto 3002, DB en `backend/data/finance.db`) y crea el esquema al arrancar.

```bash
# Backend (opcional, solo si algún día se lee process.env)
PORT=3002
NODE_ENV=production

# Frontend
# API_UPSTREAM: override del rewrite de Next (solo necesario en dev-Docker para
# apuntar al backend por nombre de red; en prod ya resuelve a backend:3002)
API_UPSTREAM=http://backend:3002
```

## 🐳 Docker Compose Detalles

### Archivos:

- **`docker-compose.yml`** — producción: servicios desde imágenes autónomas (build multi-stage, sin binds del código fuente)
- **`docker-compose.dev.yml`** — override de desarrollo: añade hot reload (binds + `node --watch` / `next dev`)

### Servicios:

1. **backend**: API REST en Node.js (puerto 3002)
2. **frontend**: Dashboard NextJS (puerto 3000)

### Comandos útiles (producción):

```bash
# Iniciar todo (usa Compose v2, con espacio: 'docker compose')
docker compose up --build -d

# Ver logs
docker compose logs -f

# Detener todo
docker compose down

# Reconstruir imágenes
docker compose build

# Limpiar todo (incluyendo datos)
docker compose down -v
```

### Comandos útiles (desarrollo):

```bash
# Iniciar con hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Detener
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

### Volúmenes / persistencia:

- `backend/data` (bind): base de datos SQLite persistente — **haz backup aquí**
- `node_modules` / `.next` (anónimos, solo dev): conservan build del contenedor sobre el bind

## 🚨 Notas Importantes

1. **Exchanges son transacciones**: Cada exchange genera transacciones reales en el historial
2. **Spread condicional**: Solo se calcula si el usuario provee `marketRate`
3. **Currency automático**: Las transacciones obtienen la moneda automáticamente de la billetera
4. **Sin tasas por defecto**: El sistema no asume tasas de mercado
5. **Mobile-friendly**: Todo el sistema está optimizado para uso móvil

## 📈 Roadmap Futuro

- [ ] Gráficos de gastos por categoría
- [ ] Reportes mensuales automáticos
- [ ] Integración con APIs de tasas reales
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