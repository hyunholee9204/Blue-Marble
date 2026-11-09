// ─── Map definition (pure data; one file per map under src/maps) ───

export type TileType =
  | 'start'
  | 'station'
  | 'chance'
  | 'missed-train'
  | 'fare-check'
  | 'event'
  | 'rest'
  /** Ride rail: passed through without stopping and without using dice steps. */
  | 'track';

export type LabelPos = 'top' | 'bottom' | 'left' | 'right';

export interface TileDef {
  id: string;
  type: TileType;
  name: string;
  /** Name shown while a phase with `altNames` is active (e.g. zombie phase). */
  altName?: string;
  icon?: string;
  altIcon?: string;
  line: string;
  x: number;
  y: number;
  label?: LabelPos;
  price?: number;
  /** Directed edges. More than one entry makes this tile a junction. */
  next: string[];
}

export interface LineDef {
  id: string;
  name: string;
  color: string;
  altColor: string;
  /** Drawn as a dashed route (e.g. flights). */
  dashed?: boolean;
  /** Drawn as a glowing ride rail (e.g. a roller coaster). */
  rail?: boolean;
}

export type CardEffect =
  | { kind: 'money'; amount: number }
  | { kind: 'move'; steps: number }
  | { kind: 'moveTo'; tileId: string }
  | { kind: 'missTrain' }
  | { kind: 'collectAll'; amount: number }
  | { kind: 'payAll'; amount: number }
  /** Pay per owned property plus per development level. */
  | { kind: 'repairs'; perProperty: number; perLevel: number }
  | { kind: 'cleanse'; count: number }
  /** Gain (positive) or lose (negative) this percentage of current cash. */
  | { kind: 'moneyPercent'; percent: number }
  /** One of your stations gains a level for free (choose: the player picks which). */
  | { kind: 'upgradeFree'; choose?: boolean }
  /** A developed station of another player loses a level. */
  | { kind: 'demolish'; choose?: boolean }
  /** You lose one of your stations. */
  | { kind: 'forfeit'; choose?: boolean }
  /** One of your stations trades owners with one of someone else's. */
  | { kind: 'swap' }
  /** The richest player pays the poorest. */
  | { kind: 'richToPoor'; amount: number }
  /** Roll the dice again and move that many tiles. */
  | { kind: 'rollMove' }
  /** Spin a wheel of every opponent property; the one it lands on is wiped off the board. */
  | { kind: 'roulette' };

export interface CardDef {
  id: string;
  title: string;
  /**
   * {amount} becomes the effect's amount scaled to the game's starting money;
   * {percent} becomes the moneyPercent value; {perProperty}/{perLevel} the repairs rates.
   */
  text: string;
  effect: CardEffect;
  /** Relative draw chance (default 1); strong cards use less. */
  weight?: number;
}

export interface ThemeDef {
  bg: string;
  bg2: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  tile: string;
  tileText: string;
  danger: string;
  arrow: string;
  titleFont: string;
}

export interface InfectionRule {
  seeds: string[];
  spreadPerRound: number;
  landingFee: number;
  /** Owned stations that get infected lose their owner. */
  seizeOwned: boolean;
  /** How the UI names an affected tile and its landing fee, e.g. 감염 구역 / 감염 구역 치료비. */
  label: string;
  feeLabel: string;
  icon: string;
}

export interface PhaseDef {
  id: string;
  name: string;
  badge: string;
  altNames: boolean;
  /** YouTube video id played as background music during this phase. */
  bgm?: string;
  theme: ThemeDef;
  tollMultiplier: number;
  fareCheckAmount: number;
  missedTrainTurns: number;
  deck: CardDef[];
  infection?: InfectionRule;
  intro?: { title: string; text: string; button?: string };
}

export interface PhaseTrigger {
  /** Landing on this tile switches to `toPhase`. */
  tileId: string;
  toPhase: string;
  /** If nobody lands on the tile, switch anyway when this round starts. */
  fallbackRound?: number;
  fallbackText?: string;
}

