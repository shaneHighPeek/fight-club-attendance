export type AgeBand = 'under_8' | 'youth_8_15' | 'adult_16_plus';

export interface RankStep {
  id: string;
  ageBand: AgeBand;
  rankOrder: number;
  beltName: string;
  baseColour: string;
  stripeColour: string | null;
  degreeLevel: number | string;
  notes?: string;
}

export interface RankProfile {
  ageBand: AgeBand;
  rankSystem: 'u8' | 'youth' | 'adult';
  rankStepId: string;
  rankStepOrder: number;
  beltName: string;
  baseColour: string;
  stripeColour: string | null;
  degreeLevel: number | string;
}

const UNDER_8: RankStep[] = [
  { id: 'u8_01_white', ageBand: 'under_8', rankOrder: 1, beltName: 'White', baseColour: 'White', stripeColour: null, degreeLevel: 0, notes: 'Beginner' },
  { id: 'u8_02_white_grey_stripe', ageBand: 'under_8', rankOrder: 2, beltName: 'White Grey Stripe', baseColour: 'White', stripeColour: 'Grey', degreeLevel: 0 },
  { id: 'u8_03_white_yellow_stripe', ageBand: 'under_8', rankOrder: 3, beltName: 'White Yellow Stripe', baseColour: 'White', stripeColour: 'Yellow', degreeLevel: 0 },
  { id: 'u8_04_white_orange_stripe', ageBand: 'under_8', rankOrder: 4, beltName: 'White Orange Stripe', baseColour: 'White', stripeColour: 'Orange', degreeLevel: 0 },
  { id: 'u8_05_white_green_stripe', ageBand: 'under_8', rankOrder: 5, beltName: 'White Green Stripe', baseColour: 'White', stripeColour: 'Green', degreeLevel: 0 },
  { id: 'u8_06_white_blue_stripe', ageBand: 'under_8', rankOrder: 6, beltName: 'White Blue Stripe', baseColour: 'White', stripeColour: 'Blue', degreeLevel: 0 },
  { id: 'u8_07_white_purple_stripe', ageBand: 'under_8', rankOrder: 7, beltName: 'White Purple Stripe', baseColour: 'White', stripeColour: 'Purple', degreeLevel: 0 },
  { id: 'u8_08_white_brown_stripe', ageBand: 'under_8', rankOrder: 8, beltName: 'White Brown Stripe', baseColour: 'White', stripeColour: 'Brown', degreeLevel: 0 },
  { id: 'u8_09_white_black_stripe', ageBand: 'under_8', rankOrder: 9, beltName: 'White Black Stripe', baseColour: 'White', stripeColour: 'Black', degreeLevel: 0, notes: 'Pre-transition' },
];

