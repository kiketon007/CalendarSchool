import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/calendarschool',
};

describe('loadConfig', () => {
  it('returns a typed config when every variable is valid', () => {
    const config = loadConfig(validEnv);

    expect(config).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
      databaseUrl: 'postgresql://user:secret@localhost:5432/calendarschool',
    });
  });

  it('applies defaults for optional variables', () => {
    const config = loadConfig({ DATABASE_URL: validEnv.DATABASE_URL });

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
      expect((error as ConfigError).invalidVariables).toEqual(['DATABASE_URL', 'PORT']);
    }
  });
});
