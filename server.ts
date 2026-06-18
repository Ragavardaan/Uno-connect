import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  Card,
  CardColor,
  CardValue,
  Player,
  GameLog,
  GameState,
  RoomData,
  ClientMessage,
  ServerMessage
} from './src/types';

// Global room state
const rooms = new Map<string, RoomData>();

// Bot turn timeouts mapped by roomId
const botTimeouts = new Map<string, NodeJS.Timeout>();

// Active connections mapped to room and player
const activeConnections = new Map<WebSocket, { roomId: string; playerId: string }>();

// Deck generation helper
function generateDeck(): Card[] {
  const deck: Card[] = [];
  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
  const values: CardValue[] = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'skip', 'reverse', 'draw2'
  ];

  for (const color of colors) {
    // One 0 card
    deck.push({
      id: `${color}_0_${Math.random().toString(36).substring(2, 7)}`,
      color,
      value: '0'
    });

    // Two of 1-9
    for (let i = 1; i <= 9; i++) {
      const valStr = i.toString() as CardValue;
      deck.push({
        id: `${color}_${valStr}_a_${Math.random().toString(36).substring(2, 7)}`,
        color,
        value: valStr
      });
      deck.push({
        id: `${color}_${valStr}_b_${Math.random().toString(36).substring(2, 7)}`,
        color,
        value: valStr
      });
    }

    // Two of Skip, Reverse, Draw Two
    for (const action of ['skip', 'reverse', 'draw2'] as CardValue[]) {
      deck.push({
        id: `${color}_${action}_a_${Math.random().toString(36).substring(2, 7)}`,
        color,
        value: action
      });
      deck.push({
        id: `${color}_${action}_b_${Math.random().toString(36).substring(2, 7)}`,
        color,
        value: action
      });
    }
  }

  // 4 Wild cards and 4 Wild Draw Four cards
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `wild_${i}_${Math.random().toString(36).substring(2, 7)}`,
      color: 'wild',
      value: 'wild'
    });
    deck.push({
      id: `wild4_${i}_${Math.random().toString(36).substring(2, 7)}`,
      color: 'wild',
      value: 'wild4'
    });
  }

  // Fisher-Yates Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }

  return deck;
}

// Check standard play rules
function canPlayCard(card: Card, topCard: Card, currentColor: CardColor): boolean {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

// Generate human-friendly game log
function addLog(room: RoomData, text: string, type: GameLog['type'] = 'info') {
  const log: GameLog = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    text,
    type
  };
  room.logs.push(log);
  if (room.logs.length > 25) {
    room.logs.shift();
  }
}

// Get the public state of a room targeted for a specific player
function getGameStateForPlayer(room: RoomData, playerId: string): GameState {
  const playerEntry = room.players.find(p => p.id === playerId);
  const hand = playerEntry ? playerEntry.cards : [];

  return {
    roomId: room.id,
    status: room.status,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cardCount: p.cards.length,
      isHost: p.isHost,
      isReady: p.isReady,
      isDisconnected: p.isDisconnected
    })),
    hand,
    topCard: room.discardPile[room.discardPile.length - 1],
    currentColor: room.currentColor,
    currentTurn: room.players.length > 0 && room.currentTurnIndex >= 0
      ? room.players[room.currentTurnIndex].id
      : '',
    direction: room.direction,
    maxPlayers: room.maxPlayers,
    winnerId: room.winnerId,
    logs: room.logs,
    unoCalledPlayers: room.unoCalledPlayers,
    mustCallUnoPlayerId: room.mustCallUnoPlayerId
  };
}

// Broadcast game state to all players in a room
function broadcastRoomState(room: RoomData, wss: WebSocketServer) {
  wss.clients.forEach(client => {
    const conn = activeConnections.get(client);
    if (conn && conn.roomId === room.id) {
      if (client.readyState === WebSocket.OPEN) {
        const state = getGameStateForPlayer(room, conn.playerId);
        client.send(JSON.stringify({ type: 'state-update', state }));
      }
    }
  });
}

// Draw a card for a player
function drawCardForPlayer(room: RoomData, playerIndex: number, silent = false): Card | null {
  if (room.deck.length === 0) {
    // Reshuffle discard pile into deck, leaving the top card
    const topCard = room.discardPile.pop()!;
    const pool = room.discardPile;
    room.discardPile = [topCard];

    // Shuffle pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = pool[i];
      pool[i] = pool[j];
      pool[j] = temp;
    }
    room.deck = pool;
    addLog(room, `🔄 Discard pile reshuffled back into the Draw pile.`, 'info');
  }

  const card = room.deck.pop();
  if (card) {
    const player = room.players[playerIndex];
    player.cards.push(card);
    // Clear UNO called state because they just drew a card
    if (room.unoCalledPlayers[player.id]) {
      delete room.unoCalledPlayers[player.id];
    }
    if (!silent) {
      addLog(room, `📥 ${player.name} drew a card.`, 'draw');
    }
    return card;
  }
  return null;
}

