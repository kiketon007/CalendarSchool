import { describe, expect, it, vi } from 'vitest';
import type { Municipality } from '../../domain/municipality/municipality.js';
import type { MunicipalityRepository } from '../../domain/municipality/municipalityRepository.js';
import { ListMunicipalities } from './listMunicipalities.js';

const municipalities: Municipality[] = [
  { code: '03014', name: 'Alacant/Alicante', province: 'Alicante/Alacant' },
  { code: '46250', name: 'València', province: 'Valencia/València' },
];

describe('ListMunicipalities', () => {
  it('returns the municipalities given by the repository, in its order', async () => {
    const repository: MunicipalityRepository = {
      findAll: vi.fn().mockResolvedValue(municipalities),
      findByCode: vi.fn(),
    };

    await expect(new ListMunicipalities(repository).execute()).resolves.toEqual(municipalities);
  });

  it('propagates the repository error', async () => {
    const failure = new Error('base de datos no disponible');
    const repository: MunicipalityRepository = {
      findAll: vi.fn().mockRejectedValue(failure),
      findByCode: vi.fn(),
    };

    await expect(new ListMunicipalities(repository).execute()).rejects.toBe(failure);
  });
});
