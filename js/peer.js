// ============================================================
// peer.js — PeerJS 기반 P2P 연결
// 음성: MediaStream 다이렉트 콜 / 제어: DataConnection
// RTT를 상시 측정해 유튜브 싱크 보정에 사용한다.
// ============================================================

let peer = null;
let myPeerId = "";
let peerConnection = null;
let peerMediaCall = null;
let inviteTargetId = "";
let currentRttMs = 100; // 기본 가정값. ping/pong으로 갱신
let rttInterval = null;

function isConnected() {
    return !!(peerConnection && peerConnection.open);
}

function sendData(obj) {
    if (isConnected()) peerConnection.send(obj);
}

function initPeerJS() {
    const randomID = Math.floor(1000 + Math.random() * 9000);
    myPeerId = `singon-room-${randomID}`;

    peer = new Peer(myPeerId);

    peer.on("open", (id) => {
        document.getElementById("my-peer-id").value = id;
        logSystemMessage(`[서버] 내 고유 방 ID 생성 완료: ${id}`);
        if (inviteTargetId) {
            logSystemMessage(`[초대] 링크 접속 확인. 방(${inviteTargetId}) 자동 연결 준비 완료.`);
        }
    });

    peer.on("error", (err) => {
        if (err.type === "peer-unavailable") {
            showCustomAlert("🔌 연결 실패", "해당 방 ID를 찾을 수 없습니다.<br>친구가 페이지를 열어둔 상태인지, ID에 오타가 없는지 확인해 주세요.");
        } else {
            logSystemMessage(`[에러] 연결 오류: ${err.type}`);
        }
    });

    // 상대가 데이터 채널로 들어온 경우
    peer.on("connection", (conn) => {
        peerConnection = conn;
        setupConnectionListeners();
        logSystemMessage("[성공] 친구가 방에 참여했습니다!");
    });

    // 상대가 음성 콜을 건 경우
    peer.on("call", async (call) => {
        logSystemMessage("[음성] 친구의 음성 스트림 수신 중...");
        if (!micStream) {
            document.getElementById("mic-toggle").checked = true;
            await toggleMic();
        }
        call.answer(micStream);
        peerMediaCall = call;
        call.on("stream", (remoteStream) => playRemoteStream(remoteStream));
    });
}

async function connectToPeer() {
    const targetId = document.getElementById("target-peer-id").value.trim();
    if (!targetId) {
        showCustomAlert("⚠️ 방 ID 필요", "연결할 친구의 방 ID를 입력해 주세요.<br>예시: singon-room-1234");
        return;
    }
    await connectToPeerDirect(targetId);
}

async function connectToPeerDirect(targetId) {
    initAudio();
    logSystemMessage(`[연결] 친구 방(${targetId})으로 초저지연 연동 시도 중...`);

    peerConnection = peer.connect(targetId);
    setupConnectionListeners();

    if (!micStream) {
        document.getElementById("mic-toggle").checked = true;
        await toggleMic();
    }

    if (micStream) {
        logSystemMessage("[연결] 다이렉트 목소리 링크 전송 시작...");
        peerMediaCall = peer.call(targetId, micStream);
        peerMediaCall.on("stream", (remoteStream) => playRemoteStream(remoteStream));
    }
}

function setupConnectionListeners() {
    peerConnection.on("open", () => {
        logSystemMessage("[성공] 데이터 통신망 구성 완료!");
        setConnectionBadge(true);
        virtualPartnerName = "친구";
        document.getElementById("partner-name").innerText = virtualPartnerName;
        document.getElementById("voice-indicator-partner").innerText = "Online";
        startRttMeasurement();

        // 현재 선곡 상태를 새 참여자에게 공유
        if (karaokeMode === "youtube" && currentVideoId) {
            sendData({ t: "song", mode: "youtube", videoId: currentVideoId });
        }
    });

    peerConnection.on("data", (data) => handlePeerData(data));

    peerConnection.on("close", () => {
        logSystemMessage("[알림] 친구와 연결이 종료되어 솔로 모드로 복원됩니다.");
        setConnectionBadge(false);
        stopRttMeasurement();
        peerConnection = null;
    });
}

