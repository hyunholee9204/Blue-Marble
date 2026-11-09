import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { GameOptions, MapDef, PlayerSetup } from '../engine/types';
import { formatMoney, GAME_LENGTHS, PREMIUM_EVERY_LAPS } from '../engine/engine';
import { getMap, MAPS, UPCOMING_MAPS } from '../maps';
import { themeVars } from '../theme';
import HowToPlay from './HowToPlay';
import MapPreview from './MapPreview';

interface Props {
  onStart: (mapId: string, players: PlayerSetup[], options: GameOptions) => void;
}

const MONEY_PRESETS = [500, 800, 1000, 1500, 2000];
const MIN_MONEY = 100;
const MAX_MONEY = 99999;
const MAX_PLAYERS = 4;
const STORAGE_KEY = 'metro-marble:setup';

interface SetupState {
  mapId: string;
  players: PlayerSetup[];
  moneyText: string;
  stompEnabled: boolean;
  doublesAgain: boolean;
  premiumEnabled: boolean;
  maxRounds: number;
}

const defaultPlayer = (palette: string[], i: number, taken: string[] = []): PlayerSetup => ({
  name: `플레이어 ${i + 1}`,
  color: palette.find((c) => !taken.includes(c)) ?? palette[i],
  isBot: false,
});

const defaults = (): SetupState => ({
  mapId: MAPS[0].id,
  players: [defaultPlayer(MAPS[0].playerColors, 0), defaultPlayer(MAPS[0].playerColors, 1, [MAPS[0].playerColors[0]])],
  moneyText: String(MAPS[0].rules.startMoney),
  stompEnabled: true,
  doublesAgain: true,
  premiumEnabled: true,
  maxRounds: 30,
});

function isPlayer(p: unknown): p is PlayerSetup {
  const v = p as PlayerSetup;
  return !!v && typeof v.name === 'string' && typeof v.color === 'string' && typeof v.isBot === 'boolean';
}

/** Keeps each player's colour if the map's palette has it and nobody else does; otherwise gives a free one. */
function withPaletteColors(players: PlayerSetup[], palette: string[]): PlayerSetup[] {
  const used = new Set<string>();
  return players.map((p) => {
    const color = palette.includes(p.color) && !used.has(p.color) ? p.color : palette.find((c) => !used.has(c))!;
    used.add(color);
    return { ...p, color };
  });
}

/** Last used settings, ignoring anything malformed or out of date. */
function loadSaved(): SetupState {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<SetupState> | null;
    if (!saved || typeof saved !== 'object') return base;
    const players =
      Array.isArray(saved.players) && saved.players.length >= 1 && saved.players.length <= MAX_PLAYERS && saved.players.every(isPlayer)
        ? saved.players.map((p) => ({ ...p, name: p.name.slice(0, 10) }))
        : base.players;
    const mapId = MAPS.some((m) => m.id === saved.mapId) ? saved.mapId! : base.mapId;
    return {
      mapId,
      players: withPaletteColors(players, getMap(mapId).playerColors),
      moneyText: typeof saved.moneyText === 'string' ? saved.moneyText : base.moneyText,
      stompEnabled: typeof saved.stompEnabled === 'boolean' ? saved.stompEnabled : base.stompEnabled,
      doublesAgain: typeof saved.doublesAgain === 'boolean' ? saved.doublesAgain : base.doublesAgain,
      premiumEnabled: typeof saved.premiumEnabled === 'boolean' ? saved.premiumEnabled : base.premiumEnabled,
      maxRounds: GAME_LENGTHS.includes(saved.maxRounds as number) ? (saved.maxRounds as number) : base.maxRounds,
    };
  } catch {
    return base;
  }
}

