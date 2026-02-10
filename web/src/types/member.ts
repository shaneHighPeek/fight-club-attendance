export type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black';

export interface Member {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'active' | 'inactive' | 'suspended';
  membershipType: string;
  rank?: {
    belt: Belt;
    stripes: 0 | 1 | 2 | 3 | 4;
  };
}
