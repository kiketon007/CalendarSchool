import type { ReactNode } from 'react';
import { useId } from 'react';
import Badge from 'react-bootstrap/Badge';
import Card from 'react-bootstrap/Card';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

interface FeatureCardProps {
  /** Prefijo de las claves de i18n: se leen `<textKey>.name` y `<textKey>.description`. */
  textKey: string;
  /** Icono decorativo (debe llevar `aria-hidden`). */
  icon: ReactNode;
  /** Destino de la funcionalidad. Sin ruta, la tarjeta es un bloque informativo «Próximamente». */
  to?: string;
}

/**
 * Tarjeta de una funcionalidad de la pantalla de bienvenida. Decide por la ruta: con `to` es un
 * enlace; sin `to` es un bloque no interactivo (ni enlace ni botón, sin foco) con el estado
 * «Próximamente» en texto, de modo que nunca hay un enlace roto ni un botón deshabilitado.
 */
export function FeatureCard({ textKey, icon, to }: FeatureCardProps) {
  const { t } = useTranslation();
  const headingId = useId();

  const content = (
    <Card.Body className="d-flex align-items-start gap-3">
      <span className="text-primary flex-shrink-0">{icon}</span>
      <div>
        <Card.Title as="h3" id={headingId} className="h5">
          {t(`${textKey}.name`)}
        </Card.Title>
        <Card.Text className={to ? 'text-body-secondary mb-0' : 'text-body-secondary mb-2'}>
          {t(`${textKey}.description`)}
        </Card.Text>
        {!to && (
          <Badge bg="secondary" as="span">
            {t('onboarding.comingSoon')}
          </Badge>
        )}
      </div>
    </Card.Body>
  );

  if (to) {
    return (
      <Card as={Link} to={to} className="h-100 text-decoration-none">
        {content}
      </Card>
    );
  }
  return (
    <Card as="article" aria-labelledby={headingId} className="h-100">
      {content}
    </Card>
  );
}
