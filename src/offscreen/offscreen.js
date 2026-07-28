chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'PLAY_CHIME') {
    playChime();
  }
});

async function playChime() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const now = context.currentTime;

  playBellTone(context, now, 660, 0.18);
  playBellTone(context, now + 0.08, 990, 0.12);
  playBellTone(context, now + 0.18, 1320, 0.08);

  window.setTimeout(() => {
    context.close();
  }, 1200);
}

function playBellTone(context, startAt, frequency, gainValue) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.65);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.7);
}
