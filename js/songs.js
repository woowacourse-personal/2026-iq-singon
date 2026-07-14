// ============================================================
// songs.js — 저작권 프리 오리지널 곡 DB (synth 모드 폴백용)
// ============================================================

const SONGS = {
    citypop: {
        title: "도시의 밤 (City Pop Duet)",
        bpm: 110,
        lyrics: [
            { time: 0, text: "반주 준비 중... 호흡을 가다듬으세요 🎤", singer: "ALL" },
            { time: 4, text: "도시의 빌딩 숲 위로 저 달빛이 내리면 (파트너)", singer: "PARTNER" },
            { time: 9, text: "화려한 네온사인 아래 홀로 서 있는 너 (나의 파트)", singer: "ME" },
            { time: 14, text: "들려오는 저 멜로디에 우린 끌려가고 있어 (함께)", singer: "ALL" },
            { time: 19, text: "어지러운 세상은 잊고 우리 목소릴 겹쳐봐 (함께)", singer: "ALL" },
            { time: 24, text: "이 헤드폰 속 우리 둘만의 작은 스테이지 (파트너)", singer: "PARTNER" },
            { time: 29, text: "멀리 있어도 바로 옆에 있는 느낌이야 (나의 파트)", singer: "ME" },
            { time: 34, text: "다시 한 번 소리쳐봐 너의 맘이 닿도록! ✨", singer: "ALL" }
        ],
        notes: [
            { beat: 0, notes: [60, 64, 67, 71] },  // Cmaj7
            { beat: 4, notes: [62, 65, 69, 72] },  // Dm7
            { beat: 8, notes: [64, 67, 71, 74] },  // Em7
            { beat: 12, notes: [65, 69, 72, 76] }, // Fmaj7
            { beat: 16, notes: [60, 64, 67, 71] },
            { beat: 20, notes: [62, 65, 69, 72] },
            { beat: 24, notes: [64, 67, 71, 74] },
            { beat: 28, notes: [65, 69, 72, 76] }
        ]
    },
    ballad: {
        title: "첫눈처럼 너에게 (Ballad Duet)",
        bpm: 82,
        lyrics: [
            { time: 0, text: "잔잔한 어쿠스틱 발라드 반주 중... ❄️", singer: "ALL" },
            { time: 4, text: "차가운 바람 타고 흘러온 너의 숨결 (나의 파트)", singer: "ME" },
            { time: 10, text: "내 마음에 내려앉아 지워지지 않는 눈물처럼 (파트너)", singer: "PARTNER" },
            { time: 16, text: "우린 서로를 찾아 헤맸던 오랜 기억 속에 있어 (함께)", singer: "ALL" },
            { time: 22, text: "헤드폰 너머 숨소리까지 가만히 느껴져 (함께)", singer: "ALL" },
            { time: 28, text: "그게 바로 내 품인 것처럼 내 귀에 속삭여줘 (나의 파트)", singer: "ME" },
            { time: 34, text: "시간이 멈춘 이 공간에서 영원히 노랠 부를게...", singer: "ALL" }
        ],
        notes: [
            { beat: 0, notes: [57, 60, 64, 67] },  // Am7
            { beat: 6, notes: [53, 57, 60, 64] },  // Fmaj7
            { beat: 12, notes: [55, 59, 62, 65] }, // G7
            { beat: 18, notes: [48, 52, 55, 59] }, // Cmaj7
            { beat: 24, notes: [57, 60, 64, 67] },
            { beat: 30, notes: [53, 57, 60, 64] }
        ]
    },
    synthpop: {
        title: "우주를 건너 (Synth Pop Duet)",
        bpm: 115,
        lyrics: [
            { time: 0, text: "신나는 우주 여행용 리듬 카운트다운! 💫", singer: "ALL" },
            { time: 4, text: "반짝이는 우주 먼지를 헤치고 네게 가고 있어 (파트너)", singer: "PARTNER" },
            { time: 9, text: "조금 멀리 있어도 우리는 목소리로 통하니까 (나의 파트)", singer: "ME" },
            { time: 14, text: "우주의 끝에서 끝까지 주파수를 맞춰봐 (함께)", singer: "ALL" },
            { time: 19, text: "우리의 화음이 별자리가 되어 하늘에 수놓아져 (함께)", singer: "ALL" },
            { time: 24, text: "이 저지연 비트가 가슴을 뜨겁게 울려 (파트너)", singer: "PARTNER" },
            { time: 29, text: "지금 이 순간만큼은 단 둘뿐인 갤럭시 (나의 파트)", singer: "ME" },
            { time: 34, text: "달려갈게 우주를 건너 너의 목소리 닿는 그곳으로!", singer: "ALL" }
        ],
        notes: [
            { beat: 0, notes: [65, 69, 72, 76] },  // Fmaj7
            { beat: 4, notes: [67, 71, 74, 78] },  // G6
            { beat: 8, notes: [64, 67, 71, 74] },  // Em7
            { beat: 12, notes: [69, 72, 76, 79] }, // Am7
            { beat: 16, notes: [65, 69, 72, 76] },
            { beat: 20, notes: [67, 71, 74, 78] },
            { beat: 24, notes: [64, 67, 71, 74] },
            { beat: 28, notes: [69, 72, 76, 79] }
        ]
    }
};
