/** El email normalizado ya pertenece a un usuario. Lo lanza el repositorio ante una violación de unicidad. */
export class EmailAlreadyRegistered extends Error {
  constructor() {
    super('El email ya está registrado');
    this.name = 'EmailAlreadyRegistered';
  }
}

/** Ya existe un colegio con el mismo nombre normalizado en ese municipio. */
export class SchoolAlreadyRegistered extends Error {
  constructor() {
    super('El colegio ya está registrado en ese municipio');
    this.name = 'SchoolAlreadyRegistered';
  }
}
