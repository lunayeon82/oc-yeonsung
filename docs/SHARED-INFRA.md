# oc-yeonsung ↔ PocketRisu 공유 인프라 조사

> 조사만 수행, 코드/설정 변경 없음. 로컬 리포 2개(`C:\Users\hoyaw\oc-yeonsung`,
> `C:\Users\hoyaw\PocketRisu`)와 프로덕션 서버(Lightsail, SSH alias `luna`)를 직접
> 조사해서 작성. 최종 조사일: 2026-08-23.

## 조사 대상

| 앱 | 로컬 경로 | 프로덕션 경로 | pm2 프로세스명 | 포트 | 도메인 |
|---|---|---|---|---|---|
| oc-yeonsung | `C:\Users\hoyaw\oc-yeonsung` | `/home/ubuntu/oc-yeonsung` | `oc-yeonsung-api` | 3001 | oc-yeonsung.lunayeon.com |
| PocketRisu | `C:\Users\hoyaw\PocketRisu` | `/home/ubuntu/PocketRisu` | `risu` | 6001 | risu.lunayeon.com |

두 앱 모두 같은 Lightsail 인스턴스(ubuntu 유저, uid 1000) 위에서 pm2로 관리됨.

---

## ① SQLite — `shared.db`

### 실제로 같은 파일인지 확인

- oc-yeonsung: `server/src/db.js`가 `process.env.DB_PATH || './data/shared.db'`를
  `server/` 기준으로 resolve → 프로덕션 `.env`의 `DB_PATH=./data/shared.db`가
  `/home/ubuntu/oc-yeonsung/server/data/shared.db`로 풀림 (실제 `ls`로 파일 존재 확인).
- PocketRisu: `server/node/authGate.cjs`가 `process.env.RL_SHARED_DB_PATH`를 그대로
  씀 → 프로덕션 `ecosystem.config.cjs`에 **`RL_SHARED_DB_PATH:
  '/home/ubuntu/oc-yeonsung/server/data/shared.db'`가 하드코딩**되어 있음(pm2 env로
  직접 확인). 즉 두 앱이 완전히 동일한 절대경로의 파일 하나를 가리킴.
- 다만 **커넥션은 완전히 분리** — 각 앱이 각자 `new Database(path)`로 별도
  better-sqlite3 프로세스 커넥션을 열고, `journal_mode=WAL`/`foreign_keys=ON`도
  각자 독립적으로 설정(커넥션별 PRAGMA라 문제 없음). PocketRisu는 추가로
  `busy_timeout=5000`을 명시하는데 oc-yeonsung은 명시하지 않음 — 지금 규모(가족
  3~4인 동시 사용)에서 문제 된 적은 없지만, 동시 쓰기가 몰리는 시나리오에서
  oc-yeonsung 쪽이 상대적으로 먼저 `SQLITE_BUSY`를 만날 수 있는 비대칭.
- `oc-yeonsung-api`의 `ecosystem.config.js`엔 이미 `instances: 1 // SQLite is a
  single file — multiple instances would fight over the same WAL lock` 주석으로
  이 제약이 명시돼 있음.

### 테이블별 소유·읽기·쓰기

**oc_* (23개 테이블, 전부 oc-yeonsung 소유 — `server/src/schema.sql`)**

| 테이블 | 만든 곳 | 읽기 | 쓰기 |
|---|---|---|---|
| oc_owners | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_subgroups | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_characters | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_character_sections | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_role_groups | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_roles | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_au_groups | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_aus | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_users | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_stories | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_story_characters | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_story_roles | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_story_aus | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_chapters | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_images | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_image_characters | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_image_tags | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_image_chapters | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_comments | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_draw_box | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_read_later | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_story_box | oc-yeonsung | oc-yeonsung | oc-yeonsung |
| oc_meta | oc-yeonsung | oc-yeonsung | oc-yeonsung |

**rl_* (11개 테이블, 전부 PocketRisu 소유 — `server/node/*.cjs`)**

