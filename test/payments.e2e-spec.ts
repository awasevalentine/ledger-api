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

describe('POST /loans/:id/payments', () => {
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

  it('requires an Idempotency-Key header', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer())
      .post(`/loans/${loan.id}/payments`)
      .send({ amountKobo: '21063026', receivedAt: '2026-02-01' })
      .expect(400);
  });

  it('clears instalment 1 after accrual with a matching payment', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const res = await request(h.app.getHttpServer())
      .post(`/loans/${loan.id}/payments`)
      .set('Idempotency-Key', randomUUID())
      .send({ amountKobo: '21063026', receivedAt: '2026-02-01' })
      .expect(201);

    expect(res.body.allocations).toHaveLength(1);
    expect(res.body.allocations[0].interestKobo).toBe('1800000');
    expect(res.body.allocations[0].principalKobo).toBe('19263026');
    expect(res.body.allocations[0].unappliedKobo).toBe('0');
  });

  it('parks overpayment on instalment 1 (nothing else due) as unapplied credit', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const res = await request(h.app.getHttpServer())
      .post(`/loans/${loan.id}/payments`)
      .set('Idempotency-Key', randomUUID())
      .send({ amountKobo: '50000000', receivedAt: '2026-02-01' })
      .expect(201);

    const last = res.body.allocations.at(-1);
    expect(last.unappliedKobo).toBe('28936974');
  });

  it('returns the original response when retried with the same key and body', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const key = randomUUID();
    const body = { amountKobo: '21063026', receivedAt: '2026-02-01' };

    const first = await request(h.app.getHttpServer())
      .post(`/loans/${loan.id}/payments`)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    const second = await request(h.app.getHttpServer())
      .post(`/loans/${loan.id}/payments`)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it('rejects a reused idempotency key with a different body', async () => {
    const loan = await createLoan(h);
    await request(h.app.getHttpServer()).post('/jobs/accrue?asOf=2026-02-01').expect(200);

    const key = randomUUID();

    await request(h.app.getHttpServer())
      .post(`/loans/${loan.id}/payments`)
      .set('Idempotency-Key', key)
      .send({ amountKobo: '1000000', receivedAt: '2026-02-01' })
      .expect(201);

    await request(h.app.getHttpServer())
      .post(`/loans/${loan.id}/payments`)
      .set('Idempotency-Key', key)
      .send({ amountKobo: '2000000', receivedAt: '2026-02-01' })
      .expect(409);
  });
});
