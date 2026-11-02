/**
 * Single PostgreSQL access point (Neon, over HTTPS — no socket pool, so the same
 * code runs in Workers and in Node).
 *
 * Every query is a tagged template, which makes parameters positional and
 * un-stringifiable: no route ever builds SQL by concatenation.
 */
import { neon } from '@neondatabase/serverless';

export class Database {
  constructor(connectionString) {
    if (!connectionString) throw new Error('DATABASE_URL is not configured');
    const sql = neon(connectionString);

    // Bound in the constructor so `db.many\`…\`` (tagged-template call) keeps
    // its `this` — a prototype method would lose it.
    this.many = async (strings, ...values) => {
      const rows = await sql(strings, ...values);
      return Array.isArray(rows) ? rows : [];
    };

    this.one = async (strings, ...values) => {
      const rows = await this.many(strings, ...values);
      return rows[0] ?? null;
    };
  }
}

let singleton = null;

export function getDb(connectionString) {
  if (!singleton) singleton = new Database(connectionString);
  return singleton;
}