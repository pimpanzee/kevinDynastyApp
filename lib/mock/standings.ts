import type { StandingsGroup } from '@/lib/types';

/**
 * League standings by conference/division, ported from "Standings.dc.html".
 * `pp` is power points — a power-ranking metric distinct from points for.
 */
export const STANDINGS: StandingsGroup[] = [
  {
    label: 'CONFERENCE 1 · DIVISION 1',
    teams: [
      { name: 'Ridge Runners', record: '11-3-0', pf: '2275.9', pa: '1495.7', div: '4-0-0', conf: '8-0-0', pp: '2649.6', pct: '.786', gb: '—', streak: 'W5', avgPf: '162.6', avgPa: '106.8' },
      { name: 'Mahomes Depot', record: '7-7-0', pf: '1875.6', pa: '1690.1', div: '2-2-0', conf: '4-4-0', pp: '2106.7', pct: '.500', gb: '4.0', streak: 'L1', avgPf: '133.9', avgPa: '120.7' },
      { name: 'Tanking Softly', record: '2-12-0', pf: '1515.6', pa: '1848.1', div: '0-4-0', conf: '1-7-0', pp: '1804.6', pct: '.143', gb: '9.0', streak: 'L4', avgPf: '108.3', avgPa: '132.0' },
    ],
  },
  {
    label: 'CONFERENCE 1 · DIVISION 2',
    teams: [
      { name: 'Sunk Cost Fantasy', record: '12-2-0', pf: '2136.7', pa: '1345.5', div: '4-0-0', conf: '7-1-0', pp: '2541.2', pct: '.857', gb: '—', streak: 'W3', avgPf: '152.6', avgPa: '96.1' },
      { name: "Kelce's Angels", record: '8-6-0', pf: '2049.5', pa: '1536.6', div: '2-2-0', conf: '6-2-0', pp: '2488.8', pct: '.571', gb: '4.0', streak: 'L2', avgPf: '146.4', avgPa: '109.8' },
      { name: 'Rookie Szn', record: '1-13-0', pf: '1427.0', pa: '1566.6', div: '0-4-0', conf: '1-7-0', pp: '1658.1', pct: '.071', gb: '11.0', streak: 'L1', avgPf: '101.9', avgPa: '111.9' },
    ],
  },
  {
    label: 'CONFERENCE 2 · DIVISION 1',
    teams: [
      { name: 'Bijan Mustard', record: '9-5-0', pf: '2049.5', pa: '1536.6', div: '4-0-0', conf: '6-2-0', pp: '2488.8', pct: '.643', gb: '—', streak: 'L2', avgPf: '146.4', avgPa: '109.8' },
      { name: 'Third Round Reach', record: '6-8-0', pf: '1804.2', pa: '1799.8', div: '2-2-0', conf: '4-4-0', pp: '2010.4', pct: '.429', gb: '3.0', streak: 'W1', avgPf: '128.9', avgPa: '128.6' },
      { name: 'Waiver Wire Warlords', record: '3-11-0', pf: '1560.3', pa: '1780.9', div: '0-4-0', conf: '2-6-0', pp: '1820.5', pct: '.214', gb: '6.0', streak: 'L3', avgPf: '111.5', avgPa: '127.2' },
    ],
  },
  {
    label: 'CONFERENCE 2 · DIVISION 2',
    teams: [
      { name: 'Trust the Process', record: '10-4-0', pf: '2010.8', pa: '1601.4', div: '3-1-0', conf: '6-2-0', pp: '2390.1', pct: '.714', gb: '—', streak: 'W2', avgPf: '143.6', avgPa: '114.4' },
      { name: 'Zero RB Zealots', record: '7-7-0', pf: '1890.2', pa: '1750.6', div: '2-2-0', conf: '4-4-0', pp: '2150.9', pct: '.500', gb: '3.0', streak: 'W1', avgPf: '135.0', avgPa: '125.0' },
      { name: 'Dak to the Future', record: '4-10-0', pf: '1650.1', pa: '1899.3', div: '1-3-0', conf: '2-6-0', pp: '1902.7', pct: '.286', gb: '6.0', streak: 'L2', avgPf: '117.9', avgPa: '135.7' },
    ],
  },
];
