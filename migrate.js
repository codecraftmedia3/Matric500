'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function main() {
  await db.connectDb(3, 1000);
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const { rows } = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (rows[0]) {
      console.log(`[migration] already applied ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`[migration] applied ${file}`);
  }
  await db.close();
}

main().catch((err) => {
  console.error('[migration] failed:', err.message);
  process.exitCode = 1;
});
