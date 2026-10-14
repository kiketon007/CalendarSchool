import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface CloudFrontRequest {
  uri: string;
  method: string;
  headers: Record<string, { value: string }>;
}
interface CloudFrontResponse {
  statusCode: number;
  statusDescription: string;
  headers: Record<string, { value: string }>;
  body: string;
}
type Handler = (event: { request: CloudFrontRequest }) => CloudFrontRequest | CloudFrontResponse;

/** Evalúa el código fuente de una CloudFront Function y devuelve su `handler`, como el runtime. */
function loadHandler(file: string): Handler {
  const source = readFileSync(new URL(`../functions/${file}`, import.meta.url), 'utf8');
  return runInNewContext(`${source}
handler;`) as Handler;
}

function run(handler: Handler, uri: string, method = 'GET') {
  const request: CloudFrontRequest = { uri, method, headers: {} };
  return handler({ request });
}

describe('spa-rewrite', () => {
  const handler = loadHandler('spaRewrite.js');

  it.each(['/', '/registro', '/onboarding', '/privacidad', '/registro/', '/a/b/c'])(
    'rewrites the route %s to /index.html',
    (uri) => {
      expect(run(handler, uri)).toMatchObject({ uri: '/index.html' });
    },
  );

  it.each([
    '/index.html',
    '/assets/index-3f9a.js',
    '/assets/style.css',
    '/favicon.ico',
    '/x/y.png',
  ])('leaves the file %s as it is', (uri) => {
    expect(run(handler, uri)).toMatchObject({ uri });
  });

  it('leaves /api/ paths alone', () => {
    expect(run(handler, '/api/health')).toMatchObject({ uri: '/api/health' });
  });

  it('keeps the rest of the request', () => {
    const request: CloudFrontRequest = {
      uri: '/registro',
      method: 'GET',
      headers: { a: { value: 'b' } },
    };

    expect(handler({ request })).toEqual({ ...request, uri: '/index.html' });
  });
});

describe('api-guard', () => {
  const handler = loadHandler('apiGuard.js');

  it.each(['/api/auth/register', '/api/auth/refresh', '/api/auth/', '/api/auth'])(
    'answers 404 NOT_FOUND in the common JSON format to %s',
    (uri) => {
      const response = run(handler, uri, 'POST') as CloudFrontResponse;

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']?.value).toBe('application/json');
      expect(JSON.parse(response.body)).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: expect.any(String) as string },
      });
    },
  );

  it.each([
    ['uppercase', '/api/AUTH/register'],
    ['mixed case', '/api/Auth/refresh'],
    ['percent-encoded', '/api/%61uth/register'],
    ['with repeated slashes', '/api//auth/register'],
  ])('also closes /api/auth written %s', (_case, uri) => {
    expect((run(handler, uri, 'POST') as CloudFrontResponse).statusCode).toBe(404);
  });

  it.each(['/api/health', '/api/municipalities', '/api/authors', '/api/authentication/x'])(
    'lets %s through to the API',
    (uri) => {
      expect(run(handler, uri)).toMatchObject({ uri, method: 'GET' });
    },
  );

  it('does not fail with an invalid percent-encoding', () => {
    expect(run(handler, '/api/%E0%A4%A')).toMatchObject({ uri: '/api/%E0%A4%A' });
  });
});
