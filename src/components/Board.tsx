import { memo, useMemo, type CSSProperties } from 'react';
import type { GameState, LabelPos, MapDef, TileType } from '../engine/types';
import { computeToll, lineOf, phaseOf, tileIcon, tileName, tileOf } from '../engine/engine';
import Decor from './Decor';

interface Props {
  map: MapDef;
  state: GameState;
  /** Tiles the current player can click (path choice). */
  selectable: string[];
  onSelect: (tileId: string) => void;
  /** Hover or tap on a tile (null when the pointer leaves); anchor is the tile's screen box. */
  onInspect: (tileId: string | null, anchor?: DOMRect) => void;
  /** Changes each time a salary is paid, replaying the start-tile burst. */
  salaryPulse: number | null;
  /** Players whose token plays the squash animation right now. */
  stomped: number[];
  /** Station that just gained a development level; replays its effect when `key` changes. */
  upgraded: { tileId: string; level: number; key: number } | null;
}

/** Where the development badge sits: on the side opposite the name label. */
function badgeOffset(pos: LabelPos): [number, number] {
  const d = STATION_R + 17;
  switch (pos) {
    case 'top':
      return [0, d];
    case 'bottom':
      return [0, -d];
    case 'left':
      return [d + 6, 0];
    case 'right':
      return [-(d + 6), 0];
  }
}

const STATION_R = 28;
const TOKEN_R = 13;
const TOKEN_OFFSETS = [
  [-17, -17],
  [17, -17],
  [-17, 17],
  [17, 17],
];

/** Half-size of each tile shape along x and y, used to place labels clear of it. */
function extent(type: TileType): [number, number] {
  switch (type) {
    case 'start':
      return [52, 34];
    case 'event':
      return [38, 40];
    case 'chance':
      return [32, 32];
    case 'track':
      return [10, 10];
    default:
      return [STATION_R, STATION_R];
  }
}

function labelLayout(pos: LabelPos, type: TileType) {
  const [hx, hy] = extent(type);
  const gap = 16; // clears the owner ring
  switch (pos) {
    case 'top':
      return { x: 0, y: -(hy + gap), anchor: 'middle' as const };
    case 'bottom':
      return { x: 0, y: hy + gap + 13, anchor: 'middle' as const };
    case 'left':
      return { x: -(hx + gap), y: 6, anchor: 'end' as const };
    case 'right':
      return { x: hx + gap, y: 6, anchor: 'start' as const };
  }
}