export interface StompRule {
  /** Ascending by minMoney; the first entry should start at 0. */
  tiers: { minMoney: number; amount: number }[];
  safeTileTypes: TileType[];
}

export interface MapRules {
  startMoney: number;
  salary: number;
  maxRounds: number;
  tollRatio: number;
  upgradeCostRatio: number;
  /** Toll multiplier per development level; length - 1 is the max level. */
  levelMultipliers: number[];
  lineMonopolyMultiplier: number;
  /** A failed steal attempt costs toll × this. */
  stealFailMultiplier: number;
  /** Salary multiplier for stopping exactly on the start tile with a dice move. */
  exactStartBonus: number;
  stomp: StompRule;
}

/** Words the UI uses for this map's properties. */
export interface MapTerms {
  /** What a buyable tile is called, e.g. 역 / 랜드마크. */
  property: string;
  /** What developing it is called, e.g. 역세권 개발 / 호텔 건설. */
  develop: string;
  /** What a set of same-line properties is called, e.g. 노선 / 대륙. */
  group: string;
  /** Badge icon for development levels 1, 2, 3… */
  levelIcons: string[];
}

/** Scenery drawn under the tracks; styled by className in CSS. */
export type DecorShape =
  | { shape: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotate?: number; className: string }
  | { shape: 'rect'; x: number; y: number; width: number; height: number; rx?: number; className: string }
  | { shape: 'line'; x1: number; y1: number; x2: number; y2: number; className: string }
  /** Free outline in SVG path syntax (e.g. a continent). */
  | { shape: 'path'; d: string; className: string };

export interface MapDef {
  id: string;
  name: string;
  terms: MapTerms;
  /** Exactly 12 player colours, chosen per map so tokens never blend into its lines. */
  playerColors: string[];
  subtitle: string;
  description: string;
  emoji: string;
  viewBox: { width: number; height: number };
  startTileId: string;
  rules: MapRules;
  lines: LineDef[];
  tiles: TileDef[];
  decor?: DecorShape[];
  phases: PhaseDef[];
  phaseTriggers: PhaseTrigger[];
}

// ─── Runtime state ───

export interface PlayerSetup {
  name: string;
  color: string;
  isBot: boolean;
}

export interface GameOptions {
  seed?: number;
  startMoney?: number;
  stompEnabled?: boolean;
  /** Game length in rounds; the map's phase fallback scales with it. */
  maxRounds?: number;
  /** Rolling doubles on a move earns another roll (three in a row: missed train). */
  doublesAgain?: boolean;
  /** Every few laps a player may make one of their properties premium. */
  premiumEnabled?: boolean;
}

export interface PlayerState extends PlayerSetup {
  id: number;
  money: number;
  position: string;
  missTurns: number;
  bankrupt: boolean;
  /** Times this player has collected the salary at the start tile. */
  laps: number;
  /** Unused premium designations earned from laps. */
  premiumTokens: number;
}

export interface PlayerStats {
  tollIn: number;
  tollOut: number;
  steals: number;
  stomps: number;
}

export interface Ownership {
  owner: number;
  level: number;
  /** Doubled toll, and nobody can steal or swap it away. */
  premium?: boolean;
}

