import type { ReactNode } from 'react';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { useTranslation } from 'react-i18next';
import type { ScheduleScore } from '../utils/scheduleScore';
import { CircleAlertIcon } from './icons/CircleAlertIcon';
import { SlidersHorizontalIcon } from './icons/SlidersHorizontalIcon';
import { UsersRoundIcon } from './icons/UsersRoundIcon';
import type { Tone } from './FeatureCard';

interface ScheduleScoreStatsProps {
  score: ScheduleScore;
}

interface Stat {
  key: 'gaps' | 'consecutive' | 'penalty';
  value: number;
  icon: ReactNode;
  tone: Tone;
}

/**
 * Las tres cifras de la puntuación en tarjetas (US-UI-REST_a): huecos de los profesores, asignaturas en días seguidos y
 * penalización actual (la de después de mejorar, no la de antes). Repite lo que ya dice el desglose de la tarjeta de la
 * generación, así que se oculta a las tecnologías de apoyo (`aria-hidden`) para que no se lean las cifras dos veces, y
 * por eso no contiene controles. Es solo presentación.
 */
export function ScheduleScoreStats({ score }: ScheduleScoreStatsProps) {
  const { t } = useTranslation();

  const stats: Stat[] = [
    { key: 'gaps', value: score.professorGaps, icon: <UsersRoundIcon />, tone: 'lavender' },
    {
      key: 'consecutive',
      value: score.consecutiveDays,
      icon: <CircleAlertIcon />,
      tone: 'peach',
    },
    { key: 'penalty', value: score.total, icon: <SlidersHorizontalIcon />, tone: 'mint' },
  ];

  return (
    <Row xs={1} md={3} className="g-3 mb-4" aria-hidden="true">
      {stats.map(({ key, value, icon, tone }) => (
        <Col key={key}>
          <div className="cs-card cs-stat-card">
            <span className={`cs-feature-icon cs-tone-${tone}`}>{icon}</span>
            <p className="cs-stat-value">{value}</p>
            <p className="cs-stat-label">{t(`schedule.score.stats.${key}`)}</p>
          </div>
        </Col>
      ))}
    </Row>
  );
}
