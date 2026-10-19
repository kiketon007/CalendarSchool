import type { IconProps } from './IconProps';

/** Cubiertos: funcionalidad de gestión de comedor. Decorativo (oculto a los lectores de pantalla). */
export function CutleryIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="32"
      height="32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v7M9 3v7M17 21V3c-2.2 1.2-3.5 3.6-3.5 7 0 2 1.2 3 3.5 3" />
    </svg>
  );
}
