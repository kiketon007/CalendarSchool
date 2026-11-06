import { useTranslation } from 'react-i18next';
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

  const penalty =
    score.initialTotal === score.total
      ? t('schedule.score.penalty.value', { total: score.total })
      : t('schedule.score.penalty.valueWithInitial', {
          total: score.total,
          initial: score.initialTotal,
        });

  return (
    <section aria-label={t('schedule.score.title')} className={className}>
      <dl className="row mb-0 gy-1">
        {score.preferredTotal > 0 && (
          <>
            <dt className="col-sm-5 col-md-4 fw-semibold">{t('schedule.score.preferred.label')}</dt>
            <dd className="col-sm-7 col-md-8 mb-0">
              {t('schedule.score.preferred.value', {
                met: score.preferredTotal - score.preferredMisses,
                total: score.preferredTotal,
              })}
            </dd>
          </>
        )}
        <dt className="col-sm-5 col-md-4 fw-semibold">{t('schedule.score.gaps.label')}</dt>
        <dd className="col-sm-7 col-md-8 mb-0">{score.professorGaps}</dd>
        <dt className="col-sm-5 col-md-4 fw-semibold">{t('schedule.score.consecutive.label')}</dt>
        <dd className="col-sm-7 col-md-8 mb-0">{score.consecutiveDays}</dd>
        <dt className="col-sm-5 col-md-4 fw-semibold">{t('schedule.score.penalty.label')}</dt>
        <dd className="col-sm-7 col-md-8 mb-0">{penalty}</dd>
      </dl>
    </section>
  );
}
