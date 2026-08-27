import type { RosterPlayer } from '@/lib/types';
import { rand } from './derive';

/** The authored roster for the user's own franchise (Ridge Runners). */
export const RIDGE_RUNNERS: RosterPlayer[] = [
  { name: 'Trevor Lawrence', team: 'JAC', pos: 'QB', ecr: 'QB9', proj: '16.99', pts: '298.48', bye: 7, salary: 220.0, years: 2, status: 'SIGNED', matchup: 3 },
  { name: 'Brock Purdy', team: 'SFO', pos: 'QB', ecr: 'QB14', proj: '16.83', pts: '160.08', bye: 9, salary: 240.9, years: 2, status: 'SIGNED', matchup: 3 },
  { name: 'Malik Willis', team: 'MIA', pos: 'QB', ecr: 'QB19', proj: '16.07', pts: '48.68', bye: 6, salary: 125.0, years: 1, status: 'EXPIRING', matchup: 3 },
  { name: 'Kayton Allen', team: 'WAS', pos: 'RB', ecr: 'RB73', proj: '1.26', pts: '—', bye: 7, salary: 45.0, years: 2, status: 'SIGNED', matchup: 3 },
  { name: 'Saquon Barkley', team: 'PHI', pos: 'RB', ecr: 'RB8', proj: '14.46', pts: '212.80', bye: 10, salary: 350.0, years: 2, status: 'SIGNED', matchup: 4 },
  { name: 'Jacory Croskey-Merritt', team: 'WAS', pos: 'RB', ecr: 'RB37', proj: '7.65', pts: '133.80', bye: 7, salary: 5.5, years: 1, status: 'ROOKIE', matchup: 2 },
  { name: 'Woody Marks', team: 'HOU', pos: 'RB', ecr: 'RB49', proj: '6.75', pts: '133.10', bye: 8, salary: 5.5, years: 1, status: 'ROOKIE', matchup: 2 },
  { name: 'Devin Neal', team: 'NOS', pos: 'RB', ecr: 'RB89', proj: '0.17', pts: '51.50', bye: 7, salary: 5.5, years: 1, status: 'ROOKIE', matchup: 1 },
  { name: 'Kenneth Walker III', team: 'KCC', pos: 'RB', ecr: 'RB13', proj: '13.16', pts: '176.40', bye: 5, salary: 295.0, years: 1, status: 'EXPIRING', matchup: 3 },
  { name: 'Jordan Addison', team: 'MIN', pos: 'WR', ecr: 'WR42', proj: '8.52', pts: '114.10', bye: 6, salary: 181.02, years: 1, status: 'EXPIRING', matchup: 3 },
  { name: 'A.J. Brown', team: 'NEP', pos: 'WR', ecr: 'WR11', proj: '12.13', pts: '181.30', bye: 11, salary: 230.0, years: 1, status: 'EXPIRING', matchup: 4 },
  { name: 'Luther Burden', team: 'CHI', pos: 'WR', ecr: 'WR28', proj: '10.01', pts: '104.40', bye: 7, salary: 69.3, years: 2, status: 'SIGNED', matchup: 2 },
  { name: 'Chimere Dike', team: 'TEN', pos: 'WR', ecr: 'WR97', proj: '2.26', pts: '140.90', bye: 9, salary: 20.0, years: 1, status: 'ROOKIE', matchup: 1 },
  { name: 'Tetairoa McMillan', team: 'CAR', pos: 'WR', ecr: 'WR16', proj: '11.71', pts: '175.40', bye: 5, salary: 127.6, years: 1, status: 'ROOKIE', matchup: 3 },
  { name: 'Carnell Tate', team: 'TEN', pos: 'WR', ecr: 'WR33', proj: '9.52', pts: '—', bye: 9, salary: 122.0, years: 2, status: 'SIGNED', matchup: 4 },
  { name: 'Dontayvion Wicks', team: 'PHI', pos: 'WR', ecr: 'WR63', proj: '5.87', pts: '60.80', bye: 10, salary: 5.0, years: 1, status: 'ROOKIE', matchup: 2 },
  { name: 'Antonio Williams', team: 'WAS', pos: 'WR', ecr: 'WR90', proj: '2.86', pts: '69.00', bye: 7, salary: 69.0, years: 2, status: 'SIGNED', matchup: 1 },
  { name: 'AJ Barner', team: 'SEA', pos: 'TE', ecr: 'TE22', proj: '6.10', pts: '121.30', bye: 11, salary: 20.0, years: 1, status: 'ROOKIE', matchup: 3 },
  { name: 'T.J. Hockenson', team: 'MIN', pos: 'TE', ecr: 'TE21', proj: '6.49', pts: '87.30', bye: 6, salary: 35.0, years: 1, status: 'SIGNED', matchup: 3 },
  { name: 'Eli Raridon', team: 'NEP', pos: 'TE', ecr: 'TE45', proj: '1.84', pts: '12.00', bye: 11, salary: 12.0, years: 3, status: 'ROOKIE', matchup: 2 },
];

