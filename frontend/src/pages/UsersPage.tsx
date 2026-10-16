import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { usersService, type SchoolUser } from '../services/usersService';
import { useSession } from '../session/SessionProvider';

type ListState =
  { status: 'loading' } | { status: 'loaded'; users: SchoolUser[] } | { status: 'error' };

/**
 * Usuarios del colegio (US02_b1), solo para administradores: cuelga de `AuthenticatedLayout` y de
 * `RequireRole`. Muestra la lista tal como la ordena el servidor. Si la petición falla ofrece
 * reintentarla; si el servidor responde `403` (el rol cambió con la página abierta) renueva la sesión
 * y lleva a Onboarding sin mensaje; si la sesión se perdió no hace nada, porque el layout ya redirige.
 */
export function UsersPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch, refresh } = useSession();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // Intento ya pedido: en modo estricto el efecto se ejecuta dos veces, pero la lista se pide una.
  const requestedAttempt = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (requestedAttempt.current === attempt) {
      return;
    }
    requestedAttempt.current = attempt;
    void usersService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', users: outcome.users });
          break;
        case 'forbidden':
          // La interfaz iba por detrás del rol real: se renueva para conocerlo y se sale de aquí.
          void refresh().then(() => {
            if (mounted.current) {
              void navigate('/onboarding', { replace: true });
            }
          });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setList({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch, refresh, navigate]);

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <Container as="main" className="py-5" data-testid="users-page">
      <h1 id="users-title">{t('users.title')}</h1>

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('users.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span className="me-auto">{t('users.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('users.retry')}
          </Button>
        </Alert>
      )}

      {list.status === 'loaded' && (
        <Table striped responsive aria-labelledby="users-title">
          <thead>
            <tr>
              <th scope="col">{t('users.columns.firstName')}</th>
              <th scope="col">{t('users.columns.lastName')}</th>
              <th scope="col">{t('users.columns.email')}</th>
              <th scope="col">{t('users.columns.role')}</th>
              <th scope="col">{t('users.columns.status')}</th>
              <th scope="col">{t('users.columns.createdAt')}</th>
            </tr>
          </thead>
          <tbody>
            {list.users.map((user) => (
              <tr key={user.id}>
                <td>{user.firstName}</td>
                <td>{user.lastName}</td>
                <td>{user.email}</td>
                <td>{t(`users.role.${user.role}`)}</td>
                <td>{t(`users.status.${user.status}`)}</td>
                <td>{dateFormat.format(new Date(user.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Container>
  );
}
