import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

/** Plantilla versionada del entorno, resuelta desde este fichero y no desde el cwd. */
const envExampleUrl = new URL('../../.env.example', import.meta.url);

const jwtSecret = 'dev-only-jwt-secret-0123456789abcdef';

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/calendarschool',
  JWT_SECRET: jwtSecret,
  APP_ORIGIN: 'http://localhost:5173',
};

describe('loadConfig', () => {
  it('returns a typed config when every variable is valid', () => {
    const config = loadConfig(validEnv);

    expect(config).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
      databaseUrl: 'postgresql://user:secret@localhost:5432/calendarschool',
      jwtSecret,
      appOrigin: 'http://localhost:5173',
      trustProxyHops: 0,
      registrationAttemptsMax: 5,
    });
  });

  it('applies defaults for optional variables', () => {
    const config = loadConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      JWT_SECRET: validEnv.JWT_SECRET,
      APP_ORIGIN: validEnv.APP_ORIGIN,
    });

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
  });

  it('fails naming DATABASE_URL when it is missing', () => {
    const { DATABASE_URL: _omitted, ...env } = validEnv;

    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it('fails when DATABASE_URL is not a PostgreSQL URL', () => {
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('fails naming PORT when it is not a valid port number', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...validEnv, PORT: '70000' })).toThrow(/PORT/);
  });

  it('fails naming NODE_ENV and LOG_LEVEL when they are not allowed values', () => {
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('never includes the value of an invalid variable in the error', () => {
    const secretUrl = 'not-a-url-with-password-s3cr3t';

    expect(() => loadConfig({ ...validEnv, DATABASE_URL: secretUrl })).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining('s3cr3t') }),
    );
  });

  it('lists every invalid variable in a single error', () => {
    try {
      loadConfig({ PORT: 'abc' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).invalidVariables).toEqual([
        'APP_ORIGIN',
        'DATABASE_URL',
        'JWT_SECRET',
        'PORT',
      ]);
    }
  });

  describe('session settings', () => {
    it('fails naming JWT_SECRET when it is missing', () => {
      const { JWT_SECRET: _omitted, ...env } = validEnv;

      expect(() => loadConfig(env)).toThrow(/JWT_SECRET/);
    });

    it('fails naming JWT_SECRET when it is shorter than 32 characters, without its value', () => {
      const shortSecret = 'short-secret-s3cr3t-0123456789x';
      expect(shortSecret).toHaveLength(31);

      expect(() => loadConfig({ ...validEnv, JWT_SECRET: shortSecret })).toThrow(/JWT_SECRET/);
      expect(() => loadConfig({ ...validEnv, JWT_SECRET: shortSecret })).toThrow(
        expect.not.objectContaining({ message: expect.stringContaining('s3cr3t') }),
      );
    });

    it('accepts a JWT_SECRET of exactly 32 characters', () => {
      const secret = 'a'.repeat(32);

      expect(loadConfig({ ...validEnv, JWT_SECRET: secret }).jwtSecret).toBe(secret);
    });

    it.each([
      ['without scheme', 'localhost:5173'],
      ['with a path', 'http://localhost:5173/app'],
      ['with a query', 'http://localhost:5173?x=1'],
      ['with another scheme', 'ftp://localhost:5173'],
      ['that is not a URL', 'not a url'],
    ])('fails naming APP_ORIGIN when it is a URL %s', (_case, appOrigin) => {
      expect(() => loadConfig({ ...validEnv, APP_ORIGIN: appOrigin })).toThrow(/APP_ORIGIN/);
    });

    it('normalizes APP_ORIGIN to its origin', () => {
      expect(
        loadConfig({ ...validEnv, APP_ORIGIN: 'https://App.Example.com:443/' }).appOrigin,
      ).toBe('https://app.example.com');
    });
  });

  describe('attempt limiting settings', () => {
    it('defaults to no trusted proxies and 5 registration attempts', () => {
      const config = loadConfig(validEnv);

      expect(config.trustProxyHops).toBe(0);
      expect(config.registrationAttemptsMax).toBe(5);
    });

    it('accepts explicit values', () => {
      const config = loadConfig({
        ...validEnv,
        TRUST_PROXY_HOPS: '2',
        REGISTRATION_ATTEMPTS_MAX: '1000',
      });

      expect(config.trustProxyHops).toBe(2);
      expect(config.registrationAttemptsMax).toBe(1000);
    });

    it.each(['-1', 'abc', '1.5'])('fails naming TRUST_PROXY_HOPS when it is %s', (value) => {
      expect(() => loadConfig({ ...validEnv, TRUST_PROXY_HOPS: value })).toThrow(
        /TRUST_PROXY_HOPS/,
      );
    });

    it.each(['0', '-3', 'abc', '2.5'])(
      'fails naming REGISTRATION_ATTEMPTS_MAX when it is %s',
      (value) => {
        expect(() => loadConfig({ ...validEnv, REGISTRATION_ATTEMPTS_MAX: value })).toThrow(
          /REGISTRATION_ATTEMPTS_MAX/,
        );
      },
    );

    it('accepts a trusted proxy count of exactly 0 and an attempt maximum of exactly 1', () => {
      const config = loadConfig({
        ...validEnv,
        TRUST_PROXY_HOPS: '0',
        REGISTRATION_ATTEMPTS_MAX: '1',
      });

      expect(config.trustProxyHops).toBe(0);
      expect(config.registrationAttemptsMax).toBe(1);
    });
  });

  it('documents both settings, commented out with their defaults, in the .env.example template', () => {
    const template = readFileSync(envExampleUrl, 'utf8');

    expect(template).toMatch(/^# TRUST_PROXY_HOPS=0$/m);
    expect(template).toMatch(/^# REGISTRATION_ATTEMPTS_MAX=5$/m);
  });

  it('accepts the versioned .env.example template', () => {
    const template = parseEnv(readFileSync(envExampleUrl, 'utf8'));

    const config = loadConfig(template);

    expect(config.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.appOrigin).toBe('http://localhost:5173');
  });
});
