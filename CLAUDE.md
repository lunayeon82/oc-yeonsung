# CLAUDE.md — oc-yeonsung 프로젝트 현황

> 이 파일은 Claude Code가 상황 파악용으로 읽는 문서다. 최종 갱신: 2026.08.17.

## 프로젝트가 뭔가

OC(창작 캐릭터) 연성(팬픽)·설정 공유 웹앱. 정적 프론트(`public/`, 순수 HTML/JS, 프레임워크 없음) +
Express/better-sqlite3 백엔드(`server/`). 이미지는 Cloudflare R2(`img.lunayeon.com` 커스텀 도메인)에
저장하고 공개 URL로 직접 서빙(LUNA와 달리 프록시 없이 R2 URL이 그대로 노출됨). 사용자는 김굥/하지/예밍
3명 고정(`server/src/db.js` SEED_USERS). 원래 Firebase(Firestore)였다가 SQLite+R2로 이관 완료
(`server/migrate/` 스크립트, `server/DEPLOY.md` 참고). 배포는 Lightsail + nginx + pm2, 서버에서
직접 `git pull` (LUNA처럼 GitHub Actions 자동 배포 아님 — `DEPLOY.md`가 수동 런북).

## 리포 구조

```
server/
├── src/
│   ├── db.js              better-sqlite3 연결 + 스키마 로드 + ensureColumn(컬럼 추가 마이그레이션)
│   ├── schema.sql          전체 테이블 정의 (oc_ 프리픽스 — shared.db를 포켓리스 앱과 공유하기 때문)
│   ├── routes/             characters/stories/lores/images/comments/roles/aus/... 라우터
│   ├── lib/r2.js           R2 업로드/삭제/공개 URL 유틸(uploadObject/deleteObject/toPublicUrl)
│   ├── lib/thumbnail.js    sharp로 썸네일 생성
│   └── middleware/auth.js  requireApiKey — X-API-Key 헤더 검사 (LUNA의 X-LUNA-Token과 동격)
public/
├── character.html          캐릭터 설정(상세/편집) 페이지
├── random-admin.html       오너/그룹/캐릭터 트리 관리자 페이지 (역할/관계성 탭도 같이 있음)
├── story/story-view.html   연성 글 읽기 페이지
├── story/story-write.html  연성 글 작성(캐릭터 태그는 실제 캐릭터 이름 중에서 선택)
└── assets/api.js           전체 백엔드 API 클라이언트 (window.API)
```

## 작업 로그

**2026.08.16 — 캐릭터 대표 이미지(portrait) 추가 + 연성 글 태그 캐릭터 이미지 자동 삽입 (Claude Code)**

사용자가 LUNA 프로젝트(`C:\Users\hoyaw\LUNA`)의 캐릭터 초상화 기능을 참고해 이식해달라고 요청.

**① 캐릭터 대표 이미지 (`character.html`)** — LUNA의 `portraits` 컬렉션 기능과 저장 방식/제한을
동일하게 맞춤:
- R2 키 스킴 `images/portraits/{characterId}.{ext}` (LUNA의 `images/portraits/{file}`와 동일 프리픽스)
- 허용 포맷 png/jpeg/webp/gif, **15MB 제한** (LUNA `readBodyRaw` 제한과 동일 — 이 프로젝트의 다른
  업로드(`upload.js`)는 20MB라 다름, 여기만 LUNA 기준을 따름)
- LUNA는 R2에 메타데이터를 안 두고 프론트에서 확장자를 순차 추측(`onerror` 폴백)했지만, 이 프로젝트는
  이미 다른 이미지 기능들이 SQLite에 경로+`updated_at`을 저장해 캐시버스팅 URL(`?v=`)을 만드는 확립된
  패턴이 있어서 그 쪽을 그대로 따름 — `oc_characters`에 `portrait_path`/`portrait_updated_at` 컬럼 추가
  (`db.js`의 `ensureColumn`), `GET /api/characters`가 캐릭터마다 `portraitUrl`을 내려줌.
- `POST /api/characters/:id/portrait`(multer 업로드, requireApiKey) / `DELETE /api/characters/:id/portrait`
  신설 — LUNA엔 이미지 삭제 API 자체가 없었지만(업로드만 있었음) 사용자가 "설정에서 추가·삭제"를
  요청해서 이 프로젝트의 다른 삭제 라우트(`images.js`의 `r2.deleteObject` 패턴)와 동일한 방식으로 추가.
