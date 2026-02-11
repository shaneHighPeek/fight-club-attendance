export type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black';

export interface Member {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  status: 'active' | 'inactive' | 'suspended';
  membershipType: string;
  waiverAcceptedAt?: Date | null;
  waiverDisclaimerVersion?: string;
  rank?: {
    belt: Belt;
    stripes: 0 | 1 | 2 | 3 | 4;
  };
}
