import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ArrowRightIcon } from './icons/ArrowRightIcon';

/** Tonos del tema (`.cs-tone-*`) para el cuadro del icono. */
export type Tone = 'lavender' | 'peach' | 'mint' | 'yellow';

interface FeatureCardProps {
  /** Prefijo de las claves de i18n: se leen `<textKey>.name` y `<textKey>.description`. */
  textKey: string;
  /** Icono decorativo (debe llevar `aria-hidden`). */
  icon: ReactNode;
  /** Destino de la sección. */
  to: string;
  /** Tono del cuadro del icono. */
  tone: Tone;
}

/**
 * Tarjeta de una sección en la pantalla de bienvenida: toda ella es un enlace a su ruta, con el icono
 * en un cuadro de color, una flecha decorativa, el nombre en un `h3` y su descripción. El nombre
 * accesible del enlace es su contenido. Sin `Card` de react-bootstrap: una clase propia
 * (`.cs-feature-card`) controla el borde, el foco y los estados.
 */
export function FeatureCard({ textKey, icon, to, tone }: FeatureCardProps) {
  const { t } = useTranslation();

  return (
    <Link to={to} className="cs-feature-card d-flex flex-column h-100">
      <span className="d-flex justify-content-between align-items-start">
        <span className={`cs-feature-icon cs-tone-${tone}`}>{icon}</span>
        <ArrowRightIcon className="cs-feature-arrow" />
      </span>
      <h3 className="cs-feature-title">{t(`${textKey}.name`)}</h3>
      <p className="cs-feature-description mb-0">{t(`${textKey}.description`)}</p>
    </Link>
  );
}
