// 저장소 선택 모달 — window.openStoragePicker({title, users, targets})는 Promise<{user, target}|null>을 반환합니다.
(function () {
  if (window.openStoragePicker) return;

  const overlay = document.createElement('div');
  overlay.className = 'sp-overlay';
  overlay.innerHTML = `
    <div class="sp-modal">
      <p class="sp-title"></p>
      <button type="button" class="sp-back" style="display:none">← 뒤로</button>
      <div class="sp-options"></div>
      <button type="button" class="sp-cancel">취소</button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .sp-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(58,53,48,0.45);
      backdrop-filter: blur(3px);
      opacity: 0; visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
      padding: 20px;
    }
    .sp-overlay.show { opacity: 1; visibility: visible; }
    .sp-modal {
      width: 100%; max-width: 320px;
      background: linear-gradient(160deg, #fdf9f3, #f6efe5);
      border: 1px solid #e6dccb;
      border-radius: 16px;
      padding: 28px 24px 20px;
      text-align: center;
      box-shadow: 0 16px 48px rgba(90,74,107,0.22);
      transform: translateY(16px) scale(0.97);
      transition: transform 0.25s ease;
    }
    .sp-overlay.show .sp-modal { transform: translateY(0) scale(1); }
    .sp-modal::before {
      content: '';
      display: block;
      width: 48px; height: 3px;
      margin: 0 auto 16px;
      border-radius: 3px;
      background: linear-gradient(90deg, #c0899e, #a89ec4);
    }
    .sp-title {
      font-family: 'ko-font', sans-serif;
      font-size: 0.92rem;
      color: #4a3a5b;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .sp-back {
      display: block;
      margin: -8px auto 12px;
      border: none;
      background: none;
      color: #8a7e6b;
      font-family: 'ko-font', sans-serif;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .sp-back:hover { color: #4a3a5b; }
    .sp-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
    }
    .sp-option {
      padding: 12px 0;
      border: 1px solid #e6dccb;
      border-radius: 10px;
      background: #fff;
      color: #4a3a5b;
      font-family: 'ko-font', sans-serif;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .sp-option:hover {
      border-color: #a89ec4;
      background: linear-gradient(135deg, rgba(192,137,158,0.12), rgba(168,158,196,0.12));
      transform: translateY(-1px);
    }
    .sp-cancel {
      width: 100%;
      padding: 11px 0;
      border: none;
      border-radius: 10px;
      background: #f0ebe0;
      color: #8a7e6b;
      font-family: 'ko-font', sans-serif;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .sp-cancel:hover { background: #e6dccb; }
  `;

  let activeResolve = null;
  let state = null;

  function close(result) {
    overlay.classList.remove('show');
    if (activeResolve) { activeResolve(result); activeResolve = null; }
  }

  function renderUsers() {
    overlay.querySelector('.sp-title').textContent = state.title;
    overlay.querySelector('.sp-back').style.display = 'none';
    const optionsEl = overlay.querySelector('.sp-options');
    optionsEl.innerHTML = '';
    state.users.forEach(user => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-option';
      btn.textContent = user;
      btn.addEventListener('click', () => {
        if (state.targets && state.targets.length) {
          renderTargets(user);
        } else {
          close({ user, target: null });
        }
      });
      optionsEl.appendChild(btn);
    });
  }

  function renderTargets(user) {
    overlay.querySelector('.sp-title').textContent = `${user}님의 어디에 저장할까요?`;
    const backBtn = overlay.querySelector('.sp-back');
    backBtn.style.display = 'block';
    backBtn.onclick = renderUsers;
    const optionsEl = overlay.querySelector('.sp-options');
    optionsEl.innerHTML = '';
    state.targets.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-option';
      btn.textContent = t.label;
      btn.addEventListener('click', () => close({ user, target: t.key }));
      optionsEl.appendChild(btn);
    });
  }

  overlay.querySelector('.sp-cancel').addEventListener('click', () => close(null));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

  function mount() {
    if (!overlay.isConnected) {
      document.head.appendChild(style);
      document.body.appendChild(overlay);
    }
  }

  window.openStoragePicker = function (opts) {
    mount();
    state = opts;
    return new Promise((resolve) => {
      activeResolve = resolve;
      renderUsers();
      overlay.classList.add('show');
    });
  };
})();
