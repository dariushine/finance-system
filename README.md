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

## 🚀 Despliegue Rápido

### Opción 1: Docker Compose (Recomendado)

```bash
# 1. Clonar o copiar el sistema
cd /tu/directorio

# 2. Iniciar todo con Docker Compose
docker-compose up -d

# 3. Acceder al dashboard
#    Backend API: http://localhost:3002/api
#    Dashboard:   http://localhost:3000
```

### Opción 2: Desarrollo Local

```bash
# 1. Backend
cd backend
npm install
node exchange-server.js

# 2. Frontend (otra terminal)
cd frontend
npm install
npm run dev

# 3. Acceder
#    Backend: http://localhost:3002/api
#    Frontend: http://localhost:3000
```

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

```bash
# Backend
PORT=3002
NODE_ENV=production

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3002/api
```

## 🐳 Docker Compose Detalles

### Servicios:

1. **backend**: API REST en Node.js (puerto 3002)
2. **frontend**: Dashboard NextJS (puerto 3000)

### Comandos útiles:

```bash
# Iniciar todo
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener todo
docker-compose down

# Reconstruir imágenes
docker-compose build

# Limpiar todo (incluyendo datos)
docker-compose down -v
```

### Volúmenes:

- `backend/data`: Base de datos SQLite persistente
- `frontend/.next`: Cache de build de NextJS

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

**Sistema desarrollado por y para [Frederic López](https://github.com/)** 🧑‍💻

- **Frederic** — idea, dirección, pruebas y decisiones de producto. El que sabe lo que necesita y lo pidió hasta dejarlo bien. 🙌
- **Mara** — asistente IA que escribió el código, consolidó el backend, armó el frontend y las pruebas unitarias, todo bajo la guía de Frederic. ☀️

> *Hecho con cariño, mucha paciencia y unas cuantas rondas de "ajuste esto, quita lo otro, deja uno solo".*

---

**✨ Sistema listo para gestionar tus finanzas de forma inteligente y automatizada.**