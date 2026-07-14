// ============================================================
// karaoke.js — 노래방 재생 컨트롤러
// mode: 'youtube' (유튜브 공식 MR 임베드 + P2P 재생 동기화)
//       'synth'   (저작권 프리 오리지널 곡 + 가사 엔진)
// ============================================================

let karaokeMode = "youtube";       // 기본: 유튜브 MR
let isKaraokePlaying = false;

// --- synth 모드 상태 ---
let karaokeTimer = null;
let karaokeSeconds = 0;
let currentSongKey = "citypop";
let virtualSingingInterval = null;

// --- youtube 모드 상태 ---
let ytPlayer = null;
let ytApiReady = false;
let ytApiLoading = false;
let currentVideoId = null;
let ytSyncInterval = null;
let isSyncLeader = false;          // 마지막으로 재생을 시작한 쪽이 리더
const YT_DRIFT_THRESHOLD = 0.4;    // 초. 이 이상 어긋나면 seek 보정

// ============================================================
// 모드 전환
// ============================================================
function setKaraokeMode(mode, broadcast = true) {
    if (karaokeMode === mode) return;
    stopKaraokeSong(false);
    karaokeMode = mode;

    const ytBtn = document.getElementById("mode-btn-youtube");
    const synthBtn = document.getElementById("mode-btn-synth");
    const ytGroup = document.getElementById("yt-input-group");
    const songSelect = document.getElementById("song-select");
    const ytWrap = document.getElementById("yt-player-wrap");
    const lyricsPanel = document.getElementById("lyrics-panel");
    const engineLabel = document.getElementById("engine-label");

    if (mode === "youtube") {
        ytBtn.className = "px-3 py-1.5 bg-red-600/80 text-white transition";
        synthBtn.className = "px-3 py-1.5 bg-slate-950 text-slate-400 hover:text-slate-200 transition";
        ytGroup.classList.remove("hidden");
        songSelect.classList.add("hidden");
        ytWrap.classList.remove("hidden");
        lyricsPanel.classList.add("hidden");
        lyricsPanel.classList.remove("flex");
        engineLabel.innerText = "YouTube Sync";
        logSystemMessage("[모드] 유튜브 MR 모드로 전환. 공식 MR 영상 주소를 불러오세요.");
    } else {
        synthBtn.className = "px-3 py-1.5 bg-violet-600/80 text-white transition";
        ytBtn.className = "px-3 py-1.5 bg-slate-950 text-slate-400 hover:text-slate-200 transition";
        ytGroup.classList.add("hidden");
        songSelect.classList.remove("hidden");
        ytWrap.classList.add("hidden");
        lyricsPanel.classList.remove("hidden");
        lyricsPanel.classList.add("flex");
        engineLabel.innerText = "Procedural Synth";
        loadSelectedSong(false);
        logSystemMessage("[모드] 오리지널 곡 모드로 전환. 저작권 프리 자체 반주로 연주됩니다.");
    }

    if (broadcast) sendData({ t: "mode", mode });
}

// ============================================================
// 유튜브 IFrame API
// ============================================================
function loadYouTubeApi() {
    return new Promise((resolve) => {
        if (ytApiReady) { resolve(); return; }
        if (!ytApiLoading) {
            ytApiLoading = true;
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(tag);
        }
        window.onYouTubeIframeAPIReady = () => {
            ytApiReady = true;
            resolve();
        };
        // 이미 로드 완료된 경우 폴링
        const check = setInterval(() => {
            if (window.YT && window.YT.Player) {
                ytApiReady = true;
                clearInterval(check);
                resolve();
            }
        }, 200);
    });
}

function extractVideoId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    // 이미 11자 ID인 경우
    if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
    const patterns = [
        /(?:youtube\.com\/watch\?.*v=)([\w-]{11})/,
        /(?:youtu\.be\/)([\w-]{11})/,
        /(?:youtube\.com\/embed\/)([\w-]{11})/,
        /(?:youtube\.com\/shorts\/)([\w-]{11})/
    ];
    for (const p of patterns) {
        const m = trimmed.match(p);
        if (m) return m[1];
    }
    return null;
}

async function loadYouTubeSong(videoIdFromPeer = null, broadcast = true) {
    const videoId = videoIdFromPeer || extractVideoId(document.getElementById("yt-url-input").value);
    if (!videoId) {
        showCustomAlert("⚠️ 주소 확인 필요", "유튜브 영상 주소 형식이 아닙니다.<br>예: https://www.youtube.com/watch?v=XXXXXXXXXXX");
        return;
    }

    initAudio();
    await loadYouTubeApi();

    currentVideoId = videoId;

    if (ytPlayer && ytPlayer.loadVideoById) {
        ytPlayer.cueVideoById(videoId);
    } else {
        document.getElementById("yt-player").innerHTML = "";
        ytPlayer = new YT.Player("yt-player", {
            videoId: videoId,
            playerVars: {
                playsinline: 1,
                rel: 0,
                modestbranding: 1
            },
            events: {
                onReady: (e) => {
                    const musicVol = document.getElementById("slider-music-vol").value;
                    e.target.setVolume(parseInt(musicVol, 10));
                    logSystemMessage("[유튜브] MR 영상 로드 완료. 노래 시작을 누르면 친구와 동시 재생됩니다.");
                },
                onStateChange: onYtStateChange
            }
        });
    }

    if (broadcast) {
        sendData({ t: "song", mode: "youtube", videoId });
        logSystemMessage(`[유튜브] 선곡을 친구에게 공유했습니다. (${videoId})`);
    }
}

