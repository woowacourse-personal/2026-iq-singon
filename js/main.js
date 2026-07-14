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

    initPeerJS();
    updateAudioSettings(); // 라벨 초기 표시
};
