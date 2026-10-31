import { Route, Routes } from 'react-router';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
import { CalendarsPage } from './pages/CalendarsPage';
import { ConstraintsPage } from './pages/ConstraintsPage';
import { CoursesPage } from './pages/CoursesPage';
import { CourseWorkloadPage } from './pages/CourseWorkloadPage';
import { SubjectSlotsPage } from './pages/SubjectSlotsPage';
import { CreateCalendarPage } from './pages/CreateCalendarPage';
import { CreateSubjectPage } from './pages/CreateSubjectPage';
import { EditCalendarPage } from './pages/EditCalendarPage';
import { CreateCoursePage } from './pages/CreateCoursePage';
import { EditCoursePage } from './pages/EditCoursePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { CreateProfessorPage } from './pages/CreateProfessorPage';
import { CreateStudentPage } from './pages/CreateStudentPage';
import { EditStudentPage } from './pages/EditStudentPage';
import { EditSubjectPage } from './pages/EditSubjectPage';
import { EditProfessorPage } from './pages/EditProfessorPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { ProfessorAvailabilityPage } from './pages/ProfessorAvailabilityPage';
import { ProfessorsPage } from './pages/ProfessorsPage';
import { RegisterPage } from './pages/RegisterPage';
import { StudentsPage } from './pages/StudentsPage';
import { SubjectsPage } from './pages/SubjectsPage';
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
        <Route path="/cursos/:id/carga" element={<CourseWorkloadPage />} />
        <Route
          path="/cursos/:courseId/carga/:subjectId/prohibidas"
          element={<SubjectSlotsPage type="FORBIDDEN_SLOTS" />}
        />
        <Route
          path="/cursos/:courseId/carga/:subjectId/preferidas"
          element={<SubjectSlotsPage type="PREFERRED_SLOTS" />}
        />
        <Route path="/profesores" element={<ProfessorsPage />} />
        <Route path="/profesores/nuevo" element={<CreateProfessorPage />} />
        <Route path="/profesores/:id/editar" element={<EditProfessorPage />} />
        <Route path="/profesores/:id/disponibilidad" element={<ProfessorAvailabilityPage />} />
        <Route path="/alumnos" element={<StudentsPage />} />
        <Route path="/alumnos/nuevo" element={<CreateStudentPage />} />
        <Route path="/alumnos/:id/editar" element={<EditStudentPage />} />
        <Route path="/calendarios" element={<CalendarsPage />} />
        <Route path="/asignaturas" element={<SubjectsPage />} />
        <Route path="/reglas" element={<ConstraintsPage />} />
        <Route element={<RequireRole role="ADMIN" />}>
          <Route path="/calendarios/nuevo" element={<CreateCalendarPage />} />
          <Route path="/calendarios/:id/editar" element={<EditCalendarPage />} />
          <Route path="/asignaturas/nueva" element={<CreateSubjectPage />} />
          <Route path="/asignaturas/:id/editar" element={<EditSubjectPage />} />
          <Route path="/usuarios" element={<UsersPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
