import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Action, GameState, MapDef, StompEvent } from '../engine/types';
import {
  computeToll,
  fallbackRoundFor,
  formatMoney,
  PREMIUM_MULTIPLIER,
  premiumCandidates,
  propertyValue,
  swapCandidates,
  lineOf,
  phaseOf,
  tileName,
  tileOf,
} from '../engine/engine';
import { getMap } from '../maps';
import { useGame } from '../game/useGame';
import { themeVars } from '../theme';
import BgmPlayer from './BgmPlayer';
import Board from './Board';
import Die from './Dice';
import Modals from './Modals';

interface Props {
  initial: GameState;
  onExit: () => void;
  onRematch: () => void;
}

/** Tile under the pointer (or tapped), with where to anchor its info card inside the board area. */
interface Inspected {
  tileId: string;
  x: number;
  y: number;
  below: boolean;
}

const playerVar = (color: string) => ({ '--pc': color }) as CSSProperties;

/** What a property is worth for the swap card: purchase price plus development spent on it. */
const worth = (map: MapDef, state: GameState, tileId: string) => propertyValue(map, tileOf(map, tileId), state.owners[tileId]?.level ?? 0);

export default function Game({ initial, onExit, onRematch }: Props) {
  const { state, dispatch, rolling } = useGame(initial);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  // Opponent property picked for a swap that would lose value, waiting for "really swap?".
  const [swapConfirm, setSwapConfirm] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const wrapRef = useRef<HTMLElement>(null);
  // The engine resolves a roll instantly (e.g. a steal attempt moves money and ownership);
  // the board and player list keep showing the pre-roll state until the dice land.
  const settled = useRef(state);
  if (!rolling) settled.current = state;
  const view = settled.current;
  const map = getMap(state.mapId);
  const phase = phaseOf(map, state);
  const current = state.players[state.current];
  const humanTurn = !current.isBot;

  // Brief screen flash whenever the phase changes away from the initial one.
  const firstPhase = useRef(state.phaseId);
  useEffect(() => {
    if (state.phaseId === firstPhase.current) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(t);
  }, [state.phaseId]);

  // Space: roll / end turn / confirm, for human players. Escape closes the exit dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmExit) {
        if (e.key === 'Escape') setConfirmExit(false);
        return;
      }
      if (e.code !== 'Space' || !humanTurn || rolling) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'BUTTON') return;
      const k = state.status.kind;
      const action: Action | null =
        k === 'await-roll'
          ? { type: 'ROLL' }
          : k === 'turn-end'
            ? { type: 'END_TURN' }
            : k === 'card' || k === 'phase-intro' || k === 'steal-result'
              ? { type: 'ACK' }
              : state.status.kind === 'roulette' && state.status.result === undefined
                ? { type: 'SPIN' }
                : null;
      if (action) {
        e.preventDefault();
        dispatch(action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.status, humanTurn, rolling, confirmExit, dispatch]);

  // Salary banner: shown whenever any player's lap count goes up.
  const prevLaps = useRef(state.players.map((p) => p.laps));
  const [salaryToast, setSalaryToast] = useState<{ player: number; laps: number; key: number } | null>(null);
  useEffect(() => {
    const idx = state.players.findIndex((p, i) => p.laps > (prevLaps.current[i] ?? 0));
    prevLaps.current = state.players.map((p) => p.laps);
    if (idx < 0) return;
    setSalaryToast({ player: idx, laps: state.players[idx].laps, key: Date.now() });
  }, [state.players]);
  const salaryKey = salaryToast?.key;
  useEffect(() => {
    if (salaryKey === undefined) return;
    const t = setTimeout(() => setSalaryToast(null), 2200);
    return () => clearTimeout(t);
  }, [salaryKey]);

  // Stomp banner and token squash, replayed on every new stomp.
  const stompSeq = state.stomp?.seq;
  const [stompToast, setStompToast] = useState<StompEvent | null>(null);
  useEffect(() => {
    if (stompSeq === undefined) return;
    setStompToast(state.stomp);
    const t = setTimeout(() => setStompToast(null), 2600);
    return () => clearTimeout(t);
  }, [stompSeq]);

  // Development effect: fires when any station's level goes up (not on steals, which keep the level).
  const prevLevels = useRef<Record<string, number>>({});
  const [upgraded, setUpgraded] = useState<{ tileId: string; level: number; key: number } | null>(null);
  useEffect(() => {
    const prev = prevLevels.current;
    const hit = Object.entries(state.owners).find(([id, own]) => own.level > (prev[id] ?? 0));
    prevLevels.current = Object.fromEntries(Object.entries(state.owners).map(([id, own]) => [id, own.level]));
    if (hit) setUpgraded({ tileId: hit[0], level: hit[1].level, key: Date.now() });
  }, [state.owners]);
  const upgradedKey = upgraded?.key;
  useEffect(() => {
    if (upgradedKey === undefined) return;
    const t = setTimeout(() => setUpgraded(null), 1800);
    return () => clearTimeout(t);
  }, [upgradedKey]);

  // Card outcome banner, replayed on every new notice.
  const noticeSeq = state.notice?.seq;
  const [noticeToast, setNoticeToast] = useState<string | null>(null);
  useEffect(() => {
    if (noticeSeq === undefined) return;
    setNoticeToast(state.notice?.text ?? null);
    const t = setTimeout(() => setNoticeToast(null), 3200);
    return () => clearTimeout(t);
  }, [noticeSeq]);

  // Stable props so the memoized board only re-renders when the game itself changes.
  const statusKind = state.status.kind;
  const choosing = !humanTurn
    ? ''
    : state.status.kind === 'choose-path'
      ? state.status.options.join()
      : state.status.kind === 'premium-pick'
        ? premiumCandidates(state, current.id).join()
        : state.status.kind === 'swap-pick'
          ? swapCandidates(state, current.id)[state.status.mine ? 'theirs' : 'mine'].join()
          : state.status.kind === 'tile-pick'
            ? state.status.options.join()
            : '';
  const selectable = useMemo(() => (choosing ? choosing.split(',') : []), [choosing]);
  const stomped = useMemo(() => stompToast?.victims.map((v) => v.id) ?? [], [stompToast]);
  const swapMine = state.status.kind === 'swap-pick' ? state.status.mine : undefined;
  const latest = useRef(state);
  latest.current = state;
  // Giving away the more valuable property asks for confirmation first.
  const pickSwapTarget = useCallback(
    (tileId: string) => {
      if (!swapMine) return;
      const s = latest.current;
      if (worth(map, s, swapMine) > worth(map, s, tileId)) setSwapConfirm(tileId);
      else dispatch({ type: 'SWAP_THEIRS', tileId });
    },
    [dispatch, map, swapMine],
  );
  const onSelect = useCallback(
    (tileId: string) => {
      if (statusKind === 'premium-pick') dispatch({ type: 'SET_PREMIUM', tileId });
      else if (statusKind === 'tile-pick') dispatch({ type: 'PICK_TILE', tileId });
      else if (statusKind === 'swap-pick') swapMine ? pickSwapTarget(tileId) : dispatch({ type: 'SWAP_MINE', tileId });
      else dispatch({ type: 'CHOOSE_PATH', tileId });
    },
    [dispatch, statusKind, swapMine, pickSwapTarget],
  );
  const onInspect = useCallback((tileId: string | null, anchor?: DOMRect) => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!tileId || !anchor || !wrap) return setInspected(null);
    const below = anchor.top - wrap.top < 150;
    setInspected({
      tileId,
      x: Math.min(Math.max(anchor.left + anchor.width / 2 - wrap.left, 130), wrap.width - 130),
      y: below ? anchor.bottom - wrap.top : anchor.top - wrap.top,
      below,
    });
  }, []);

  return (
    <div
      className={`app game map-${map.id} phase-${phase.id} ${phase.altNames ? 'alt' : ''} ${flash ? 'flash' : ''}`}
      style={themeVars(phase.theme)}
    >
      <main className="board-wrap" ref={wrapRef}>
        <div className="board-header">
          <h1>
            <span className="board-title">{map.name}</span>
            <span className="phase-badge">
              {phase.badge} {phase.name}
            </span>
          </h1>
          <RoundMeter map={map} state={state} />
        </div>
        <div className="board-scroll" onScroll={() => setInspected(null)}>
          <Board
            map={map}
            state={view}
            selectable={selectable}
            onSelect={onSelect}
            onInspect={onInspect}
            salaryPulse={salaryToast?.key ?? null}
            stomped={stomped}
            upgraded={upgraded}
          />
        </div>
        {salaryToast && (
          <div key={salaryToast.key} className="salary-toast" style={{ borderColor: state.players[salaryToast.player].color }}>
            <span className="salary-coin">💰</span>
            <div>
              <strong>{state.players[salaryToast.player].name}</strong>{' '}
              {state.lastSalary?.bonus ? `출발점에 딱 맞게 도착! 월급 ${map.rules.exactStartBonus}배` : `${salaryToast.laps}바퀴 완주!`}
              <span className="salary-amount">월급 +{formatMoney(state.lastSalary?.amount ?? map.rules.salary)}</span>
            </div>
          </div>
        )}
        {inspected && <TileInfo map={map} state={state} inspected={inspected} />}
        <Legend map={map} state={state} />
      </main>

      <aside className="sidebar">
        <TurnCard map={map} state={state} rolling={rolling} dispatch={dispatch} onSwapTarget={pickSwapTarget} />
        <PlayersPanel state={view} />
        <NewsPanel state={view} />
        <div className="sidebar-foot">
          {map.phases.some((p) => p.bgm) && <BgmPlayer videoId={phase.bgm} />}
          <button className="ghost exit-btn" onClick={() => setConfirmExit(true)}>
            🚪 나가기
          </button>
        </div>
      </aside>

      {!rolling && <Modals map={map} state={state} dispatch={dispatch} onExit={onExit} onRematch={onRematch} />}
      {swapConfirm && swapMine && (
        <SwapConfirmDialog
          map={map}
          state={state}
          mine={swapMine}
          theirs={swapConfirm}
          onCancel={() => setSwapConfirm(null)}
          onConfirm={() => {
            setSwapConfirm(null);
            dispatch({ type: 'SWAP_THEIRS', tileId: swapConfirm });
          }}
        />
      )}
      {confirmExit && <ExitDialog onCancel={() => setConfirmExit(false)} onExit={onExit} />}
      {stompToast && <StompToast key={stompToast.seq} state={state} stomp={stompToast} />}
      {noticeToast && (
        <div key={noticeSeq} className="notice-toast">
          {noticeToast}
        </div>
      )}
    </div>
  );
}

