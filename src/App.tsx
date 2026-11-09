import { useState } from 'react';
import { createGame } from './engine/engine';
import type { GameState } from './engine/types';
import Game from './components/Game';
import Setup from './components/Setup';

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [gameKey, setGameKey] = useState(0);

  if (!game) {
    return (
      <Setup
        onStart={(mapId, players, options) => {
          setGame(createGame(mapId, players, options));
          setGameKey((k) => k + 1);
        }}
      />
    );
  }
  const rematch = () => {
    setGame(
      createGame(
        game.mapId,
        game.players.map(({ name, color, isBot }) => ({ name, color, isBot })),
        {
          startMoney: game.startMoney,
          stompEnabled: game.stompEnabled,
          doublesAgain: game.doublesAgain,
          premiumEnabled: game.premiumEnabled,
          maxRounds: game.maxRounds,
        },
      ),
    );
    setGameKey((k) => k + 1);
  };
  return <Game key={gameKey} initial={game} onExit={() => setGame(null)} onRematch={rematch} />;
}
