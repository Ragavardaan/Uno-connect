import React from 'react';
import { motion } from 'motion/react';
import { Ban, RefreshCw, Layers } from 'lucide-react';
import { Card, CardColor } from '../types';

interface CardItemProps {
  card: Card;
  onClick?: () => void;
  isPlayable?: boolean;
  isInteractive?: boolean;
  size?: 'sm' | 'md' | 'lg';
  facedown?: boolean;
}

const colorMap: Record<CardColor, string> = {
  red: 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/20 text-white',
  blue: 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-500/20 text-white',
  green: 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-500/20 text-white',
  yellow: 'bg-gradient-to-br from-yellow-400 to-amber-500 shadow-yellow-500/10 text-slate-900',
  wild: 'bg-gradient-to-br from-slate-800 to-slate-950 shadow-slate-900/40 text-white border border-slate-700'
};

const textShadowClass = 'drop-shadow-lg font-bold font-sans tracking-tighter select-none';

export const CardItem: React.FC<CardItemProps> = ({
  card,
  onClick,
  isPlayable = true,
  isInteractive = true,
  size = 'md',
  facedown = false
}) => {
  const isWild = card.color === 'wild';

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'w-12 h-18 text-xs rounded-md shadow-xs';
      case 'lg':
        return 'w-24 h-36 text-2xl rounded-xl shadow-lg';
      case 'md':
      default:
        return 'w-18 h-28 text-md rounded-lg shadow-md';
    }
  };

  const getInnerSymbol = () => {
    const iconSize = size === 'sm' ? 14 : size === 'lg' ? 32 : 22;

    switch (card.value) {
      case 'skip':
        return <Ban size={iconSize} className="stroke-[2.5]" />;
      case 'reverse':
        return <RefreshCw size={iconSize} className="stroke-[2.5]" />;
      case 'draw2':
        return <span className={textShadowClass}>+2</span>;
      case 'wild4':
        return <span className={`${textShadowClass} ${size === 'lg' ? 'text-3xl' : ''}`}>+4</span>;
      case 'wild':
        return (
          <div className="relative w-6 h-6 sm:w-8 sm:h-8 rounded-full overflow-hidden border border-slate-600 flex flex-wrap">
            <div className="w-1/2 h-1/2 bg-red-500" />
            <div className="w-1/2 h-1/2 bg-blue-500" />
            <div className="w-1/2 h-1/2 bg-yellow-400" />
            <div className="w-1/2 h-1/2 bg-emerald-500" />
          </div>
        );
      default:
        return <span className={`${textShadowClass} ${size === 'lg' ? 'text-5xl' : 'text-3xl'}`}>{card.value}</span>;
    }
  };

  if (facedown) {
    return (
      <motion.div
        className={`${getSizeClasses()} bg-slate-900 border-2 border-slate-800 relative flex items-center justify-center cursor-default shadow-lg overflow-hidden`}
        whileHover={isInteractive ? { scale: 1.05, y: -4 } : {}}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        {/* Card back logo */}
        <div className="absolute inset-2 border border-red-500/30 rounded flex items-center justify-center bg-gradient-to-br from-red-600 via-red-800 to-slate-950">
          <div className="w-full flex flex-col items-center justify-center transform -rotate-12">
            <span className="font-extrabold text-white text-xs sm:text-lg italic tracking-tight uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,1)] bg-amber-500 py-0.5 px-2 rounded-md">
              UNO
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={isInteractive && onClick ? onClick : undefined}
      disabled={isInteractive && !isPlayable}
      className={`
        ${getSizeClasses()}
        ${colorMap[card.color]}
        relative flex flex-col items-center justify-between border-2 border-slate-100/10 py-2 cursor-pointer outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 font-sans select-none overflow-hidden
        ${!isPlayable && isInteractive ? 'opacity-40 grayscale-[25%] pointer-events-none' : 'opacity-100'}
        transition-opacity duration-200
      `}
      whileHover={isInteractive && isPlayable ? { scale: 1.08, y: -12, zIndex: 50, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.3)' } : {}}
      whileTap={isInteractive && isPlayable ? { scale: 0.95 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Small top-left value */}
      <div className="absolute top-1 left-2 self-start font-bold text-[10px] sm:text-xs">
        {card.value === 'wild' || card.value === 'wild4' ? 'W' : card.value === 'draw2' ? '+2' : card.value === 'skip' ? '🚫' : card.value === 'reverse' ? '🔄' : card.value}
      </div>

      {/* Center oval background layout */}
      <div className="absolute inset-x-2 top-6 bottom-6 bg-white/10 rounded-full flex items-center justify-center border border-white/5 shadow-inner">
        {getInnerSymbol()}
      </div>

      {/* Wild helper - quadrant patterns */}
      {isWild && (
        <div className="absolute inset-0 opacity-10 pointer-events-none flex flex-wrap">
          <div className="w-1/2 h-1/2 bg-red-500" />
          <div className="w-1/2 h-1/2 bg-blue-500" />
          <div className="w-1/2 h-1/2 bg-yellow-400" />
          <div className="w-1/2 h-1/2 bg-emerald-500" />
        </div>
      )}

      {/* Small bottom-right index */}
      <div className="absolute bottom-1 right-2 self-end font-bold text-[10px] sm:text-xs transform rotate-180">
        {card.value === 'wild' || card.value === 'wild4' ? 'W' : card.value === 'draw2' ? '+2' : card.value === 'skip' ? '🚫' : card.value === 'reverse' ? '🔄' : card.value}
      </div>
    </motion.button>
  );
};
