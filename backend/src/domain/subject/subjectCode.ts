/**
 * Limpia el código de una asignatura para guardarlo y mostrarlo: pasa los acentos a su forma compuesta
 * (NFC) y recorta los espacios de los extremos. Conserva las mayúsculas tal como las escribió quien lo creó.
 */
export function cleanCode(code: string): string {
  return code.normalize('NFC').trim();
}

/**
 * Normaliza el código de una asignatura para comparar si dos códigos son el mismo: lo limpia y lo pasa a
 * minúsculas, sin distinguir mayúsculas. Conserva los acentos y los signos (`º`, `-`, `/`), que sí
 * distinguen códigos: «MUS» y «MÚS» son códigos distintos.
 */
export function normalizeCode(code: string): string {
  return cleanCode(code).toLocaleLowerCase('es');
}
