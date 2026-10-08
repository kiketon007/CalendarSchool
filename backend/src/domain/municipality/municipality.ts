/** Municipio de la Comunitat Valenciana (relación oficial del INE). */
export interface Municipality {
  /** Código INE: 2 dígitos de provincia y 3 de municipio. */
  readonly code: string;
  /** Nombre oficial, que puede tener dos formas (p. ej. «Alacant/Alicante»). */
  readonly name: string;
  readonly province: string;
}
