import request from 'supertest';
import { createHarness, Harness } from './test-app';

describe('POST /loans (worked example 1)', () => {
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

  it('builds a schedule matching the brief to the kobo and posts the disbursement entry', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/loans')
      .send({
        principalKobo: '120000000',
        annualRateBps: 1800,
        termMonths: 6,
        disbursementDate: '2026-01-01',
      })
      .expect(201);

    expect(res.body.instalmentKobo).toBe('21063026');
    expect(res.body.totalInterestKobo).toBe('6378154');
    expect(res.body.schedule).toHaveLength(6);

    const last = res.body.schedule[5];
    expect(last.paymentKobo).toBe('21063024');
    expect(last.closingBalanceKobo).toBe('0');

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const lr = tb.body.rows.find((r: any) => r.accountCode === 'LOANS_RECEIVABLE');
    expect(lr.debitsKobo).toBe('120000000');
    const cash = tb.body.rows.find((r: any) => r.accountCode === 'CASH');
    expect(cash.creditsKobo).toBe('120000000');
  });

  it('rejects an unbalanced loan request', async () => {
    await request(h.app.getHttpServer())
      .post('/loans')
      .send({ principalKobo: 'abc', annualRateBps: 1800, termMonths: 6, disbursementDate: '2026-01-01' })
      .expect(400);
  });
});