| 테이블 | 만든 곳 | 읽기 | 쓰기 |
|---|---|---|---|
| rl_users | PocketRisu (`authGate.cjs`) | PocketRisu | PocketRisu |
| rl_chats | PocketRisu (`chatApi.cjs`) | PocketRisu | PocketRisu |
| rl_messages | PocketRisu (`chatApi.cjs`) | PocketRisu | PocketRisu |
| rl_chat_folders | PocketRisu (`chatFolderApi.cjs`) | PocketRisu | PocketRisu |
| rl_lorebooks | PocketRisu (`lorebookApi.cjs`) | PocketRisu | PocketRisu |
| rl_lorebook_versions | PocketRisu (`lorebookApi.cjs`) | PocketRisu | PocketRisu |
| rl_lorebook_locks | PocketRisu (`lorebookApi.cjs`) | PocketRisu | PocketRisu |
| rl_lorebook_drafts | PocketRisu (`lorebookApi.cjs`) | PocketRisu | PocketRisu |
| rl_lorebook_overrides | PocketRisu (`lorebookApi.cjs`, 클라이언트 미사용 dead code) | PocketRisu | PocketRisu |
| rl_pending_generations | PocketRisu (`pendingGenApi.cjs`) | PocketRisu | PocketRisu |
| rl_push_subscriptions | PocketRisu (`pushApi.cjs`) | PocketRisu | PocketRisu |

(PocketRisu는 이 외에 `risuai.db`/`logs.db`라는 **별도 파일**을 더 갖고 있음 —
`shared.db`와 무관, `kv`/`chunks`/`logs` 등은 shared.db에 없음.)

### 교차 참조 조사 결과 — **없음**

- PocketRisu 코드 전체(`server/`, `src/`)에서 `oc_` 문자열이 등장하는 곳은
  `CLAUDE.md` 문서 자체와 무관한 `doc_only`류 오탐 3건뿐 — 실제 `oc_*` 테이블을
  읽거나 쓰는 코드는 0건.
- oc-yeonsung 코드 전체에서 `rl_` 문자열은 아예 등장하지 않음(grep 0건) — 반대
  방향도 없음.
- **"공통 시드"는 실제로 없음**: `oc_users`(김굥/하지/예밍 고정 3인, 뽑기·북마크용)와
  `rl_users`(PocketRisu 자체 로그인 계정)는 이름이 비슷해서 헷갈리기 쉽지만
  **완전히 별개의 테이블**이고 FK로도 코드로도 서로 연결돼 있지 않음. 한쪽 유저를
  지우거나 바꿔도 다른 쪽엔 아무 영향 없음.
- FK 그래프도 완전히 분리: oc_*의 모든 FK는 oc_* 테이블만 참조(예:
  `oc_subgroups.owner_id → oc_owners`, `oc_draw_box.user_id → oc_users`), rl_*의
  모든 FK는 rl_* 테이블만 참조(예: `rl_messages.chat_id → rl_chats`,
  `rl_lorebook_versions.saved_by → rl_users`). 두 그래프를 잇는 FK는 하나도 없음.

### 한쪽 마이그레이션이 다른 쪽을 깨뜨릴 수 있는 지점

1. **DB 전체를 순회/잠그는 작업** — 물리 파일이 공유이므로 이런 작업은 상대 앱에
   영향을 줄 수 있음. 현재는 양쪽 다 이런 코드가 없음: `sqlite_master`를 동적으로
   순회하는 로직 없음, `DROP TABLE`/조건 없는 `DELETE`는 전부 하드코딩된 자기
   프리픽스 테이블명에만 한정(oc-yeonsung `migrate/drop-lore-tables.js`, PocketRisu
   `lorebookApi.cjs`의 `rl_lorebook_locks`/`rl_lorebook_drafts` 재빌드). `VACUUM`은
   oc-yeonsung에 아예 없고, PocketRisu의 `VACUUM`(`/api/db/optimize`)은
   `risuai.db`라는 **별도 파일**에서만 실행 — `shared.db`는 안 건드림. 확인 완료.
