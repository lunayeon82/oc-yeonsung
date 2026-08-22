// 저장소 선택 모달 — window.openStoragePicker({title, users, targets})는 Promise<{user, target}|null>을 반환합니다.
// random.html/random-admin.html과 같은 리본 모달 껍데기(assets/modal.css)를 그대로 씀.
(function () {
  if (window.openStoragePicker) return;

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
      <button type="button" class="modal-back" style="display:none">← 뒤로</button>
      <p class="modal-message"></p>
      <div class="modal-options"></div>
      <button type="button" class="modal-close">취소</button>
    </div>
  `;

  let activeResolve = null;
  let state = null;

  function close(result) {
    overlay.classList.remove('open');
    if (activeResolve) { activeResolve(result); activeResolve = null; }
  }

  function renderUsers() {
    overlay.querySelector('.modal-message').textContent = state.title;
    overlay.querySelector('.modal-back').style.display = 'none';
    const optionsEl = overlay.querySelector('.modal-options');
    optionsEl.innerHTML = '';
    state.users.forEach(user => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-option';
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
    overlay.querySelector('.modal-message').textContent = `${user}님의 어디에 저장할까요?`;
    const backBtn = overlay.querySelector('.modal-back');
    backBtn.style.display = 'block';
    backBtn.onclick = renderUsers;
    const optionsEl = overlay.querySelector('.modal-options');
    optionsEl.innerHTML = '';
    state.targets.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-option';
      btn.textContent = t.label;
      btn.addEventListener('click', () => close({ user, target: t.key }));
      optionsEl.appendChild(btn);
    });
  }

  overlay.querySelector('.modal-exit').addEventListener('click', () => close(null));
  overlay.querySelector('.modal-close').addEventListener('click', () => close(null));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

  function mount() {
    ensureModalCss();
    if (!overlay.isConnected) {
      document.body.appendChild(overlay);
    }
  }

  window.openStoragePicker = function (opts) {
    mount();
    state = opts;
    return new Promise((resolve) => {
      activeResolve = resolve;
      renderUsers();
      overlay.classList.add('open');
    });
  };
})();
