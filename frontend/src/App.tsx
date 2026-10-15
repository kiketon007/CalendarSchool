import { Route, Routes } from 'react-router';
import { AppHeader } from './components/AppHeader';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { RegisterPage } from './pages/RegisterPage';

/** Cabecera (solo con sesión) y rutas de la aplicación. El router (BrowserRouter) y la sesión (SessionProvider) los aporta main.tsx. */
export function App() {
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/privacidad" element={<PrivacyPolicyPage />} />
      </Routes>
    </>
  );
}
