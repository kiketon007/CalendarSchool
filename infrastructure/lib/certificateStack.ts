import { Stack, type StackProps } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import type { Construct } from 'constructs';
import { APP_DOMAIN } from './names.js';

export interface CertificateStackProps extends StackProps {
  environmentName: string;
}

/**
 * Certificado de ACM de `app.calendarschools.es`. CloudFront solo acepta certificados de
 * `us-east-1`, por eso vive en un stack aparte del resto (design.md D1), que está en
 * `eu-central-1`. Como no hay zona de Route 53, la validación es por DNS: CloudFormation espera
 * a que el CNAME de validación exista en DonDominio (se crea a mano, ver la guía de puesta en marcha).
 */
export class CertificateStack extends Stack {
  readonly certificate: Certificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    this.certificate = new Certificate(this, 'Certificate', {
      domainName: APP_DOMAIN,
      validation: CertificateValidation.fromDns(),
    });
  }
}
