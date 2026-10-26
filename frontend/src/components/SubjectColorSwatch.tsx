import { useTranslation } from 'react-i18next';
import type { components } from '../api/generated/schema';
import { SUBJECT_COLOR_STYLES } from '../utils/subjectColors';

type SubjectColor = components['schemas']['SubjectColor'];

interface SubjectColorSwatchProps {
  color: SubjectColor;
  /**
   * Si es `true`, la muestra se oculta a las tecnologías de apoyo: el nombre del color ya está escrito junto
   * a ella (el selector del formulario). Si no, es una imagen con el nombre del color como nombre accesible.
   */
  decorative?: boolean;
  className?: string;
}

/**
 * Muestra el color de una asignatura: un cuadrado con el fondo y el borde de su estilo en la paleta. **El color
 * nunca es la única pista**: o lleva el nombre como nombre accesible (en el listado) o el nombre está escrito
 * al lado (en el formulario, donde es decorativa).
 */
export function SubjectColorSwatch({
  color,
  decorative = false,
  className,
}: SubjectColorSwatchProps) {
  const { t } = useTranslation();
  const { background, border } = SUBJECT_COLOR_STYLES[color];
  const classes = `d-inline-block flex-shrink-0 rounded${className ? ` ${className}` : ''}`;
  const style = {
    width: '1.25rem',
    height: '1.25rem',
    backgroundColor: background,
    borderColor: border,
    borderStyle: 'solid',
    borderWidth: '2px',
  } as const;

  if (decorative) {
    return <span aria-hidden="true" className={classes} style={style} />;
  }
  return (
    <span
      role="img"
      aria-label={t('subjects.list.color', { color: t(`subjects.colors.${color}`) })}
      className={classes}
      style={style}
    />
  );
}
