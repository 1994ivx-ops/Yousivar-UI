/**
 * Node entry point — local development and any non-Worker host.
 *
 * Cloudflare Workers use src/index.js directly (`wrangler dev` / `wrangler deploy`).
 * Here we supply what the Worker runtime would otherwise provide: a disk adapter
 * for document storage, and process.env as the bindings object.
 */
import { serve } from '@hono/node-server';
import { Readable } from 'node:stream';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import app from './index.js';
import { readConfig, assertConfig } from './config.js';

const root = resolve(process.env.LOCAL_STORAGE_DIR || '.local-storage');

/** Same interface as the R2 adapter; keys are confined to the storage root. */
const diskAdapter = {
  async put(key, bytes, contentType) {
    const target = join(root, key);
    if (!target.startsWith(root)) throw new Error('Invalid storage key');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(bytes));
    await writeFile(`${target}.meta`, contentType || 'application/octet-stream');
  },
  async get(key) {
    const target = join(root, key);
    if (!target.startsWith(root)) throw new Error('Invalid storage key');
    try {
      const buffer = await readFile(target);
      const contentType = await readFile(`${target}.meta`, 'utf8').catch(() => 'application/octet-stream');
      return {
        body: Readable.toWeb(Readable.from(buffer)),
        contentType,
        size: buffer.length,
      };
    } catch {
      return null;
    }
  },
  async remove(key) {
    const target = join(root, key);
    if (!target.startsWith(root)) throw new Error('Invalid storage key');
    await unlink(target).catch(() => {});
    await unlink(`${target}.meta`).catch(() => {});
  },
};

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_URL: process.env.APP_URL || 'http://localhost:8788',
  storageAdapter: process.env.BUCKET ? undefined : diskAdapter,
};

const config = readConfig(env);
const missing = assertConfig(config);
if (missing.length) {
  console.error(`Missing configuration: ${missing.join(', ')}`);
  console.error('Copy .env.example to backend/.env and fill it in (see docs/migration/04-runbook.md).');
  process.exit(1);
}

const port = Number(process.env.PORT || 8788);

serve({ fetch: app.fetch, port, env }, (info) => {
  console.log(`YOUSIVAR–Ω API on http://localhost:${info.port}`);
  console.log(`Allowed origins: ${config.allowedOrigins.join(', ')}`);
  console.log(`Document storage: ${process.env.BUCKET ? 'R2 binding' : `disk (${root})`}`);
});