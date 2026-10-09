import { Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { RegisterPage } from './pages/RegisterPage';

/** Rutas de la aplicación. El router (BrowserRouter) y la sesión (SessionProvider) los aporta main.tsx. */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
    </Routes>
  );
}