// Move to next player
function moveToNextPlayer(room: RoomData, skipCount: number = 1) {
  const count = room.players.length;
  if (count === 0) return;
  room.currentTurnIndex = (room.currentTurnIndex + skipCount * room.direction + count * 2) % count;
}

// Standard AI Bot names and avatars
const BOT_NAMES = ['AstroBot', 'BinaryBob', 'Volt', 'Byte', 'Glitch', 'Spark', 'Vector'];
const BOT_AVATARS = ['🤖', '👾', '⚙️', '🔋', '💾', '💿', '🔌'];

function getRandomBotName(existingNames: string[]): { name: string; avatar: string } {
  const available = BOT_NAMES.filter(n => !existingNames.includes(n));
  const name = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : `Bot_${Math.floor(Math.random() * 100)}`;
  const avatar = BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];
  return { name, avatar };
}

// Execute turn for AI Bot
function executeBotTurn(roomId: string, wss: WebSocketServer) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') return;

  const currentTurnPlayer = room.players[room.currentTurnIndex];
  if (!currentTurnPlayer) return;

  const playable = currentTurnPlayer.cards.filter(c =>
    canPlayCard(c, room.discardPile[room.discardPile.length - 1], room.currentColor)
  );

  // Set any mustCallUnoPlayerId checks from the starting player
  // Clear any forgotten UNO state of OTHER players upon bot start acting
  room.mustCallUnoPlayerId = null;

  if (playable.length > 0) {
    // AI Strategy: Prefer higher impact cards (actions or wild cards) or just pick one
    // Let's sort: wild4, wild, draw2, skip, reverse, then standard numbers
    playable.sort((a, b) => {
      const weight = (val: CardValue) => {
        if (val === 'wild4') return 6;
        if (val === 'wild') return 5;
        if (val === 'draw2') return 4;
        if (val === 'skip') return 3;
        if (val === 'reverse') return 2;
        return 1;
      };
      return weight(b.value) - weight(a.value);
    });

    // Make Bot occasionally play a standard number card to look organic
    const selectedCard = Math.random() < 0.7 ? playable[0] : playable[Math.floor(Math.random() * playable.length)];

    // If bot has 2 cards and plays this, it leaves them with 1 card.
    // Bot should call UNO! Standard bot has 85% chance to call UNO correctly.
    const willHaveOneCard = currentTurnPlayer.cards.length === 2;
    const botCallsUno = willHaveOneCard && Math.random() < 0.88;

    if (botCallsUno) {
      room.unoCalledPlayers[currentTurnPlayer.id] = true;
      addLog(room, `📣 ${currentTurnPlayer.name} shouted "UNO!"`, 'uno');
    }

    // Play card
    currentTurnPlayer.cards = currentTurnPlayer.cards.filter(c => c.id !== selectedCard.id);
    room.discardPile.push(selectedCard);

    let finalColor = selectedCard.color;
    // Handle wild cards
    if (selectedCard.color === 'wild') {
      // Choose bot's most popular color
      const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
      currentTurnPlayer.cards.forEach(c => {
        if (c.color !== 'wild') colorCounts[c.color]++;
      });
      let bestColor: CardColor = 'red';
      let maxCount = -1;
      (Object.keys(colorCounts) as Array<keyof typeof colorCounts>).forEach(c => {
        if (colorCounts[c] > maxCount) {
          maxCount = colorCounts[c];
          bestColor = c;
        }
      });
      finalColor = bestColor;
    }

    room.currentColor = finalColor;
    const topCardText = `${selectedCard.color === 'wild' ? 'Wild' : selectedCard.color} ${selectedCard.value}`;
    addLog(room, `🎮 ${currentTurnPlayer.name} played ${topCardText}${selectedCard.color === 'wild' ? ` (selected ${finalColor})` : ''}.`, 'play');

    // If bot had 1 card left and did NOT call UNO, flag them as catchable!
    if (willHaveOneCard && !botCallsUno) {
      room.mustCallUnoPlayerId = currentTurnPlayer.id;
    }

    // Check Win
    if (currentTurnPlayer.cards.length === 0) {
      room.status = 'ended';
      room.winnerId = currentTurnPlayer.id;
      addLog(room, `🏆 ${currentTurnPlayer.name} won the game!`, 'info');
      broadcastRoomState(room, wss);
      return;
    }

    // Execute card effects
    const count = room.players.length;
    if (selectedCard.value === 'skip') {
      const skippedPlayer = room.players[(room.currentTurnIndex + room.direction + count) % count];
      addLog(room, `🚫 ${skippedPlayer.name} was skipped.`, 'action');
      moveToNextPlayer(room, 2);
    } else if (selectedCard.value === 'reverse') {
      if (count === 2) {
        const skippedPlayer = room.players[(room.currentTurnIndex + room.direction + count) % count];
        addLog(room, `🔄 Reverse acts as Skip in 2-player game. ${skippedPlayer.name} was skipped.`, 'action');
        moveToNextPlayer(room, 2);
      } else {
        room.direction = (room.direction * -1) as 1 | -1;
        addLog(room, `🔄 Order of play was reversed!`, 'action');
        moveToNextPlayer(room, 1);
      }
    } else if (selectedCard.value === 'draw2') {
      const targetIndex = (room.currentTurnIndex + room.direction + count) % count;
      const targetPlayer = room.players[targetIndex];
      addLog(room, `➕ ${targetPlayer.name} draws 2 cards and is skipped!`, 'penalty');
      drawCardForPlayer(room, targetIndex, true);
      drawCardForPlayer(room, targetIndex, true);
      moveToNextPlayer(room, 2);
    } else if (selectedCard.value === 'wild4') {
      const targetIndex = (room.currentTurnIndex + room.direction + count) % count;
      const targetPlayer = room.players[targetIndex];
      addLog(room, `🔥 ${targetPlayer.name} draws 4 cards and is skipped!`, 'penalty');
      drawCardForPlayer(room, targetIndex, true);
      drawCardForPlayer(room, targetIndex, true);
      drawCardForPlayer(room, targetIndex, true);
      drawCardForPlayer(room, targetIndex, true);
      moveToNextPlayer(room, 2);
    } else {
      moveToNextPlayer(room, 1);
    }
  } else {
    // No playable cards. Bot draws.
    const drawn = drawCardForPlayer(room, room.currentTurnIndex);
    if (drawn && canPlayCard(drawn, room.discardPile[room.discardPile.length - 1], room.currentColor)) {
      // Bot plays the drawn card immediately!
      // Treat wild colors cleanly
      let wildColor: CardColor = 'red';
      if (drawn.color === 'wild') {
        const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
        wildColor = colors[Math.floor(Math.random() * colors.length)];
      }

      const willHaveOneCard = currentTurnPlayer.cards.length === 2;
      const botCallsUno = willHaveOneCard && Math.random() < 0.88;

      if (botCallsUno) {
        room.unoCalledPlayers[currentTurnPlayer.id] = true;
        addLog(room, `📣 ${currentTurnPlayer.name} shouted "UNO!"`, 'uno');
      }

      currentTurnPlayer.cards = currentTurnPlayer.cards.filter(c => c.id !== drawn.id);
      room.discardPile.push(drawn);
      room.currentColor = drawn.color === 'wild' ? wildColor : drawn.color;
      
      addLog(room, `⚡ ${currentTurnPlayer.name} drew and played ${drawn.color === 'wild' ? 'Wild' : drawn.color} ${drawn.value}${drawn.color === 'wild' ? ` (selected ${wildColor})` : ''}!`, 'play');

      if (willHaveOneCard && !botCallsUno) {
        room.mustCallUnoPlayerId = currentTurnPlayer.id;
      }

      if (currentTurnPlayer.cards.length === 0) {
        room.status = 'ended';
        room.winnerId = currentTurnPlayer.id;
        addLog(room, `🏆 ${currentTurnPlayer.name} won the game!`, 'info');
        broadcastRoomState(room, wss);
        return;
      }

      const count = room.players.length;
      if (drawn.value === 'skip') {
        const skippedPlayer = room.players[(room.currentTurnIndex + room.direction + count) % count];
        addLog(room, `🚫 ${skippedPlayer.name} was skipped.`, 'action');
        moveToNextPlayer(room, 2);
      } else if (drawn.value === 'reverse') {
        if (count === 2) {
          const skippedPlayer = room.players[(room.currentTurnIndex + room.direction + count) % count];
          addLog(room, `🔄 Reverse acts as Skip. ${skippedPlayer.name} was skipped.`, 'action');
          moveToNextPlayer(room, 2);
        } else {
          room.direction = (room.direction * -1) as 1 | -1;
          addLog(room, `🔄 Order of play was reversed!`, 'action');
          moveToNextPlayer(room, 1);
        }
      } else if (drawn.value === 'draw2') {
        const targetIndex = (room.currentTurnIndex + room.direction + count) % count;
        const targetPlayer = room.players[targetIndex];
        addLog(room, `➕ ${targetPlayer.name} draws 2 cards and is skipped!`, 'penalty');
        drawCardForPlayer(room, targetIndex, true);
        drawCardForPlayer(room, targetIndex, true);
        moveToNextPlayer(room, 2);
      } else if (drawn.value === 'wild4') {
        const targetIndex = (room.currentTurnIndex + room.direction + count) % count;
        const targetPlayer = room.players[targetIndex];
        addLog(room, `🔥 ${targetPlayer.name} draws 4 cards and is skipped!`, 'penalty');
        drawCardForPlayer(room, targetIndex, true);
        drawCardForPlayer(room, targetIndex, true);
        drawCardForPlayer(room, targetIndex, true);
        drawCardForPlayer(room, targetIndex, true);
        moveToNextPlayer(room, 2);
      } else {
        moveToNextPlayer(room, 1);
      }
    } else {
      // Drawn card was not playable, bot passes
      moveToNextPlayer(room, 1);
    }
  }

  broadcastRoomState(room, wss);
  scheduleBotPlay(roomId, wss);
}

