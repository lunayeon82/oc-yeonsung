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

**연성 글의 태그 캐릭터 이미지도 대표 이미지 없는 캐릭터까지 표시**: `story-view.html`의
`buildCharPortraitMap`/`buildCharPortraitsHtml`이 `portraitUrl`이 있는 캐릭터만 걸러서 보여주고
있었음(대표 이미지 없으면 그 캐릭터는 태그해도 아예 안 보임). 캐릭터 목록과 동일하게 대표 이미지가
없으면 성별 그라디언트+이니셜 원형 아바타로 폴백하도록 변경 — 이제 태그된 캐릭터는 이미지 유무와
무관하게 항상 다 보임. 실제 스토리("이안이현형제", pid=hkfkum1m — 연이현은 대표 이미지 없음, 이안은
있음)로 프로덕션에서 렌더링 확인 후 커밋.

**뽑기 관리자에 그룹(서브그룹) 순서 변경 + 트리 저장 시 대표 이미지 소실 버그 발견/수정**: 사용자가
"그룹도 위치 변경 가능하게" 요청. `random-admin.html`엔 캐릭터 순서(`moveChar`)만 있고 그룹 자체를
옮기는 기능이 없어서, 캐릭터 행과 동일한 패턴(▲▼ 화살표)으로 `moveGroup(gi,si,dir)`을 추가 —
그룹의 `code`는 그룹 객체에 붙어있는 값이라 배열 내 위치만 바뀌고 번호는 그대로 유지됨.

구현 중 훨씬 심각한 기존 버그를 발견함: `PUT /characters`(`characters.js`의 `replaceTree`)는 저장할
때마다 `oc_owners`를 통째로 `DELETE`하고 클라이언트가 보낸 트리로 전부 재삽입하는 방식이라 모든
행의 `id`가 매번 새로 발급되는데, `insertChar`의 컬럼 목록에 `portrait_path`/`portrait_updated_at`가
아예 빠져 있었음 — 즉 **캐릭터 추가/삭제/순서변경/오너-그룹 추가 등 관리자 페이지에서의 모든 저장
동작이 전체 캐릭터의 대표 이미지를 매번 조용히 날리고 있었음**(R2에 올라간 파일 자체는 안 지워지고
DB 참조만 끊어짐). 이번에 새로 추가하는 그룹 순서변경도 저장을 트리거하므로 그대로 뒀으면 바로
재현됐을 것. `replaceTree`가 `DELETE` 전에 기존 `id → portrait_path/portrait_updated_at` 맵을
먼저 읽어두고, 재삽입 시 트리에 담겨 온 캐릭터의 **이전** `id`로 그 값을 찾아 새 행에 그대로 넣도록
수정(파일명이 새 id와 안 맞아도 `portrait_path`는 문자열 그대로라 URL은 계속 정상 동작함). 로컬에
better-sqlite3 네이티브 바인딩이 없어서(이 환경엔 원래 없음) `node:sqlite`로 만든 셔임 위에 실제
Express 라우터를 통째로 띄워 캐릭터 추가 → 대표 이미지 직접 DB 세팅 → 그룹 순서 변경(swap) → 트리
재저장 → 이미지 URL 유지 확인까지 end-to-end로 검증 후 커밋(테스트 스크립트/셔임은 로컬에만 남기고
정리함, 리포에는 없음).

**캐릭터 '변경' 모달에서 오너/그룹 이동 지원**: 사용자가 캐릭터 수정 시 소속 그룹 자체를 옮길 수
있는지 요청("그룹에 추가하는 로직 + 기존 그룹에서 삭제하는 로직이 동시에"). `editModal`에 이름 밑에
오너/그룹 select 두 개를 추가(현재 소속으로 기본 선택, 오너 바꾸면 그룹 옵션도 갱신). `saveEdit()`에서
선택된 오너/그룹이 원래 위치와 다르면 캐릭터 객체를 기존 subgroup.characters 배열에서
`splice`해서 빼고 대상 subgroup.characters 배열에 `push` — 같은 객체 레퍼런스를 옮기는 거라
note/customSections/포트레이트 등 나머지 내용은 그대로 유지되고, id만 (바로 위 버그 수정 로직 덕에)
포트레이트까지 보존된 채로 새로 발급됨. 이름 중복 체크도 소스가 아니라 타겟 그룹 기준으로 수정.
위와 동일한 로컬 Express+`node:sqlite` 하니스로 이동 전/후 그룹 구성, 메모, 커스텀 섹션, 포트레이트
URL이 모두 기대대로 나오는 것 확인 후 커밋.

