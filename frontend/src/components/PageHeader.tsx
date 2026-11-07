import type { ReactNode, Ref } from 'react';

type PageHeaderProps = {
  title: string;
  /** `id` del `h1`: las secciones y tablas de la página lo usan en `aria-labelledby`. */
  titleId: string;
  /** Ref del `h1`, para que la página mueva el foco al título tras una acción. */
  titleRef?: Ref<HTMLHeadingElement>;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
};

/**
 * Cabecera de página: sobretítulo, título (`h1` enfocable por programa), descripción y acciones.
 * No tiene textos propios: llegan ya traducidos y se pintan como texto plano. En pantallas
 * estrechas las acciones pasan debajo del título (`flex-wrap`).
 */
export function PageHeader({
  title,
  titleId,
  titleRef,
  eyebrow,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
      <div>
        {eyebrow !== undefined && <p className="cs-eyebrow mb-1">{eyebrow}</p>}
        <h1 id={titleId} ref={titleRef} tabIndex={-1} className="mb-0">
          {title}
        </h1>
        {description !== undefined && (
          <p className="text-body-secondary mt-2 mb-0">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}
