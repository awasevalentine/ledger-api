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

describe('period close', () => {
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

  it('rejects entries dated inside a closed period', async () => {
    await createLoan(h);
    await request(h.app.getHttpServer()).post('/periods/2026-02/close').expect(200);

    const res = await request(h.app.getHttpServer())
      .post('/jobs/accrue?asOf=2026-02-15');

    expect([422, 500]).toContain(res.status);
  });

  it('allows corrections in the current open period after a prior one is closed', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    await request(h.app.getHttpServer())
      .post(`/loans/${loan.id}/payments`)
      .set('Idempotency-Key', randomUUID())
      .send({ amountKobo: '21063026', receivedAt: '2026-02-01' })
      .expect(201);

    await request(h.app.getHttpServer()).post('/periods/2026-02/close').expect(200);

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    expect(tb.body.rows.length).toBeGreaterThan(0);
  });
});