2. **테이블 rebuild형 마이그레이션의 FK 오염** — SQLite는 `ALTER TABLE ... RENAME
   TO`를 하면 그 테이블을 참조하는 *다른* 테이블들의 FK 정의 텍스트를 자동으로
   새 이름으로 고쳐 쓴다(`legacy_alter_table` pragma가 꺼져 있을 때 기본 동작).
   이게 oc-yeonsung에서 실제로 한 번 터졌음(2026-08-23,
   `add-autoincrement.js` 사고 — 리빌드 대상이 아닌 형제 oc_ 테이블 7개의 FK
   텍스트가 조용히 깨짐, `CLAUDE.md`에 상세 기록·이미 수정 완료).
   **다만 위 FK 그래프 분리 덕에 이 문제는 oc_* ↔ rl_* 사이에서는 구조적으로
   발생할 수 없다** — SQLite가 고쳐 쓰는 대상은 "리네임된 테이블을 FK로 참조하는
   테이블들"뿐인데, oc_*를 FK로 참조하는 rl_* 테이블도, 그 반대도 없기 때문. 한쪽이
   자기 프리픽스 안에서 리빌드해도 다른 쪽 스키마는 안전하다.
   ⚠️ 단, **이 안전성은 "상대방 프리픽스 테이블을 FK로 참조하지 않는다"는 규율이
   계속 지켜질 때만 유효** — 아래 규칙 참고.
3. **락 경합** — SQLite는 여러 프로세스가 같은 WAL 파일을 여는 것 자체는
   지원하지만, 스키마를 바꾸는 배타적 트랜잭션(rename/rebuild류)을 다른 프로세스가
   그 파일을 열어둔 채로 실행하면 위험. 8/23 사고 복구 때 실제로 `pm2 stop`을
   `oc-yeonsung-api`·`risu` **둘 다** 해야 했던 이유가 이것.
4. **rowid 재사용(AUTOINCREMENT 누락) 버그 클래스** — oc_* 테이블은 전부 이 문제를
   겪고 고쳤음(8/17 캐릭터 id 재배정 사고, 8/23 스키마 전체 AUTOINCREMENT화,
   `CLAUDE.md`에 기록). rl_* 테이블을 직접 확인한 결과: 대부분 PK가 `TEXT`(UUID
   문자열)라서 애초에 이 버그 클래스에 노출되지 않고, 유일한 `INTEGER PRIMARY
   KEY`인 `rl_users.id`도 스키마에 `AUTOINCREMENT`가 이미 명시돼 있음 — 확인
   완료, 조치 불필요.

---

## ② R2 / 오브젝트 스토리지

- **oc-yeonsung**: 버킷 `oc-yeonsung`(커스텀 도메인 `img.lunayeon.com`), 키
  프리픽스: `images/portraits/{characterId}.{ext}`,
  `images/{imagePid}/thumb.webp`,
  `images/{imagePid}/chapters/{chapterPid}/full.webp`. 삭제는 전부 **DB 행에
  저장돼 있던 정확한 키 1개**를 `r2.deleteObject(path)`로 지우는 방식뿐 —
  버킷을 prefix/wildcard로 나열해서 "고아 오브젝트"를 찾는 로직 자체가
  코드에 없음(`ListObjectsV2` 계열 커맨드 미사용, grep 확인). 즉 애초에
  "다른 앱 파일까지 잘못 지울 수 있는" 종류의 청소 로직이 없음.
- **PocketRisu**: R2/S3 클라이언트, 버킷 참조, 키 프리픽스 로직이 코드베이스에
  **전혀 없음** — `package.json`에 `@aws-sdk/client-s3` 의존성 자체가 없고
  (`@aws-crypto`/`@smithy/*`는 Anthropic/Bedrock 요청 서명용으로만 쓰임),
  `server/`·`src/` 전체 grep 결과 R2/S3 관련 코드 0건. 프로덕션 `.env`/pm2
  env에도 `R2_*`/`S3_*`/`AWS_*` 계열 변수가 전혀 없음(SSH로 직접 확인).
