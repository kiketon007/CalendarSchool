/** Primera letra, en mayúscula, de la primera palabra de un texto (vacío si no hay ninguna). */
function initialOf(text: string, language?: string): string {
  // `Array.from` recorre por puntos de código: un carácter fuera del plano básico no se parte.
  const [first] = Array.from(text.trim());
  return first === undefined ? '' : first.toLocaleUpperCase(language);
}

/** Iniciales de una persona: la del nombre y la de los apellidos (para el círculo del menú de usuario). */
export function initialsOf(firstName: string, lastName: string, language?: string): string {
  return `${initialOf(firstName, language)}${initialOf(lastName, language)}`;
}
