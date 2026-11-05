import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { exportDraft, exportIndex } from '../testSupport/exportDraft';
import { downloadFile } from '../utils/download';
import { indexDraft } from '../utils/scheduleDraftViews';
import type { ExportKind } from '../utils/scheduleExport';
import { ScheduleExportModal } from './ScheduleExportModal';

vi.mock('../utils/download', () => ({ downloadFile: vi.fn() }));

const texts = es.schedule.export;

interface Options {
  index?: typeof exportIndex;
  initial?: { kind: ExportKind; target: string };
  selected?: { classId: string | null; professorId: string | null };
  show?: boolean;
}

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

describe('ScheduleExportModal', () => {
  const onHide = vi.fn<() => void>();

  beforeEach(() => {
    onHide.mockReset();
    vi.mocked(downloadFile).mockReset();
  });

  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  function ui({ index = exportIndex, initial, selected, show = true }: Options = {}) {
    return (
      <ScheduleExportModal
        show={show}
        onHide={onHide}
        index={index}
        initial={initial ?? { kind: 'class', target: 'class-1a' }}
        selected={selected ?? { classId: 'class-1a', professorId: 'ana' }}
      />
    );
  }

  const renderModal = (options: Options = {}) => render(ui(options));
  const format = (name: string) =>
    within(screen.getByRole('group', { name: texts.format.label })).getByRole('radio', { name });
  const kind = (name: string) =>
    within(screen.getByRole('group', { name: texts.kind.label })).getByRole('radio', { name });
  const target = () =>
    screen.getByRole<HTMLSelectElement>('combobox', { name: texts.target.label });
  const optionTexts = () => [...target().options].map((option) => option.textContent);

  describe('the fields', () => {
    it('is a dialog named by its title', async () => {
      renderModal();

      expect(await screen.findByRole('dialog', { name: texts.title })).toBeVisible();
    });

    it('has a format group, a kind group and a select for which one', async () => {
      renderModal();
      await screen.findByRole('dialog');

      expect(format(texts.format.markdown)).toBeChecked();
      expect(format(texts.format.html)).not.toBeChecked();
      expect(kind(texts.kind.class)).toBeChecked();
      expect(kind(texts.kind.professor)).not.toBeChecked();
      expect(target()).toBeVisible();
    });

    it('offers all the classes and the classes grouped by course, in the order of the draft', async () => {
      renderModal();
      await screen.findByRole('dialog');

      expect(optionTexts()).toEqual([
        texts.target.allClasses,
        '1º Primaria A',
        '1º Primaria B',
        '5º Primaria A',
        '7º A',
      ]);
      const groups = [...target().querySelectorAll('optgroup')].map((group) => group.label);
      expect(groups).toEqual(['1º Primaria', '5º Primaria', '7º']);
    });

    it('offers all the professors and the professors by last name and first name', async () => {
      renderModal({ initial: { kind: 'professor', target: 'ana' } });
      await screen.findByRole('dialog');

      expect(optionTexts()).toEqual([texts.target.allProfessors, 'García, Ana', 'Pérez, Luis']);
    });
  });

  describe('where it starts', () => {
    it('starts on the class that is being seen', async () => {
      renderModal({ initial: { kind: 'class', target: 'class-1b' } });
      await screen.findByRole('dialog');

      expect(kind(texts.kind.class)).toBeChecked();
      expect(target()).toHaveValue('class-1b');
    });

    it('starts on the professor that is being seen', async () => {
      renderModal({ initial: { kind: 'professor', target: 'luis' } });
      await screen.findByRole('dialog');

      expect(kind(texts.kind.professor)).toBeChecked();
      expect(target()).toHaveValue('luis');
    });

    it('starts on all the classes when the whole school is being seen', async () => {
      renderModal({ initial: { kind: 'class', target: 'all' } });
      await screen.findByRole('dialog');

      expect(target()).toHaveValue('all');
      expect(optionTexts()[0]).toBe(texts.target.allClasses);
    });

    it('goes to the professor of the page when the kind changes, and back to the class', async () => {
      const user = userEvent.setup();
      renderModal({ selected: { classId: 'class-1b', professorId: 'luis' } });
      await screen.findByRole('dialog');

      await user.click(kind(texts.kind.professor));
      expect(target()).toHaveValue('luis');
      await user.selectOptions(target(), 'ana');
      await user.click(kind(texts.kind.class));

      expect(target()).toHaveValue('class-1b');
    });

    it('goes to all of them when the page has no class or professor selected', async () => {
      const user = userEvent.setup();
      renderModal({ selected: { classId: null, professorId: null } });
      await screen.findByRole('dialog');

      await user.click(kind(texts.kind.professor));
      expect(target()).toHaveValue('all');
      await user.click(kind(texts.kind.class));

      expect(target()).toHaveValue('all');
    });

    it('does not offer a professor when none has sessions, and says why', async () => {
      const noProfessors = indexDraft({
        ...exportDraft,
        professors: [],
        entries: exportDraft.entries.map((entry) => ({ ...entry, professorId: null })),
      });
      renderModal({ index: noProfessors });
      await screen.findByRole('dialog');

      expect(kind(texts.kind.professor)).toBeDisabled();
      expect(kind(texts.kind.professor)).toHaveAccessibleDescription(texts.kind.noProfessors);
    });
  });

  describe('downloading', () => {
    it('downloads one class as Markdown and closes', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: texts.download }));

      expect(downloadFile).toHaveBeenCalledTimes(1);
      const file = vi.mocked(downloadFile).mock.calls[0]?.[0];
      expect(file?.fileName).toBe('horario-1o-primaria-a.md');
      expect(file?.mimeType).toBe('text/markdown;charset=utf-8');
      expect(file?.content).toContain('# Horario de 1º Primaria A');
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('downloads all the professors as HTML', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(format(texts.format.html));
      await user.click(kind(texts.kind.professor));
      await user.selectOptions(target(), 'all');
      await user.click(screen.getByRole('button', { name: texts.download }));

      const file = vi.mocked(downloadFile).mock.calls[0]?.[0];
      expect(file?.fileName).toBe('horarios-profesores-2026-11-04.html');
      expect(file?.mimeType).toBe('text/html;charset=utf-8');
      expect(file?.content).toContain('<html lang="es">');
    });

    it('writes the document in the language of the interface', async () => {
      await i18n.changeLanguage('en');
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: 'Download' }));

      const file = vi.mocked(downloadFile).mock.calls[0]?.[0];
      expect(file?.fileName).toBe('timetable-1o-primaria-a.md');
      expect(file?.content).toContain('# Timetable of 1º Primaria A');
    });

    it('closes without downloading on Cancel and on Escape', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: texts.cancel }));
      await user.keyboard('{Escape}');

      expect(onHide).toHaveBeenCalledTimes(2);
      expect(downloadFile).not.toHaveBeenCalled();
    });

    it('starts again from what is being seen when it is opened again', async () => {
      const user = userEvent.setup();
      const view = renderModal();
      await screen.findByRole('dialog');
      await user.click(format(texts.format.html));
      await user.click(kind(texts.kind.professor));

      view.rerender(ui({ show: false }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      view.rerender(ui({ show: true }));
      await screen.findByRole('dialog');

      expect(format(texts.format.markdown)).toBeChecked();
      expect(kind(texts.kind.class)).toBeChecked();
      expect(target()).toHaveValue('class-1a');
    });

    it('does not touch the address nor the storage of the browser', async () => {
      const user = userEvent.setup();
      const address = window.location.href;
      renderModal();
      await screen.findByRole('dialog');

      await user.click(format(texts.format.html));
      await user.click(screen.getByRole('button', { name: texts.download }));

      expect(window.location.href).toBe(address);
      expect(window.localStorage).toHaveLength(0);
      expect(window.sessionStorage).toHaveLength(0);
    });
  });

  describe('accessibility', () => {
    it('has no WCAG violations by class', async () => {
      renderModal();
      const dialog = await screen.findByRole('dialog');

      await expect(wcagViolations(dialog)).resolves.toEqual([]);
    });

    it('has no WCAG violations by professor', async () => {
      renderModal({ initial: { kind: 'professor', target: 'ana' } });
      const dialog = await screen.findByRole('dialog');

      await expect(wcagViolations(dialog)).resolves.toEqual([]);
    });

    it('has no WCAG violations with Professor disabled', async () => {
      const noProfessors = indexDraft({
        ...exportDraft,
        professors: [],
        entries: exportDraft.entries.map((entry) => ({ ...entry, professorId: null })),
      });
      renderModal({ index: noProfessors });
      const dialog = await screen.findByRole('dialog');

      await expect(wcagViolations(dialog)).resolves.toEqual([]);
    });
  });
});
