/** Número de páginas de una lista: al menos una, aunque esté vacía, para que «Página 1 de 1» tenga sentido. */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Los elementos de una página (la primera es la 1). Una página fuera de rango se acota a la primera o a
 * la última, así una lista que se recarga más corta nunca deja una página vacía. No modifica la lista.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const lastPage = pageCountOf(items.length, pageSize);
  const current = Number.isNaN(page) ? 1 : Math.min(Math.max(page, 1), lastPage);
  return items.slice((current - 1) * pageSize, current * pageSize);
}
