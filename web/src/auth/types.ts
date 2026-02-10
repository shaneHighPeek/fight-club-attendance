import type { User } from 'firebase/auth';

export type AppRole = 'admin' | 'manager' | 'coach' | 'member' | null;

export interface AuthState {
  user: User | null;
  role: AppRole;
  loading: boolean;
}
