# 로어(lore) 기능 제거 전 데이터 백업

로어 기능을 코드에서 완전히 제거하기 전에, 관련 3개 테이블을 프로덕션 DB
(`/home/ubuntu/oc-yeonsung/server/data/shared.db`, Lightsail)에서 읽기 전용으로
전수 조회해 백업한 것.

- `oc_lores.json` — 로어 글 (`pid`, `title`, `chapter_count`, `created_at`, `updated_at`)
- `oc_lore_chapters.json` — 로어 챕터 (`pid`, `lore_pid`, `sort_order`, `title`, `body`, `created_at`)
- `oc_story_lore_refs.json` — 연성 글이 로어를 참조하는 관계 (`story_pid`, `lore_pid`, `lore_title_snapshot`, `sort_order`)

**세 파일 모두 빈 배열이다 — 오류가 아니라 실제로 그렇다.** 백업 시점(조회 명령:
`sqlite3 -readonly <db> "SELECT * FROM {table}"`)에 세 테이블 다 행이 0개였음을
`SELECT COUNT(*)`로 재확인함. 즉 로어 기능은 코드/스키마상으로는 계속 존재했지만
실제로 로어 글이 단 한 건도 만들어진 적이 없었던 것으로 보인다. 조회한 프로덕션
테이블 스키마(`sqlite_master.sql`)도 `server/src/schema.sql`의 정의와 정확히
일치함을 확인했다(드리프트 없음).

이 백업이 있으니, 로어 관련 테이블을 실제로 `DROP TABLE`하는 작업
(`server/migrate/drop-lore-tables.js`, 아직 실행 안 함 — 사용자 확인 후 실행 예정)은
데이터 손실 걱정 없이 안전하게 진행할 수 있다.
