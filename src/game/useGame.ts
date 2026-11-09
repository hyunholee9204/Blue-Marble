import { useEffect, useReducer, useState } from 'react';
import { computeToll, getMapFor, premiumCandidates, propertyValue, reduce, swapCandidates, tileOf } from '../engine/engine';
import type { Action, GameState } from '../engine/types';

const STEP_MS = 220;
const EXPRESS_STEP_MS = 90;
export const ROLL_MS = 1100;

export function useGame(initial: GameState) {
  const [state, dispatch] = useReducer(reduce, initial);

  // Dice animation: the roll is "in the air" until settledSeq catches up with rollSeq.
  const [settledSeq, setSettledSeq] = useState(initial.rollSeq);
  const rolling = state.rollSeq !== settledSeq;
  useEffect(() => {
    if (!rolling) return;
    const t = setTimeout(() => setSettledSeq(state.rollSeq), ROLL_MS);
    return () => clearTimeout(t);
  }, [rolling, state.rollSeq]);

  // Token movement: one tile per tick until the engine stops at a decision.
  useEffect(() => {
    if (rolling || state.status.kind !== 'moving') return;
    const t = setTimeout(() => dispatch({ type: 'STEP' }), state.status.express ? EXPRESS_STEP_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [state, rolling]);

  // Bots: pick an action for the current player after a short pause.
  useEffect(() => {
    const player = state.players[state.current];
    if (!player.isBot || rolling) return;
    const st = state.status;
    let action: Action | null = null;
    let delay = 700;
    switch (st.kind) {
      case 'await-roll':
        action = player.premiumTokens > 0 && premiumCandidates(state, player.id).length > 0 ? { type: 'START_PREMIUM' } : { type: 'ROLL' };
        break;
      case 'premium-pick': {
        // Bots make their highest-toll property premium.
        const map = getMapFor(state);
        const best = premiumCandidates(state, player.id).sort((a, b) => computeToll(map, state, b) - computeToll(map, state, a))[0];
        action = best ? { type: 'SET_PREMIUM', tileId: best } : { type: 'CANCEL_PREMIUM' };
        break;
      }
      case 'swap-pick': {
        // Bots give away their cheapest property for the most valuable one on offer.
        const map = getMapFor(state);
        const worth = (id: string) => propertyValue(map, tileOf(map, id), state.owners[id].level);
        const { mine, theirs } = swapCandidates(state, player.id);
        const target = st.mine ? theirs.sort((a, b) => worth(b) - worth(a))[0] : mine.sort((a, b) => worth(a) - worth(b))[0];
        action = st.mine ? { type: 'SWAP_THEIRS', tileId: target } : { type: 'SWAP_MINE', tileId: target };
        delay = 1000;
        break;
      }
      case 'tile-pick': {
        // Upgrade or knock down the highest-toll option; give up the least valuable one.
        const map = getMapFor(state);
        const toll = (id: string) => computeToll(map, state, id);
        const worth = (id: string) => propertyValue(map, tileOf(map, id), state.owners[id].level);
        const sorted = [...st.options].sort((a, b) => (st.purpose === 'forfeit' ? worth(a) - worth(b) : toll(b) - toll(a)));
        action = { type: 'PICK_TILE', tileId: sorted[0] };
        delay = 1000;
        break;
      }
      case 'roulette':
        // Spin, then wait for the wheel to stop before confirming.
        action = st.result === undefined ? { type: 'SPIN' } : { type: 'ACK' };
        delay = st.result === undefined ? 1200 : 6000;
        break;
      case 'choose-path':
        action = { type: 'CHOOSE_PATH', tileId: st.options[Math.floor(Math.random() * st.options.length)] };
        break;
      case 'buy-offer':
        action = player.money - st.price >= 150 ? { type: 'BUY' } : { type: 'DECLINE' };
        break;
      case 'upgrade-offer':
        action = player.money - st.cost >= 250 ? { type: 'UPGRADE' } : { type: 'DECLINE' };
        break;
      case 'toll-offer': {
        // Gamble only on undeveloped stations, and only with cash to survive a failed attempt.
        const level = state.owners[st.tileId]?.level ?? 0;
        const premium = state.owners[st.tileId]?.premium;
        const gamble = !premium && level === 0 && player.money >= st.toll * 3 && Math.random() < 0.5;
        action = gamble ? { type: 'STEAL' } : { type: 'PAY_TOLL' };
        delay = 1300;
        break;
      }
      case 'card-pick':
        action = { type: 'PICK_CARD', index: Math.floor(Math.random() * st.cards.length) };
        delay = 1400;
        break;
      case 'card':
      case 'steal-result':
        action = { type: 'ACK' };
        delay = 1400;
        break;
      case 'phase-intro':
        action = { type: 'ACK' };
        delay = 3000;
        break;
      case 'turn-end':
        action = { type: 'END_TURN' };
        delay = 600;
        break;
      case 'moving':
      case 'game-over':
        break;
    }
    if (!action) return;
    const a = action;
    const t = setTimeout(() => dispatch(a), delay);
    return () => clearTimeout(t);
  }, [state, rolling]);

  return { state, dispatch, rolling };
}
