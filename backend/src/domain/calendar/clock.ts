const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/**
 * Lee una hora `HH:MM` de 24 horas (de `00:00` a `23:59`) y la devuelve en minutos desde las 00:00, que es
 * como se guarda y se compara. Devuelve `null` si el texto no tiene exactamente ese formato: sin espacios,
 * sin segundos y con dos dígitos en cada parte.
 */
export function parseClock(text: string): number | null {
  const match = CLOCK.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Escribe unos minutos desde las 00:00 (de 0 a 1439) como `HH:MM`. Es la inversa de `parseClock`. */
export function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
