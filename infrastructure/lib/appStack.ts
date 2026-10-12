import { join } from 'node:path';
import {
  CfnOutput,
  CfnParameter,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  Effect,
  OidcProviderNative,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
  type IOidcProvider,
} from 'aws-cdk-lib/aws-iam';
import { ApplicationLogLevel, Architecture, LoggingFormat, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';
import { APP_DOMAIN, GITHUB_OIDC_SUBJECT_PREFIX, ssmParameterPath } from './names.js';

const REPOSITORY_ROOT = join(import.meta.dirname, '..', '..');
const LAMBDA_ENTRY = join(REPOSITORY_ROOT, 'backend', 'src', 'lambda.ts');
const SUPABASE_CA = join(import.meta.dirname, '..', 'assets', 'supabase-ca.crt');
const FUNCTIONS_DIR = join(import.meta.dirname, '..', 'functions');

/** Calificador del *bootstrap* de CDK: da nombre a los roles `cdk-<calificador>-…` que asume el despliegue. */
const CDK_QUALIFIER = 'hnb659fds';

export interface AppStackProps extends StackProps {
  /** Entorno (`prod`): forma los nombres de los recursos, la ruta de SSM y el `sub` de OIDC. */
  environmentName: string;
  /** Certificado de ACM de `app.calendarschools.es`, creado en `us-east-1`. */
  certificate: ICertificate;
  /**
   * Proxies de confianza delante de Express (`TRUST_PROXY_HOPS`). 2 es lo esperado (CloudFront y
   * API Gateway), pero se mide al desplegar (design.md D7).
   */
  trustProxyHops?: number;
  /** Nivel de log de la Lambda; `debug` solo mientras se mide `TRUST_PROXY_HOPS`. */
  logLevel?: string;
  /** ARN del proveedor OIDC de GitHub si la cuenta ya tiene uno (solo puede haber uno por URL). */
  githubOidcProviderArn?: string;
}

/**
 * Stack de la aplicación (`eu-central-1`): frontend en S3 privado detrás de CloudFront, API en
 * Lambda con HTTP API, bucket de copias y roles de OIDC para los workflows de GitHub (design.md D1).
 */
export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { environmentName, certificate, trustProxyHops = 2, logLevel = 'info' } = props;
    const prefix = `calendarschool-${environmentName}`;
    const parameterPath = ssmParameterPath(environmentName);

    // El valor lo lee el workflow de SSM en cada despliegue: SSM es la única fuente (design.md D6).
    const originVerifySecret = new CfnParameter(this, 'OriginVerifySecret', {
      type: 'String',
      noEcho: true,
      minLength: 32,
      description: 'Valor de X-Origin-Verify (parámetro ORIGIN_VERIFY_SECRET de SSM)',
    });
    // Un hash corto del secreto: al cambiarlo, la función crea instancias nuevas y recarga SSM.
    const originVerifyRotation = new CfnParameter(this, 'OriginVerifyRotation', {
      type: 'String',
      default: 'initial',
      description: 'Hash corto de ORIGIN_VERIFY_SECRET; cambia al rotar el secreto',
    });

    // --- Frontend ---
    const frontendBucket = new Bucket(this, 'FrontendBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // --- API: Lambda y HTTP API ---
    const functionName = `${prefix}-api`;
    const logGroup = new LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const apiFunction = new NodejsFunction(this, 'ApiFunction', {
      functionName,
      entry: LAMBDA_ENTRY,
      handler: 'handler',
      projectRoot: REPOSITORY_ROOT,
      depsLockFilePath: join(REPOSITORY_ROOT, 'package-lock.json'),
      runtime: Runtime.NODEJS_24_X,
      // x86_64 coincide con los runners de GitHub: el binario de Bcrypt es el mismo (design.md D3).
      architecture: Architecture.X86_64,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      logGroup,
      loggingFormat: LoggingFormat.JSON,
      // Lambda no filtra: el nivel lo decide `LOG_LEVEL` (con el valor por defecto, INFO, perdería el `debug`).
      applicationLogLevelV2: ApplicationLogLevel.TRACE,
      environment: {
        NODE_ENV: 'production',
        APP_ORIGIN: `https://${APP_DOMAIN}`,
        TRUST_PROXY_HOPS: String(trustProxyHops),
        LOG_LEVEL: logLevel,
        SSM_PARAMETER_PATH: parameterPath,
        ORIGIN_VERIFY_ROTATION: originVerifyRotation.valueAsString,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        format: OutputFormat.ESM,
        target: 'node24',
        mainFields: ['module', 'main'],
        // Las dependencias CommonJS del bundle ESM necesitan `require`.
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        sourceMap: true,
        // Módulo nativo: se instala el binario de la plataforma en lugar de empaquetarlo.
        nodeModules: ['@node-rs/bcrypt'],
        // El binario es el de Lambda (Linux x64, glibc) aunque se empaquete desde otro sistema: sin
        // esto, un `cdk deploy` desde Windows o macOS subiría el binario de la máquina local.
        environment: { npm_config_os: 'linux', npm_config_cpu: 'x64', npm_config_libc: 'glibc' },
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          // La CA de Supabase va junto al handler; `lambda.ts` la lee con `import.meta.url`.
          afterBundling: (_inputDir, outputDir) => [
            `node -e "require('fs').copyFileSync(process.argv[1], process.argv[2])" "${SUPABASE_CA}" "${join(outputDir, 'supabase-ca.crt')}"`,
          ],
        },
      },
    });
    // GetParametersByPath se autoriza sobre la ruta y sobre lo que cuelga de ella.
    const parametersArn = (resourceName: string) =>
      this.formatArn({ service: 'ssm', resource: 'parameter', resourceName });
    const pathWithoutSlash = parameterPath.replace(/\/$/, '').replace(/^\//, '');
    apiFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:GetParametersByPath'],
        resources: [parametersArn(pathWithoutSlash), parametersArn(`${pathWithoutSlash}/*`)],
      }),
    );

    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: `${prefix}-api`,
      createDefaultStage: false,
    });
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', apiFunction),
    });
    // Tope de coste y de abuso, muy por encima del uso del piloto (design.md D12).
    httpApi.addStage('DefaultStage', {
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 10, burstLimit: 20 },
    });

    // --- CloudFront ---
    const spaRewrite = new CloudFrontFunction(this, 'SpaRewrite', {
      functionName: `${prefix}-spa-rewrite`,
      code: FunctionCode.fromFile({ filePath: join(FUNCTIONS_DIR, 'spaRewrite.js') }),
      runtime: FunctionRuntime.JS_2_0,
    });
    const apiGuard = new CloudFrontFunction(this, 'ApiGuard', {
      functionName: `${prefix}-api-guard`,
      code: FunctionCode.fromFile({ filePath: join(FUNCTIONS_DIR, 'apiGuard.js') }),
      runtime: FunctionRuntime.JS_2_0,
    });
    // Sin CSP: es del cambio `publicacion-registro`, que conoce los dominios de reCAPTCHA.
    const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    const apiOrigin = new HttpOrigin(
      Fn.join('', [httpApi.apiId, '.execute-api.', this.region, '.', this.urlSuffix]),
      {
        protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
        customHeaders: { 'X-Origin-Verify': originVerifySecret.valueAsString },
      },
    );

    const distribution = new Distribution(this, 'Distribution', {
      domainNames: [APP_DOMAIN],
      certificate,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: spaRewrite, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
          functionAssociations: [
            { function: apiGuard, eventType: FunctionEventType.VIEWER_REQUEST },
          ],
        },
      },
    });

    // --- Copias de seguridad ---
    const backupBucket = new Bucket(this, 'BackupBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // --- Roles de OIDC para GitHub Actions ---
    const githubProvider: IOidcProvider =
      props.githubOidcProviderArn === undefined
        ? new OidcProviderNative(this, 'GithubOidcProvider', {
            url: 'https://token.actions.githubusercontent.com',
            clientIds: ['sts.amazonaws.com'],
          })
        : OidcProviderNative.fromOidcProviderArn(
            this,
            'GithubOidcProvider',
            props.githubOidcProviderArn,
          );
    const githubPrincipal = () =>
      new WebIdentityPrincipal(githubProvider.oidcProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `${GITHUB_OIDC_SUBJECT_PREFIX}:environment:${environmentName}`,
        },
      });

    const deployRole = new Role(this, 'DeployRole', {
      roleName: `${prefix}-deploy`,
      assumedBy: githubPrincipal(),
      maxSessionDuration: Duration.hours(1),
    });
    deployRole.addToPolicy(
      new PolicyStatement({
        // CDK despliega con sus roles de *bootstrap*; el rol de GitHub solo puede asumirlos.
        actions: ['sts:AssumeRole'],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-${CDK_QUALIFIER}-*`],
      }),
    );
    deployRole.addToPolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [parametersArn(`${pathWithoutSlash}/ORIGIN_VERIFY_SECRET`)],
      }),
    );
    deployRole.addToPolicy(
      new PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [
          `arn:${this.partition}:cloudformation:*:${this.account}:stack/CalendarSchool-${environmentName}-*/*`,
        ],
      }),
    );
    frontendBucket.grantReadWrite(deployRole);
    deployRole.addToPolicy(
      new PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          `arn:${this.partition}:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        ],
      }),
    );

    const backupRole = new Role(this, 'BackupRole', {
      roleName: `${prefix}-backup`,
      assumedBy: githubPrincipal(),
      maxSessionDuration: Duration.hours(1),
    });
    backupRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:PutObject'],
        resources: [backupBucket.arnForObjects('*')],
      }),
    );

    // --- Lo que necesitan los workflows ---
    new CfnOutput(this, 'FrontendBucketName', { value: frontendBucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'Destino del CNAME de app.calendarschools.es en DonDominio',
    });
    new CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'URL directa de execute-api: debe responder 403 sin X-Origin-Verify',
    });
    new CfnOutput(this, 'BackupBucketName', { value: backupBucket.bucketName });
    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
    new CfnOutput(this, 'BackupRoleArn', { value: backupRole.roleArn });
  }
}