function onYtStateChange(event) {
    // 유저가 유튜브 컨트롤을 직접 조작한 경우도 상태 동기화
    if (event.data === YT.PlayerState.PLAYING && !isKaraokePlaying) {
        isKaraokePlaying = true;
        isSyncLeader = true;
        setPlayButtonState(true);
        broadcastPlay();
        startYtSyncLoop();
    } else if (event.data === YT.PlayerState.PAUSED && isKaraokePlaying) {
        isKaraokePlaying = false;
        setPlayButtonState(false);
        sendData({ t: "yt", a: "pause", time: ytPlayer.getCurrentTime() });
        stopYtSyncLoop();
    }
}

// ============================================================
// 유튜브 재생 동기화 프로토콜
// 리더(재생을 시작한 쪽)가 주기적으로 sync를 브로드캐스트하고,
// 수신 측은 RTT/2 보정 후 드리프트가 임계값을 넘으면 seek.
// ============================================================
function broadcastPlay() {
    sendData({ t: "yt", a: "play", time: ytPlayer.getCurrentTime() });
}

function startYtSyncLoop() {
    stopYtSyncLoop();
    ytSyncInterval = setInterval(() => {
        if (isSyncLeader && ytPlayer && isKaraokePlaying) {
            sendData({ t: "yt", a: "sync", time: ytPlayer.getCurrentTime() });
        }
    }, 4000);
}

function stopYtSyncLoop() {
    clearInterval(ytSyncInterval);
    ytSyncInterval = null;
}

// peer.js에서 호출: 원격 유튜브 제어 메시지 처리
function handleRemoteYt(msg) {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return;
    const compensation = (typeof currentRttMs === "number" ? currentRttMs : 100) / 2000; // RTT/2 (초)

    if (msg.a === "play") {
        isSyncLeader = false;
        ytPlayer.seekTo(msg.time + compensation, true);
        ytPlayer.playVideo();
        isKaraokePlaying = true;
        setPlayButtonState(true);
        startYtSyncLoop();
        logSystemMessage("[동기화] 친구가 재생을 시작했습니다. 싱크를 맞춥니다.");
    } else if (msg.a === "pause") {
        ytPlayer.pauseVideo();
        isKaraokePlaying = false;
        setPlayButtonState(false);
        stopYtSyncLoop();
        logSystemMessage("[동기화] 친구가 일시정지했습니다.");
    } else if (msg.a === "stop") {
        ytPlayer.stopVideo();
        isKaraokePlaying = false;
        setPlayButtonState(false);
        stopYtSyncLoop();
    } else if (msg.a === "sync" && isKaraokePlaying && !isSyncLeader) {
        const expected = msg.time + compensation;
        const drift = Math.abs(ytPlayer.getCurrentTime() - expected);
        if (drift > YT_DRIFT_THRESHOLD) {
            ytPlayer.seekTo(expected, true);
            logSystemMessage(`[동기화] 드리프트 ${drift.toFixed(2)}s 감지 → 위치 보정.`);
        }
    }
}

// ============================================================
// 통합 재생 컨트롤 (노래 시작/일시정지/정지 버튼)
// ============================================================
function toggleKaraokeSong() {
    initAudio();
    if (audioContext.state === "suspended") audioContext.resume();

    if (karaokeMode === "youtube") {
        if (!ytPlayer || !ytPlayer.playVideo) {
            showCustomAlert("🎵 선곡 필요", "먼저 상단에 유튜브 MR 영상 주소를 붙여넣고 [불러오기]를 눌러주세요.");
            return;
        }
        if (isKaraokePlaying) {
            ytPlayer.pauseVideo(); // onStateChange가 나머지 처리
        } else {
            isSyncLeader = true;
            ytPlayer.playVideo();
        }
        return;
    }

    // --- synth 모드 ---
    if (isKaraokePlaying) {
        pauseSynthSong();
        return;
    }

    isKaraokePlaying = true;
    karaokeSeconds = 0;
    const song = SONGS[currentSongKey];

    setPlayButtonState(true);
    logSystemMessage(`[노래방] '${song.title}' 반주와 가사가 동기화됩니다.`);

    startSynthPlayback(song);
    sendData({ t: "synth", a: "play", songKey: currentSongKey });

    karaokeTimer = setInterval(() => {
        karaokeSeconds += 0.5;
        updateLyricsProgress(song, karaokeSeconds);
    }, 500);

    simulatePartnerDuetText();
}

function pauseSynthSong() {
    isKaraokePlaying = false;
    setPlayButtonState(false);
    stopSynthPlayback();
    clearInterval(karaokeTimer);
    clearInterval(virtualSingingInterval);
    sendData({ t: "synth", a: "pause" });
    logSystemMessage("[노래방] 반주가 일시정지되었습니다.");
}

