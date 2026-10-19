import { useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';

interface GeneratedLinkPanelProps {
  /** Enlace completo generado. Solo vive en la memoria de este componente. */
  url: string;
  /** Prefijo de los ids (`<prefijo>-link` es el del campo): los usan los E2E y evita choques si hay dos paneles. */
  idPrefix: string;
  /** Texto del título del panel (ya traducido). */
  title: string;
  /** Etiqueta accesible del campo con el enlace (ya traducida). */
  label: string;
  /** Aviso de que el enlace no volverá a mostrarse y de qué permite hacer (ya traducido). */
  warning: string;
  /** «Hecho»: el padre descarta el enlace, que no se puede volver a ver. */
  onDone: () => void;
}

type CopyState = 'idle' | 'copied' | 'manual';

/**
 * Panel con el enlace recién generado de una invitación o de un restablecimiento de contraseña: se
 * muestra una sola vez. Los textos propios de cada uso llegan por parámetro; los botones y los avisos
 * de copia son comunes. «Copiar» lo escribe en el portapapeles y, si el navegador no lo permite o
 * falla, selecciona el texto y explica cómo copiarlo a mano.
 */
export function GeneratedLinkPanel({
  url,
  idPrefix,
  title,
  label,
  warning,
  onDone,
}: GeneratedLinkPanelProps) {
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
    <div role="group" className="alert alert-info mb-4" aria-labelledby={`${idPrefix}-link-title`}>
      <h3 id={`${idPrefix}-link-title`} className="h6">
        {title}
      </h3>
      <p>{warning}</p>
      <Form.Group controlId={`${idPrefix}-link`} className="mb-2">
        <Form.Label>{label}</Form.Label>
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
