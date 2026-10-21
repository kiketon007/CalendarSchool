import { useEffect, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import { useTranslation } from 'react-i18next';

interface PaginationProps {
  /** Página actual (la primera es la 1). */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Nombre accesible de la navegación, que cada listado pone en su idioma («Paginación de profesores»). */
  label: string;
}

/**
 * Navegación entre las páginas de un listado: «Anterior», «Página X de N» y «Siguiente». No se pinta con
 * una sola página. El indicador es una región `aria-live="polite"`, así que al cambiar de página se
 * anuncia sin mover el foco. El botón pulsado conserva el foco; si el cambio lo deshabilita (se llega a
 * la última o a la primera página) el foco pasa al otro, porque un botón deshabilitado lo perdería.
 */
export function Pagination({ page, pageCount, onPageChange, label }: PaginationProps) {
  const { t } = useTranslation();
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // Botón al que pasar el foco tras el próximo render: el otro está deshabilitado hasta entonces.
  const focusAfterChange = useRef<'previous' | 'next' | null>(null);

  useEffect(() => {
    const target = focusAfterChange.current;
    focusAfterChange.current = null;
    (target === 'previous'
      ? previousRef
      : target === 'next'
        ? nextRef
        : undefined
    )?.current?.focus();
  }, [page]);

  if (pageCount <= 1) {
    return null;
  }

  function goTo(target: number, otherButton: 'previous' | 'next') {
    const reachedAnEnd = target <= 1 || target >= pageCount;
    focusAfterChange.current = reachedAnEnd ? otherButton : null;
    onPageChange(target);
  }

  return (
    <nav aria-label={label} className="d-flex align-items-center justify-content-center gap-3 mt-4">
      <Button
        ref={previousRef}
        variant="outline-secondary"
        disabled={page <= 1}
        onClick={() => {
          goTo(page - 1, 'next');
        }}
      >
        {t('pagination.previous')}
      </Button>
      <span aria-live="polite" aria-atomic="true">
        {t('pagination.pageOf', { page, pageCount })}
      </span>
      <Button
        ref={nextRef}
        variant="outline-secondary"
        disabled={page >= pageCount}
        onClick={() => {
          goTo(page + 1, 'previous');
        }}
      >
        {t('pagination.next')}
      </Button>
    </nav>
  );
}
