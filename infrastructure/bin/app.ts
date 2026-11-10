// Punto de entrada de CDK: `cdk synth|deploy -c env=prod`. Instancia el stack del certificado
// (us-east-1) y el de la aplicación (eu-central-1). La cuenta sale del perfil de la CLI
// (`CDK_DEFAULT_ACCOUNT`): los IDs de cuenta no se versionan (design.md D1).
import { App } from 'aws-cdk-lib';
import { AppStack } from '../lib/appStack.js';
import { CertificateStack } from '../lib/certificateStack.js';
import { APP_REGION, CERTIFICATE_REGION } from '../lib/names.js';
import { scheduleEngineOf } from '../lib/scheduleEngine.js';

const app = new App();
const environmentName = String(app.node.tryGetContext('env') ?? 'prod');
const account = process.env.CDK_DEFAULT_ACCOUNT;
// El motor de generación de horarios (US-ALGO-ORTOOLS): falla aquí, antes de crear nada, si el valor no es válido.
const scheduleEngine = scheduleEngineOf(app.node.tryGetContext('scheduleEngine'));

const certificateStack = new CertificateStack(
  app,
  `CalendarSchool-${environmentName}-Certificate`,
  {
    env: { account, region: CERTIFICATE_REGION },
    environmentName,
    crossRegionReferences: true,
  },
);

new AppStack(app, `CalendarSchool-${environmentName}-App`, {
  env: { account, region: APP_REGION },
  environmentName,
  certificate: certificateStack.certificate,
  crossRegionReferences: true,
  // Contextos opcionales: `-c logLevel=debug` mientras se mide TRUST_PROXY_HOPS (design.md D7),
  // `-c trustProxyHops=N` con el valor medido y `-c githubOidcProviderArn=…` si la cuenta ya tiene
  // el proveedor OIDC de GitHub, y `-c scheduleEngine=ORTOOLS` para generar los horarios con OR-Tools (por defecto,
  // BACKTRACKING; en producción lo fija la variable SCHEDULE_ENGINE del entorno `prod` de GitHub, ver deploy.yml).
  logLevel: app.node.tryGetContext('logLevel') as string | undefined,
  trustProxyHops: app.node.tryGetContext('trustProxyHops') as number | undefined,
  scheduleEngine,
  githubOidcProviderArn: app.node.tryGetContext('githubOidcProviderArn') as string | undefined,
});
