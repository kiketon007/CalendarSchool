import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scheduleEngineOf } from '../lib/scheduleEngine.js';

describe('scheduleEngineOf', () => {
  it('is BACKTRACKING without context', () => {
    expect(scheduleEngineOf(undefined)).toBe('BACKTRACKING');
    expect(scheduleEngineOf(null)).toBe('BACKTRACKING');
  });

  it.each(['BACKTRACKING', 'ORTOOLS'] as const)('accepts %s', (engine) => {
    expect(scheduleEngineOf(engine)).toBe(engine);
  });

  it.each(['FOO', 'ortools', '', 'ORTOOLS ', 42, true, { engine: 'ORTOOLS' }])(
    'rejects %j naming the context and the valid values',
    (value) => {
      expect(() => scheduleEngineOf(value)).toThrow(/scheduleEngine/);
      expect(() => scheduleEngineOf(value)).toThrow(/BACKTRACKING u ORTOOLS/);
    },
  );
});

/** Sintetiza con el punto de entrada real de CDK (`bin/app.ts`) y el contexto indicado. */
const outputs: string[] = [];
function synthesize(context: Record<string, unknown>) {
  const outdir = mkdtempSync(join(tmpdir(), 'cdk-engine-'));
  outputs.push(outdir);
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'bin/app.ts'], {
    cwd: join(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      CDK_DEFAULT_ACCOUNT: '123456789012',
      CDK_OUTDIR: outdir,
      // Sin empaquetar las Lambdas de Node con esbuild: aquí solo importa el contexto.
      CDK_CONTEXT_JSON: JSON.stringify({ 'aws:cdk:bundling-stacks': [], ...context }),
    },
    timeout: 120_000,
  });
  return { result, outdir };
}

afterAll(() => {
  for (const outdir of outputs) {
    rmSync(outdir, { recursive: true, force: true });
  }
});

describe('the scheduleEngine context in bin/app.ts', () => {
  const engineOf = (outdir: string, resource: 'ApiFunction' | 'ScheduleWorkerFunction') => {
    const template = JSON.parse(
      readFileSync(join(outdir, 'CalendarSchool-prod-App.template.json'), 'utf8'),
    ) as { Resources: Record<string, { Type: string; Properties: Record<string, any> }> };
    const entry = Object.entries(template.Resources).find(
      ([id, value]) => id.startsWith(resource) && value.Type === 'AWS::Lambda::Function',
    );
    return entry?.[1].Properties.Environment.Variables.SCHEDULE_ENGINE as string;
  };

  it('is BACKTRACKING by default', () => {
    const { result, outdir } = synthesize({});

    expect(result.status).toBe(0);
    expect(readdirSync(outdir)).toContain('CalendarSchool-prod-App.template.json');
    expect(engineOf(outdir, 'ApiFunction')).toBe('BACKTRACKING');
    expect(engineOf(outdir, 'ScheduleWorkerFunction')).toBe('BACKTRACKING');
  }, 60_000);

  it('passes ORTOOLS to the API and to the worker', () => {
    const { result, outdir } = synthesize({ scheduleEngine: 'ORTOOLS' });

    expect(result.status).toBe(0);
    expect(engineOf(outdir, 'ApiFunction')).toBe('ORTOOLS');
    expect(engineOf(outdir, 'ScheduleWorkerFunction')).toBe('ORTOOLS');
  }, 60_000);

  it('fails naming scheduleEngine and its values for any other value, before writing a template', () => {
    const { result, outdir } = synthesize({ scheduleEngine: 'FOO' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/scheduleEngine/);
    expect(result.stderr).toMatch(/BACKTRACKING u ORTOOLS/);
    expect(readdirSync(outdir).filter((name) => name.endsWith('.template.json'))).toEqual([]);
  }, 60_000);
});
