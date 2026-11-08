import type { ComponentType } from 'react';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { CalendarClockIcon } from './icons/CalendarClockIcon';
import { CalendarDaysIcon } from './icons/CalendarDaysIcon';
import { HouseIcon } from './icons/HouseIcon';
import type { IconProps } from './icons/IconProps';
import { LibraryIcon } from './icons/LibraryIcon';
import { PresentationIcon } from './icons/PresentationIcon';
import { SlidersHorizontalIcon } from './icons/SlidersHorizontalIcon';
import { UserCogIcon } from './icons/UserCogIcon';
import { UsersRoundIcon } from './icons/UsersRoundIcon';

export type NavItem = {
  to: string;
  labelKey: string;
  Icon: ComponentType<IconProps>;
  /** «Inicio» solo está activo en su propia ruta; los demás también en sus subrutas. */
  end?: boolean;
};

/** «Espacio de trabajo» de la barra lateral: para los dos roles y en este orden. La portada se ata a esta lista. */
export const WORKSPACE_LINKS: readonly NavItem[] = [
  { to: '/onboarding', labelKey: 'shell.home', Icon: HouseIcon, end: true },
  { to: '/cursos', labelKey: 'header.courses', Icon: BookOpenIcon },
  { to: '/profesores', labelKey: 'header.professors', Icon: PresentationIcon },
  { to: '/alumnos', labelKey: 'header.students', Icon: UsersRoundIcon },
  { to: '/calendarios', labelKey: 'header.calendars', Icon: CalendarDaysIcon },
  { to: '/asignaturas', labelKey: 'header.subjects', Icon: LibraryIcon },
  { to: '/reglas', labelKey: 'header.constraints', Icon: SlidersHorizontalIcon },
  { to: '/horarios', labelKey: 'header.schedule', Icon: CalendarClockIcon },
];

/** «Administración» de la barra lateral: solo para el rol `ADMIN`. */
export const ADMIN_LINKS: readonly NavItem[] = [
  { to: '/usuarios', labelKey: 'header.users', Icon: UserCogIcon },
];
