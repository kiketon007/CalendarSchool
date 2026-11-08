import type { ComponentType } from 'react';
import type { Tone } from '../components/FeatureCard';
import { BookOpenIcon } from '../components/icons/BookOpenIcon';
import { CalendarClockIcon } from '../components/icons/CalendarClockIcon';
import { CalendarDaysIcon } from '../components/icons/CalendarDaysIcon';
import type { IconProps } from '../components/icons/IconProps';
import { LibraryIcon } from '../components/icons/LibraryIcon';
import { PresentationIcon } from '../components/icons/PresentationIcon';
import { SlidersHorizontalIcon } from '../components/icons/SlidersHorizontalIcon';
import { UsersRoundIcon } from '../components/icons/UsersRoundIcon';

export interface HomeSection {
  /** Clave de `onboarding.features.<key>` (nombre y descripción). */
  key: string;
  /** Ruta de la sección: la misma que su enlace de la barra lateral. */
  to: string;
  Icon: ComponentType<IconProps>;
  tone: Tone;
}

/**
 * Secciones de trabajo de la portada, en su orden (Horarios, el objetivo del producto, primero) y con
 * los tonos del tema en rotación. Cada una repite el destino, el nombre y el icono de su enlace de la
 * barra lateral (`components/navigation`); `homeSections.test.ts` falla si una sección de la barra no
 * tiene tarjeta o si divergen.
 */
export const HOME_SECTIONS: readonly HomeSection[] = [
  { key: 'schedules', to: '/horarios', Icon: CalendarClockIcon, tone: 'lavender' },
  { key: 'courses', to: '/cursos', Icon: BookOpenIcon, tone: 'peach' },
  { key: 'professors', to: '/profesores', Icon: PresentationIcon, tone: 'mint' },
  { key: 'students', to: '/alumnos', Icon: UsersRoundIcon, tone: 'yellow' },
  { key: 'calendars', to: '/calendarios', Icon: CalendarDaysIcon, tone: 'lavender' },
  { key: 'subjects', to: '/asignaturas', Icon: LibraryIcon, tone: 'peach' },
  { key: 'constraints', to: '/reglas', Icon: SlidersHorizontalIcon, tone: 'mint' },
];
