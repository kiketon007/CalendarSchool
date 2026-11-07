import { useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import CloseButton from 'react-bootstrap/CloseButton';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router';
import { useSession } from '../session/SessionProvider';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { CalendarClockIcon } from './icons/CalendarClockIcon';
import { CalendarDaysIcon } from './icons/CalendarDaysIcon';
import { GraduationCapIcon } from './icons/GraduationCapIcon';
import { HouseIcon } from './icons/HouseIcon';
import type { IconProps } from './icons/IconProps';
import { LibraryIcon } from './icons/LibraryIcon';
import { MenuIcon } from './icons/MenuIcon';
import { PresentationIcon } from './icons/PresentationIcon';
import { SlidersHorizontalIcon } from './icons/SlidersHorizontalIcon';
import { UserCogIcon } from './icons/UserCogIcon';
import { UsersRoundIcon } from './icons/UsersRoundIcon';
import { UserMenu } from './UserMenu';

type NavItem = {
  to: string;
  labelKey: string;
  Icon: ComponentType<IconProps>;
  /** «Inicio» solo está activo en su propia ruta; los demás también en sus subrutas. */
  end?: boolean;
};

/** «Espacio de trabajo»: para los dos roles y en este orden. */
const WORKSPACE_LINKS: readonly NavItem[] = [
  { to: '/onboarding', labelKey: 'shell.home', Icon: HouseIcon, end: true },
  { to: '/cursos', labelKey: 'header.courses', Icon: BookOpenIcon },
  { to: '/profesores', labelKey: 'header.professors', Icon: PresentationIcon },
  { to: '/alumnos', labelKey: 'header.students', Icon: UsersRoundIcon },
  { to: '/calendarios', labelKey: 'header.calendars', Icon: CalendarDaysIcon },
  { to: '/asignaturas', labelKey: 'header.subjects', Icon: LibraryIcon },
  { to: '/reglas', labelKey: 'header.constraints', Icon: SlidersHorizontalIcon },
  { to: '/horarios', labelKey: 'header.schedule', Icon: CalendarClockIcon },
];

/** «Administración»: solo para el rol `ADMIN`. */
const ADMIN_LINKS: readonly NavItem[] = [
  { to: '/usuarios', labelKey: 'header.users', Icon: UserCogIcon },
];

type AppShellProps = {
  /** La página: cada una pinta su propio `main`. */
  children: ReactNode;
};

/**
 * Marco de las páginas autenticadas: el enlace «Saltar al contenido», la barra lateral con la
 * navegación (columna fija desde `lg`, panel deslizante por debajo), la cabecera con el menú de
 * usuario y el contenedor de la página. Lo monta `AuthenticatedLayout`, que garantiza la sesión; sin
 * ella solo pinta la página. El cierre de sesión no pide confirmación: cerrarlo por error solo cuesta
 * volver a entrar.
 */
export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation();
  const { state, logout } = useSession();
  const navigate = useNavigate();
  const [panelOpen, setPanelOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [failed, setFailed] = useState(false);
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte la opción.
  const isClosingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  if (state.status !== 'authenticated') {
    return <>{children}</>;
  }

  const { user, school } = state.data;
  const closePanel = () => {
    setPanelOpen(false);
  };

  async function handleLogout() {
    if (isClosingRef.current) {
      return;
    }
    isClosingRef.current = true;
    setIsClosing(true);
    setFailed(false);
    const outcome = await logout();
    if (outcome.status === 'loggedOut') {
      void navigate('/login', { replace: true });
      return;
    }
    isClosingRef.current = false;
    setIsClosing(false);
    setFailed(true);
  }

  // El foco va al contenedor por código y no con el fragmento de la dirección: el router no tiene que
  // interpretar `#contenido` y la dirección no cambia.
  function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    contentRef.current?.focus();
  }

  function renderLinks(items: readonly NavItem[]) {
    return items.map(({ to, labelKey, Icon, end }) => (
      <li key={to}>
        <NavLink to={to} end={end} className="cs-nav-link" onClick={closePanel}>
          <Icon />
          {t(labelKey)}
        </NavLink>
      </li>
    ));
  }

  return (
    <>
      <a
        href="#contenido"
        className="cs-skip-link visually-hidden-focusable"
        onClick={skipToContent}
      >
        {t('shell.skipToContent')}
      </a>
      <div className="cs-shell d-lg-flex">
        <div className="cs-sidebar">
          <Offcanvas
            show={panelOpen}
            onHide={closePanel}
            responsive="lg"
            placement="start"
            // Solo el panel modal es un diálogo y necesita nombre; en línea sería un `div` sin rol.
            aria-label={panelOpen ? t('shell.menu') : undefined}
            data-testid="app-sidebar"
          >
            <Offcanvas.Body>
              <div className="d-flex align-items-center justify-content-between gap-2">
                <Link to="/onboarding" className="cs-brand" onClick={closePanel}>
                  <span className="cs-brand-mark">
                    <GraduationCapIcon width="22" height="22" />
                  </span>
                  <span>
                    {t('shell.brandStart')}
                    <span className="cs-brand-end">{t('shell.brandEnd')}</span>
                  </span>
                </Link>
                <CloseButton
                  className="d-lg-none"
                  aria-label={t('shell.closeMenu')}
                  onClick={closePanel}
                />
              </div>
              <nav aria-label={t('header.navigation')} className="d-flex flex-column gap-4">
                <div>
                  <p id="shell-workspace" className="cs-nav-heading">
                    {t('shell.workspace')}
                  </p>
                  <ul className="cs-nav-list" aria-labelledby="shell-workspace">
                    {renderLinks(WORKSPACE_LINKS)}
                  </ul>
                </div>
                {user.role === 'ADMIN' && (
                  <div>
                    <p id="shell-administration" className="cs-nav-heading">
                      {t('shell.administration')}
                    </p>
                    <ul className="cs-nav-list" aria-labelledby="shell-administration">
                      {renderLinks(ADMIN_LINKS)}
                    </ul>
                  </div>
                )}
              </nav>
            </Offcanvas.Body>
          </Offcanvas>
        </div>
        <div className="cs-shell-main">
          <header className="cs-topbar" data-testid="app-header">
            <Button
              variant="outline-secondary"
              className="d-lg-none"
              aria-label={t('shell.openMenu')}
              aria-haspopup="dialog"
              aria-expanded={panelOpen}
              onClick={() => {
                setPanelOpen(true);
              }}
            >
              <MenuIcon />
            </Button>
            <div className="ms-auto">
              <UserMenu
                user={user}
                schoolName={school.name}
                isClosing={isClosing}
                onLogout={() => void handleLogout()}
              />
            </div>
          </header>
          {failed && (
            <Alert variant="danger" className="mx-3 mx-lg-4 mt-3 mb-0" role="alert">
              {t('header.logoutError')}
            </Alert>
          )}
          <div id="contenido" ref={contentRef} tabIndex={-1}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
