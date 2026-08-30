import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';

describe('GET /health', () => {
  it('reports that the API is available', async () => {
    const app = createApp();
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('reports that the API and database are ready', async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ database: { check } });

    const response = await request(app).get('/ready').expect(200);

    expect(check).toHaveBeenCalledOnce();
    expect(response.body).toEqual({ status: 'ready', database: 'up' });
  });

  it('does not expose database errors when the check fails', async () => {
    const check = vi.fn().mockRejectedValue(new Error('connection details'));
    const app = createApp({ database: { check } });

    const response = await request(app).get('/ready').expect(503);

    expect(response.body).toEqual({
      status: 'unavailable',
      database: 'down',
    });
    expect(JSON.stringify(response.body)).not.toContain('connection details');
  });
});

describe('CORS', () => {
  it('allows a configured frontend origin with credentials', async () => {
    const app = createApp({
      allowedOrigins: ['http://localhost:5173'],
    });

    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects an origin outside the configured allowlist', async () => {
    const app = createApp({
      allowedOrigins: ['http://localhost:5173'],
    });

    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://untrusted.example')
      .expect(403);

    expect(response.body).toEqual({ error: 'origin_not_allowed' });
  });
});
