import { getMap } from '../maps';
import type {
  Action,
  CardDef,
  CardEffect,
  GameOptions,
  GameState,
  LogTone,
  MapDef,
  MoveSource,
  PhaseDef,
  PlayerSetup,
  TileDef,
} from './types';

// ─── Public helpers (also used by the UI) ───

export function createGame(
  mapId: string,
  setups: PlayerSetup[],
  { seed = Date.now(), startMoney, stompEnabled = true, maxRounds, doublesAgain = false, premiumEnabled = false }: GameOptions = {},
): GameState {
  const map = getMap(mapId);
  return {
    mapId,
    seed: seed | 0,
    round: 1,
    current: 0,
    phaseId: map.phases[0].id,
    firedTriggers: [],
    players: setups.map((p, i) => ({
      ...p,
      id: i,
      money: startMoney ?? map.rules.startMoney,
      position: map.startTileId,
      missTurns: 0,
      bankrupt: false,
      laps: 0,
      premiumTokens: 0,
    })),
    owners: {},
    infected: [],
    dice: null,
    rollSeq: 0,
    lastSalary: null,
    startMoney: startMoney ?? map.rules.startMoney,
    assetHistory: [setups.map(() => startMoney ?? map.rules.startMoney)],
    stats: setups.map(() => ({ tollIn: 0, tollOut: 0, steals: 0, stomps: 0 })),
    notice: null,
    stompEnabled,
    doublesAgain,
    premiumEnabled,
    maxRounds: maxRounds ?? map.rules.maxRounds,
    extraRoll: false,
    doubleStreak: 0,
    stomp: null,
    status: { kind: 'await-roll' },
    log: [{ id: 0, text: `${map.name} 게임 시작! ${setups[0].name}님부터 출발합니다.`, tone: 'event' }],
    logSeq: 1,
  };
}

export const GAME_LENGTHS = [20, 30, 40];
export const PREMIUM_EVERY_LAPS = 5;
export const PREMIUM_MULTIPLIER = 2;
const MAX_DOUBLES = 3;

export function getMapFor(state: GameState): MapDef {
  return getMap(state.mapId);
}

/** The round a trigger's automatic phase change happens, scaled to this game's length. */
export function fallbackRoundFor(map: MapDef, state: GameState, fallbackRound: number): number {
  return Math.round((fallbackRound * state.maxRounds) / map.rules.maxRounds);
}

/** A player's properties that can still be made premium. */
export function premiumCandidates(state: GameState, playerId: number): string[] {
  return Object.entries(state.owners)
    .filter(([, own]) => own.owner === playerId && !own.premium)
    .map(([tileId]) => tileId);
}

export function formatMoney(n: number): string {
  return `${n.toLocaleString('ko-KR')}만`;
}

export function tileOf(map: MapDef, id: string): TileDef {
  const tile = map.tiles.find((t) => t.id === id);
  if (!tile) throw new Error(`Unknown tile: ${id}`);
  return tile;
}

export function phaseOf(map: MapDef, state: GameState): PhaseDef {
  return map.phases.find((p) => p.id === state.phaseId) ?? map.phases[0];
}

export function tileName(map: MapDef, state: GameState, tile: TileDef): string {
  return phaseOf(map, state).altNames && tile.altName ? tile.altName : tile.name;
}

export function tileIcon(map: MapDef, state: GameState, tile: TileDef): string | undefined {
  return phaseOf(map, state).altNames && tile.altIcon ? tile.altIcon : tile.icon;
}

export function lineOf(map: MapDef, state: GameState, lineId: string) {
  const line = map.lines.find((l) => l.id === lineId);
  if (!line) throw new Error(`Unknown line: ${lineId}`);
  return { ...line, color: phaseOf(map, state).altNames ? line.altColor : line.color };
}

export function maxLevel(map: MapDef): number {
  return map.rules.levelMultipliers.length - 1;
}

export function upgradeCost(map: MapDef, tile: TileDef): number {
  return Math.round((tile.price ?? 0) * map.rules.upgradeCostRatio);
}

export function propertyValue(map: MapDef, tile: TileDef, level: number): number {
  return (tile.price ?? 0) + level * upgradeCost(map, tile);
}

export function computeToll(map: MapDef, state: GameState, tileId: string): number {
  const tile = tileOf(map, tileId);
  const own = state.owners[tileId];
  if (!own) return 0;
  const { rules } = map;
  let toll = (tile.price ?? 0) * rules.tollRatio * rules.levelMultipliers[own.level];
  const lineStations = map.tiles.filter((t) => t.type === 'station' && t.line === tile.line);
  if (lineStations.every((t) => state.owners[t.id]?.owner === own.owner)) {
    toll *= rules.lineMonopolyMultiplier;
  }
  if (own.premium) toll *= PREMIUM_MULTIPLIER;
  return Math.round(toll * phaseOf(map, state).tollMultiplier);
}

/** What stomping a player holding `money` takes, capped at what they have. */
export function stompAmount(map: MapDef, money: number): number {
  let amount = 0;
  for (const tier of map.rules.stomp.tiers) {
    if (money >= tier.minMoney) amount = tier.amount;
  }
  return Math.min(amount, money);
}

