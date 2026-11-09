import { useEffect, useState, type CSSProperties } from 'react';
import type { Action, GameState, MapDef } from '../engine/types';
import { tileName, tileOf } from '../engine/engine';

const SIZE = 340;
const R = SIZE / 2 - 6;
const SPIN_MS = 4200;

interface Props {
  map: MapDef;
  state: GameState;
  title: string;
  options: string[];
  result?: number;
  bot: boolean;
  dispatch: (a: Action) => void;
}

const point = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [SIZE / 2 + r * Math.sin(a), SIZE / 2 - r * Math.cos(a)];
};

/** Air-raid wheel: every opponent property gets an equal slice; the one under the pointer is destroyed. */
export default function Roulette({ map, state, title, options, result, bot, dispatch }: Props) {
  const seg = 360 / options.length;
  const [angle, setAngle] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (result === undefined) return;
    // Several full turns, then stop with the winning slice's centre under the pointer at the top.
    const raf = requestAnimationFrame(() => setAngle(360 * 6 - (result + 0.5) * seg));
    const t = setTimeout(() => setDone(true), SPIN_MS + 200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [result, seg]);

  const owner = (id: string) => state.players[state.owners[id]?.owner ?? 0];
  const name = (id: string) => tileName(map, state, tileOf(map, id));
  const fontSize = options.length <= 8 ? 14 : options.length <= 16 ? 12 : 10;
  const hit = result !== undefined ? options[result] : undefined;

  return (
    <div className="modal-backdrop">
      <div className="modal roulette-modal">
        <span className="card-kicker">찬스 카드</span>
        <h2>🎯 {title}</h2>
        <p className="muted">
          다른 플레이어의 {map.terms.property} {options.length}곳이 룰렛에 올라갔습니다. 나온 {map.terms.property}은(는) 지도에서 사라집니다.
        </p>
        <div className="roulette">
          <span className="roulette-pointer" aria-hidden="true" />
          <div
            className="roulette-wheel"
            style={{ transform: `rotate(${angle}deg)`, transitionDuration: `${SPIN_MS}ms` } as CSSProperties}
          >
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="공습 룰렛">
              {options.map((id, i) => {
                const a0 = i * seg;
                const a1 = (i + 1) * seg;
                const [x0, y0] = point(a0, R);
                const [x1, y1] = point(a1, R);
                const mid = a0 + seg / 2;
                const [tx, ty] = point(mid, R * 0.62);
                const d =
                  options.length === 1
                    ? `M ${SIZE / 2} ${SIZE / 2 - R} A ${R} ${R} 0 1 1 ${SIZE / 2 - 0.01} ${SIZE / 2 - R} Z`
                    : `M ${SIZE / 2} ${SIZE / 2} L ${x0} ${y0} A ${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
                return (
                  <g key={id} className={done && id === hit ? 'roulette-hit' : undefined}>
                    <path d={d} style={{ fill: owner(id).color }} className={`roulette-slice ${i % 2 ? 'odd' : ''}`} />
                    <text
                      x={tx}
                      y={ty}
                      className="roulette-label"
                      style={{ fontSize }}
                      // Radial labels, flipped on the left half so they never read upside down.
                      transform={`rotate(${mid <= 180 ? mid - 90 : mid + 90} ${tx} ${ty})`}
                    >
                      {name(id)}
                    </text>
                  </g>
                );
              })}
              <circle cx={SIZE / 2} cy={SIZE / 2} r={22} className="roulette-hub" />
            </svg>
          </div>
        </div>
        {done && hit ? (
          <>
            <p className="roulette-result">
              💥 <strong style={{ color: owner(hit).color }}>{owner(hit).name}</strong>의 <strong>{name(hit)}</strong>이(가) 파괴됩니다!
            </p>
            <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'ACK' })}>
              확인
            </button>
          </>
        ) : (
          <button className="primary" disabled={bot || result !== undefined} onClick={() => dispatch({ type: 'SPIN' })}>
            {result !== undefined ? '돌아가는 중…' : bot ? '🤖 룰렛을 돌리는 중…' : '🎯 룰렛 돌리기'} {result === undefined && !bot && <kbd>Space</kbd>}
          </button>
        )}
      </div>
    </div>
  );
}
