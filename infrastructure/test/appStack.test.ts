import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { serializeContentSecurityPolicy } from '../../frontend/src/security/contentSecurityPolicy.js';
import { AppStack } from '../lib/appStack.js';
import { CertificateStack } from '../lib/certificateStack.js';

const ACCOUNT = '123456789012';

// Ids de las políticas gestionadas de CloudFront.
const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6';
const CACHING_DISABLED = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
const ALL_VIEWER_EXCEPT_HOST_HEADER = 'b689b0a8-53d0-40ab-baf2-68738e2966ac';

// Fragmentos de plantilla de CloudFormation sin esquema fijo.
type Json = Record<string, any>;

function synth(environmentName = 'prod') {
  // Sin empaquetar la Lambda con esbuild: estos tests comprueban la plantilla, no el bundle.
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const certificateStack = new CertificateStack(
    app,
    `CalendarSchool-${environmentName}-Certificate`,
    {
      env: { account: ACCOUNT, region: 'us-east-1' },
      environmentName,
      crossRegionReferences: true,
    },
  );
  const stack = new AppStack(app, `CalendarSchool-${environmentName}-App`, {
    env: { account: ACCOUNT, region: 'eu-central-1' },
    environmentName,
    certificate: certificateStack.certificate,
    crossRegionReferences: true,
  });
  return Template.fromStack(stack);
}

const template = synth();

/** `DistributionConfig` de la única distribución. */
function distributionConfig(): Json {
  const [distribution] = Object.values(template.findResources('AWS::CloudFront::Distribution'));
  return (distribution?.Properties as Json).DistributionConfig as Json;
}

describe('frontend: private S3 bucket behind CloudFront', () => {
  it('has a private bucket with every public access block', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('reaches the bucket through an origin access control, not an identity or a website', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      }),
    });
    template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 0);
  });

  it('serves app.calendarschools.es with the certificate, over HTTPS only, in the cheapest price class', () => {
    const config = distributionConfig();

    expect(config.Aliases).toEqual(['app.calendarschools.es']);
    expect(config.ViewerCertificate).toMatchObject({ SslSupportMethod: 'sni-only' });
    expect(config.PriceClass).toBe('PriceClass_100');
    expect(config.HttpVersion).toBe('http2and3');
    expect(config.DefaultRootObject).toBe('index.html');
    expect(config.DefaultCacheBehavior.ViewerProtocolPolicy).toBe('redirect-to-https');
    expect(config.DefaultCacheBehavior.CachePolicyId).toBe(CACHING_OPTIMIZED);
    expect(config.DefaultCacheBehavior.Compress).toBe(true);
  });

  it('adds the security headers', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          StrictTransportSecurity: Match.objectLike({ Override: true }),
          ContentTypeOptions: { Override: true },
          FrameOptions: Match.objectLike({ FrameOption: 'DENY' }),
        }),
      }),
    });
  });

  describe('Content-Security-Policy', () => {
    const policyFile = join(
      import.meta.dirname,
      '..',
      '..',
      'frontend',
      'content-security-policy.json',
    );
    const expectedHeader = serializeContentSecurityPolicy(
      JSON.parse(readFileSync(policyFile, 'utf8')) as Record<string, string[]>,
    );
    const securityHeadersConfigs = () =>
      Object.values(template.findResources('AWS::CloudFront::ResponseHeadersPolicy')).map(
        (policy) =>
          ((policy.Properties as Json).ResponseHeadersPolicyConfig as Json)
            .SecurityHeadersConfig as Json,
      );

    it('is the one in frontend/content-security-policy.json and overrides the origin header', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: Match.objectLike({
          SecurityHeadersConfig: Match.objectLike({
            ContentSecurityPolicy: { ContentSecurityPolicy: expectedHeader, Override: true },
          }),
        }),
      });
    });

    it('allows reCAPTCHA and nothing unsafe', () => {
      for (const config of securityHeadersConfigs()) {
        const header = (config.ContentSecurityPolicy as Json).ContentSecurityPolicy as string;
        expect(header).toContain('https://www.google.com/recaptcha/');
        expect(header).not.toContain("'unsafe-inline'");
        expect(header).not.toContain("'unsafe-eval'");
      }
    });

    it('is enforced: no Report-Only header anywhere', () => {
      expect(JSON.stringify(template.toJSON())).not.toMatch(/report-only/i);
    });
  });

  it('rewrites SPA routes with the spa-rewrite function on the default behavior', () => {
    const [association] = distributionConfig().DefaultCacheBehavior.FunctionAssociations;

    expect(association.EventType).toBe('viewer-request');
    template.hasResourceProperties('AWS::CloudFront::Function', {
      Name: Match.stringLikeRegexp('spa-rewrite'),
      FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0' }),
      FunctionCode: Match.stringLikeRegexp('index\\.html'),
    });
  });
});

