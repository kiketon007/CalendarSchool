import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { sessionService, type RefreshOutcome, type SessionData } from '../services/sessionService';

/**
 * Estado de la sesión. El access token vive solo aquí, en memoria: nunca en `localStorage`,
 * `sessionStorage` ni en una cookie legible por JavaScript.
 */
export type SessionState =
  { status: 'loading' } | { status: 'authenticated'; data: SessionData } | { status: 'anonymous' };

export interface SessionContextValue {
  state: SessionState;
  /** Renueva la sesión con la cookie y actualiza el estado; devuelve el resultado interpretado. */
  refresh: () => Promise<RefreshOutcome>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function stateFor(outcome: RefreshOutcome): SessionState {
  // Una sesión inválida o un fallo inesperado dejan al usuario sin sesión, sin mostrar errores.
  return outcome.status === 'authenticated'
    ? { status: 'authenticated', data: outcome.data }
    : { status: 'anonymous' };
}

/**
 * Proveedor de la sesión. Al montar intenta una única renovación con la cookie (en modo estricto
 * de React el efecto se ejecuta dos veces, pero la petición no se repite).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  // Número de la última renovación solicitada: solo su resultado actualiza el estado.
  const latestRequest = useRef(0);
  const started = useRef(false);

  const refresh = useCallback(async (): Promise<RefreshOutcome> => {
    const request = ++latestRequest.current;
    const outcome = await sessionService.refresh();
    if (request === latestRequest.current) {
      setState(stateFor(outcome));
    }
    return outcome;
  }, []);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ state, refresh }), [state, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Sesión actual y la función para renovarla. Solo puede usarse dentro de `SessionProvider`. */
// eslint-disable-next-line react-refresh/only-export-components -- hook y proveedor van juntos
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession debe usarse dentro de un SessionProvider');
  }
  return value;
}
