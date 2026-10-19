import { useCallback, useSyncExternalStore } from 'react';

const hasMatchMedia = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Indica si una consulta de medios CSS (p. ej. `(min-width: 768px)`) se cumple y se mantiene al día
 * cuando cambia el ancho de la ventana. Se lee en el primer render, para no pintar primero la
 * estructura equivocada, y se suscribe a `change` mientras el componente está montado. Si el
 * navegador no tiene `matchMedia`, devuelve `false`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => (hasMatchMedia() ? window.matchMedia(query).matches : false),
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