**캐릭터 코드(publicCode)는 그룹 이동해도 안 건드리기로 결정**: 위 그룹 이동 기능을 만든 뒤 "코드가
옛 그룹 걸로 남아있으면 다른 데서 문제 안 생기냐"는 질문이 나와서 확인함 — 어디서도 코드를 파싱해서
소속 그룹을 역산하는 곳은 없고(실제 소속은 항상 트리 구조/`subgroup_id`로만 판단), 코드는 순수
표시용 라벨이라 옮겨도 다른 화면이 깨지진 않음. 실질 영향은 ① 화면에 옛 그룹 코드가 그대로 보이는
것과 ② `random-admin.html`의 `addChar()`가 그룹 내 "다음 번호"를 그룹 멤버들의 코드 끝자리로
계산하는데(`publicCodeSuffix`), 옮겨온 캐릭터의 옛 끝자리가 섞여서 새 그룹 번호가 튀는 것 정도.
**"ID 일괄 부여"(`migrateIds()`)는 코드가 없는 캐릭터만 채우고 이미 있는 코드는 안 건드리므로 이걸로
해결되는 문제가 아님**(세션 중 한 번 잘못 안내했던 부분 — 정정). 사용자가 "코드 재계산은 건드릴 데가
많아지니 그냥 두자"고 결정 — **코드는 최초 생성 시 부여된 값을 고유 식별자처럼 그대로 유지**하고,
그룹 이동 기능은 이 문서 위 항목에 적은 그대로(코드는 안 건드림)가 최종 사양임. 나중에 이 트레이드오프를
바꾸고 싶어지면 `saveEdit()`의 이동 분기에서 `it.publicCode = null`로 비우는 정도가 제일 싼 절충안이란
얘기까지 오갔지만 채택 안 함.

**뽑기 관리자에서 오너 추가/삭제 UI 숨김**: 오너는 김굥/하지/예밍 3명 고정 운영이라, 실수로 새 오너를
만들거나 지우는 사고를 막기 위해 "오너 추가" 카드와 각 오너 헤더의 "오너 삭제" 버튼을 화면에서 뺐음
(런타임 렌더 함수 `renderChars()`뿐 아니라, `random-admin.html` 소스에 예전부터 박혀있던 정적
스냅샷 HTML 3곳도 동일하게 정리 — 아래 참고). `addOwner()`/`delOwner()` 함수 자체는 지우지 않았으니
나중에 필요해지면 숨긴 마크업만 되살리면 됨.

**참고(이번에 손 안 댐): `random-admin.html`에 렌더링된 캐릭터 트리의 정적 HTML 스냅샷이 소스에
박혀있음**. `renderChars()`(실제 동작하는 템플릿 함수, 1200번대 줄)와 별개로, 파일 앞쪽(300~950번대
줄)에 예전 프로덕션 데이터가 그대로 굳어진 정적 마크업 블록이 있음 — 페이지 로드 시 JS가
`#charList.innerHTML`을 즉시 덮어써서 기능상 문제는 없지만(오너 삭제 버튼 3개만 이번에 같이 지움),
이 블록 자체가 지금 실제 데이터와 다르고 유지보수 시 혼동 소지가 있음. 원인 미상 — 아마 예전에
"페이지 저장"류 작업이 실수로 렌더된 DOM을 소스에 커밋한 것으로 추정. 다음에 이 파일을 크게 손볼
일이 있으면 이 정적 블록을 통째로 지우고 `<div id="charList"></div>`만 남기는 정리를 고려할 것.