/** Base card amounts are written for the map's default starting money; scale to this game's. */
export function scaleMoney(map: MapDef, state: GameState, base: number): number {
  const scaled = (base * state.startMoney) / map.rules.startMoney;
  return Math.max(5, Math.round(scaled / 5) * 5);
}

function cardAmount(effect: CardEffect): number | undefined {
  switch (effect.kind) {
    case 'money':
    case 'collectAll':
    case 'payAll':
    case 'richToPoor':
      return effect.amount;
    default:
      return undefined;
  }
}

export function cardText(map: MapDef, state: GameState, card: CardDef): string {
  const amount = cardAmount(card.effect);
  const percent = card.effect.kind === 'moneyPercent' ? Math.abs(card.effect.percent) : undefined;
  const e = card.effect;
  return card.text
    .replace('{amount}', amount === undefined ? '' : formatMoney(scaleMoney(map, state, Math.abs(amount))))
    .replace('{percent}', String(percent ?? ''))
    .replace('{perProperty}', e.kind === 'repairs' ? formatMoney(scaleMoney(map, state, e.perProperty)) : '')
    .replace('{perLevel}', e.kind === 'repairs' ? formatMoney(scaleMoney(map, state, e.perLevel)) : '');
}

export type CardTone = 'good' | 'bad' | 'neutral';

export function cardTone(card: CardDef): CardTone {
  const e = card.effect;
  switch (e.kind) {
    case 'money':
      return e.amount >= 0 ? 'good' : 'bad';
    case 'moneyPercent':
      return e.percent >= 0 ? 'good' : 'bad';
    case 'collectAll':
    case 'upgradeFree':
    case 'demolish':
    case 'cleanse':
      return 'good';
    case 'payAll':
    case 'repairs':
    case 'missTrain':
    case 'forfeit':
      return 'bad';
    case 'roulette':
      return 'good';
    case 'move':
    case 'moveTo':
    case 'rollMove':
    case 'swap':
    case 'richToPoor':
      return 'neutral';
  }
}

export function cardIcon(card: CardDef): string {
  const e = card.effect;
  switch (e.kind) {
    case 'money':
      return e.amount >= 0 ? '💰' : '💸';
    case 'moneyPercent':
      return e.percent >= 0 ? '📈' : '📉';
    case 'move':
      return '🚀';
    case 'moveTo':
      return '📍';
    case 'missTrain':
      return '⛔';
    case 'collectAll':
      return '🎁';
    case 'payAll':
      return '🍻';
    case 'repairs':
      return '🔧';
    case 'cleanse':
      return '🧹';
    case 'upgradeFree':
      return '🏗️';
    case 'demolish':
      return '💥';
    case 'forfeit':
      return '📄';
    case 'swap':
      return '🔄';
    case 'richToPoor':
      return '🤝';
    case 'rollMove':
      return '🎲';
    case 'roulette':
      return '🎯';
  }
}

/** Properties the swap card may trade: premium ones never change hands, on either side. */
export function swapCandidates(state: GameState, playerId: number): { mine: string[]; theirs: string[] } {
  const mine: string[] = [];
  const theirs: string[] = [];
  for (const [tileId, own] of Object.entries(state.owners)) {
    if (own.premium || state.players[own.owner].bankrupt) continue;
    (own.owner === playerId ? mine : theirs).push(tileId);
  }
  return { mine, theirs };
}

export function totalAssets(map: MapDef, state: GameState, playerId: number): number {
  const player = state.players[playerId];
  if (player.bankrupt) return 0;
  let total = player.money;
  for (const [tileId, own] of Object.entries(state.owners)) {
    if (own.owner === playerId) total += propertyValue(map, tileOf(map, tileId), own.level);
  }
  return total;
}

// ─── Reducer ───

