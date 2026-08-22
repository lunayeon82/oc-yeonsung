// 공용 확인 모달 — window.customConfirm(message)는 Promise<boolean>을 반환합니다.
// random.html/random-admin.html과 같은 리본 모달 껍데기(assets/modal.css)를 그대로 씀.
(function () {
  if (window.customConfirm) return;

  var nested = /\/story\//.test(location.pathname);
  var prefix = nested ? '../' : '';

  function ensureModalCss() {
    if (document.querySelector('link[href$="assets/modal.css"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = prefix + 'assets/modal.css';
    document.head.appendChild(link);
  }

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <button type="button" class="modal-exit"><img src="${prefix}assets/modal/exit.png" alt="닫기"></button>
      <img class="modal-ribbon" src="${prefix}assets/modal/ribbon.png" alt="">
      <p class="modal-message"></p>
      <div class="modal-actions stretch">
        <button type="button" class="modal-cancel">취소</button>
        <button type="button" class="modal-save">확인</button>
      </div>
    </div>
  `;

  let activeResolve = null;

  function close(result) {
    overlay.classList.remove('open');
    if (activeResolve) { activeResolve(result); activeResolve = null; }
  }

  overlay.querySelector('.modal-exit').addEventListener('click', () => close(false));
  overlay.querySelector('.modal-cancel').addEventListener('click', () => close(false));
  overlay.querySelector('.modal-save').addEventListener('click', () => close(true));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

  function mount() {
    ensureModalCss();
    if (!overlay.isConnected) {
      document.body.appendChild(overlay);
    }
  }

  window.customConfirm = function (message) {
    mount();
    return new Promise((resolve) => {
      activeResolve = resolve;
      overlay.querySelector('.modal-message').textContent = message;
      overlay.classList.add('open');
    });
  };
})();