**오늘(2026.08.17) 세션 마무리**: 위 항목 전부 커밋·푸시 완료. 로컬엔 R2 자격증명이 없고
`server/node_modules`의 `better-sqlite3`도 네이티브 바인딩이 안 잡혀 있어서, DB/API 로직 검증은
전부 `node:sqlite` 셔임 위에 실제 Express 라우터를 띄우는 방식으로 했고(테스트 스크립트는 로컬에만
남기고 정리, 리포엔 없음), 프론트 UI 검증은 프로덕션 페이지에 JS/CSS를 임시로 주입해 실제 데이터로
렌더링만 확인(실제 저장은 한 번도 안 함 — 배포 전 백엔드가 아직 포트레이트 보존 버그를 안 고친
상태라 실제 저장을 트리거하면 대표 이미지가 날아갈 수 있었기 때문). **배포는 서버에서
`git pull`(수동 런북, `DEPLOY.md`) — 이 세션에서 만든 변경 전부 아직 미배포 상태이니, 다음에 이어서
볼 사람은 배포 후 최소 아래를 브라우저로 한 번 확인할 것**: 캐릭터 목록 이미지/정렬, 연성 글 태그
이미지, 뽑기 관리자에서 그룹 순서변경·캐릭터 그룹이동·오너추가삭제 버튼이 안 보이는지.

**2026.08.17 (후속2) — 캐릭터 id가 트리 저장마다 재배정되던 근본 버그 수정 (Claude Code)**