// Set up Bot actions scheduling
function scheduleBotPlay(roomId: string, wss: WebSocketServer) {
  if (botTimeouts.has(roomId)) {
    clearTimeout(botTimeouts.get(roomId)!);
    botTimeouts.delete(roomId);
  }

  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') return;

  const currentTurnPlayer = room.players[room.currentTurnIndex];
  if (!currentTurnPlayer) return;

  const isBotOrDisconnected = currentTurnPlayer.id.startsWith('bot_') || currentTurnPlayer.isDisconnected;
  if (isBotOrDisconnected) {
    const timeout = setTimeout(() => {
      executeBotTurn(roomId, wss);
    }, 1800); // 1.8s delay creates an extremely readable and rhythmic turn pacing
    botTimeouts.set(roomId, timeout);
  }
}

function handlePlayerDepart(roomId: string, playerId: string, wss: WebSocketServer) {
  const room = rooms.get(roomId);
  if (!room) return;

  const departingPlayer = room.players.find(p => p.id === playerId);
  if (!departingPlayer) return;

  if (room.status === 'lobby') {
    // Safe to remove since match hasn't started yet
    room.players = room.players.filter(p => p.id !== playerId);
    addLog(room, `👋 ${departingPlayer.name} left the room.`, 'info');

    // If they were host, designate next host
    if (departingPlayer.isHost && room.players.length > 0) {
      const nextRealPlayer = room.players.find(p => !p.id.startsWith('bot_'));
      if (nextRealPlayer) {
        nextRealPlayer.isHost = true;
        addLog(room, `💼 ${nextRealPlayer.name} is now the host.`, 'info');
      } else {
        // All bots left, host the first bot if absolutely necessary
        room.players[0].isHost = true;
      }
    }

    // If room empty, clean up
    if (room.players.filter(p => !p.id.startsWith('bot_')).length === 0) {
      rooms.delete(room.id);
      if (botTimeouts.has(room.id)) {
        clearTimeout(botTimeouts.get(room.id)!);
        botTimeouts.delete(room.id);
      }
    } else {
      broadcastRoomState(room, wss);
    }
  } else {
    // Active game: mark as disconnected, Bot AI automatically takes over to ensure smooth gameplay!
    departingPlayer.isDisconnected = true;
    addLog(room, `🔌 ${departingPlayer.name} disconnected. CPU bot took over.`, 'info');

    // If host disconnected, designate next connected real player
    if (departingPlayer.isHost) {
      const nextHost = room.players.find(p => !p.id.startsWith('bot_') && !p.isDisconnected);
      if (nextHost) {
        departingPlayer.isHost = false;
        nextHost.isHost = true;
        addLog(room, `💼 ${nextHost.name} was promoted to Host.`, 'info');
      }
    }

    // If no real players remain, delete room immediately
    const activeRealPlayersCount = room.players.filter(p => !p.id.startsWith('bot_') && !p.isDisconnected).length;
    if (activeRealPlayersCount === 0) {
      rooms.delete(room.id);
      if (botTimeouts.has(room.id)) {
        clearTimeout(botTimeouts.get(room.id)!);
        botTimeouts.delete(room.id);
      }
      console.log(`Room ${room.id} cleaned up as all real players disconnected.`);
    } else {
      broadcastRoomState(room, wss);
      // If it was their turn, trigger bot turn instantly
      scheduleBotPlay(room.id, wss);
    }
  }
}

