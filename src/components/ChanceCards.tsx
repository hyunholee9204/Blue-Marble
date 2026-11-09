import type { CSSProperties } from 'react';
import type { Action, CardDef, GameState, MapDef } from '../engine/types';
import { cardIcon, cardText, cardTone } from '../engine/engine';

const order = (i: number) => ({ '--i': i }) as CSSProperties;

interface PickProps {
  cards: CardDef[];
  bot: boolean;
  dispatch: (a: Action) => void;
}

/** Face-down spread dealt onto the table; clicking one draws it. */
export function CardPick({ cards, bot, dispatch }: PickProps) {
  return (
    <div className="modal-backdrop">
      <div className="card-table">
        <h2 className="card-table-title">찬스 카드를 한 장 고르세요</h2>
        <div className="card-grid">
          {cards.map((_, i) => (
            <button
              key={i}
              className="chance-card dealing"
              style={order(i)}
              disabled={bot}
              aria-label={`${i + 1}번 카드 뽑기`}
              onClick={() => dispatch({ type: 'PICK_CARD', index: i })}
            >
              <span className="chance-inner">
                <span className="chance-face chance-back">?</span>
              </span>
            </button>
          ))}
        </div>
        <p className="muted card-table-hint">{bot ? '🤖 카드를 고르는 중…' : '마음에 드는 카드를 눌러 뒤집으세요'}</p>
      </div>
    </div>
  );
}

interface RevealProps {
  map: MapDef;
  state: GameState;
  card: CardDef;
  spread?: CardDef[];
  picked?: number;
  bot: boolean;
  dispatch: (a: Action) => void;
}

/** The picked card flips first, then the rest turn over to show what was missed. */
export function CardReveal({ map, state, card, spread, picked, bot, dispatch }: RevealProps) {
  const cards = spread ?? [card];
  const chosen = picked ?? 0;
  const tone = cardTone(card);
  return (
    <div className="modal-backdrop">
      <div className="card-table">
        <div className="card-grid">
          {cards.map((c, i) => (
            <div key={i} className={`chance-card ${i === chosen ? 'picked' : 'other'} tone-${cardTone(c)}`} style={order(i)}>
              <span className="chance-inner">
                <span className="chance-face chance-back">?</span>
                <span className="chance-face chance-front">
                  <span className="chance-icon">{cardIcon(c)}</span>
                  <span className="chance-title">{c.title}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className={`card-detail tone-${tone}`}>
          <span className="card-kicker">{tone === 'good' ? '행운 카드' : tone === 'bad' ? '불운 카드' : '찬스 카드'}</span>
          <h2>
            {cardIcon(card)} {card.title}
          </h2>
          <p>{cardText(map, state, card)}</p>
          <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'ACK' })}>
            {card.effect.kind === 'rollMove' ? '🎲 주사위 굴리기' : card.effect.kind === 'roulette' ? '🎯 룰렛으로' : '확인'} <kbd>Space</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
