import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { ConfirmSuspendModal } from './ConfirmSuspendModal';

const texts = es.users.confirmSuspend;

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

function renderModal(show = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmSuspendModal
      show={show}
      userName="José María García-López"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { ...view, onConfirm, onCancel };
}

describe('ConfirmSuspendModal', () => {
  it('renders nothing while it is not shown', () => {
    renderModal(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a dialog named by its title that names the user and warns that the sessions are closed', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: texts.title });
    expect(dialog).toHaveTextContent('José María García-López');
    expect(dialog).toHaveTextContent(texts.message.replace('{{name}}', 'José María García-López'));
  });

  it('starts with the focus on Cancel, the safe choice', async () => {
    renderModal();

    expect(await screen.findByRole('button', { name: texts.cancel })).toHaveFocus();
  });

  it('calls onConfirm, and only onConfirm, when the suspension is confirmed', async () => {
    const { onConfirm, onCancel } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: texts.confirm }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel, and only onCancel, with Cancel', async () => {
    const { onConfirm, onCancel } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: texts.cancel }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel with Escape', async () => {
    const { onConfirm, onCancel } = renderModal();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('returns the focus to the button that opened it when it closes', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>abrir</button>
          <ConfirmSuspendModal
            show={open}
            userName="Ana"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'abrir' });
    await userEvent.click(opener);
    await userEvent.click(await screen.findByRole('button', { name: texts.cancel }));

    await vi.waitFor(() => expect(opener).toHaveFocus());
  });

  it('has no WCAG 2.1 AA violations', async () => {
    renderModal();
    await screen.findByRole('dialog');

    expect(await wcagViolations(document.body)).toEqual([]);
  });
});
