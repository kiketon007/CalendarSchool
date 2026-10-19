/**
 * Limpia el nombre de un curso o de una clase para guardarlo y mostrarlo: pasa los acentos a su forma
 * compuesta (NFC), recorta los espacios de los extremos y colapsa en uno cada tramo de espacios. Conserva
 * las mayúsculas, los acentos y los signos ordinales.
 */
export function cleanName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/**
 * Normaliza el nombre de un curso o de una clase para comparar si dos nombres son el mismo: lo limpia y lo
 * pasa a minúsculas, sin distinguir mayúsculas ni espacios sobrantes. Conserva los acentos y los signos
 * (`º` y `ª`), que sí distinguen nombres: «Año» y «Ano», o «1º» y «1ª», son nombres distintos.
 */
export function normalizeName(name: string): string {
  return cleanName(name).toLocaleLowerCase('es');
}
