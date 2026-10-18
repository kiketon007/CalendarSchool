import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadConfigOrLog } from './config.js';
import { createLogger } from './logger.js';

/** Plantilla versionada del entorno, resuelta desde este fichero y no desde el cwd. */
const envExampleUrl = new URL('../../.env.example', import.meta.url);

const jwtSecret = 'dev-only-jwt-secret-0123456789abcdef';

const originVerifySecret = 'origin-verify-secret-0123456789abcdef';

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
      loginAttemptsMax: 10,
      invitationAttemptsMax: 10,
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
    it('defaults to no trusted proxies, 5 registration attempts, 10 failed login attempts and 10 invalid invitation links', () => {
      const config = loadConfig(validEnv);

      expect(config.trustProxyHops).toBe(0);
      expect(config.registrationAttemptsMax).toBe(5);
      expect(config.loginAttemptsMax).toBe(10);
      expect(config.invitationAttemptsMax).toBe(10);
    });

    it('accepts explicit values', () => {
      const config = loadConfig({
        ...validEnv,
        TRUST_PROXY_HOPS: '2',
        REGISTRATION_ATTEMPTS_MAX: '1000',
        LOGIN_ATTEMPTS_MAX: '1000',
        INVITATION_ATTEMPTS_MAX: '1000',
      });

      expect(config.trustProxyHops).toBe(2);
      expect(config.registrationAttemptsMax).toBe(1000);
      expect(config.loginAttemptsMax).toBe(1000);
      expect(config.invitationAttemptsMax).toBe(1000);
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

    it.each(['0', '-3', 'abc', '2.5'])('fails naming LOGIN_ATTEMPTS_MAX when it is %s', (value) => {
      expect(() => loadConfig({ ...validEnv, LOGIN_ATTEMPTS_MAX: value })).toThrow(
        /LOGIN_ATTEMPTS_MAX/,
      );
    });

    it.each(['0', '-3', 'abc', '2.5'])(
      'fails naming INVITATION_ATTEMPTS_MAX when it is %s',
      (value) => {
        expect(() => loadConfig({ ...validEnv, INVITATION_ATTEMPTS_MAX: value })).toThrow(
          /INVITATION_ATTEMPTS_MAX/,
        );
      },
    );

    it('accepts a trusted proxy count of exactly 0 and an attempt maximum of exactly 1', () => {
      const config = loadConfig({
        ...validEnv,
        TRUST_PROXY_HOPS: '0',
        REGISTRATION_ATTEMPTS_MAX: '1',
        LOGIN_ATTEMPTS_MAX: '1',
        INVITATION_ATTEMPTS_MAX: '1',
      });

      expect(config.trustProxyHops).toBe(0);
      expect(config.registrationAttemptsMax).toBe(1);
      expect(config.loginAttemptsMax).toBe(1);
      expect(config.invitationAttemptsMax).toBe(1);
    });
  });

  describe('reCAPTCHA settings', () => {
    const secrets = {
      RECAPTCHA_V3_SECRET: 'v3-secret-value',
      RECAPTCHA_V2_SECRET: 'v2-secret-value',
    };

    it('has no reCAPTCHA configuration without secrets outside production', () => {
      expect(loadConfig(validEnv).recaptcha).toBeUndefined();
      expect(loadConfig({ ...validEnv, NODE_ENV: 'test' }).recaptcha).toBeUndefined();
    });

    it('exposes both secrets when both are defined', () => {
      const config = loadConfig({ ...validEnv, ...secrets });

      expect(config.recaptcha).toEqual({
        v3Secret: 'v3-secret-value',
        v2Secret: 'v2-secret-value',
      });
    });

    it('fails naming the missing secret when only one is defined', () => {
      expect(() => loadConfig({ ...validEnv, RECAPTCHA_V3_SECRET: 'v3-secret-value' })).toThrow(
        /RECAPTCHA_V2_SECRET/,
      );
      expect(() => loadConfig({ ...validEnv, RECAPTCHA_V2_SECRET: 'v2-secret-value' })).toThrow(
        /RECAPTCHA_V3_SECRET/,
      );
    });

    it('fails naming both secrets in production without them, without showing any value', () => {
      const error = (() => {
        try {
          loadConfig({ ...validEnv, NODE_ENV: 'production' });
        } catch (e) {
          return e as ConfigError;
        }
        return undefined;
      })();

      expect(error).toBeInstanceOf(ConfigError);
      expect(error?.invalidVariables).toEqual([
        'ORIGIN_VERIFY_SECRET',
        'RECAPTCHA_V2_SECRET',
        'RECAPTCHA_V3_SECRET',
      ]);
      expect(error?.message).not.toContain(jwtSecret);
    });

    it('accepts production with both secrets', () => {
      const config = loadConfig({
        ...validEnv,
        NODE_ENV: 'production',
        ORIGIN_VERIFY_SECRET: originVerifySecret,
        ...secrets,
      });

      expect(config.nodeEnv).toBe('production');
      expect(config.recaptcha).toBeDefined();
    });

    it('fails naming a secret that is empty, without showing its value', () => {
      expect(() => loadConfig({ ...validEnv, ...secrets, RECAPTCHA_V3_SECRET: '' })).toThrow(
        /RECAPTCHA_V3_SECRET/,
      );
      expect(() => loadConfig({ ...validEnv, ...secrets, RECAPTCHA_V3_SECRET: '' })).toThrow(
        expect.not.objectContaining({ message: expect.stringContaining('v2-secret') }),
      );
    });
  });

  describe('origin verification settings', () => {
    const productionEnv = {
      ...validEnv,
      NODE_ENV: 'production',
      RECAPTCHA_V3_SECRET: 'v3-secret-value',
      RECAPTCHA_V2_SECRET: 'v2-secret-value',
    };

    function configError(env: Record<string, string>): ConfigError | undefined {
      try {
        loadConfig(env);
      } catch (e) {
        return e as ConfigError;
      }
      return undefined;
    }

    it('has no origin verification secret in development without ORIGIN_VERIFY_SECRET', () => {
      expect(loadConfig(validEnv).originVerifySecret).toBeUndefined();
    });

    it('exposes the secret when it is defined', () => {
      const config = loadConfig({ ...validEnv, ORIGIN_VERIFY_SECRET: originVerifySecret });

      expect(config.originVerifySecret).toBe(originVerifySecret);
    });

    it('fails naming ORIGIN_VERIFY_SECRET in production without it', () => {
      const error = configError(productionEnv);

      expect(error).toBeInstanceOf(ConfigError);
      expect(error?.invalidVariables).toEqual(['ORIGIN_VERIFY_SECRET']);
    });

    it('accepts production with the secret', () => {
      const config = loadConfig({ ...productionEnv, ORIGIN_VERIFY_SECRET: originVerifySecret });

      expect(config.originVerifySecret).toBe(originVerifySecret);
    });

    it('fails naming ORIGIN_VERIFY_SECRET when it has 31 characters, without its value', () => {
      const short = 'x'.repeat(31);
      const error = configError({ ...validEnv, ORIGIN_VERIFY_SECRET: short });

      expect(error?.invalidVariables).toEqual(['ORIGIN_VERIFY_SECRET']);
      expect(error?.message).not.toContain(short);
    });

    it('accepts a secret of exactly 32 characters', () => {
      expect(
        loadConfig({ ...validEnv, ORIGIN_VERIFY_SECRET: 'x'.repeat(32) }).originVerifySecret,
      ).toHaveLength(32);
    });

    it('fails naming ORIGIN_VERIFY_SECRET when it is empty in production', () => {
      expect(configError({ ...productionEnv, ORIGIN_VERIFY_SECRET: '' })?.invalidVariables).toEqual(
        ['ORIGIN_VERIFY_SECRET'],
      );
    });

    it('documents the secret, commented out, in the .env.example template', () => {
      const template = readFileSync(envExampleUrl, 'utf8');

      expect(template).toMatch(/^# ORIGIN_VERIFY_SECRET=$/m);
    });
  });

  describe('loadConfigOrLog', () => {
    function capturedLogger() {
      const lines: string[] = [];
      const logger = createLogger('info', { write: (line: string) => void lines.push(line) });
      return { logger, lines };
    }

    it('returns what loadConfig returns for a valid environment, without logging', () => {
      const { logger, lines } = capturedLogger();

      expect(loadConfigOrLog(validEnv, logger)).toEqual(loadConfig(validEnv));
      expect(lines).toEqual([]);
    });

    it('writes one fatal JSON line with the invalid variable names and rethrows', () => {
      const { logger, lines } = capturedLogger();
      const env = { ...validEnv, PORT: 'not-a-port', JWT_SECRET: 'too-short-secret-value' };

      expect(() => loadConfigOrLog(env, logger)).toThrow(ConfigError);

      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
      expect(entry).toMatchObject({ level: 'fatal', invalidVariables: ['JWT_SECRET', 'PORT'] });
      expect(lines[0]).not.toContain('not-a-port');
      expect(lines[0]).not.toContain('too-short-secret-value');
    });

    it('rethrows unexpected errors without logging them as configuration errors', () => {
      const { logger, lines } = capturedLogger();

      const brokenEnv = new Proxy(
        {},
        {
          get: () => {
            throw new Error('boom');
          },
        },
      );

      expect(() => loadConfigOrLog(brokenEnv, logger)).toThrow('boom');
      expect(lines).toEqual([]);
    });
  });

  it('documents the attempt settings, commented out with their defaults, in the .env.example template', () => {
    const template = readFileSync(envExampleUrl, 'utf8');

    expect(template).toMatch(/^# TRUST_PROXY_HOPS=0$/m);
    expect(template).toMatch(/^# REGISTRATION_ATTEMPTS_MAX=5$/m);
    expect(template).toMatch(/^# LOGIN_ATTEMPTS_MAX=10$/m);
    expect(template).toMatch(/^# INVITATION_ATTEMPTS_MAX=10$/m);
  });

  it('documents both reCAPTCHA secrets, commented out, in the .env.example template', () => {
    const template = readFileSync(envExampleUrl, 'utf8');

    expect(template).toMatch(/^# RECAPTCHA_V3_SECRET=$/m);
    expect(template).toMatch(/^# RECAPTCHA_V2_SECRET=$/m);
  });

  it('accepts the versioned .env.example template', () => {
    const template = parseEnv(readFileSync(envExampleUrl, 'utf8'));

    const config = loadConfig(template);

    expect(config.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.appOrigin).toBe('http://localhost:5173');
  });
});
