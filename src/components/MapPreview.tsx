import type { MapDef } from '../engine/types';
import Decor from './Decor';

/** Label-free miniature of a map's route, coloured by line. */
export default function MapPreview({ map }: { map: MapDef }) {
  const byId = new Map(map.tiles.map((t) => [t.id, t]));
  const lineOf = (id: string) => map.lines.find((l) => l.id === id);
  return (
    <svg className="map-preview" viewBox={`0 0 ${map.viewBox.width} ${map.viewBox.height}`} role="img" aria-label={`${map.name} 노선 미리보기`}>
      <Decor map={map} />
      {map.tiles.flatMap((from) =>
        from.next.map((toId) => {
          const to = byId.get(toId);
          if (!to) return null;
          const lineId = from.line === to.line ? from.line : from.next.length > 1 ? to.line : from.line;
          const line = lineOf(lineId);
          return (
            <line
              key={`${from.id}-${toId}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={line?.color}
              strokeWidth={16}
              strokeLinecap="round"
              strokeDasharray={line?.dashed ? '22 16' : undefined}
            />
          );
        }),
      )}
      {map.tiles.map((t) => {
        const color = lineOf(t.line)?.color;
        if (t.type === 'start') return <rect key={t.id} x={t.x - 36} y={t.y - 24} width={72} height={48} rx={12} className="preview-start" />;
        if (t.type === 'event') return <circle key={t.id} cx={t.x} cy={t.y} r={30} className="preview-event" />;
        return <circle key={t.id} cx={t.x} cy={t.y} r={t.type === 'station' ? 20 : t.type === 'track' ? 9 : 15} className="preview-tile" stroke={color} />;
      })}
    </svg>
  );
}
