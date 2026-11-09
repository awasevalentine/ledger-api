import { MigrationInterface, QueryRunner } from 'typeorm';

export class Invoices1700000001000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        face_value_kobo BIGINT NOT NULL CHECK (face_value_kobo > 0),
        advance_kobo BIGINT NOT NULL CHECK (advance_kobo > 0),
        reserve_kobo BIGINT NOT NULL CHECK (reserve_kobo >= 0),
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'advanced' CHECK (status IN ('advanced','settled')),
        advance_entry_id UUID REFERENCES journal_entries(id),
        settlement_entry_id UUID REFERENCES journal_entries(id),
        settled_at DATE,
        discount_fee_kobo BIGINT CHECK (discount_fee_kobo IS NULL OR discount_fee_kobo >= 0),
        late_penalty_kobo BIGINT CHECK (late_penalty_kobo IS NULL OR late_penalty_kobo >= 0),
        amount_received_kobo BIGINT CHECK (amount_received_kobo IS NULL OR amount_received_kobo > 0),
        payable_to_client_kobo BIGINT CHECK (payable_to_client_kobo IS NULL OR payable_to_client_kobo >= 0),
        client_shortfall_kobo BIGINT CHECK (client_shortfall_kobo IS NULL OR client_shortfall_kobo >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_invoices_status ON invoices(status, due_date)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS invoices`);
  }
}
