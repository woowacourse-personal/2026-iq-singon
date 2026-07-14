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

function initAudio() {
    if (audioContext) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass({ latencyHint: "interactive" });

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
    delayLevelNode.gain.value = 0.35;

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
            logSystemMessage("[마이크] 오디오 입력 활성화! 에코 이펙터 장착 완료.");
            updateAudioSettings();
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
        logSystemMessage("[마이크] 마이크 장치가 꺼졌습니다.");
    }
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

function updateAudioSettings() {
    const micVol = document.getElementById("slider-mic-vol").value;
    const echoDepth = document.getElementById("slider-echo-depth").value;
    const echoDelay = document.getElementById("slider-echo-delay").value;
    const musicVol = document.getElementById("slider-music-vol").value;

    document.getElementById("label-mic-vol").innerText = `${micVol}%`;
    document.getElementById("label-echo-depth").innerText = `${echoDepth}%`;
    document.getElementById("label-echo-delay").innerText = `${(echoDelay / 100).toFixed(2)}s`;
    document.getElementById("label-music-vol").innerText = `${musicVol}%`;

    if (!audioContext) return;

    if (micGainNode) micGainNode.gain.value = micVol / 100;

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

    remoteSource.connect(audioContext.destination);
    remoteSource.connect(analyserPartner);

    logSystemMessage("[성공] 친구 목소리 저지연 연동 완료. 지금 말해보세요!");
}
