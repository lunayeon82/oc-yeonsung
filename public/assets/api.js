// oc-yeonsung 백엔드(API) 클라이언트. Firestore 직접 호출을 대체합니다.
// API_KEY는 서버 server/.env의 API_KEY와 반드시 동일해야 합니다.
// (봇/크롤러의 무단 쓰기를 막는 용도이며, 기존 firebaseConfig와 동일하게 이 값도 공개 노출됩니다.)
(function () {
  const API_BASE = '/api';
  const API_KEY = 'b90c8078682c940190f617b2cc163cf799b782b610306e41bd99ff8f4a0ee6ba';

  async function request(method, path, { json, formData, query } = {}) {
    let url = API_BASE + path;
    if (query) {
      const qs = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ).toString();
      if (qs) url += `?${qs}`;
    }

    const opts = { method, headers: {} };
    const isWrite = method !== 'GET';
    if (isWrite) opts.headers['X-API-Key'] = API_KEY;

    if (formData) {
      opts.body = formData;
    } else if (json !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(json);
    }

    const res = await fetch(url, opts);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
      const err = new Error(`API ${method} ${path} failed: ${res.status} ${detail}`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  const API = {
    // 캐릭터
    getCharacters: () => request('GET', '/characters'),
    saveCharacterTree: (tree) => request('PUT', '/characters', { json: tree }),
    updateCharacter: (id, patch) => request('PUT', `/characters/${id}`, { json: patch }),
    uploadCharacterPortrait: (id, file) => {
      const fd = new FormData();
      fd.append('file', file);
      return request('POST', `/characters/${id}/portrait`, { formData: fd });
    },
    deleteCharacterPortrait: (id) => request('DELETE', `/characters/${id}/portrait`),

    // 태그 어휘(캐릭터 설정/관계성)
    getRoles: () => request('GET', '/roles'),
    saveRoles: (tree) => request('PUT', '/roles', { json: tree }),
    getAus: () => request('GET', '/aus'),
    saveAus: (tree) => request('PUT', '/aus', { json: tree }),

    // 사용자 목록
    getUsers: () => request('GET', '/users'),

    // 타임라인 피드 (연성 + 그림, 최근 수정순)
    listFeed: (query) => request('GET', '/feed', { query }),

    // 연성(스토리)
    listStories: (query) => request('GET', '/stories', { query }),
    getStory: (pid) => request('GET', `/stories/${pid}`),
    createStory: (body) => request('POST', '/stories', { json: body }),
    updateStory: (pid, body) => request('PUT', `/stories/${pid}`, { json: body }),
    deleteStory: (pid) => request('DELETE', `/stories/${pid}`),

    // 설정(로어)
    listLores: (query) => request('GET', '/lores', { query }),
    getLore: (pid) => request('GET', `/lores/${pid}`),
    createLore: (body) => request('POST', '/lores', { json: body }),
    updateLore: (pid, body) => request('PUT', `/lores/${pid}`, { json: body }),
    deleteLore: (pid) => request('DELETE', `/lores/${pid}`),

    // 이미지
    listImages: (query) => request('GET', '/images', { query }),
    getImage: (pid) => request('GET', `/images/${pid}`),
    createImage: (body) => request('POST', '/images', { json: body }),
    updateImage: (pid, body) => request('PUT', `/images/${pid}`, { json: body }),
    deleteImage: (pid) => request('DELETE', `/images/${pid}`),
    listImageTags: () => request('GET', '/images/tags'),

    // 이미지 업로드 (webp Blob은 호출측에서 canvas로 이미 생성). 썸네일은 서버가
    // 지정된 챕터의 원본 이미지에서 자동으로 생성하므로 별도 업로드가 필요 없음.
    uploadImage: ({ file, imagePid, chapterPid }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('imagePid', imagePid);
      fd.append('chapterPid', chapterPid);
      return request('POST', '/upload', { formData: fd });
    },

    // 댓글
    listComments: (parentType, parentPid) => request('GET', '/comments', { query: { parentType, parentPid } }),
    addComment: (body) => request('POST', '/comments', { json: body }),
    deleteComment: (id) => request('DELETE', `/comments/${id}`),

    // 개인 저장소 (뽑기 결과 / 나중에 볼 연성 / 보관함)
    listDrawBox: (user, limit) => request('GET', `/users/${encodeURIComponent(user)}/draw-box`, { query: { limit } }),
    addDrawBox: (user, body) => request('POST', `/users/${encodeURIComponent(user)}/draw-box`, { json: body }),
    updateDrawBox: (user, id, body) => request('PUT', `/users/${encodeURIComponent(user)}/draw-box/${id}`, { json: body }),
    deleteDrawBox: (user, id) => request('DELETE', `/users/${encodeURIComponent(user)}/draw-box/${id}`),

    listReadLater: (user, limit) => request('GET', `/users/${encodeURIComponent(user)}/read-later`, { query: { limit } }),
    addReadLater: (user, body) => request('POST', `/users/${encodeURIComponent(user)}/read-later`, { json: body }),
    deleteReadLater: (user, id) => request('DELETE', `/users/${encodeURIComponent(user)}/read-later/${id}`),

    listStoryBox: (user, limit) => request('GET', `/users/${encodeURIComponent(user)}/story-box`, { query: { limit } }),
    addStoryBox: (user, body) => request('POST', `/users/${encodeURIComponent(user)}/story-box`, { json: body }),
    deleteStoryBox: (user, id) => request('DELETE', `/users/${encodeURIComponent(user)}/story-box/${id}`),
  };

  window.API = API;
})();
