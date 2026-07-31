/**
 * Generates the review-ledger status roll-up FROM the ledger's own rows.
 *
 * Exists because the first hand-typed roll-up was wrong in three of six rows
 * while sitting under a rule that counts must be mechanically reproducible.
 * A count that is retyped is a second account of one fact (defect class C3).
 *
 * Usage: node tools/ledger-rollup.ts [--check]
 *   --check exits 1 if the table in the ledger disagrees with the rows.
 */
import { readFileSync } from 'node:fs';

const STATUSES = ['closed', 'open', 'partial', 'superseded', 'residual-risk-accepted'] as const;
type Status = (typeof STATUSES)[number];

const LEDGER = 'docs/host-turn-contract-review-ledger.md';

export function parseStatuses(text: string): Map<string, Status> {
  const found = new Map<string, Status>();
  const alt = STATUSES.join('|');
  const heading = new RegExp(String.raw`^### (B-\d+|S-\d+|N-\d+) ·.*?\*\*(${alt})\*\*`, 'gm');
  const row = new RegExp(String.raw`^\| \*\*(M-\d+|N-\d+)\*\* \|.*?\| \*\*(${alt})\*\* \|`, 'gm');
  for (const m of text.matchAll(heading)) found.set(m[1]!, m[2]! as Status);
  for (const m of text.matchAll(row)) if (!found.has(m[1]!)) found.set(m[1]!, m[2]! as Status);
  return found;
}

const GROUPS: readonly { readonly label: string; readonly ids: readonly string[] }[] = [
  { label: '01 — blocking `B-1…B-8`', ids: ids('B', 1, 8) },
  { label: '01 — serious `S-1…S-14`', ids: ids('S', 1, 14) },
  { label: '01 — minor `M-1…M-9`', ids: ids('M', 1, 9) },
  { label: '02 — blocking `N-1…N-4`', ids: ids('N', 1, 4) },
  { label: '02 — serious `N-5…N-15`', ids: ids('N', 5, 15) },
  { label: '02 — minor `N-16…N-26`', ids: ids('N', 16, 26) },
];

function ids(prefix: string, lo: number, hi: number): string[] {
  const out: string[] = [];
  for (let i = lo; i <= hi; i += 1) out.push(`${prefix}-${i}`);
  return out;
}

const text = readFileSync(LEDGER, 'utf8');
const status = parseStatuses(text);

const missing = GROUPS.flatMap((g) => g.ids.filter((id) => !status.has(id)));
if (missing.length > 0) {
  console.error(`Unparseable status for: ${missing.join(', ')}`);
  process.exit(1);
}

const lines = ['| Pass | Findings | closed | partial | open | superseded |', '|---|---|---|---|---|---|'];
const total: Record<string, number> = {};
for (const g of GROUPS) {
  const c: Record<string, number> = {};
  for (const id of g.ids) {
    const s = status.get(id)!;
    c[s] = (c[s] ?? 0) + 1;
    total[s] = (total[s] ?? 0) + 1;
  }
  const n = (k: string): number => c[k] ?? 0;
  lines.push(`| ${g.label} | ${g.ids.length} | ${n('closed')} | ${n('partial')} | ${n('open')} | ${n('superseded')} |`);
}
const t = (k: string): number => total[k] ?? 0;
const sum = Object.values(total).reduce((a, b) => a + b, 0);
lines.push(`| **Total** | **${sum}** | **${t('closed')}** | **${t('partial')}** | **${t('open')}** | **${t('superseded')}** |`);

const blocking = [...ids('B', 1, 8), ...ids('N', 1, 4)].filter((i) => {
  const s = status.get(i)!;
  return s === 'open' || s === 'partial';
});
const serious = [...ids('S', 1, 14), ...ids('N', 5, 15)].filter((i) => {
  const s = status.get(i)!;
  return s === 'open' || s === 'partial';
});

console.log(lines.join('\n'));
console.log('');
console.log(`Blocking not fully closed (${blocking.length}): ${blocking.join(', ') || 'none'}`);
console.log(`Serious not fully closed (${serious.length}): ${serious.join(', ') || 'none'}`);
console.log(`RELOCKABLE: ${blocking.length === 0 && serious.length === 0 ? 'yes' : 'NO'}`);
