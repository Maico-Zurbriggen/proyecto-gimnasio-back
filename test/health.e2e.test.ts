import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('GET /health', () => {
  it('reports that the API is available', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
