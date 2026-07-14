// ============================================================
// ui.js — 채팅 로그 / 사이드 패널 / 비주얼라이저 / 이모트 / 모달
// ============================================================

// --- 채팅 로그 ---
function logSystemMessage(msg) {
    const chatBox = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "text-slate-400 text-[11px]";
    div.textContent = msg;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function logPartnerMessage(msg) {
    const chatBox = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "text-pink-400 font-bold";
    div.innerHTML = `<span class="text-slate-500">[${virtualPartnerName}]</span> `;
    div.appendChild(document.createTextNode(msg));
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- 사이드 패널 (연결/이펙트 콘솔) 접기·펴기 ---
const SIDE_PANEL_KEY = "singon_side_panel_collapsed";

// persist=false: 게스트 진입/연결 시 자동 접기처럼 강제로 바꾸는 경우.
// 사용자가 직접 토글한 상태만 다음 방문에 기억한다.
function setSidePanelCollapsed(collapsed, persist = true) {
    const panel = document.getElementById("side-panel");
    const stage = document.getElementById("stage-section");
    panel.classList.toggle("hidden", collapsed);
    stage.classList.toggle("lg:col-span-8", !collapsed);
    stage.classList.toggle("lg:col-span-12", collapsed);

    // 접힘: 스테이지가 화면 전체로 퍼지지 않게 중앙 정렬하고 내부 요소를 키워 여백 균형을 맞춤
    stage.classList.toggle("lg:max-w-5xl", collapsed);
    stage.classList.toggle("lg:mx-auto", collapsed);
    stage.classList.toggle("w-full", collapsed);
    const ytWrap = document.getElementById("yt-player-wrap");
    ytWrap.classList.toggle("max-w-xl", !collapsed);
    ytWrap.classList.toggle("max-w-3xl", collapsed);
    const lyricsPanel = document.getElementById("lyrics-panel");
    lyricsPanel.classList.toggle("max-w-xl", !collapsed);
    lyricsPanel.classList.toggle("max-w-3xl", collapsed);

    // 핸들 방향(데스크탑)과 토글 바 문구(모바일) 갱신
    document.getElementById("side-panel-handle-icon").className =
        collapsed ? "fa-solid fa-chevron-right text-xs" : "fa-solid fa-chevron-left text-xs";
    document.querySelectorAll(".side-panel-toggle-text").forEach((el) => {
        el.innerText = collapsed ? "설정 패널 열기" : "설정 패널 닫기";
    });
    // 참고: duet-cards는 고정 폭 카드(flex)라 접힘 시 별도 보정 불필요

    if (persist) localStorage.setItem(SIDE_PANEL_KEY, collapsed ? "1" : "0");
}

function toggleSidePanel() {
    setSidePanelCollapsed(!document.getElementById("side-panel").classList.contains("hidden"));
}

// --- 스테이지 하단 마이크 퀵 토글 (패널이 접혀 있어도 마이크 제어 가능) ---
async function quickToggleMic() {
    const cb = document.getElementById("mic-toggle");
    cb.checked = !cb.checked;
    await toggleMic();
}

function syncQuickMicBtn() {
    const btn = document.getElementById("quick-mic-btn");
    if (!btn) return;
    const on = !!micStream;
    btn.innerHTML = on
        ? '<i class="fa-solid fa-microphone"></i> 마이크 ON'
        : '<i class="fa-solid fa-microphone-slash"></i> 마이크 OFF';
    btn.className = on
        ? "bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold px-4 py-3 rounded-2xl flex items-center gap-2 transition duration-200 text-sm shadow-md shadow-pink-500/20"
        : "bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-3 rounded-2xl flex items-center gap-2 transition duration-200 text-sm";
}

// --- 파트너 카드: 친구가 접속하면 스테이지에 추가 ---
function setPartnerCardVisible(visible) {
    const card = document.getElementById("visual-partner-card");
    card.classList.toggle("hidden", !visible);
    card.classList.toggle("flex", visible);
}

// --- 관전석: roster 수신 시 좌측에 관전자 칩 자동 배치 ---
function renderSpectators(ids) {
    const box = document.getElementById("spectator-box");
    const list = document.getElementById("spectator-list");
    box.classList.toggle("hidden", ids.length === 0);
    box.classList.toggle("flex", ids.length > 0);
    document.getElementById("spectator-count").innerText = ids.length;

    list.innerHTML = "";
    ids.forEach((id, i) => {
        const isMe = id === myPeerId;
        const chip = document.createElement("div");
        chip.className = "flex items-center gap-2 bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-full pl-1.5 pr-3 py-1";
        chip.innerHTML =
            '<span class="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 flex items-center justify-center text-[10px]"><i class="fa-solid fa-eye"></i></span>' +
            `<span class="text-[11px] font-semibold ${isMe ? "text-violet-300" : "text-slate-300"}">관전자 ${i + 1}${isMe ? " (나)" : ""}</span>`;
        list.appendChild(chip);
    });
}

// --- 연결 상태 배지 ---
function setConnectionBadge(connected) {
    const badge = document.getElementById("connection-status-badge");
    if (connected) {
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> 실시간 연결 (듀엣)`;
        badge.className = "px-2.5 py-0.5 rounded-full text-xs bg-emerald-950 text-emerald-400 flex items-center gap-1.5";
    } else {
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-slate-500 animate-pulse"></span> 오프라인 (솔로)`;
        badge.className = "px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-slate-400 flex items-center gap-1.5";
    }
}

// --- 비주얼라이저 ---
function createVisualizerBars(containerId, count, colorTheme) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    const colorClass = colorTheme === "cyan" ? "bg-cyan-400" : "bg-pink-400";
    for (let i = 0; i < count; i++) {
        const bar = document.createElement("div");
        bar.className = `w-1.5 rounded-full ${colorClass} transition-all duration-75`;
        bar.style.height = "4px";
        container.appendChild(bar);
    }
}

let visualizerRunning = false;
function startVisualizerLoop() {
    if (visualizerRunning) return;
    visualizerRunning = true;
    renderVisualizers();
}

function renderVisualizers() {
    requestAnimationFrame(renderVisualizers);

    // 1. 내 목소리
    if (analyserMe && micStream) {
        analyserMe.getByteFrequencyData(dataArrayMe);
        let sum = 0;
        const bars = document.getElementById("visualizer-me").children;
        for (let i = 0; i < bars.length; i++) {
            const value = dataArrayMe[i] || 0;
            sum += value;
            bars[i].style.height = `${Math.min(100, Math.max(10, (value / 255) * 100))}%`;
        }

        const indicator = document.getElementById("voice-indicator-me");
        const meCard = document.getElementById("visual-me-card");
        if (sum > 100) {
            indicator.innerText = "Singing 🎤";
            indicator.className = "text-[10px] text-cyan-400 mt-1 uppercase tracking-widest font-mono font-bold";
            meCard.style.boxShadow = "0 0 15px rgba(34, 211, 238, 0.4)";
            triggerAmbientPulse("cyan", sum / 500);
        } else {
            indicator.innerText = "Listening";
            indicator.className = "text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-mono";
            meCard.style.boxShadow = "none";
        }
    }

    // 2. 파트너(친구) 목소리
    const partnerBars = document.getElementById("visualizer-partner").children;
    let hasSignal = false;

    if (analyserPartner) {
        analyserPartner.getByteFrequencyData(dataArrayPartner);
        let s = 0;
        for (let i = 0; i < partnerBars.length; i++) {
            const value = dataArrayPartner[i] || 0;
            s += value;
            partnerBars[i].style.height = `${Math.min(100, Math.max(10, (value / 255) * 100))}%`;
        }
        hasSignal = s > 150;
    }

    const pIndicator = document.getElementById("voice-indicator-partner");
    const pCard = document.getElementById("visual-partner-card");
    if (hasSignal) {
        pIndicator.innerText = "Vocal Recv ⚡";
        pIndicator.className = "text-[10px] text-pink-400 mt-1 uppercase tracking-widest font-mono font-bold";
        pCard.style.boxShadow = "0 0 15px rgba(236, 72, 153, 0.4)";
        triggerAmbientPulse("pink", 0.3);
    } else {
        pCard.style.boxShadow = "none";
    }
}

// --- 무대 앰비언트 라이팅 ---
function triggerAmbientPulse(color, intensity) {
    const glow = document.getElementById("ambient-glow");
    const stage = document.getElementById("stage-viewport");
    const alpha = Math.min(0.4, intensity);

    if (color === "cyan") {
        glow.style.background = `linear-gradient(to top right, rgba(34, 211, 238, ${alpha}), #020617 50%, rgba(131, 24, 67, 0.1))`;
        stage.style.borderColor = `rgba(34, 211, 238, ${0.3 + alpha})`;
    } else {
        glow.style.background = `linear-gradient(to top right, rgba(22, 78, 99, 0.1), #020617 50%, rgba(236, 72, 153, ${alpha}))`;
        stage.style.borderColor = `rgba(236, 72, 153, ${0.3 + alpha})`;
    }
}

// --- 이모트 (FontAwesome 아이콘 기반) ---
const EMOTES = {
    clap:  { icon: "fa-hands-clapping", color: "text-amber-300",  label: "박수" },
    fire:  { icon: "fa-fire",           color: "text-orange-400", label: "불타오름" },
    heart: { icon: "fa-heart",          color: "text-rose-400",   label: "하트" },
    star:  { icon: "fa-star",           color: "text-yellow-300", label: "최고" }
};

function emoteLabel(key) {
    return EMOTES[key] ? EMOTES[key].label : key;
}

function sendEmote(key) {
    triggerEmojiBubble(key);
    const chatBox = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "text-cyan-300";
    div.textContent = `[나] ${emoteLabel(key)}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    sendData({ t: "emote", v: key });
}

function triggerEmojiBubble(key) {
    const stage = document.getElementById("stage-viewport");
    const bubble = document.createElement("div");
    const emote = EMOTES[key];
    if (emote) {
        bubble.innerHTML = `<i class="fa-solid ${emote.icon} ${emote.color}"></i>`;
    } else {
        bubble.innerText = key; // 구버전 클라이언트가 보낸 이모지 폴백
    }
    bubble.className = "absolute text-3xl pointer-events-none transition-all duration-1000 ease-out z-30 select-none drop-shadow-lg";
    bubble.style.left = `${Math.random() * 60 + 20}%`;
    bubble.style.bottom = "80px";
    bubble.style.opacity = "1";
    bubble.style.transform = "scale(0.8) translateY(0)";
    stage.appendChild(bubble);

    setTimeout(() => {
        bubble.style.opacity = "0";
        bubble.style.transform = "scale(1.5) translateY(-180px)";
    }, 50);
    setTimeout(() => bubble.remove(), 1100);
}

// --- 모달 공통 ---
function openModal(id) {
    const m = document.getElementById(id);
    m.classList.remove("hidden");
    m.classList.add("flex");
}
function closeModal(id) {
    const m = document.getElementById(id);
    m.classList.add("hidden");
    m.classList.remove("flex");
}

function showSharingGuide() { openModal("sharing-guide-modal"); }
function closeSharingGuide() { closeModal("sharing-guide-modal"); }
function closeCustomAlert() { closeModal("custom-alert-modal"); }

function showCustomAlert(title, message) {
    document.getElementById("custom-alert-title").innerHTML = title;
    document.getElementById("custom-alert-message").innerHTML = message;
    openModal("custom-alert-modal");
}

