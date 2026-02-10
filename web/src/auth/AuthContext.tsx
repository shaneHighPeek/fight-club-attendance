import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { env } from '../config/env';
import { auth } from '../services/firebase';
import { AuthContext } from './context';
import type { AppRole } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const token = await nextUser.getIdTokenResult();
        const tokenRole = token.claims.role;
        if (tokenRole === 'admin' || tokenRole === 'manager' || tokenRole === 'coach' || tokenRole === 'member') {
          setRole(tokenRole);
        } else if (
          nextUser.email &&
          env.bootstrapAdminEmail &&
          nextUser.email.toLowerCase() === env.bootstrapAdminEmail.toLowerCase()
        ) {
          // Dev bootstrap: allows first admin in a new project before custom claims are wired.
          setRole('admin');
        } else {
          setRole(null);
        }
      } catch (error) {
        console.error('Failed to load role claim', error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  const value = useMemo(() => ({ user, role, loading }), [loading, role, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
