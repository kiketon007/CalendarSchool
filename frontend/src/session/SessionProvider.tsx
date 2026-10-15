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
import {
  sessionService,
  type LogoutOutcome,
  type RefreshOutcome,
  type SessionData,
} from '../services/sessionService';

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
  /**
   * Cierra la sesión en el servidor. Solo si lo confirma deja la sesión como `anonymous` y avisa a
   * las demás pestañas; si no, la sesión sigue abierta y el llamante decide qué mostrar.
   */
  logout: () => Promise<LogoutOutcome>;
}

/** Canal por el que las pestañas del mismo navegador se avisan de un cierre de sesión. */
const SESSION_CHANNEL = 'calendarschool:session';
const LOGOUT_MESSAGE = { type: 'logout' } as const;

function isLogoutMessage(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === 'logout';
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
  const channel = useRef<BroadcastChannel | null>(null);

  const refresh = useCallback(async (): Promise<RefreshOutcome> => {
    const request = ++latestRequest.current;
    const outcome = await sessionService.refresh();
    if (request === latestRequest.current) {
      setState(stateFor(outcome));
    }
    return outcome;
  }, []);

  // Una pestaña que cierra la sesión avisa a las demás: pasan a `anonymous` sin llamar al servidor.
  // Sin `BroadcastChannel` (navegadores antiguos), la otra pestaña lo descubre en su siguiente renovación.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    const sessionChannel = new BroadcastChannel(SESSION_CHANNEL);
    sessionChannel.onmessage = (event: MessageEvent) => {
      if (isLogoutMessage(event.data)) {
        // Supera cualquier renovación en curso: su respuesta ya no debe reabrir la sesión.
        latestRequest.current++;
        setState({ status: 'anonymous' });
      }
    };
    channel.current = sessionChannel;
    return () => {
      sessionChannel.close();
      channel.current = null;
    };
  }, []);

  const logout = useCallback(async (): Promise<LogoutOutcome> => {
    const outcome = await sessionService.logout();
    if (outcome.status === 'loggedOut') {
      latestRequest.current++;
      setState({ status: 'anonymous' });
      channel.current?.postMessage(LOGOUT_MESSAGE);
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

  const value = useMemo(() => ({ state, refresh, logout }), [state, refresh, logout]);
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
