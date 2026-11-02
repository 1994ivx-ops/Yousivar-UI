/**
 * Migration runner — applies database/migrations/*.sql in filename order.
 *
 *   node scripts/migrate.js            apply pending migrations
 *   node scripts/migrate.js --dry      list what would run, change nothing
 *   node scripts/migrate.js --status   show applied / pending
 *
 * Safety:
 *   · every file is applied inside a transaction, so a failure rolls back
 *   · checksums are stored; editing an applied migration is refused
 *   · nothing is dropped automatically — destructive changes must be their own
 *     reviewed migration
 *
 * Uses the direct (non-pooled) connection when the provider offers one, because
 * DDL does not belong on a connection pooler.
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../database/migrations');

const args = new Set(process.argv.slice(2));
const dry = args.has('--dry');
const statusOnly = args.has('--status');

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL (or DATABASE_DIRECT_URL) is required.');
  process.exit(1);
}

const checksum = (text) => createHash('sha256').update(text).digest('hex');

async function main() {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  if (!files.length) {
    console.error(`No migrations found in ${migrationsDir}`);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: true } });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        name       text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query('select name, checksum, applied_at from schema_migrations order by name');
    const applied = new Map(rows.map((row) => [row.name, row]));

    const plan = [];
    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const sum = checksum(sql);
      const already = applied.get(file);
      if (already && already.checksum !== sum) {
        throw new Error(`${file} was modified after it was applied — create a new migration instead`);
      }
      if (!already) plan.push({ file, sql, sum });
    }

    if (statusOnly) {
      for (const file of files) {
        console.log(`${applied.has(file) ? 'applied' : 'pending'}  ${file}`);
      }
      return;
    }

    if (!plan.length) {
      console.log('Database is up to date.');
      return;
    }

    for (const step of plan) {
      if (dry) {
        console.log(`would apply  ${step.file}`);
        continue;
      }
      process.stdout.write(`applying  ${step.file} … `);
      await client.query('begin');
      try {
        await client.query(step.sql);
        await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [step.file, step.sum]);
        await client.query('commit');
        console.log('ok');
      } catch (error) {
        await client.query('rollback');
        console.log('failed');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});