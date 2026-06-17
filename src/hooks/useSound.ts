// Web Audio synthesizer hook for premium gameplay arcade sounds
export function useSound() {
  const playSound = (type: 'play' | 'draw' | 'uno' | 'action' | 'penalty' | 'win' | 'error') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      switch (type) {
        case 'play': {
          // Quick bright ping
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
          break;
        }
        case 'draw': {
          // Slide down swish
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.16);
          break;
        }
        case 'uno': {
          // Giant epic dual trumpet fanfare
          [523.25, 659.25, 783.99].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);
            gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.05 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.05);
            osc.stop(ctx.currentTime + idx * 0.05 + 0.35);
          });
          break;
        }
        case 'action': {
          // Double rhythmic chime (Skip, Reverse)
          [600, 800].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.08 + 0.12);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.08);
            osc.stop(ctx.currentTime + idx * 0.08 + 0.12);
          });
          break;
        }
        case 'penalty': {
          // Alarm warning buzzer (Forgot to call, or +2/+4)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc1.type = 'sawtooth';
          osc2.type = 'sawtooth';
          osc1.frequency.setValueAtTime(150, ctx.currentTime);
          osc2.frequency.setValueAtTime(155, ctx.currentTime);
          
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
          
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);
          
          osc1.start();
          osc2.start();
          
          osc1.stop(ctx.currentTime + 0.25);
          osc2.stop(ctx.currentTime + 0.25);
          break;
        }
        case 'win': {
          // Glorious rising arpeggio
          const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.08 + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.08);
            osc.stop(ctx.currentTime + idx * 0.08 + 0.4);
          });
          break;
        }
        case 'error': {
          // Low flat buzz
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(100, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
          break;
        }
      }
    } catch (e) {
      console.warn('Web Audio Playback blocked or not supported:', e);
    }
  };

  return { playSound };
}
