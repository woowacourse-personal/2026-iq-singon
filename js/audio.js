// ============================================================
// audio.js — Web Audio 파이프라인
// 마이크 입력 → 게인 → [에코 딜레이 루프 / 모니터링 / 애널라이저]
// ============================================================

let audioContext = null;
let micStream = null;
let micSourceNode = null;
let micGainNode = null;
let monitorGainNode = null;

// 노래방 에코 FX 노드
let delayNode = null;
let delayFeedbackNode = null;
let delayFilterNode = null;
let delayLevelNode = null;

// 비주얼라이저 애널라이저
let analyserMe = null;
let analyserPartner = null;
let dataArrayMe = null;
let dataArrayPartner = null;

// 신스 볼륨
let synthGainNode = null;

// 상대방(원격) 목소리 볼륨
let remoteGainNode = null;

function initAudio() {
    if (audioContext) {
        // iOS 사파리: 유저 제스처 시점마다 suspended 상태를 풀어준다.
        // 모든 제스처 핸들러(마이크 토글, 재생, 초대 수락, 연결)가 initAudio를 거치므로 여기서 중앙 처리.
        if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass({ latencyHint: "interactive" });
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});

    micGainNode = audioContext.createGain();
    micGainNode.gain.value = 0.8;

    monitorGainNode = audioContext.createGain();
    monitorGainNode.gain.value = 0.0; // 하울링 방지: 기본 꺼짐

    // 에코 딜레이 루프: delay → lowpass → feedback → delay
    delayNode = audioContext.createDelay(2.0);
    delayFeedbackNode = audioContext.createGain();
    delayFilterNode = audioContext.createBiquadFilter();
    delayLevelNode = audioContext.createGain();

    delayFilterNode.type = "lowpass";
    delayFilterNode.frequency.value = 2500;
    delayFeedbackNode.gain.value = 0.40;
    delayNode.delayTime.value = 0.3;

    delayNode.connect(delayFilterNode);
    delayFilterNode.connect(delayFeedbackNode);
    delayFeedbackNode.connect(delayNode);
    delayLevelNode.gain.value = 0.5;

    // 상대방 목소리: MR에 묻히지 않도록 증폭 가능한 게인 (기본 130%)
    remoteGainNode = audioContext.createGain();
    remoteGainNode.gain.value = 1.3;
    remoteGainNode.connect(audioContext.destination);

    analyserMe = audioContext.createAnalyser();
    analyserMe.fftSize = 64;
    dataArrayMe = new Uint8Array(analyserMe.frequencyBinCount);

    synthGainNode = audioContext.createGain();
    synthGainNode.gain.value = 0.24;
    synthGainNode.connect(audioContext.destination);

    createVisualizerBars("visualizer-me", 15, "cyan");
    createVisualizerBars("visualizer-partner", 15, "pink");
    startVisualizerLoop();
}

async function toggleMic() {
    initAudio();
    const checked = document.getElementById("mic-toggle").checked;

    if (checked) {
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false, // Web Audio가 직접 제어
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            micSourceNode = audioContext.createMediaStreamSource(micStream);

            // 1. 모니터링 경로 (monitorGain으로 게이트)
            micSourceNode.connect(micGainNode);
            micGainNode.connect(monitorGainNode);
            monitorGainNode.connect(audioContext.destination);

            // 2. 에코 이펙트 경로
            micGainNode.connect(delayNode);
            delayNode.connect(delayLevelNode);
            delayLevelNode.connect(audioContext.destination);

            // 3. 비주얼라이저 경로
            micGainNode.connect(analyserMe);

            document.getElementById("monitoring-control").classList.remove("opacity-60", "pointer-events-none");
            document.getElementById("monitoring-hint").classList.add("hidden");
            logSystemMessage("[마이크] 오디오 입력 활성화! 에코 이펙터 장착 완료.");
            updateAudioSettings();
            // 이미 입장해 있는 관전자에게도 목소리 송출 시작 (peer.js)
            if (typeof onMicEnabled === "function") onMicEnabled();
        } catch (err) {
            console.error("마이크 접근 오류:", err);
            logSystemMessage("[에러] 마이크를 찾을 수 없거나 권한이 거부되었습니다.");
            document.getElementById("mic-toggle").checked = false;
        }
    } else {
        if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
            micStream = null;
        }
        document.getElementById("monitoring-control").classList.add("opacity-60", "pointer-events-none");
        document.getElementById("monitoring-hint").classList.remove("hidden");
        logSystemMessage("[마이크] 마이크 장치가 꺼졌습니다.");
    }

    if (typeof syncQuickMicBtn === "function") syncQuickMicBtn();
}

