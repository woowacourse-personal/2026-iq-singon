# CLAUDE.md — Singon 프로젝트 컨텍스트

이 문서는 Claude Code가 이 레포에서 작업할 때 알아야 할 모든 맥락을 담는다.

## 프로젝트 개요

**Singon(싱온)** — 헤드셋 하나로 접속하는 초저지연 온라인 노래방.
멀리 있는 친구·연인이 P2P(WebRTC)로 음성을 연결하고, 노래방 에코 이펙트를 걸고,
유튜브 공식 MR 영상을 재생 위치 동기화하여 함께 노래를 부르는 웹 서비스.

- 우아한테크코스 Level 3 "불편일기" 과제에서 출발한 아이디어 검증 프로토타입
- 현재 단계: **MVP 완성 → 배포 → 실환경 검증**
- 팀/예산 제약: 사이드 프로젝트, **월 고정비 0원 유지가 절대 원칙** (무료 티어만 사용)

## 핵심 아키텍처 원칙 (변경 금지)

1. **반주는 네트워크로 전송하지 않는다.** 각 클라이언트가 로컬(유튜브 iframe 또는 자체 신스)에서 재생하고, 네트워크로는 목소리(Opus)와 제어 메시지만 오간다.
2. **서버는 일하지 않는다.** 음성은 P2P 다이렉트. 시그널링(현재 PeerJS 공용 서버)만 외부 의존.
3. **오디오 파일을 다운로드/추출하지 않는다.** 유튜브는 iframe 임베드 API만 사용 (저작권 정책). 플레이어는 화면에 노출 상태 유지 (숨기면 약관 위반).
4. **저작권 프리 폴백 유지.** synth 모드(자체 프로시저럴 반주 + 오리지널 가사)는 유튜브 의존 리스크의 폴백이므로 제거하지 않는다.

## 기술 스택

- 순수 정적 웹앱: HTML + Tailwind CDN + 바닐라 JS (빌드 과정 없음, 번들러 없음)
- 스크립트는 ES 모듈이 아닌 전역 스코프, `index.html` 하단의 로드 순서에 의존:
  `songs.js → audio.js → synth.js → karaoke.js → peer.js → ui.js → main.js`
- PeerJS 1.5.4 (CDN) — WebRTC 음성 콜 + DataConnection
- YouTube IFrame Player API — MR 재생 (karaoke.js에서 lazy load)
- Web Audio API — 마이크 에코 FX (딜레이 피드백 루프)

## 파일 구조와 책임

```
index.html      마크업 전체 (onclick 인라인 핸들러 패턴 사용 중)
css/style.css   네온 커스텀 스타일
js/songs.js     저작권 프리 오리지널 곡 DB (가사 + MIDI 노트)
js/audio.js     Web Audio 파이프라인: 마이크, 에코 FX, 모니터링, 원격 스트림 재생
js/synth.js     프로시저럴 신스 반주 엔진
js/karaoke.js   재생 컨트롤러, 모드 전환(youtube/synth), YT iframe 동기화, 가사 엔진
js/peer.js      PeerJS 연결, 데이터 프로토콜 라우터(handlePeerData), RTT 측정, 초대 링크
js/ui.js        채팅 로그, 비주얼라이저, 이모트, 모달, 검증 설문(localStorage)
js/main.js      엔트리포인트 (?join= 파라미터 파싱)
```

## 동기화 프로토콜 (유튜브 모드)

- 재생을 시작한 쪽이 리더(`isSyncLeader`)가 되어 4초마다 `{t:'yt', a:'sync', time}` 브로드캐스트
- 5초 주기 ping/pong으로 RTT 측정 (`currentRttMs`), 수신 측은 RTT/2 보정
- 드리프트 > 0.4초면 `seekTo` 보정
- 데이터 메시지 타입: `mode | song | yt | synth | emote | ping | pong` (peer.js의 handlePeerData 참조)

## 작업 규칙

- **커밋 메시지는 한국어로 작성한다.** 예: `feat: 룸 리버브 추가`, `fix: iOS 사파리 오디오 컨텍스트 재개 처리`
- 마이크 권한 때문에 HTTPS 또는 localhost에서만 동작한다. `file://`로 열면 안 됨.
- 로컬 실행: `python3 -m http.server 5173` → http://localhost:5173
- 혼자 P2P 테스트: 탭 2개 열고 한쪽 방 ID를 반대쪽 '친구 방 ID로 연결'에 입력
- 빌드 도구 도입(번들러, 프레임워크 전환)은 명시적 요청 없이 하지 않는다. 단순함이 이 프로젝트의 배포 전략이다.

## 현재 로드맵 (우선순위 순)

1. **Vercel 프로덕션 배포** ← 지금 여기. 초대 링크가 배포 주소에서만 작동하므로 최우선
2. 실환경 P2P 테스트 (서로 다른 네트워크: LTE↔와이파이). STUN만으로 연결 실패율 확인
3. ConvolverNode 룸 리버브 (노이즈 버스트로 IR 프로시저럴 생성, 외부 에셋 0개)
4. 피드백 설문 localStorage → Supabase 무료 티어 (실제 데이터 수집)
5. 모바일 대응 점검 — 특히 카톡 인앱 브라우저 마이크 권한, iOS 사파리 AudioContext 정책
6. (연결 실패율 높을 경우) TURN 릴레이: Oracle Always Free + coturn
7. (나중) 자체 시그널링: Cloudflare Workers + Durable Objects
8. (나중) 3~4인 방: 풀메시 P2P — 음성만이라 4인까지 메시 가능, 그 이상은 SFU 필요라 보류

## 알려진 리스크 / 주의점

- PeerJS 공용 클라우드 서버는 안정성 보장이 없음 (가끔 연결 실패). 재시도 UX 고려
- iOS 사파리: AudioContext는 유저 제스처 후에만 시작 가능. `resume()` 처리 확인 필요
- 카톡/인스타 인앱 브라우저는 getUserMedia를 차단하는 경우가 있음 → "기본 브라우저로 열기" 안내 필요할 수 있음
- 유튜브 임베드: 일부 영상은 임베드 비허용(에러 101/150). onError 핸들러로 안내 필요 (아직 미구현)
- 에코 피드백 게인은 0.95 상한 유지 (발진 방지). 올리지 말 것

## 검증 목표 (왜 만드는가)

첫 유저 풀은 우테코 동료 ~150명. 검증할 가설:
1. "혼자 MR 틀고 부르기"보다 에코 이펙트 + 친구 연결이 몰입도를 유의미하게 높이는가
2. 장거리 커플/친구가 반복 사용할 만한가 (리텐션 신호)
3. 월 1,000~3,000원 지불 의사가 존재하는가 → 존재하면 KOMCA 협의 + TJ/금영 제휴 검토 단계로
