import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from './context';
import type { AppRole } from './types';

interface RequireAuthProps {
  allowedRoles?: AppRole[];
}

export function RequireAuth({ allowedRoles }: RequireAuthProps) {
  const { loading, role, user } = useAuth();

  if (loading) {
    return (
      <div className="page">
        <h2>Loading...</h2>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
