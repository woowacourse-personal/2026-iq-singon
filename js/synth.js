// ============================================================
// synth.js — 프로시저럴 신스 반주 엔진 (오리지널 곡 모드)
// MIDI 노트 번호 기반 화음을 브라우저에서 직접 합성한다.
// 저작인접권 이슈가 없는 자체 반주 = 폴백이자 저작권 프리 모드.
// ============================================================

let synthInterval = null;
let currentBeat = 0;

function playProceduralSynthChord(time, notes, duration) {
    if (!audioContext) return;

    notes.forEach(note => {
        const osc = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        osc.type = Math.random() > 0.4 ? "triangle" : "sine";
        const freq = Math.pow(2, (note - 69) / 12) * 440;
        osc.frequency.setValueAtTime(freq, time);

        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(0.15, time + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration - 0.05);

        osc.connect(gainNode);
        gainNode.connect(synthGainNode);
        osc.start(time);
        osc.stop(time + duration);
    });
}

function playBeatClick(time) {
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    osc.frequency.setValueAtTime(800, time);
    gainNode.gain.setValueAtTime(0.02, time);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gainNode);
    gainNode.connect(synthGainNode);
    osc.start(time);
    osc.stop(time + 0.1);
}

function startSynthPlayback(song) {
    const tempoInterval = 60 / song.bpm;
    currentBeat = 0;

    synthInterval = setInterval(() => {
        const matched = song.notes.find(n => n.beat === currentBeat % 32);
        if (matched) {
            const now = audioContext.currentTime;
            playProceduralSynthChord(now, matched.notes, tempoInterval * 4);
            playBeatClick(now);
        }
        currentBeat++;
    }, tempoInterval * 1000);
}

function stopSynthPlayback() {
    clearInterval(synthInterval);
    synthInterval = null;
    currentBeat = 0;
}
