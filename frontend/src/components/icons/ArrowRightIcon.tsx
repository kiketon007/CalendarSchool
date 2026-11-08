import type { IconProps } from './IconProps';

/**
 * Flecha a la derecha: indica que una tarjeta lleva a otra página. Icono de Lucide (ISC, ver LUCIDE-LICENSE.txt). Decorativo (oculto a los lectores de pantalla).
 */
export function ArrowRightIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