describe('API behind CloudFront', () => {
  it('forwards /api/* to the API without caching and with every method', () => {
    const [behavior] = distributionConfig().CacheBehaviors;

    expect(behavior.PathPattern).toBe('/api/*');
    expect(behavior.CachePolicyId).toBe(CACHING_DISABLED);
    expect(behavior.OriginRequestPolicyId).toBe(ALL_VIEWER_EXCEPT_HOST_HEADER);
    expect(behavior.AllowedMethods).toEqual([
      'GET',
      'HEAD',
      'OPTIONS',
      'PUT',
      'PATCH',
      'POST',
      'DELETE',
    ]);
    expect(behavior.ViewerProtocolPolicy).toBe('redirect-to-https');
  });

  it('closes /api/auth/* with the api-guard function', () => {
    const [behavior] = distributionConfig().CacheBehaviors;

    expect(behavior.FunctionAssociations[0].EventType).toBe('viewer-request');
    template.hasResourceProperties('AWS::CloudFront::Function', {
      Name: Match.stringLikeRegexp('api-guard'),
      FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0' }),
      FunctionCode: Match.stringLikeRegexp('NOT_FOUND'),
    });
  });

  it('sends X-Origin-Verify to the API origin with a value taken from a NoEcho parameter', () => {
    template.hasParameter('OriginVerifySecret', { Type: 'String', NoEcho: true, MinLength: 32 });
    const origins = distributionConfig().Origins as Json[];
    const apiOrigin = origins.find((origin) =>
      (origin.OriginCustomHeaders as Json[] | undefined)?.some(
        (header) => header.HeaderName === 'X-Origin-Verify',
      ),
    );

    expect(apiOrigin?.OriginCustomHeaders).toEqual([
      { HeaderName: 'X-Origin-Verify', HeaderValue: { Ref: 'OriginVerifySecret' } },
    ]);
    expect((apiOrigin?.CustomOriginConfig as Json).OriginProtocolPolicy).toBe('https-only');
  });
});

describe('Lambda and HTTP API', () => {
  it('runs nodejs24.x on x86_64 with 1024 MB and a 15 s timeout, without reserved concurrency', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'calendarschool-prod-api',
      Runtime: 'nodejs24.x',
      Architectures: ['x86_64'],
      MemorySize: 1024,
      Timeout: 15,
      Handler: 'index.handler',
      LoggingConfig: Match.objectLike({ LogFormat: 'JSON', ApplicationLogLevel: 'TRACE' }),
    });
    const [lambda] = Object.values(
      template.findResources('AWS::Lambda::Function', {
        Properties: { FunctionName: 'calendarschool-prod-api' },
      }),
    );
    expect(lambda?.Properties).not.toHaveProperty('ReservedConcurrentExecutions');
  });

  it('configures the backend through environment variables, with no secret in them', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'calendarschool-prod-api',
      Environment: {
        Variables: Match.objectLike({
          NODE_ENV: 'production',
          APP_ORIGIN: 'https://app.calendarschools.es',
          TRUST_PROXY_HOPS: '2',
          LOG_LEVEL: 'info',
          SSM_PARAMETER_PATH: '/calendarschool/prod/',
          ORIGIN_VERIFY_ROTATION: { Ref: 'OriginVerifyRotation' },
          NODE_OPTIONS: '--enable-source-maps',
        }),
      },
    });
    const variables = JSON.stringify(
      Object.values(template.findResources('AWS::Lambda::Function'))[0]?.Properties,
    );
    expect(variables).not.toContain('OriginVerifySecret');
  });

  it('may only read the SSM parameters of its own environment', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ssm:GetParametersByPath',
            Effect: 'Allow',
            Resource: [
              {
                'Fn::Join': [
                  '',
                  Match.arrayWith([Match.stringLikeRegexp(':parameter/calendarschool/prod$')]),
                ],
              },
              {
                'Fn::Join': [
                  '',
                  Match.arrayWith([Match.stringLikeRegexp(':parameter/calendarschool/prod/[*]$')]),
                ],
              },
            ],
          }),
        ]),
      },
    });
  });

  it('keeps its logs for 30 days in a log group the stack owns', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/calendarschool-prod-api',
      RetentionInDays: 30,
    });
  });

  it('exposes a single ANY /{proxy+} route with a payload 2.0 Lambda integration', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'HTTP' });
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /{proxy+}' });
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      PayloadFormatVersion: '2.0',
    });
  });

  it('throttles the default stage at 10 requests per second with bursts of 20', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
    });
  });
});

