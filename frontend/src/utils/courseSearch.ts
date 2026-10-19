/**
 * Normaliza un texto para buscar: pasa a minúsculas, quita los acentos y los diacríticos (la «ñ» busca
 * como «n»), recorta los espacios de los extremos y colapsa cada tramo de espacios en uno. Los signos
 * `º` y `ª` no se descomponen, así que siguen distinguiéndose: «1º» no encuentra «1ª».
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/gu, ' ');
}

/**
 * Indica si el nombre de un curso contiene el texto buscado, sin distinguir mayúsculas, acentos ni
 * espacios sobrantes. Una búsqueda vacía (o solo espacios) encuentra todos los nombres. Compara con
 * `includes`, no con una expresión regular, así que los caracteres especiales son texto normal.
 */
export function matchesCourseSearch(name: string, query: string): boolean {
  const wanted = normalizeForSearch(query);
  return wanted === '' || normalizeForSearch(name).includes(wanted);
}
