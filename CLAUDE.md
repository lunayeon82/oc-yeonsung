# CLAUDE.md — oc-yeonsung 프로젝트 현황

> 이 파일은 Claude Code가 상황 파악용으로 읽는 문서다. 최종 갱신: 2026.08.16.

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