- 프론트: `character.html` 편집 모드에 진입하면 대표 이미지 원형 박스(96px, 없으면 기존 이니셜
  아바타로 폴백) 아래에 "업로드"/"삭제" 버튼 노출, 파일 선택 즉시 R2 업로드(저장 버튼 안 거침 —
  LUNA와 동일한 즉시 반영 UX). 삭제는 `confirm-modal.js`(이 페이지엔 원래 안 불러오고 있었어서 추가)로
  확인 후 처리. `api.js`에 `uploadCharacterPortrait`/`deleteCharacterPortrait` 추가.

**② 연성 글의 태그된 캐릭터 이미지 자동 삽입 (`story/story-view.html`)** — LUNA의 pair notes
문서(`web/index.html`의 `pair-portrait-row`)에서 페어 캐릭터 이미지를 나란히 보여주는 패턴을 참고.
- 글 로드 시 `API.getStory`와 `API.getCharacters`를 병렬로 불러 캐릭터 이름→`{id, portraitUrl}` 맵을
  만들고(스토리의 캐릭터 태그는 자유 텍스트가 아니라 실제 캐릭터 이름 중에서 고르는 구조라 이름으로
  바로 매칭됨), 대표 이미지가 있는 태그된 캐릭터만(없는 캐릭터는 표시 안 함) 원형 이미지 줄로 렌더링.
- 위치는 글 헤더(제목/메타/캐릭터·역할·관계성 태그/설정 문서 링크, `header-divider`까지)와 챕터
  본문(`ch-tab-strip`/`ch-body`) 사이 — "설명과 본문 사이"라는 요청 그대로.
- 사이즈는 LUNA `.pair-portrait-item .char-portrait-wrap`과 동일한 **160×160px**, 배치도 LUNA의
  `.pair-portrait-row`(`gap:28px`, 가운데 정렬, 줄바꿈 허용)를 그대로 사용 — 모양(원형)과 색상만 이
  프로젝트의 기존 팔레트(보라 계열)·아바타 형태에 맞춤. 클릭하면 `character.html?id=`로 이동.

**검증 한계**: 이 작업 환경엔 `server/node_modules`가 원래 없고(배포는 서버에서 직접
`npm ci`), R2 자격증명도 로컬에 없어 실제 업로드까지 붙는 종단 테스트는 못 함. `npm install` +
`better-sqlite3` 바인딩까지 억지로 맞춰서 `GET /api/characters`가 새 스키마로 정상 기동하는 것만
확인했고, 수정한 모든 HTML의 인라인 `<script>`는 `node --check`로 문법 검증함. **실제 배포 후
캐릭터 이미지 업로드/삭제와 연성 글 페이지 표시를 브라우저에서 한 번 확인해볼 것.**

**2026.08.16 (후속) — 캐릭터 대표 이미지 모양 수정 + 업로드 실패 원인 조사 (미해결) (Claude Code)**

사용자가 배포 후 확인해보니 ① 대표 이미지 박스가 LUNA(200×200px, 둥근 네모)와 다르게 96px 원형이었고
② 업로드 자체가 실패한다고 보고.

- **①은 확인·수정 완료**: `character.html`의 `.char-portrait-wrap`(초상화 있을 때)과 `.char-avatar`
  (없을 때 이니셜 폴백, 기존 72px)를 LUNA와 동일하게 200×200px / `border-radius: 20px`로 통일.
- **② 업로드 실패는 원인 미파악, 재현도 못 함**: `characters.js`의 portrait 라우트를 `node:sqlite`
  (Node 24 내장)로 만든 better-sqlite3 셔임 + R2 모킹으로 감싸서 Express 앱 전체(멀터 파싱 → DB
  저장 → 응답)를 로컬에서 그대로 실행해봤는데 로직 자체는 정상 동작(업로드 201/`portraitUrl` 정상
  반영/삭제 204 모두 확인) — 라우트·멀터 설정·DB 레이어엔 버그가 없어 보임. R2 호출에 `try/catch`가
  없어서 실패 시 조용히 멈추던 것(Express 4는 async 핸들러의 reject를 자동으로 안 잡음)만 고쳐서
  502 + 서버 로그(`portrait upload failed: ...`)로 드러나게 함. **이 수정을 배포한 뒤에도 사용자가
  다시 시도했을 때 여전히 업로드가 실패한다고 확인** — 로컬에서 R2 실제 자격증명 없이는 더 이상
  못 좁힘.
