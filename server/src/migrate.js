import fs from 'node:fs';
import { pool, query } from './db.js';

const dir = new URL('../migrations/', import.meta.url);

await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const done = await query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
  if (done.rowCount) continue;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(new URL(file, dir), 'utf8'));
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log('applied', file);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
await pool.end();
