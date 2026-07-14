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

// --- youtube 모드 상태 ---
let ytPlayer = null;
let ytApiReady = false;
let ytApiLoading = false;
let currentVideoId = null;
let ytSyncInterval = null;
let isSyncLeader = false;          // 마지막으로 재생을 시작한 쪽이 리더
const YT_SYNC_INTERVAL_MS = 2000;  // 리더의 sync 브로드캐스트 주기
const YT_DRIFT_FINE = 0.08;        // 초. 이하는 측정 노이즈로 보고 무시
const YT_DRIFT_HARD = 0.6;         // 초. 초과 시 하드 시크 (그 사이는 재생속도 미세조정)
let ytNudgeTimer = null;
let ytNudging = false;
let ytLastCorrectionWasNudge = false;
let ytLastAbsDrift = 0;

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
        // 이미 로드 완료된 경우 폴링
        const check = setInterval(() => {
            if (window.YT && window.YT.Player) {
                ytApiReady = true;
                clearInterval(check);
                resolve();
            }
        }, 200);
        window.onYouTubeIframeAPIReady = () => {
            ytApiReady = true;
            clearInterval(check);
            resolve();
        };
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
                onStateChange: onYtStateChange,
                onError: onYtError
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
    } else if (event.data === YT.PlayerState.ENDED && isKaraokePlaying) {
        isKaraokePlaying = false;
        isSyncLeader = false;
        setPlayButtonState(false);
        stopYtSyncLoop();
        logSystemMessage("[유튜브] 곡이 끝났습니다. 다음 곡을 선곡해 보세요!");
    }
}

// 임베드 비허용(101/150) 등 유튜브 플레이어 오류 처리
function onYtError(event) {
    const code = event.data;
    isKaraokePlaying = false;
    isSyncLeader = false;
    setPlayButtonState(false);
    stopYtSyncLoop();
    currentVideoId = null;

    let title = "⚠️ 유튜브 재생 오류";
    let message;
    if (code === 101 || code === 150) {
        title = "🚫 재생이 차단된 영상";
        message = "음원 권리사가 이 영상의 외부 사이트 재생을 차단했습니다.<br>" +
            "<strong>TJ노래방 공식 MR은 전면 차단</strong>되어 사용할 수 없습니다.<br>" +
            "<strong class=\"text-emerald-400\">금영(KY)노래방 공식 MR</strong>은 재생되는 곡이 많으니 아래에서 검색해 보세요. (곡에 따라 차단될 수 있음)<br><br>" +
            '<a href="https://www.youtube.com/@KARAOKEKY/search" target="_blank" rel="noopener" class="text-cyan-400 underline font-bold">▶ 금영노래방 공식 채널에서 곡 검색 ↗</a><br><br>' +
            "검색 결과에서 곡 주소를 복사해 다시 붙여넣어 주세요.";
    } else if (code === 100) {
        message = "영상을 찾을 수 없습니다.<br>삭제되었거나 비공개 처리된 영상입니다.";
    } else if (code === 2) {
        message = "잘못된 영상 주소입니다.<br>URL을 다시 확인해 주세요.";
    } else {
        message = `영상을 재생할 수 없습니다. (오류 코드: ${code})<br>다른 영상으로 다시 시도해 주세요.`;
    }
    showCustomAlert(title, message);
    logSystemMessage(`[유튜브] 재생 오류 (코드 ${code}). 다른 영상을 불러와 주세요.`);
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
    // 재생 직후 수신 측 버퍼링 지연이 가장 크므로 1초 뒤 조기 sync 1회
    setTimeout(() => {
        if (isSyncLeader && ytPlayer && isKaraokePlaying) {
            sendData({ t: "yt", a: "sync", time: ytPlayer.getCurrentTime() });
        }
    }, 1000);
    ytSyncInterval = setInterval(() => {
        if (isSyncLeader && ytPlayer && isKaraokePlaying) {
            sendData({ t: "yt", a: "sync", time: ytPlayer.getCurrentTime() });
        }
    }, YT_SYNC_INTERVAL_MS);
}

function stopYtSyncLoop() {
    clearInterval(ytSyncInterval);
    ytSyncInterval = null;
    clearRateNudge();
}

// ============================================================
// 드리프트 보정
// 작은 어긋남(0.08~0.6s)은 재생속도 미세조정(0.75x/1.25x)으로 흡수해
// 시크로 인한 재생 끊김 없이 따라잡고, 큰 어긋남만 하드 시크한다.
// ============================================================
function applySyncCorrection(expected) {
    const drift = ytPlayer.getCurrentTime() - expected; // 양수: 내가 앞섬
    const abs = Math.abs(drift);

    if (abs <= YT_DRIFT_FINE) {
        clearRateNudge();
        ytLastCorrectionWasNudge = false;
        ytLastAbsDrift = 0;
        return;
    }

    // 직전 미세조정에도 드리프트가 줄지 않으면(재생속도 변경 미지원 환경) 시크로 전환
    const nudgeIneffective = ytLastCorrectionWasNudge && abs >= ytLastAbsDrift - 0.03;

    if (abs > YT_DRIFT_HARD || nudgeIneffective) {
        clearRateNudge();
        ytPlayer.seekTo(expected, true);
        ytLastCorrectionWasNudge = false;
        logSystemMessage(`[동기화] 드리프트 ${abs.toFixed(2)}s 감지 → 위치 보정.`);
    } else {
        startRateNudge(drift);
        ytLastCorrectionWasNudge = true;
    }
    ytLastAbsDrift = abs;
}

function startRateNudge(drift) {
    ytNudging = true;
    // 1.25x/0.75x는 초당 0.25s를 따라잡음 (피치는 브라우저가 보존)
    ytPlayer.setPlaybackRate(drift > 0 ? 0.75 : 1.25);
    clearTimeout(ytNudgeTimer);
    ytNudgeTimer = setTimeout(() => {
        if (ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(1);
        ytNudging = false;
    }, Math.min(1500, (Math.abs(drift) / 0.25) * 1000));
}

function clearRateNudge() {
    clearTimeout(ytNudgeTimer);
    ytNudgeTimer = null;
    if (ytNudging && ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(1);
    ytNudging = false;
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
        applySyncCorrection(msg.time + compensation);
    }
}

// ============================================================
// 통합 재생 컨트롤 (노래 시작/일시정지/정지 버튼)
// ============================================================
function toggleKaraokeSong() {
    initAudio(); // suspended 상태 resume 포함 (audio.js)

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
}

function pauseSynthSong() {
    isKaraokePlaying = false;
    setPlayButtonState(false);
    stopSynthPlayback();
    clearInterval(karaokeTimer);
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

// 파트너 표시 이름 (연결된 친구)
let virtualPartnerName = "친구";
