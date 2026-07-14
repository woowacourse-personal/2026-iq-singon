// ============================================================
// peer.js — PeerJS 기반 P2P 연결
// 음성: MediaStream 다이렉트 콜 / 제어: DataConnection
// RTT를 상시 측정해 유튜브 싱크 보정에 사용한다.
// ============================================================

let peer = null;
let myPeerId = "";
let peerConnection = null;      // 듀엣 파트너와의 데이터 연결 (호스트 기준: 첫 접속자)
let peerMediaCall = null;
let inviteTargetId = "";
let currentRttMs = 100; // 기본 가정값. ping/pong으로 갱신
let rttInterval = null;

// --- 관전석 상태 ---
// 듀엣(2인)이 찬 뒤 들어온 접속자는 호스트가 자동으로 관전자로 배정한다.
// 데이터는 호스트 중심 스타형(관전자↔호스트), 음성은 싱어→관전자 단방향 콜.
let myRole = null;              // 'host-singer' | 'guest-singer' | 'spectator' | null(솔로)
let spectatorConns = [];        // 호스트만 사용: 관전자 데이터 연결 목록
let spectatorCalls = [];        // 싱어가 관전자에게 송출 중인 음성 콜
let calledSpectatorIds = new Set();
let lastRosterIds = [];

function isConnected() {
    return !!(peerConnection && peerConnection.open);
}

// 파트너 + 모든 관전자에게 브로드캐스트
function sendData(obj) {
    if (isConnected()) peerConnection.send(obj);
    spectatorConns.forEach((c) => { if (c.open) c.send(obj); });
}

function sendToPartner(obj) {
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
            showCustomAlert('<i class="fa-solid fa-plug-circle-xmark"></i> 연결 실패', "해당 방 ID를 찾을 수 없습니다.<br>친구가 페이지를 열어둔 상태인지, ID에 오타가 없는지 확인해 주세요.");
        } else if (err.type === "unavailable-id") {
            // 4자리 랜덤 ID 충돌 → 새 ID로 재시도
            logSystemMessage("[서버] 방 ID가 이미 사용 중입니다. 새 ID로 재시도합니다.");
            peer.destroy();
            initPeerJS();
        } else {
            logSystemMessage(`[에러] 연결 오류: ${err.type}`);
        }
    });

    // 시그널링 서버 연결 끊김 → 자동 재접속 (기존 ID 유지)
    peer.on("disconnected", () => {
        if (peer.destroyed) return;
        logSystemMessage("[서버] 시그널링 서버와 연결이 끊겼습니다. 재접속 시도 중...");
        peer.reconnect();
    });

    // 상대가 데이터 채널로 들어온 경우: 첫 접속자는 듀엣, 이후는 관전석 자동 배치
    peer.on("connection", (conn) => {
        if (!isConnected()) {
            myRole = "host-singer";
            peerConnection = conn;
            setupConnectionListeners(true);
            logSystemMessage("[성공] 친구가 방에 참여했습니다!");
        } else {
            addSpectator(conn);
        }
    });

    // 상대가 음성 콜을 건 경우
    peer.on("call", async (call) => {
        // 내가 관전자면 듣기 전용으로만 받는다 (싱어들의 목소리 수신)
        if (myRole === "spectator") {
            call.answer();
            call.on("stream", (remoteStream) => playRemoteStream(remoteStream));
            return;
        }

        const fromSpectator = isConnected() && call.peer !== peerConnection.peer;
        if (!micStream && !fromSpectator) {
            document.getElementById("mic-toggle").checked = true;
            await toggleMic();
        }
        call.answer(micStream || undefined);
        if (fromSpectator) return; // 관전자 음성은 재생하지 않음 (듣기 전용 관전석)

        logSystemMessage("[음성] 친구의 음성 스트림 수신 중...");
        peerMediaCall = call;
        call.on("stream", (remoteStream) => playRemoteStream(remoteStream));
    });
}

async function connectToPeer() {
    const targetId = document.getElementById("target-peer-id").value.trim();
    if (!targetId) {
        showCustomAlert('<i class="fa-solid fa-triangle-exclamation"></i> 방 ID 필요', "연결할 친구의 방 ID를 입력해 주세요.<br>예시: singon-room-1234");
        return;
    }
    await connectToPeerDirect(targetId);
}