function toggleMonitoring() {
    const checked = document.getElementById("monitoring-toggle").checked;
    if (!monitorGainNode) return;

    if (checked) {
        monitorGainNode.gain.value = micGainNode.gain.value;
        logSystemMessage("[마이크] 목소리 모니터링 켜짐 (반드시 이어폰 착용!)");
    } else {
        monitorGainNode.gain.value = 0;
        logSystemMessage("[마이크] 목소리 모니터링 꺼짐.");
    }
}

// 슬라이더 조작 피드백: 값에 따라 음정이 변하는 짧은 블립 (드래그 중 과도 재생 방지 스로틀)
let lastBlipAt = 0;
function playSettingBlip(norm) {
    if (!audioContext) return;
    const now = performance.now();
    if (now - lastBlipAt < 70) return;
    lastBlipAt = now;

    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const g = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(240 + norm * 720, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g);
    g.connect(audioContext.destination);
    osc.start(t);
    osc.stop(t + 0.1);
}

function updateAudioSettings(changedEl = null) {
    const micVol = document.getElementById("slider-mic-vol").value;
    const echoDepth = document.getElementById("slider-echo-depth").value;
    const echoDelay = document.getElementById("slider-echo-delay").value;
    const musicVol = document.getElementById("slider-music-vol").value;
    const friendVol = document.getElementById("slider-friend-vol").value;

    document.getElementById("label-mic-vol").innerText = `${micVol}%`;
    document.getElementById("label-echo-depth").innerText = `${echoDepth}%`;
    document.getElementById("label-echo-delay").innerText = `${(echoDelay / 100).toFixed(2)}s`;
    document.getElementById("label-music-vol").innerText = `${musicVol}%`;
    document.getElementById("label-friend-vol").innerText = `${friendVol}%`;

    // 조작 피드백: 값 라벨 팝 애니메이션 + 블립음
    if (changedEl) {
        initAudio();
        const label = document.getElementById(changedEl.id.replace("slider-", "label-"));
        if (label) {
            label.classList.remove("value-pop");
            void label.offsetWidth; // 애니메이션 재시작
            label.classList.add("value-pop");
        }
        playSettingBlip(changedEl.value / (parseFloat(changedEl.max) || 100));
    }

    if (!audioContext) return;

    if (micGainNode) micGainNode.gain.value = micVol / 100;
    if (remoteGainNode) remoteGainNode.gain.value = friendVol / 100;

    if (delayNode) {
        delayNode.delayTime.setValueAtTime(echoDelay / 100, audioContext.currentTime);
        delayFeedbackNode.gain.value = (echoDepth / 100) * 0.95; // 발진 방지 상한
    }

    if (synthGainNode) {
        synthGainNode.gain.value = (musicVol / 100) * 0.4;
    }

    // 유튜브 플레이어 볼륨 연동
    if (typeof ytPlayer !== "undefined" && ytPlayer && ytPlayer.setVolume) {
        ytPlayer.setVolume(parseInt(musicVol, 10));
    }

    if (monitorGainNode && document.getElementById("monitoring-toggle").checked) {
        monitorGainNode.gain.value = micGainNode.gain.value;
    }
}

// 원격(친구) 스트림을 스피커 + 애널라이저로 연결
function playRemoteStream(remoteStream) {
    initAudio();

    // Chrome 버그 회피: MediaStream을 오디오 엘리먼트에도 바인딩해야 재생됨
    const hiddenAudio = new Audio();
    hiddenAudio.srcObject = remoteStream;
    hiddenAudio.muted = true;
    hiddenAudio.play().catch(() => {});

    const remoteSource = audioContext.createMediaStreamSource(remoteStream);

    analyserPartner = audioContext.createAnalyser();
    analyserPartner.fftSize = 64;
    dataArrayPartner = new Uint8Array(analyserPartner.frequencyBinCount);

    remoteSource.connect(remoteGainNode);
    remoteSource.connect(analyserPartner);

    logSystemMessage("[성공] 친구 목소리 연결 완료. 지금 말해보세요!");
}
