// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board is a radar over *pre-token* protocols: protocols DefiLlama's record shows with no token
// at all, which are therefore the ones whose launch is still ahead of them. Token-bearing protocols
// are never mixed into that ranking; they are held apart as the live set, because for them the market
// cap is a fact and not a model's claim.
//
// Every number the board carries is derived from the snapshot's own ten fields. No protocol name, slug
// or address is special-cased anywhere in this file: the same four functions score every row, so the
// board is reproducible and a reader can recompute any row by hand from the figures shown beside it.
//
//   base      = tvl_usd x base_multiple
//   growth    = 1 + clamp(change_7d, growth_floor, growth_cap) / 100 x growth_weight
//   tokenless = maturity_floor + min(age_days, maturity_days) / maturity_days x maturity_range
//   reach     = 1 + min(max(chains - 1, 0), reach_max) / reach_max x reach_weight
//   capture   = the category's capture rate (see CAPTURE)
//   implied   = max(1, round(base x growth x tokenless x reach x capture))

/** One protocol as the sealed snapshot carries it: exactly ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/**
 * The capture rate per category: how much of a protocol's TVL it can plausibly turn into its own
 * fee revenue, and therefore into whatever a token of its own would eventually be worth.
 *
 * A trading venue captures fees on volume. A lender captures the interest spread. A risk curator
 * holds other people's deposits and earns a management fee on them, so most of its TVL is not
 * revenue it can ever take. The table is a table of DefiLlama's own `category` field, applied
 * identically to every row; it names no protocol.
 */
export const CAPTURE: Record<string, number> = {
  Chain: 1.15,
  Payments: 1.15,
  Indexes: 1.15,
  Dexs: 1.1,
  'Basis Trading': 1.1,
  Derivatives: 1.1,
  'OTC Marketplace': 1.1,
  'Options Vault': 1.1,
  Lending: 1.05,
  CDP: 1.05,
  'Collateral Markets': 1.05,
  'Uncollateralized Lending': 1.05,
  'CDP Manager': 1.05,
  RWA: 1.0,
  Yield: 1.0,
  'Yield Aggregator': 1.0,
  'Stablecoin Wrapper': 1.0,
  'Dual-Token Stablecoin': 1.0,
  Insurance: 1.0,
  Farm: 1.0,
  'Leveraged Farming': 1.0,
  'Liquidity Manager': 1.0,
  CeDeFi: 0.95,
  'Crypto Card Issuer': 0.95,
  Privacy: 0.95,
  'Prediction Market': 0.95,
  Restaking: 0.95,
  'Staking Pool': 0.9,
  'Risk Curators': 0.78,
  'Onchain Capital Allocator': 0.78,
  'Governance Incentives': 0.78,
};

/** The capture rate for a category the table does not name. */
export const DEFAULT_CAPTURE = 0.9;

/** The model's constants. The dashboard states them and the page recomputes every row with them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_max: number;
  reach_weight: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.22,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.55,
  maturity_range: 0.75,
  maturity_days: 1460,
  unknown_age_days: 365,
  reach_max: 14,
  reach_weight: 0.3,
};

/** The model's version label, shown by the dashboard and quoted in the report. */
export const MODEL_VERSION = 'radar-2';