async function connectToPeerDirect(targetId) {
    initAudio();
    logSystemMessage(`[연결] 친구 방(${targetId})으로 연결 시도 중...`);

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

// isIncoming: 내가 방을 열고 상대가 들어온 경우(호스트). 역할 통보는 호스트만 한다.
function setupConnectionListeners(isIncoming = false) {
    peerConnection.on("open", () => {
        logSystemMessage("[성공] 데이터 통신망 구성 완료!");
        setConnectionBadge(true);
        virtualPartnerName = "친구";
        document.getElementById("partner-name").innerText = virtualPartnerName;
        document.getElementById("voice-indicator-partner").innerText = "Online";
        setPartnerCardVisible(true); // 친구 입장 → 스테이지에 파트너 카드 추가
        startRttMeasurement();

        // 연결 완료 → 노래에 집중하도록 설정 패널 자동 접기
        setSidePanelCollapsed(true, false);
        logSystemMessage("[UI] 설정 패널을 접었습니다. 스테이지 왼쪽 화살표 핸들로 언제든 다시 열 수 있어요.");

        if (isIncoming) {
            peerConnection.send({ t: "role", role: "duet" });
            peerConnection.send({ t: "roster", spectators: currentRosterIds() });
        }

        // 현재 선곡 상태를 새 참여자에게 공유
        if (karaokeMode === "youtube" && currentVideoId) {
            sendData({ t: "song", mode: "youtube", videoId: currentVideoId });
        }
    });

    peerConnection.on("data", (data) => handlePeerData(data));

    const conn = peerConnection;
    conn.on("close", () => handlePartnerDisconnect(conn));
    watchIceState(conn, () => handlePartnerDisconnect(conn));
}

function handlePartnerDisconnect(conn) {
    if (peerConnection !== conn) return; // 이미 처리됐거나 새 파트너로 교체됨
    peerConnection = null;
    try { conn.close(); } catch (e) { /* 이미 닫힘 */ }
    logSystemMessage("[알림] 친구와 연결이 종료되어 솔로 모드로 복원됩니다.");
    setConnectionBadge(false);
    setPartnerCardVisible(false);
    stopRttMeasurement();
    // 남은 관전자가 있는 호스트만 역할 유지 (다음 접속자가 새 듀엣 파트너가 됨)
    if (!(myRole === "host-singer" && spectatorConns.length)) myRole = null;
    broadcastRoster();
}

// 탭 강제 종료처럼 close 이벤트가 오지 않는 끊김을 ICE 상태로 감지한다.
// disconnected는 순간적인 네트워크 흔들림일 수 있어 5초 유예 후 재확인.
function watchIceState(conn, onDead) {
    const DEAD_STATES = ["failed", "closed", "disconnected"];
    const attach = () => {
        const pc = conn.peerConnection;
        if (!pc) return;
        pc.addEventListener("iceconnectionstatechange", () => {
            if (!DEAD_STATES.includes(pc.iceConnectionState)) return;
            setTimeout(() => {
                const cur = conn.peerConnection;
                if (cur && DEAD_STATES.includes(cur.iceConnectionState)) onDead();
            }, 5000);
        });
    };
    if (conn.peerConnection) attach();
    else conn.on("open", attach);
}

// ============================================================
// 관전석 (3번째 이후 참여자 자동 배치)
// ============================================================
function addSpectator(conn) {
    spectatorConns.push(conn);

    conn.on("open", () => {
        conn.send({ t: "role", role: "spectator" });
        // 현재 선곡/모드 상태 공유 → 관전자도 같은 MR을 띄운다
        if (karaokeMode === "youtube" && currentVideoId) {
            conn.send({ t: "song", mode: "youtube", videoId: currentVideoId });
        } else if (karaokeMode === "synth") {
            conn.send({ t: "mode", mode: "synth" });
        }
        broadcastRoster();
        logSystemMessage("[관전] 새 관전자가 입장해 관전석에 배치되었습니다.");
        callNewSpectators([conn.peer]); // 내 목소리 단방향 송출
    });

    conn.on("data", (data) => handleSpectatorData(data, conn));
    conn.on("close", () => removeSpectator(conn));
    watchIceState(conn, () => removeSpectator(conn));
}

function removeSpectator(conn) {
    if (!spectatorConns.includes(conn)) return; // 이미 정리됨
    spectatorConns = spectatorConns.filter((c) => c !== conn);
    calledSpectatorIds.delete(conn.peer);
    try { conn.close(); } catch (e) { /* 이미 닫힘 */ }
    broadcastRoster();
    logSystemMessage("[관전] 관전자가 퇴장했습니다.");
}

// 관전자에게는 리액션/핑만 허용 (재생 제어는 싱어 전용)
function handleSpectatorData(data, conn) {
    if (!data || typeof data !== "object") return;
    if (data.t === "emote") {
        triggerEmojiBubble(data.v);
        logSystemMessage(`[관전자] 리액션: ${emoteLabel(data.v)}`);
        if (isConnected()) peerConnection.send(data);
        spectatorConns.forEach((c) => { if (c !== conn && c.open) c.send(data); });
    } else if (data.t === "ping") {
        conn.send({ t: "pong", t0: data.t0 });
    }
}

function currentRosterIds() {
    return spectatorConns.filter((c) => c.open).map((c) => c.peer);
}

function broadcastRoster() {
    lastRosterIds = currentRosterIds();
    sendData({ t: "roster", spectators: lastRosterIds });
    renderSpectators(lastRosterIds);
}

// 싱어 → 아직 콜을 안 건 관전자에게 목소리 송출 (마이크가 켜져 있을 때만)
function callNewSpectators(ids) {
    if (!micStream || myRole === "spectator") return;
    ids.forEach((id) => {
        if (id === myPeerId || calledSpectatorIds.has(id)) return;
        calledSpectatorIds.add(id);
        spectatorCalls.push(peer.call(id, micStream));
    });
}

// audio.js에서 마이크가 켜질 때 호출 → 기존 관전자에게도 송출 시작
function onMicEnabled() {
    callNewSpectators(lastRosterIds);
}

// 호스트로부터 역할을 통보받은 접속자 측 처리
function applyRole(role) {
    if (role === "spectator") {
        myRole = "spectator";
        // 관전석은 듣기 전용: 마이크 자동 끄기
        const mic = document.getElementById("mic-toggle");
        if (mic.checked) {
            mic.checked = false;
            toggleMic();
        }
        document.getElementById("partner-name").innerText = "싱어";
        showCustomAlert(
            '<i class="fa-solid fa-eye"></i> 관전 모드로 입장',
            "듀엣 자리가 이미 차서 관전석에 배치되었습니다.<br>싱어들의 노래를 감상하며 리액션으로 응원해 보세요!"
        );
        logSystemMessage("[관전] 관전 모드로 입장했습니다. 마이크는 자동으로 꺼졌습니다.");
    } else {
        myRole = "guest-singer";
    }
}

// ============================================================
// 데이터 프로토콜 라우터
// ============================================================
function handlePeerData(data) {
    if (!data || typeof data !== "object") return;

    // 호스트는 파트너발 상태 메시지를 관전자에게 릴레이한다
    if (myRole === "host-singer" && ["mode", "song", "yt", "synth", "emote"].includes(data.t)) {
        spectatorConns.forEach((c) => { if (c.open) c.send(data); });
    }

    switch (data.t) {
        case "role":
            applyRole(data.role);
            break;
        case "roster":
            lastRosterIds = data.spectators || [];
            renderSpectators(lastRosterIds);
            if (myRole !== "spectator") callNewSpectators(lastRosterIds);
            break;
        case "emote":
            triggerEmojiBubble(data.v);
            logPartnerMessage(`리액션: ${emoteLabel(data.v)}`);
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
            sendToPartner({ t: "pong", t0: data.t0 });
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
        sendToPartner({ t: "ping", t0: performance.now() });
    }, 5000);
    sendToPartner({ t: "ping", t0: performance.now() });
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
        showCustomAlert('<i class="fa-solid fa-hourglass-half"></i> 잠시만요', "방 ID가 아직 생성 중입니다. 잠시 후 다시 시도해 주세요.");
        return;
    }

    const baseUrl = window.location.href.split("?")[0];

    // file:// 또는 임베드 환경이면 링크 공유 불가 → ID 복사로 대체
    if (location.protocol === "file:" || baseUrl.startsWith("blob:")) {
        await copyToClipboard(myPeerId);
        showCustomAlert(
            '<i class="fa-solid fa-link"></i> 링크 대신 방 ID를 복사했어요',
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