function executeGameAction(
  room: RoomData,
  playerId: string,
  msg: ClientMessage,
  sendError: (err: string) => void,
  wss: WebSocketServer
) {
  switch (msg.type) {
    case 'join-room': {
      // Handled directly during enrollment, bypass
      break;
    }

    case 'start-game': {
      // Only host can start
      const hostPlayer = room.players.find(p => p.id === playerId);
      if (!hostPlayer?.isHost) {
        sendError('Only the host can start the game!');
        return;
      }

      if (room.players.length < 2) {
        // If there's only 1 real player, fill the room with bots to matchmaking requirements!
        const missingPlayers = room.maxPlayers - room.players.length;
        for (let i = 0; i < missingPlayers; i++) {
          const existingNames = room.players.map(p => p.name);
          const { name, avatar } = getRandomBotName(existingNames);
          room.players.push({
            id: `bot_${Math.random().toString(36).substring(2, 7)}`,
            name,
            avatar,
            cards: [],
            isHost: false,
            isReady: true,
            isDisconnected: false
          });
        }
        addLog(room, `🤖 Automatically filled empty slots with AI Bots.`, 'info');
      }

      // Setup game deck, discard, shuffle
      room.deck = generateDeck();
      room.discardPile = [];
      room.status = 'playing';
      room.winnerId = null;
      room.direction = 1;
      room.currentTurnIndex = 0;
      room.unoCalledPlayers = {};
      room.mustCallUnoPlayerId = null;
      room.logs = [];

      addLog(room, `🚀 Game started by host ${hostPlayer.name}! Ready, set, UNO!`, 'info');

      // Deal hands: 7 cards each
      room.players.forEach(p => {
        p.cards = [];
        for (let i = 0; i < 7; i++) {
          drawCardForPlayer(room, room.players.indexOf(p), true);
        }
      });

      // Start discard card
      let topCard = room.deck.pop();
      while (!topCard || topCard.color === 'wild') {
        if (topCard) room.deck.unshift(topCard);
        topCard = room.deck.pop();
      }
      room.discardPile.push(topCard);
      room.currentColor = topCard.color;

      addLog(room, `🎬 Match started. Current card is ${topCard.color} ${topCard.value}.`, 'info');

      broadcastRoomState(room, wss);
      
      // Check if the first player is a bot
      scheduleBotPlay(room.id, wss);
      break;
    }

    case 'play-card': {
      const currentPlayer = room.players[room.currentTurnIndex];
      if (currentPlayer.id !== playerId) {
        sendError(`It's not your turn!`);
        return;
      }

      const card = currentPlayer.cards.find(c => c.id === msg.cardId);
      if (!card) {
        sendError('You do not have this card!');
        return;
      }

      // Validate match rules
      const topCard = room.discardPile[room.discardPile.length - 1];
      if (!canPlayCard(card, topCard, room.currentColor)) {
        sendError('You cannot play this card!');
        return;
      }

      // Client chooses wild color
      let finalColor = card.color;
      if (card.color === 'wild') {
        if (!msg.wildColor) {
          sendError('Please select a color for your wild card!');
          return;
        }
        finalColor = msg.wildColor;
      }

      // Clear forgot-to-called uno for other players
      room.mustCallUnoPlayerId = null;

      // Check if they are playing their second-to-last card and did NOT call UNO yet
      const willHaveOneCard = currentPlayer.cards.length === 2;
      const alreadyCalledUno = room.unoCalledPlayers[currentPlayer.id];

      if (willHaveOneCard && !alreadyCalledUno) {
        // They played, now have 1 card, but forgot/missed UNO call during their turn
        room.mustCallUnoPlayerId = currentPlayer.id;
      }

      // Play the card
      currentPlayer.cards = currentPlayer.cards.filter(c => c.id !== card.id);
      room.discardPile.push(card);
      room.currentColor = finalColor;

      const cardText = `${card.color === 'wild' ? 'Wild' : card.color} ${card.value}`;
      addLog(room, `🎮 ${currentPlayer.name} played ${cardText}${card.color === 'wild' ? ` (selected ${finalColor})` : ''}.`, 'play');

      // Check win
      if (currentPlayer.cards.length === 0) {
        room.status = 'ended';
        room.winnerId = currentPlayer.id;
        addLog(room, `🏆 ${currentPlayer.name} won the match!`, 'info');
        broadcastRoomState(room, wss);
        return;
      }

      // Card Action logic
      const count = room.players.length;
      if (card.value === 'skip') {
        const skippedPlayer = room.players[(room.currentTurnIndex + room.direction + count) % count];
        addLog(room, `🚫 ${skippedPlayer.name} was skipped.`, 'action');
        moveToNextPlayer(room, 2);
      } else if (card.value === 'reverse') {
        if (count === 2) {
          const skippedPlayer = room.players[(room.currentTurnIndex + room.direction + count) % count];
          addLog(room, `🔄 Reverse acts as Skip in 2-player game. ${skippedPlayer.name} was skipped.`, 'action');
          moveToNextPlayer(room, 2);
        } else {
          room.direction = (room.direction * -1) as 1 | -1;
          addLog(room, `🔄 Order of play was reversed!`, 'action');
          moveToNextPlayer(room, 1);
        }
      } else if (card.value === 'draw2') {
        const targetIndex = (room.currentTurnIndex + room.direction + count) % count;
        const targetPlayer = room.players[targetIndex];
        addLog(room, `➕ ${targetPlayer.name} draws 2 cards and is skipped!`, 'penalty');
        drawCardForPlayer(room, targetIndex, true);
        drawCardForPlayer(room, targetIndex, true);
        moveToNextPlayer(room, 2);
      } else if (card.value === 'wild4') {
        const targetIndex = (room.currentTurnIndex + room.direction + count) % count;
        const targetPlayer = room.players[targetIndex];
        addLog(room, `🔥 ${targetPlayer.name} draws 4 cards and is skipped!`, 'penalty');
        drawCardForPlayer(room, targetIndex, true);
        drawCardForPlayer(room, targetIndex, true);
        drawCardForPlayer(room, targetIndex, true);
        drawCardForPlayer(room, targetIndex, true);
        moveToNextPlayer(room, 2);
      } else {
        moveToNextPlayer(room, 1);
      }

      broadcastRoomState(room, wss);
      scheduleBotPlay(room.id, wss);
      break;
    }

    case 'draw-card': {
      const currentPlayer = room.players[room.currentTurnIndex];
      if (currentPlayer.id !== playerId) {
        sendError(`It's not your turn!`);
        return;
      }

      // Clear catchable uno state since players progressed
      room.mustCallUnoPlayerId = null;

      const card = drawCardForPlayer(room, room.currentTurnIndex);
      
      const topCard = room.discardPile[room.discardPile.length - 1];
      if (card && canPlayCard(card, topCard, room.currentColor)) {
        addLog(room, `💡 ${currentPlayer.name} can play the drawn ${card.color === 'wild' ? 'Wild' : card.color} ${card.value}!`, 'info');
      } else {
        // Auto-pass if not playable!
        addLog(room, `⏭️ Card not playable. Turn passes.`, 'info');
        moveToNextPlayer(room, 1);
      }

      broadcastRoomState(room, wss);
      scheduleBotPlay(room.id, wss);
      break;
    }

    case 'call-uno': {
      const player = room.players.find(p => p.id === playerId);
      if (!player) return;

      // Player can call UNO if they have <= 2 cards
      if (player.cards.length <= 2) {
        room.unoCalledPlayers[player.id] = true;
        addLog(room, `📣 ${player.name} shouted "UNO!"`, 'uno');

        // If they were caught in forgotten state, they are now safe
        if (room.mustCallUnoPlayerId === player.id) {
          room.mustCallUnoPlayerId = null;
        }

        broadcastRoomState(room, wss);
      } else {
        sendError('You can only call UNO if you have 2 or fewer cards!');
      }
      break;
    }

    case 'catch-uno': {
      const reporter = room.players.find(p => p.id === playerId);
      const target = room.players.find(p => p.id === msg.targetPlayerId);

      if (!reporter || !target) return;

      if (room.mustCallUnoPlayerId === target.id && target.cards.length === 1 && !room.unoCalledPlayers[target.id]) {
        addLog(room, `🚨 ${reporter.name} caught ${target.name} forgetting to shout UNO! 2-card penalty draw!`, 'penalty');
        drawCardForPlayer(room, room.players.indexOf(target), true);
        drawCardForPlayer(room, room.players.indexOf(target), true);
        room.mustCallUnoPlayerId = null; // Clear trap
        broadcastRoomState(room, wss);
      } else {
        sendError('You cannot catch this player right now!');
      }
      break;
    }

    case 'add-bot': {
      const host = room.players.find(p => p.id === playerId);
      if (!host?.isHost) {
        sendError('Only the host can add bots!');
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        sendError('Lobby is full! Increase maximum players or remove players/bots.');
        return;
      }

      const existingNames = room.players.map(p => p.name);
      const { name, avatar } = getRandomBotName(existingNames);
      room.players.push({
        id: `bot_${Math.random().toString(36).substring(2, 7)}`,
        name: `${name} (CPU)`,
        avatar,
        cards: [],
        isHost: false,
        isReady: true,
        isDisconnected: false
      });

      addLog(room, `🤖 Host added Bot ${name}.`, 'info');
      broadcastRoomState(room, wss);
      break;
    }

    case 'remove-bot': {
      const host = room.players.find(p => p.id === playerId);
      if (!host?.isHost) {
        sendError('Only the host can remove bots!');
        return;
      }

      const botId = msg.botId;
      const botToRemove = room.players.find(p => p.id === botId);
      if (botToRemove && botToRemove.id.startsWith('bot_')) {
        room.players = room.players.filter(p => p.id !== botId);
        addLog(room, `🤖 Host removed Bot ${botToRemove.name}.`, 'info');
        broadcastRoomState(room, wss);
      }
      break;
    }

    case 'leave-room': {
      handlePlayerDepart(room.id, playerId, wss);
      break;
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade to WebSockets
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // Enable JSON request body parser
  app.use(express.json());

  // Health API check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', roomsCount: rooms.size });
  });

  // active rooms listing for matchmaking
  app.get('/api/rooms', (req, res) => {
    const activeRooms = Array.from(rooms.values())
      .filter(r => r.status === 'lobby')
      .map(r => ({
        roomId: r.id,
        playersCount: r.players.length,
        maxPlayers: r.maxPlayers,
        hostName: r.players.find(p => p.isHost)?.name || 'Unknown'
      }));
    res.json(activeRooms);
  });

  // 1. HTTP Join room endpoint (Firewall fallback)
  app.post('/api/room/join', (req, res) => {
    try {
      const { name, avatar, roomId: reqRoomId, maxPlayers: reqMaxPlayers, playerId: reqPlayerId } = req.body;
      let roomId = reqRoomId?.toUpperCase().trim();
      const playerId = reqPlayerId || `player_${Math.random().toString(36).substring(2, 9)}`;

      let room: RoomData | undefined;

      // Matchmaking
      if (!roomId) {
        const lobbies = Array.from(rooms.values()).filter(r => r.status === 'lobby' && r.players.length < r.maxPlayers);
        if (lobbies.length > 0) {
          room = lobbies[Math.floor(Math.random() * lobbies.length)];
          roomId = room.id;
        } else {
          roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        }
      }

      room = rooms.get(roomId);

      if (!room) {
        const maxPlayers = reqMaxPlayers ? Math.max(2, Math.min(10, reqMaxPlayers)) : 4;
        room = {
          id: roomId,
          status: 'lobby',
          players: [],
          deck: [],
          discardPile: [],
          currentColor: 'red',
          currentTurnIndex: 0,
          direction: 1,
          maxPlayers,
          winnerId: null,
          logs: [],
          unoCalledPlayers: {},
          mustCallUnoPlayerId: null
        };
        rooms.set(roomId, room);
      }

      // Check reconnecting
      let player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isDisconnected = false;
        (player as any).lastSeen = Date.now();
        addLog(room, `🔌 ${player.name} reconnected!`, 'info');
      } else {
        if (room.status !== 'lobby') {
          return res.status(400).json({ error: 'Game has already started!' });
        }

        if (room.players.length >= room.maxPlayers) {
          return res.status(400).json({ error: 'Room is full!' });
        }

        player = {
          id: playerId,
          name: (name || 'Guest').trim(),
          avatar: avatar || '🦊',
          cards: [],
          isHost: room.players.length === 0,
          isReady: false,
          isDisconnected: false
        };
        (player as any).lastSeen = Date.now();
        room.players.push(player);
        addLog(room, `👋 ${player.name} joined the room.`, 'info');
      }

      broadcastRoomState(room, wss);
      res.json({ success: true, roomId, playerId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. HTTP Fetch state endpoint
  app.get('/api/room/:roomId/state', (req, res) => {
    const { roomId } = req.params;
    const { playerId } = req.query;
    const rId = roomId?.toUpperCase();
    const room = rooms.get(rId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (playerId) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isDisconnected = false;
        (player as any).lastSeen = Date.now();
      }
    }

    scheduleBotPlay(room.id, wss);

    const state = getGameStateForPlayer(room, playerId as string);
    res.json({ state });
  });

  // 3. HTTP Submit actions endpoint
  app.post('/api/room/:roomId/action', (req, res) => {
    const { roomId } = req.params;
    const { playerId, action } = req.body;
    const rId = roomId?.toUpperCase();
    const room = rooms.get(rId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.isDisconnected = false;
      (player as any).lastSeen = Date.now();
    }

    let errorMsg = '';
    executeGameAction(room, playerId, action, (err) => {
      errorMsg = err;
    }, wss);

    if (errorMsg) {
      return res.status(400).json({ error: errorMsg });
    }

    broadcastRoomState(room, wss);
    const state = getGameStateForPlayer(room, playerId);
    res.json({ state });
  });

  // Active presence heartbeat tracker
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      let changed = false;
      room.players.forEach(p => {
        const lastSeen = (p as any).lastSeen;
        if (!p.id.startsWith('bot_') && !p.isDisconnected && lastSeen) {
          // Check if they have an active WebSocket connection
          let hasWS = false;
          activeConnections.forEach(conn => {
            if (conn.roomId === room.id && conn.playerId === p.id) {
              hasWS = true;
            }
          });

          // Disconnect idle polling clients (no ping for 15 seconds)
          if (!hasWS && now - lastSeen > 15000) {
            if (room.status === 'playing') {
              p.isDisconnected = true;
              addLog(room, `🔌 ${p.name} became inactive. CPU took over.`, 'info');
              changed = true;

              if (p.isHost) {
                const nextHost = room.players.find(ph => !ph.id.startsWith('bot_') && !ph.isDisconnected);
                if (nextHost) {
                  p.isHost = false;
                  nextHost.isHost = true;
                  addLog(room, `💼 ${nextHost.name} was promoted to Host.`, 'info');
                }
              }
            } else if (room.status === 'lobby') {
              room.players = room.players.filter(pr => pr.id !== p.id);
              addLog(room, `👋 ${p.name} left the room due to inactivity.`, 'info');
              changed = true;

              if (p.isHost && room.players.length > 0) {
                const nextRealPlayer = room.players.find(pr => !pr.id.startsWith('bot_'));
                if (nextRealPlayer) {
                  nextRealPlayer.isHost = true;
                  addLog(room, `💼 ${nextRealPlayer.name} is now the host.`, 'info');
                } else {
                  room.players[0].isHost = true;
                }
              }
            }
          }
        }
      });

      const activeRealPlayersCount = room.players.filter(p => !p.id.startsWith('bot_') && !p.isDisconnected).length;
      if (activeRealPlayersCount === 0 && room.players.length > 0) {
         rooms.delete(roomId);
         if (botTimeouts.has(roomId)) {
           clearTimeout(botTimeouts.get(roomId)!);
           botTimeouts.delete(roomId);
         }
         console.log(`Room ${roomId} cleaned up: empty.`);
      } else if (changed) {
        broadcastRoomState(room, wss);
        scheduleBotPlay(roomId, wss);
      }
    }
  }, 5000);

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (messageStr: string) => {
      try {
        const msg: ClientMessage = JSON.parse(messageStr);

        switch (msg.type) {
          case 'join-room': {
            let roomId = msg.roomId?.toUpperCase().trim();
            const playerId = activeConnections.get(ws)?.playerId || `player_${Math.random().toString(36).substring(2, 9)}`;

            let room: RoomData | undefined;

            // Matchmaking
            if (!roomId) {
              const lobbies = Array.from(rooms.values()).filter(r => r.status === 'lobby' && r.players.length < r.maxPlayers);
              if (lobbies.length > 0) {
                room = lobbies[Math.floor(Math.random() * lobbies.length)];
                roomId = room.id;
              } else {
                roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
              }
            }

            room = rooms.get(roomId);

            if (!room) {
              const maxPlayers = msg.maxPlayers ? Math.max(2, Math.min(10, msg.maxPlayers)) : 4;
              room = {
                id: roomId,
                status: 'lobby',
                players: [],
                deck: [],
                discardPile: [],
                currentColor: 'red',
                currentTurnIndex: 0,
                direction: 1,
                maxPlayers,
                winnerId: null,
                logs: [],
                unoCalledPlayers: {},
                mustCallUnoPlayerId: null
              };
              rooms.set(roomId, room);
            }

            // Check reconnecting
            let player = room.players.find(p => p.id === playerId);
            if (player) {
              player.isDisconnected = false;
              (player as any).lastSeen = Date.now();
              addLog(room, `🔌 ${player.name} reconnected!`, 'info');
            } else {
              if (room.status !== 'lobby' && !player) {
                ws.send(JSON.stringify({ type: 'error', message: 'Game has already started!' }));
                return;
              }

              if (room.players.length >= room.maxPlayers) {
                ws.send(JSON.stringify({ type: 'error', message: 'Room is full!' }));
                return;
              }

              player = {
                id: playerId,
                name: msg.name.trim() || `Player ${room.players.length + 1}`,
                avatar: msg.avatar || '🦊',
                cards: [],
                isHost: room.players.length === 0,
                isReady: false,
                isDisconnected: false
              };
              (player as any).lastSeen = Date.now();
              room.players.push(player);
              addLog(room, `👋 ${player.name} joined the room.`, 'info');
            }

            // Associate connection
            activeConnections.set(ws, { roomId, playerId });
            ws.send(JSON.stringify({ type: 'joined-room', roomId, playerId }));

            broadcastRoomState(room, wss);
            break;
          }

          default: {
            const conn = activeConnections.get(ws);
            if (!conn) return;

            const room = rooms.get(conn.roomId);
            if (!room) return;

            const player = room.players.find(p => p.id === conn.playerId);
            if (player) {
              player.isDisconnected = false;
              (player as any).lastSeen = Date.now();
            }

            executeGameAction(room, conn.playerId, msg, (err) => {
              ws.send(JSON.stringify({ type: 'error', message: err }));
            }, wss);
            break;
          }
        }
      } catch (err: any) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    ws.on('close', () => {
      handleClientDisconnect(ws, wss);
    });
  });

  function handleClientDisconnect(ws: WebSocket, wss: WebSocketServer) {
    const conn = activeConnections.get(ws);
    if (!conn) return;

    activeConnections.delete(ws);
    handlePlayerDepart(conn.roomId, conn.playerId, wss);
  }

  // Vite routing setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`UNO Server running happily on port ${PORT}`);
  });
}

startServer();