function Board({ map, state, selectable, onSelect, onInspect, salaryPulse, stomped, upgraded }: Props) {
  // Tracks only change with the phase, so they are built once per phase rather than every step.
  const altColors = phaseOf(map, state).altNames;
  const edges = useMemo(
    () =>
      map.tiles.flatMap((from) =>
        from.next.map((toId) => {
          const to = tileOf(map, toId);
          const lineId = from.line === to.line ? from.line : from.next.length > 1 ? to.line : from.line;
          const line = map.lines.find((l) => l.id === lineId)!;
          return (
            <polyline
              key={`${from.id}-${toId}`}
              points={`${from.x},${from.y} ${(from.x + to.x) / 2},${(from.y + to.y) / 2} ${to.x},${to.y}`}
              className={`edge ${line.dashed ? 'dashed' : ''} ${line.rail ? 'rail' : ''}`}
              style={{ stroke: altColors ? line.altColor : line.color }}
              markerMid="url(#arrow)"
            />
          );
        }),
      ),
    [map, altColors],
  );

  const playersByTile = new Map<string, number[]>();
  for (const p of state.players) {
    if (p.bankrupt) continue;
    playersByTile.set(p.position, [...(playersByTile.get(p.position) ?? []), p.id]);
  }

  return (
    <svg
      className="board"
      viewBox={`0 0 ${map.viewBox.width} ${map.viewBox.height}`}
      style={{ '--board-ratio': `${map.viewBox.width} / ${map.viewBox.height}` } as CSSProperties}
      role="img"
      aria-label="게임 보드"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M2,1.5 L7.5,5 L2,8.5" className="arrow-path" />
        </marker>
      </defs>

      <Decor map={map} />
      <g className="edges">{edges}</g>

      <g className="tiles">
        {map.tiles.map((tile) => {
          const own = state.owners[tile.id];
          const infected = state.infected.includes(tile.id);
          const canSelect = selectable.includes(tile.id);
          const color = lineOf(map, state, tile.line).color;
          const icon = tileIcon(map, state, tile);
          const label = labelLayout(tile.label ?? 'bottom', tile.type);
          const [hx, hy] = extent(tile.type);
          const ownerColor = own ? state.players[own.owner].color : undefined;
          return (
            <g
              key={tile.id}
              className={`tile tile-${tile.type} ${canSelect ? 'selectable' : ''} ${infected ? 'infected' : ''}`}
              transform={`translate(${tile.x} ${tile.y})`}
              onClick={(e) => (canSelect ? onSelect(tile.id) : onInspect(tile.id, e.currentTarget.getBoundingClientRect()))}
              onMouseEnter={(e) => onInspect(tile.id, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => onInspect(null)}
            >
              {infected && <circle r={Math.max(hx, hy) + 12} className="infection-halo" />}
              {canSelect && <circle r={Math.max(hx, hy) + 10} className="select-ring" />}
              {own?.premium && <circle r={STATION_R + 14} className="premium-ring" />}
              {ownerColor && <circle r={STATION_R + 8} className="owner-ring" style={{ stroke: ownerColor }} />}
              {upgraded?.tileId === tile.id && (
                <g key={upgraded.key} className="upgrade-fx" style={{ color: ownerColor }}>
                  <circle r={STATION_R} className="upgrade-burst" />
                  <circle r={STATION_R} className="upgrade-burst late" />
                </g>
              )}

              {tile.type === 'track' && <circle r={9} className="track-node" style={{ stroke: color }} />}
              {tile.type === 'station' && (
                <>
                  <circle
                    r={STATION_R}
                    className="station"
                    style={{
                      stroke: color,
                      fill: ownerColor ? `color-mix(in srgb, ${ownerColor} 22%, var(--tile))` : undefined,
                    }}
                  />
                  {/* Empty land shows its price; owned land shows what landing on it costs right now. */}
                  {(() => {
                    const value = own ? computeToll(map, state, tile.id) : (tile.price ?? 0);
                    return (
                      <text className={`${own ? 'station-toll' : 'station-price'} ${value >= 1000 ? 'long' : ''}`} dy={own && value >= 1000 ? 4 : 5}>
                        {value}
                      </text>
                    );
                  })()}
                </>
              )}
              {tile.type === 'start' && (
                <>
                  {salaryPulse !== null && (
                    <g key={salaryPulse}>
                      <circle r={hx} className="salary-burst" />
                      <text className="salary-float" y={-hy - 10}>
                        +{state.lastSalary?.amount ?? map.rules.salary}
                      </text>
                    </g>
                  )}
                  <rect x={-hx} y={-hy} width={hx * 2} height={hy * 2} rx={14} className="start-box" />
                  <text className="tile-icon" dy={-2}>
                    {icon}
                  </text>
                  <text className="start-label" dy={22}>
                    START
                  </text>
                </>
              )}
              {tile.type === 'chance' && (
                <>
                  <rect x={-22} y={-22} width={44} height={44} rx={8} transform="rotate(45)" className="special chance" style={{ stroke: color }} />
                  <text className="tile-icon" dy={8}>
                    {icon}
                  </text>
                </>
              )}
              {(tile.type === 'missed-train' || tile.type === 'fare-check' || tile.type === 'rest') && (
                <>
                  <rect x={-hx} y={-hy} width={hx * 2} height={hy * 2} rx={12} className={`special ${tile.type}`} style={{ stroke: color }} />
                  <text className="tile-icon" dy={8}>
                    {icon}
                  </text>
                </>
              )}
              {tile.type === 'event' && (
                <>
                  <polygon points="0,-40 35,-20 35,20 0,40 -35,20 -35,-20" className="special event" />
                  <text className="tile-icon big" dy={11}>
                    {icon}
                  </text>
                </>
              )}

              {own?.premium && (
                <g className="premium-gem" transform={`translate(${-hx + 2} ${-hy + 2})`}>
                  <circle r={12} />
                  <text dy={5}>💎</text>
                </g>
              )}
              {tile.next.length > 1 && (
                <g className="junction-badge" transform={`translate(${hx - 4} ${-hy + 4})`}>
                  <circle r={11} />
                  <text dy={5}>⑂</text>
                </g>
              )}

              {tile.type !== 'track' && (
                <text className="tile-name" x={label.x} y={label.y} style={{ textAnchor: label.anchor }}>
                  {tileName(map, state, tile)}
                </text>
              )}
            </g>
          );
        })}
      </g>

      <g className="tokens">
        {[...playersByTile.entries()].flatMap(([tileId, ids]) => {
          const tile = tileOf(map, tileId);
          return ids.map((id, i) => {
            const p = state.players[id];
            const [ox, oy] = ids.length === 1 ? [0, 0] : TOKEN_OFFSETS[i];
            const active = id === state.current;
            return (
              <g
                key={id}
                className={`token ${active ? 'active' : ''} ${stomped.includes(id) ? 'stomped' : ''}`}
                style={{ transform: `translate(${tile.x + ox}px, ${tile.y + oy}px)` }}
              >
                {active && <circle r={TOKEN_R + 5} className="token-pulse" style={{ stroke: p.color }} />}
                <circle r={TOKEN_R} style={{ fill: p.color }} className="token-body" />
                <text dy={5} className="token-label">
                  {id + 1}
                </text>
              </g>
            );
          });
        })}
      </g>

      {/* Drawn above the tokens so a player standing on the tile never hides the level. */}
      <g className="level-badges">
        {Object.entries(state.owners).map(([tileId, own]) => {
          if (own.level <= 0) return null;
          const tile = tileOf(map, tileId);
          const [bx, by] = badgeOffset(tile.label ?? 'bottom');
          const isNew = upgraded?.tileId === tileId;
          return (
            <g key={tileId} transform={`translate(${tile.x + bx} ${tile.y + by})`}>
              <g key={`${own.level}-${isNew ? upgraded.key : 0}`} className={`level-badge ${isNew ? 'fresh' : ''}`}>
                <rect x={-25} y={-14} width={50} height={28} rx={14} style={{ fill: state.players[own.owner].color }} />
                <text className="level-icon" x={-8} dy={6}>
                  {map.terms.levelIcons[own.level - 1]}
                </text>
                <text className="level-num" x={13} dy={5}>
                  {own.level}
                </text>
                {isNew && (
                  <text className="upgrade-float" y={-24}>
                    Lv.{own.level}!
                  </text>
                )}
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default memo(Board);
