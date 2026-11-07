import type { IconProps } from './IconProps';

/**
 * Lupa: búsqueda de los listados. Icono de Lucide (ISC, ver LUCIDE-LICENSE.txt). Decorativo (oculto a los lectores de pantalla).
 */
export function SearchIcon(props: IconProps) {
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
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </svg>
  );
}
