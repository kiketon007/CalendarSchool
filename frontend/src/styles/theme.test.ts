import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { beforeAll, describe, expect, it } from 'vitest';
import { contrastRatio } from '../testSupport/contrast';

const require = createRequire(import.meta.url);
const themePath = resolve(dirname(fileURLToPath(import.meta.url)), 'theme.scss');
// `bootstrap/scss/...` se resuelve desde el directorio que contiene el paquete (en el workspace, el
// `node_modules` de la raíz).
const bootstrapParent = resolve(dirname(require.resolve('bootstrap/package.json')), '..');

let css = '';
const warnings: string[] = [];

beforeAll(() => {
  // Las mismas opciones de avisos que `css.preprocessorOptions.scss` de vite.config.ts (design.md D2).
  css = compile(themePath, {
    loadPaths: [bootstrapParent],
    quietDeps: true,
    silenceDeprecations: ['import'],
    logger: {
      warn: (message) => {
        warnings.push(message);
      },
    },
  }).css;
}, 60_000);

/** Declaraciones de la primera regla cuyo selector es exactamente `selector`. */
function declarationsOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (rule?.[1] === undefined) {
    throw new Error(`No hay ninguna regla ${selector} en el CSS compilado`);
  }
  return rule[1];
}

/** Valor de una declaración (propiedad o variable CSS) dentro de las de una regla. */
function valueOf(selector: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = new RegExp(`(?<![\\w-])${escaped}\\s*:\\s*([^;]+);`).exec(
    declarationsOf(selector),
  )?.[1];
  if (value === undefined) {
    throw new Error(`${selector} no declara ${property}`);
  }
  return value.trim();
}

describe('theme.scss: tokens de Bootstrap', () => {
  it('gives the headings the heavy weight and the tight spacing of the design', () => {
    expect(valueOf('h1, .h1,\nh2,\n.h2,\nh3,\n.h3', 'letter-spacing')).toBe('-0.03em');
    // Bootstrap agrupa los titulares en una sola regla (`h6, h5, ... .h1`): el peso va en ella.
    expect(valueOf('h6, .h6, h5, .h5, h4, .h4, h3, .h3, h2, .h2, h1, .h1', 'font-weight')).toBe(
      '800',
    );
  });

  it('compiles without Sass warnings', () => {
    expect(warnings).toEqual([]);
  });

  it('colours the page with the brand palette', () => {
    expect(valueOf(':root,\n[data-bs-theme=light]', '--bs-primary')).toBe('#5b5bd6');
    expect(valueOf(':root,\n[data-bs-theme=light]', '--bs-body-bg')).toBe('#f7f8fc');
    expect(valueOf(':root,\n[data-bs-theme=light]', '--bs-body-color')).toBe('#17233b');
    expect(valueOf(':root,\n[data-bs-theme=light]', '--bs-secondary-color')).toBe('#5b6478');
    expect(valueOf(':root,\n[data-bs-theme=light]', '--bs-border-color')).toBe('#e7e9f0');
  });

  it('colours the primary button and the form fields from the tokens', () => {
    expect(valueOf('.btn-primary', '--bs-btn-bg')).toBe('#5b5bd6');
    expect(valueOf('.btn-primary', '--bs-btn-color')).toBe('#fff');
    expect(valueOf('.form-control', 'border')).toBe('var(--bs-border-width) solid #868e9f');
    expect(valueOf('.form-control', 'background-color')).toBe('#fff');
  });
});

const PAGE_BG = '#f7f8fc';
const WHITE = '#fff';
const ROOT = ':root,\n[data-bs-theme=light]';

/** Comprueba un contraste mínimo y, si falla, el mensaje nombra la pareja y su valor. */
function expectContrast(name: string, foreground: string, background: string, minimum: number) {
  const ratio = contrastRatio(foreground, background);
  expect(
    ratio,
    `${name}: ${foreground} sobre ${background} da ${ratio.toFixed(2)}:1 (mínimo ${minimum}:1)`,
  ).toBeGreaterThanOrEqual(minimum);
}

