import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LogOut,
  ArrowRight,
  Shield,
  Volume2,
  VolumeX,
  Play,
  UserPlus,
  Compass,
  AlertOctagon,
  Scroll
} from 'lucide-react';
import { Card, CardColor, GameState, Player } from '../types';
import { CardItem } from './CardItem';
import { useSound } from '../hooks/useSound';

interface GameTableProps {
  gameState: GameState;
  playerId: string;
  onSendMessage: (msg: any) => void;
  onLeave: () => void;
}

// Background colors corresponding to card colors
const colorThemes: Record<CardColor, { bg: string; text: string; shadow: string; border: string }> = {
  red: {
    bg: 'bg-red-500',
    text: 'text-red-400',
    shadow: 'shadow-red-500/50',
    border: 'border-red-500'
  },
  blue: {
    bg: 'bg-blue-500',
    text: 'text-blue-400',
    shadow: 'shadow-blue-500/50',
    border: 'border-blue-500'
  },
  green: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-400',
    shadow: 'shadow-emerald-500/50',
    border: 'border-emerald-500'
  },
  yellow: {
    bg: 'bg-yellow-400',
    text: 'text-yellow-400',
    shadow: 'shadow-yellow-400/50',
    border: 'border-yellow-400'
  },
  wild: {
    bg: 'bg-slate-700',
    text: 'text-slate-400',
    shadow: 'shadow-slate-500/20',
    border: 'border-slate-500'
  }
};

