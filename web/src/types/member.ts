import type { AgeBand, RankProfile } from '../config/rankSystem';

export type Belt = string;

export interface Member {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  phone: string;
  email?: string;
  birthDate?: string;
  ageBand?: AgeBand;
  status: 'active' | 'pending' | 'failed' | 'stopped' | 'temp' | 'null' | 'inactive' | 'suspended';
  membershipType: string;
  waiverAcceptedAt?: Date | null;
  waiverDisclaimerVersion?: string;
  rank?: {
    belt: Belt;
    stripes: number;
  };
  rankProfile?: RankProfile;
}