- 확인한 바로는 이 프로젝트 자체 R2 버킷(`R2_BUCKET=oc-yeonsung`, `img.lunayeon.com` 커스텀 도메인)을
  다른 이미지 기능(`upload.js`, `thumbnail.js`)과 동일한 `lib/r2.js` 클라이언트로 그대로 쓰고 있어서
  LUNA 버킷을 잘못 참조하는 것도 아님. 다음에 이어서 볼 사람은 **실제 서버의 `pm2 logs`에서
  `portrait upload failed:` 로그**(에러 원문이 그대로 찍힘) 또는 **브라우저 개발자도구 네트워크 탭에서
  `POST /api/characters/:id/portrait` 응답 상태코드/본문**을 먼저 확보할 것 — 502면 R2 쪽(자격증명/
  버킷 권한/계정ID), 401이면 API_KEY 불일치, 400/`unsupported_type`이면 클라이언트가 보낸 파일의
  mimetype이 png/jpeg/webp/gif 중 하나가 아닌 경우(예: iPhone HEIC), 아예 응답이 없으면(요청이
  hang) nginx `client_max_body_size`/프록시 설정이나 서버가 재시작 안 된 상태(구 코드로 떠 있음)를
  의심할 것.

**2026.08.17 — 캐릭터 목록 정렬/이미지 표시, 뽑기 관리자 오너 선택 리셋 버그 (Claude Code)**

**포트레이트 업로드 후속**: 사용자가 특정 캐릭터(k0101)만 업로드가 안 된다고 보고. 프로덕션
(`oc-yeonsung.lunayeon.com`)에서 그 캐릭터로 직접 업로드/삭제를 재현해봤는데 둘 다 정상 동작함
(DB 상태로 재확인, 테스트 이미지는 원복해둠) — 캐릭터별로 갈리는 코드 경로가 없어서(순수 숫자 id
기반) 특정 캐릭터만 실패할 이유가 없었고, 실제로 재현 안 됨. 사용자가 이후 "이제 해결됐다"고 확인
— 콜드 스타트/재시작 타이밍 같은 일시적 서버 문제였을 가능성이 높음. **② 업로드 실패**(윗 항목)는
결과적으로 이 케이스로 마무리된 것으로 보이나, 재발 시 디버깅 순서는 위 기록대로.

**캐릭터 목록 정렬이 관리자(뽑기) 순서와 다르게 보임**: `character.html` 목록 화면의 "ID순" 정렬
버튼이 실제로는 서버가 내려준 배열 순서(= `sort_order`, 뽑기 관리자 드래그 순서와 동일)를 무시하고
`publicCode`/`id` 문자열로 재정렬하고 있었음. 그 재정렬 로직을 제거하고 API가 준 순서를 그대로
쓰도록 고침, 버튼 라벨도 실제 동작에 맞게 "설정순"으로 변경.

**뽑기 관리자에서 캐릭터 추가 시 오너가 자꾸 김굥/02즈로 강제 리셋**: `random-admin.html`의
`updateSelects()`/`updateCharGroupSelect()`가 오너/서브그룹 `<select>`를 `innerHTML`로 통째로
다시 그리면서 현재 선택값을 유지하지 않던 게 원인. 이 함수가 저장 직후뿐 아니라 **7초 폴링
(`POLL_INTERVAL_MS`)마다도** 호출되기 때문에, 다른 오너를 선택해두고 캐릭터 이름을 입력하는
그 짧은 사이에도 첫 번째 옵션(김굥/02즈)으로 되돌아갔음. 재빌드 전 선택값을 저장했다가 여전히
유효하면(목록에 남아있으면) 복원하도록 수정. 프로덕션에서 실제로 리셋되는 것 재현 확인 후 수정.

**캐릭터 목록에 대표 이미지 표시**: 목록 화면의 각 행이 이름/코드/배지만 보여주고 이미지가 전혀
없었음(포트레이트 기능은 상세 페이지에만 반영돼 있었음). 서브그룹별로 3열 그리드의 카드 형태로
바꿔서, 대표 이미지(없으면 성별 그라디언트 + 이니셜 폴백, 상세 페이지 `.char-avatar`와 동일한
패턴)를 위에, 이름과 기존 배지들(코드/성별/커플여부)을 그 아래에 배치. 실 데이터로 프로덕션
페이지에서 JS/CSS를 임시로 오버라이드해 렌더링 확인 후 커밋(실제 파일은 변경 안 하고 미리보기만
했음 — 배포 전 검증 목적).
