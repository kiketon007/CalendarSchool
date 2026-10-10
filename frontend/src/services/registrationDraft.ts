import type { RegistrationFormValues } from '../validation/registrationValidation';

/** Clave del borrador en `sessionStorage`; el sufijo de versión permite cambiar el formato. */
export const REGISTRATION_DRAFT_KEY = 'calendarschool:registration-draft:v1';

/**
 * Campos que se conservan. Es una lista explícita (y no «todos menos la contraseña») para que un
 * campo nuevo del formulario no se guarde sin haberlo decidido.
 */
const DRAFT_FIELDS = [
  'schoolName',
  'municipalityCode',
  'firstName',
  'lastName',
  'email',
] as const satisfies readonly (keyof RegistrationFormValues)[];

/** Muy por encima del máximo de cualquier campo (320 el email): lo que supera esto no es un borrador. */
const MAX_DRAFT_VALUE_LENGTH = 1000;

export type RegistrationDraftValues = Partial<
  Pick<RegistrationFormValues, (typeof DRAFT_FIELDS)[number]>
>;

/** Parte de `Storage` que usa el borrador. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RegistrationDraft {
  /** Los valores guardados, o `{}` si no hay borrador, no es válido o no se puede leer. */
  load(): RegistrationDraftValues;
  /** Guarda los campos conservables de `values`; la contraseña nunca se guarda. */
  save(values: RegistrationFormValues): void;
  clear(): void;
}

/**
 * Borrador del formulario de registro (US01_f). Todo acceso al almacenamiento va protegido: el
 * navegador puede bloquearlo (`SecurityError`) o negarse a guardar más (`QuotaExceededError`), y en
 * ese caso el formulario funciona igual, sin conservar nada.
 */
export function createRegistrationDraft(getStorage: () => DraftStorage): RegistrationDraft {
  return {
    load() {
      let parsed: unknown;
      try {
        const raw = getStorage().getItem(REGISTRATION_DRAFT_KEY);
        if (raw === null) {
          return {};
        }
        parsed = JSON.parse(raw);
      } catch {
        return {};
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {};
      }
      const record = parsed as Record<string, unknown>;
      const restored: RegistrationDraftValues = {};
      for (const field of DRAFT_FIELDS) {
        const value = record[field];
        if (typeof value === 'string' && value.length <= MAX_DRAFT_VALUE_LENGTH) {
          restored[field] = value;
        }
      }
      return restored;
    },

    save(values) {
      const draft: RegistrationDraftValues = {};
      for (const field of DRAFT_FIELDS) {
        draft[field] = values[field];
      }
      try {
        getStorage().setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Sin almacenamiento no se conserva el borrador, pero el registro sigue funcionando.
      }
    },

    clear() {
      try {
        getStorage().removeItem(REGISTRATION_DRAFT_KEY);
      } catch {
        // Igual que al guardar: no hay nada que borrar o no se puede.
      }
    },
  };
}

const registrationDraft = createRegistrationDraft(() => window.sessionStorage);

export const loadRegistrationDraft = () => registrationDraft.load();
export const saveRegistrationDraft = (values: RegistrationFormValues) => {
  registrationDraft.save(values);
};
export const clearRegistrationDraft = () => {
  registrationDraft.clear();
};
