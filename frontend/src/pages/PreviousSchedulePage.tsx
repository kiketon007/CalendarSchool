import { useParams } from 'react-router';
import { ScheduleDraftPage } from './ScheduleDraftPage';

/**
 * La ruta de un horario oficial anterior (`/horarios/anteriores/:id`, US-ALGO-CONFIRM_b): lee el id de la dirección y
 * monta la página del horario con él. El `key` por id hace que pasar de un anterior a otro la monte de nuevo, con su
 * propio estado, y vuelva a pedir el horario.
 */
export function PreviousSchedulePage() {
  const { id = '' } = useParams();
  return <ScheduleDraftPage key={id} which="previous" scheduleId={id} />;
}
