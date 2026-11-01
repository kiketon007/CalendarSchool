/**
 * Una duración en minutos escrita como «21 h 45 min», «20 h» o «45 min». Las abreviaturas son las mismas en
 * castellano y en inglés, así que no pasa por i18n.
 */
export function formatTeachingTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${String(rest)} min`;
  }
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

/**
 * El rango de la carga lectiva de un profesor: un solo valor si el mínimo y el máximo coinciden y «mínimo – máximo» si
 * no, porque la duración exacta depende de las sesiones que le coloque el motor.
 */
export function formatTeachingRange(minMinutes: number, maxMinutes: number): string {
  return minMinutes === maxMinutes
    ? formatTeachingTime(minMinutes)
    : `${formatTeachingTime(minMinutes)} – ${formatTeachingTime(maxMinutes)}`;
}
