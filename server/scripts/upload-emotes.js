#!/usr/bin/env node
/**
 * 감정 에셋 일괄 업로드.
 *
 *   node scripts/upload-emotes.js <이미지폴더> [--api https://oc-yeonsung.lunayeon.com] [--force]
 *
 * 파일명은 `이름.감정.변형번호.webp` 형식이어야 한다 (예: Do_A-rang.acting_coy.1.webp).
 * 원본(701x1024, 장당 600KB대)은 인코딩이 비효율적이라 그대로 올리면 본문이 무거워지므로,
 * 본문용 640px와 고르기 목록용 썸네일 160px로 다시 인코딩해서 둘 다 올린다.
 * R2에는 서버가 자기 자격증명으로 넣으므로 이 스크립트엔 R2 키가 필요 없다.
 *
 * API 키는 --key, 환경변수 OC_API_KEY, 또는 public/assets/api.js에 이미 공개로 박혀 있는
 * 값에서 순서대로 찾는다(프론트엔드가 쓰는 것과 같은 키다).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAIN_WIDTH = 640;
const MAIN_QUALITY = 82;
const THUMB_WIDTH = 160;
const THUMB_QUALITY = 75;

function readFrontendApiKey() {
  const p = path.resolve(__dirname, '..', '..', 'public', 'assets', 'api.js');
  const m = /const API_KEY = '([^']+)'/.exec(fs.readFileSync(p, 'utf8'));
  if (!m) throw new Error('public/assets/api.js에서 API_KEY를 찾지 못했습니다');
  return m[1];
}

function parseArgs(argv) {
  const args = { dir: null, api: 'https://oc-yeonsung.lunayeon.com', key: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--api') args.api = argv[++i];
    else if (a === '--key') args.key = argv[++i];
    else if (!args.dir) args.dir = a;
  }
  args.key = args.key || process.env.OC_API_KEY || readFrontendApiKey();
  return args;
}

// Do_A-rang.acting_coy.1.webp -> { charName, emotion, variant }
function parseName(file) {
  const m = /^(.+?)\.(.+?)\.(\d+)\.webp$/i.exec(file);
  if (!m) return null;
  return { charName: m[1], emotion: m[2], variant: Number(m[3]) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error('사용법: node scripts/upload-emotes.js <이미지폴더> [--api URL] [--force]');
    process.exit(1);
  }

  const files = fs.readdirSync(args.dir).filter((f) => f.toLowerCase().endsWith('.webp')).sort();
  const parsed = [];
  const skipped = [];
  files.forEach((f) => {
    const p = parseName(f);
    if (p) parsed.push(Object.assign({ file: f }, p));
    else skipped.push(f);
  });

  if (skipped.length) {
    console.log(`이름 규칙에 안 맞아 건너뜀 (${skipped.length}개): ${skipped.slice(0, 5).join(', ')}`);
  }
  console.log(`대상 ${parsed.length}개 / API ${args.api}`);

  const existing = new Set();
  if (!args.force) {
    const res = await fetch(`${args.api}/api/emotes`);
    if (!res.ok) throw new Error(`기존 목록 조회 실패: ${res.status}`);
    const { items } = await res.json();
    items.forEach((e) => existing.add(`${e.charName}.${e.emotion}.${e.variant}`));
    console.log(`이미 등록된 ${existing.size}개는 건너뜀 (--force로 덮어쓰기)`);
  }

  let done = 0;
  let failed = 0;
  for (const item of parsed) {
    const id = `${item.charName}.${item.emotion}.${item.variant}`;
    if (existing.has(id)) { done++; continue; }

    const src = path.join(args.dir, item.file);
    try {
      const [main, thumb] = await Promise.all([
        sharp(src).resize({ width: MAIN_WIDTH }).webp({ quality: MAIN_QUALITY, alphaQuality: 90 }).toBuffer(),
        sharp(src).resize({ width: THUMB_WIDTH }).webp({ quality: THUMB_QUALITY, alphaQuality: 80 }).toBuffer(),
      ]);

      const fd = new FormData();
      fd.append('file', new Blob([main], { type: 'image/webp' }), `${item.emotion}.${item.variant}.webp`);
      fd.append('thumb', new Blob([thumb], { type: 'image/webp' }), `${item.emotion}.${item.variant}.thumb.webp`);
      fd.append('charName', item.charName);
      fd.append('emotion', item.emotion);
      fd.append('variant', String(item.variant));

      const res = await fetch(`${args.api}/api/emotes`, {
        method: 'POST',
        headers: { 'X-API-Key': args.key },
        body: fd,
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

      done++;
      const kb = (main.length / 1024).toFixed(0);
      console.log(`[${done}/${parsed.length}] ${id} (${kb}KB)`);
    } catch (e) {
      failed++;
      console.error(`[실패] ${id}: ${e.message}`);
    }
  }

  console.log(`\n완료: ${done - failed}개 성공, ${failed}개 실패`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
