import { Navigate, Outlet } from 'react-router';
import type { components } from '../api/generated/schema';
import { useSession } from '../session/SessionProvider';

type Role = components['schemas']['SessionUser']['role'];

/**
 * Guarda de rol de las páginas reservadas a un rol: otro rol lleva a `/onboarding` sin ningún
 * mensaje. Es solo una comodidad de la interfaz (el rol de la sesión en memoria puede ir por detrás
 * del real): la autorización la decide siempre el backend. Va dentro de `AuthenticatedLayout`, que
 * ya resuelve la sesión.
 */
export function RequireRole({ role }: { role: Role }) {
  const { state } = useSession();

  if (state.status !== 'authenticated') {
    return null;
  }
  return state.data.user.role === role ? <Outlet /> : <Navigate to="/onboarding" replace />;
}
