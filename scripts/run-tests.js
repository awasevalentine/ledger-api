const { spawnSync, execSync } = require('child_process');
const { Client } = require('pg');

const TEST_DB = 'ledger_test';
const ADMIN_URL = 'postgres://ledger:ledger@localhost:55432/ledger';
const TEST_URL = `postgres://ledger:ledger@localhost:55432/${TEST_DB}`;

function sh(cmd, opts = {}) {
  const res = spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts });
  if (res.status !== 0) process.exit(res.status || 1);
}

async function waitForDb(url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const c = new Client({ connectionString: url });
      await c.connect();
      await c.query('select 1');
      await c.end();
      return;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Postgres did not become ready');
}

async function resetTestDb() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [TEST_DB]);
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
}

(async () => {
  console.log('> Starting Postgres...');
  sh('docker compose up -d db');

  console.log('> Waiting for Postgres...');
  await waitForDb(ADMIN_URL);

  console.log('> Resetting test database...');
  await resetTestDb();

  console.log('> Running migrations on test database...');
  sh(`npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts`, {
    env: { ...process.env, DATABASE_URL: TEST_URL, NODE_ENV: 'test' },
  });

  console.log('> Running unit + e2e tests...');
  sh('npx jest --runInBand', {
    env: { ...process.env, DATABASE_URL: TEST_URL, NODE_ENV: 'test' },
  });
  sh('npx jest --config jest-e2e.json --runInBand', {
    env: { ...process.env, DATABASE_URL: TEST_URL, NODE_ENV: 'test' },
  });
})();