사용자가 모바일에서 "한 캐릭터 이미지를 업로드했더니 다른 캐릭터 이미지가 바뀐다"고 보고("캐릭터
추가해서 그런가"라는 본인 추측 포함). 로직을 확인해보니 실제로 구조적인 버그였음.

**원인**: `oc_characters.id`가 `INTEGER PRIMARY KEY`일 뿐 `AUTOINCREMENT`가 아닌데,
`PUT /api/characters`(`replaceTree`, `random-admin.html`의 캐릭터 추가/순서변경/오너·그룹이동이
전부 이 엔드포인트로 트리 전체를 저장)가 매번 `oc_owners`를 통째로 DELETE하고 트리를 처음부터
재INSERT하는 방식이었음 — DELETE 후 재INSERT하니 SQLite가 낮은 rowid부터 재사용해서, **트리를
저장할 때마다 모든 캐릭터의 `id`가 바뀌고 심지어 방금 전까지 다른 캐릭터가 쓰던 번호를 그대로
재사용**했음. 그런데 대표 이미지 경로(`images/portraits/{id}.ext`), `POST/DELETE
/api/characters/:id/portrait`, `PUT /api/characters/:id`, 그리고 `character.html?id=` URL이
전부 이 id를 그대로 참조함. 그래서 누군가 `character.html`을 열어둔 채로 있는 동안(모바일에서
흔함) 다른 사람이(또는 본인이 다른 탭에서) `random-admin.html`에서 캐릭터를 추가하는 등 트리
저장을 한 번이라도 하면, 열어둔 페이지가 들고 있던 id는 조용히 다른 캐릭터를 가리키게 되고, 그
상태에서 이미지를 업로드하면 엉뚱한 캐릭터의 대표 이미지가 덮어써짐. 8/16~17에 고쳤던
"트리 저장 시 대표 이미지 소실" 버그(바로 위 항목들)와는 별개의, 더 근본적인 문제였음 — 그 수정은
"id가 바뀌어도 portrait_path를 잃지 않게" 땜빵한 것이었지, id 자체가 바뀌는 것 자체는 그대로였음.

**수정**: `replaceTree`를 delete-all-reinsert에서 **UPDATE 기반 upsert**로 변경
(`server/src/routes/characters.js`) — 트리에 `id`가 있고 그 id가 실제로 존재하면 UPDATE(그 id
그대로 유지, portrait 컬럼은 손도 안 대니 자동으로 보존됨), 없으면 신규 INSERT, 저장된 트리에서
빠진 기존 캐릭터만 명시적으로 DELETE. 오너/서브그룹은 어디서도 id로 참조되지 않아서(포트레이트도
없고, 프론트가 owner/subgroup에 id 자체를 안 받음) 여전히 매번 새로 만들지만, **새 서브그룹을
먼저 insert해서 유지할 캐릭터들을 거기로 옮겨 붙인 다음에** 옛 서브그룹/오너를 지우는 순서로 바꿔서
FK cascade가 유지할 캐릭터를 같이 지워버리는 일이 없게 함(better-sqlite3 트랜잭션 안에서는
`PRAGMA foreign_keys` 토글이 no-op이라 그 방법은 못 씀, 순서로 해결).

**검증**: 로컬에 R2 자격증명도 없고 `server/node_modules`의 `better-sqlite3` 네이티브 바인딩도
없어서, 이전 세션과 동일하게 `node:sqlite`로 만든 better-sqlite3 호환 셔임 위에 실제 Express
라우터(`characters.js`)를 그대로 띄워 HTTP로 검증(셔임/테스트 스크립트는 스크래치패드에만 남기고
리포엔 커밋 안 함). 시나리오: ① 캐릭터 2명 저장 → 대표 이미지 DB에 직접 세팅 → 무관한 캐릭터
추가와 함께 트리 재저장 → 기존 2명의 id·이미지·커스텀섹션 그대로 유지되고 신규 캐릭터만 새 id를
받는지, ② 캐릭터를 다른 오너/그룹으로 이동 + 커스텀 섹션 수정 + 다른 캐릭터 삭제를 동시에 트리
재저장 → 이동된 캐릭터는 id·이미지 유지한 채 새 위치·수정된 섹션 내용이 반영되고, 삭제된 캐릭터는
DB에서 실제로 사라지며 섹션도 orphan 없이 같이 지워지고, 오너/서브그룹 테이블도 매 저장마다
누적되지 않고 현재 트리 개수만 유지되는지 — 총 15개 검증 항목 전부 통과 확인 후 커밋
(`e84afd0`)·푸시 완료. **아직 서버에 미배포 — 다음에 이어서 볼 사람은 `git pull` 후 최소
random-admin.html에서 캐릭터 추가/순서변경/그룹이동을 한 번 해보고, 그 사이 다른 캐릭터의
대표 이미지 URL이 안 바뀌는지 확인할 것.**

**2026.08.17 (후속3) — 연성 글 태그 캐릭터 이미지, 모바일에서 폭 대비 원 크기가 고정값(160px)이라
너무 크게 보임 (Claude Code)**

사용자가 모바일에서 확인해보니 `story-view.html`의 태그 캐릭터 원형 이미지(160×160px 고정)가
좁은 화면 폭에 비해 과도하게 크다고 보고, "동그라미 크기는 폭에 따라서 변동되어야 할 거 같다"고
요청. `.story-char-portrait-img-wrap`의 `width/height: 160px` 고정값을
`width: clamp(64px, 24vw, 160px)` + `aspect-ratio: 1/1`로 바꿔서, 넓은 화면(≥720px 컨테이너
기준)에서는 기존과 동일하게 160px을 유지하면서 좁은 화면에서는 뷰포트 폭에 비례해 최소 64px까지
줄어들도록 함. 폴백 이니셜 아바타 글자 크기(`clamp(1.1rem, 6vw, 2.4rem)`)와 이미지 사이 간격
(`clamp(14px, 5vw, 28px)`)도 같이 비례하도록 조정. **검증 한계**: 이번 세션에 연결된 Chrome
확장이 이 작업 환경과 다른 네트워크에 있어서(로컬 loopback 서버로 미리보기를 못 띄움) 실제
스크린샷 확인은 못 했고, iPhone 폭(375px) 기준 24vw ≈ 90px로 계산되는 등 CSS 수치 계산으로만
검증 후 커밋(`05ed4b1`)·푸시함. **다음에 이어서 볼 사람은 배포 후 모바일 실기기(또는 브라우저
반응형 모드)에서 실제로 원 크기가 폭에 맞게 줄어드는지 눈으로 한 번 확인할 것.**
