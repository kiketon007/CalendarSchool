import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ConfirmSuspendModal } from '../components/ConfirmSuspendModal';
import { GeneratedLinkPanel } from '../components/GeneratedLinkPanel';
import { InvitationsSection } from '../components/InvitationsSection';
import {
  usersService,
  type GeneratePasswordResetOutcome,
  type RevokePasswordResetOutcome,
  type SchoolUser,
  type UserActionOutcome,
} from '../services/usersService';
import { useSession } from '../session/SessionProvider';

type ListState =
  { status: 'loading' } | { status: 'loaded'; users: SchoolUser[] } | { status: 'error' };

/** Rechazos de una acción que se muestran al administrador; cada uno tiene su texto en `users.errors`. */
type ActionError =
  | 'lastAdminRequired'
  | 'cannotSuspendSelf'
  | 'userNotActive'
  | 'notFound'
  | 'unavailable'
  | 'passwordResetUserNotActive'
  | 'passwordResetUnavailable'
  | 'passwordResetRevokeUnavailable';

/** Enlace de restablecimiento recién generado: solo vive en el estado de la página, nunca en almacenamiento. */
interface GeneratedReset {
  userId: string;
  userName: string;
  url: string;
}

/**
 * Usuarios del colegio, solo para administradores: cuelga de `AuthenticatedLayout` y de
 * `RequireRole`. Muestra la lista tal como la ordena el servidor y deja cambiar el rol, dar de baja
 * (con confirmación) y reactivar, y debajo monta las invitaciones (`InvitationsSection`), que fallan
 * por separado y comparten la salida a Onboarding. Si la petición falla ofrece reintentarla; si el servidor responde
 * `403` (el rol cambió con la página abierta) renueva la sesión y lleva a Onboarding sin mensaje; si
 * la sesión se perdió no hace nada, porque el layout ya redirige.
 */