/** The chain families and what one transaction costs on them, in whole US dollars. */
export const CHAIN_GAS: Record<string, number> = {
  Ethereum: 4,
  Bitcoin: 1.5,
  'BNB Chain': 0.05,
  'Binance': 0.05,
  Arbitrum: 0.12,
  Optimism: 0.1,
  Base: 0.08,
  Polygon: 0.02,
  Avalanche: 0.03,
  Sui: 0.02,
  Gnosis: 0.02,
  Mantle: 0.02,
  Sei: 0.02,
  Linea: 0.03,
  Scroll: 0.05,
  ZkSync: 0.05,
  Algorand: 0.01,
  Cardano: 0.2,
  Solana: 0.02,
  Monad: 0.01,
  MegaETH: 0.01,
  Ink: 0.01,
  Plasma: 0.01,
  Pharos: 0.01,
  Sonic: 0.01,
  Berachain: 0.02,
  Story: 0.01,
  Katana: 0.01,
  Tempo: 0.01,
  Stable: 0.01,
  Hemi: 0.01,
  Unichain: 0.01,
  'World Chain': 0.01,
  'Flare': 0.01,
  'Stacks': 0.02,
  'Celo': 0.01,
  'Ronin': 0.01,
  'Frax': 0.01,
  'Fraxtal': 0.01,
  'ZetaChain': 0.02,
  'Hyperliquid L1': 0.01,
  'Robinhood Chain': 0.01,
  'Noble': 0.01,
  'BSquared': 0.01,
  'Mezo': 0.01,
  'Bittensor': 0.02,
  'Babylon Genesis': 0.01,
  'CORE': 0.01,
  'XRPL EVM': 0.01,
  'BOB': 0.01,
  'TAC': 0.01,
  'Lisich': 0.01,
  'TON': 0.02,
  'Tron': 0.05,
  'Cronos': 0.01,
  'Flow': 0.01,
  'Kava': 0.01,
  'Lukso': 0.01,
  'MultiversX': 0.01,
  'Radix': 0.01,
  'Aptos': 0.01,
  'Near': 0.01,
  'Metis': 0.01,
  'Mode': 0.01,
  'Blast': 0.01,
  'Taiko': 0.01,
  'Gravity': 0.01,
  'Zircuit': 0.01,
};

/** What one transaction costs on a chain the table does not name. */
export const DEFAULT_GAS = 0.2;

/** One step of a farm plan: what to do, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    tokenless_multiplier: number;
    reach_multiplier: number;
    capture_rate: number;
    age_days: number | null;
    chain_count: number;
  };
  momentum: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  tokenless_multiplier: number;
  reach_multiplier: number;
  capture_rate: number;
  chain_count: number;
  momentum: string;
  on_watchlist: boolean;
  farm_steps: string[];
  gecko_id: string | null;
  symbol: string | null;
}

/** A protocol whose token already trades: the market's own value, never a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  token_status: 'live';
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  capture_table: Record<string, number>;
  default_capture: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_total: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The number of whole days from `listedAt` to the snapshot's date, or null when it is unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The five factors and the implied value one protocol gets under `model`. */
export interface Score {
  implied: number;
  growthPct: number;
  growthMult: number;
  tokenlessMult: number;
  reachMult: number;
  capture: number;
  age: number | null;
  chainCount: number;
}

