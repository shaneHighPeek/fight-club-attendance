import { createContext, useContext } from 'react';

import type { AuthState } from './types';

export const AuthContext = createContext<AuthState>({ user: null, role: null, loading: true });

export function useAuth() {
  return useContext(AuthContext);
}
