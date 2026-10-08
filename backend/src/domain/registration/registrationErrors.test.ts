import { describe, expect, it } from 'vitest';
import { EmailAlreadyRegistered, SchoolAlreadyRegistered } from './registrationErrors.js';

describe('registration domain errors', () => {
  it('EmailAlreadyRegistered is an Error with a stable name', () => {
    const error = new EmailAlreadyRegistered();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmailAlreadyRegistered');
    expect(error.message).toBe('El email ya está registrado');
  });

  it('SchoolAlreadyRegistered is an Error with a stable name', () => {
    const error = new SchoolAlreadyRegistered();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SchoolAlreadyRegistered');
    expect(error.message).toBe('El colegio ya está registrado en ese municipio');
  });

  it('are distinguishable from each other', () => {
    expect(new EmailAlreadyRegistered()).not.toBeInstanceOf(SchoolAlreadyRegistered);
    expect(new SchoolAlreadyRegistered()).not.toBeInstanceOf(EmailAlreadyRegistered);
  });
});
