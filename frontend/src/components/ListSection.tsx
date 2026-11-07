import type { ReactNode } from 'react';

type ListSectionProps = {
  title: string;
  /** `id` del `h2`: la tabla o la lista del bloque lo usan en `aria-labelledby`. */
  titleId: string;
  /** Contador ya traducido («3 cursos»). Sin él no se pinta. */
  count?: string;
  /** Controles de la cabecera, a la derecha del título (la búsqueda de la página). */
  toolbar?: ReactNode;
  /**
   * `true`: la `section` entera es una tarjeta y el contenido va dentro. `false`: solo la cabecera
   * es una tarjeta y el contenido va debajo, para listados cuyos elementos ya son tarjetas.
   */
  framed?: boolean;
  children: ReactNode;
};

/**
 * Bloque de un listado: una región con nombre (`section` y su `h2`), el contador y la búsqueda en la
 * cabecera, y el contenido (carga, error, vacío o los elementos) debajo. No tiene textos propios:
 * llegan ya traducidos y se pintan como texto plano. Los nombres de los elementos son `h3`.
 */
export function ListSection({
  title,
  titleId,
  count,
  toolbar,
  framed = true,
  children,
}: ListSectionProps) {
  const header = (
    <div className={framed ? 'cs-list-header mb-3' : 'cs-list-header cs-card'}>
      <div>
        <h2 id={titleId} className="h4 mb-0">
          {title}
        </h2>
        {count !== undefined && <p className="cs-list-count mb-0">{count}</p>}
      </div>
      {toolbar}
    </div>
  );

  return framed ? (
    <section aria-labelledby={titleId} className="cs-card">
      {header}
      {children}
    </section>
  ) : (
    <section aria-labelledby={titleId} className="d-grid gap-3">
      {header}
      {children}
    </section>
  );
}
