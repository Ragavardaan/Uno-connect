export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';

export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  cardCount: number;
  isHost: boolean;
  isReady: boolean;
  isDisconnected: boolean;
}

export interface GameLog {
  id: string;
  timestamp: number;
  text: string;
  type: 'info' | 'play' | 'draw' | 'uno' | 'action' | 'penalty';
}

export interface GameState {
  roomId: string;
  status: 'lobby' | 'playing' | 'ended';
  players: Player[];
  hand: Card[]; // Only populated for the specific requesting client
  topCard: Card;
  currentColor: CardColor; // Can be different from topCard.color if wild
  currentTurn: string; // playerId
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  maxPlayers: number;
  winnerId: string | null;
  logs: GameLog[];
  unoCalledPlayers: Record<string, boolean>; // playerId -> true if they safely called UNO
  mustCallUnoPlayerId: string | null; // playerId of person who forgot to call UNO
}

export interface RoomData {
  id: string;
  status: 'lobby' | 'playing' | 'ended';
  players: {
    id: string;
    name: string;
    avatar: string;
    cards: Card[];
    isHost: boolean;
    isReady: boolean;
    isDisconnected: boolean;
  }[];
  deck: Card[];
  discardPile: Card[];
  currentColor: CardColor;
  currentTurnIndex: number;
  direction: 1 | -1;
  maxPlayers: number;
  winnerId: string | null;
  logs: GameLog[];
  unoCalledPlayers: Record<string, boolean>;
  mustCallUnoPlayerId: string | null;
}

export type ClientMessage =
  | { type: 'join-room'; name: string; avatar: string; roomId?: string; maxPlayers?: number }
  | { type: 'start-game' }
  | { type: 'play-card'; cardId: string; wildColor?: CardColor }
  | { type: 'draw-card' }
  | { type: 'call-uno' }
  | { type: 'catch-uno'; targetPlayerId: string }
  | { type: 'add-bot' }
  | { type: 'remove-bot'; botId: string }
  | { type: 'leave-room' };

export type ServerMessage =
  | { type: 'state-update'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'joined-room'; roomId: string; playerId: string };
