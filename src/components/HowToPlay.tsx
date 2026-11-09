import { useState, type ReactNode } from 'react';
import type { MapDef } from '../engine/types';
import { formatMoney, GAME_LENGTHS, PREMIUM_EVERY_LAPS, PREMIUM_MULTIPLIER } from '../engine/engine';

interface Props {
  map: MapDef;
  maxRounds: number;
  stompEnabled: boolean;
  doublesAgain: boolean;
  premiumEnabled: boolean;
}

const TABS = ['기본 진행', '땅과 통행료', '특별한 칸', '추가 규칙', '승리 조건'] as const;
type Tab = (typeof TABS)[number];

/** Subject particle for a Korean word: 이 after a final consonant, 가 otherwise. */
const subject = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? '이' : '가';
};

/** Short rules for the selected map, worded with its own names and the current settings. */
export default function HowToPlay({ map, maxRounds, stompEnabled, doublesAgain, premiumEnabled }: Props) {
  const [tab, setTab] = useState<Tab>('기본 진행');
  const { property, develop, group } = map.terms;
  const base = map.phases[0];
  const special = map.phases[1];
  const trigger = map.phaseTriggers[0];
  const triggerTile = trigger && map.tiles.find((t) => t.id === trigger.tileId);
  // Same scaling the engine uses: the map's fallback round, stretched to the chosen game length.
  const fallbackRound = Math.round(((trigger?.fallbackRound ?? map.rules.maxRounds / 2) * maxRounds) / map.rules.maxRounds);
  const tileName = (type: string) => map.tiles.find((t) => t.type === type)?.name;
  // Ride rail (roller coaster, lava chute): who boards it, and where it drops riders off.
  const isTrack = (id: string) => map.tiles.find((t) => t.id === id)?.type === 'track';
  const railEntry = map.tiles.find((t) => t.type !== 'track' && t.next.some(isTrack));
  const railLine = railEntry && map.lines.find((l) => l.id === map.tiles.find((t) => t.id === railEntry.next.find(isTrack))?.line);
  const railExit = map.tiles.find((t) => t.type === 'track' && t.next.some((n) => !isTrack(n)));
  const railLanding = railExit && map.tiles.find((t) => t.id === railExit.next[0]);
  const railText =
    railEntry && railLine
      ? railEntry.next.length > 1
        ? `${railLine.name}: ${railEntry.name}에 정확히 멈추면 탈 수 있고, 레일 위에서는 주사위 칸 수를 쓰지 않습니다.`
        : `${railLine.name}: ${railEntry.name}을(를) 지나면 ${railLanding?.name ?? ''}까지 단숨에 내려갑니다. 레일 위에서는 주사위 칸 수를 쓰지 않습니다.`
      : null;
  const junctions = map.tiles.filter((t) => t.next.length > 1).map((t) => t.name);
  const on = (v: boolean) => <span className={`rule-state ${v ? 'on' : 'off'}`}>{v ? 'ON' : 'OFF'}</span>;

  const content: Record<Tab, ReactNode[]> = {
    '기본 진행': [
      '주사위 2개를 굴려 나온 수만큼 화살표 방향으로 이동합니다.',
      `출발점을 지나면 월급 ${formatMoney(map.rules.salary)}, 주사위로 딱 맞게 멈추면 ${map.rules.exactStartBonus}배를 받습니다.`,
      `갈림길(⑂ ${junctions.join(', ')})에 정확히 멈춘 사람만 다음 차례에 방향을 고를 수 있어요.`,
      `게임 길이는 오른쪽 게임 규칙에서 ${GAME_LENGTHS.join('/')}라운드 중에 고를 수 있고, 마지막 라운드가 끝나면 게임이 끝납니다(지금 설정: ${maxRounds}라운드).`,
    ],
    '땅과 통행료': [
      `빈 ${property}에 멈추면 살 수 있고, 내 ${property}에 다시 멈추면 ${develop}을(를) 할 수 있습니다(최대 3단계).`,
      `남의 ${property}에 멈추면 통행료를 냅니다. 가격의 절반에서 시작해 단계가 오를수록 커져요. 보드 위 빨간 숫자가 현재 통행료입니다.`,
      `같은 ${group}의 ${property}을(를) 모두 가지면 통행료가 ${map.rules.lineMonopolyMultiplier}배가 됩니다.`,
      `통행료 대신 뺏기에 도전할 수 있습니다. 더블이 나오면 빼앗고, 실패하면 통행료를 ${map.rules.stealFailMultiplier}배로 냅니다.`,
    ],
    '특별한 칸': [
      '찬스: 카드 10장 중 1장을 골라 뒤집습니다. 큰돈을 벌 수도, 땅을 잃을 수도 있어요.',
      `${tileName('fare-check')}: 멈추면 ${formatMoney(base.fareCheckAmount)}을 냅니다.`,
      `${tileName('missed-train')}: ${base.missedTrainTurns}턴 동안 발이 묶이고, 더블이 나오면 바로 탈출합니다.`,
      ...(railText ? [railText] : []),
      ...(special && triggerTile
        ? [
            `${triggerTile.name}: 누군가 멈추면(늦어도 ${fallbackRound}라운드) ${special.name} 단계가 시작됩니다. 통행료가 ${special.tollMultiplier}배로 ${
              special.infection ? `오르고, '${special.infection.label}'${subject(special.infection.label)} 매 라운드 넓어집니다.` : '오릅니다.'
            }`,
          ]
        : []),
    ],
    '추가 규칙': [
      <>
        밟기 {on(stompEnabled)} 다른 플레이어가 있는 칸에 정확히 멈추면 그 사람의 돈을 조금 뺏습니다.
      </>,
      <>
        더블 한 번 더 {on(doublesAgain)} 이동할 때 더블이 나오면 한 번 더 굴립니다. 3번 연속이면 {tileName('missed-train')}(으)로 갑니다.
      </>,
      <>
        프리미엄 땅 {on(premiumEnabled)} {PREMIUM_EVERY_LAPS}바퀴마다 내 {property} 하나를 골라 통행료 {PREMIUM_MULTIPLIER}배, 뺏기 불가로 만듭니다.
      </>,
    ],
    '승리 조건': [
      '게임 중에는 순위가 공개되지 않습니다. 끝나면 꼴찌부터 한 명씩 발표해요.',
      `총자산(현금 + ${property} 가격 + ${develop}에 쓴 돈)이 가장 많은 사람이 승리합니다.`,
      '돈이 모자라면 땅을 급매하고, 그래도 부족하면 파산해 탈락합니다. 혼자 남으면 바로 승리예요.',
    ],
  };

  return (
    <section className="setup-card how-to" aria-labelledby="howto-heading">
      <h2 id="howto-heading">게임 방법</h2>
      <div className="howto-tabs" role="tablist" aria-label="게임 방법">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <ul className="howto-list" role="tabpanel">
        {content[tab].map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
