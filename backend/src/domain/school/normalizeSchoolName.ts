/**
 * Normaliza el nombre de un colegio para comparar si dos nombres son el mismo: pasa a minúsculas,
 * quita acentos y diacríticos y conserva solo letras ASCII y dígitos (D3).
 *
 * Se descompone en NFD y se descartan las marcas combinantes, de modo que «ñ» y «ç» se reducen a
 * «n» y «c». `º`, `ª` y `·` no se descomponen en letras ASCII, así que se descartan: por eso
 * «C.E.I.P. Nº 3» y «ceip n 3» dan el mismo resultado.
 */
export function normalizeSchoolName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
