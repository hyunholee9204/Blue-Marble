import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react';
import type { GameState, MapDef, PlayerState } from '../engine/types';
import { formatMoney, totalAssets } from '../engine/engine';

interface Props {
  map: MapDef;
  state: GameState;
  winner: number | null;
  reason: string;
  onExit: () => void;
  onRematch: () => void;
}

interface Award {
  icon: string;
  title: string;
  who: PlayerState[];
  value: string;
}

/** Highest scorer(s) for a stat; nothing when nobody scored. */
function best(players: PlayerState[], score: (p: PlayerState) => number, value: (n: number) => string) {
  const top = Math.max(...players.map(score));
  if (top <= 0) return null;
  return { who: players.filter((p) => score(p) === top), value: value(top) };
}

const REVEAL_STEP_MS = 1000;
const REVEAL_FIRST_MS = 1800;

export default function GameOver({ map, state, winner, reason, onExit, onRematch }: Props) {
  const assets = state.players.map((p) => totalAssets(map, state, p.id));
  const owned = (id: number) => Object.values(state.owners).filter((o) => o.owner === id);
  const ranked = [...state.players].sort((a, b) => Number(a.bankrupt) - Number(b.bankrupt) || assets[b.id] - assets[a.id]);

  // Rankings were secret all game: reveal from last place up, holding first place a little longer.
  const [shown, setShown] = useState(0);
  const [stage, setStage] = useState<'reveal' | 'summary'>(ranked.length > 1 ? 'reveal' : 'summary');
  useEffect(() => {
    if (stage !== 'reveal') return;
    const left = ranked.length - shown;
    const delay = shown === 0 ? 700 : left === 1 ? REVEAL_FIRST_MS : left === 0 ? 2200 : REVEAL_STEP_MS;
    const t = setTimeout(() => (left === 0 ? setStage('summary') : setShown((n) => n + 1)), delay);
    return () => clearTimeout(t);
  }, [stage, shown, ranked.length]);

  if (stage === 'reveal') {
    return (
      <div className="modal-backdrop gameover-backdrop">
        <div className="reveal" role="dialog" aria-labelledby="reveal-title">
          <span className="card-kicker">
            {reason} · {map.name}
          </span>
          <h2 id="reveal-title">🥁 최종 순위 발표</h2>
          <ol className="reveal-list">
            {ranked.map((p, i) => {
              const open = i >= ranked.length - shown;
              return (
                <li
                  key={p.id}
                  className={`reveal-item ${open ? 'open' : 'hidden'} ${i === 0 && open ? 'winner' : ''}`}
                  style={{ '--pc': p.color } as CSSProperties}
                >
                  <span className="reveal-place">{i + 1}위</span>
                  {open ? (
                    <>
                      <span className="reveal-token">{p.id + 1}</span>
                      <span className="reveal-name">
                        {i === 0 && '👑 '}
                        {p.name}
                      </span>
                      <span className="reveal-assets">{p.bankrupt ? '파산' : formatMoney(assets[p.id])}</span>
                    </>
                  ) : (
                    <span className="reveal-mystery">? ? ?</span>
                  )}
                </li>
              );
            })}
          </ol>
          <button className="ghost reveal-skip" onClick={() => setStage('summary')}>
            건너뛰기
          </button>
        </div>
      </div>
    );
  }
  const champ = winner === null ? null : state.players[winner];
  const { property } = map.terms;

  const awardDefs: (Omit<Award, 'who' | 'value'> & { pick: ReturnType<typeof best> })[] = [
    { icon: '💰', title: '통행료왕', pick: best(state.players, (p) => state.stats[p.id].tollIn, (n) => `${formatMoney(n)} 수입`) },
    { icon: '🏨', title: '개발왕', pick: best(state.players, (p) => owned(p.id).reduce((s, o) => s + o.level, 0), (n) => `레벨 합계 ${n}`) },
    { icon: '🗺️', title: `${property} 부자`, pick: best(state.players, (p) => owned(p.id).length, (n) => `${n}곳 보유`) },
    { icon: '🏴', title: '뺏기왕', pick: best(state.players, (p) => state.stats[p.id].steals, (n) => `${n}번 성공`) },
    { icon: '👟', title: '밟기왕', pick: best(state.players, (p) => state.stats[p.id].stomps, (n) => `${n}번 밟음`) },
    { icon: '🔄', title: '완주왕', pick: best(state.players, (p) => p.laps, (n) => `${n}바퀴`) },
  ];
  const awards: Award[] = awardDefs.flatMap(({ pick, ...a }) => (pick ? [{ ...a, ...pick }] : []));

  const podium = ranked.filter((p) => !p.bankrupt).slice(0, 3);
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);
  const rest = ranked.filter((p) => !podium.includes(p));

  return (
    <div className="modal-backdrop gameover-backdrop">
      <Confetti colors={state.players.map((p) => p.color)} />
      <div className="gameover" role="dialog" aria-labelledby="gameover-title">
        <header className="gameover-head">
          <span className="card-kicker">
            {reason} · {map.name}
          </span>
          <h2 id="gameover-title">{champ ? `🏆 ${champ.name} 승리!` : '생존자 없음'}</h2>
          {champ && (
            <p className="gameover-sub">
              총자산 <strong>{formatMoney(assets[champ.id])}</strong> · {champ.laps}바퀴 · {property} {owned(champ.id).length}곳
            </p>
          )}
        </header>

        <div className="gameover-body">
          <section className="podium" aria-label="최종 순위">
            <div className="podium-stage">
              {podiumOrder.map((p) => {
                const place = podium.indexOf(p) + 1;
                return (
                  <div key={p.id} className={`podium-spot place-${place}`} style={{ '--pc': p.color } as CSSProperties}>
                    {place === 1 && <span className="podium-crown">👑</span>}
                    <span className="podium-token">{p.id + 1}</span>
                    <span className="podium-name">{p.name}</span>
                    <span className="podium-assets">{formatMoney(assets[p.id])}</span>
                    <span className="podium-block">{place}</span>
                  </div>
                );
              })}
            </div>
            {rest.length > 0 && (
              <ol className="podium-rest" start={podium.length + 1}>
                {rest.map((p) => (
                  <li key={p.id} style={{ '--pc': p.color } as CSSProperties}>
                    <i />
                    {p.name}
                    <span>{p.bankrupt ? '파산' : formatMoney(assets[p.id])}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="gameover-trend" aria-labelledby="trend-title">
            <h3 id="trend-title">자산 흐름</h3>
            <TrendChart state={state} live={assets} />
          </section>
        </div>

        {awards.length > 0 && (
          <ul className="awards" aria-label="타이틀">
            {awards.map((a) => (
              <li key={a.title}>
                <span className="award-icon">{a.icon}</span>
                <span className="award-text">
                  <strong>{a.title}</strong>
                  <span>
                    {a.who.map((p) => (
                      <span key={p.id} className="award-who" style={{ '--pc': p.color } as CSSProperties}>
                        {p.name}
                      </span>
                    ))}
                    <small>{a.value}</small>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="gameover-actions">
          <button onClick={onExit}>처음으로</button>
          <button className="primary" autoFocus onClick={onRematch}>
            🔁 같은 설정으로 한 판 더
          </button>
        </div>
      </div>
    </div>
  );
}

const W = 520;
const H = 240;
const PAD = { l: 62, r: 22, t: 14, b: 28 };

function niceMax(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (step * mag >= v) return step * mag;
  return 10 * mag;
}

/** Total assets per player at each round start, ending with the final totals. */
function TrendChart({ state, live }: { state: GameState; live: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const rows = [...state.assetHistory, live];
  const n = rows.length;
  const max = niceMax(Math.max(1, ...rows.flat()));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n <= 1 ? plotW : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.t + (1 - v / max) * plotH;
  const label = (i: number) => (i === n - 1 ? '종료' : `${i + 1}R`);
  const ticks = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const order = state.players.map((p) => p.id).sort((a, b) => live[a] - live[b]);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    setHover(n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  };

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="라운드별 총자산 추이">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className={f === 0 ? 'trend-base' : 'trend-grid'} />
            <text x={PAD.l - 8} y={y(max * f) + 5} className="trend-tick y">
              {formatMoney(max * f)}
            </text>
          </g>
        ))}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 7} className="trend-tick x">
            {label(i)}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + plotH} className="trend-cross" />}
        {order.map((id) => {
          const p = state.players[id];
          return (
            <polyline
              key={id}
              points={rows.map((r, i) => `${x(i)},${y(r[id])}`).join(' ')}
              pathLength={1}
              className="trend-line"
              style={{ stroke: p.color, opacity: p.bankrupt ? 0.4 : 1 }}
            />
          );
        })}
        {order.map((id) => (
          <g key={id} transform={`translate(${x(n - 1)} ${y(live[id])})`} className="trend-end">
            <circle r={9} style={{ fill: state.players[id].color }} />
            <text dy={4}>{id + 1}</text>
          </g>
        ))}
        {hover !== null &&
          state.players.map((p) => <circle key={p.id} cx={x(hover)} cy={y(rows[hover][p.id])} r={4.5} className="trend-dot" style={{ fill: p.color }} />)}
        <rect x={PAD.l} y={0} width={plotW} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <div className={`trend-tip ${x(hover) > W / 2 ? 'left' : ''}`} style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{hover === n - 1 ? '최종' : `${hover + 1}라운드 시작`}</strong>
          {state.players
            .map((p) => ({ p, v: rows[hover][p.id] }))
            .sort((a, b) => b.v - a.v)
            .map(({ p, v }) => (
              <span key={p.id}>
                <i style={{ background: p.color }} />
                {p.name}
                <b>{formatMoney(v)}</b>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/** A short burst of falling paper in the players' colours. */
function Confetti({ colors }: { colors: string[] }) {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 42 }, (_, i) => (
        <span
          key={i}
          style={
            {
              left: `${(i * 37) % 100}%`,
              background: colors[i % colors.length],
              '--delay': `${(i % 9) * 0.22}s`,
              '--dur': `${2.6 + (i % 5) * 0.35}s`,
              '--spin': `${(i % 2 ? 1 : -1) * (360 + (i % 4) * 180)}deg`,
              '--drift': `${((i % 7) - 3) * 18}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