const YOUTH_8_15: RankStep[] = [
  { id: 'y_01_white_black_stripe', ageBand: 'youth_8_15', rankOrder: 1, beltName: 'White Black Stripe', baseColour: 'White', stripeColour: 'Black', degreeLevel: 0, notes: 'Entry' },
  { id: 'y_02_grey_white', ageBand: 'youth_8_15', rankOrder: 2, beltName: 'Grey White', baseColour: 'Grey', stripeColour: 'White', degreeLevel: 0 },
  { id: 'y_03_grey_white_stripe', ageBand: 'youth_8_15', rankOrder: 3, beltName: 'Grey White Stripe', baseColour: 'Grey', stripeColour: 'White', degreeLevel: 1 },
  { id: 'y_04_grey', ageBand: 'youth_8_15', rankOrder: 4, beltName: 'Grey', baseColour: 'Grey', stripeColour: null, degreeLevel: 2 },
  { id: 'y_05_grey_black_stripe', ageBand: 'youth_8_15', rankOrder: 5, beltName: 'Grey Black Stripe', baseColour: 'Grey', stripeColour: 'Black', degreeLevel: 3 },
  { id: 'y_06_yellow_grey', ageBand: 'youth_8_15', rankOrder: 6, beltName: 'Yellow Grey', baseColour: 'Yellow', stripeColour: 'Grey', degreeLevel: 0 },
  { id: 'y_07_yellow_white_stripe', ageBand: 'youth_8_15', rankOrder: 7, beltName: 'Yellow White Stripe', baseColour: 'Yellow', stripeColour: 'White', degreeLevel: 1 },
  { id: 'y_08_yellow', ageBand: 'youth_8_15', rankOrder: 8, beltName: 'Yellow', baseColour: 'Yellow', stripeColour: null, degreeLevel: 2 },
  { id: 'y_09_yellow_black_stripe', ageBand: 'youth_8_15', rankOrder: 9, beltName: 'Yellow Black Stripe', baseColour: 'Yellow', stripeColour: 'Black', degreeLevel: 3 },
  { id: 'y_10_orange_yellow', ageBand: 'youth_8_15', rankOrder: 10, beltName: 'Orange Yellow', baseColour: 'Orange', stripeColour: 'Yellow', degreeLevel: 0 },
  { id: 'y_11_orange_white_stripe', ageBand: 'youth_8_15', rankOrder: 11, beltName: 'Orange White Stripe', baseColour: 'Orange', stripeColour: 'White', degreeLevel: 1 },
  { id: 'y_12_orange', ageBand: 'youth_8_15', rankOrder: 12, beltName: 'Orange', baseColour: 'Orange', stripeColour: null, degreeLevel: 2 },
  { id: 'y_13_orange_black_stripe', ageBand: 'youth_8_15', rankOrder: 13, beltName: 'Orange Black Stripe', baseColour: 'Orange', stripeColour: 'Black', degreeLevel: 3 },
  { id: 'y_14_green_orange', ageBand: 'youth_8_15', rankOrder: 14, beltName: 'Green Orange', baseColour: 'Green', stripeColour: 'Orange', degreeLevel: 0 },
  { id: 'y_15_green_white_stripe', ageBand: 'youth_8_15', rankOrder: 15, beltName: 'Green White Stripe', baseColour: 'Green', stripeColour: 'White', degreeLevel: 1 },
  { id: 'y_16_green', ageBand: 'youth_8_15', rankOrder: 16, beltName: 'Green', baseColour: 'Green', stripeColour: null, degreeLevel: 2 },
  { id: 'y_17_green_black_stripe', ageBand: 'youth_8_15', rankOrder: 17, beltName: 'Green Black Stripe', baseColour: 'Green', stripeColour: 'Black', degreeLevel: 3 },
  { id: 'y_18_blue_green', ageBand: 'youth_8_15', rankOrder: 18, beltName: 'Blue Green', baseColour: 'Blue', stripeColour: 'Green', degreeLevel: 0, notes: 'Transition to adults' },
];

const ADULT_CORE_BELTS = [
  { base: 'White', maxDegree: 4, notes: 'Beginner' },
  { base: 'Blue', maxDegree: 4, notes: 'Fundamental competency' },
  { base: 'Purple', maxDegree: 4, notes: 'Intermediate' },
  { base: 'Brown', maxDegree: 4, notes: 'Advanced' },
  { base: 'Black', maxDegree: 6, notes: 'Instructor level' },
] as const;

const ADULT_DANS: RankStep[] = [
  { id: 'a_100_shodan', ageBand: 'adult_16_plus', rankOrder: 100, beltName: 'Black Belt', baseColour: 'Black', stripeColour: null, degreeLevel: '1st Dan', notes: 'Shodan' },
  { id: 'a_101_nidan', ageBand: 'adult_16_plus', rankOrder: 101, beltName: 'Black Belt', baseColour: 'Black', stripeColour: null, degreeLevel: '2nd Dan', notes: 'Nidan' },
  { id: 'a_102_sandan', ageBand: 'adult_16_plus', rankOrder: 102, beltName: 'Black Belt', baseColour: 'Black', stripeColour: null, degreeLevel: '3rd Dan', notes: 'Sandan' },
  { id: 'a_103_yondan', ageBand: 'adult_16_plus', rankOrder: 103, beltName: 'Black Belt', baseColour: 'Black', stripeColour: null, degreeLevel: '4th Dan', notes: 'Yondan' },
  { id: 'a_104_godan', ageBand: 'adult_16_plus', rankOrder: 104, beltName: 'Black Belt', baseColour: 'Black', stripeColour: null, degreeLevel: '5th Dan', notes: 'Godan' },
  { id: 'a_105_rokudan', ageBand: 'adult_16_plus', rankOrder: 105, beltName: 'Black Belt', baseColour: 'Black', stripeColour: null, degreeLevel: '6th Dan', notes: 'Rokudan' },
  { id: 'a_106_shichidan', ageBand: 'adult_16_plus', rankOrder: 106, beltName: 'Coral Belt (Red/Black)', baseColour: 'Coral', stripeColour: 'Red/Black', degreeLevel: '7th Dan', notes: 'Shichidan' },
  { id: 'a_107_hachidan', ageBand: 'adult_16_plus', rankOrder: 107, beltName: 'Coral Belt (Red/Black)', baseColour: 'Coral', stripeColour: 'Red/Black', degreeLevel: '8th Dan', notes: 'Hachidan' },
  { id: 'a_108_kudan', ageBand: 'adult_16_plus', rankOrder: 108, beltName: 'Red/White Belt', baseColour: 'Red/White', stripeColour: null, degreeLevel: '9th Dan', notes: 'Kudan' },
  { id: 'a_109_judan', ageBand: 'adult_16_plus', rankOrder: 109, beltName: 'Red Belt', baseColour: 'Red', stripeColour: null, degreeLevel: '10th Dan', notes: 'Judan' },
];

