import Dropdown from 'react-bootstrap/Dropdown';
import { useTranslation } from 'react-i18next';
import type { SessionData } from '../services/sessionService';
import { initialsOf } from '../utils/initials';

type UserMenuProps = {
  user: Pick<SessionData['user'], 'firstName' | 'lastName' | 'role'>;
  schoolName: string;
  /** El cierre de sesión está en curso: la opción se deshabilita. */
  isClosing: boolean;
  onLogout: () => void;
};

/**
 * Menú de usuario de la cabecera: las iniciales, el nombre y el rol en el botón y, al abrirlo, el
 * nombre, el rol, el colegio y «Cerrar sesión». Es de presentación: la sesión y el cierre los lleva
 * `AppShell`. Los nombres se pintan como texto plano.
 */
export function UserMenu({ user, schoolName, isClosing, onLogout }: UserMenuProps) {
  const { t, i18n } = useTranslation();
  const fullName = `${user.firstName} ${user.lastName}`;
  const role = t(`shell.role.${user.role}`);

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        as="button"
        type="button"
        className="cs-user-toggle"
        aria-label={t('shell.userMenu', { name: fullName, interpolation: { escapeValue: false } })}
        data-testid="user-menu-toggle"
      >
        <span className="cs-avatar cs-tone-peach" aria-hidden="true">
          {initialsOf(user.firstName, user.lastName, i18n.language)}
        </span>
        <span className="d-none d-sm-block lh-sm">
          <span className="d-block fw-bold small">{fullName}</span>
          <span className="d-block small text-body-secondary">{role}</span>
        </span>
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.ItemText className="lh-sm">
          <span className="d-block fw-bold">{fullName}</span>
          <span className="d-block small text-body-secondary">{role}</span>
          <span className="d-block small text-body-secondary text-break">{schoolName}</span>
        </Dropdown.ItemText>
        <Dropdown.Divider />
        <Dropdown.Item as="button" type="button" disabled={isClosing} onClick={onLogout}>
          {t('header.logout')}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