export function reduce(state: GameState, action: Action): GameState {
  if (state.status.kind === 'game-over') return state;
  const map = getMap(state.mapId);
  const s = structuredClone(state);
  const p = s.players[s.current];
  const st = s.status;

  switch (action.type) {
    case 'ROLL': {
      if (st.kind !== 'await-roll') return state;
      const d1 = rollDie(s);
      const d2 = rollDie(s);
      s.dice = [d1, d2];
      s.rollSeq++;
      const sum = d1 + d2;
      if (p.missTurns > 0) {
        if (d1 === d2) {
          p.missTurns = 0;
          log(s, `${p.name} 더블(${d1}·${d2})! 탈출해서 ${sum}칸 이동합니다.`, 'good');
          s.status = { kind: 'moving', steps: sum, firstStep: true, via: 'dice' };
        } else {
          p.missTurns--;
          log(s, `${p.name} 주사위 ${d1}·${d2} — 탈출 실패 (남은 ${p.missTurns}턴)`, 'bad');
          s.status = { kind: 'turn-end' };
        }
      } else if (s.doublesAgain && d1 === d2 && ++s.doubleStreak >= MAX_DOUBLES) {
        log(s, `${p.name} 더블 ${MAX_DOUBLES}번 연속! 과속으로 붙잡혔습니다.`, 'bad');
        s.extraRoll = false;
        s.status = { kind: 'turn-end' };
        sendToMissedTrain(s, map, phaseOf(map, s));
      } else {
        s.extraRoll = s.doublesAgain && d1 === d2;
        log(s, `${p.name} 주사위 ${d1}·${d2} → ${sum}칸${s.extraRoll ? ' (더블! 한 번 더)' : ''}`);
        s.status = { kind: 'moving', steps: sum, firstStep: true, via: 'dice' };
      }
      return s;
    }

    case 'START_PREMIUM': {
      if ((st.kind !== 'await-roll' && st.kind !== 'turn-end') || p.premiumTokens <= 0) return state;
      if (premiumCandidates(s, p.id).length === 0) return state;
      s.status = { kind: 'premium-pick', then: st };
      return s;
    }

    case 'SET_PREMIUM': {
      const own = s.owners[action.tileId];
      if (st.kind !== 'premium-pick' || !own || own.owner !== p.id || own.premium) return state;
      own.premium = true;
      p.premiumTokens--;
      const name = tileName(map, s, tileOf(map, action.tileId));
      log(s, `💎 ${p.name} ${name}을(를) 프리미엄으로 지정 (통행료 ×${PREMIUM_MULTIPLIER}, 뺏기 불가)`, 'event');
      notify(s, `💎 ${p.name}의 ${name}이(가) 프리미엄이 되었습니다! 통행료 ×${PREMIUM_MULTIPLIER} · 뺏기 불가`);
      s.status = st.then;
      return s;
    }

    case 'CANCEL_PREMIUM': {
      if (st.kind !== 'premium-pick') return state;
      s.status = st.then;
      return s;
    }

    case 'SWAP_MINE': {
      if (st.kind !== 'swap-pick' || !swapCandidates(s, p.id).mine.includes(action.tileId)) return state;
      s.status = { ...st, mine: action.tileId };
      return s;
    }

    case 'SWAP_BACK': {
      if (st.kind !== 'swap-pick' || !st.mine) return state;
      s.status = { kind: 'swap-pick', title: st.title };
      return s;
    }

    case 'SWAP_THEIRS': {
      if (st.kind !== 'swap-pick' || !st.mine || !swapCandidates(s, p.id).theirs.includes(action.tileId)) return state;
      const nameOf = (tileId: string) => tileName(map, s, tileOf(map, tileId));
      const other = s.owners[action.tileId].owner;
      s.owners[st.mine].owner = other;
      s.owners[action.tileId].owner = p.id;
      log(s, `🔄 ${p.name}의 ${nameOf(st.mine)} ↔ ${s.players[other].name}의 ${nameOf(action.tileId)}`, 'event');
      notify(s, `🔄 ${p.name}의 ${nameOf(st.mine)} ↔ ${s.players[other].name}의 ${nameOf(action.tileId)} 맞교환!`);
      s.status = { kind: 'turn-end' };
      return s;
    }

    case 'PICK_TILE': {
      if (st.kind !== 'tile-pick' || !st.options.includes(action.tileId)) return state;
      s.status = { kind: 'turn-end' };
      if (st.purpose === 'upgrade') upgradeTile(s, map, action.tileId);
      else if (st.purpose === 'demolish') demolishTile(s, map, action.tileId);
      else forfeitTile(s, map, action.tileId);
      return s;
    }

    case 'SPIN': {
      if (st.kind !== 'roulette' || st.result !== undefined) return state;
      s.status = { ...st, result: Math.floor(rand(s) * st.options.length) };
      return s;
    }

    case 'STEP': {
      if (st.kind !== 'moving') return state;
      const next = tileOf(map, p.position).next;
      // Only a player who stopped on a junction picks a branch; passers-by stay on next[0].
      if (next.length > 1 && st.firstStep) {
        s.status = { kind: 'choose-path', steps: st.steps, options: [...next], via: st.via };
      } else {
        advance(s, map, next[0], st.steps, st.via, st.express);
      }
      return s;
    }

    case 'CHOOSE_PATH': {
      if (st.kind !== 'choose-path' || !st.options.includes(action.tileId)) return state;
      if (tileOf(map, action.tileId).type === 'track') {
        log(s, `🎢 ${p.name} 롤러코스터 탑승! 칸 수를 쓰지 않고 레일을 달립니다.`, 'event');
        notify(s, `🎢 ${p.name} 롤러코스터 탑승! 남은 ${st.steps}칸은 내린 뒤에 이어서 갑니다`);
      }
      advance(s, map, action.tileId, st.steps, st.via);
      return s;
    }

    case 'BUY': {
      if (st.kind !== 'buy-offer' || p.money < st.price) return state;
      p.money -= st.price;
      s.owners[st.tileId] = { owner: p.id, level: 0 };
      log(s, `${p.name} ${tileName(map, s, tileOf(map, st.tileId))} 구매 (-${formatMoney(st.price)})`, 'good');
      s.status = { kind: 'turn-end' };
      return s;
    }

    case 'UPGRADE': {
      if (st.kind !== 'upgrade-offer' || p.money < st.cost) return state;
      p.money -= st.cost;
      s.owners[st.tileId].level = st.level;
      log(s, `${p.name} ${tileName(map, s, tileOf(map, st.tileId))} ${map.terms.develop} Lv.${st.level} (-${formatMoney(st.cost)})`, 'good');
      s.status = { kind: 'turn-end' };
      return s;
    }

    case 'DECLINE': {
      if (st.kind !== 'buy-offer' && st.kind !== 'upgrade-offer') return state;
      s.status = { kind: 'turn-end' };
      return s;
    }

    case 'PAY_TOLL': {
      if (st.kind !== 'toll-offer') return state;
      s.status = { kind: 'turn-end' };
      recordToll(s, p.id, st.owner, pay(s, map, p.id, st.toll, st.owner, `${tileName(map, s, tileOf(map, st.tileId))} 통행료`));
      return s;
    }

    case 'STEAL': {
      if (st.kind !== 'toll-offer' || s.owners[st.tileId]?.premium) return state;
      const d1 = rollDie(s);
      const d2 = rollDie(s);
      s.dice = [d1, d2];
      s.rollSeq++;
      const name = tileName(map, s, tileOf(map, st.tileId));
      const victim = s.players[st.owner];
      if (d1 === d2) {
        s.owners[st.tileId].owner = p.id;
        s.stats[p.id].steals++;
        log(s, `🏴 ${p.name} 더블(${d1}·${d2})! ${victim.name}의 ${name}을(를) 빼앗았습니다!`, 'event');
        s.status = { kind: 'steal-result', tileId: st.tileId, owner: st.owner, success: true, paid: 0 };
      } else {
        const fine = st.toll * map.rules.stealFailMultiplier;
        log(s, `${p.name} 뺏기 실패 (${d1}·${d2})`, 'bad');
        s.status = { kind: 'steal-result', tileId: st.tileId, owner: st.owner, success: false, paid: fine };
        recordToll(s, p.id, st.owner, pay(s, map, p.id, fine, st.owner, `${name} 통행료 ×${map.rules.stealFailMultiplier}`));
      }
      return s;
    }

    case 'PICK_CARD': {
      if (st.kind !== 'card-pick' || !st.cards[action.index]) return state;
      s.status = { kind: 'card', card: st.cards[action.index], spread: st.cards, picked: action.index };
      return s;
    }

    case 'ACK': {
      if (st.kind === 'steal-result') {
        s.status = { kind: 'turn-end' };
      } else if (st.kind === 'card') {
        applyCard(s, map, st.card);
      } else if (st.kind === 'phase-intro') {
        s.status = st.then;
      } else if (st.kind === 'roulette' && st.result !== undefined) {
        // Applied only now, so the board and news don't give the result away while the wheel spins.
        const tileId = st.options[st.result];
        const own = s.owners[tileId];
        const name = tileName(map, s, tileOf(map, tileId));
        if (own) {
          delete s.owners[tileId];
          log(s, `🎯 ${st.title}! ${s.players[own.owner].name}의 ${name}이(가) 지도에서 사라졌습니다`, 'event');
          notify(s, `🎯 ${s.players[own.owner].name}의 ${name}이(가) 완전히 파괴되었습니다!`);
        }
        s.status = { kind: 'turn-end' };
      } else {
        return state;
      }
      return s;
    }

    case 'END_TURN': {
      if (st.kind !== 'turn-end') return state;
      endTurn(s, map);
      return s;
    }
  }
}

