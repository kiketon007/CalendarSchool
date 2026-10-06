// ESLint para el hook de pre-commit: solo reglas sin información de tipos, para que el commit
// sea rápido. Las reglas con tipos las aplican `npm run lint` y CI (design.md D9).
import { baseConfig } from './eslint.config.js';

export default baseConfig;
