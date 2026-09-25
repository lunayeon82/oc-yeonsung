// 연성 글 본문의 감정 에셋 토큰(<img="Do A-rang acting coy">)을 실제 이미지로 바꿔주는 유틸.
// 서버의 server/src/lib/emoteToken.js와 같은 규칙을 쓴다(한쪽만 고치면 안 됨).
(function () {
  // 글쓰기 에디터가 contenteditable이라 본문에 친 토큰은 이스케이프된 형태
  // (&lt;img=&quot;...&quot;&gt;)로 저장된다. 다른 곳에서 붙여넣은 날것 형태도 같이 받는다.
  const TOKEN_RE = /(?:<|&lt;)\s*img\s*=\s*(?:"|'|&quot;|&#34;|&#39;)?\s*([^"'<>&]+?)\s*(?:"|'|&quot;|&#34;|&#39;)?\s*\/?\s*(?:>|&gt;)/gi;

  // 파일명(Do_A-rang.acting_coy.1.webp)과 본문 토큰(Do A-rang acting coy)은 구분자 표기가
  // 달라서, 양쪽 모두 영숫자만 남긴 키로 바꿔서 대조한다.
  function normalizeKey(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function hasToken(html) {
    TOKEN_RE.lastIndex = 0;
    return TOKEN_RE.test(String(html || ''));
  }

  let cache = null;

  // 등록된 감정 에셋 전체를 한 번만 받아 { 정규화키: {url, label} } 맵으로 만든다.
  async function loadMap() {
    if (cache) return cache;
    const res = await window.API.listEmotes();
    const map = {};
    (res.items || []).forEach((e) => {
      const entry = { url: e.url, label: `${e.charName} ${e.emotion}`.replace(/_/g, ' ') };
      const base = normalizeKey(e.charName + e.emotion);
      // 변형이 여러 개면 번호가 낮은 것이 번호 없는 토큰의 기본값이 된다.
      if (!map[base] || e.variant < map[base].variant) map[base] = Object.assign({ variant: e.variant }, entry);
      map[normalizeKey(e.charName + e.emotion + e.variant)] = Object.assign({ variant: e.variant }, entry);
    });
    cache = map;
    return cache;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 등록되지 않은 이름이면 토큰 원문을 그대로 둔다 — 글이 조용히 사라지는 것보다 낫다.
  function replace(html, map) {
    return String(html || '').replace(TOKEN_RE, (full, inner) => {
      const hit = map[normalizeKey(inner)];
      if (!hit) return full;
      return `<span class="emote"><img src="${escapeAttr(hit.url)}" alt="${escapeAttr(hit.label)}" loading="lazy"></span>`;
    });
  }

  // 본문 HTML 안의 토큰을 이미지로 바꾼다. 토큰이 없으면 API 호출도 하지 않는다.
  async function render(html) {
    if (!hasToken(html)) return html;
    try {
      return replace(html, await loadMap());
    } catch (e) {
      console.error('감정 에셋을 불러오지 못했어요', e);
      return html;
    }
  }

  window.Emotes = { TOKEN_RE, normalizeKey, hasToken, loadMap, replace, render };
})();
