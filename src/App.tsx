import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import { GameState } from './types';
import { LobbyView } from './components/LobbyView';
import { GameTable } from './components/GameTable';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [socket, setSocket] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Connection Handler utilizing Socket.io
  const joinRoom = async (
    name: string,
    avatar: string,
    rId?: string,
    maxPlayers?: number
  ) => {
    setIsConnecting(true);
    setError('');

    // Connect using Socket.io (no URL needed, automatically targets host)
    const newSocket = io({
      transports: ['polling', 'websocket']
    });

    newSocket.on('connect', () => {
      newSocket.emit('message', {
        type: 'join-room',
        name,
        avatar,
        roomId: rId,
        maxPlayers
      });
    });

    newSocket.on('message', (data: any) => {
      if (data.type === 'joined-room') {
        setRoomId(data.roomId);
        setPlayerId(data.playerId);
        localStorage.setItem('uno_room_id', data.roomId);
        localStorage.setItem('uno_player_id', data.playerId);
        localStorage.setItem('uno_player_name', name);
        localStorage.setItem('uno_player_avatar', avatar);
        setIsConnecting(false);
      } else if (data.type === 'state-update') {
        setGameState(data.state);
      } else if (data.type === 'error') {
        setError(data.message);
        setIsConnecting(false);
        newSocket.close();
      }
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket.io connection error:', err);
      setError('Connection failed. Retrying transparently...');
    });

    newSocket.on('disconnect', () => {
      setSocket(null);
      setIsConnecting(false);
    });

    setSocket(newSocket);
  };

  // Auto-reconnect session detector on mount
  useEffect(() => {
    const savedRoomId = localStorage.getItem('uno_room_id');
    const savedPlayerId = localStorage.getItem('uno_player_id');
    const savedName = localStorage.getItem('uno_player_name');
    const savedAvatar = localStorage.getItem('uno_player_avatar');

    if (savedRoomId && savedPlayerId && savedName) {
      joinRoom(savedName, savedAvatar || '🦊', savedRoomId);
    }
  }, []);

  // Message submission proxy
  const handleSendMessage = (msg: any) => {
    if (socket && socket.connected) {
      socket.emit('message', msg);
    } else {
      console.warn('Cannot send play command: Socket.io is offline.');
    }
  };

  const handleLeaveRoom = () => {
    if (socket) {
      try {
        socket.emit('message', { type: 'leave-room' });
        socket.close();
      } catch (e) {}
    }

    setSocket(null);
    setRoomId(null);
    setPlayerId(null);
    setGameState(null);
    setError('');

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

        {(roomId && playerId && gameState && socket) ? (
          <motion.div
            key="game"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="relative"
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
            <LobbyView onJoinRoom={joinRoom} error={error} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
