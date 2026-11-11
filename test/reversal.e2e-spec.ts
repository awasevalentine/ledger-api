import request from 'supertest';
import { randomUUID } from 'crypto';
import { createHarness, Harness } from './test-app';

async function createLoan(h: Harness) {
  const res = await request(h.app.getHttpServer())
    .post('/loans')
    .send({
      principalKobo: '120000000',
      annualRateBps: 1800,
      termMonths: 6,
      disbursementDate: '2026-01-01',
    })
    .expect(201);
  return res.body;
}

async function pay(h: Harness, loanId: string, amount: string, receivedAt: string) {
  return request(h.app.getHttpServer())
    .post(`/loans/${loanId}/payments`)
    .set('Idempotency-Key', randomUUID())
    .send({ amountKobo: amount, receivedAt })
    .expect(201);
}

describe('payment reversal (visible scenario)', () => {
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

  it('reversing X moves Y onto instalment 1 and posts correcting entries', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-03-01').expect(200);

    const payX = await pay(h, loan.id, '21063026', '2026-02-01');
    const payY = await pay(h, loan.id, '21063026', '2026-03-01');

    const yAllocBefore = payY.body.allocations[0];
    expect(yAllocBefore.interestKobo).toBe('1511055');
    expect(yAllocBefore.principalKobo).toBe('19551971');

    const rev = await request(h.app.getHttpServer())
      .post(`/payments/${payX.body.id}/reverse`)
      .send({ reason: 'bounced cheque', effectiveDate: '2026-03-02' })
      .expect(201);

    expect(rev.body.reversalEntryId).toBeDefined();
    expect(rev.body.correctingEntryIds.length).toBeGreaterThanOrEqual(1);
    expect(rev.body.reallocatedPayments).toHaveLength(1);
    expect(rev.body.reallocatedPayments[0].paymentId).toBe(payY.body.id);
    expect(rev.body.reallocatedPayments[0].afterSummary.interest).toBe('1800000');
    expect(rev.body.reallocatedPayments[0].afterSummary.principal).toBe('19263026');

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const lr = tb.body.rows.find((r: any) => r.accountCode === 'LOANS_RECEIVABLE');
    expect(lr.netKobo).toBe('100736974');
    const ir = tb.body.rows.find((r: any) => r.accountCode === 'INTEREST_RECEIVABLE');
    expect(ir.netKobo).toBe('1511055');

    const rows = tb.body.rows.map((r: any) => ({ dr: BigInt(r.debitsKobo), cr: BigInt(r.creditsKobo) }));
    const totalDr = rows.reduce((s: bigint, r: any) => s + r.dr, 0n);
    const totalCr = rows.reduce((s: bigint, r: any) => s + r.cr, 0n);
    expect(totalDr).toBe(totalCr);

    const recon = await request(h.app.getHttpServer()).get('/reconciliation').expect(200);
    expect(recon.body.balanced).toBe(true);

    await request(h.app.getHttpServer())
      .post(`/payments/${payX.body.id}/reverse`)
      .send({ reason: 'again', effectiveDate: '2026-03-03' })
      .expect(409);

    const view = await request(h.app.getHttpServer()).get(`/loans/${loan.id}`).expect(200);
    expect(view.body.schedule[0].status).toBe('PAID');
    expect(view.body.schedule[1].status).toBe('UNPAID');
  });
});
