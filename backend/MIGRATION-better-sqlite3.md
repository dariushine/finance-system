# Plan de migración: sqlite3 → better-sqlite3

**Branch:** `feat/better-sqlite3-migration`
**Repo:** finance-system (backend)

## Objetivo
Reemplazar la librería `sqlite3` (asíncrona, callbacks) por `better-sqlite3`
(síncrona, `prepare()` y `db.transaction()` nativa) en el backend, eliminando la
clase de bugs de transacciones anidadas/pisadas sobre la conexión única, sin
reescribir los ~118 call-sites del resto del backend.

## Estrategia aplicada (wrapper de compatibilidad en db.js)

El backend usa `db` en **118 call-sites** en **15 archivos / ~4000 líneas**, todo
con la API asíncrona de `sqlite3` (`db.get/run/all` + callbacks o helpers
promisificados). Reescribir los 118 sitios a `better-sqlite3` **síncrono** sería
un refactor enorme y de alto riesgo para datos reales.

**Solución implementada:** un **wrapper síncrono de compatibilidad** en `src/db.js`
que deleta todo el SQL a `better-sqlite3` (síncrono, `prepare()/get()/run()/all()`),
pero expone la **misma API de sqlite3** que el resto del código ya usa:

- `db.get/run/all(sql, params, cb)` → soporta callback (comportamiento sqlite3) o
  retorno síncrono.
  - Convierte `undefined → null` (better-sqlite3 no acepta `undefined`).
  - `db.run` con callback inyecta `this.lastID`/`this.changes` (compat sqlite3).
  - `PRAGMA table_info` de tabla inexistente devuelve `[]` (compat sqlite3).
- `db.exec(sql)` → síncrono.
- `db.serialize(fn)` → ejecuta `fn()` (ya somos síncronos y en orden).
- `db.prepare(sql)` / `db.transaction(fn)` → expone lo nativo de better-sqlite3.
- WAL se activa con `conn.pragma('journal_mode = WAL;')`.

La migración **NO toca los otros 14 archivos** excepto asegurar que `refresh_tokens`
se cree en `db.js` (IF NOT EXISTS) para que el arranque sea robusto en BD nueva.

## Qué se modificó

1. **`backend/src/db.js`** — el wrapper síncrono sobre better-sqlite3 (núcleo). +
   `CREATE TABLE IF NOT EXISTS refresh_tokens` para arranque robusto.
2. **`backend/package.json`** / **`package-lock.json`** — `better-sqlite3` agregado,
   `sqlite3` removido. (`supertest` se dejó en ^7.0.0 original.)
3. **`backend/MIGRATION-better-sqlite3.md`** — este documento.

## Verificación (hecha en local)

Levanté el backend real (express + better-sqlite3) contra una BD de prueba y probé
las operaciones que antes fallaban:

- ✅ `POST /api/transactions` con **fee inline** → 200, fee aplicado (padre + comisión hija).
- ✅ **2 transacciones en paralelo** → 200/200 (antes 500 `cannot start...`).
- ✅ `POST /api/exchanges` con **fee + creditFee** → 200, débito+cédito+fees consistentes,
  `exchanges.fee` / `exchanges.credit_fee` correctos.
- ✅ Balances chequean: cada gasto/fee descuenta, cada ingreso suma; exchange atómico.
- ✅ `GET /api/health` y `GET /api/wallets` responden; arranque con BD nueva no falla.

## Pendiente (para Freddy)
- Probar en local (clonar el branch, `npm install`, arrancar `exchange-server.js`).
- Si va bien, pasar a su ambiente de prod (docker).
- NO se aplicó nada a prod; las BD de `backend/data/*.db*` están en `.gitignore`.
