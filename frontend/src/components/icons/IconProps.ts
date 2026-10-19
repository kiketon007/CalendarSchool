import type { SVGProps } from 'react';

/** Props de los iconos: son decorativos, así que no hay `title` ni nombre accesible. */
export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'aria-hidden' | 'focusable'>;