function buildAdultSteps(): RankStep[] {
  const steps: RankStep[] = [];
  let order = 1;
  for (const belt of ADULT_CORE_BELTS) {
    for (let degree = 0; degree <= belt.maxDegree; degree += 1) {
      steps.push({
        id: `a_${String(order).padStart(2, '0')}_${belt.base.toLowerCase()}_${degree}`,
        ageBand: 'adult_16_plus',
        rankOrder: order,
        beltName: belt.base,
        baseColour: belt.base,
        stripeColour: degree > 0 ? 'Black' : null,
        degreeLevel: degree,
        notes: belt.notes,
      });
      order += 1;
    }
  }
  return [...steps, ...ADULT_DANS];
}

export const RANK_STEPS: RankStep[] = [...UNDER_8, ...YOUTH_8_15, ...buildAdultSteps()];

export function getRankStepsForAgeBand(ageBand: AgeBand): RankStep[] {
  return RANK_STEPS.filter((step) => step.ageBand === ageBand).sort((a, b) => a.rankOrder - b.rankOrder);
}

export function getRankStepById(stepId: string | undefined | null): RankStep | null {
  if (!stepId) {
    return null;
  }
  return RANK_STEPS.find((step) => step.id === stepId) ?? null;
}

export function getDefaultRankStep(ageBand: AgeBand): RankStep {
  const steps = getRankStepsForAgeBand(ageBand);
  return steps[0];
}

export function rankSystemForAgeBand(ageBand: AgeBand): RankProfile['rankSystem'] {
  if (ageBand === 'under_8') {
    return 'u8';
  }
  if (ageBand === 'youth_8_15') {
    return 'youth';
  }
  return 'adult';
}

export function deriveAgeBandFromBirthDate(birthDate: string | undefined | null): AgeBand {
  if (!birthDate) {
    return 'adult_16_plus';
  }
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) {
    return 'adult_16_plus';
  }
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDiff = now.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }

  if (age < 8) {
    return 'under_8';
  }
  if (age < 16) {
    return 'youth_8_15';
  }
  return 'adult_16_plus';
}

export function toRankProfile(step: RankStep): RankProfile {
  return {
    ageBand: step.ageBand,
    rankSystem: rankSystemForAgeBand(step.ageBand),
    rankStepId: step.id,
    rankStepOrder: step.rankOrder,
    beltName: step.beltName,
    baseColour: step.baseColour,
    stripeColour: step.stripeColour,
    degreeLevel: step.degreeLevel,
  };
}

export function toLegacyRank(profile: RankProfile): { belt: string; stripes: number } {
  if (typeof profile.degreeLevel === 'number') {
    return {
      belt: profile.baseColour.toLowerCase(),
      stripes: profile.degreeLevel,
    };
  }

  const numericDan = Number(String(profile.degreeLevel).replace(/[^0-9]/g, ''));
  return {
    belt: profile.baseColour.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_'),
    stripes: Number.isFinite(numericDan) ? numericDan : 0,
  };
}