export type Status =
  | { kind: 'await-roll' }
  /**
   * firstStep: the move starts here, so a junction under the token offers a choice.
   * via: dice moves earn the exact-landing salary bonus; card moves don't.
   * express: animate faster (long card trips).
   */
  | { kind: 'moving'; steps: number; firstStep: boolean; via: MoveSource; express?: boolean }
  | { kind: 'choose-path'; steps: number; options: string[]; via: MoveSource }
  | { kind: 'buy-offer'; tileId: string; price: number }
  | { kind: 'upgrade-offer'; tileId: string; cost: number; level: number }
  /** Landed on someone else's station: pay the toll or gamble on doubles to steal it. */
  | { kind: 'toll-offer'; tileId: string; owner: number; toll: number }
  | { kind: 'steal-result'; tileId: string; owner: number; success: boolean; paid: number }
  /** Chance tile: the player picks one of these face-down cards. */
  | { kind: 'card-pick'; cards: CardDef[] }
  | { kind: 'card'; card: CardDef; spread?: CardDef[]; picked?: number }
  | { kind: 'phase-intro'; phaseId: string; then: Status }
  | { kind: 'turn-end' }
  /** Choosing which own property to make premium; returns to `then` afterwards. */
  | { kind: 'premium-pick'; then: Status }
  /** A card that lets the player pick its target among `options`. */
  | { kind: 'tile-pick'; purpose: TilePickPurpose; title: string; options: string[] }
  /** Air-raid roulette: `result` is set by SPIN and applied on ACK, after the wheel has stopped. */
  | { kind: 'roulette'; title: string; options: string[]; result?: number }
  /** Swap card: pick one of your own properties (mine), then one of an opponent's. */
  | { kind: 'swap-pick'; title: string; mine?: string }
  | { kind: 'game-over'; winner: number | null; reason: string };

export type MoveSource = 'dice' | 'card';

export type TilePickPurpose = 'upgrade' | 'demolish' | 'forfeit';

export type LogTone = 'info' | 'good' | 'bad' | 'event';

export interface LogEntry {
  id: number;
  text: string;
  tone: LogTone;
}

export interface StompEvent {
  /** Increments on every stomp so the UI can replay its effects. */
  seq: number;
  stomper: number;
  victims: { id: number; amount: number }[];
}

export interface GameState {
  mapId: string;
  seed: number;
  round: number;
  current: number;
  phaseId: string;
  firedTriggers: number[];
  players: PlayerState[];
  owners: Record<string, Ownership>;
  infected: string[];
  dice: [number, number] | null;
  /** Increments on every roll so the UI can replay the dice animation. */
  rollSeq: number;
  /** Most recent salary payment, for the UI banner. */
  lastSalary: { player: number; amount: number; bonus: boolean } | null;
  /** Running tallies per player, for the end-of-game titles. */
  stats: PlayerStats[];
  /** Total assets per player at the start of each round (index 0 = round 1). */
  assetHistory: number[][];
  /** Card amounts scale with this relative to the map's default starting money. */
  startMoney: number;
  /** Latest card outcome worth a banner (e.g. a station changed hands). */
  notice: { seq: number; text: string } | null;
  /** Chosen on the setup screen. */
  stompEnabled: boolean;
  doublesAgain: boolean;
  premiumEnabled: boolean;
  maxRounds: number;
  /** The current player rolled doubles on a move and rolls again once this turn resolves. */
  extraRoll: boolean;
  /** Doubles rolled in a row during the current player's turn. */
  doubleStreak: number;
  stomp: StompEvent | null;
  status: Status;
  log: LogEntry[];
  logSeq: number;
}

export type Action =
  | { type: 'ROLL' }
  | { type: 'STEP' }
  | { type: 'CHOOSE_PATH'; tileId: string }
  | { type: 'BUY' }
  | { type: 'UPGRADE' }
  | { type: 'DECLINE' }
  | { type: 'PAY_TOLL' }
  | { type: 'STEAL' }
  | { type: 'PICK_CARD'; index: number }
  | { type: 'START_PREMIUM' }
  | { type: 'SET_PREMIUM'; tileId: string }
  | { type: 'CANCEL_PREMIUM' }
  | { type: 'SWAP_MINE'; tileId: string }
  | { type: 'SWAP_BACK' }
  | { type: 'SWAP_THEIRS'; tileId: string }
  | { type: 'PICK_TILE'; tileId: string }
  | { type: 'SPIN' }
  | { type: 'ACK' }
  | { type: 'END_TURN' };
