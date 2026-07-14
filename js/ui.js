// ============================================================
// ui.js — 채팅 로그 / 비주얼라이저 / 이모트 / 모달 / 검증 설문
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

    // 2. 파트너 목소리 (실제 스트림 or AI 시뮬레이션)
    const partnerBars = document.getElementById("visualizer-partner").children;
    let partnerVolume = 0;
    let hasSignal = false;

    if (analyserPartner) {
        // 실제 친구 스트림
        analyserPartner.getByteFrequencyData(dataArrayPartner);
        let s = 0;
        for (let i = 0; i < partnerBars.length; i++) {
            const value = dataArrayPartner[i] || 0;
            s += value;
            partnerBars[i].style.height = `${Math.min(100, Math.max(10, (value / 255) * 100))}%`;
        }
        hasSignal = s > 150;
        if (hasSignal) partnerVolume = s;
    } else if (isKaraokePlaying && karaokeMode === "synth") {
        // AI 파트너 시뮬레이션 (synth 모드 솔로 전용)
        const turn = document.getElementById("lyric-singer-turn").innerText;
        if (turn.includes("민우") || turn.includes("지수") || turn.includes("함께")) {
            partnerVolume = Math.sin(Date.now() / 150) * 80 + 110 + Math.random() * 30;
        } else {
            partnerVolume = Math.random() * 10;
        }
        let s = 0;
        for (let i = 0; i < partnerBars.length; i++) {
            const value = partnerVolume * (1 - Math.abs(i - 7) / 10);
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

// --- 이모트 ---
function sendEmote(emote) {
    triggerEmojiBubble(emote);
    const chatBox = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "text-cyan-300";
    div.textContent = `[나] ${emote}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    sendData({ t: "emote", v: emote });
}

function triggerEmojiBubble(emote) {
    const stage = document.getElementById("stage-viewport");
    const bubble = document.createElement("div");
    bubble.innerText = emote;
    bubble.className = "absolute text-3xl pointer-events-none transition-all duration-1000 ease-out z-30 select-none";
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
function closeStatsModal() { closeModal("stats-modal"); }
function closeCustomAlert() { closeModal("custom-alert-modal"); }

function showCustomAlert(title, message) {
    document.getElementById("custom-alert-title").innerHTML = title;
    document.getElementById("custom-alert-message").innerHTML = message;
    openModal("custom-alert-modal");
}

// ============================================================
// 검증 설문 (localStorage)
// ============================================================
const FEEDBACK_STORAGE_KEY = "singon_prototype_feedback";

function submitFeedback(event) {
    event.preventDefault();

    const submission = {
        id: Date.now(),
        immersion: document.getElementById("q1").value,
        audioQuality: document.getElementById("q2").value,
        duetIntention: document.getElementById("q3").value,
        paymentIntention: document.getElementById("q4").value,
        comment: document.getElementById("q-text").value
    };

    const existing = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    const list = existing ? JSON.parse(existing) : [];
    list.push(submission);
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(list));

    const successMsg = document.getElementById("feedback-success-msg");
    successMsg.classList.remove("hidden");
    setTimeout(() => successMsg.classList.add("hidden"), 4000);
    document.getElementById("q-text").value = "";
}

function showFeedbackStats() {
    const existing = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    const list = existing ? JSON.parse(existing) : [];

    if (list.length === 0) {
        showCustomAlert("📊 데이터 없음", "아직 제출된 피드백이 없습니다.<br>설문을 먼저 제출해 주세요!");
        return;
    }

    const total = list.length;
    let q1 = 0, q2 = 0, q3 = 0;
    list.forEach(item => {
        if (parseInt(item.immersion) >= 4) q1++;
        if (parseInt(item.audioQuality) >= 4) q2++;
        if (item.duetIntention === "yes") q3++;
    });

    const pct = (n) => Math.round((n / total) * 100);

    document.getElementById("stat-q1-pct").innerText = `${pct(q1)}%`;
    document.getElementById("stat-q1-bar").style.width = `${pct(q1)}%`;
    document.getElementById("stat-q2-pct").innerText = `${pct(q2)}%`;
    document.getElementById("stat-q2-bar").style.width = `${pct(q2)}%`;
    document.getElementById("stat-q3-pct").innerText = `${pct(q3)}%`;
    document.getElementById("stat-q3-bar").style.width = `${pct(q3)}%`;

    document.getElementById("stat-summary-text").innerHTML =
        `총 <strong>${total}명</strong>이 검증에 참여했습니다. ` +
        `에코 사운드 만족도 <strong>${pct(q2)}%</strong>, 함께 사용 의향 <strong>${pct(q3)}%</strong>.`;

    openModal("stats-modal");
}