// ─── Internals (mutate the cloned state) ───

function rand(s: GameState): number {
  // mulberry32: deterministic so a future server can replay games from a seed.
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function rollDie(s: GameState): number {
  return 1 + Math.floor(rand(s) * 6);
}

function pick<T>(s: GameState, items: T[]): T {
  return items[Math.floor(rand(s) * items.length)];
}

const CARD_SPREAD = 10;

/** Weighted draw without replacement (repeats only if the deck is smaller than n). */
function drawCards(s: GameState, deck: CardDef[], n: number): CardDef[] {
  const out: CardDef[] = [];
  let pool = [...deck];
  while (out.length < n) {
    if (pool.length === 0) pool = [...deck];
    const total = pool.reduce((sum, c) => sum + (c.weight ?? 1), 0);
    let r = rand(s) * total;
    let idx = pool.findIndex((c) => (r -= c.weight ?? 1) < 0);
    if (idx < 0) idx = pool.length - 1;
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

function notify(s: GameState, text: string) {
  s.notice = { seq: (s.notice?.seq ?? 0) + 1, text };
}

function log(s: GameState, text: string, tone: LogTone = 'info') {
  s.log.push({ id: s.logSeq++, text, tone });
  if (s.log.length > 120) s.log.shift();
}

function advance(s: GameState, map: MapDef, to: string, steps: number, via: MoveSource, express?: boolean) {
  const p = s.players[s.current];
  p.position = to;
  if (to === map.startTileId) paySalary(s, map, steps === 1 && via === 'dice');
  if (tileOf(map, to).type === 'track') {
    // Rails carry the rider along without using up dice steps.
    s.status = { kind: 'moving', steps, firstStep: false, via, express: true };
    return;
  }
  if (steps > 1) {
    // Only card trips stay fast after leaving a rail; dice walks return to normal speed.
    s.status = { kind: 'moving', steps: steps - 1, firstStep: false, via, express: via === 'card' ? express : undefined };
  } else {
    land(s, map);
  }
}

function paySalary(s: GameState, map: MapDef, exactLanding = false) {
  const p = s.players[s.current];
  const bonus = exactLanding && map.rules.exactStartBonus > 1;
  const amount = Math.round(map.rules.salary * (bonus ? map.rules.exactStartBonus : 1));
  p.money += amount;
  p.laps++;
  if (s.premiumEnabled && p.laps % PREMIUM_EVERY_LAPS === 0) {
    p.premiumTokens++;
    log(s, `💎 ${p.name} ${p.laps}바퀴 달성! 프리미엄 지정권 획득`, 'event');
    notify(s, `💎 ${p.name} ${p.laps}바퀴 달성! 프리미엄 지정권을 받았습니다`);
  }
  s.lastSalary = { player: p.id, amount, bonus };
  log(
    s,
    bonus
      ? `💰 ${p.name} 출발점에 딱 맞게 도착! 월급 ${map.rules.exactStartBonus}배 +${formatMoney(amount)}`
      : `💰 ${p.name} ${p.laps}바퀴 완주 · 월급 +${formatMoney(amount)}`,
    'good',
  );
}

/** Steps from `from` to `to` following the default route (next[0]); null if not on it. */
function routeDistance(map: MapDef, from: string, to: string): number | null {
  let at = from;
  for (let steps = 1; steps <= map.tiles.length; steps++) {
    at = tileOf(map, at).next[0];
    if (at === to) return steps;
  }
  return null;
}

function land(s: GameState, map: MapDef) {
  const p = s.players[s.current];
  const tile = tileOf(map, p.position);
  const phase = phaseOf(map, s);
  s.status = { kind: 'turn-end' };

  stompPlayers(s, map, tile);

  const triggerIdx = map.phaseTriggers.findIndex(
    (t, i) => t.tileId === tile.id && !s.firedTriggers.includes(i),
  );
  if (triggerIdx >= 0) {
    log(s, `${p.name}님이 ${tileName(map, s, tile)}에 도착했습니다!`, 'event');
    enterPhase(s, map, triggerIdx);
    s.status = { kind: 'phase-intro', phaseId: s.phaseId, then: { kind: 'turn-end' } };
    return;
  }

  if (phase.infection && s.infected.includes(tile.id)) {
    pay(s, map, p.id, phase.infection.landingFee, null, phase.infection.feeLabel);
    if (p.bankrupt) return;
  }

  switch (tile.type) {
    case 'station':
      landOnStation(s, map, tile);
      break;
    case 'chance':
      s.status = { kind: 'card-pick', cards: drawCards(s, phase.deck, CARD_SPREAD) };
      break;
    case 'missed-train':
      sendToMissedTrain(s, map, phase);
      break;
    case 'fare-check':
      pay(s, map, p.id, phase.fareCheckAmount, null, tileName(map, s, tile));
      break;
    case 'start':
    case 'event':
    case 'rest':
      break;
  }
}

/** Takes a little cash from everyone already on the tile. Never bankrupts anyone. */
function stompPlayers(s: GameState, map: MapDef, tile: TileDef) {
  if (!s.stompEnabled || map.rules.stomp.safeTileTypes.includes(tile.type)) return;
  const p = s.players[s.current];
  const victims: { id: number; amount: number }[] = [];
  for (const other of s.players) {
    if (other.id === p.id || other.bankrupt || other.position !== tile.id) continue;
    const amount = stompAmount(map, other.money);
    if (amount <= 0) continue;
    other.money -= amount;
    p.money += amount;
    victims.push({ id: other.id, amount });
    s.stats[p.id].stomps++;
    log(s, `👟 ${p.name} → ${other.name} 밟기! ${formatMoney(amount)} 강탈`, 'event');
  }
  if (victims.length > 0) {
    s.stomp = { seq: (s.stomp?.seq ?? 0) + 1, stomper: p.id, victims };
  }
}

function landOnStation(s: GameState, map: MapDef, tile: TileDef) {
  const p = s.players[s.current];
  const own = s.owners[tile.id];
  const price = tile.price ?? 0;
  if (!own) {
    if (p.money >= price) {
      s.status = { kind: 'buy-offer', tileId: tile.id, price };
    } else {
      log(s, `${p.name} 돈이 부족해 ${tileName(map, s, tile)}을(를) 살 수 없습니다.`);
    }
  } else if (own.owner === p.id) {
    const cost = upgradeCost(map, tile);
    if (own.level < maxLevel(map) && p.money >= cost) {
      s.status = { kind: 'upgrade-offer', tileId: tile.id, cost, level: own.level + 1 };
    }
  } else {
    s.status = { kind: 'toll-offer', tileId: tile.id, owner: own.owner, toll: computeToll(map, s, tile.id) };
  }
}

function sendToMissedTrain(s: GameState, map: MapDef, phase: PhaseDef) {
  const p = s.players[s.current];
  const tile = map.tiles.find((t) => t.type === 'missed-train');
  if (!tile) return;
  p.position = tile.id;
  p.missTurns = phase.missedTrainTurns;
  log(s, `${p.name} ${tileName(map, s, tile)}! ${p.missTurns}턴 동안 발이 묶입니다 (더블이면 탈출).`, 'bad');
}

/** Moves money; sells property or declares bankruptcy when the payer runs short. */
function recordToll(s: GameState, from: number, to: number, paid: number) {
  s.stats[from].tollOut += paid;
  s.stats[to].tollIn += paid;
}

/** Returns what actually changed hands (less than `amount` if the payer went bankrupt). */
function pay(s: GameState, map: MapDef, from: number, amount: number, to: number | null, reason: string): number {
  const payer = s.players[from];
  const payee = to === null ? null : s.players[to];
  if (amount <= 0) return 0;
  if (payer.money < amount) liquidate(s, map, from, amount);

  if (payer.money < amount) {
    const paid = payer.money;
    if (payee) payee.money += paid;
    payer.money = 0;
    payer.bankrupt = true;
    for (const [tileId, own] of Object.entries(s.owners)) {
      if (own.owner === from) delete s.owners[tileId];
    }
    log(s, `💀 ${payer.name} 파산! (${reason} ${formatMoney(amount)})`, 'bad');
    checkLastSurvivor(s);
    return paid;
  }

  payer.money -= amount;
  if (payee) payee.money += amount;
  log(s, `${payer.name} → ${payee ? payee.name : '은행'} ${formatMoney(amount)} (${reason})`, 'bad');
  return amount;
}

function liquidate(s: GameState, map: MapDef, playerId: number, needed: number) {
  const player = s.players[playerId];
  const owned = Object.entries(s.owners)
    .filter(([, own]) => own.owner === playerId)
    .map(([tileId, own]) => ({ tile: tileOf(map, tileId), value: propertyValue(map, tileOf(map, tileId), own.level) }))
    .sort((a, b) => a.value - b.value);
  for (const { tile, value } of owned) {
    if (player.money >= needed) break;
    const refund = Math.floor(value / 2);
    player.money += refund;
    delete s.owners[tile.id];
    log(s, `${player.name} ${tileName(map, s, tile)} 급매 (+${formatMoney(refund)})`, 'bad');
  }
}

function checkLastSurvivor(s: GameState) {
  const alive = s.players.filter((p) => !p.bankrupt);
  if (s.players.length === 1 && alive.length === 0) {
    s.status = { kind: 'game-over', winner: null, reason: '파산으로 게임 종료' };
  } else if (s.players.length > 1 && alive.length <= 1) {
    s.status = { kind: 'game-over', winner: alive[0]?.id ?? null, reason: '최후의 생존자' };
  }
}

function applyCard(s: GameState, map: MapDef, card: CardDef) {
  const p = s.players[s.current];
  const phase = phaseOf(map, s);
  const others = s.players.filter((o) => o.id !== p.id && !o.bankrupt);
  const e = card.effect;
  const money = (base: number) => scaleMoney(map, s, base);
  const nameOf = (tileId: string) => tileName(map, s, tileOf(map, tileId));
  const ownedBy = (ids: number[]) =>
    Object.entries(s.owners).filter(([, own]) => ids.includes(own.owner)).map(([tileId]) => tileId);
  const { property } = map.terms;
  s.status = { kind: 'turn-end' };

  switch (e.kind) {
    case 'money':
      if (e.amount >= 0) {
        p.money += money(e.amount);
        log(s, `${p.name} ${card.title} +${formatMoney(money(e.amount))}`, 'good');
      } else {
        pay(s, map, p.id, money(-e.amount), null, card.title);
      }
      break;
    case 'moneyPercent': {
      const amount = Math.round((p.money * Math.abs(e.percent)) / 100 / 5) * 5;
      if (amount <= 0) {
        log(s, `${p.name} ${card.title}: 현금이 없어 변화 없음`);
      } else if (e.percent > 0) {
        p.money += amount;
        log(s, `${p.name} ${card.title} +${formatMoney(amount)}`, 'good');
      } else {
        pay(s, map, p.id, amount, null, card.title);
      }
      break;
    }
    case 'move':
      log(s, `${p.name} ${card.title}: ${e.steps}칸 이동`);
      s.status = { kind: 'moving', steps: e.steps, firstStep: true, via: 'card' };
      break;
    case 'moveTo': {
      // Travel forward along the route, so passing the start tile pays salary as usual.
      log(s, `${p.name} ${card.title}: ${nameOf(e.tileId)}(으)로 이동`);
      const steps = routeDistance(map, p.position, e.tileId);
      if (steps === null) {
        p.position = e.tileId;
        if (e.tileId === map.startTileId) paySalary(s, map);
        land(s, map);
      } else {
        s.status = { kind: 'moving', steps, firstStep: false, via: 'card', express: true };
      }
      break;
    }
    case 'missTrain':
      sendToMissedTrain(s, map, phase);
      break;
    case 'collectAll':
      for (const o of others) pay(s, map, o.id, money(e.amount), p.id, card.title);
      break;
    case 'payAll':
      for (const o of others) {
        if (p.bankrupt) break;
        pay(s, map, p.id, money(e.amount), o.id, card.title);
      }
      break;
    case 'repairs': {
      const mine = Object.values(s.owners).filter((own) => own.owner === p.id);
      const levels = mine.reduce((sum, own) => sum + own.level, 0);
      const total = mine.length * money(e.perProperty) + levels * money(e.perLevel);
      if (total > 0) {
        notify(s, `🔧 ${p.name} ${card.title} ${formatMoney(total)} (${property} ${mine.length}곳 · 레벨 합계 ${levels})`);
        pay(s, map, p.id, total, null, card.title);
      } else {
        log(s, `${p.name} ${card.title}: 가진 ${property}이(가) 없어 면제!`, 'good');
      }
      break;
    }
    case 'cleanse': {
      const seeds = phase.infection?.seeds ?? [];
      for (let i = 0; i < e.count; i++) {
        const candidates = s.infected.filter((id) => !seeds.includes(id));
        if (candidates.length === 0) break;
        const id = pick(s, candidates);
        s.infected = s.infected.filter((x) => x !== id);
        log(s, `✨ ${nameOf(id)}: ${phase.infection?.label ?? ''} 해제`, 'good');
      }
      break;
    }
    case 'upgradeFree': {
      const candidates = ownedBy([p.id]).filter((id) => s.owners[id].level < maxLevel(map));
      if (candidates.length === 0) {
        const consolation = money(50);
        p.money += consolation;
        log(s, `${p.name} ${card.title}: 개발할 ${property}이(가) 없어 보상금 +${formatMoney(consolation)}`, 'good');
        notify(s, `🏗️ 개발할 ${property}이(가) 없어 보상금 ${formatMoney(consolation)}을(를) 받았습니다`);
        break;
      }
      if (e.choose) s.status = { kind: 'tile-pick', purpose: 'upgrade', title: card.title, options: candidates };
      else upgradeTile(s, map, pick(s, candidates));
      break;
    }
    case 'demolish': {
      const candidates = ownedBy(others.map((o) => o.id)).filter((id) => s.owners[id].level > 0);
      if (candidates.length === 0) {
        log(s, `${card.title}: 철거할 건물이 없었습니다`);
        notify(s, '💥 철거할 건물이 없어 아무 일도 일어나지 않았습니다');
        break;
      }
      if (e.choose) s.status = { kind: 'tile-pick', purpose: 'demolish', title: card.title, options: candidates };
      else demolishTile(s, map, pick(s, candidates));
      break;
    }
    case 'forfeit': {
      const candidates = ownedBy([p.id]);
      if (candidates.length === 0) {
        log(s, `${p.name} ${card.title}: 잃을 ${property}이(가) 없어 무사히 넘어갔습니다`, 'good');
        notify(s, `📄 잃을 ${property}이(가) 없어 무사히 넘어갔습니다`);
        break;
      }
      if (e.choose) s.status = { kind: 'tile-pick', purpose: 'forfeit', title: card.title, options: candidates };
      else forfeitTile(s, map, pick(s, candidates));
      break;
    }
    case 'swap': {
      const { mine, theirs } = swapCandidates(s, p.id);
      if (mine.length === 0 || theirs.length === 0) {
        log(s, `${card.title}: 바꿀 ${property}이(가) 없었습니다`);
        notify(s, `🔄 바꿀 ${property}이(가) 없어 아무 일도 일어나지 않았습니다`);
        break;
      }
      // The player chooses both sides (SWAP_MINE, then SWAP_THEIRS).
      s.status = { kind: 'swap-pick', title: card.title };
      break;
    }
    case 'rollMove': {
      const d1 = rollDie(s);
      const d2 = rollDie(s);
      s.dice = [d1, d2];
      s.rollSeq++;
      log(s, `🎲 ${p.name} ${card.title}: 주사위 ${d1}·${d2} → ${d1 + d2}칸 더 이동`);
      s.status = { kind: 'moving', steps: d1 + d2, firstStep: true, via: 'card' };
      break;
    }
    case 'roulette': {
      // Every opponent property except premium ones, dealt onto the wheel in random order.
      const options = ownedBy(others.map((o) => o.id)).filter((id) => !s.owners[id].premium);
      if (options.length === 0) {
        log(s, `${card.title}: 노릴 ${property}이(가) 없었습니다`);
        notify(s, `🎯 노릴 ${property}이(가) 없어 아무 일도 일어나지 않았습니다`);
        break;
      }
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(rand(s) * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      s.status = { kind: 'roulette', title: card.title, options };
      break;
    }
    case 'richToPoor': {
      const ranked = s.players
        .filter((o) => !o.bankrupt)
        .map((o) => ({ id: o.id, assets: totalAssets(map, s, o.id) }))
        .sort((x, y) => y.assets - x.assets);
      const rich = ranked[0];
      const poor = ranked[ranked.length - 1];
      if (ranked.length < 2 || rich.assets === poor.assets) {
        log(s, `${card.title}: 기부할 사람이 없었습니다`);
        break;
      }
      const amount = money(e.amount);
      notify(s, `🤝 ${s.players[rich.id].name} → ${s.players[poor.id].name} ${formatMoney(amount)} 기부`);
      pay(s, map, rich.id, amount, poor.id, card.title);
      break;
    }
  }
}

function upgradeTile(s: GameState, map: MapDef, id: string) {
  const p = s.players[s.current];
  const name = tileName(map, s, tileOf(map, id));
  s.owners[id].level++;
  log(s, `🏗️ ${p.name} ${name} 무료 ${map.terms.develop} Lv.${s.owners[id].level}`, 'good');
  notify(s, `🏗️ ${p.name}의 ${name}이(가) 무료로 Lv.${s.owners[id].level}이 되었습니다!`);
}

function demolishTile(s: GameState, map: MapDef, id: string) {
  const own = s.owners[id];
  const name = tileName(map, s, tileOf(map, id));
  const victim = s.players[own.owner].name;
  own.level--;
  log(s, `💥 ${victim}의 ${name} Lv.${own.level + 1} → Lv.${own.level}`, 'event');
  notify(s, `💥 ${victim}의 ${name}이(가) Lv.${own.level + 1}에서 Lv.${own.level}로 내려갔습니다!`);
}

function forfeitTile(s: GameState, map: MapDef, id: string) {
  const p = s.players[s.current];
  const name = tileName(map, s, tileOf(map, id));
  delete s.owners[id];
  log(s, `📄 ${p.name} ${name}을(를) 잃었습니다`, 'bad');
  notify(s, `📄 ${p.name}이(가) ${name}을(를) 잃었습니다`);
}

function enterPhase(s: GameState, map: MapDef, triggerIdx: number) {
  const trigger = map.phaseTriggers[triggerIdx];
  s.firedTriggers.push(triggerIdx);
  s.phaseId = trigger.toPhase;
  const phase = phaseOf(map, s);
  log(s, `${phase.badge} ${phase.name} 시작!`, 'event');
  for (const seed of phase.infection?.seeds ?? []) infect(s, map, seed);
}

function infect(s: GameState, map: MapDef, tileId: string) {
  if (s.infected.includes(tileId)) return;
  s.infected.push(tileId);
  const tile = tileOf(map, tileId);
  const own = s.owners[tileId];
  const rule = phaseOf(map, s).infection;
  if (own && rule?.seizeOwned) {
    delete s.owners[tileId];
    log(s, `${rule.icon} ${tileName(map, s, tile)} 함락! ${s.players[own.owner].name}님이 ${map.terms.property}을(를) 잃었습니다.`, 'bad');
  } else {
    log(s, `${rule?.icon ?? ''} ${rule?.label ?? ''} 확산: ${tileName(map, s, tile)}`, 'bad');
  }
}

const adjacencyCache = new WeakMap<MapDef, Record<string, string[]>>();

function adjacency(map: MapDef): Record<string, string[]> {
  let adj = adjacencyCache.get(map);
  if (!adj) {
    adj = Object.fromEntries(map.tiles.map((t) => [t.id, [] as string[]]));
    for (const t of map.tiles) {
      for (const n of t.next) {
        adj[t.id].push(n);
        adj[n].push(t.id);
      }
    }
    adjacencyCache.set(map, adj);
  }
  return adj;
}

function spreadInfection(s: GameState, map: MapDef) {
  const rule = phaseOf(map, s).infection;
  if (!rule || s.infected.length === 0) return;
  const adj = adjacency(map);
  for (let i = 0; i < rule.spreadPerRound; i++) {
    const frontier = new Set<string>();
    for (const id of s.infected) {
      for (const n of adj[id]) {
        if (!s.infected.includes(n) && n !== map.startTileId && tileOf(map, n).type !== 'track') frontier.add(n);
      }
    }
    if (frontier.size === 0) return;
    infect(s, map, pick(s, [...frontier]));
  }
}

function endTurn(s: GameState, map: MapDef) {
  const me = s.players[s.current];
  if (s.extraRoll && !me.bankrupt && me.missTurns === 0) {
    s.extraRoll = false;
    s.dice = null;
    s.status = { kind: 'await-roll' };
    log(s, `🎲 ${me.name} 더블 보너스! 한 번 더 굴립니다.`, 'good');
    return;
  }
  s.extraRoll = false;
  s.doubleStreak = 0;
  const n = s.players.length;
  let next = s.current;
  for (let k = 1; k <= n; k++) {
    const idx = (s.current + k) % n;
    if (!s.players[idx].bankrupt) {
      next = idx;
      break;
    }
  }
  const wrapped = next <= s.current;
  s.current = next;
  s.dice = null;
  s.status = { kind: 'await-roll' };
  if (wrapped) endRound(s, map);
}

function endRound(s: GameState, map: MapDef) {
  if (s.round >= s.maxRounds) {
    const ranked = s.players
      .map((p) => ({ id: p.id, assets: totalAssets(map, s, p.id) }))
      .sort((a, b) => b.assets - a.assets);
    s.status = { kind: 'game-over', winner: ranked[0].id, reason: `${s.maxRounds}라운드 종료` };
    log(s, `🏁 ${s.maxRounds}라운드 종료!`, 'event');
    return;
  }

  s.round++;
  s.assetHistory.push(s.players.map((p) => totalAssets(map, s, p.id)));
  log(s, `── ${s.round}라운드 ──`, 'event');
  spreadInfection(s, map);

  const fallbackIdx = map.phaseTriggers.findIndex(
    (t, i) =>
      !s.firedTriggers.includes(i) && t.fallbackRound !== undefined && s.round >= fallbackRoundFor(map, s, t.fallbackRound),
  );
  if (fallbackIdx >= 0) {
    log(s, map.phaseTriggers[fallbackIdx].fallbackText ?? '시간이 다 되었습니다… 세계가 바뀝니다.', 'event');
    enterPhase(s, map, fallbackIdx);
    s.status = { kind: 'phase-intro', phaseId: s.phaseId, then: { kind: 'await-roll' } };
  }
}