function stopKaraokeSong(broadcast = true) {
    isKaraokePlaying = false;
    setPlayButtonState(false);

    if (karaokeMode === "youtube") {
        if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
        stopYtSyncLoop();
        if (broadcast) sendData({ t: "yt", a: "stop" });
    } else {
        stopSynthPlayback();
        clearInterval(karaokeTimer);
        clearInterval(virtualSingingInterval);
        karaokeSeconds = 0;
        loadSelectedSong(false);
        if (broadcast) sendData({ t: "synth", a: "stop" });
    }
}

function setPlayButtonState(playing) {
    document.getElementById("play-text").innerText = playing ? "일시정지" : "노래 시작";
    document.getElementById("play-icon").className = playing ? "fa-solid fa-pause" : "fa-solid fa-play";
}

// ============================================================
// synth 모드: 가사 엔진
// ============================================================
function loadSelectedSong(broadcast = true) {
    currentSongKey = document.getElementById("song-select").value;
    const song = SONGS[currentSongKey];

    document.getElementById("lyric-prev").innerText = "";
    document.getElementById("lyric-current").innerText = `준비 완료: ${song.title}`;
    document.getElementById("lyric-next").innerText = "노래 시작 버튼을 눌러 함께 불러보세요!";
    document.getElementById("lyric-singer-turn").innerText = "ALL";

    if (broadcast) sendData({ t: "song", mode: "synth", songKey: currentSongKey });
}

function updateLyricsProgress(song, elapsed) {
    let currentIndex = -1;
    for (let i = 0; i < song.lyrics.length; i++) {
        if (elapsed >= song.lyrics[i].time) currentIndex = i;
    }
    if (currentIndex === -1) return;

    const currentItem = song.lyrics[currentIndex];
    const prevItem = song.lyrics[currentIndex - 1] || { text: "" };
    const nextItem = song.lyrics[currentIndex + 1] || { text: "곡의 마지막 파트입니다." };

    document.getElementById("lyric-prev").innerText = prevItem.text;
    document.getElementById("lyric-current").innerText = currentItem.text;
    document.getElementById("lyric-next").innerText = nextItem.text;

    const turnBadge = document.getElementById("lyric-singer-turn");
    const cur = document.getElementById("lyric-current");

    if (currentItem.singer === "PARTNER") {
        turnBadge.innerText = `👉 ${virtualPartnerName} 파트`;
        turnBadge.className = "text-xs text-pink-400 tracking-widest font-black uppercase mb-2";
        cur.className = "text-2xl font-black text-pink-300 px-4 leading-relaxed neon-text-pink transition-all duration-300";
    } else if (currentItem.singer === "ME") {
        turnBadge.innerText = "👉 내 파트 (불러보세요!)";
        turnBadge.className = "text-xs text-cyan-400 tracking-widest font-black uppercase mb-2";
        cur.className = "text-2xl font-black text-cyan-300 px-4 leading-relaxed neon-text-cyan transition-all duration-300";
    } else {
        turnBadge.innerText = "🙌 함께 부르는 듀엣 파트";
        turnBadge.className = "text-xs text-purple-400 tracking-widest font-black uppercase mb-2";
        cur.className = "text-3xl font-black text-white px-4 leading-relaxed neon-text-cyan transition-all duration-300";
    }
}

// ============================================================
// AI 가상 파트너 (솔로 모드 전용)
// ============================================================
let virtualPartnerName = "민우 (AI)";

function simulatePartnerDuetText() {
    if (isConnected()) return; // 실제 친구가 있으면 AI 침묵
    const lines = [
        "진짜 바로 앞에서 부르는 느낌인데요? 이펙트 대박!",
        "딜레이 셋팅 귀에 꽂히는 느낌 너무 좋아요!",
        "함께 부를 때 목소리 안 엉키는 게 완전 몰입형이네요.",
        "커플노래방 안 부러워요, 집에서 헤드셋 끼니까 꿀잼!",
        "노래 엄청 시원하게 잘하시네요!! 🔥"
    ];
    virtualSingingInterval = setInterval(() => {
        if (!isKaraokePlaying) return;
        logPartnerMessage(lines[Math.floor(Math.random() * lines.length)]);
    }, 12000);
}

function changePartner() {
    const select = document.getElementById("virtual-partner-select");
    const nameSpan = document.getElementById("partner-name");

    if (select.value === "minwoo") {
        virtualPartnerName = "민우 (AI)";
        document.getElementById("partner-avatar").innerHTML = '<i class="fa-solid fa-user-group"></i>';
        logSystemMessage("[파트너] 감미로운 발라더 민우로 교체했습니다.");
    } else {
        virtualPartnerName = "지수 (AI)";
        document.getElementById("partner-avatar").innerHTML = '<i class="fa-solid fa-user-ninja"></i>';
        logSystemMessage("[파트너] 시티팝 보컬 지수로 교체했습니다.");
    }
    nameSpan.innerText = virtualPartnerName;
}
