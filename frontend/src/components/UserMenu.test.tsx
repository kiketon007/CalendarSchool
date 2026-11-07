import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { UserMenu } from './UserMenu';

const admin = { firstName: 'José María', lastName: 'García-López', role: 'ADMIN' } as const;
const member = { firstName: 'Ana', lastName: 'Pérez', role: 'MEMBER' } as const;

type Props = Partial<Parameters<typeof UserMenu>[0]>;

function renderMenu({ user = admin, schoolName = 'CEIP Lluís Vives', ...rest }: Props = {}) {
  const onLogout = vi.fn();
  const view = render(
    <UserMenu
      user={user}
      schoolName={schoolName}
      isClosing={false}
      onLogout={onLogout}
      {...rest}
    />,
  );
  return { ...view, onLogout };
}

const toggle = (name = 'Menú de José María García-López') => screen.getByRole('button', { name });
const logoutOption = () => screen.getByRole('button', { name: es.header.logout });
/** El menú desplegado: react-bootstrap lo pinta con la clase `show` solo mientras está abierto. */
const openMenu = () => document.querySelector('.dropdown-menu.show');

/** Reglas automáticas de WCAG 2.1 nivel AA. El contraste lo mide el navegador, no jsdom. */
async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
}

describe('UserMenu', () => {
  it('names the button after the user and shows the initials in a decorative circle', () => {
    renderMenu();

    const button = toggle();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const avatar = button.querySelector('.cs-avatar');
    expect(avatar).toHaveTextContent('JG');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the name and the role next to the initials', () => {
    renderMenu();

    expect(toggle()).toHaveTextContent('José María García-López');
    expect(toggle()).toHaveTextContent(es.shell.role.ADMIN);
  });

  it('shows the name, the role and the school as text when it opens', async () => {
    renderMenu();

    await userEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(openMenu()).toHaveTextContent('José María García-López');
    expect(openMenu()).toHaveTextContent(es.shell.role.ADMIN);
    expect(openMenu()).toHaveTextContent('CEIP Lluís Vives');
    expect(logoutOption()).toBeVisible();
  });

  it('says Member for a member', async () => {
    renderMenu({ user: member });

    await userEvent.click(toggle('Menú de Ana Pérez'));

    expect(openMenu()).toHaveTextContent(es.shell.role.MEMBER);
    expect(openMenu()).not.toHaveTextContent(es.shell.role.ADMIN);
  });

  it('shows names with markup as plain text', async () => {
    renderMenu({
      user: { firstName: '<b>Ana</b>', lastName: 'Pérez', role: 'MEMBER' },
      schoolName: '<i>Colegio</i>',
    });

    await userEvent.click(screen.getByRole('button', { name: /Menú de/ }));

    expect(openMenu()).toHaveTextContent('<i>Colegio</i>');
    expect(openMenu()).toHaveTextContent('<b>Ana</b> Pérez');
    expect(document.querySelector('b, i')).toBeNull();
  });

  it('asks to log out when the option is chosen, and closes the menu', async () => {
    const { onLogout } = renderMenu();

    await userEvent.click(toggle());
    await userEvent.click(logoutOption());

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables the log out option while the session is closing', async () => {
    const { onLogout } = renderMenu({ isClosing: true });

    await userEvent.click(toggle());
    await userEvent.click(logoutOption());

    expect(logoutOption()).toHaveAttribute('aria-disabled', 'true');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('closes with Escape and gives the focus back to its button', async () => {
    renderMenu();

    await userEvent.click(toggle());
    await userEvent.keyboard('{Escape}');

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveFocus();
  });

  it('opens with the keyboard and reaches the option with the arrow key', async () => {
    renderMenu();

    toggle().focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{ArrowDown}');
    expect(logoutOption()).toHaveFocus();
  });

  it('has no accessibility violations, closed or open', async () => {
    const { container } = renderMenu();
    expect(await wcagViolations(container)).toEqual([]);

    await userEvent.click(toggle());
    expect(await wcagViolations(document.body)).toEqual([]);
  });
});
