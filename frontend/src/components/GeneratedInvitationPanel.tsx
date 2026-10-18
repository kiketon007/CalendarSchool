import { useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';

interface GeneratedInvitationPanelProps {
  /** Enlace completo de la invitación. Solo vive en la memoria de este componente. */
  url: string;
  /** «Hecho»: el padre descarta el enlace, que no se puede volver a ver. */
  onDone: () => void;
}

type CopyState = 'idle' | 'copied' | 'manual';

/**
 * Panel con el enlace de una invitación recién generada: se muestra una sola vez. «Copiar» lo escribe
 * en el portapapeles y, si el navegador no lo permite o falla, selecciona el texto y explica cómo
 * copiarlo a mano.
 */
export function GeneratedInvitationPanel({ url, onDone }: GeneratedInvitationPanelProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  function selectLink() {
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      // Sin portapapeles (contexto no seguro, permiso denegado): se deja el texto seleccionado.
      setCopyState('manual');
      selectLink();
    }
  }

  return (
    <div role="group" className="alert alert-info mb-4" aria-labelledby="invitation-link-title">
      <h3 id="invitation-link-title" className="h6">
        {t('invitations.link.title')}
      </h3>
      <p>{t('invitations.link.warning')}</p>
      <Form.Group controlId="invitation-link" className="mb-2">
        <Form.Label>{t('invitations.link.label')}</Form.Label>
        <Form.Control ref={inputRef} type="text" readOnly value={url} />
      </Form.Group>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void copy()}>
          {t('invitations.link.copy')}
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={onDone}>
          {t('invitations.link.done')}
        </Button>
        {copyState !== 'idle' && (
          <span role="status">
            {copyState === 'copied'
              ? t('invitations.link.copied')
              : t('invitations.link.copyManual')}
          </span>
        )}
      </div>
    </div>
  );
}
