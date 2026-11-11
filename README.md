# Production Ledger

A lending ledger for invoice financing and term loans, built with NestJS, TypeORM and Postgres. Money is stored as integer kobo (bigint). Balance, immutability, idempotency and period close are enforced in the database as well as in application code.

## Running

```bash
# 1. Start Postgres (binds to host port 55432 to avoid clashes)
docker compose up -d db

# 2. Install dependencies and start the API
npm install
npm run start:dev

# Or run everything in containers
docker compose up --build
```

Migrations run automatically on first boot (`migrationsRun: true` in the TypeORM config). Set `AUTO_MIGRATE=false` to disable and run them manually with `npm run migration:run`.

## One command: run every test

```bash
npm test
```

This script boots Postgres via Docker Compose, creates a clean `ledger_test` database, applies migrations and runs the unit suite followed by the end-to-end suite (including the two 50-way concurrency tests).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/loans` | Create a term loan, build the schedule and post the disbursement entry |
| GET | `/loans/:id` | Return a loan with its schedule |
| POST | `/invoices/quote` | Quote advance, reserve, fee, penalty and client payable or shortfall |
| POST | `/invoices` | Create an invoice facility and post the advance entry |
| GET | `/invoices/:id` | Return an invoice with its posting state |
| POST | `/invoices/:id/settle` | Settle on the debtor payment date; posts the settlement entry per the posting rules |
| POST | `/loans/:id/payments` | Apply a payment with the oldest-unpaid-first waterfall. Requires `Idempotency-Key` |
| POST | `/payments/:id/reverse` | Reverse a payment (full, or partial via `amountKobo`). LIFO within current allocations; later payments are re-allocated |
| POST | `/jobs/accrue?asOf=YYYY-MM-DD` | Accrue interest for every due un-accrued instalment |
| POST | `/ledger/entries/:id/reverse` | Post a linked reversing journal entry |
| GET | `/ledger/trial-balance` | Per-account debits, credits and net |
| POST | `/periods/:yyyy-mm/close` | Close a period. Later back-dated inserts are rejected by trigger |
| GET | `/periods` | List periods |
| GET | `/reconciliation` | Prove that loan-level balances equal control accounts |

## Repository layout

```
src/
  database/          migrations, entities, bigint transformer, data source
  money/             kobo (bigint) math, half-up rounding, date helpers
  domain/            amortization, invoice quote
  ledger/            post, reverse, trial balance
  loans/             POST /loans
  invoices/          POST /invoices/quote
  payments/          create, waterfall allocation, reversal + re-allocation
  jobs/              accrual job
  periods/           period close
  reconciliation/    control account vs loan-level proof
  common/            bigint JSON, idempotency helpers, exception filter
test/                e2e specs (one per surface, plus concurrency)
```
