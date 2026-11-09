import { Trans, useTranslation } from 'react-i18next';
import type { ScheduleScore } from '../utils/scheduleScore';

interface ScheduleScoreSummaryProps {
  score: ScheduleScore;
  className?: string;
}

/**
 * El desglose de la puntuación de un horario (US-ALGO-RUN_b) como lista de descripción: las franjas preferidas
 * cumplidas (solo si alguna asignatura las tiene), los huecos de los profesores, las asignaturas en días seguidos y la
 * penalización, con la de antes de mejorar si es distinta. Cada cifra va con su nombre escrito: el color nunca es la
 * única pista. Lo usan el panel de la generación y la cabecera de la página del horario.
 */
export function ScheduleScoreSummary({ score, className }: ScheduleScoreSummaryProps) {
  const { t } = useTranslation();

  // Solo el número va en negrita; los valores son números del servidor, así que no hay HTML que interpretar.
  const penalty = (
    <Trans
      i18nKey={
        score.initialTotal === score.total
          ? 'schedule.score.penalty.value'
          : 'schedule.score.penalty.valueWithInitial'
      }
      values={{ total: score.total, initial: score.initialTotal }}
      components={{ total: <strong /> }}
    />
  );

  return (
    <section aria-label={t('schedule.score.title')} className={className}>
      <dl className="cs-score-list">
        {score.preferredTotal > 0 && (
          <>
            <dt>{t('schedule.score.preferred.label')}</dt>
            <dd>
              {t('schedule.score.preferred.value', {
                met: score.preferredTotal - score.preferredMisses,
                total: score.preferredTotal,
              })}
            </dd>
          </>
        )}
        <dt>{t('schedule.score.gaps.label')}</dt>
        <dd>{score.professorGaps}</dd>
        <dt>{t('schedule.score.consecutive.label')}</dt>
        <dd>{score.consecutiveDays}</dd>
        <dt>{t('schedule.score.penalty.label')}</dt>
        <dd>{penalty}</dd>
      </dl>
    </section>
  );
}
