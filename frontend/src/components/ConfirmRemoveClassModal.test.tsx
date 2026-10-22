import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { ConfirmRemoveClassModal, type ClassToRemove } from './ConfirmRemoveClassModal';

const texts = es.courses.form.removeDialog;

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

function renderModal(pending: ClassToRemove | null = { name: 'A', studentCount: 12 }) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const onExited = vi.fn();
  const view = render(
    <ConfirmRemoveClassModal
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onExited={onExited}
    />,
  );
  return { ...view, onConfirm, onCancel, onExited };
}

describe('ConfirmRemoveClassModal', () => {
  it('renders nothing while there is no class to remove', () => {
    renderModal(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a dialog named by its title, with the class and the number of students', () => {
    renderModal({ name: 'A', studentCount: 12 });

    const dialog = screen.getByRole('dialog', { name: '¿Quitar la clase A?' });
    expect(dialog).toHaveTextContent(
      'La clase A tiene 12 alumnos. Al guardar el curso quedarán en él sin clase.',
    );
  });

  it('uses the singular with one student', () => {
    renderModal({ name: 'B', studentCount: 1 });

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'La clase B tiene 1 alumno. Al guardar el curso quedará en él sin clase.',
    );
  });

  it('shows the name as plain text', () => {
    renderModal({ name: '<b>A</b>', studentCount: 2 });

    expect(screen.getByRole('dialog', { name: '¿Quitar la clase <b>A</b>?' })).toBeVisible();
    expect(document.querySelector('[role="dialog"] b')).toBeNull();
  });

  it('starts with the focus on Cancel, the safe choice, and has no close button in the header', async () => {
    renderModal();

    expect(await screen.findByRole('button', { name: texts.cancel })).toHaveFocus();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      texts.cancel,
      texts.confirm,
    ]);
  });

  it('calls onConfirm, and only onConfirm, with the confirm button', async () => {
    const { onConfirm, onCancel } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: texts.confirm }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel with Cancel and with Escape, and never onConfirm', async () => {
    const { onConfirm, onCancel } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: texts.cancel }));
    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps showing the last class while it closes and then calls onExited', async () => {
    function Harness({ onExited }: { onExited: () => void }) {
      const [pending, setPending] = useState<ClassToRemove | null>({ name: 'A', studentCount: 3 });
      return (
        <ConfirmRemoveClassModal
          pending={pending}
          onConfirm={() => {
            setPending(null);
          }}
          onCancel={() => {
            setPending(null);
          }}
          onExited={onExited}
        />
      );
    }
    const onExited = vi.fn();
    render(<Harness onExited={onExited} />);

    await userEvent.click(screen.getByRole('button', { name: texts.confirm }));

    await waitFor(() => {
      expect(onExited).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no accessibility violations when it is open', async () => {
    renderModal();

    await screen.findByRole('dialog');

    expect(await wcagViolations(document.body)).toEqual([]);
  });
});