function StompToast({ state, stomp }: { state: GameState; stomp: StompEvent }) {
  const stomper = state.players[stomp.stomper];
  return (
    <div className="stomp-toast" style={{ borderColor: stomper.color }}>
      <span className="stomp-foot">👟</span>
      <div>
        <strong>{stomper.name}</strong>님이 밟았다!
        {stomp.victims.map((v) => (
          <span key={v.id} className="stomp-line">
            {state.players[v.id].name}에게서 {formatMoney(v.amount)} 강탈
          </span>
        ))}
      </div>
    </div>
  );
}

function ExitDialog({ onCancel, onExit }: { onCancel: () => void; onExit: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal exit-modal" role="alertdialog" aria-labelledby="exit-title" onClick={(e) => e.stopPropagation()}>
        <span className="phase-emoji">🚪</span>
        <h2 id="exit-title">게임을 그만둘까요?</h2>
        <p className="muted">진행 중인 게임은 저장되지 않고 처음 화면으로 돌아갑니다.</p>
        <div className="btn-row">
          <button autoFocus onClick={onCancel}>
            계속하기
          </button>
          <button className="primary danger-btn" onClick={onExit}>
            처음으로
          </button>
        </div>
      </div>
    </div>
  );
}

function SwapConfirmDialog({
  map,
  state,
  mine,
  theirs,
  onCancel,
  onConfirm,
}: PanelProps & { mine: string; theirs: string; onCancel: () => void; onConfirm: () => void }) {
  const name = (id: string) => tileName(map, state, tileOf(map, id));
  const give = worth(map, state, mine);
  const get = worth(map, state, theirs);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal swap-modal" role="alertdialog" aria-labelledby="swap-title" onClick={(e) => e.stopPropagation()}>
        <span className="phase-emoji">⚠️</span>
        <h2 id="swap-title">손해 보는 교환이에요</h2>
        <div className="swap-compare">
          <div>
            <small>내줄 {map.terms.property}</small>
            <strong>{name(mine)}</strong>
            <span>가치 {formatMoney(give)}</span>
          </div>
          <span className="swap-arrow">⇄</span>
          <div>
            <small>
              {state.players[state.owners[theirs].owner].name}의 {map.terms.property}
            </small>
            <strong>{name(theirs)}</strong>
            <span>가치 {formatMoney(get)}</span>
          </div>
        </div>
        <p className="muted">
          가치가 <strong className="swap-loss">{formatMoney(give - get)}</strong> 줄어듭니다. 그래도 교환할까요?
        </p>
        <div className="btn-row">
          <button autoFocus onClick={onCancel}>
            다시 고르기
          </button>
          <button className="primary danger-btn" onClick={onConfirm}>
            그래도 교환
          </button>
        </div>
      </div>
    </div>
  );
}

