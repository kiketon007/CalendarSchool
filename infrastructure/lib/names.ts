/** Dominio público de la aplicación (el DNS está en DonDominio, fuera de AWS). */
export const APP_DOMAIN = 'app.calendarschools.es';

/** Repositorio de GitHub cuyos workflows pueden asumir los roles de despliegue y de copias. */
export const GITHUB_REPOSITORY = 'kiketon007/CalendarSchool';

/** Región de la aplicación; el certificado de CloudFront va siempre en `us-east-1`. */
export const APP_REGION = 'eu-central-1';
export const CERTIFICATE_REGION = 'us-east-1';

/** Ruta de los parámetros de SSM con los secretos de un entorno. */
export const ssmParameterPath = (environmentName: string): string =>
  `/calendarschool/${environmentName}/`;