/** Score one protocol: the whole model, in one place. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): Score {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const tokenlessMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainCount = p.chains.length;
  const reachMult = 1 + (Math.min(Math.max(chainCount - 1, 0), model.reach_max) / model.reach_max) * model.reach_weight;
  const capture = CAPTURE[p.category ?? ''] ?? DEFAULT_CAPTURE;
  const base = p.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * tokenlessMult * reachMult * capture));
  return { implied, growthPct, growthMult, tokenlessMult, reachMult, capture, age, chainCount };
}

/** The momentum band a protocol's seven-day TVL change falls in. */
export function momentumOf(change7d: number | null): string {
  if (change7d === null) return 'Unreported';
  if (change7d >= 10) return 'Accelerating';
  if (change7d > 0) return 'Growing';
  if (change7d >= -5) return 'Flat';
  if (change7d >= -20) return 'Cooling';
  return 'Falling';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories that are products of a protocol whose token already trades. */
const DERIVED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Anchor BTC',
  'CEX',
]);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the radar may rank: it records no token, and it is not a wrapped,
 * staked, bridged or exchange product of something else, and its name is not a version of another
 * pool. The rule reads the snapshot's own fields only.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && DERIVED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  return true;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every one of its slugs is carried, whatever its figures.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol in the snapshot, whatever its size. The floor is
  // where the house's reading started, not where the radar stops.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((entry, i) => {
    const { p, s } = entry;
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        base_multiple: model.base_multiple,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        tokenless_multiplier: round4(s.tokenlessMult),
        reach_multiplier: round4(s.reachMult),
        capture_rate: s.capture,
        age_days: s.age,
        chain_count: s.chainCount,
      },
      momentum: momentumOf(p.change_7d),
      farm_steps: farmSteps(p, s.age).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: the action, then its cost and its time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596).trimEnd()}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page.`;
  return s;
}

/** The chain a protocol's position is opened on: its first, or a neutral phrase. */
export function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its own chain';
}

/** What one transaction costs on a chain. */
export function gasFor(chain: string): number {
  return CHAIN_GAS[chain] ?? DEFAULT_GAS;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 50_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/**
 * How long to hold, from how long the protocol has already run with no token: a young protocol's
 * points cycle has not turned yet, so the position rides through one full cycle; an old one is
 * closer to a decision, so a shorter window is enough to be counted.
 */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 540) return 45;
  return 30;
}

/** The category's own farming action, in the words a farmer can follow. */
export function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex') || c.includes('liquidity manager'))
    return `Supply $${capital} of USDC and $${capital} of the paired asset to ${name}'s deepest pool on ${chain} as a liquidity provider, and leave the position open.`;
  if (c.includes('basis trading'))
    return `Deposit $${capital} of USDC into ${name}'s basis account on ${chain}, open one small funding-neutral spread, and leave the margin there.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name}'s market on ${chain}, and borrow $${Math.round(capital / 3)} against it only if the borrow rate stays under 6% a year.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged balance inside ${name}'s own app so the route is counted.`;
  if (c.includes('staking pool') || c.includes('restak'))
    return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and keep the receipt; do not claim until the unbonding window ends.`;
  if (c.includes('rwa') || c.includes('yield'))
    return `Mint $${capital} of ${name}'s own yield-bearing token on ${chain}, keep the receipt, and never redeem it back into a token that is still listed.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, open one small position against its deepest market, and size it so a 10% move cannot liquidate it.`;
  if (c.includes('prediction'))
    return `Fund $${capital} into ${name} on ${chain} and place one small position on its highest-volume market, then let it settle rather than trading it.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} for one term on ${chain} and keep the policy open for the whole season.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('governance'))
    return `Deposit $${capital} into ${name}'s own vault on ${chain}, take the vault's receipt, and do not move it to another curator.`;
  if (c.includes('stablecoin wrapper') || c.includes('dual-token'))
    return `Mint $${capital} of ${name}'s own wrapped stablecoin on ${chain}, hold it against the original, and check the redemption rate once a week.`;
  if (c.includes('farm') || c.includes('leveraged'))
    return `Deposit $${capital} into ${name}'s farm pool on ${chain} and harvest each cycle instead of letting the position compound untouched.`;
  if (c.includes('card'))
    return `Fund a ${name} card with $${capital} and put a handful of small payments through it each week so the account looks like a real user.`;
  if (c.includes('chain') || c.includes('payment'))
    return `Route $${capital} of your own weekly volume through ${name} on ${chain} and keep the transactions going for the whole window.`;
  if (c.includes('otc'))
    return `Post $${capital} of USDC as a maker on ${name}'s OTC book on ${chain} and leave one quote live at all times.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the whole window.`;
}

/** The category's own risk, which is the part a farm plan has to warn about. */
export function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex') || c.includes('liquidity manager'))
    return `Watch the impermanent loss: a 20% move against the pair wipes out what a month of fees paid, so hold a narrow range and check the pair's 30-day range first.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Watch the liquidation threshold: a 10% fall in the collateral against a 150% loan-to-value empties the position, so borrow less than a third of the deposit.`;
  if (c.includes('rwa') || c.includes('yield'))
    return `Check that ${name} keeps redemptions open; a protocol that pauses withdrawals turns a yield position into a locked one, and that is the risk the deposit rate does not pay for.`;
  if (c.includes('bridge'))
    return `Check that ${name}'s liquidity route stays open on the chain you bridged into; a congested route makes the unwind expensive and slow.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Count the unbonding period as a real cost: a 21-day queue means the last week of the window is already gone when you decide to leave.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Watch the funding rate: a persistently positive rate pays you to hold the position and can flip in a day, so the margin cannot sit idle.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Check ${name}'s own management fee and its loss history; a curator charging 2% a year is worth only what it earns over and above that.`;
  if (c.includes('chain') || c.includes('payment'))
    return `Watch ${name}'s own fee schedule and uptime; a chain that raises its fees or slows its blocks removes the reason to route volume through it.`;
  if (c.includes('stablecoin wrapper'))
    return `Watch the wrapper's redemption and its collateral ratio; a wrapper that only redeems on its own chain is worth less than the stablecoin it wraps.`;
  return `Watch ${name}'s own withdrawal conditions: a protocol that can pause withdrawals can turn an open position into a locked one at any time.`;
}

