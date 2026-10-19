import { vi } from 'vitest';

/** Control de un `matchMedia` simulado: jsdom no lo implementa. */
export interface MatchMediaControl {
  /** Cambia el ancho de la ventana y avisa a quienes escuchan cada consulta. */
  setWidth(width: number): void;
  /** Número de escuchas de `change` activas en todas las consultas. */
  listenerCount(): number;
  /** Quita el `matchMedia` simulado y deja `window` como estaba. */
  restore(): void;
}

/** Evalúa las consultas `(min-width: Npx)` y `(max-width: Npx)`, las únicas que usa la aplicación. */
function evaluate(query: string, width: number): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  if (min) {
    return width >= Number(min[1]);
  }
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  return max ? width <= Number(max[1]) : false;
}

type Listener = (event: { matches: boolean; media: string }) => void;

/**
 * Instala un `window.matchMedia` simulado para un ancho de ventana. Se llama en el test (o en su
 * `beforeEach`) y se deshace con `restore()`.
 */
export function installMatchMedia(initialWidth: number): MatchMediaControl {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  let width = initialWidth;
  const lists: { query: string; listeners: Set<Listener> }[] = [];

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => {
      const entry = { query, listeners: new Set<Listener>() };
      lists.push(entry);
      return {
        get matches() {
          return evaluate(query, width);
        },
        media: query,
        addEventListener: (_type: string, listener: Listener) => entry.listeners.add(listener),
        removeEventListener: (_type: string, listener: Listener) =>
          entry.listeners.delete(listener),
      };
    }),
  });

  return {
    setWidth(next) {
      width = next;
      for (const { query, listeners } of lists) {
        for (const listener of listeners) {
          listener({ matches: evaluate(query, width), media: query });
        }
      }
    },
    listenerCount: () => lists.reduce((total, { listeners }) => total + listeners.size, 0),
    restore() {
      if (original) {
        Object.defineProperty(window, 'matchMedia', original);
      } else {
        Reflect.deleteProperty(window, 'matchMedia');
      }
    },
  };
}
