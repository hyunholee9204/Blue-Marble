import type { CSSProperties } from 'react';

/** Pip cells (0–8 in a 3×3 grid) for each face value. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Where each face sits on the cube. */
const FACE_TRANSFORM: Record<number, string> = {
  1: 'rotateY(0deg)',
  6: 'rotateY(180deg)',
  2: 'rotateY(90deg)',
  5: 'rotateY(-90deg)',
  3: 'rotateX(90deg)',
  4: 'rotateX(-90deg)',
};

/** Cube rotation [x, y] that brings each value to the front. */
const SHOW: Record<number, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  2: [0, -90],
  5: [0, 90],
  3: [-90, 0],
  4: [90, 0],
};

interface Props {
  value: number;
  rolling: boolean;
  /** Changes on every roll so the tumble animation restarts. */
  rollSeq: number;
  variant: 0 | 1;
}

export default function Die({ value, rolling, rollSeq, variant }: Props) {
  const [rx, ry] = SHOW[value];
  const style = {
    '--rx': `${rx}deg`,
    '--ry': `${ry}deg`,
  } as CSSProperties;
  return (
    <div key={rollSeq} className={`die-wrap v${variant} ${rolling ? 'rolling' : ''}`}>
      <div className="die" style={style}>
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <div key={face} className="face" style={{ transform: `${FACE_TRANSFORM[face]} translateZ(var(--half))` }}>
            {Array.from({ length: 9 }, (_, cell) => (
              <span key={cell} className={PIPS[face].includes(cell) ? `pip ${face === 1 ? 'red' : ''}` : ''} />
            ))}
          </div>
        ))}
      </div>
      <div className="die-shadow" />
    </div>
  );
}
