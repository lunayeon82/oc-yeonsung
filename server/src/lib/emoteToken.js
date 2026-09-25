// 연성 글 본문에 들어가는 감정 에셋 토큰: <img="Do A-rang acting coy">
//
// 글쓰기 에디터가 contenteditable이라 사용자가 친 토큰은 저장될 때 HTML 이스케이프되어
// (&lt;img=&quot;...&quot;&gt;) 들어간다. 반면 다른 곳에서 복사해 온 원문은 날것 그대로
// 들어올 수도 있어서, 두 형태를 모두 인식한다.
const TOKEN_RE = /(?:<|&lt;)\s*img\s*=\s*(?:"|'|&quot;|&#34;|&#39;)?\s*([^"'<>&]+?)\s*(?:"|'|&quot;|&#34;|&#39;)?\s*\/?\s*(?:>|&gt;)/gi;

// 파일명(Do_A-rang.acting_coy.1.webp)과 본문 토큰(Do A-rang acting coy)은 구분자 표기가
// 서로 다르므로, 양쪽 모두 영숫자만 남긴 키로 바꿔서 대조한다.
function normalizeKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripTokens(html) {
  return String(html || '').replace(TOKEN_RE, ' ');
}

module.exports = { TOKEN_RE, normalizeKey, stripTokens };
