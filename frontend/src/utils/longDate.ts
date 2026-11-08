/** Fecha larga de una persona usuaria y su forma ISO para el atributo `dateTime` de un `<time>`. */
export interface LongDate {
  /** «Domingo, 8 de noviembre de 2026»: formato largo del idioma, con la primera letra en mayúscula. */
  label: string;
  /** `AAAA-MM-DD` del día local. */
  iso: string;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Fecha larga en el idioma dado. La mayúscula inicial va en el texto (no en el CSS) para que la lean
 * igual la vista, los lectores de pantalla y los tests. El día ISO se construye con la fecha local:
 * `toISOString()` daría el día UTC, que de madrugada es el anterior.
 */
export function longDate(date: Date, locale: string): LongDate {
  const text = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date);
  // `Array.from` recorre por puntos de código: un carácter fuera del plano básico no se parte.
  const [first = '', ...rest] = Array.from(text);
  return {
    label: `${first.toLocaleUpperCase(locale)}${rest.join('')}`,
    iso: `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`,
  };
}