// ============================================================
// 데이터 프로토콜 라우터
// ============================================================
function handlePeerData(data) {
    if (!data || typeof data !== "object") return;

    switch (data.t) {
        case "emote":
            triggerEmojiBubble(data.v);
            logPartnerMessage(`리액션: ${data.v}`);
            break;
        case "mode":
            setKaraokeMode(data.mode, false);
            break;
        case "song":
            if (data.mode === "youtube") {
                if (karaokeMode !== "youtube") setKaraokeMode("youtube", false);
                document.getElementById("yt-url-input").value = data.videoId;
                loadYouTubeSong(data.videoId, false);
                logSystemMessage("[선곡] 친구가 유튜브 MR을 선곡했습니다.");
            } else {
                if (karaokeMode !== "synth") setKaraokeMode("synth", false);
                document.getElementById("song-select").value = data.songKey;
                loadSelectedSong(false);
                logSystemMessage("[선곡] 친구가 오리지널 곡을 선곡했습니다.");
            }
            break;
        case "yt":
            handleRemoteYt(data);
            break;
        case "synth":
            handleRemoteSynth(data);
            break;
        case "ping":
            sendData({ t: "pong", t0: data.t0 });
            break;
        case "pong":
            currentRttMs = Math.round(performance.now() - data.t0);
            document.getElementById("latency-display").classList.remove("hidden");
            document.getElementById("rtt-value").innerText = currentRttMs;
            break;
    }
}

function handleRemoteSynth(msg) {
    if (karaokeMode !== "synth") setKaraokeMode("synth", false);
    if (msg.a === "play") {
        document.getElementById("song-select").value = msg.songKey;
        if (!isKaraokePlaying) toggleKaraokeSong();
    } else if (msg.a === "pause" && isKaraokePlaying) {
        pauseSynthSong();
    } else if (msg.a === "stop") {
        stopKaraokeSong(false);
    }
}

// ============================================================
// RTT 측정 (5초마다 ping)
// ============================================================
function startRttMeasurement() {
    stopRttMeasurement();
    rttInterval = setInterval(() => {
        sendData({ t: "ping", t0: performance.now() });
    }, 5000);
    sendData({ t: "ping", t0: performance.now() });
}

function stopRttMeasurement() {
    clearInterval(rttInterval);
    rttInterval = null;
    document.getElementById("latency-display").classList.add("hidden");
}

// ============================================================
// 초대 링크 / 방 ID 공유
// ============================================================
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const tmp = document.createElement("input");
        tmp.value = text;
        document.body.appendChild(tmp);
        tmp.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(tmp);
        return ok;
    }
}

async function copyRoomID() {
    if (!myPeerId) return;
    await copyToClipboard(myPeerId);
    logSystemMessage(`[클립보드] 방 ID (${myPeerId}) 복사 완료. 친구에게 알려주세요!`);
}

async function copyInviteLink() {
    if (!myPeerId) {
        showCustomAlert("⏳ 잠시만요", "방 ID가 아직 생성 중입니다. 잠시 후 다시 시도해 주세요.");
        return;
    }

    const baseUrl = window.location.href.split("?")[0];

    // file:// 또는 임베드 환경이면 링크 공유 불가 → ID 복사로 대체
    if (location.protocol === "file:" || baseUrl.startsWith("blob:")) {
        await copyToClipboard(myPeerId);
        showCustomAlert(
            "🔗 링크 대신 방 ID를 복사했어요",
            `현재는 로컬 파일로 실행 중이라 링크 공유가 불가합니다.<br>배포된 주소에서는 초대 링크가 정상 작동합니다.<br><br>복사된 방 ID: <strong>${myPeerId}</strong>`
        );
        return;
    }

    const inviteUrl = `${baseUrl}?join=${myPeerId}`;
    await copyToClipboard(inviteUrl);
    logSystemMessage("[성공] 초대 링크 복사 완료! 카톡으로 친구에게 공유해 보세요.");
}

async function acceptInvitation() {
    const modal = document.getElementById("invite-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");

    initAudio();
    document.getElementById("mic-toggle").checked = true;
    await toggleMic();

    if (inviteTargetId) connectToPeerDirect(inviteTargetId);
}
