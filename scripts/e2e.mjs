#!/usr/bin/env node
/**
 * Prepara la base de datos de pruebas, aplica migraciones + seed y
 * ejecuta los tests e2e.
 *
 *   DATABASE_URL de prueba por defecto:
 *   postgresql://postgres:postgres@localhost:5433/contabeni_test?schema=public
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/contabeni_test?schema=public';

const url = new URL(DATABASE_URL);
const dbName = url.pathname.replace(/^\//, '') || 'contabeni_test';
const adminUrl = new URL(DATABASE_URL);
adminUrl.pathname = '/postgres';

async function ensureDatabase() {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const res = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`Base de datos "${dbName}" creada`);
    }
  } finally {
    await client.end();
  }
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await ensureDatabase();
run('npx', ['prisma', 'migrate', 'deploy']);
run('npx', ['tsx', 'prisma/seed.ts']);
run('npx', ['vitest', 'run', '--config', './vitest.config.e2e.ts']);
