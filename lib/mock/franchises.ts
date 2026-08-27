/** The 12 league franchises. Index 0 is the user's own team. */
export const FRANCHISES = [
  'Ridge Runners',
  'Mahomes Depot',
  'Tanking Softly',
  'Sunk Cost Fantasy',
  "Kelce's Angels",
  'Rookie Szn',
  'Bijan Mustard',
  'Third Round Reach',
  'Waiver Wire Warlords',
  'Trust the Process',
  'Zero RB Zealots',
  'Dak to the Future',
] as const;

/**
 * The user's franchise. Rosters default to this on load.
 * Maps to FRANCHISE_ID 0012 in MFL_API_CONTEXT.md once real data lands.
 */
export const MY_FRANCHISE_INDEX = 0;
