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

async function pay(h: Harness, loanId: string, amount: string, receivedAt: string) {
  return request(h.app.getHttpServer())
    .post(`/loans/${loanId}/payments`)
    .set('Idempotency-Key', randomUUID())
    .send({ amountKobo: amount, receivedAt })
    .expect(201);
}

describe('partial payment reversal', () => {
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

  it('reverses principal before interest when reducing an overpayment-free payment', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const p = await pay(h, loan.id, '21063026', '2026-02-01');

    const res = await request(h.app.getHttpServer())
      .post(`/payments/${p.body.id}/reverse`)
      .send({ amountKobo: '500000', effectiveDate: '2026-02-05' })
      .expect(201);

    expect(res.body.mode).toBe('partial');
    expect(res.body.reverseAmountKobo).toBe('500000');

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const lr = tb.body.rows.find((r: any) => r.accountCode === 'LOANS_RECEIVABLE');
    expect(lr.netKobo).toBe((120_000_000n - (19_263_026n - 500_000n)).toString());
    const ir = tb.body.rows.find((r: any) => r.accountCode === 'INTEREST_RECEIVABLE');
    expect(ir.netKobo).toBe('0');

    const totalDr = tb.body.rows.reduce((s: bigint, r: any) => s + BigInt(r.debitsKobo), 0n);
    const totalCr = tb.body.rows.reduce((s: bigint, r: any) => s + BigInt(r.creditsKobo), 0n);
    expect(totalDr).toBe(totalCr);

    const view = await request(h.app.getHttpServer()).get(`/loans/${loan.id}`).expect(200);
    expect(view.body.schedule[0].status).toBe('UNPAID');
  });

  it('reverses from unapplied credit first when present', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const p = await pay(h, loan.id, '50000000', '2026-02-01');

    const res = await request(h.app.getHttpServer())
      .post(`/payments/${p.body.id}/reverse`)
      .send({ amountKobo: '10000000', effectiveDate: '2026-02-05' })
      .expect(201);

    expect(res.body.mode).toBe('partial');

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const unapplied = tb.body.rows.find((r: any) => r.accountCode === 'UNAPPLIED_CREDIT');
    expect(unapplied.netKobo).toBe('18936974');
    const lr = tb.body.rows.find((r: any) => r.accountCode === 'LOANS_RECEIVABLE');
    expect(lr.netKobo).toBe('100736974');
  });

  it('full-remainder reversal via amountKobo marks the payment reversed', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const p = await pay(h, loan.id, '21063026', '2026-02-01');

    const res = await request(h.app.getHttpServer())
      .post(`/payments/${p.body.id}/reverse`)
      .send({ amountKobo: '21063026', effectiveDate: '2026-02-05' })
      .expect(201);

    expect(res.body.mode).toBe('full');

    await request(h.app.getHttpServer())
      .post(`/payments/${p.body.id}/reverse`)
      .send({ effectiveDate: '2026-02-06' })
      .expect(409);
  });

  it('rejects an amount larger than the remaining payment', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const p = await pay(h, loan.id, '21063026', '2026-02-01');

    await request(h.app.getHttpServer())
      .post(`/payments/${p.body.id}/reverse`)
      .send({ amountKobo: '99999999999', effectiveDate: '2026-02-05' })
      .expect(400);
  });

  it('two sequential partials sum to the original amount and settle the payment', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const p = await pay(h, loan.id, '21063026', '2026-02-01');

    await request(h.app.getHttpServer())
      .post(`/payments/${p.body.id}/reverse`)
      .send({ amountKobo: '1000000', effectiveDate: '2026-02-05' })
      .expect(201);

    await request(h.app.getHttpServer())
      .post(`/payments/${p.body.id}/reverse`)
      .send({ amountKobo: '20063026', effectiveDate: '2026-02-06' })
      .expect(201);

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const lr = tb.body.rows.find((r: any) => r.accountCode === 'LOANS_RECEIVABLE');
    expect(lr.netKobo).toBe('120000000');
    const totalDr = tb.body.rows.reduce((s: bigint, r: any) => s + BigInt(r.debitsKobo), 0n);
    const totalCr = tb.body.rows.reduce((s: bigint, r: any) => s + BigInt(r.creditsKobo), 0n);
    expect(totalDr).toBe(totalCr);
  });
});