interface PanelProps {
  map: MapDef;
  state: GameState;
}

/** Round progress, with a marker for the round a pending phase change kicks in. */
function RoundMeter({ map, state }: PanelProps) {
  const max = state.maxRounds;
  const pending = map.phaseTriggers.find((t, i) => !state.firedTriggers.includes(i) && t.fallbackRound !== undefined);
  const pendingPhase = pending && map.phases.find((p) => p.id === pending.toPhase);
  return (
    <div className="round-meter">
      <span>
        라운드 <strong>{state.round}</strong> / {max}
      </span>
      <span className="meter" role="progressbar" aria-valuemin={1} aria-valuemax={max} aria-valuenow={state.round} aria-label="라운드 진행">
        <span className="meter-fill" style={{ width: `${(state.round / max) * 100}%` }} />
        {pending && pendingPhase && (
          <span
            className="meter-mark"
            style={{ left: `${(fallbackRoundFor(map, state, pending.fallbackRound!) / max) * 100}%` }}
            title={`늦어도 ${fallbackRoundFor(map, state, pending.fallbackRound!)}라운드에 ${pendingPhase.name} 시작`}
          >
            {pendingPhase.badge}
          </span>
        )}
      </span>
    </div>
  );
}

/** Whose turn it is, the dice, and whatever that player has to decide right now. */
function TurnCard({
  map,
  state,
  rolling,
  dispatch,
  onSwapTarget,
}: PanelProps & { rolling: boolean; dispatch: (a: Action) => void; onSwapTarget: (tileId: string) => void }) {
  const p = state.players[state.current];
  const st = state.status;
  const bot = p.isBot;
  const name = (id: string) => tileName(map, state, tileOf(map, id));
  const [d1, d2] = state.dice ?? [1, 1];
  const canRoll = !bot && !rolling && st.kind === 'await-roll';
  const caption = state.log[state.log.length - 1]?.text;

  let body: ReactNode = null;
  if (rolling) {
    body = <p className="notice">주사위를 굴리는 중…</p>;
  } else {
    switch (st.kind) {
      case 'await-roll':
        body = (
          <>
            {p.missTurns > 0 && <p className="notice">발이 묶였습니다. 더블이 나오면 탈출! (남은 {p.missTurns}턴)</p>}
            {tileOf(map, p.position).next.length > 1 && <p className="notice">⑂ 갈림길에 서 있습니다. 굴린 뒤 방향을 고를 수 있어요.</p>}
            <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'ROLL' })}>
              🎲 주사위 굴리기 <kbd>Space</kbd>
            </button>
          </>
        );
        break;
      case 'moving':
        body = <p className="notice">이동 중… {st.steps}칸 남음</p>;
        break;
      case 'choose-path':
        body = (
          <>
            <p className="notice">⑂ 갈림길! 어느 쪽으로 갈까요? ({st.steps}칸 이동)</p>
            <div className="choice-list">
              {st.options.map((id) => {
                const line = lineOf(map, state, tileOf(map, id).line);
                return (
                  <button key={id} disabled={bot} onClick={() => dispatch({ type: 'CHOOSE_PATH', tileId: id })}>
                    <span className="line-dot" style={{ background: line.color }} />
                    {name(id)} <small>{line.name}</small>
                  </button>
                );
              })}
            </div>
          </>
        );
        break;
      case 'buy-offer':
        body = (
          <>
            <p className="notice">
              <strong>{name(st.tileId)}</strong>을(를) {formatMoney(st.price)}에 살까요?
            </p>
            <div className="btn-row">
              <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'BUY' })}>
                구매
              </button>
              <button disabled={bot} onClick={() => dispatch({ type: 'DECLINE' })}>
                패스
              </button>
            </div>
          </>
        );
        break;
      case 'upgrade-offer':
        body = (
          <>
            <p className="notice">
              <strong>{name(st.tileId)}</strong> {map.terms.develop} {map.terms.levelIcons[st.level - 1]} Lv.{st.level}을(를) 진행할까요? (
              {formatMoney(st.cost)})
            </p>
            <p className="notice muted">
              통행료 {formatMoney(computeToll(map, state, st.tileId))} →{' '}
              <strong className="toll-up">
                {formatMoney(
                  computeToll(map, { ...state, owners: { ...state.owners, [st.tileId]: { ...state.owners[st.tileId], level: st.level } } }, st.tileId),
                )}
              </strong>
            </p>
            <div className="btn-row">
              <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'UPGRADE' })}>
                개발
              </button>
              <button disabled={bot} onClick={() => dispatch({ type: 'DECLINE' })}>
                패스
              </button>
            </div>
          </>
        );
        break;
      case 'turn-end':
        body = (
          <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'END_TURN' })}>
            {state.extraRoll && p.missTurns === 0 ? '🎲 더블! 한 번 더 굴리기' : '턴 넘기기'} <kbd>Space</kbd>
          </button>
        );
        break;
      case 'premium-pick': {
        const options = premiumCandidates(state, p.id);
        body = (
          <>
            <p className="notice">
              💎 프리미엄으로 만들 내 {map.terms.property}을(를) 고르세요. 통행료 ×{PREMIUM_MULTIPLIER}, 뺏기 불가
            </p>
            <div className="choice-list">
              {options.map((id) => (
                <button key={id} disabled={bot} onClick={() => dispatch({ type: 'SET_PREMIUM', tileId: id })}>
                  💎 {name(id)} <small>통행료 {formatMoney(computeToll(map, state, id))} → {formatMoney(computeToll(map, state, id) * PREMIUM_MULTIPLIER)}</small>
                </button>
              ))}
            </div>
            <button disabled={bot} onClick={() => dispatch({ type: 'CANCEL_PREMIUM' })}>
              나중에 쓰기
            </button>
          </>
        );
        break;
      }
      case 'swap-pick': {
        const { mine, theirs } = swapCandidates(state, p.id);
        const property = map.terms.property;
        const value = (id: string) => `가치 ${formatMoney(worth(map, state, id))} · 통행료 ${formatMoney(computeToll(map, state, id))}`;
        body = st.mine ? (
          <>
            <p className="notice">
              🔄 {st.title}: <strong>{name(st.mine)}</strong>({formatMoney(worth(map, state, st.mine))})과 바꿀 상대 {property}을(를) 고르세요.
            </p>
            <div className="choice-list swap-list">
              {theirs.map((id) => {
                const owner = state.players[state.owners[id].owner];
                return (
                  <button key={id} disabled={bot} onClick={() => onSwapTarget(id)}>
                    <span className="line-dot" style={{ background: owner.color }} />
                    {name(id)}{' '}
                    <small>
                      {owner.name} · {value(id)}
                    </small>
                  </button>
                );
              })}
            </div>
            <button disabled={bot} onClick={() => dispatch({ type: 'SWAP_BACK' })}>
              ← 내 {property} 다시 고르기
            </button>
          </>
        ) : (
          <>
            <p className="notice">
              🔄 {st.title}: 먼저 내줄 내 {property}을(를) 고르세요. 보드에서 눌러도 돼요.
            </p>
            <div className="choice-list swap-list">
              {mine.map((id) => (
                <button key={id} disabled={bot} onClick={() => dispatch({ type: 'SWAP_MINE', tileId: id })}>
                  {name(id)} <small>{value(id)}</small>
                </button>
              ))}
            </div>
          </>
        );
        break;
      }
      case 'tile-pick': {
        const property = map.terms.property;
        const level = (id: string) => state.owners[id]?.level ?? 0;
        // Toll after the card's change, for the preview next to each option.
        const tollAt = (id: string, lv: number) =>
          computeToll(map, { ...state, owners: { ...state.owners, [id]: { ...state.owners[id], level: lv } } }, id);
        const prompt =
          st.purpose === 'upgrade'
            ? `🏗️ ${st.title}: 무료로 개발할 내 ${property}을(를) 고르세요.`
            : st.purpose === 'demolish'
              ? `💥 ${st.title}: 한 단계 낮출 상대 ${property}을(를) 고르세요.`
              : `📄 ${st.title}: 내놓을 내 ${property}을(를) 고르세요.`;
        const detail = (id: string) =>
          st.purpose === 'upgrade'
            ? `Lv.${level(id)} → ${level(id) + 1} · 통행료 ${formatMoney(computeToll(map, state, id))} → ${formatMoney(tollAt(id, level(id) + 1))}`
            : st.purpose === 'demolish'
              ? `${state.players[state.owners[id].owner].name} · Lv.${level(id)} → ${level(id) - 1} · 통행료 ${formatMoney(computeToll(map, state, id))} → ${formatMoney(tollAt(id, level(id) - 1))}`
              : `가치 ${formatMoney(worth(map, state, id))} · 통행료 ${formatMoney(computeToll(map, state, id))}`;
        body = (
          <>
            <p className="notice">
              {prompt} 보드에서 눌러도 돼요.
            </p>
            <div className="choice-list swap-list">
              {st.options.map((id) => (
                <button key={id} disabled={bot} onClick={() => dispatch({ type: 'PICK_TILE', tileId: id })}>
                  <span className="line-dot" style={{ background: state.players[state.owners[id].owner].color }} />
                  {name(id)} <small>{detail(id)}</small>
                </button>
              ))}
            </div>
          </>
        );
        break;
      }
      case 'roulette':
        body = <p className="notice">🎯 {st.title}: 룰렛을 돌리세요!</p>;
        break;
      case 'toll-offer':
        body = <p className="notice">🚧 {state.players[st.owner].name}의 {map.terms.property}에 도착했습니다!</p>;
        break;
      case 'steal-result':
      case 'card-pick':
      case 'card':
      case 'phase-intro':
      case 'game-over':
        break;
    }
  }

  return (
    <section className="panel turn-card" style={playerVar(p.color)} aria-live="polite">
      <div className="turn-head">
        <span className="swatch" style={{ background: p.color }}>
          {p.id + 1}
        </span>
        <strong>{p.name}</strong>
        <span className="turn-status">{bot ? '🤖 자동 진행' : '내 차례'}</span>
      </div>
      <div className="turn-dice">
        <button
          className={`dice-tray ${canRoll ? 'can-roll' : ''} ${state.dice ? '' : 'idle'}`}
          disabled={!canRoll}
          onClick={() => dispatch({ type: 'ROLL' })}
          aria-label="주사위 굴리기"
        >
          <Die value={d1} rolling={rolling} rollSeq={state.rollSeq} variant={0} />
          <Die value={d2} rolling={rolling} rollSeq={state.rollSeq} variant={1} />
        </button>
        <div className="turn-dice-info">
          <div className="dice-result">
            {state.dice === null ? (
              <span className="muted">{canRoll ? '눌러서 굴리기' : '　'}</span>
            ) : rolling ? (
              <span className="muted">…</span>
            ) : (
              <>
                <strong className="dice-sum" style={{ color: p.color }}>
                  {d1 + d2}
                </strong>
                {d1 === d2 && <span className="doubles">더블!</span>}
              </>
            )}
          </div>
          {!rolling && caption && <p className="dice-caption">{caption}</p>}
        </div>
      </div>
      {body && <div className="turn-body">{body}</div>}
      {state.premiumEnabled && p.premiumTokens > 0 && !bot && (st.kind === 'await-roll' || st.kind === 'turn-end') && !rolling && (
        <button
          className="premium-btn"
          disabled={premiumCandidates(state, p.id).length === 0}
          onClick={() => dispatch({ type: 'START_PREMIUM' })}
          title={premiumCandidates(state, p.id).length === 0 ? `지정할 ${map.terms.property}이(가) 없어요` : undefined}
        >
          💎 프리미엄 지정권 {p.premiumTokens}장 사용하기
        </button>
      )}
    </section>
  );
}

