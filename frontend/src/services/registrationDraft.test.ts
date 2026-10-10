import { describe, expect, it, vi } from 'vitest';
import { createRegistrationDraft, REGISTRATION_DRAFT_KEY } from './registrationDraft';

/** Almacenamiento en memoria con la parte de `Storage` que usa el borrador. */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

const values = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García',
  email: 'jose.garcia@example.com',
  password: 'Secreta123!',
};

describe('registrationDraft', () => {
  it('uses a versioned key', () => {
    expect(REGISTRATION_DRAFT_KEY).toBe('calendarschool:registration-draft:v1');
  });

  it('saves the five preservable fields as typed and never the password', () => {
    const storage = memoryStorage();
    const draft = createRegistrationDraft(() => storage);

    draft.save({ ...values, schoolName: '  CEIP  Lluís Vives ' });

    const saved = JSON.parse(storage.items.get(REGISTRATION_DRAFT_KEY) ?? 'null') as unknown;
    expect(saved).toEqual({
      schoolName: '  CEIP  Lluís Vives ',
      municipalityCode: '46250',
      firstName: 'José María',
      lastName: 'García',
      email: 'jose.garcia@example.com',
    });
    expect(storage.items.get(REGISTRATION_DRAFT_KEY)).not.toContain('Secreta123!');
  });

  it('restores what was saved, without a password', () => {
    const storage = memoryStorage();
    const draft = createRegistrationDraft(() => storage);
    draft.save(values);

    expect(draft.load()).toEqual({
      schoolName: 'CEIP Lluís Vives',
      municipalityCode: '46250',
      firstName: 'José María',
      lastName: 'García',
      email: 'jose.garcia@example.com',
    });
  });

  it('restores nothing when there is no draft', () => {
    expect(createRegistrationDraft(() => memoryStorage()).load()).toEqual({});
  });

  it('removes the draft with clear', () => {
    const storage = memoryStorage();
    const draft = createRegistrationDraft(() => storage);
    draft.save(values);

    draft.clear();

    expect(storage.items.has(REGISTRATION_DRAFT_KEY)).toBe(false);
    expect(draft.load()).toEqual({});
  });

  describe('defensive reading', () => {
    function loadFrom(raw: string) {
      const storage = memoryStorage({ [REGISTRATION_DRAFT_KEY]: raw });
      return createRegistrationDraft(() => storage).load();
    }

    it.each([
      ['invalid JSON', '{no es json'],
      ['null', 'null'],
      ['a number', '42'],
      ['a string', '"texto"'],
      ['an array', '["a","b"]'],
    ])('ignores the whole draft when it is %s', (_name, raw) => {
      expect(loadFrom(raw)).toEqual({});
    });

    it('ignores unknown fields and the password', () => {
      expect(loadFrom(JSON.stringify({ email: 'a@b.es', password: 'x', extra: 'y' }))).toEqual({
        email: 'a@b.es',
      });
    });

    it('ignores values that are not text, keeping the valid fields', () => {
      expect(
        loadFrom(JSON.stringify({ schoolName: 5, firstName: null, lastName: {}, email: 'a@b.es' })),
      ).toEqual({ email: 'a@b.es' });
    });

    it('ignores values over 1000 characters without trimming the rest', () => {
      expect(
        loadFrom(JSON.stringify({ schoolName: 'x'.repeat(1001), lastName: 'y'.repeat(1000) })),
      ).toEqual({ lastName: 'y'.repeat(1000) });
    });
  });

  describe('storage that is not available', () => {
    const failure = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };

    it('does not throw when the storage cannot be obtained', () => {
      const draft = createRegistrationDraft(failure);

      expect(draft.load()).toEqual({});
      expect(() => {
        draft.save(values);
      }).not.toThrow();
      expect(() => {
        draft.clear();
      }).not.toThrow();
    });

    it('does not throw when reading, writing or removing fails', () => {
      const storage = {
        getItem: vi.fn(failure),
        setItem: vi.fn(failure),
        removeItem: vi.fn(failure),
      };
      const draft = createRegistrationDraft(() => storage);

      expect(draft.load()).toEqual({});
      expect(() => {
        draft.save(values);
      }).not.toThrow();
      expect(() => {
        draft.clear();
      }).not.toThrow();
      expect(storage.getItem).toHaveBeenCalled();
      expect(storage.setItem).toHaveBeenCalled();
      expect(storage.removeItem).toHaveBeenCalled();
    });
  });
});
