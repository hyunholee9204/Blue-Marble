import type { MapDef } from '../engine/types';

/** Static scenery drawn under the tracks (islands, bridges…), styled by className. */
export default function Decor({ map }: { map: MapDef }) {
  if (!map.decor?.length) return null;
  return (
    <g className="decor" aria-hidden="true">
      {map.decor.map((d, i) => {
        switch (d.shape) {
          case 'ellipse':
            return (
              <ellipse
                key={i}
                cx={d.cx}
                cy={d.cy}
                rx={d.rx}
                ry={d.ry}
                transform={d.rotate ? `rotate(${d.rotate} ${d.cx} ${d.cy})` : undefined}
                className={d.className}
              />
            );
          case 'rect':
            return <rect key={i} x={d.x} y={d.y} width={d.width} height={d.height} rx={d.rx} className={d.className} />;
          case 'line':
            return <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} className={d.className} />;
          case 'path':
            return <path key={i} d={d.d} className={d.className} />;
        }
      })}
    </g>
  );
}
