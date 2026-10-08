import { Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { RegisterPage } from './pages/RegisterPage';

/** Rutas de la aplicación. El router (BrowserRouter) lo aporta main.tsx. */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/registro" element={<RegisterPage />} />
    </Routes>
  );
}