/** How a protocol's capital sits inside its own TVL, as a share a farmer can reason about. */
export function poolShare(capital: number, tvl: number): string {
  if (!isFinite(tvl) || tvl <= 0) return 'a share of a pool of unknown size';
  const pct = (capital / tvl) * 100;
  if (pct >= 1) return `${pct.toFixed(2)}% of the pool`;
  if (pct >= 0.01) return `${pct.toFixed(3)}% of the pool`;
  return `${pct.toFixed(4)}% of the pool`;
}

/**
 * A protocol's farm plan: nine steps, each an action with its cost and its time. Every number in the
 * plan is derived from the protocol's own record: its category decides the action and the risk, its
 * chains decide the gas, its TVL decides the capital and its age decides the window.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const weeks = Math.max(1, Math.round(hold / 7));
  const weekly = gas * 2;
  return [
    {
      text: `Open a fresh wallet that holds only the capital you plan to farm, write the seed phrase on paper, and never reuse a wallet that has already signed a transaction.`,
      cost: `about $${gas.toFixed(2)} of gas for the first transaction on ${chain}`,
      time: '6 minutes',
    },
    {
      text: `Move $${capital} of USDC onto ${chain} and swap the half you need into the asset ${p.name} takes; keep the other half on the wallet as gas so nothing is stranded.`,
      cost: `$${capital} of capital plus about $${(gas * 2).toFixed(2)} of fees`,
      time: '12 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas.toFixed(2)} of gas`,
      time: '10 minutes to set up',
    },
    {
      text: `Size check before you go further: $${capital} is ${poolShare(capital, p.tvl_usd)}, so it will not move the pool's numbers and it will not earn a share of its fees on its own.`,
      cost: 'nothing to check, it is arithmetic',
      time: '2 minutes',
    },
    {
      text: `Make one qualifying action each week on ${chain}: a deposit, a borrow, a mint, a swap or a vote, whichever ${p.name} counts. One is enough; more only burns gas.`,
      cost: `about $${weekly.toFixed(2)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, which is ${weeks} weekly snapshot${weeks === 1 ? '' : 's'} and long enough for the position to be counted in more than one.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: riskFor(p),
      cost: 'the risk is the capital, not a fee',
      time: 'check it once a week',
    },
    {
      text: `Open ${p.name}'s own points or announcement page once a week and claim only from the link that page publishes; a claim that asks for a fee is a scam, and the real one is free.`,
      cost: 'no fee to check, and never pay to claim',
      time: '5 minutes a week',
    },
    {
      text: `Unwind in one session on ${chain}: withdraw, claim whatever ${p.name} owes, and write the wallet, the dates and every transaction hash in a farm log so the position can be repeated or closed.`,
      cost: `about $${gas.toFixed(2)} of gas to unwind`,
      time: '15 minutes',
    },
  ];
}

/** The live-token protocols, by market cap: the market's own value, never a model's. */
export function liveRows(snapshot: Snapshot, limit = 24): LiveRow[] {
  const all = snapshot.protocols.filter((p) => !isPreToken(p));
  all.sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd);
  return all.slice(0, limit).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    change_7d: p.change_7d,
    token_status: 'live',
  }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    tokenless_multiplier: row.model.tokenless_multiplier,
    reach_multiplier: row.model.reach_multiplier,
    capture_rate: row.model.capture_rate,
    chain_count: row.model.chain_count,
    momentum: row.momentum,
    on_watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
    gecko_id: row.gecko_id,
    symbol: row.symbol,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const live = liveRows(snapshot);
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    capture_table: CAPTURE,
    default_capture: DEFAULT_CAPTURE,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watchlist.has(r.slug)).length,
    live_size: live.length,
    live_total: liveTotal,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows: the gate wants at least 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's whole dataset as one script: no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
