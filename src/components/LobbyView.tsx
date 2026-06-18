import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Users, Play, Plus, Zap, RefreshCw, Key } from 'lucide-react';

interface LobbyViewProps {
  onJoinRoom: (
    name: string,
    avatar: string,
    roomId?: string,
    maxPlayers?: number
  ) => void;
  error?: string;
}

const AVATARS = ['🦊', '🦁', '🐯', '🐼', '🐨', '🐻', '🐙', '🐸', '🦄', '🤖', '👾', '👻'];

interface PublicRoom {
  roomId: string;
  playersCount: number;
  maxPlayers: number;
  hostName: string;
}

export const LobbyView: React.FC<LobbyViewProps> = ({ onJoinRoom, error }) => {
  const [name, setName] = useState(() => localStorage.getItem('uno_player_name') || '');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('uno_player_avatar') || AVATARS[0]);
  const [targetRoomId, setTargetRoomId] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [isLoadingPublicRooms, setIsLoadingPublicRooms] = useState(false);

  // Load public rooms for matchmaking explorer
  const fetchOpenLobbies = async () => {
    setIsLoadingPublicRooms(true);
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setPublicRooms(data);
      }
    } catch (err) {
      console.warn('Failed to fetch lobbies:', err);
    } finally {
      setIsLoadingPublicRooms(false);
    }
  };

  useEffect(() => {
    fetchOpenLobbies();
    const interval = setInterval(fetchOpenLobbies, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    localStorage.setItem('uno_player_name', name.trim());
    localStorage.setItem('uno_player_avatar', avatar);
    onJoinRoom(name, avatar, undefined, maxPlayers);
  };

  const handleQuickMatch = () => {
    if (!name.trim()) return;
    localStorage.setItem('uno_player_name', name.trim());
    localStorage.setItem('uno_player_avatar', avatar);
    // Passing no roomId triggers automatic open lobby matchmaking on server
    onJoinRoom(name, avatar);
  };

  const handleJoinSpecificRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetRoomId.trim()) return;
    localStorage.setItem('uno_player_name', name.trim());
    localStorage.setItem('uno_player_avatar', avatar);
    onJoinRoom(name, avatar, targetRoomId.toUpperCase().trim());
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-12 px-4 selection:bg-amber-500 selection:text-slate-950">
      {/* Upper header */}
      <div className="max-w-4xl mx-auto w-full text-center mb-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="inline-flex space-x-1 sm:space-x-2 items-center justify-center bg-radial from-amber-500/20 to-transparent p-4 rounded-full"
        >
          <div className="w-8 h-12 bg-red-600 rounded-md transform -rotate-12 shadow-md border border-white/20 flex items-center justify-center font-bold text-white text-lg">U</div>
          <div className="w-8 h-12 bg-blue-600 rounded-md transform -rotate-6 shadow-md border border-white/20 flex items-center justify-center font-bold text-white text-lg">N</div>
          <div className="w-8 h-12 bg-yellow-500 rounded-md transform rotate-6 shadow-md border border-white/20 flex items-center justify-center font-bold text-slate-950 text-lg">O</div>
          <div className="w-8 h-12 bg-emerald-600 rounded-md transform rotate-12 shadow-md border border-white/20 flex items-center justify-center font-bold text-white text-lg">!</div>
        </motion.div>
        <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-white uppercase italic">
          UNO <span className="text-amber-500">Multiplayer</span>
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 font-sans">
          Experience real-time custom rooms, interactive match hosts, and seamless online matchmaker lobbies.
        </p>
      </div>

      {/* Main card grid */}
      <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch my-auto">
        {/* Left Column: Profile Card */}
        <div id="profile-card" className="col-span-1 md:col-span-5 flex flex-col">
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex-1 bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800/80 shadow-2xl flex flex-col justify-between"
          >
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white mb-4 flex items-center gap-2">
                <span className="p-1.5 bg-amber-500/15 text-amber-500 rounded-lg">👤</span> Setup Your Identity
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                    Your Nickname
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={15}
                    placeholder="Enter your name..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                    Pick your Avatar {avatar}
                  </label>
                  <div className="grid grid-cols-4 gap-2.5">
                    {AVATARS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setAvatar(emoji)}
                        className={`text-2xl p-2.5 rounded-xl transition duration-150 relative ${
                          avatar === emoji
                            ? 'bg-amber-500 border-2 border-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                            : 'bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-white'
                        }`}
                      >
                        {emoji}
                        {avatar === emoji && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-slate-950 rounded-full border-2 border-amber-400 flex items-center justify-center p-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 text-xs text-red-400 text-center font-sans">
                ⚠️ {error}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right Column: Hosting & Matchmaking Panel */}
        <div id="hosting-panel" className="col-span-1 md:col-span-7 flex flex-col justify-between space-y-6">
          <motion.div
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800/80 shadow-2xl space-y-6 flex-1 flex flex-col justify-between"
          >
            {/* Quick Matchmaking and custom create actions */}
            <div className="space-y-6">
              {/* Matchmaking Section */}
              <div>
                <button
                  type="button"
                  disabled={!name.trim()}
                  onClick={handleQuickMatch}
                  className="w-full group bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-600 hover:to-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold text-sm uppercase py-4 px-6 rounded-xl transition shadow-lg shadow-orange-500/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Zap size={18} className="fill-slate-950 stroke-[2.5] group-hover:scale-110 transition-transform" />
                  Quick Match (Instant lobby)
                </button>
                <p className="text-[11px] text-slate-500 text-center mt-2">
                  Automatically match with other pending players, or launch a live lobby in seconds!
                </p>
              </div>

              {/* Grid split for joining or hosting */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Host a Custom Game */}
                <form onSubmit={handleCreateRoom} className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/40">
                  <h3 className="font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus size={14} className="text-amber-500" /> Host Custom Game
                  </h3>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Target Players: <span className="text-amber-400 font-extrabold">{maxPlayers}</span>
                    </label>
                    <input
                      type="range"
                      min={2}
                      max={10}
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                      className="w-full accent-amber-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                      <span>2 players</span>
                      <span>10 max</span>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={!name.trim()}
                    className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold text-xs py-2.5 px-4 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play size={12} className="fill-white" /> Create Custom Room
                  </button>
                </form>

                {/* Join code entry */}
                <form onSubmit={handleJoinSpecificRoom} className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                  <h3 className="font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Key size={14} className="text-amber-500" /> Join via Room Code
                  </h3>
                  <div>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. F7A5"
                      value={targetRoomId}
                      onChange={(e) => setTargetRoomId(e.target.value)}
                      className="w-full text-center bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-sm uppercase font-mono tracking-widest outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!name.trim() || !targetRoomId.trim()}
                    className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold text-xs py-2.5 px-4 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Join Room
                  </button>
                </form>
              </div>
            </div>

            {/* Active matching list explorer */}
            <div className="border-t border-slate-800/60 pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Users size={12} /> Active Open Lobbies
                </span>
                <button
                  onClick={fetchOpenLobbies}
                  type="button"
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
                  title="Refresh open list"
                >
                  <RefreshCw size={11} className={isLoadingPublicRooms ? 'animate-spin' : ''} />
                </button>
              </div>

              {publicRooms.length === 0 ? (
                <div className="bg-slate-950/30 border border-slate-900/60 rounded-xl p-3 text-center text-[11px] text-slate-500">
                  There are currently no open public lobby rooms. Create a game and share your code!
                </div>
              ) : (
                <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1 text-[11px]">
                  {publicRooms.map((room) => (
                    <div
                      key={room.roomId}
                      className="flex items-center justify-between bg-slate-950/50 hover:bg-slate-900 border border-slate-800 rounded-xl p-2 px-3 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-500 tracking-wider">
                          🏠 CODE: {room.roomId}
                        </span>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-400">Host: <span className="text-slate-300 font-medium">{room.hostName}</span></span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 flex items-center gap-1">
                          👤 {room.playersCount} / {room.maxPlayers}
                        </span>
                        <button
                          onClick={() => {
                            setTargetRoomId(room.roomId);
                            onJoinRoom(name, avatar, room.roomId);
                          }}
                          disabled={!name.trim()}
                          className="bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 text-amber-400 rounded-md px-2.5 py-0.5 font-bold transition disabled:opacity-40"
                        >
                          Join
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Footer credits */}
      <div className="text-center mt-8 text-[11px] text-slate-600 font-sans">
        &copy; {new Date().getFullYear()} UNO Multiplayer &bull; Implements server-side state authority and real-time connectivity.
      </div>
    </div>
  );
};
