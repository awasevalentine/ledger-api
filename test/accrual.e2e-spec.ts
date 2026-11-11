import request from 'supertest';
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

describe('POST /jobs/accrue', () => {
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

  it('accrues only the instalments due by asOf', async () => {
    const loan = await createLoan(h);

    const res = await request(h.app.getHttpServer())
      .post('/jobs/accrue?asOf=2026-02-15')
      .expect(200);

    expect(res.body.accruedCount).toBe(1);

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const ir = tb.body.rows.find((r: any) => r.accountCode === 'INTEREST_RECEIVABLE');
    expect(ir.debitsKobo).toBe(loan.schedule[0].interestKobo);

    const second = await request(h.app.getHttpServer())
      .post('/jobs/accrue?asOf=2026-02-15')
      .expect(200);
    expect(second.body.accruedCount).toBe(0);
  });

  it('accrues all six by end of term', async () => {
    const loan = await createLoan(h);
    const res = await request(h.app.getHttpServer())
      .post('/jobs/accrue?asOf=2026-07-15')
      .expect(200);
    expect(res.body.accruedCount).toBe(6);

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const ir = tb.body.rows.find((r: any) => r.accountCode === 'INTEREST_RECEIVABLE');
    expect(ir.debitsKobo).toBe(loan.totalInterestKobo);
  });
});
