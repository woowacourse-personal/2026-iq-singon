// ============================================================
// main.js — 엔트리포인트
// ============================================================

window.onload = function () {
    // 초대 링크(?join=...) 파싱
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get("join");

    if (joinId) {
        inviteTargetId = joinId;
        document.getElementById("target-peer-id").value = joinId;
        openModal("invite-modal");
    }

    // 사이드 패널 초기 상태:
    // 초대 링크로 온 게스트는 설정이 필요 없으므로 접힌 채(스테이지 중심) 시작,
    // 호스트는 마지막 상태 복원 (기본: 열림 — 방 ID/초대 링크가 필요)
    if (joinId) {
        setSidePanelCollapsed(true, false);
    } else {
        setSidePanelCollapsed(localStorage.getItem(SIDE_PANEL_KEY) === "1");
    }

    initPeerJS();
    updateAudioSettings(); // 라벨 초기 표시
    renderSpectators([]); // 빈 좌석 그리드 초기 표시
};
