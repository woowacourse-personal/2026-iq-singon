// ============================================================
// synth.js — 프로시저럴 신스 반주 엔진 (오리지널 곡 모드)
// MIDI 노트 번호 기반 화음 + 프로시저럴 드럼 킷(붐뱁 힙합 그루브)을
// 브라우저에서 직접 합성한다. 외부 오디오 에셋 0개.
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
        gainNode.gain.linearRampToValueAtTime(0.13, time + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration - 0.05);

        osc.connect(gainNode);
        gainNode.connect(synthGainNode);
        osc.start(time);
        osc.stop(time + duration);
    });
}

// ------------------------------------------------------------
// 드럼 킷 (전부 신스 합성 — 킥/스네어/하이햇/서브베이스)
// ------------------------------------------------------------
let drumNoiseBuffer = null;
function getNoiseBuffer() {
    if (drumNoiseBuffer) return drumNoiseBuffer;
    const len = Math.floor(audioContext.sampleRate * 0.3);
    drumNoiseBuffer = audioContext.createBuffer(1, len, audioContext.sampleRate);
    const data = drumNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return drumNoiseBuffer;
}

function playKick(time) {
    const osc = audioContext.createOscillator();
    const g = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.1);
    g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    osc.connect(g);
    g.connect(synthGainNode);
    osc.start(time);
    osc.stop(time + 0.2);
}

function playSnare(time) {
    // 노이즈 몸통
    const src = audioContext.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bp = audioContext.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.45, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    src.connect(bp);
    bp.connect(g);
    g.connect(synthGainNode);
    src.start(time);
    src.stop(time + 0.2);

    // 저음 톤 몸통 (탁-)
    const osc = audioContext.createOscillator();
    const og = audioContext.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(190, time);
    og.gain.setValueAtTime(0.22, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(og);
    og.connect(synthGainNode);
    osc.start(time);
    osc.stop(time + 0.12);
}

function playHat(time, open = false, level = 0.12) {
    const src = audioContext.createBufferSource();
    src.buffer = getNoiseBuffer();
    const hp = audioContext.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = audioContext.createGain();
    g.gain.setValueAtTime(level, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.25 : 0.05));
    src.connect(hp);
    hp.connect(g);
    g.connect(synthGainNode);
    src.start(time);
    src.stop(time + (open ? 0.3 : 0.08));
}

function playSubBass(time, note, duration) {
    const osc = audioContext.createOscillator();
    const g = audioContext.createGain();
    osc.type = "sine";
    const freq = Math.pow(2, (note - 24 - 69) / 12) * 440; // 코드 루트 두 옥타브 아래
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.45, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(g);
    g.connect(synthGainNode);
    osc.start(time);
    osc.stop(time + duration + 0.05);
}

// ------------------------------------------------------------
// 재생 루프: 코드 진행 + 붐뱁 드럼 (킥 1·3박 / 스네어 2·4박 / 스윙 하이햇)
// ------------------------------------------------------------
function startSynthPlayback(song) {
    const beatDur = 60 / song.bpm;
    const swing = beatDur * 0.16; // 뒷 8분음표를 밀어 힙합 바운스
    currentBeat = 0;
    let lastRoot = (song.notes[0] && song.notes[0].notes[0]) || 45;

    synthInterval = setInterval(() => {
        const now = audioContext.currentTime + 0.02;
        const beatInBar = currentBeat % 4;

        const matched = song.notes.find(n => n.beat === currentBeat % 32);
        if (matched) {
            playProceduralSynthChord(now, matched.notes, beatDur * 4);
            lastRoot = matched.notes[0];
        }

        if (beatInBar === 0 || beatInBar === 2) {
            playKick(now);
            playSubBass(now, lastRoot, beatDur * 0.9);
        } else {
            playSnare(now);
        }

        // 두 마디마다 2박 뒤 8분음표에 싱커페이션 킥 (그루브 변화)
        if (beatInBar === 1 && Math.floor(currentBeat / 4) % 2 === 1) {
            playKick(now + beatDur * 0.5 + swing * 0.5);
            playSubBass(now + beatDur * 0.5 + swing * 0.5, lastRoot, beatDur * 0.4);
        }

        // 하이햇: 정박 + 스윙 걸린 뒷박, 마디 끝은 오픈햇
        playHat(now, false, 0.13);
        playHat(now + beatDur * 0.5 + swing, beatInBar === 3, beatInBar === 3 ? 0.11 : 0.08);

        currentBeat++;
    }, beatDur * 1000);
}

function stopSynthPlayback() {
    clearInterval(synthInterval);
    synthInterval = null;
    currentBeat = 0;
}
