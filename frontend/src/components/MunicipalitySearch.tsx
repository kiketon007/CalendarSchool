import { useMemo, useState, type KeyboardEvent } from 'react';
import Form from 'react-bootstrap/Form';
import ListGroup from 'react-bootstrap/ListGroup';
import { useTranslation } from 'react-i18next';
import type { Municipality } from '../services/registrationService';

/** Máximo de municipios que muestra la lista: con más resultados se invita a seguir escribiendo. */
const MAX_RESULTS = 50;

/** Minúsculas y sin acentos, para buscar «valencia» y encontrar «València». */
function searchable(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

interface MunicipalitySearchProps {
  id: string;
  municipalities: Municipality[];
  /** Código INE del municipio elegido, o cadena vacía si no hay ninguno. */
  value: string;
  onChange: (code: string) => void;
  onBlur?: () => void;
  isInvalid?: boolean;
  'aria-describedby'?: string;
}

/**
 * Buscador de municipio (patrón combobox con lista de WAI-ARIA). Solo da por elegido un
 * municipio de la lista: al editar el texto se borra la selección, de modo que no se admite
 * texto libre.
 */
export function MunicipalitySearch({
  id,
  municipalities,
  value,
  onChange,
  onBlur,
  isInvalid = false,
  'aria-describedby': describedBy,
}: MunicipalitySearchProps) {
  const { t } = useTranslation();
  // `null` = no se está editando: el campo muestra el nombre del municipio elegido.
  const [query, setQuery] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const searchableNames = useMemo(
    () => municipalities.map((municipality) => searchable(municipality.name)),
    [municipalities],
  );
  const selected = municipalities.find((municipality) => municipality.code === value);
  const text = query ?? selected?.name ?? '';

  const results = useMemo(() => {
    const needle = searchable((query ?? '').trim());
    if (needle === '') {
      return [];
    }
    return municipalities
      .filter((_municipality, index) => searchableNames[index]?.includes(needle))
      .slice(0, MAX_RESULTS);
  }, [query, municipalities, searchableNames]);

  const listboxId = `${id}-listbox`;
  const optionId = (code: string) => `${id}-option-${code}`;
  const activeOption = isOpen ? results[activeIndex] : undefined;

  function select(municipality: Municipality) {
    setQuery(null);
    setIsOpen(false);
    setActiveIndex(-1);
    onChange(municipality.code);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && isOpen) {
      // Con la lista abierta, Enter elige la opción activa y nunca envía el formulario.
      event.preventDefault();
      if (activeOption) {
        select(activeOption);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <div className="position-relative">
      <Form.Control
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isOpen && results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeOption ? optionId(activeOption.code) : undefined}
        aria-describedby={describedBy}
        aria-invalid={isInvalid}
        isInvalid={isInvalid}
        placeholder={t('registration.fields.municipalityCode.placeholder')}
        value={text}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
          // Editar el texto invalida la selección anterior.
          onChange('');
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setIsOpen(false);
          onBlur?.();
        }}
      />
      {isOpen && results.length > 0 && (
        <ListGroup
          as="ul"
          role="listbox"
          id={listboxId}
          className="position-absolute w-100 shadow"
          style={{ zIndex: 1000, maxHeight: '16rem', overflowY: 'auto' }}
        >
          {results.map((municipality, index) => (
            <ListGroup.Item
              as="li"
              role="option"
              key={municipality.code}
              id={optionId(municipality.code)}
              aria-selected={index === activeIndex}
              active={index === activeIndex}
              style={{ cursor: 'pointer' }}
              // mousedown evita que el campo pierda el foco antes de registrar el clic.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                select(municipality);
              }}
            >
              {`${municipality.name} — ${municipality.province}`}
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
      {isOpen && results.length === 0 && (query ?? '').trim() !== '' && (
        <div role="status" className="form-text">
          {t('registration.municipalities.noResults')}
        </div>
      )}
    </div>
  );
}
