# Firestore → SQLite/R2 마이그레이션

**반드시 `server/` 디렉터리에서 실행하세요** (모든 스크립트가 `../src/db` 등 상대 경로로 서로를 참조합니다).

## 0. 준비

1. `server/.env`를 `.env.example`을 복사해서 만들고 값 채우기 (`API_KEY`, `R2_*`).
2. Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"으로 서비스 계정 JSON을 발급받아 `server/migrate/serviceAccountKey.json`으로 저장 (이 파일은 `.gitignore`에 포함되어 있어 커밋되지 않습니다. 각 잡업로 유출되지 않게 주의하세요).
3. `server/.env`의 `GOOGLE_APPLICATION_CREDENTIALS`가 `./migrate/serviceAccountKey.json`을 가리키는지 확인.
4. `npm install` (아직 안 했다면).

## 1. Firestore 덤프

```
node migrate/firestore-export.js
```

`migrate/dump/*.json`에 컬렉션별 JSON이 생성됩니다 (`data.json`, `characters.json`, `stories.json`, `chapters.json`, `lores.json`, `loreChapters.json`, `images.json`, `imageChapters.json`, `comments.json`, `personal.json`). `feed` 컬렉션은 앱에서 읽는 곳이 없어 덤프하지 않습니다.

## 2. SQLite로 가져오기

```
node migrate/import-to-sqlite.js
```

`DB_PATH`(기본 `./data/shared.db`)에 스키마를 생성하고 덤프 데이터를 정규화해서 넣습니다. 이미 존재하는 DB에 다시 실행하면 **중복 삽입**됩니다 — 재실행하려면 먼저 `data/shared.db`를 지우고 처음부터 다시 하세요.

실행 후 확인할 만한 것:
- 캐릭터 총원: `sqlite3 data/shared.db "SELECT COUNT(*) FROM oc_characters;"`
- 연성/설정/이미지 개수가 Firestore 콘솔에서 본 컬렉션 문서 수와 대략 일치하는지
- 콘솔 로그의 "skipped N (orphaned parent)" — 댓글 중 부모 story/image를 찾지 못한 것이 있으면 원본 데이터 정합성 문제이니 원본을 한번 확인

## 3. 이미지 R2로 복사

```
node migrate/migrate-images-to-r2.js
```

`images.json`/`imageChapters.json`에 있는 Firebase Storage 다운로드 URL을 그대로 받아, SQLite가 이미 기대하고 있는 경로(`images/{pid}/chapters/{chapterPid}/full.webp`, `images/{pid}/thumb.webp`)로 R2에 업로드합니다. 실패한 항목은 URL과 함께 로그에 남고 마지막에 실패 개수를 출력합니다 — 0이 될 때까지 안전하게 재실행 가능합니다(덮어쓰기라 멱등적).

완료 후 `https://img.lunayeon.com/images/<아무 pid>/thumb.webp` 하나를 브라우저로 직접 열어 실제로 보이는지 확인하세요.

## 4. 최종 점검

- `server`를 pm2로 띄우기 전, 로컬에서 `node src/server.js` 후 `curl localhost:3001/api/stories?limit=3` 등으로 실제 데이터가 나오는지 확인.
- 확인이 끝나면 `migrate/serviceAccountKey.json`과 `migrate/dump/`는 더 이상 필요 없으니 안전한 곳에 백업하거나 삭제해도 됩니다 (둘 다 gitignore 처리되어 있어 커밋되지는 않습니다).
