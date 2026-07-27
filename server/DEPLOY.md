# 배포 런북 (Lightsail + Nginx + pm2)

이 문서는 코드/설정이 이미 준비된 상태에서 실제 서버에 적용하는 순서만 정리한 것입니다. 서버 작업은 직접 SSH로 진행해주세요.

## 0. 사전 준비

- Node.js 18+ 설치 확인: `node -v`
- pm2 전역 설치: `sudo npm install -g pm2`
- Cloudflare R2 버킷 생성 + `img.lunayeon.com` 커스텀 도메인 연결 (Cloudflare 대시보드에서), R2 API 토큰(Access Key ID/Secret) 발급

## 1. 코드 배포

```
cd /var/www/oc-yeonsung   # 실제 배포 경로로 교체
git pull
cd server
npm ci --omit=dev
```

## 2. 환경변수 설정

```
cp .env.example .env
nano .env   # PORT, API_KEY, DB_PATH, R2_* 값 채우기
```

- `API_KEY`는 충분히 긴 임의 문자열로 생성하세요 (예: `openssl rand -hex 32`).
- **중요**: `public/assets/api.js`의 `API_KEY` 상수(현재 `'REPLACE_WITH_SERVER_API_KEY'`)를 여기서 정한 값과 **정확히 동일하게** 바꿔야 합니다. 이 값이 다르면 모든 쓰기/삭제 요청이 401로 실패합니다.
- `DB_PATH`는 기본값 `./data/shared.db` 그대로 두면 됩니다 (포켓리스 앱과 공유할 계획이면, 그 앱도 같은 경로를 바라보게 설정하세요).

## 3. Firestore → SQLite / R2 마이그레이션

`migrate/README.md`의 단계를 그대로 따르세요 (요약):

```
node migrate/firestore-export.js
node migrate/import-to-sqlite.js
node migrate/migrate-images-to-r2.js
```

완료 후 `curl localhost:3001/api/stories?limit=3` 등으로 실제 데이터가 들어왔는지 확인 (아직 pm2로 안 띄웠다면 `node src/server.js`로 임시 실행해서 확인 후 Ctrl+C).

## 4. pm2로 백엔드 실행

```
cd /var/www/oc-yeonsung/server
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 안내되는 명령어를 그대로 한 번 더 실행하면 재부팅 후에도 자동 시작됨
```

확인: `pm2 status`, `curl localhost:3001/api/health` → `{"ok":true}`

## 5. Nginx 설정 변경

`nginx.oc-yeonsung.conf.sample`을 참고해서 실제 설정 파일(예: `/etc/nginx/sites-available/oc-yeonsung.conf`)에 `/api/` location 블록을 추가하세요. 정적 파일 서빙(`root`, `location /`)은 기존 그대로 두고 `/api/` 프록시만 추가하면 됩니다.

```
sudo nginx -t                  # 문법 검사
sudo systemctl reload nginx    # 무중단 반영
```

## 6. 최종 확인

- `https://oc-yeonsung.lunayeon.com/` 접속 → 기존처럼 정적 페이지 로드되는지
- `https://oc-yeonsung.lunayeon.com/api/health` → `{"ok":true}`
- 브라우저에서 캐릭터 목록/연성 목록/그림 목록이 실제로 뜨는지, 글쓰기·댓글·북마크가 되는지 한 번씩 눌러서 확인
- `https://img.lunayeon.com/images/<아무 pid>/thumb.webp` 하나를 직접 열어 이미지가 R2에서 서빙되는지 확인

## 7. 정리

- `migrate/serviceAccountKey.json`, `migrate/dump/`는 마이그레이션이 끝나면 더 이상 필요 없습니다. 안전한 곳에 백업하거나 삭제하세요 (둘 다 `.gitignore`에 포함되어 커밋되지 않습니다).
- 기존 Firebase Hosting 배포(`.github/workflows/firebase-hosting-*.yml`)는 더 이상 유효하지 않으므로, 확인 후 삭제하거나 비활성화하는 것을 권장합니다.
- Firebase 프로젝트 자체(Firestore/Storage/Hosting)는 마이그레이션 정합성을 완전히 확인한 뒤에 정리하세요 — 급하게 지우지 마세요.

## 롤백이 필요하면

- pm2: `pm2 stop oc-yeonsung-api`
- Nginx: `/api/` location 블록만 제거하고 `nginx -t && systemctl reload nginx`
- 이 두 가지만 되돌리면 프론트가 다시 예전처럼 동작하진 않습니다(프론트가 이미 Firebase 대신 `/api`를 호출하도록 바뀌었으므로) — 완전 롤백하려면 `public/` 디렉터리도 마이그레이션 이전 커밋으로 되돌려야 합니다.
