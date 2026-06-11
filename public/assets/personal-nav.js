// 화면 좌하단 고정 — 실시간 연결 배지 위에 떠 있는 개인 저장소 바로가기 동그라미
(function () {
  if (window.__personalNavMounted) return;
  window.__personalNavMounted = true;

  var nested = /\/(story|personal)\//.test(location.pathname);
  var prefix = nested ? '../' : '';

  var USERS = [
    { name: '김굥', file: 'kimgyong.html', icon: 'hedgehog-v0.png' },
    { name: '하지', file: 'haji.html', icon: 'ferret-v0.png' },
    { name: '예밍', file: 'yeming.html', icon: 'chick-v0.png' }
  ];

  var style = document.createElement('style');
  style.textContent = `
    .pn-btn {
      position: fixed;
      bottom: calc(3% + 30px);
      left: 1.2rem;
      z-index: 51;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 1px solid var(--border, #d4c9b8);
      background: var(--surface, #faf7f2);
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(90,74,107,0.12);
      transition: all 0.2s;
      overflow: hidden;
    }
    .pn-btn:hover { border-color: var(--violet, #a89ec4); transform: translateY(-1px); }
    .pn-btn img { width: 18px; height: 18px; object-fit: contain; }

    .pn-popup {
      position: fixed;
      bottom: calc(3% + 68px);
      left: 1.2rem;
      z-index: 51;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px;
      border-radius: 14px;
      border: 1px solid var(--border, #d4c9b8);
      background: var(--surface-glass-strong, rgba(250,247,242,0.92));
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 30px rgba(90,74,107,0.18);
      opacity: 0;
      visibility: hidden;
      transform: translateY(8px);
      transition: all 0.2s ease;
      min-width: 110px;
    }
    .pn-popup.show { opacity: 1; visibility: visible; transform: translateY(0); }
    .pn-popup a {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0.45rem 0.7rem;
      border-radius: 10px;
      font-family: var(--font-title, 'ko-font', sans-serif);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-dim, #8a7e6b);
      text-decoration: none;
      transition: all 0.15s;
    }
    .pn-popup a:hover {
      background: var(--violet-dim, rgba(168,158,196,0.15));
      color: var(--text, #3a3530);
    }
    .pn-popup a img {
      width: 18px;
      height: 18px;
      object-fit: contain;
      border-radius: 50%;
    }
  `;
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pn-btn';
  btn.title = '개인 저장소 바로가기';
  btn.innerHTML = '<img src="' + prefix + 'assets/icon/all-v0.png" alt="">';

  var popup = document.createElement('div');
  popup.className = 'pn-popup';
  popup.innerHTML = USERS.map(function (u) {
    return '<a href="' + prefix + 'personal/' + u.file + '"><img src="' + prefix + 'assets/icon/' + u.icon + '" alt="">' + u.name + '</a>';
  }).join('');

  document.body.appendChild(btn);
  document.body.appendChild(popup);

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    popup.classList.toggle('show');
  });
  document.addEventListener('click', function (e) {
    if (!popup.contains(e.target) && e.target !== btn) {
      popup.classList.remove('show');
    }
  });
})();
