import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import type { Municipality } from '../services/registrationService';
import { MunicipalitySearch } from './MunicipalitySearch';

const municipalities: Municipality[] = [
  { code: '03014', name: 'Alacant/Alicante', province: 'Alicante/Alacant' },
  {
    code: '12040',
    name: 'Castelló de la Plana/Castellón de la Plana',
    province: 'Castellón/Castelló',
  },
  { code: '46250', name: 'València', province: 'Valencia/València' },
  { code: '46131', name: 'Alacuás', province: 'Valencia/València' },
];

/** El padre real guarda el código elegido: el buscador es un campo controlado. */
function ControlledSearch({
  onChange,
  value: initialValue = '',
  ...props
}: ComponentProps<typeof MunicipalitySearch>) {
  const [value, setValue] = useState(initialValue);
  return (
    <MunicipalitySearch
      {...props}
      value={value}
      onChange={(code) => {
        setValue(code);
        onChange(code);
      }}
    />
  );
}

function setup(props: Partial<ComponentProps<typeof MunicipalitySearch>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <ControlledSearch
      id="municipality"
      municipalities={municipalities}
      value=""
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, user: userEvent.setup(), input: screen.getByRole('combobox'), ...utils };
}

describe('MunicipalitySearch', () => {
  it('starts collapsed and shows the search placeholder', () => {
    const { input } = setup();

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute(
      'placeholder',
      es.registration.fields.municipalityCode.placeholder,
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filters by the typed text ignoring case and accents, and shows the province', async () => {
    const { user, input } = setup();

    await user.type(input, 'ALAC');

    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Alacant/Alicante — Alicante/Alacant',
      'Alacuás — Valencia/València',
    ]);
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('finds a municipality typed without its accents', async () => {
    const { user, input } = setup();

    await user.type(input, 'valencia');

    expect(
      screen.getByRole('option', { name: /València — Valencia\/València/ }),
    ).toBeInTheDocument();
  });

  it('shows at most 50 results', async () => {
    const many = Array.from({ length: 80 }, (_, index) => ({
      code: String(46000 + index),
      name: `Villa ${index}`,
      province: 'Valencia/València',
    }));
    const { user, input } = setup({ municipalities: many });

    await user.type(input, 'villa');

    expect(screen.getAllByRole('option')).toHaveLength(50);
  });

  it('selects the clicked option: reports its code and shows its name', async () => {
    const { user, input, onChange } = setup();

    await user.type(input, 'valen');
    await user.click(screen.getByRole('option', { name: /València/ }));

    expect(onChange).toHaveBeenLastCalledWith('46250');
    expect(input).toHaveValue('València');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects the active option with the keyboard', async () => {
    const { user, input, onChange } = setup();

    await user.type(input, 'alac');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]?.id);
    await user.keyboard('{ArrowUp}{Enter}');

    expect(onChange).toHaveBeenLastCalledWith('03014');
    expect(input).toHaveValue('Alacant/Alicante');
  });

  it('closes the list with Escape without selecting', async () => {
    const { user, input, onChange } = setup();

    await user.type(input, 'alac');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith('03014');
  });

  it('does not select free text: no code is reported and it says there are no results', async () => {
    const { user, input, onChange } = setup();

    await user.type(input, 'ciudad inventada');
    await user.keyboard('{Enter}');

    expect(screen.getByText(es.registration.municipalities.noResults)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/\d{5}/));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('clears the selection as soon as the text is edited', async () => {
    const { user, input, onChange } = setup();
    await user.type(input, 'valen');
    await user.click(screen.getByRole('option', { name: /València/ }));

    await user.type(input, 'x');

    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('shows the name of the municipality received as value', () => {
    const { input } = setup({ value: '46250' });

    expect(input).toHaveValue('València');
  });

  it('forwards the accessibility attributes of its field', () => {
    const { input } = setup({ isInvalid: true, 'aria-describedby': 'municipality-error' });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'municipality-error');
    expect(input).toHaveAttribute('id', 'municipality');
  });

  it('calls onBlur when the field loses focus', async () => {
    const onBlur = vi.fn();
    const { user, input } = setup({ onBlur });

    await user.click(input);
    await user.tab();

    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
