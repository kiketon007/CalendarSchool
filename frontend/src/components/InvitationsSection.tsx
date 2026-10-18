import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import {
  invitationsService,
  type Invitation,
  type InvitationRole,
} from '../services/invitationsService';
import { useSession } from '../session/SessionProvider';
import { GeneratedInvitationPanel } from './GeneratedInvitationPanel';

type ListState =
  { status: 'loading' } | { status: 'loaded'; invitations: Invitation[] } | { status: 'error' };

/** Avisos de una acción; cada uno tiene su texto en `invitations.errors`. */
type ActionError = 'createUnavailable' | 'revokeUnavailable' | 'notFound';

interface InvitationsSectionProps {
  /** El servidor respondió `403`: el rol cambió con la página abierta. Quien monta la sección decide cómo salir. */
  onForbidden: () => void;
}

/**
 * Invitaciones del colegio, solo para administradores: genera una invitación con el rol elegido y
 * muestra su enlace una única vez (solo en memoria), lista las pendientes sin enlace y permite
 * revocarlas. Un fallo de la lista o de una acción se avisa aquí, sin afectar a la página que la monta.
 */
export function InvitationsSection({ onForbidden }: InvitationsSectionProps) {
  const { t, i18n } = useTranslation();
  const { authorizedFetch } = useSession();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [role, setRole] = useState<InvitationRole>('MEMBER');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  // Guardas síncronas contra el doble clic (el estado no se actualiza entre dos clics del mismo ciclo);
  // el estado solo deshabilita los botones.
  const isCreatingRef = useRef(false);
  const [isCreating, setIsCreating] = useState(false);
  const revokingRef = useRef(new Set<string>());
  const [revokingIds, setRevokingIds] = useState<ReadonlySet<string>>(new Set());
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la sección ya cerrada).
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
    void invitationsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', invitations: outcome.invitations });
          break;
        case 'forbidden':
          onForbidden();
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setList({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch, onForbidden]);

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  async function generate() {
    if (isCreatingRef.current) {
      return;
    }
    isCreatingRef.current = true;
    setIsCreating(true);
    setActionError(null);

    const outcome = await invitationsService.create(authorizedFetch, role);

    isCreatingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsCreating(false);
    switch (outcome.status) {
      case 'created':
        setGeneratedUrl(outcome.url);
        // La nueva es la más reciente: va la primera, sin volver a pedir la lista.
        setList((current) =>
          current.status === 'loaded'
            ? { status: 'loaded', invitations: [outcome.invitation, ...current.invitations] }
            : current,
        );
        break;
      case 'forbidden':
        onForbidden();
        break;
      case 'unauthenticated':
        break;
      case 'unavailable':
        setActionError('createUnavailable');
        break;
    }
  }

  async function revoke(invitation: Invitation) {
    if (revokingRef.current.has(invitation.id)) {
      return;
    }
    revokingRef.current.add(invitation.id);
    setRevokingIds(new Set(revokingRef.current));
    setActionError(null);

    const outcome = await invitationsService.revoke(authorizedFetch, invitation.id);

    revokingRef.current.delete(invitation.id);
    if (!mounted.current) {
      return;
    }
    setRevokingIds(new Set(revokingRef.current));
    switch (outcome.status) {
      case 'revoked':
        setList((current) =>
          current.status === 'loaded'
            ? {
                status: 'loaded',
                invitations: current.invitations.filter((i) => i.id !== invitation.id),
              }
            : current,
        );
        break;
      case 'notFound':
        // La lista estaba desfasada: se avisa y se vuelve a pedir, sin vaciarla mientras llega.
        setActionError('notFound');
        setAttempt((current) => current + 1);
        break;
      case 'forbidden':
        onForbidden();
        break;
      case 'unauthenticated':
        break;
      case 'unavailable':
        setActionError('revokeUnavailable');
        break;
    }
  }

  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <section aria-labelledby="invitations-title" className="mt-5">
      <h2 id="invitations-title" className="h3">
        {t('invitations.title')}
      </h2>

      <Form
        className="d-flex flex-wrap align-items-end gap-2 mb-4"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <Form.Group controlId="invitation-role">
          <Form.Label>{t('invitations.roleLabel')}</Form.Label>
          <Form.Select
            value={role}
            onChange={(event) => setRole(event.target.value as InvitationRole)}
          >
            <option value="MEMBER">{t('users.role.MEMBER')}</option>
            <option value="ADMIN">{t('users.role.ADMIN')}</option>
          </Form.Select>
        </Form.Group>
        <Button type="submit" disabled={isCreating}>
          {t('invitations.generate')}
        </Button>
      </Form>

      {generatedUrl !== null && (
        <GeneratedInvitationPanel url={generatedUrl} onDone={() => setGeneratedUrl(null)} />
      )}

      {actionError && (
        <Alert variant="danger" role="alert">
          {t(`invitations.errors.${actionError}`)}
        </Alert>
      )}

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('invitations.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span className="me-auto">{t('invitations.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('invitations.retry')}
          </Button>
        </Alert>
      )}

      {list.status === 'loaded' && list.invitations.length === 0 && <p>{t('invitations.empty')}</p>}

      {list.status === 'loaded' && list.invitations.length > 0 && (
        <Table striped responsive aria-labelledby="invitations-title">
          <thead>
            <tr>
              <th scope="col">{t('invitations.columns.role')}</th>
              <th scope="col">{t('invitations.columns.createdBy')}</th>
              <th scope="col">{t('invitations.columns.createdAt')}</th>
              <th scope="col">{t('invitations.columns.expiresAt')}</th>
              <th scope="col">{t('invitations.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td>{t(`users.role.${invitation.role}`)}</td>
                <td>{`${invitation.createdBy.firstName} ${invitation.createdBy.lastName}`}</td>
                <td>{dateFormat.format(new Date(invitation.createdAt))}</td>
                <td>{dateFormat.format(new Date(invitation.expiresAt))}</td>
                <td>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    disabled={revokingIds.has(invitation.id)}
                    onClick={() => void revoke(invitation)}
                  >
                    {t('invitations.revoke')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