/** One line per player: who they are, anything unusual about them, and their cash. */
function PlayersPanel({ state }: { state: GameState }) {
  return (
    <ol className="panel players-panel" aria-label="플레이어">
      {state.players.map((p) => (
        <li
          key={p.id}
          className={`player-card ${p.id === state.current ? 'current' : ''} ${p.bankrupt ? 'bankrupt' : ''}`}
          style={playerVar(p.color)}
        >
          <span className="swatch" style={{ background: p.color }}>
            {p.id + 1}
          </span>
          <span className="player-name">{p.name}</span>
          {p.isBot && <span className="chip">봇</span>}
          {p.missTurns > 0 && <span className="tag">발 묶임 {p.missTurns}</span>}
          {state.premiumEnabled && p.premiumTokens > 0 && !p.bankrupt && <span className="chip premium">지정권 {p.premiumTokens}</span>}
          {p.bankrupt ? <span className="tag">파산</span> : <Money value={p.money} />}
        </li>
      ))}
    </ol>
  );
}

const NEWS_COUNT = 10;
/** Log lines often start with an emoji; the feed reads cleaner without them. */
const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}|\uFE0F|\u200D)+\s*/u;

/**
 * The latest notable events, newest first. Rankings are kept secret until the result screen,
 * so this panel reports what happened rather than who is ahead.
 */