- **결론**: 겹치는 프리픽스도, 상호 삭제 위험도 **현재는 존재하지 않음** —
  PocketRisu가 R2를 아예 쓰지 않기 때문. 리스크는 "PocketRisu가 나중에 R2를
  도입하면서 같은 버킷을 재사용하기로 하는 경우"로 국한됨 (아래 규칙 참고).
- 참고(범위 밖, 조사 중 우연히 확인): 같은 서버에 세 번째 앱 LUNA
  (`/home/ubuntu/luna`)도 있고 R2를 씀 — 버킷명이 `private`로 oc-yeonsung의
  `oc-yeonsung` 버킷과 다름, 겹치지 않음. PocketRisu와는 무관하니 더 파고들지 않음.

---

## ③ 기타 — pm2 / nginx / 환경변수

- **pm2**: 완전히 분리된 두 프로세스 — `oc-yeonsung-api`(포트 3001, cwd
  `/home/ubuntu/oc-yeonsung/server`, `instances: 1` 고정) / `risu`(포트 6001, cwd
  `/home/ubuntu/PocketRisu`). 서로 다른 `ecosystem.config.*` 파일, 서로의 pm2
  프로세스를 시작/재시작/중지하는 코드는 양쪽 다 없음.
- **nginx**: 완전히 분리된 서버 블록·도메인 — `oc-yeonsung.lunayeon.com`(정적
  `root` + `/api/` 프록시 → :3001), `risu.lunayeon.com`(전체 프록시 → :6001).
  경로·도메인 겹침 없음. `client_max_body_size`도 각자 다르게 설정(25m vs 100m,
  각 앱 업로드 특성에 맞춰 독립적으로 설정된 값).
- **환경변수**: 두 앱 모두 자기 프로세스 안에서만 유효한 별도 `.env`/pm2 env를
  가짐. `API_KEY`(oc-yeonsung 자체 인증), `R2_*` 자격증명(oc-yeonsung 전용)은
  PocketRisu 프로세스 env에 전혀 없음(직접 확인). 유일하게 "같은 값"을 갖는
  변수는 `RL_SHARED_DB_PATH`(PocketRisu)가 `DB_PATH`(oc-yeonsung)와 같은
  절대경로 **문자열**을 가리키는 것뿐 — 변수 자체를 공유하는 게 아니라, 서로
  다른 변수 이름에 같은 파일 경로를 각자 하드코딩해둔 것.
- ⚠️ **범위 밖이지만 조사 중 발견**: PocketRisu의 `ecosystem.config.cjs`(git
  미추적, 서버 로컬 파일 — 리포에는 없음)에 `ADMIN_USER`/`ADMIN_PASS`가 평문으로
  박혀 있음. DB 공유와는 무관한 별개 사안이라 값은 이 문서에 옮기지 않았음 —
  필요하면 직접 확인 후 교체를 검토하시길.
- **백업**: LUNA용 systemd 타이머(`luna-backup.timer`)가 있지만 LUNA 자신의
  데이터만 R2로 백업 — oc-yeonsung/PocketRisu의 `shared.db`를 건드리는 자동
  백업은 현재 없음. 지금 `server/data/`에 있는 `shared.db.bak-*` 2개는 8/23
  AUTOINCREMENT 마이그레이션 때 수동으로 뜬 1회성 백업.

---

## DB를 분리할 경우 필요한 작업

1. PocketRisu 쪽에 새 SQLite 파일 지정 — `authGate.cjs`에 이미 `RL_SHARED_DB_PATH`가
   비어 있으면 `save/shared-dev.db`로 폴백하는 로직이 있으므로, **코드 변경 없이**
   `ecosystem.config.cjs`에서 `RL_SHARED_DB_PATH` 값만 새 경로(예:
   `/home/ubuntu/PocketRisu/save/shared.db`)로 바꾸는 것만으로 분리 가능.