export function UsersPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { state, authorizedFetch, refresh } = useSession();
  const actorId = state.status === 'authenticated' ? state.data.user.id : undefined;
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  // Usuarios con una acción en curso. La `ref` es la guarda síncrona contra el doble clic (el estado
  // no se actualiza entre dos clics del mismo ciclo); el estado solo deshabilita los botones.
  const pendingRef = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  // El usuario de la baja se conserva al cerrar el diálogo para que su texto no cambie mientras se oculta.
  const [suspendTarget, setSuspendTarget] = useState<SchoolUser | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generatedReset, setGeneratedReset] = useState<GeneratedReset | null>(null);
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

  /** La interfaz iba por detrás del rol real: se renueva para conocerlo y se sale de aquí. */
  const leaveForOnboarding = useCallback(() => {
    void refresh().then(() => {
      if (mounted.current) {
        void navigate('/onboarding', { replace: true });
      }
    });
  }, [refresh, navigate]);

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
          leaveForOnboarding();
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setList({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch, leaveForOnboarding]);

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function replaceUser(user: SchoolUser) {
    setList((current) =>
      current.status === 'loaded'
        ? { status: 'loaded', users: current.users.map((u) => (u.id === user.id ? user : u)) }
        : current,
    );
  }

  /** Marca al usuario con una acción en curso; `false` si ya la tenía (segundo envío, que se ignora). */
  function beginAction(userId: string): boolean {
    if (pendingRef.current.has(userId)) {
      return false;
    }
    pendingRef.current.add(userId);
    setPendingIds(new Set(pendingRef.current));
    setActionError(null);
    return true;
  }

  /** Libera al usuario; `false` si la página ya se desmontó y no hay que actualizar nada. */
  function endAction(userId: string): boolean {
    pendingRef.current.delete(userId);
    if (!mounted.current) {
      return false;
    }
    setPendingIds(new Set(pendingRef.current));
    return true;
  }

  /** La lista estaba desfasada: se avisa y se vuelve a pedir, sin vaciarla mientras llega. */
  function reloadAfterNotFound() {
    setActionError('notFound');
    setAttempt((current) => current + 1);
  }

  /** Genera el enlace de restablecimiento del usuario y lo muestra una sola vez. */
  async function generatePasswordReset(user: SchoolUser) {
    if (!beginAction(user.id)) {
      return;
    }
    const outcome: GeneratePasswordResetOutcome = await usersService.generatePasswordReset(
      authorizedFetch,
      user.id,
    );
    if (!endAction(user.id)) {
      return;
    }
    switch (outcome.status) {
      case 'created':
        replaceUser({ ...user, passwordResetPending: true });
        setGeneratedReset({
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
          url: outcome.url,
        });
        break;
      case 'userNotActive':
        setActionError('passwordResetUserNotActive');
        break;
      case 'notFound':
        reloadAfterNotFound();
        break;
      case 'forbidden':
        leaveForOnboarding();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'unavailable':
        setActionError('passwordResetUnavailable');
        break;
    }
  }

  /** Revoca el restablecimiento pendiente del usuario; si su enlace seguía en pantalla, lo descarta. */
  async function revokePasswordReset(user: SchoolUser) {
    if (!beginAction(user.id)) {
      return;
    }
    const outcome: RevokePasswordResetOutcome = await usersService.revokePasswordReset(
      authorizedFetch,
      user.id,
    );
    if (!endAction(user.id)) {
      return;
    }
    switch (outcome.status) {
      case 'revoked':
        replaceUser({ ...user, passwordResetPending: false });
        setGeneratedReset((current) => (current?.userId === user.id ? null : current));
        break;
      case 'notFound':
        reloadAfterNotFound();
        break;
      case 'forbidden':
        leaveForOnboarding();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'unavailable':
        setActionError('passwordResetRevokeUnavailable');
        break;
    }
  }

  /** Envía una acción sobre un usuario y aplica su resultado; ignora un segundo envío mientras la primera sigue en curso. */
  async function runAction(user: SchoolUser, send: () => Promise<UserActionOutcome>) {
    if (!beginAction(user.id)) {
      return;
    }

    const outcome = await send();

    if (!endAction(user.id)) {
      return;
    }
    switch (outcome.status) {
      case 'updated':
        replaceUser(outcome.user);
        // Quien se quita su propio rol de administrador ya no puede estar aquí: la sesión en memoria
        // aún dice `ADMIN`, y al renovarla la guarda de rol lo lleva a Onboarding.
        if (user.id === actorId && outcome.user.role !== user.role) {
          void refresh();
        }
        break;
      case 'notFound':
        reloadAfterNotFound();
        break;
      case 'forbidden':
        leaveForOnboarding();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      default:
        setActionError(outcome.status);
    }
  }

  function confirmSuspend() {
    setConfirmOpen(false);
    if (suspendTarget) {
      void runAction(suspendTarget, () => usersService.suspend(authorizedFetch, suspendTarget.id));
    }
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

      {actionError && (
        <Alert variant="danger" role="alert">
          {t(`users.errors.${actionError}`)}
        </Alert>
      )}

      {generatedReset !== null && (
        <GeneratedLinkPanel
          url={generatedReset.url}
          idPrefix="password-reset"
          title={t('users.passwordReset.link.title', { name: generatedReset.userName })}
          label={t('users.passwordReset.link.label')}
          warning={t('users.passwordReset.link.warning')}
          onDone={() => setGeneratedReset(null)}
        />
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
              <th scope="col">{t('users.actions.header')}</th>
            </tr>
          </thead>
          <tbody>
            {list.users.map((user) => {
              const isSelf = user.id === actorId;
              const isPending = pendingIds.has(user.id);
              return (
                <tr key={user.id}>
                  <td>
                    {user.firstName}
                    {isSelf && <span className="ms-1 text-body-secondary">{t('users.you')}</span>}
                  </td>
                  <td>{user.lastName}</td>
                  <td>{user.email}</td>
                  <td>{t(`users.role.${user.role}`)}</td>
                  <td>
                    {t(`users.status.${user.status}`)}
                    {user.passwordResetPending && (
                      <Badge bg="warning" text="dark" className="ms-2">
                        {t('users.passwordReset.pending')}
                      </Badge>
                    )}
                  </td>
                  <td>{dateFormat.format(new Date(user.createdAt))}</td>
                  <td>
                    <div className="d-flex flex-wrap gap-2">
                      {user.status === 'ACTIVE' ? (
                        <>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              void runAction(user, () =>
                                usersService.changeRole(
                                  authorizedFetch,
                                  user.id,
                                  user.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
                                ),
                              )
                            }
                          >
                            {t(
                              user.role === 'ADMIN'
                                ? 'users.actions.makeMember'
                                : 'users.actions.makeAdmin',
                            )}
                          </Button>
                          {!isSelf && (
                            <Button
                              variant="outline-danger"
                              size="sm"
                              disabled={isPending}
                              onClick={() => {
                                setSuspendTarget(user);
                                setConfirmOpen(true);
                              }}
                            >
                              {t('users.actions.suspend')}
                            </Button>
                          )}
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            disabled={isPending}
                            onClick={() => void generatePasswordReset(user)}
                          >
                            {t('users.passwordReset.action')}
                          </Button>
                          {user.passwordResetPending && (
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              disabled={isPending}
                              onClick={() => void revokePasswordReset(user)}
                            >
                              {t('users.passwordReset.revoke')}
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          variant="outline-success"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            void runAction(user, () =>
                              usersService.reactivate(authorizedFetch, user.id),
                            )
                          }
                        >
                          {t('users.actions.reactivate')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <InvitationsSection onForbidden={leaveForOnboarding} />

      <ConfirmSuspendModal
        show={confirmOpen}
        userName={suspendTarget ? `${suspendTarget.firstName} ${suspendTarget.lastName}` : ''}
        onConfirm={confirmSuspend}
        onCancel={() => setConfirmOpen(false)}
      />
    </Container>
  );
}