function NewsPanel({ state }: { state: GameState }) {
  const items = state.log.filter((e) => e.tone !== 'info').slice(-NEWS_COUNT).reverse();
  return (
    <section className="panel news-panel" aria-labelledby="news-heading">
      <div className="news-head">
        <h3 id="news-heading">최근 소식</h3>
        <small>순위는 게임이 끝나면 공개</small>
      </div>
      <ol aria-live="polite">
        {items.map((e) =>
          e.text.startsWith('──') ? (
            <li key={e.id} className="news-round">
              {e.text.replaceAll('─', '').trim()}
            </li>
          ) : (
            <li key={e.id} className={`news-item tone-${e.tone}`}>
              {e.text.replace(LEADING_EMOJI, '')}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

/** Cash amount that pops a floating +/− badge whenever it changes. */
function Money({ value }: { value: number }) {
  const prev = useRef(value);
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null);
  useEffect(() => {
    const diff = value - prev.current;
    prev.current = value;
    if (diff === 0) return;
    setDelta({ amount: diff, key: Date.now() });
    const t = setTimeout(() => setDelta(null), 1600);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span className="money">
      {formatMoney(value)}
      {delta && (
        <span key={delta.key} className={`money-delta ${delta.amount > 0 ? 'plus' : 'minus'}`}>
          {delta.amount > 0 ? '+' : '−'}
          {formatMoney(Math.abs(delta.amount))}
        </span>
      )}
    </span>
  );
}

function TileInfo({ map, state, inspected }: PanelProps & { inspected: Inspected }) {
  const { tileId } = inspected;
  const tile = tileOf(map, tileId);
  const own = state.owners[tileId];
  const line = lineOf(map, state, tile.line);
  const infected = state.infected.includes(tileId);
  return (
    <div className={`tile-info ${inspected.below ? 'below' : ''}`} style={{ left: inspected.x, top: inspected.y }}>
      <strong>{tileName(map, state, tile)}</strong>
      <span className="muted">
        <span className="line-dot" style={{ background: line.color }} /> {line.name}
      </span>
      {tile.id === map.startTileId && (
        <span>
          💰 지나가면 월급 {formatMoney(map.rules.salary)} · 주사위로 딱 맞게 멈추면 {map.rules.exactStartBonus}배
        </span>
      )}
      {state.stompEnabled && map.rules.stomp.safeTileTypes.includes(tile.type) && <span>🛡 밟기 안전지대</span>}
      {tile.price !== undefined && <span>가격 {formatMoney(tile.price)}</span>}
      {own && (
        <span>
          소유: {state.players[own.owner].name} · Lv.{own.level} · 통행료 {formatMoney(computeToll(map, state, tileId))}
        </span>
      )}
      {own?.premium && <span className="premium-note">💎 프리미엄: 통행료 ×{PREMIUM_MULTIPLIER} · 뺏기 불가</span>}
      {tile.next.length > 1 && <span>⑂ 갈림길: 여기에 멈춰야 다음 턴에 방향을 고를 수 있음</span>}
      {infected && (
        <span className="danger">
          {phaseOf(map, state).infection?.icon} {phaseOf(map, state).infection?.label}
        </span>
      )}
    </div>
  );
}

function Legend({ map, state }: PanelProps) {
  return (
    <div className="legend">
      {map.lines.map((l) => (
        <span key={l.id}>
          <span className="line-dot" style={{ background: lineOf(map, state, l.id).color }} /> {l.name}
        </span>
      ))}
      <span>⑂ 갈림길 (정확히 멈춘 경우만 선택)</span>
      <span>
        칸 숫자: 빈 땅은 <b>가격</b>, 주인 있는 땅은 <b className="legend-toll">통행료</b>
      </span>
    </div>
  );
}
