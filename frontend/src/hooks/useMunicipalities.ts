import { useEffect, useState } from 'react';
import { registrationService, type Municipality } from '../services/registrationService';

export type MunicipalitiesState =
  | { status: 'loading'; municipalities: Municipality[] }
  | { status: 'ready'; municipalities: Municipality[] }
  | { status: 'error'; municipalities: Municipality[] };

interface Settled {
  attempt: number;
  status: 'ready' | 'error';
  municipalities: Municipality[];
}

/**
 * Carga la lista de municipios (`GET /api/municipalities`) al montar y expone `retry` para
 * repetir la carga si falla. Una respuesta que llega tras desmontar o tras un reintento se descarta.
 */
export function useMunicipalities(): MunicipalitiesState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled>();

  useEffect(() => {
    let isCurrent = true;
    registrationService.listMunicipalities().then(
      (municipalities) => {
        if (isCurrent) {
          setSettled({ attempt, status: 'ready', municipalities });
        }
      },
      () => {
        if (isCurrent) {
          setSettled({ attempt, status: 'error', municipalities: [] });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [attempt]);

  const retry = () => {
    setAttempt((current) => current + 1);
  };

  // Mientras no haya respuesta para el intento actual, la carga sigue en curso.
  if (settled?.attempt !== attempt) {
    return { status: 'loading', municipalities: [], retry };
  }
  return { status: settled.status, municipalities: settled.municipalities, retry };
}
