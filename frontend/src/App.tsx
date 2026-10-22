import { Route, Routes } from 'react-router';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
import { CoursesPage } from './pages/CoursesPage';
import { CreateCoursePage } from './pages/CreateCoursePage';
import { EditCoursePage } from './pages/EditCoursePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { CreateProfessorPage } from './pages/CreateProfessorPage';
import { CreateStudentPage } from './pages/CreateStudentPage';
import { EditStudentPage } from './pages/EditStudentPage';
import { EditProfessorPage } from './pages/EditProfessorPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { ProfessorsPage } from './pages/ProfessorsPage';
import { RegisterPage } from './pages/RegisterPage';
import { StudentsPage } from './pages/StudentsPage';
import { UsersPage } from './pages/UsersPage';
import { AuthenticatedLayout } from './routes/AuthenticatedLayout';
import { RequireRole } from './routes/RequireRole';

/**
 * Rutas de la aplicación: las públicas, sueltas, y las que exigen sesión, bajo `AuthenticatedLayout`
 * (guarda de sesión, cabecera y navegación). El router (BrowserRouter) y la sesión (SessionProvider)
 * los aporta main.tsx.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacidad" element={<PrivacyPolicyPage />} />
      <Route path="/invitacion" element={<AcceptInvitationPage />} />
      <Route path="/restablecer" element={<PasswordResetPage />} />
      <Route element={<AuthenticatedLayout />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/cursos" element={<CoursesPage />} />
        <Route path="/cursos/nuevo" element={<CreateCoursePage />} />
        <Route path="/cursos/:id/editar" element={<EditCoursePage />} />
        <Route path="/profesores" element={<ProfessorsPage />} />
        <Route path="/profesores/nuevo" element={<CreateProfessorPage />} />
        <Route path="/profesores/:id/editar" element={<EditProfessorPage />} />
        <Route path="/alumnos" element={<StudentsPage />} />
        <Route path="/alumnos/nuevo" element={<CreateStudentPage />} />
        <Route path="/alumnos/:id/editar" element={<EditStudentPage />} />
        <Route element={<RequireRole role="ADMIN" />}>
          <Route path="/usuarios" element={<UsersPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