export const GameTable: React.FC<GameTableProps> = ({
  gameState,
  playerId,
  onSendMessage,
  onLeave
}) => {
  const { playSound } = useSound();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedWildCard, setSelectedWildCard] = useState<Card | null>(null);
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Play sound on log changes
  useEffect(() => {
    if (!soundEnabled || gameState.logs.length === 0) return;
    const latestLog = gameState.logs[gameState.logs.length - 1];
    playSound(latestLog.type);
  }, [gameState.logs.length]);

  // Keep logs scrolled down
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.logs, isLogDrawerOpen]);

  // Determine local player
  const self = gameState.players.find(p => p.id === playerId);
  const isMyTurn = gameState.currentTurn === playerId;
  const isLobby = gameState.status === 'lobby';
  const isEnded = gameState.status === 'ended';

  const hostPlayer = gameState.players.find(p => p.isHost);
  const isHost = self?.isHost;

  // Arrange other players circular layout starting from self at bottom
  const getOrderedOpponents = (): Player[] => {
    const myIndex = gameState.players.findIndex(p => p.id === playerId);
    if (myIndex === -1) return gameState.players;

    const ordered: Player[] = [];
    const len = gameState.players.length;
    // Add players after me
    for (let i = 1; i < len; i++) {
      ordered.push(gameState.players[(myIndex + i) % len]);
    }
    return ordered;
  };

  const opponents = getOrderedOpponents();

  // Helper to determine position classes for opponents circularly
  const getOpponentPositionClass = (index: number, total: number) => {
    if (total === 1) {
      return 'top-4 left-1/2 transform -translate-x-1/2';
    }
    if (total === 2) {
      if (index === 0) return 'top-4 left-12 sm:left-24';
      return 'top-4 right-12 sm:right-24';
    }
    if (total === 3) {
      if (index === 0) return 'top-1/3 left-4 transform -translate-y-1/2';
      if (index === 1) return 'top-4 left-1/2 transform -translate-x-1/2';
      return 'top-1/3 right-4 transform -translate-y-1/2';
    }
    // Default up to 10 players beautifully arranged on the top header rails
    const columns = ['left-4 sm:left-12 top-1/4', 'left-1/4 top-4', 'left-1/2 -translate-x-1/2 top-4', 'right-1/4 top-4', 'right-4 sm:right-12 top-1/4'];
    return columns[index % columns.length];
  };

  const handlePlayCard = (card: Card) => {
    if (!isMyTurn) return;
    if (card.color === 'wild') {
      setSelectedWildCard(card);
    } else {
      onSendMessage({ type: 'play-card', cardId: card.id });
    }
  };

  const handleSelectWildColor = (color: CardColor) => {
    if (selectedWildCard) {
      onSendMessage({ type: 'play-card', cardId: selectedWildCard.id, wildColor: color });
      setSelectedWildCard(null);
    }
  };

  const handleDrawCard = () => {
    if (!isMyTurn) return;
    onSendMessage({ type: 'draw-card' });
  };

  const handleCallUno = () => {
    onSendMessage({ type: 'call-uno' });
  };

  const handleCatchUno = (targetPlayerId: string) => {
    onSendMessage({ type: 'catch-uno', targetPlayerId });
  };

  const handleAddBot = () => {
    onSendMessage({ type: 'add-bot' });
  };

  const handleRemoveBot = (botId: string) => {
    onSendMessage({ type: 'remove-bot', botId });
  };

  const handleStartGame = () => {
    onSendMessage({ type: 'start-game' });
  };

  // Check if player already hit UNO button during 2-card hand warning
  const hasCalledUno = self ? gameState.unoCalledPlayers[self.id] : false;

  return (
    <div className="relative min-h-screen bg-radial from-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans">
      
      {/* Upper Navigation Header */}
      <header className="bg-slate-900/65 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 bg-amber-500 rounded-lg text-slate-950 font-black text-sm uppercase italic">
            UNO
          </div>
          <div>
            <div className="text-xs text-slate-500 font-mono">ROOM CODE:</div>
            <div className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-1.5">
              🚀 {gameState.roomId}
            </div>
          </div>
        </div>

        {/* Action button rails */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => {
              const prev = soundEnabled;
              setSoundEnabled(!prev);
              if (!prev) playSound('play');
            }}
            type="button"
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          <button
            onClick={() => setIsLogDrawerOpen(!isLogDrawerOpen)}
            type="button"
            className={`p-2 rounded-lg transition relative ${isLogDrawerOpen ? 'bg-amber-500 text-slate-950' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
            title="Toggle Action Log"
          >
            <Scroll size={18} />
          </button>

          <button
            onClick={onLeave}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer"
          >
            <LogOut size={13} />
            Leave
          </button>
        </div>
      </header>

      {/* Main Table Layer */}
      <main className="flex-1 flex flex-col justify-between p-4 relative">
        <AnimatePresence>
          {isLobby ? (
            /* Lobby waiting screen */
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-xl mx-auto w-full my-auto bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-slate-800/80 shadow-2xl space-y-6 text-center"
            >
              <div>
                <span className="text-xs font-bold text-amber-500 bg-amber-500/15 p-1.5 px-3 rounded-full">
                  LOBBY ROOM
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white mt-3 uppercase tracking-tight">
                  Waiting for Players
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Share the Room Code <strong className="text-white font-mono">{gameState.roomId}</strong> with your friends, or add CPU bots and start now!
                </p>
              </div>

              {/* Player Slots Grid */}
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/40 space-y-2 max-h-60 overflow-y-auto">
                <div className="flex justify-between items-center text-[10px] uppercase text-slate-500 font-mono tracking-wider font-semibold border-b border-slate-800/80 pb-2">
                  <span>Player Name</span>
                  <span>Role</span>
                </div>
                {gameState.players.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center py-2 border-b border-slate-900 last:border-0"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{p.avatar}</span>
                      <span className={`text-sm font-semibold ${p.id === playerId ? 'text-amber-400' : 'text-slate-200'}`}>
                        {p.name} {p.id === playerId && '(You)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.isHost ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Shield size={9} /> Host
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">Player</span>
                      )}

                      {/* Let Host remove bots */}
                      {isHost && p.id.startsWith('bot_') && (
                        <button
                          onClick={() => handleRemoveBot(p.id)}
                          className="text-[9px] font-bold text-red-500 hover:text-red-400 p-1 px-1.5 bg-red-500/10 rounded-md transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Fill details */}
                <div className="pt-2 text-center text-xs text-slate-500">
                  ⚠️ Slots filled: {gameState.players.length} / {gameState.maxPlayers} players
                </div>
              </div>

              {/* Host actions layout */}
              <div className="flex flex-col sm:flex-row gap-3">
                {isHost && gameState.players.length < gameState.maxPlayers && (
                  <button
                    onClick={handleAddBot}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 px-4 rounded-xl transition text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus size={14} /> Add AI Bot (CPU)
                  </button>
                )}

                {isHost ? (
                  <button
                    onClick={handleStartGame}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition shadow-lg shadow-orange-500/10 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play size={14} className="fill-slate-950" /> Start Game Now
                  </button>
                ) : (
                  <div className="flex-1 bg-slate-950 border border-slate-900 rounded-xl py-3.5 px-4 text-xs text-slate-500 text-center font-sans">
                    Waiting for the host to start the game...
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* Active Match felt table workspace */
            <div className="flex-1 flex flex-col justify-between relative mt-4">
              
              {/* Elliptical Billiard Felt Table Outline */}
              <div
                id="felt-billiard-table"
                className="absolute inset-x-2 sm:inset-x-8 md:inset-x-20 top-2 bottom-32 sm:bottom-40 bg-gradient-to-b from-blue-950 via-slate-900 to-indigo-950/70 border-4 sm:border-8 border-slate-800/80 rounded-[4rem] sm:rounded-[6rem] md:rounded-[9rem] shadow-5xl z-0 overflow-hidden flex items-center justify-center"
              >
                {/* Visual grid lines inside table */}
                <div className="absolute inset-6 border border-slate-700/20 rounded-[3rem] sm:rounded-[5rem] md:rounded-[8rem] pointer-events-none" />
                <div className="absolute inset-16 border border-slate-700/10 rounded-[2.5rem] sm:rounded-[4rem] md:rounded-[7rem] pointer-events-none" />

                {/* Turn flow indicator in background */}
                <div
                  className={`absolute w-36 h-36 border-2 border-dashed border-slate-800/50 rounded-full flex items-center justify-center pointer-events-none
                    ${gameState.direction === 1 ? 'animate-[spin_40s_linear_infinite]' : 'animate-[spin_40s_linear_infinite_reverse]'}
                  `}
                >
                  <Compass size={40} className="text-slate-800/20" />
                </div>
              </div>

              {/* ARRANGE OPPONENTS AROUND THE FELT TABLE */}
              <div className="relative w-full h-[60vh] z-10 pointer-events-none">
                {opponents.map((opp, idx) => {
                  const isOpponentTurn = gameState.currentTurn === opp.id;
                  const posClass = getOpponentPositionClass(idx, opponents.length);

                  return (
                    <div
                      key={opp.id}
                      className={`absolute ${posClass} pointer-events-auto transition-transform ${isOpponentTurn ? 'scale-105' : ''}`}
                    >
                      <motion.div
                        className={`flex flex-col items-center bg-slate-950/90 backdrop-blur-md rounded-2xl p-2.5 border-2 shadow-xl w-28 sm:w-32 relative
                          ${isOpponentTurn ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-800'}
                          ${opp.isDisconnected ? 'opacity-65' : 'opacity-100'}
                        `}
                      >
                        {/* Disconnected tag */}
                        {opp.isDisconnected && (
                          <div className="absolute -top-2.5 bg-red-600 text-white font-black text-[9px] py-0.5 px-2 rounded-full uppercase tracking-wider">
                            🤖 CPU Active
                          </div>
                        )}

                        <div className="relative">
                          {/* Turn indicator glowing halo */}
                          {isOpponentTurn && (
                            <span className="absolute -inset-1.5 bg-amber-500 rounded-full blur-xs opacity-60 animate-ping" />
                          )}
                          <div className="text-3xl relative">{opp.avatar}</div>
                        </div>

                        <div className="text-[10px] sm:text-xs font-bold text-white tracking-tight mt-1 truncate max-w-full px-1">
                          {opp.name}
                        </div>

                        {/* Hand cards count representation */}
                        <div className="flex items-center gap-1.5 mt-1.5 bg-slate-900 border border-slate-800 p-1 px-2.5 rounded-lg">
                          <div className="w-2.5 h-3.5 bg-red-600 rounded-xs border border-white/10" />
                          <span className="text-[10px] sm:text-xs font-black text-amber-500 font-mono">
                            {opp.cardCount}
                          </span>
                        </div>

                        {/* Trap Button to catch forgotten UNO */}
                        {gameState.mustCallUnoPlayerId === opp.id && opp.cardCount === 1 && (
                          <motion.button
                            initial={{ scale: 0.8 }}
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            onClick={() => handleCatchUno(opp.id)}
                            className="absolute -bottom-4 bg-orange-500 text-slate-950 font-black text-[9px] uppercase tracking-wider py-1 px-2 rounded-full shadow-lg border border-yellow-300 pointer-events-auto hover:bg-orange-600 transition"
                          >
                            ⚠️ CATCH UNO
                          </motion.button>
                        )}
                      </motion.div>
                    </div>
                  );
                })}
              </div>

              {/* TABLE CENTER PILE (DISCARD & DRAW) */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-15 flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto">
                
                {/* DRAW PILE */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 font-mono">
                    Draw Pile
                  </span>
                  <div className="relative">
                    {isMyTurn && (
                      <span className="absolute -inset-2 bg-amber-400 rounded-xl blur-md opacity-25 animate-pulse" />
                    )}
                    <CardItem
                      card={{ id: 'fake_deck', color: 'red', value: '0' }}
                      facedown={true}
                      onClick={handleDrawCard}
                      isInteractive={isMyTurn}
                    />
                  </div>
                  {isMyTurn && (
                    <span className="text-[9px] font-bold text-amber-400 animate-pulse mt-1">
                      Your Turn (Draw/Play)
                    </span>
                  )}
                </div>

                {/* DISCARD PILE (Active center Card) */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 font-mono">
                    Active Play
                  </span>
                  <div className="relative">
                    {/* Ring highlight of current color color */}
                    <div className={`absolute -inset-3 rounded-2xl blur-lg opacity-40 transition-all ${colorThemes[gameState.currentColor].shadow} ${colorThemes[gameState.currentColor].bg}`} />
                    
                    <CardItem
                      card={gameState.topCard}
                      isInteractive={false}
                    />

                    {/* Active Color Banner */}
                    <div
                      className={`absolute -bottom-3 left-1/2 transform -translate-x-1/2 p-0.5 px-3 rounded-full border text-[10px] font-black uppercase tracking-widest shadow-md
                        ${colorThemes[gameState.currentColor].bg}
                        ${colorThemes[gameState.currentColor].border}
                        ${gameState.currentColor === 'yellow' ? 'text-slate-950' : 'text-white'}
                      `}
                    >
                      {gameState.currentColor}
                    </div>
                  </div>
                </div>

              </div>

              {/* CLIENT HUD VIEW & PLAY HAND (BOTTOM PANEL) */}
              <div className="w-full max-w-4xl mx-auto z-15 mt-auto flex flex-col items-center select-none">
                
                {/* Action feedback cues (like Forgot UNO alert flag) */}
                {gameState.mustCallUnoPlayerId === playerId && self?.cardCount === 1 && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mb-4 bg-orange-600 border border-yellow-300 text-white font-bold text-xs p-3 rounded-xl shadow-2xl flex items-center gap-3"
                  >
                    <AlertOctagon size={16} />
                    <span>You have 1 card left! Click UNO quickly before someone catches you!</span>
                    <button
                      onClick={handleCallUno}
                      className="bg-slate-950 hover:bg-slate-900 border border-yellow-300 text-yellow-300 font-black px-4 py-1 rounded-lg uppercase text-[10px] tracking-wider transition"
                    >
                      🗣️ CALL UNO
                    </button>
                  </motion.div>
                )}

                {/* Active HUD Status indicator banner */}
                <div className="flex justify-between items-center w-full px-4 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{self?.avatar}</span>
                    <div>
                      <span className="text-xs font-extrabold text-slate-300">{self?.name}</span>
                      <span className="text-[10px] font-mono text-slate-500 block">Your Hand ({self?.cardCount} cards)</span>
                    </div>
                    {hasCalledUno && (
                      <span className="bg-amber-500 text-slate-950 p-0.5 px-2 rounded font-black text-[9px] uppercase animate-bounce">
                        UNO Called
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Glowing UNO Button for you to shout UNO! */}
                    {self && self.cardCount === 2 && !hasCalledUno && (
                      <motion.button
                        initial={{ scale: 0.9 }}
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                        onClick={handleCallUno}
                        className="bg-amber-500 hover:bg-amber-600 border border-amber-300 text-slate-950 font-black text-[10px] tracking-wider uppercase p-2 px-4 rounded-xl shadow-lg cursor-pointer"
                      >
                        🗣️ Pre-Call UNO
                      </motion.button>
                    )}

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-500 block uppercase font-mono">Turn:</span>
                      <span className={`text-xs font-black uppercase ${isMyTurn ? 'text-amber-400' : 'text-slate-400'}`}>
                        {isMyTurn ? '🌟 YOUR TURN' : 'Waiting...'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Overlapping, responsive playing card list */}
                <div className="w-full bg-slate-950/85 backdrop-blur-md rounded-2xl p-4 border border-slate-800/80 shadow-2xl">
                  {gameState.hand.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-600 italic">
                      No cards in your hand. Draw cards to start playing!
                    </div>
                  ) : (
                    <div className="flex justify-center items-center gap-1.5 overflow-x-auto py-4 px-2 max-w-full">
                      {gameState.hand.map((card) => {
                        const isCardPlayable = isMyTurn && (
                          card.color === 'wild' ||
                          card.color === gameState.currentColor ||
                          card.value === gameState.topCard.value
                        );

                        return (
                          <div key={card.id} className="transition-transform duration-200">
                            <CardItem
                              card={card}
                              onClick={() => handlePlayCard(card)}
                              isPlayable={isCardPlayable}
                              isInteractive={isMyTurn}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

            </div >
          )}
        </AnimatePresence>
      </main>

      {/* WINNER ENDED SCREEN MODAL */}
      <AnimatePresence>
        {isEnded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-55 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-3xl"
            >
              <div>
                <span className="text-4xl text-center">🏆</span>
                <h2 className="text-3xl font-black text-amber-500 uppercase tracking-tight mt-2">
                  Match Completed
                </h2>
                <p className="text-sm text-slate-400 mt-2 font-sans">
                  The winner of the game is:{' '}
                  <strong className="text-white">
                    {gameState.players.find(p => p.id === gameState.winnerId)?.name || 'Unknown Player'}
                  </strong>
                </p>
              </div>

              {/* Player stats logs */}
              <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/40 space-y-2">
                <span className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">Final Standings</span>
                {gameState.players
                  .slice()
                  .sort((a, b) => a.cardCount - b.cardCount)
                  .map((p, idx) => (
                    <div key={p.id} className="flex justify-between text-xs py-1.5 border-b border-slate-900 last:border-0">
                      <span className="text-slate-300 font-medium">#{idx + 1} {p.avatar} {p.name}</span>
                      <span className="text-slate-500 font-mono">{p.cardCount} cards left</span>
                    </div>
                  ))}
              </div>

              <div className="flex flex-col gap-2">
                {isHost ? (
                  <button
                    onClick={handleStartGame}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 rounded-xl transition cursor-pointer"
                  >
                    Play Again
                  </button>
                ) : (
                  <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-xs text-slate-500">
                    Waiting for the host to restart...
                  </div>
                )}
                <button
                  onClick={onLeave}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-xl transition"
                >
                  Leave to Main Menu
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WILD CARD COLOR SELECTION MODAL */}
      <AnimatePresence>
        {selectedWildCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-white tracking-tight">
                🌈 Select Wild Color
              </h3>
              <p className="text-xs text-slate-400">
                Choose the color to set the active discard pile color to:
              </p>

              {/* Color Wheel Grid */}
              <div className="grid grid-cols-2 gap-3.5 max-w-xs mx-auto pt-2">
                <button
                  onClick={() => handleSelectWildColor('red')}
                  className="bg-red-600 hover:bg-red-500 hover:scale-105 active:scale-95 text-white font-bold p-6 rounded-xl transition shadow-lg outline-none cursor-pointer"
                >
                  Red
                </button>
                <button
                  onClick={() => handleSelectWildColor('blue')}
                  className="bg-blue-600 hover:bg-blue-500 hover:scale-105 active:scale-95 text-white font-bold p-6 rounded-xl transition shadow-lg outline-none cursor-pointer"
                >
                  Blue
                </button>
                <button
                  onClick={() => handleSelectWildColor('yellow')}
                  className="bg-yellow-400 hover:bg-yellow-300 hover:scale-105 active:scale-95 text-slate-950 font-bold p-6 rounded-xl transition shadow-lg outline-none cursor-pointer"
                >
                  Yellow
                </button>
                <button
                  onClick={() => handleSelectWildColor('green')}
                  className="bg-emerald-600 hover:bg-emerald-500 hover:scale-105 active:scale-95 text-white font-bold p-6 rounded-xl transition shadow-lg outline-none cursor-pointer"
                >
                  Green
                </button>
              </div>

              <button
                onClick={() => setSelectedWildCard(null)}
                className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-400 p-2"
              >
                Cancel Choose
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* REAL-TIME CHAT/ACTION HISTORY LOGS PANEL */}
      <AnimatePresence>
        {isLogDrawerOpen && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed right-0 top-18 bottom-0 w-80 bg-slate-900/95 border-l border-slate-800 backdrop-blur-md shadow-2xl z-40 p-4 flex flex-col justify-between"
          >
            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2 mb-3.5 flex items-center justify-between">
                <span>📋 Match Live Logs</span>
                <button
                  onClick={() => setIsLogDrawerOpen(false)}
                  className="text-[10px] text-slate-500 hover:text-white"
                >
                  Close
                </button>
              </h3>

              {/* Scroller logs list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 select-text scrollbar-thin">
                {gameState.logs.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-600 italic">
                    Log matches will populate here on starts.
                  </div>
                ) : (
                  gameState.logs.map((log) => (
                    <div key={log.id} className="text-[11px] leading-relaxed border-b border-slate-900/40 pb-1">
                      <span className="text-slate-600 select-none mr-1.5 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="text-slate-300 font-sans">{log.text}</span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
