import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { CertificateStack } from '../lib/certificateStack.js';

const ACCOUNT = '123456789012';

function synth(environmentName = 'prod') {
  const app = new App();
  const stack = new CertificateStack(app, `CalendarSchool-${environmentName}-Certificate`, {
    env: { account: ACCOUNT, region: 'us-east-1' },
    environmentName,
  });
  return { stack, template: Template.fromStack(stack) };
}

describe('CertificateStack', () => {
  it('requests a certificate for app.calendarschools.es validated by DNS', () => {
    const { template } = synth();

    template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'app.calendarschools.es',
      ValidationMethod: 'DNS',
    });
  });

  it('lives in us-east-1, the only region CloudFront accepts certificates from', () => {
    const { stack } = synth();

    expect(stack.region).toBe('us-east-1');
  });

  it('exposes the certificate so the application stack can use it across regions', () => {
    const { stack } = synth();

    expect(stack.certificate.certificateArn).toBeDefined();
  });

  it('names the stack after the environment', () => {
    const { stack } = synth('prod');

    expect(stack.stackName).toBe('CalendarSchool-prod-Certificate');
  });
});
