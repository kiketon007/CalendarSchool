import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import es from './es.json';

/** Idioma por defecto de la aplicación: castellano. */
export const DEFAULT_LANGUAGE = 'es';

// Todos los textos visibles salen de estos recursos: nunca se escriben en los componentes.
void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  // React ya escapa los valores al renderizar.
  interpolation: { escapeValue: false },
});

export default i18n;
