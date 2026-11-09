import type { Action, GameState, MapDef } from '../engine/types';
import { formatMoney, tileName, tileOf } from '../engine/engine';
import { CardPick, CardReveal } from './ChanceCards';
import GameOver from './GameOver';
import Roulette from './Roulette';

interface Props {
  map: MapDef;
  state: GameState;
  dispatch: (a: Action) => void;
  onExit: () => void;
  onRematch: () => void;
}

export default function Modals({ map, state, dispatch, onExit, onRematch }: Props) {
  const st = state.status;
  const bot = state.players[state.current].isBot;

  if (st.kind === 'toll-offer') {
    const payer = state.players[state.current];
    const owner = state.players[st.owner];
    const tile = tileOf(map, st.tileId);
    const level = state.owners[st.tileId]?.level ?? 0;
    const fine = st.toll * map.rules.stealFailMultiplier;
    return (
      <div className="modal-backdrop">
        <div className="modal toll-modal" style={{ borderColor: owner.color }}>
          <span className="card-kicker" style={{ color: owner.color }}>
            {owner.name}의 {map.terms.property}
          </span>
          <h2>
            {tileName(map, state, tile)} {level > 0 && <small>{'★'.repeat(level)}</small>}
          </h2>
          <p className="toll-amount">
            통행료 <strong>{formatMoney(st.toll)}</strong>
          </p>
          <p className="muted small">
            {payer.name} 보유 {formatMoney(payer.money)}
          </p>
          <div className="toll-actions">
            <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'PAY_TOLL' })}>
              💸 통행료 내기
            </button>
            {state.owners[st.tileId]?.premium ? (
              <p className="premium-note">💎 프리미엄 {map.terms.property}이라 뺏을 수 없습니다</p>
            ) : (
            <button className="steal-btn" disabled={bot} onClick={() => dispatch({ type: 'STEAL' })}>
              🎲 뺏기 도전
              <small>더블이면 {map.terms.property}을(를) 빼앗음 · 실패하면 {formatMoney(fine)} (×{map.rules.stealFailMultiplier})</small>
            </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (st.kind === 'steal-result') {
    const owner = state.players[st.owner];
    const name = tileName(map, state, tileOf(map, st.tileId));
    return (
      <div className="modal-backdrop">
        <div className={`modal steal-modal ${st.success ? 'success' : 'fail'}`}>
          <span className="phase-emoji">{st.success ? '🏴' : '💥'}</span>
          <h2>{st.success ? '탈취 성공!' : '뺏기 실패…'}</h2>
          <p>
            {st.success
              ? `더블! ${owner.name}의 ${name}이(가) 이제 내 ${map.terms.property}입니다. 통행료도 내지 않습니다.`
              : `더블이 나오지 않았습니다. ${owner.name}에게 ${formatMoney(st.paid)}을(를) 냈습니다.`}
          </p>
          <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'ACK' })}>
            확인 <kbd>Space</kbd>
          </button>
        </div>
      </div>
    );
  }

  if (st.kind === 'card-pick') {
    return <CardPick cards={st.cards} bot={bot} dispatch={dispatch} />;
  }

  if (st.kind === 'card') {
    return <CardReveal map={map} state={state} card={st.card} spread={st.spread} picked={st.picked} bot={bot} dispatch={dispatch} />;
  }

  if (st.kind === 'roulette') {
    return <Roulette map={map} state={state} title={st.title} options={st.options} result={st.result} bot={bot} dispatch={dispatch} />;
  }

  if (st.kind === 'phase-intro') {
    const phase = map.phases.find((p) => p.id === st.phaseId);
    return (
      <div className="modal-backdrop">
        <div className="modal phase-modal">
          <span className="phase-emoji">{phase?.badge}</span>
          <h2>{phase?.intro?.title ?? phase?.name}</h2>
          <p className="pre">{phase?.intro?.text}</p>
          <button className="primary" disabled={bot} onClick={() => dispatch({ type: 'ACK' })}>
            {phase?.intro?.button ?? '확인'} <kbd>Space</kbd>
          </button>
        </div>
      </div>
    );
  }

  if (st.kind === 'game-over') {
    return <GameOver map={map} state={state} winner={st.winner} reason={st.reason} onExit={onExit} onRematch={onRematch} />;
  }

  return null;
}