describe('backups, deployment roles and outputs', () => {
  it('stores backups in a private, encrypted bucket that expires them after 30 days and is retained', () => {
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        BucketEncryption: Match.anyValue(),
        LifecycleConfiguration: {
          Rules: [Match.objectLike({ ExpirationInDays: 30, Status: 'Enabled' })],
        },
        PublicAccessBlockConfiguration: Match.objectLike({ BlockPublicAcls: true }),
      }),
    });
  });

  it('only accepts TLS connections to the backup bucket', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('trusts GitHub OIDC only for the prod environment of the repository', () => {
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
    const roles = Object.values(template.findResources('AWS::IAM::Role')).filter((role) =>
      JSON.stringify((role.Properties as Json).AssumeRolePolicyDocument).includes(
        'sts:AssumeRoleWithWebIdentity',
      ),
    );

    expect(roles).toHaveLength(2);
    for (const role of roles) {
      const trust = (role.Properties as Json).AssumeRolePolicyDocument as Json;
      expect(trust.Statement[0].Condition).toEqual({
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub':
            'repo:kiketon007@48519594/CalendarSchool@1366177326:environment:prod',
        },
      });
    }
  });

  it('lets the deploy role assume the CDK bootstrap roles, read the origin secret, sync the frontend and invalidate the cache', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'sts:AssumeRole' }),
          Match.objectLike({ Action: 'ssm:GetParameter' }),
          Match.objectLike({ Action: 'cloudformation:DescribeStacks' }),
          Match.objectLike({ Action: Match.arrayWith(['s3:DeleteObject*', 's3:PutObject']) }),
          Match.objectLike({ Action: 'cloudfront:CreateInvalidation' }),
        ]),
      },
      Roles: [{ Ref: Match.stringLikeRegexp('Deploy') }],
    });
  });

  it('lets the backup role only put objects in the backup bucket', () => {
    const policies = Object.values(template.findResources('AWS::IAM::Policy')).filter((policy) =>
      JSON.stringify((policy.Properties as Json).Roles).includes('Backup'),
    );

    expect(policies).toHaveLength(1);
    expect((policies[0]?.Properties as Json).PolicyDocument.Statement).toEqual([
      expect.objectContaining({ Action: 's3:PutObject', Effect: 'Allow' }),
    ]);
  });

  it('exposes what the workflows need as outputs', () => {
    for (const name of [
      'FrontendBucketName',
      'DistributionId',
      'DistributionDomainName',
      'ApiUrl',
      'BackupBucketName',
      'DeployRoleArn',
      'BackupRoleArn',
    ]) {
      expect(template.findOutputs(name)[name]).toBeDefined();
    }
  });

  it('derives names and the SSM path from the environment', () => {
    const staging = synth('staging');

    staging.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'calendarschool-staging-api',
      Environment: {
        Variables: Match.objectLike({ SSM_PARAMETER_PATH: '/calendarschool/staging/' }),
      },
    });
    staging.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/calendarschool-staging-api',
    });
    expect(JSON.stringify(staging.toJSON())).toContain('environment:staging');
  });
});