describe('theme.scss: contraste (WCAG 2.1 AA)', () => {
  const text = () => valueOf(ROOT, '--bs-body-color');
  const secondary = () => valueOf(ROOT, '--bs-secondary-color');
  const link = () => valueOf(ROOT, '--bs-link-color');

  it.each([
    ['page background', PAGE_BG],
    ['white surface', WHITE],
  ])('keeps the text, the secondary text and the links readable on the %s', (_name, background) => {
    expectContrast('texto principal', text(), background, 4.5);
    expectContrast('texto secundario', secondary(), background, 4.5);
    expectContrast('enlaces', link(), background, 4.5);
  });

  it('keeps the primary button text readable on the brand colour', () => {
    expectContrast(
      'texto del botón primario',
      valueOf('.btn-primary', '--bs-btn-color'),
      valueOf('.btn-primary', '--bs-btn-bg'),
      4.5,
    );
  });

  it('keeps the border of the form fields perceptible (WCAG 1.4.11)', () => {
    const border = /solid (#[0-9a-f]{3,6})$/i.exec(valueOf('.form-control', 'border'))?.[1];
    expect(border, 'el borde de .form-control debe ser un color hexadecimal').toBeDefined();
    expectContrast(
      'borde de los campos',
      border ?? '',
      valueOf('.form-control', 'background-color'),
      3,
    );
  });
});

describe('theme.scss: clases compartidas (cs-)', () => {
  it('defines the card surface', () => {
    expect(valueOf('.cs-card', 'background-color')).toBe('#fff');
    expect(valueOf('.cs-card', 'border')).toBe('var(--bs-border-width) solid #e7e9f0');
    expect(valueOf('.cs-card', 'border-radius')).toBe('1rem');
    expect(valueOf('.cs-card', 'padding')).toBe('1.5rem');
  });

  it('tightens the card padding on narrow screens', () => {
    expect(css).toMatch(/@media \(max-width: 575\.98px\) \{\s*\.cs-card \{\s*padding: 1rem;/);
  });

  it('defines the eyebrow at 12 px or more, in the brand colour', () => {
    expect(valueOf('.cs-eyebrow', 'font-size')).toBe('0.75rem');
    expect(valueOf('.cs-eyebrow', 'font-weight')).toBe('700');
    expect(valueOf('.cs-eyebrow', 'text-transform')).toBe('uppercase');
    expect(valueOf('.cs-eyebrow', 'letter-spacing')).toBe('0.14em');
    expect(valueOf('.cs-eyebrow', 'color')).toBe('#5b5bd6');
    expectContrast('sobretítulo sobre blanco', '#5b5bd6', WHITE, 4.5);
    expectContrast('sobretítulo sobre el fondo de página', '#5b5bd6', PAGE_BG, 4.5);
  });

  it.each([
    ['lavender', '#eeefff', '#5b5bd6'],
    ['peach', '#fff0ea', '#b0522f'],
    ['mint', '#e6f8f0', '#1f7a56'],
    ['yellow', '#fff6d9', '#8a5e0c'],
  ])('defines the %s tone with a readable foreground', (tone, background, foreground) => {
    expect(valueOf(`.cs-tone-${tone}`, 'background-color')).toBe(background);
    expect(valueOf(`.cs-tone-${tone}`, 'color')).toBe(foreground);
    expectContrast(`tono ${tone}`, foreground, background, 4.5);
  });

  it('only animates under prefers-reduced-motion: no-preference', () => {
    const own = css.slice(css.indexOf('.cs-card'));
    const outside = own.replace(
      /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/g,
      '',
    );
    expect(outside).not.toContain('transition');
  });

  it('keeps Bootstrap switching its own transitions off under prefers-reduced-motion: reduce', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

/** Declaraciones de una regla que está dentro de un `@media` con la consulta indicada. */
function declarationsInMedia(query: string, selector: string): string {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`@media ${escape(query)} \\{([\\s\\S]*?)\\n\\}`, 'g');
  for (const [, inside] of css.matchAll(block)) {
    const rule = new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`).exec(inside ?? '');
    if (rule?.[1] !== undefined) {
      return rule[1];
    }
  }
  throw new Error(`No hay ninguna regla ${selector} dentro de @media ${query}`);
}

describe('theme.scss: marco de la aplicación', () => {
  it('lets the sidebar wrapper disappear from the layout below lg', () => {
    expect(valueOf('.cs-sidebar', 'display')).toBe('contents');
  });

  it('keeps the sidebar a sticky white column of 254 px from lg up', () => {
    const rule = declarationsInMedia('(min-width: 992px)', '.cs-sidebar');
    expect(rule).toMatch(/(?<![\w-])width:\s*254px;/);
    expect(rule).toMatch(/position:\s*sticky;/);
    expect(rule).toMatch(/(?<![\w-])top:\s*0;/);
    expect(rule).toMatch(/(?<![\w-])height:\s*100vh;/);
    expect(rule).toMatch(/background-color:\s*#fff;/);
    expect(rule).toMatch(/border-right:\s*var\(--bs-border-width\) solid #e7e9f0;/);
  });

  it('gives the off-canvas panel the same width and a white background below lg', () => {
    expect(css).toMatch(/--bs-offcanvas-width:\s*254px;/);
    expect(css).toMatch(/--bs-offcanvas-bg:\s*#fff;/);
  });

  it('sticks the top bar to the top of the page', () => {
    expect(valueOf('.cs-topbar', 'position')).toBe('sticky');
    expect(valueOf('.cs-topbar', 'top')).toBe('0');
    expect(valueOf('.cs-topbar', 'background-color')).toBe('#fff');
  });

  it('marks the active navigation link with the lavender tone, the brand colour and a heavier weight', () => {
    expect(valueOf('.cs-nav-link', 'color')).toBe('#5b6478');
    expect(valueOf('.cs-nav-link.active', 'background-color')).toBe('#eeefff');
    expect(valueOf('.cs-nav-link.active', 'color')).toBe('#5b5bd6');
    expect(valueOf('.cs-nav-link.active', 'font-weight')).toBe('700');
  });

  it('keeps the navigation text readable', () => {
    expectContrast('enlace de la barra', valueOf('.cs-nav-link', 'color'), WHITE, 4.5);
    expectContrast(
      'enlace activo',
      valueOf('.cs-nav-link.active', 'color'),
      valueOf('.cs-nav-link.active', 'background-color'),
      4.5,
    );
    expectContrast('título de grupo', valueOf('.cs-nav-heading', 'color'), WHITE, 4.5);
    expect(valueOf('.cs-nav-heading', 'font-size')).toBe('0.75rem');
  });

  it('draws the avatar as a decorative circle', () => {
    expect(valueOf('.cs-avatar', 'border-radius')).toBe('50%');
    expect(valueOf('.cs-avatar', 'width')).toBe('2.25rem');
    expect(valueOf('.cs-avatar', 'height')).toBe('2.25rem');
  });

  it('shows the skip link over the page only while it has the focus', () => {
    expect(valueOf('.cs-skip-link:focus', 'position')).toBe('fixed');
    expect(valueOf('.cs-skip-link:focus', 'background-color')).toBe('#fff');
    expectContrast(
      'enlace de salto',
      valueOf('.cs-skip-link:focus', 'color'),
      valueOf('.cs-skip-link:focus', 'background-color'),
      4.5,
    );
  });

  it('does not draw an outline on the content container, which only receives the focus by code', () => {
    expect(valueOf('#contenido:focus', 'outline')).toBe('0');
  });
});

describe('theme.scss: páginas de listado', () => {
  const DAY_PANEL_BG = '#fafaff';

  it('lays the block header out as a wrapping row with the search on the right', () => {
    expect(valueOf('.cs-list-header', 'display')).toBe('flex');
    expect(valueOf('.cs-list-header', 'flex-wrap')).toBe('wrap');
    expect(valueOf('.cs-list-header', 'justify-content')).toBe('space-between');
  });

  it('draws the search magnifier as a decorative icon inside the field', () => {
    expect(valueOf('.cs-search', 'position')).toBe('relative');
    expect(valueOf('.cs-search-icon', 'position')).toBe('absolute');
    expect(valueOf('.cs-search-icon', 'pointer-events')).toBe('none');
    expect(valueOf('.cs-search .form-control', 'padding-left')).toBe('2.25rem');
    expect(declarationsInMedia('(min-width: 576px)', '.cs-search')).toMatch(/width:\s*20rem;/);
  });

  it('separates the rows of a list with a line, except the last one', () => {
    expect(valueOf('.cs-list-item', 'border-bottom')).toBe('var(--bs-border-width) solid #e7e9f0');
    expect(valueOf('.cs-list-item:last-child', 'border-bottom')).toBe('0');
  });

  it('draws the calendar stripe and mark with CSS only', () => {
    expect(valueOf('.cs-calendar-card', 'position')).toBe('relative');
    expect(valueOf('.cs-calendar-card', 'overflow')).toBe('hidden');
    expect(valueOf('.cs-calendar-card::before', 'content')).toBe('""');
    expect(valueOf('.cs-calendar-card::before', 'position')).toBe('absolute');
    expect(valueOf('.cs-calendar-card::before', 'height')).toBe('0.25rem');
    expect(valueOf('.cs-calendar-mark', 'width')).toBe('2.5rem');
    expect(valueOf('.cs-calendar-mark', 'height')).toBe('2.5rem');
    expect(valueOf('.cs-calendar-mark', 'justify-content')).toBe('center');
  });

  it('keeps the section labels at 12 px or more and readable', () => {
    expect(valueOf('.cs-section-label', 'font-size')).toBe('0.75rem');
    expect(valueOf('.cs-section-label', 'text-transform')).toBe('uppercase');
    const colour = valueOf('.cs-section-label', 'color');
    expect(colour).toBe('#5b6478');
    expectContrast('etiqueta de sección sobre blanco', colour, WHITE, 4.5);
    expectContrast('etiqueta de sección sobre el panel', colour, DAY_PANEL_BG, 4.5);
  });

  it('tints the day panel and keeps the lavender mark readable', () => {
    expect(valueOf('.cs-day-panel', 'background-color')).toBe(DAY_PANEL_BG);
    expectContrast('texto sobre el panel', valueOf(ROOT, '--bs-body-color'), DAY_PANEL_BG, 4.5);
    expectContrast('texto secundario sobre el panel', '#5b6478', DAY_PANEL_BG, 4.5);
  });

  it('arranges the periods in two columns from sm and in one below', () => {
    expect(valueOf('.cs-period-list', 'display')).toBe('grid');
    expect(valueOf('.cs-period-list', 'list-style')).toBe('none');
    expect(declarationsInMedia('(min-width: 576px)', '.cs-period-list')).toMatch(
      /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });
});
