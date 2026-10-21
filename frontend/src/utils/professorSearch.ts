import { normalizeForSearch } from './courseSearch';

/**
 * Indica si un profesor coincide con el texto buscado (US11): el texto se parte en palabras y **todas**
 * deben aparecer, en cualquier orden y como parte de una palabra, en su nombre o en sus apellidos
 * («garcia ana» y «gar an» encuentran a «García, Ana»). No distingue mayúsculas, acentos (la «ñ» busca
 * como «n») ni espacios sobrantes; los guiones y apóstrofos son texto normal, y se compara con `includes`,
 * no con una expresión regular. Un texto vacío (o solo espacios) encuentra a todos.
 */
export function matchesProfessorSearch(
  { firstName, lastName }: { firstName: string; lastName: string },
  query: string,
): boolean {
  const wanted = normalizeForSearch(query);
  if (wanted === '') {
    return true;
  }
  const text = normalizeForSearch(`${firstName} ${lastName}`);
  return wanted.split(' ').every((word) => text.includes(word));
}