2. 기존 `rl_*` 11개 테이블의 데이터를 새 파일로 이전 — `sqlite3` CLI에서
   `ATTACH DATABASE '새파일' AS new;`로 붙인 뒤 `INSERT INTO new.rl_x SELECT *
   FROM main.rl_x`를 11개 테이블에 반복하는 방식이 제일 안전(트랜잭션 하나로 묶어서
   원자적으로).
3. 이전 확인 후 기존 `shared.db`에서 `rl_*` 테이블 `DROP`(선택 사항 — 안 지워도
   oc-yeonsung엔 영향 없음, 다만 혼동 방지를 위해 지우는 걸 권장).
4. `ecosystem.config.cjs`의 `RL_SHARED_DB_PATH`를 새 파일 경로로 바꾸고 `risu`
   pm2 프로세스 재시작.
5. 이전 작업 자체는 **두 pm2 프로세스 모두 중지한 상태**에서 진행(락 경합 방지,
   8/23 사고와 동일한 이유) + 시작 전 `shared.db` 전체 백업 필수.
6. (판단 참고용) 이번 조사로 "왜 애초에 `shared.db`를 같이 썼는지"의 실질적 이유가
   현재 코드상으로는 없다는 게 확인됨 — `oc_users`와 `rl_users`가 서로 전혀 안 엮여
   있으므로, 분리해도 기능적으로 잃는 것은 없음.

## 분리 안 하고 갈 경우 지켜야 할 규칙

1. **테이블 프리픽스 규율 유지** — 새 테이블을 추가할 때 항상 자기 프리픽스
   (`oc_`/`rl_`)를 붙일 것. 지금까지 양쪽 다 예외 없이 지켜왔고, 이 문서의
   "위험 없음" 결론 전체가 이 규율에 의존함.
2. **상대방 프리픽스 테이블을 FK로 참조하지 않기** — 지금은 두 FK 그래프가
   완전히 분리돼 있어서 "①-2" 항목의 rename-FK-오염 문제가 앱 경계를 못 넘는데,
   이 규칙을 어기는 순간(예: `oc_` 테이블에서 `rl_users.id`를 FK로 참조하는 기능을
   만드는 순간) 그 안전성이 사라짐.
3. **`sqlite_master` 동적 순회·DB 전체 대상 스크립트 금지** — 전체 백업/VACUUM/
   정합성 검사 등을 새로 짤 때는 반드시 대상 테이블을 프리픽스로 필터링할 것.
   지금까지 안전했던 건 우연이 아니라 둘 다 처음부터 그렇게 짜여 있어서다.
4. **rename/rebuild형 마이그레이션 실행 절차** — 컬럼 추가 이상의 구조 변경(테이블
   rename·rebuild)을 돌릴 때는 반드시 `PRAGMA legacy_alter_table = ON`을 걸고,
   실행 전 `oc-yeonsung-api`·`risu` **둘 다** pm2 stop + `shared.db` 파일 백업.
   oc-yeonsung의 `server/migrate/add-autoincrement.js`가 정확히 이 절차를 따르도록
   이미 고쳐져 있으니, PocketRisu 쪽에서 비슷한 마이그레이션이 필요해지면 이 스크립트를
   템플릿으로 참고할 것.
5. **R2를 PocketRisu가 나중에 도입할 경우** — 버킷을 oc-yeonsung과 공유하더라도
   키 프리픽스를 앱별로 분리(예: `images/` vs `risu/`)하고, 삭제 로직이 자기
   프리픽스 밖의 키를 절대 나열·삭제하지 않도록 할 것 — 지금 oc-yeonsung처럼
   "삭제는 항상 자기 DB에 저장해둔 정확한 키 1개만" 지우는 패턴을 유지하면
   안전. 버킷 전체를 리스팅해서 정리하는 스타일의 GC 스크립트가 이 규칙을 가장
   어기기 쉬운 지점이니 만들 때 특히 주의.
6. **busy_timeout 비대칭** — 지금 당장 문제는 아니지만, 두 앱의 동시 쓰기 빈도가
   늘어나면 oc-yeonsung 쪽에도 PocketRisu처럼 명시적 `busy_timeout`을 설정하는
   걸 고려.
