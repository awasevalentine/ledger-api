import request from 'supertest';
import { randomUUID } from 'crypto';
import { createHarness, Harness } from './test-app';

async function createLoan(h: Harness) {
  return (
    await request(h.app.getHttpServer())
      .post('/loans')
      .send({
        principalKobo: '120000000',
        annualRateBps: 1800,
        termMonths: 6,
        disbursementDate: '2026-01-01',
      })
      .expect(201)
  ).body;
}

describe('concurrency', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.reset();
  });

  it('50 parallel different-key payments apply as if serialised', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const server = h.app.getHttpServer();
    const results = await Promise.all(
      Array.from({ length: 50 }).map(() =>
        request(server)
          .post(`/loans/${loan.id}/payments`)
          .set('Idempotency-Key', randomUUID())
          .send({ amountKobo: '1000000', receivedAt: '2026-02-01' }),
      ),
    );

    for (const r of results) {
      expect(r.status).toBe(201);
    }

    const { rows: paymentRows } = await h.ds.query(
      `SELECT COUNT(*)::text AS count FROM payments WHERE loan_id = $1 AND status = 'applied'`,
      [loan.id],
    ).then((r: any) => ({ rows: r }));
    expect(paymentRows[0].count).toBe('50');

    const totals: Array<{ interest: string; principal: string; unapplied: string }> = await h.ds.query(
      `SELECT COALESCE(SUM(a.interest_kobo), 0)::text AS interest,
              COALESCE(SUM(a.principal_kobo), 0)::text AS principal,
              COALESCE(SUM(a.unapplied_kobo), 0)::text AS unapplied
       FROM payment_allocations a
       JOIN payments p ON p.id = a.payment_id
       WHERE p.loan_id = $1 AND a.is_current = TRUE AND p.status = 'applied'`,
      [loan.id],
    );
    expect(totals[0]!.interest).toBe('1800000');
    expect(totals[0]!.principal).toBe('19263026');
    expect(totals[0]!.unapplied).toBe('28936974');

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const totalDr = tb.body.rows.reduce((s: bigint, r: any) => s + BigInt(r.debitsKobo), 0n);
    const totalCr = tb.body.rows.reduce((s: bigint, r: any) => s + BigInt(r.creditsKobo), 0n);
    expect(totalDr).toBe(totalCr);

    const recon = await request(h.app.getHttpServer()).get('/reconciliation').expect(200);
    expect(recon.body.balanced).toBe(true);
  }, 60_000);

  it('50 simultaneous requests with the same idempotency key produce exactly one payment', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const server = h.app.getHttpServer();
    const key = randomUUID();
    const body = { amountKobo: '21063026', receivedAt: '2026-02-01' };

    const results = await Promise.all(
      Array.from({ length: 50 }).map(() =>
        request(server)
          .post(`/loans/${loan.id}/payments`)
          .set('Idempotency-Key', key)
          .send(body),
      ),
    );

    for (const r of results) {
      expect([200, 201]).toContain(r.status);
    }
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(1);

    const rows: Array<{ count: string }> = await h.ds.query(
      `SELECT COUNT(*)::text AS count FROM payments WHERE loan_id = $1`,
      [loan.id],
    );
    expect(rows[0]!.count).toBe('1');

    const entries: Array<{ count: string }> = await h.ds.query(
      `SELECT COUNT(*)::text AS count FROM journal_entries WHERE reference_type = 'payment'`,
    );
    expect(entries[0]!.count).toBe('1');
  }, 60_000);
});
