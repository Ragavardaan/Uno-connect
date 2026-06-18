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
  const [connectionMode, setConnectionMode] = useState<'websocket' | 'polling'>('websocket');
  const [isFallbackActive, setIsFallbackActive] = useState(false);

  // Poll state helper from Express API
  const fetchGameStatePolling = async (rId: string, pId: string) => {
    try {
      const response = await fetch(`/api/room/${rId}/state?playerId=${pId}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.warn('Room no longer exists, leaving room locally');
          handleLeaveRoom();
          return;
        }
        throw new Error('Failed to update game state');
      }
      const data = await response.json();
      setGameState(data.state);
    } catch (err) {
      console.error('Polling error:', err);
    }
  };

  // Dual Connection Handler (WebSocket / HTTP Polling fallback)
  const joinRoom = async (
    name: string,
    avatar: string,
    rId?: string,
    maxPlayers?: number,
    preferredMode?: 'websocket' | 'polling'
  ) => {
    setIsConnecting(true);
    setError('');

    const mode = preferredMode || connectionMode;
    setConnectionMode(mode);

    if (mode === 'polling') {
      try {
        const response = await fetch('/api/room/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            avatar,
            roomId: rId,
            maxPlayers,
            playerId: localStorage.getItem('uno_player_id') || undefined
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to join room');
        }

        const data = await response.json();
        setRoomId(data.roomId);
        setPlayerId(data.playerId);
        localStorage.setItem('uno_room_id', data.roomId);
        localStorage.setItem('uno_player_id', data.playerId);
        localStorage.setItem('uno_player_name', name);
        localStorage.setItem('uno_player_avatar', avatar);

        // Fetch initial state
        await fetchGameStatePolling(data.roomId, data.playerId);
        setIsConnecting(false);
      } catch (err: any) {
        setError(err.message || 'Polling registration failed.');
        setIsConnecting(false);
      }
    } else {
      // WebSocket Mode
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      const socket = new WebSocket(wsUrl);

      // Timeout helper to automatically switch to HTTP Polling if handshake is blocked
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.warn('WebSocket handshake timed out. Falling back to HTTP Polling...');
          socket.close();
          setConnectionMode('polling');
          setIsFallbackActive(true);
          joinRoom(name, avatar, rId, maxPlayers, 'polling');
        }
      }, 2500);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
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
            localStorage.setItem('uno_player_name', name);
            localStorage.setItem('uno_player_avatar', avatar);
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
        clearTimeout(connectionTimeout);
        console.warn('WebSocket connection error. Switching to firewall-safe HTTP Polling mode...');
        setConnectionMode('polling');
        setIsFallbackActive(true);
        joinRoom(name, avatar, rId, maxPlayers, 'polling');
      };

      setWs(socket);
    }
  };

  // Auto-reconnect session detector on mount
  useEffect(() => {
    const savedRoomId = localStorage.getItem('uno_room_id');
    const savedPlayerId = localStorage.getItem('uno_player_id');
    const savedName = localStorage.getItem('uno_player_name');
    const savedAvatar = localStorage.getItem('uno_player_avatar');
    const savedMode = (localStorage.getItem('uno_network_mode') as 'websocket' | 'polling') || 'websocket';

    if (savedRoomId && savedPlayerId && savedName) {
      joinRoom(savedName, savedAvatar || '🦊', savedRoomId, undefined, savedMode);
    }
  }, []);

  // Sync auto-reconnect fallback if socket cuts out in real-time mode
  useEffect(() => {
    if (connectionMode === 'websocket' && !ws && roomId && playerId) {
      const name = localStorage.getItem('uno_player_name') || 'Guest';
      const avatar = localStorage.getItem('uno_player_avatar') || '🦊';

      const timer = setTimeout(() => {
        console.log('Reconnecting dropped game socket...');
        joinRoom(name, avatar, roomId, undefined, 'websocket');
      }, 3500);

      return () => clearTimeout(timer);
    }
  }, [ws, roomId, playerId, connectionMode]);

  // Periodic Polling loop (active only in polling mode)
  useEffect(() => {
    if (connectionMode === 'polling' && roomId && playerId) {
      fetchGameStatePolling(roomId, playerId);

      const interval = setInterval(() => {
        fetchGameStatePolling(roomId, playerId);
      }, 1500);

      return () => clearInterval(interval);
    }
  }, [connectionMode, roomId, playerId]);

  // Message submission proxy (Websocket push vs HTTP action POST)
  const handleSendMessage = async (msg: any) => {
    if (connectionMode === 'polling') {
      if (!roomId || !playerId) return;
      try {
        const response = await fetch(`/api/room/${roomId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId,
            action: msg
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          setError(errData.error || 'Action failed');
          setTimeout(() => setError(''), 4500);
        } else {
          const data = await response.json();
          setGameState(data.state);
        }
      } catch (err) {
        console.error('Error submitting action over HTTP:', err);
      }
    } else {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        console.warn('Cannot send play command: WebSocket is offline.');
      }
    }
  };

  const handleLeaveRoom = async () => {
    if (connectionMode === 'polling') {
      if (roomId && playerId) {
        try {
          await fetch(`/api/room/${roomId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerId,
              action: { type: 'leave-room' }
            })
          });
        } catch (err) {
          console.error('Error leaving room over HTTP:', err);
        }
      }
    } else {
      if (ws) {
        try {
          ws.send(JSON.stringify({ type: 'leave-room' }));
          ws.close();
        } catch (e) {}
      }
    }

    setWs(null);
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

        {((connectionMode === 'polling' && roomId && playerId && gameState) || (ws && roomId && playerId && gameState)) ? (
          <motion.div
            key="game"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            {connectionMode === 'polling' && (
              <div className="bg-amber-500/10 border-b border-amber-500/10 text-center py-2 px-4 text-xs font-mono text-amber-400 select-none flex items-center justify-center gap-1.5 z-40 relative">
                <span>🧱</span>
                <span>
                  <strong>Firewall Safe HTTP Polling Mode</strong> active. (Auto-refreshing every 1.5s)
                </span>
                {isFallbackActive && (
                  <span className="bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ml-1 animate-pulse">
                    Websocket Blocked - Auto fell back
                  </span>
                )}
              </div>
            )}
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
