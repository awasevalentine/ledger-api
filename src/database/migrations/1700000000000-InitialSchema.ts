import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await q.query(`
      CREATE TABLE accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('asset','liability','income','expense','equity')),
        normal_side CHAR(2) NOT NULL CHECK (normal_side IN ('DR','CR')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE periods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        year_month CHAR(7) NOT NULL UNIQUE CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
        status TEXT NOT NULL CHECK (status IN ('open','closed')),
        closed_at TIMESTAMPTZ
      )
    `);

    await q.query(`
      CREATE TABLE journal_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_date DATE NOT NULL,
        memo TEXT,
        reference_type TEXT,
        reference_id UUID,
        reverses_entry_id UUID REFERENCES journal_entries(id),
        posted_in_period CHAR(7) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await q.query(`CREATE INDEX idx_entries_date ON journal_entries(entry_date)`);
    await q.query(`CREATE INDEX idx_entries_reverses ON journal_entries(reverses_entry_id)`);
    await q.query(`CREATE INDEX idx_entries_reference ON journal_entries(reference_type, reference_id)`);

    await q.query(`
      CREATE TABLE journal_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_id UUID NOT NULL REFERENCES journal_entries(id),
        account_id UUID NOT NULL REFERENCES accounts(id),
        direction CHAR(2) NOT NULL CHECK (direction IN ('DR','CR')),
        amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await q.query(`CREATE INDEX idx_lines_entry ON journal_lines(entry_id)`);
    await q.query(`CREATE INDEX idx_lines_account ON journal_lines(account_id)`);

    await q.query(`
      CREATE TABLE loans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        principal_kobo BIGINT NOT NULL CHECK (principal_kobo > 0),
        annual_rate_bps INTEGER NOT NULL CHECK (annual_rate_bps >= 0),
        term_months INTEGER NOT NULL CHECK (term_months > 0 AND term_months <= 600),
        disbursement_date DATE NOT NULL,
        disbursement_entry_id UUID REFERENCES journal_entries(id),
        payment_sequence BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE instalments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        due_date DATE NOT NULL,
        opening_balance_kobo BIGINT NOT NULL CHECK (opening_balance_kobo >= 0),
        interest_kobo BIGINT NOT NULL CHECK (interest_kobo >= 0),
        principal_kobo BIGINT NOT NULL CHECK (principal_kobo >= 0),
        payment_kobo BIGINT NOT NULL CHECK (payment_kobo > 0),
        closing_balance_kobo BIGINT NOT NULL CHECK (closing_balance_kobo >= 0),
        interest_accrued BOOLEAN NOT NULL DEFAULT false,
        accrual_entry_id UUID REFERENCES journal_entries(id),
        UNIQUE (loan_id, sequence)
      )
    `);

    await q.query(`CREATE INDEX idx_instalments_loan_due ON instalments(loan_id, due_date, sequence)`);

    await q.query(`
      CREATE TABLE payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
        amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
        received_at DATE NOT NULL,
        sequence BIGINT NOT NULL,
        external_ref TEXT,
        status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','reversed')),
        entry_id UUID REFERENCES journal_entries(id),
        reversal_entry_id UUID REFERENCES journal_entries(id),
        reversed_at TIMESTAMPTZ,
        reversal_reason TEXT,
        idempotency_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (loan_id, sequence)
      )
    `);

    await q.query(`CREATE INDEX idx_payments_loan_received ON payments(loan_id, received_at, sequence)`);

    await q.query(`
      CREATE TABLE payment_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
        version INTEGER NOT NULL CHECK (version > 0),
        instalment_id UUID REFERENCES instalments(id),
        slot INTEGER NOT NULL CHECK (slot >= 0),
        penalty_kobo BIGINT NOT NULL DEFAULT 0 CHECK (penalty_kobo >= 0),
        fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
        interest_kobo BIGINT NOT NULL DEFAULT 0 CHECK (interest_kobo >= 0),
        principal_kobo BIGINT NOT NULL DEFAULT 0 CHECK (principal_kobo >= 0),
        unapplied_kobo BIGINT NOT NULL DEFAULT 0 CHECK (unapplied_kobo >= 0),
        is_current BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (payment_id, version, slot)
      )
    `);

    await q.query(`CREATE INDEX idx_alloc_current ON payment_allocations(payment_id) WHERE is_current`);

    await q.query(`
      CREATE TABLE idempotency_keys (
        key TEXT NOT NULL,
        scope TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_body JSONB NOT NULL,
        status_code INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, key)
      )
    `);

    await q.query(`
      CREATE TABLE reversal_audits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id UUID NOT NULL REFERENCES payments(id),
        reason TEXT,
        before_state JSONB NOT NULL,
        after_state JSONB NOT NULL,
        correcting_entry_ids JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE OR REPLACE FUNCTION fn_reject_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'table % is append-only (operation %)', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'check_violation';
      END;
      $$ LANGUAGE plpgsql
    `);

    await q.query(`CREATE TRIGGER trg_no_update_entries BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation()`);
    await q.query(`CREATE TRIGGER trg_no_delete_entries BEFORE DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation()`);
    await q.query(`CREATE TRIGGER trg_no_update_lines BEFORE UPDATE ON journal_lines FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation()`);
    await q.query(`CREATE TRIGGER trg_no_delete_lines BEFORE DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation()`);

    await q.query(`
      CREATE OR REPLACE FUNCTION fn_check_entry_balanced() RETURNS trigger AS $$
      DECLARE
        v_dr BIGINT;
        v_cr BIGINT;
        v_count INTEGER;
      BEGIN
        SELECT
          COALESCE(SUM(CASE WHEN direction = 'DR' THEN amount_kobo ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN direction = 'CR' THEN amount_kobo ELSE 0 END), 0),
          COUNT(*)
        INTO v_dr, v_cr, v_count
        FROM journal_lines
        WHERE entry_id = NEW.id;

        IF v_count < 2 THEN
          RAISE EXCEPTION 'journal entry % has fewer than 2 lines (got %)', NEW.id, v_count
            USING ERRCODE = 'check_violation';
        END IF;

        IF v_dr <> v_cr THEN
          RAISE EXCEPTION 'journal entry % is unbalanced: DR=% CR=%', NEW.id, v_dr, v_cr
            USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await q.query(`
      CREATE CONSTRAINT TRIGGER trg_entry_balanced
        AFTER INSERT ON journal_entries
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW
        EXECUTE FUNCTION fn_check_entry_balanced()
    `);

    await q.query(`
      CREATE OR REPLACE FUNCTION fn_reject_closed_period() RETURNS trigger AS $$
      DECLARE
        v_ym CHAR(7);
      BEGIN
        v_ym := to_char(NEW.entry_date, 'YYYY-MM');
        IF v_ym <> NEW.posted_in_period THEN
          RAISE EXCEPTION 'entry posted_in_period % does not match entry_date %', NEW.posted_in_period, NEW.entry_date
            USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (SELECT 1 FROM periods WHERE year_month = v_ym AND status = 'closed') THEN
          RAISE EXCEPTION 'cannot post entry dated % in closed period %', NEW.entry_date, v_ym
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await q.query(`
      CREATE TRIGGER trg_reject_closed_period
        BEFORE INSERT ON journal_entries
        FOR EACH ROW
        EXECUTE FUNCTION fn_reject_closed_period()
    `);

    await q.query(`
      CREATE OR REPLACE FUNCTION fn_reject_period_reopen() RETURNS trigger AS $$
      BEGIN
        IF OLD.status = 'closed' AND NEW.status = 'open' THEN
          RAISE EXCEPTION 'closed period % cannot be reopened', OLD.year_month
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await q.query(`
      CREATE TRIGGER trg_no_period_reopen
        BEFORE UPDATE ON periods
        FOR EACH ROW
        EXECUTE FUNCTION fn_reject_period_reopen()
    `);

    const accounts: Array<[string, string, string, 'DR' | 'CR']> = [
      ['CASH', 'Cash', 'asset', 'DR'],
      ['LOANS_RECEIVABLE', 'Loans Receivable', 'asset', 'DR'],
      ['INTEREST_RECEIVABLE', 'Interest Receivable', 'asset', 'DR'],
      ['INVOICE_RECEIVABLES', 'Invoice Receivables', 'asset', 'DR'],
      ['CLIENT_RECEIVABLE', 'Client Receivable', 'asset', 'DR'],
      ['INTEREST_INCOME', 'Interest Income', 'income', 'CR'],
      ['FEE_INCOME', 'Fee Income', 'income', 'CR'],
      ['PENALTY_INCOME', 'Penalty Income', 'income', 'CR'],
      ['CLIENT_PAYABLE', 'Client Payable', 'liability', 'CR'],
      ['UNAPPLIED_CREDIT', 'Unapplied Credit', 'liability', 'CR'],
    ];

    for (const [code, name, type, side] of accounts) {
      await q.query(
        `INSERT INTO accounts (code, name, type, normal_side) VALUES ($1, $2, $3, $4)`,
        [code, name, type, side],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS trg_no_period_reopen ON periods`);
    await q.query(`DROP TRIGGER IF EXISTS trg_reject_closed_period ON journal_entries`);
    await q.query(`DROP TRIGGER IF EXISTS trg_entry_balanced ON journal_entries`);
    await q.query(`DROP TRIGGER IF EXISTS trg_no_delete_lines ON journal_lines`);
    await q.query(`DROP TRIGGER IF EXISTS trg_no_update_lines ON journal_lines`);
    await q.query(`DROP TRIGGER IF EXISTS trg_no_delete_entries ON journal_entries`);
    await q.query(`DROP TRIGGER IF EXISTS trg_no_update_entries ON journal_entries`);
    await q.query(`DROP FUNCTION IF EXISTS fn_reject_period_reopen`);
    await q.query(`DROP FUNCTION IF EXISTS fn_reject_closed_period`);
    await q.query(`DROP FUNCTION IF EXISTS fn_check_entry_balanced`);
    await q.query(`DROP FUNCTION IF EXISTS fn_reject_mutation`);
    await q.query(`DROP TABLE IF EXISTS reversal_audits`);
    await q.query(`DROP TABLE IF EXISTS idempotency_keys`);
    await q.query(`DROP TABLE IF EXISTS payment_allocations`);
    await q.query(`DROP TABLE IF EXISTS payments`);
    await q.query(`DROP TABLE IF EXISTS instalments`);
    await q.query(`DROP TABLE IF EXISTS loans`);
    await q.query(`DROP TABLE IF EXISTS journal_lines`);
    await q.query(`DROP TABLE IF EXISTS journal_entries`);
    await q.query(`DROP TABLE IF EXISTS periods`);
    await q.query(`DROP TABLE IF EXISTS accounts`);
  }
}
