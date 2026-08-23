# 💰 Finance System

Sistema para gestionar tus finanzas personales: billeteras en USD/VES, transacciones por categorías, cambios entre billeteras (exchanges), tasas de cambio diarias (BCV/paralelo) y reportes. Tiene un dashboard web pensado para usarse cómodamente tanto en el celular como en el escritorio, y corre con Docker Compose.

> 🔌 **¿Usas OpenClaw?** Consultá y operá tus finanzas desde el chat con el plugin + skill de este repo: **[github.com/dariushine/finance-system-openclaw](https://github.com/dariushine/finance-system-openclaw)**. El plugin agrega las tools `finance_*` (balance, transacciones, exchanges, tasas, stats) y el skill documenta cómo usarlas.

---

## ✨ Funcionalidades

- **Billeteras múltiples**: Banco, Efectivo, Tarjeta, Cripto, Inversión, en USD o VES. Podés eliminarlas (queda en un listado aparte para reactivarlas).
- **Transacciones**: gastos e ingresos con categorías, descripción y comisión opcional. La moneda se toma automáticamente de la billetera.
- **Exchanges**: cambiás dinero entre billeteras con comisión opcional (en la billetera de origen y/o la de destino). Valida que tengas fondos.
- **Balance total**: suma de todo en USD, usando tasas BCV o paralelo (elegís cuál).
- **Tasas diarias**: se sincronizan automáticamente desde Dolarapi y también podés crearlas/editarlas a mano.
- **Pagos frecuentes**: suscripciones y gastos recurrentes que ejecutás con un clic.
- **Reportes**: ingresos/gastos/neto, rendimiento mensual, desglose por categoría y balances por billetera, con exportación.
- **Autenticación opcional**: login con usuario y contraseña, gestión de sesiones activas y tokens de API para scripts.
- **Docker Compose**: levantás todo con un comando.

---

## 📸 Capturas

| Móvil | Escritorio |
|---|---|
| <img src="README-assets/dashboard-mobile.jpg" alt="Dashboard móvil" width="220"/> | <img src="README-assets/dashboard-desktop.jpg" alt="Dashboard escritorio" width="480"/> |

---

## 🚀 Instalación

### Opción 1: Docker Compose (recomendado)

```bash
git clone https://github.com/dariushine/finance-system.git
cd finance-system

# Opcional: configurar usuario y contraseña (ver sección "Configurar usuario")
cp .env.example .env

docker compose up --build -d
docker compose ps              # backend debe estar 'healthy'
```

Accedé a **http://localhost:3000** (dashboard).

Para detener: `docker compose down`. Los datos (base de datos SQLite en `backend/data`) se conservan al detener.

### Opción 2: Desarrollo (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Recarga la API y el frontend al editar el código. **NO** es para producción. Si cambiás dependencias (`package.json`), reconstruí con `--build`.

### Opción 3: Sin Docker

```bash
# Terminal 1 — backend
cd backend && npm install && node exchange-server.js   # API en http://localhost:3002/api

# Terminal 2 — frontend
cd frontend && npm install && npm run dev              # Dashboard en http://localhost:3000
```

---

## 🔧 Configurar el usuario (autenticación)

Por defecto la app arranca **sin** login (todo abierto). Para protegerla:

1. Copiá `.env.example` a `.env`.
2. Definí `AUTH_USERNAME` y `AUTH_PASSWORD` (y un `AUTH_TOKEN_SECRET` con `openssl rand -base64 48`).
3. Levantá con `docker compose up --build -d`.

Con la autenticación activa, la raíz (`/`) es el **login** y el dashboard vive en `/dashboard`.

Además podés ajustar: duración de los tokens (`ACCESS_TOKEN_TTL_MS`, `REFRESH_TTL_SHORT_MS`, `REFRESH_TTL_LONG_MS`) y cookies seguras en HTTPS (`AUTH_COOKIE_SECURE=true`).

### Sesiones y tokens de API

En la app (ruta `/sessions`) podés ver y **cerrar** las sesiones abiertas en otros dispositivos, y crear **tokens de API** (con expiración) para acceder a la API desde scripts. El token se usa como `Authorization: Bearer <token>`. Los tokens pueden leer y operar datos, pero no cambiar configuración.

---

## 🗺️ Secciones del sistema

| Sección | Qué hace |
|---|---|
| **Dashboard** | Balance total, billeteras y últimas transacciones. |
| **Billeteras** | Crear, editar, eliminar y reactivar billeteras; ver reporte por período. |
| **Transacciones** | Historial, crear/editar/eliminar gastos e ingresos. |
| **Exchanges** | Cambios entre billeteras, con comisiones y exportación CSV. |
| **Tasas** | Tasas BCV/paralelo diarias, sincronizar desde Dolarapi. |
| **Categorías** | Crear, editar, desactivar y reactivar categorías de gasto/ingreso. |
| **Pagos frecuentes** | Suscripciones y gastos recurrentes. |
| **Reportes** | Resumen, rendimiento mensual, por categoría, con exportación. |
| **Sesiones** | Gestionar dispositivos conectados y tokens de API. |
| **Ajustes** | Zona horaria, separador decimal y privacidad de saldos. |

---

## 📡 API

El frontend sirve la API bajo `/api` (proxy). También podés llamarla directo al backend (puerto 3002). Los recursos principales son: `wallets`, `categories`, `transactions`, `exchanges`, `daily-rates`, `recurring-payments`, `stats`, `settings` y `auth`.

---

## 🧩 Arquitectura

```
finance-system/
├── backend/            # API (Node.js + Express + SQLite), puerto 3002
├── frontend/           # Dashboard (Next.js), puerto 3000
├── docker-compose.yml  # Producción
├── docker-compose.dev.yml  # Desarrollo (hot reload)
└── Dockerfile          # Build multi-stage (backend + frontend)
```

La base de datos vive en `backend/data/finance.db`. Hacé backup de esa carpeta.

---

## ❓ Problemas comunes

**El frontend no arranca / se queda esperando al backend**
Verificá que el backend esté *healthy*: `docker compose ps`. Si falló, mirá los logs: `docker compose logs backend`.

**Tras cambiar dependencias en dev aparece `Module not found: Can't resolve 'jose'`**
Reconstruí la imagen: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`.

**Me saca del login / redirige siempre al inicio**
El access token expira (5 min por defecto) y el refresh lo renueva solo mientras sea válido. Si la sesión se revocó o expiró, volvé a iniciar sesión.

**Quiero programar contra la API desde un script**
Creá un token en `/sessions` y usalo como `Authorization: Bearer <token>`.

**No veo datos al arrancar**
Por defecto arranca con la base vacía (solo categorías de sistema). Si querés datos de ejemplo, definí `SEED_DEMO_DATA=true`.

---

## 🧪 Tests

```bash
cd backend
npm test
```

---

## 📄 Licencia

MIT (ver `LICENSE`).

---

## ✍️ Créditos

Desarrollado por **Mara** ☀️, con el apoyo y feedback constante de [Frederic](https://github.com/dariushine).