export const RIDGE_RUNNERS_TAXI: RosterPlayer[] = [
  { name: 'Jaydon Blue', team: 'DAL', pos: 'RB', ecr: 'RB55', proj: '2.63', pts: '19.90', bye: 14, salary: 19.8, years: 1, matchup: 4 },
  { name: 'Adam Randall', team: 'BAL', pos: 'RB', ecr: 'RB86', proj: '0.89', pts: '—', bye: 13, salary: 5.0, years: 2, matchup: 1 },
  { name: 'Konata Mumpfield', team: 'LAR', pos: 'WR', ecr: 'WR171', proj: '1.27', pts: '20.20', bye: 11, salary: 36.0, years: 1, matchup: 3 },
  { name: 'Elijah Arroyo', team: 'SEA', pos: 'TE', ecr: 'TE42', proj: '2.96', pts: '28.40', bye: 1, salary: 22.0, years: 1, matchup: 4 },
];

/* The other 11 franchises have no authored roster — they are synthesized
   from these pools, seeded by franchise index so they stay stable. */

const QB_POOL = ['C. Stroud DEN', 'J. Herbert LAC', 'K. Murray ARI', 'B. Nix NYJ', 'D. Prescott DAL', 'J. Love GB', 'A. Richardson IND', 'G. Smith SEA'];
const RB_POOL = ['D. Henry BAL', 'J. Gibbs DET', 'B. Robinson ATL', 'K. Walker SEA', 'J. Cook BUF', 'R. Stevenson NEP', 'A. Jones MIN', 'T. Etienne JAC', 'J. Mason PIT', 'Z. Charbonnet SEA'];
const WR_POOL = ['CeeDee Lamb DAL', 'A.J. Brown PHI', 'Puka Nacua LAR', 'Garrett Wilson NYJ', 'Chris Olave NOS', 'DK Metcalf SEA', 'Terry McLaurin WAS', 'Courtland Sutton DEN', 'Jaylen Waddle MIA', 'Rome Odunze CHI', 'Xavier Worthy KCC', 'Marvin Harrison Jr ARI'];
const TE_POOL = ['Sam LaPorta DET', 'Trey McBride ARI', 'Dalton Kincaid BUF', 'Brock Bowers LVR', 'Evan Engram DEN', 'Cole Kmet CHI'];
const STATUSES = ['SIGNED', 'EXPIRING', 'ROOKIE'];

function synthRoster(seed: number): RosterPlayer[] {
  const take = (pool: string[], n: number, offset: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(pool[(offset + i) % pool.length]);
    return out;
  };
  const build = (pool: string[], n: number, pos: string, offset: number): RosterPlayer[] =>
    take(pool, n, offset).map((entry, i) => {
      const parts = entry.split(' ');
      const nm = parts.slice(0, -1).join(' ');
      const team = parts[parts.length - 1];
      const r = (k: number) => rand(seed * 97 + offset * 13 + i * 7 + k);
      return {
        name: nm,
        team,
        pos,
        ecr: pos + (5 + Math.floor(r(1) * 90)),
        proj: (2 + r(2) * 16).toFixed(2),
        pts: (30 + r(3) * 220).toFixed(2),
        bye: 5 + Math.floor(r(4) * 9),
        salary: Math.round((5 + r(5) * 300) * 100) / 100,
        years: 1 + Math.floor(r(6) * 3),
        status: STATUSES[Math.floor(r(7) * 3)],
        matchup: 1 + Math.floor(r(8) * 5),
      };
    });
  return [
    ...build(QB_POOL, 2, 'QB', seed + 1),
    ...build(RB_POOL, 4, 'RB', seed + 2),
    ...build(WR_POOL, 4, 'WR', seed + 3),
    ...build(TE_POOL, 2, 'TE', seed + 4),
  ];
}

export function getRoster(franchiseIdx: number): RosterPlayer[] {
  return franchiseIdx === 0 ? RIDGE_RUNNERS : synthRoster(franchiseIdx);
}

export function getTaxi(franchiseIdx: number): RosterPlayer[] {
  return franchiseIdx === 0 ? RIDGE_RUNNERS_TAXI : synthRoster(franchiseIdx + 100).slice(0, 3);
}

/** Salary-cap adjustment for a franchise, in the same units as salary. */
export function getAdjustment(franchiseIdx: number): number {
  return franchiseIdx === 0 ? 67.65 : Math.round(rand(franchiseIdx * 11) * 40 - 10);
}
