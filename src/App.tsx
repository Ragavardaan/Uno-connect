import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameState } from './types';
import { LobbyView } from './components/LobbyView';
import { GameTable } from './components/GameTable';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [error, setError] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Active WebSocket connections helper
  const joinRoomInSocket = (name: string, avatar: string, rId?: string, maxPlayers?: number) => {
    setIsConnecting(true);
    setError('');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'join-room',
          name,
          avatar,
          roomId: rId,
          maxPlayers
        })
      );
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'joined-room') {
          setRoomId(data.roomId);
          setPlayerId(data.playerId);
          localStorage.setItem('uno_room_id', data.roomId);
          localStorage.setItem('uno_player_id', data.playerId);
          setIsConnecting(false);
        } else if (data.type === 'state-update') {
          setGameState(data.state);
        } else if (data.type === 'error') {
          setError(data.message);
          setIsConnecting(false);
          socket.close();
        }
      } catch (err) {
        console.error('Error parsing inbound message:', err);
      }
    };

    socket.onclose = () => {
      setWs(null);
      setIsConnecting(false);
    };

    socket.onerror = () => {
      setError('Connection failed. Please check if the game server is online.');
      setIsConnecting(false);
    };

    setWs(socket);
  };

  // Auto-reconnect session detector on mount
  useEffect(() => {
    const savedRoomId = localStorage.getItem('uno_room_id');
    const savedPlayerId = localStorage.getItem('uno_player_id');
    const savedName = localStorage.getItem('uno_player_name');
    const savedAvatar = localStorage.getItem('uno_player_avatar');

    if (savedRoomId && savedPlayerId && savedName) {
      joinRoomInSocket(savedName, savedAvatar || '🦊', savedRoomId);
    }
  }, []);

  // Sync auto-reconnect fallback if socket cuts out during gameplay
  useEffect(() => {
    if (!ws && roomId && playerId) {
      const name = localStorage.getItem('uno_player_name') || 'Guest';
      const avatar = localStorage.getItem('uno_player_avatar') || '🦊';

      const timer = setTimeout(() => {
        console.log('Reconnecting dropped game socket...');
        joinRoomInSocket(name, avatar, roomId);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [ws, roomId, playerId]);

  const handleSendMessage = (msg: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      console.warn('Cannot send play command: WebSocket is offline.');
    }
  };

  const handleLeaveRoom = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'leave-room' }));
      ws.close();
    }
    setWs(null);
    setRoomId(null);
    setPlayerId(null);
    setGameState(null);
    setError('');

    // Remove tokens to prevent infinite auto-rejoin loops after exit
    localStorage.removeItem('uno_room_id');
    localStorage.removeItem('uno_player_id');
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <AnimatePresence mode="wait">
        {isConnecting && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center justify-center text-slate-100 gap-4"
          >
            <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold tracking-wider font-mono text-amber-500 uppercase">
              Shuffling Deck & Connecting...
            </span>
          </motion.div>
        )}

        {ws && roomId && playerId && gameState ? (
          <motion.div
            key="game"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
          >
            <GameTable
              gameState={gameState}
              playerId={playerId}
              onSendMessage={handleSendMessage}
              onLeave={handleLeaveRoom}
            />
          </motion.div>
        ) : (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <LobbyView onJoinRoom={joinRoomInSocket} error={error} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
