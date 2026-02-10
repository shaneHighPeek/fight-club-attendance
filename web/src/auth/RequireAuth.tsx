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
    return (
      <div className="page">
        <h1>Access Pending</h1>
        <p>
          Your account is signed in, but does not have a staff role yet.
        </p>
        <p>
          Ask an admin to assign one of: <code>admin</code>, <code>manager</code>,
          or <code>coach</code>.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
