'use strict';
const { Pool } = require('pg');
let pool;

function buildConfig() {
  const e = process.env;
  const base = {
    ssl: e.PGSSL === 'true' ? { rejectUnauthorized: e.PGSSL_REJECT_UNAUTHORIZED !== 'false' } : false,
    max: Number(e.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  if (e.DATABASE_URL) return { ...base, connectionString: e.DATABASE_URL };
  const missing = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'].filter((k) => !e[k]);
  if (missing.length) throw new Error(`Missing database settings: ${missing.join(', ')} (or set DATABASE_URL)`);
  return { ...base, host: e.PGHOST, port: Number(e.PGPORT || 5432), user: e.PGUSER, password: e.PGPASSWORD, database: e.PGDATABASE };
}

/** Connects with retries. Never logs the connection string or password. */
async function connectDb(retries = 5, delayMs = 2000) {
  let cfg; try { cfg = buildConfig(); } catch (e) { throw e; }
  pool = new Pool(cfg);
  pool.on('error', (err) => console.error('[db] idle client error:', err.code || err.message));
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('[db] connected');
      try { await pool.query(require('fs').readFileSync(require('path').join(__dirname, '..', 'sql', 'schema.sql'), 'utf8')); console.log('[db] schema ready'); }
      catch (e) { console.error('[db] schema setup failed:', e.message); }
      return pool;
    } catch (err) {
      console.error(`[db] attempt ${i}/${retries} failed: ${err.code || err.message}`);
      if (i === retries) throw new Error('Database unreachable. Check DATABASE_URL / PG* settings and that PostgreSQL is running.');
      await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
}
const query = (text, params) => (pool ? pool.query(text, params) : Promise.reject(Object.assign(new Error('database not connected'), { code: 'NO_DB' })));
const close = () => pool && pool.end();

module.exports = { connectDb, query, close };
