// 핑크·보라·아이보리 톤의 공용 확인 모달 — window.customConfirm(message)는 Promise<boolean>을 반환합니다.
(function () {
  if (window.customConfirm) return;

  const overlay = document.createElement('div');
  overlay.className = 'cc-overlay';
  overlay.innerHTML = `
    <div class="cc-modal">
      <p class="cc-message"></p>
      <div class="cc-actions">
        <button type="button" class="cc-btn cc-cancel">취소</button>
        <button type="button" class="cc-btn cc-confirm">확인</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .cc-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(58,53,48,0.45);
      backdrop-filter: blur(3px);
      opacity: 0; visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
      padding: 20px;
    }
    .cc-overlay.show { opacity: 1; visibility: visible; }
    .cc-modal {
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
    .cc-overlay.show .cc-modal { transform: translateY(0) scale(1); }
    .cc-modal::before {
      content: '';
      display: block;
      width: 48px; height: 3px;
      margin: 0 auto 16px;
      border-radius: 3px;
      background: linear-gradient(90deg, #c06b84, #8b7cad);
    }
    .cc-message {
      font-family: 'ko-font', sans-serif;
      font-size: 0.92rem;
      color: #4a3a5b;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: keep-all;
      margin-bottom: 22px;
    }
    .cc-actions { display: flex; gap: 10px; }
    .cc-btn {
      flex: 1;
      padding: 11px 0;
      border: none;
      border-radius: 10px;
      font-family: 'ko-font', sans-serif;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .cc-cancel { background: #f0ebe0; color: #8a7e6b; }
    .cc-cancel:hover { background: #e6dccb; }
    .cc-confirm {
      background: linear-gradient(135deg, #c06b84, #8b7cad);
      color: #fff;
      box-shadow: 0 4px 16px rgba(192,107,132,0.3);
    }
    .cc-confirm:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(192,107,132,0.4); }
  `;

  let activeResolve = null;

  function close(result) {
    overlay.classList.remove('show');
    if (activeResolve) { activeResolve(result); activeResolve = null; }
  }

  overlay.querySelector('.cc-cancel').addEventListener('click', () => close(false));
  overlay.querySelector('.cc-confirm').addEventListener('click', () => close(true));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

  function mount() {
    if (!overlay.isConnected) {
      document.head.appendChild(style);
      document.body.appendChild(overlay);
    }
  }

  window.customConfirm = function (message) {
    mount();
    return new Promise((resolve) => {
      activeResolve = resolve;
      overlay.querySelector('.cc-message').textContent = message;
      overlay.classList.add('show');
    });
  };
})();
