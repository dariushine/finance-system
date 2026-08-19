// src/routes/stats.js — Estadísticas del dashboard.
const { db } = require('../db');
const { getRateForDate } = require('../services/rates');
const { rangeToInstants, projectInstants } = require('../services/timeUtil');
const { getUserTimeZone } = require('../services/settings');
const { isValidTimeZone } = require('../services/timeZoneMap');
const { toNum, rawVesAmountToUsd } = require('../services/money');

module.exports = function registerStatsRoutes(app) {
  app.get('/api/stats', async (req, res) => {
    const rateType = req.query.rate === 'paralelo' ? 'paralelo' : 'bcv';
    // Excluir billeteras marcadas para no contar en los totales del dashboard.
    const excludeFromTotal = req.query.excludeFromTotal === '1' || req.query.excludeFromTotal === 'true';

    const { from, to, period } = req.query;
    const qz = req.query.tz;
    const tz = qz && isValidTimeZone(qz) ? qz : await getUserTimeZone();
    const { start, end } = rangeToInstants(from, to, period, tz) || {};
    const instants = start && end ? { start, end } : null;

    const dateFilter = instants
      ? 't.datetime_utc >= ? AND t.datetime_utc < ?'
      : null;
    const dateParams = instants ? [instants.start, instants.end] : [];

    try {
      // Si se pide excluir billeteras de los totales, descartamos las transacciones
      // cuyas billeteras tengan excludeFromTotal = 1.
      const excludeIds = excludeFromTotal
        ? await new Promise((resolve, reject) => {
            db.all(`SELECT id FROM wallets WHERE excludeFromTotal = 1`, (err, r) => err ? reject(err) : resolve((r || []).map((x) => x.id)));
          })
        : [];
      const rows = await new Promise((resolve, reject) => {
        const params = [...dateParams];
        let walletFilter = '';
        if (excludeIds.length) {
          walletFilter += ` AND w.id NOT IN (${excludeIds.map(() => '?').join(',')})`;
          params.push(...excludeIds);
        }
        let dateFilterStr = '';
        if (dateFilter) {
          dateFilterStr = ` AND ${dateFilter}`;
        }
        db.all(`SELECT t.type, t.amount, t.datetime_utc AS datetime_utc, t.datetime_utc AS datetimeUtc, c.name AS category, c.type AS categoryType, w.currency, w.name AS walletName FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN wallets w ON w.id = t.wallet_id WHERE t.deleted = 0${dateFilterStr}${walletFilter}`,
          params, (err, r) => err ? reject(err) : resolve(r));
      }).then((rows) => projectInstants(rows || [], tz));

      let total_income = 0;
      let total_expense = 0;
      let transaction_count = rows?.length || 0;
      const monthlyMap = new Map();
      const categoryMap = new Map();
      const rateCache = new Map();

      const getRate = async (date) => {
        if (rateCache.has(date)) return rateCache.get(date);
        const rate = await getRateForDate(date, rateType);
        rateCache.set(date, rate);
        return rate;
      };

      for (const row of (rows || [])) {
        const usdValue = await (async () => {
          if (row.currency === 'VES') {
            const rate = await getRate(row.date);
            // amount está en centavos (×100), rate en ×10000: escalas distintas,
            // usa rawVesAmountToUsd para compensar. Resultado en USD (unidades).
            return rate ? rawVesAmountToUsd(row.amount, rate) : 0;
          }
          // USD: el monto está en centavos (×100) → unidades humanas.
          return toNum(row.amount) || 0;
        })();

        if (row.type === 'income') total_income += usdValue;
        else if (row.type === 'expense') total_expense += usdValue;

        let month = 'Desconocido';
        if (row.date) {
          const d = new Date(row.date);
          if (!isNaN(d.getTime())) month = d.toISOString().slice(0, 7);
        }
        if (!monthlyMap.has(month)) monthlyMap.set(month, { month, income: 0, expense: 0, transactionCount: 0 });
        const m = monthlyMap.get(month);
        m.transactionCount++;
        if (row.type === 'income') m.income += usdValue;
        else if (row.type === 'expense') m.expense += usdValue;

        const cat = row.category || 'Sin categoría';
        if (!categoryMap.has(cat)) categoryMap.set(cat, { category: cat, count: 0, total: 0, expenseOnly: row.categoryType === 'expense' });
        const c = categoryMap.get(cat);
        c.count++;
        if (row.type === 'expense') c.total += usdValue;
      }

      const monthly = Array.from(monthlyMap.values())
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((m) => ({ ...m, income: parseFloat(m.income.toFixed(2)), expense: parseFloat(m.expense.toFixed(2)), net: parseFloat((m.income - m.expense).toFixed(2)) }));

      const byCategory = Array.from(categoryMap.values())
        .filter((c) => c.expenseOnly)
        .map((c) => ({ category: c.category, count: c.count, total: parseFloat(c.total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);
      const byCategoryTotal = byCategory.reduce((s, c) => s + c.total, 0);

      const exchangeRows = await new Promise((resolve, reject) => {
        const params = [...dateParams];
        let dateFilterStr = '';
        if (dateFilter) {
          // En esta query la tabla de transacciones se aliasa `dt` (JOIN a debit),
          // no `t`; por eso reescribimos el filtro de rango sobre dt.datetime_utc.
          dateFilterStr = ' AND dt.datetime_utc >= ? AND dt.datetime_utc < ?';
        }
        db.all(`SELECT
            e.from_amount AS fromAmount,
            e.to_amount AS toAmount,
            e.rate,
            e.fee,
            fw.currency AS fromCurrency,
            tw.currency AS toCurrency,
            dt.datetime_utc AS datetime_utc,
            dt.datetime_utc AS datetimeUtc
          FROM exchanges e
          JOIN wallets fw ON fw.id = e.from_wallet_id
          JOIN wallets tw ON tw.id = e.to_wallet_id
          LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id
          WHERE e.deleted = 0${dateFilterStr}`,
          params, (err, r) => err ? reject(err) : resolve(r || []));
      }).then((rows) => projectInstants(rows || [], tz));
      let totalFromUSD = 0;
      let totalToUSD = 0;
      let totalFeeUSD = 0;
      let totalExchanges = exchangeRows.length;
      let spreadSum = 0;
      let spreadCount = 0;
      const exchangeRateCache = new Map();
      const getExRate = async (date) => {
        if (exchangeRateCache.has(date)) return exchangeRateCache.get(date);
        const r = await getRateForDate(date, rateType);
        exchangeRateCache.set(date, r);
        return r;
      };
      for (const ex of exchangeRows) {
        const fromUsd = ex.fromCurrency === 'VES' && ex.rate != null && ex.rate !== 0
          ? rawVesAmountToUsd(ex.fromAmount, ex.rate)
          : (ex.fromCurrency === 'VES' ? 0 : toNum(ex.fromAmount) || 0);
        const toUsd = ex.toCurrency === 'VES' && ex.rate != null && ex.rate !== 0
          ? rawVesAmountToUsd(ex.toAmount, ex.rate)
          : (ex.toCurrency === 'VES' ? 0 : toNum(ex.toAmount) || 0);
        totalFromUSD += fromUsd;
        totalToUSD += toUsd;
        if (ex.fee) {
          const feeUsd = ex.fromCurrency === 'VES' && ex.rate != null && ex.rate !== 0
            ? rawVesAmountToUsd(ex.fee, ex.rate)
            : toNum(ex.fee) || 0;
          totalFeeUSD += feeUsd;
        }
        if (ex.rate != null && Number(ex.rate) > 0 && ex.date) {
          const market = await getExRate(ex.date.split('T')[0]);
          if (market && Number(market) > 0) {
            const spread = Math.abs(Number(market) / Number(ex.rate) - 1) * 100;
            spreadSum += spread;
            spreadCount++;
          }
        }
      }
      const averageSpread = spreadCount > 0 ? spreadSum / spreadCount : 0;
      const exchangeStats = {
        totalExchanges,
        averageSpread: parseFloat(averageSpread.toFixed(2)),
        totalFromAmount: parseFloat(totalFromUSD.toFixed(2)),
        totalToAmount: parseFloat(totalToUSD.toFixed(2)),
        totalFee: parseFloat(totalFeeUSD.toFixed(2)),
      };

      res.json({
        total_income: parseFloat(total_income.toFixed(2)),
        total_expense: parseFloat(total_expense.toFixed(2)),
        net_balance: parseFloat((total_income - total_expense).toFixed(2)),
        transaction_count,
        rateType,
        summary: {
          totalTransactions: transaction_count,
          totalIncome: parseFloat(total_income.toFixed(2)),
          totalExpenses: parseFloat(total_expense.toFixed(2)),
          net: parseFloat((total_income - total_expense).toFixed(2)),
        },
        monthly,
        byCategory,
        byCategoryTotal: parseFloat(byCategoryTotal.toFixed(2)),
        exchangeStats,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};