# Finance Dashboard - Frontend

Dashboard web para gestión de finanzas personales. NextJS + Material UI, mobile-friendly.

## Features

- 📊 **Balance total** con conversión automática a USD
- 💾 **Billeteras múltiples** (USD/VES) con visualización
- 📝 **Formulario de transacciones** (gastos/ingresos)
- 💱 **Formulario de exchanges** con cálculo de tasa y spread
- 📱 **Mobile-first design**
- 🎨 **Material UI components**
- 🌓 **Theme personalizable**

## Setup

### 1. Instalar dependencias
```bash
npm install
```

### 2. Ejecutar en desarrollo
```bash
npm run dev
```

### 3. Abrir en navegador
```
http://localhost:3000
```

## API Backend

El frontend se conecta al backend en `http://localhost:3002/api`:

- `GET /health` - Estado del servicio
- `GET /wallets` - Billeteras
- `POST /transactions` - Registrar transacción
- `POST /exchanges` - Registrar exchange
- `GET /balance` - Balance total

## Estructura del Proyecto

```
app/
├── layout.tsx          # Layout principal con Material UI
├── page.tsx           # Página principal
├── ThemeProvider.tsx  # Proveedor de tema Material UI
└── components/
    ├── BalanceCard.tsx      # Card de balance total
    ├── WalletList.tsx       # Lista de billeteras
    ├── TransactionForm.tsx  # Formulario transacción
    └── ExchangeForm.tsx     # Formulario exchange
```

## Componentes

### BalanceCard
Muestra el balance total en USD con breakdown por moneda.

### WalletList
Lista visual de todas las billeteras con:
- Íconos por tipo (bank, cash, crypto, card)
- Balance en moneda original
- Conversión a USD

### TransactionForm
Formulario para registrar gastos o ingresos:
- Selección de tipo (gasto/ingreso)
- Monto (currency automático de billetera)
- Selección de billetera
- Selección de categoría
- Descripción opcional

### ExchangeForm
Formulario para intercambiar entre billeteras:
- Billetera origen y destino
- Montos de origen y destino
- Cálculo automático de tasa y spread
- Visualización de ganancia/pérdida vs tasa de mercado

## Mobile Responsive

- Grid responsive con Material UI
- Cards que se apilan en móvil
- Botones táctiles grandes
- Formularios optimizados para móvil

## Integración con Backend

Para conectar con el backend real:

1. Crear servicio de API en `/lib/api.ts`
2. Reemplazar datos estáticos con llamadas fetch
3. Manejar estados de carga/error
4. Actualizar UI después de cada acción

## Ejemplo de Integración

```typescript
// Ejemplo de llamada a API
async function fetchWallets() {
  const response = await fetch('http://localhost:3002/api/wallets');
  return await response.json();
}

// Ejemplo de transacción
async function createTransaction(data) {
  const response = await fetch('http://localhost:3002/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return await response.json();
}
```

## Deploy

### Build para producción
```bash
npm run build
npm start
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Screenshots

**Dashboard Principal:**
- Balance total destacado
- Grid de billeteras
- Formularios side-by-side
- Stats rápidos

**Mobile View:**
- Cards apilados verticalmente
- Formularios full-width
- Navegación simplificada

## TODO

- [ ] Conectar con API real
- [ ] Agregar autenticación
- [ ] Implementar gráficos
- [ ] Agregar reportes
- [ ] Notificaciones push
- [ ] PWA features
- [ ] Dark mode toggle
- [ ] Exportar datos