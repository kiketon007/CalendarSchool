import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';

/** Página inicial (vacía en US00): solo muestra el título y la descripción de la aplicación. */
export function HomePage() {
  const { t } = useTranslation();

  return (
    <Container as="main" className="py-5" data-testid="home-page">
      <h1>{t('home.title')}</h1>
      <p className="lead">{t('home.description')}</p>
    </Container>
  );
}