function parseMoney(text: string): { value: number | null; error: string | null } {
  if (text.trim() === '') return { value: null, error: '시작 자금을 입력해 주세요' };
  const n = Number(text);
  if (!Number.isFinite(n)) return { value: null, error: '숫자만 입력할 수 있어요' };
  if (n < MIN_MONEY || n > MAX_MONEY) {
    return { value: null, error: `${MIN_MONEY.toLocaleString('ko-KR')}만~${MAX_MONEY.toLocaleString('ko-KR')}만 사이로 입력해 주세요` };
  }
  return { value: Math.round(n), error: null };
}

/** A few facts about the map, read from its data. */
function mapFacts(map: MapDef): string[] {
  const special = map.phases[1];
  return [
    // Rails are ridden through, never stopped on, so they don't count as spaces.
    `${map.tiles.filter((t) => t.type !== 'track').length}칸`,
    ...map.lines.filter((l) => l.rail).map((l) => l.name),
    `갈림길 ${map.tiles.filter((t) => t.next.length > 1).length}곳`,
    ...(special ? [special.name] : []),
    ...(map.phases.some((p) => p.bgm) ? ['BGM'] : []),
  ];
}

export default function Setup({ onStart }: Props) {
  const [setup, setSetup] = useState(loadSaved);
  const { mapId, players, moneyText, stompEnabled, doublesAgain, premiumEnabled, maxRounds } = setup;
  const map = getMap(mapId);
  const money = parseMoney(moneyText);
  const startMoney = money.value ?? map.rules.startMoney;
  const cardScale = startMoney / map.rules.startMoney;
  const bots = players.filter((p) => p.isBot).length;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // Settings just won't be remembered.
    }
  }, [setup]);

  const patch = (next: Partial<SetupState>) => setSetup((s) => ({ ...s, ...next }));
  const updatePlayer = (i: number, next: Partial<PlayerSetup>) =>
    setSetup((s) => ({ ...s, players: s.players.map((p, j) => (j === i ? { ...p, ...next } : p)) }));

  const setCount = (count: number) =>
    setSetup((s) => {
      const kept = s.players.slice(0, count);
      while (kept.length < count) kept.push(defaultPlayer(getMap(s.mapId).playerColors, kept.length, kept.map((p) => p.color)));
      return { ...s, players: kept };
    });

  // Colour picker: open for one player at a time; closes on pick, Escape or a click elsewhere.
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  useEffect(() => {
    if (pickerFor === null) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest('.color-pick')) setPickerFor(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [pickerFor]);

  const setAllBots = (isBot: boolean) =>
    setSetup((s) => ({ ...s, players: s.players.map((p, i) => ({ ...p, isBot: i === 0 ? false : isBot })) }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (money.error) return;
    onStart(
      mapId,
      players.map((p, i) => ({ ...p, name: p.name.trim() || `플레이어 ${i + 1}` })),
      { startMoney, stompEnabled, doublesAgain, premiumEnabled, maxRounds },
    );
  };

  return (
    <form className={`app setup map-${map.id}`} style={themeVars(map.phases[0].theme)} onSubmit={submit}>
      <header className="setup-header">
        <h1>메트로 마블</h1>
        <p>갈림길 위의 보드게임 · 한 화면에서 최대 {MAX_PLAYERS}명까지 돌아가며 플레이</p>
      </header>

      <div className="setup-body">
        <div className="left-column">
        <section className="setup-card map-section" aria-labelledby="map-heading">
          <h2 id="map-heading">맵</h2>
          <div className="map-stage">
            <MapPreview map={map} />
            <div className="map-stage-info">
              <strong>
                {map.name} <small>{map.subtitle}</small>
              </strong>
              <p>{map.description}</p>
              <ul className="fact-chips">
                {mapFacts(map).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="map-list" role="radiogroup" aria-label="맵 선택">
            {MAPS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mapId === m.id}
                className={`map-option ${mapId === m.id ? 'selected' : ''}`}
                style={{ '--map-accent': m.phases[0].theme.accent } as CSSProperties}
                onClick={() => setSetup((s) => ({ ...s, mapId: m.id, players: withPaletteColors(s.players, m.playerColors) }))}
              >
                <span className="map-option-text">
                  <strong>{m.name}</strong>
                  <small>{m.subtitle}</small>
                </span>
              </button>
            ))}
          </div>
          {UPCOMING_MAPS.length > 0 && (
          <p className="upcoming">
            <span>곧 추가될 맵</span>
            {UPCOMING_MAPS.map((m) => (
              <span key={m.name} className="upcoming-chip" title={m.description}>
                {m.name}
              </span>
            ))}
          </p>
          )}
        </section>

        <HowToPlay map={map} maxRounds={maxRounds} stompEnabled={stompEnabled} doublesAgain={doublesAgain} premiumEnabled={premiumEnabled} />
        </div>

        <div className="settings-column">
          <section className="setup-card" aria-labelledby="players-heading">
            <div className="card-head">
              <h2 id="players-heading">플레이어</h2>
              <div className="segmented" role="radiogroup" aria-label="인원 수">
                {Array.from({ length: MAX_PLAYERS }, (_, k) => k + 1).map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={players.length === n} className={players.length === n ? 'selected' : ''} onClick={() => setCount(n)}>
                    {n}명
                  </button>
                ))}
              </div>
            </div>
            <ol className="player-list">
              {players.map((p, i) => (
                <li key={i} className="player-line">
                  <span className="color-pick">
                    <button
                      type="button"
                      className="color-dot"
                      style={{ background: p.color }}
                      title="색 고르기"
                      aria-label={`${i + 1}번 플레이어 색 고르기`}
                      aria-expanded={pickerFor === i}
                      onClick={() => setPickerFor(pickerFor === i ? null : i)}
                    >
                      {i + 1}
                    </button>
                    {pickerFor === i && (
                      <span className="color-popover" role="listbox" aria-label={`${i + 1}번 플레이어 색`}>
                        {map.playerColors.map((c) => {
                          const takenBy = players.findIndex((o, j) => j !== i && o.color === c);
                          return (
                            <button
                              key={c}
                              type="button"
                              role="option"
                              aria-selected={p.color === c}
                              disabled={takenBy >= 0}
                              className={`swatch-btn ${p.color === c ? 'selected' : ''}`}
                              style={{ background: c }}
                              title={takenBy >= 0 ? `${takenBy + 1}번 플레이어가 사용 중` : undefined}
                              onClick={() => {
                                updatePlayer(i, { color: c });
                                setPickerFor(null);
                              }}
                            />
                          );
                        })}
                      </span>
                    )}
                  </span>
                  <input
                    value={p.name}
                    maxLength={10}
                    placeholder={`플레이어 ${i + 1}`}
                    aria-label={`${i + 1}번 플레이어 이름`}
                    onChange={(e) => updatePlayer(i, { name: e.target.value })}
                  />
                  <div className="segmented small" role="radiogroup" aria-label={`${i + 1}번 플레이어 조작`}>
                    <button type="button" role="radio" aria-checked={!p.isBot} className={!p.isBot ? 'selected' : ''} onClick={() => updatePlayer(i, { isBot: false })}>
                      사람
                    </button>
                    <button type="button" role="radio" aria-checked={p.isBot} className={p.isBot ? 'selected' : ''} onClick={() => updatePlayer(i, { isBot: true })}>
                      봇
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="card-foot">
              <span className="hint">
                {bots === players.length
                  ? '모두 봇이면 자동으로 진행되는 관전 모드가 됩니다.'
                  : '사람으로 둔 플레이어는 모두 이 화면에서 번갈아 조작합니다.'}
              </span>
              {players.length > 1 && (
                <button type="button" className="link-btn" onClick={() => setAllBots(bots < players.length - 1)}>
                  {bots < players.length - 1 ? '나머지 모두 봇으로' : '모두 사람으로'}
                </button>
              )}
            </div>
          </section>

          <section className="setup-card" aria-labelledby="money-heading">
            <div className="card-head">
              <h2 id="money-heading">시작 자금</h2>
              <span className="muted small">모든 플레이어 동일</span>
            </div>
            <div className="money-row" role="group" aria-label="시작 자금">
              {MONEY_PRESETS.map((n) => (
                <button key={n} type="button" aria-pressed={money.value === n} className={`chip ${money.value === n ? 'selected' : ''}`} onClick={() => patch({ moneyText: String(n) })}>
                  {n.toLocaleString('ko-KR')}만
                </button>
              ))}
              <label className={`money-input ${money.error ? 'invalid' : ''}`}>
                <span className="sr-only">직접 입력 (만 단위)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_MONEY}
                  max={MAX_MONEY}
                  step={50}
                  value={moneyText}
                  aria-invalid={!!money.error}
                  aria-describedby="money-help"
                  onChange={(e) => patch({ moneyText: e.target.value })}
                />
                만
              </label>
            </div>
            <p id="money-help" className={money.error ? 'field-error' : 'hint'}>
              {money.error ??
                (cardScale === 1
                  ? '기본 금액입니다. 찬스 카드 금액이 이 기준으로 나옵니다.'
                  : `찬스 카드 금액이 시작 자금에 맞춰 ×${cardScale.toFixed(2).replace(/\.?0+$/, '')}로 조정됩니다.`)}
            </p>
          </section>

          <section className="setup-card" aria-labelledby="rules-heading">
            <h2 id="rules-heading">게임 규칙</h2>
            <div className="rule-line">
              <span className="rule-text">
                <strong>게임 길이</strong>
                <span>
                  {maxRounds}라운드 · 특수 단계는 늦어도 {maxRounds / 2}라운드에 시작
                </span>
              </span>
              <div className="segmented small" role="radiogroup" aria-label="게임 길이">
                {GAME_LENGTHS.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={maxRounds === n} className={maxRounds === n ? 'selected' : ''} onClick={() => patch({ maxRounds: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <label className="rule-line">
              <span className="rule-text">
                <strong>더블 한 번 더</strong>
                <span>이동할 때 더블이 나오면 한 번 더 굴립니다. 3번 연속이면 막차 놓침 칸으로!</span>
              </span>
              <input type="checkbox" role="switch" className="switch" checked={doublesAgain} onChange={(e) => patch({ doublesAgain: e.target.checked })} />
            </label>
            <label className="rule-line">
              <span className="rule-text">
                <strong>프리미엄 땅</strong>
                <span>{PREMIUM_EVERY_LAPS}바퀴마다 내 땅 하나를 골라 통행료 2배 · 뺏기 불가로 만듭니다.</span>
              </span>
              <input type="checkbox" role="switch" className="switch" checked={premiumEnabled} onChange={(e) => patch({ premiumEnabled: e.target.checked })} />
            </label>
            <label className="rule-line">
              <span className="rule-text">
                <strong>밟기</strong>
                <span>다른 플레이어가 있는 칸에 정확히 멈추면 그 사람의 돈을 조금 뺏습니다.</span>
              </span>
              <input type="checkbox" role="switch" className="switch" checked={stompEnabled} onChange={(e) => patch({ stompEnabled: e.target.checked })} />
            </label>
          </section>
        </div>
      </div>

      <footer className="start-bar">
        <p className="start-summary">
          <strong>{map.name}</strong>
          <span>
            {players.length}명{bots > 0 && ` (봇 ${bots})`}
          </span>
          <span>{formatMoney(startMoney)}</span>
          <span>{maxRounds}라운드</span>
          <span>
            규칙: {[stompEnabled && '밟기', doublesAgain && '더블', premiumEnabled && '프리미엄'].filter(Boolean).join('·') || '기본'}
          </span>
        </p>
        <button type="submit" className="primary start-btn" disabled={!!money.error}>
          게임 시작 <kbd>Enter</kbd>
        </button>
      </footer>
    </form>
  );
}
