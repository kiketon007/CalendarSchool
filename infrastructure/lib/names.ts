/** Dominio público de la aplicación (el DNS está en DonDominio, fuera de AWS). */
export const APP_DOMAIN = 'app.calendarschools.es';

/**
 * Prefijo del `sub` del token OIDC del repositorio `kiketon007/CalendarSchool`, cuyos workflows
 * pueden asumir los roles de despliegue y de copias. El repositorio tiene activado el subject inmutable de GitHub,
 * que incluye los IDs del propietario y del repositorio (no secretos).
 */
export const GITHUB_OIDC_SUBJECT_PREFIX = 'repo:kiketon007@48519594/CalendarSchool@1366177326';

/** Región de la aplicación; el certificado de CloudFront va siempre en `us-east-1`. */
export const APP_REGION = 'eu-central-1';
export const CERTIFICATE_REGION = 'us-east-1';

/** Ruta de los parámetros de SSM con los secretos de un entorno. */
export const ssmParameterPath = (environmentName: string): string =>
  `/calendarschool/${environmentName}/`;
