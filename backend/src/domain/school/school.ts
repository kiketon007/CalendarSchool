/** Colegio. Cada colegio aísla sus datos de los de los demás. */
export interface School {
  /** UUIDv7. */
  readonly id: string;
  /** Nombre tal como lo escribe el usuario (ya recortado y en NFC). */
  readonly name: string;
  /** Nombre normalizado (`normalizeSchoolName`): base de la unicidad por municipio. */
  readonly normalizedName: string;
  /** Código INE del municipio. */
  readonly municipalityCode: string;
}
