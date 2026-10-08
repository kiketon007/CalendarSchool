import { Router } from 'express';
import type { ListMunicipalities } from '../../application/municipality/listMunicipalities.js';
import { sendSuccess } from '../http/responses.js';

/** Los municipios son datos fijos (relación del INE): cualquier cliente puede cachearlos un día. */
const CACHE_CONTROL = 'public, max-age=86400';

/** Rutas públicas de municipios (`GET /api/municipalities`). */
export function municipalityRouter(
  listMunicipalities: Pick<ListMunicipalities, 'execute'>,
): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const municipalities = await listMunicipalities.execute();
    // La cabecera se pone solo cuando hay datos: una respuesta de error no debe cachearse.
    res.set('Cache-Control', CACHE_CONTROL);
    sendSuccess(res, municipalities);
  });

  return router;
}
