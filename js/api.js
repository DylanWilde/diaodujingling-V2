/* ═══════════════════════════════════════════════════
   调度精灵 V8 — API 适配层
   - 优先调用后端 API
   - 失败时降级到 IndexedDB 本地缓存
   - JWT token 管理
   ═══════════════════════════════════════════════════ */

const API = {
  /* 部署时修改此处为服务器地址 */
  BASE: '',

  _token: null,

  setBase(url) {
    this.BASE = url.replace(/\/$/, '');
  },

  getToken() {
    if (this._token) return this._token;
    this._token = localStorage.getItem('dispatch_jwt') || '';
    return this._token;
  },

  setToken(t) {
    this._token = t;
    if (t) localStorage.setItem('dispatch_jwt', t);
    else localStorage.removeItem('dispatch_jwt');
  },

  get online() {
    return !!this.getToken();
  },

  /* ── HTTP 基础方法 ── */
  async _fetch(path, opts = {}) {
    const url = this.BASE + path;
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(url, { ...opts, headers });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
  },

  _get(path) { return this._fetch(path); },
  _post(path, body) { return this._fetch(path, { method: 'POST', body: JSON.stringify(body) }); },
  _put(path, body) { return this._fetch(path, { method: 'PUT', body: JSON.stringify(body) }); },
  _delete(path) { return this._fetch(path, { method: 'DELETE' }); },

  /* ═══ 认证 ═══ */
  async login(username, password) {
    const data = await this._post('/api/auth/login', { username, password });
    this.setToken(data.access_token);
    return { username: data.username, role: data.role };
  },

  logout() {
    this.setToken('');
  },

  async me() {
    return this._get('/api/auth/me');
  },

  /* ═══ 船舶数据 ═══ */
  async loadShips(date) {
    const result = await this._get(`/api/ships?date=${encodeURIComponent(date)}&page_size=2000`);
    // 兼容分页格式 {data, total} 和旧格式 []
    return Array.isArray(result) ? result : (result.data || []);
  },

  async loadAllShips() {
    const result = await this._get('/api/ships?page_size=2000');
    return Array.isArray(result) ? result : (result.data || []);
  },

  async listDates() {
    return this._get('/api/ships/dates');
  },

  async createShip(data) {
    return this._post('/api/ships', data);
  },

  async updateShip(id, data) {
    return this._put(`/api/ships/${id}`, data);
  },

  async deleteShip(id) {
    return this._delete(`/api/ships/${id}`);
  },

  async batchSaveShips(date, ships) {
    return this._post(`/api/ships/batch/${encodeURIComponent(date)}`, ships);
  },

  async updateMaritime(id, data) {
    return this._put(`/api/ships/maritime/${id}`, data);
  },

  /* ═══ 黑板 ═══ */
  async loadMessages(date) {
    return this._get(`/api/blackboard?date=${encodeURIComponent(date)}`);
  },

  async sendMessage(date, message) {
    return this._post('/api/blackboard', { date, message });
  },

  async deleteMessage(id) {
    return this._delete(`/api/blackboard/${id}`);
  },

  /* ═══ 流程跟踪 ═══ */
  async loadWorkflows(date) {
    return this._get(`/api/workflow?date=${encodeURIComponent(date)}`);
  },

  async syncWorkflows(date) {
    return this._post(`/api/workflow/sync/${encodeURIComponent(date)}`);
  },

  async advanceWorkflow(id, stage) {
    return this._put(`/api/workflow/${id}/advance/${stage}`);
  },

  async confirmChannelPass(id, data) {
    return this._put(`/api/workflow/${id}/channel-pass`, data);
  },

  async deleteWorkflow(id) {
    return this._delete(`/api/workflow/${id}`);
  },

  /* ═══ 用户管理（admin） ═══ */
  async listUsers() {
    return this._get('/api/users');
  },

  async createUser(username, password, role) {
    return this._post('/api/users', { username, password, role });
  },

  async updateUserRole(username, role) {
    return this._put(`/api/users/${encodeURIComponent(username)}/role`, { role });
  },

  async resetUserPassword(username, password) {
    return this._put(`/api/users/${encodeURIComponent(username)}/password`, { password });
  },

  async deleteUser(username) {
    return this._delete(`/api/users/${encodeURIComponent(username)}`);
  }
};

/* ═══ 混合数据加载：API 优先 + IndexedDB 缓存/兜底 ═══ */

async function loadShipsHybrid(date) {
  /* 如果已登录且 API 可用，优先读 API */
  if (API.getToken()) {
    try {
      const data = await API.loadShips(date);
      /* 同步到本地 IndexedDB 缓存 */
      if (typeof saveDateData === 'function' && data.length) {
        saveDateData(data, date).catch(() => {});
      }
      return data.map(normalizeShip);
    } catch (e) {
      console.warn('[API] 加载船期失败，降级到本地:', e.message);
    }
  }
  /* 降级：读本地 IndexedDB */
  if (typeof loadDateData === 'function') {
    const local = await loadDateData(date);
    if (local.length) return local;
  }
  /* 再降级：sharedShips（访客模式） */
  if (typeof sharedShips !== 'undefined' && sharedShips.length) {
    return sharedShips.filter(s => s.date === date).map(normalizeShip);
  }
  return [];
}

async function saveShipsHybrid(date, ships) {
  /* 先存本地 IndexedDB（保底） */
  let localOk = false;
  if (typeof saveDateData === 'function') {
    localOk = await saveDateData(ships, date);
  }
  /* 再推送到 API */
  if (API.getToken()) {
    try {
      const apiShips = ships.map(s => ({
        date, name: s.name, en: s.en || '',
        iv: s.iv || '', ev: s.ev || '', tm: s.tm || '',
        arRaw: s.arRaw || '', arV: s.arV,
        drRaw: s.drRaw || '', drV: s.drV,
        pp: s.pp || '—', np: s.np || '—', rm: s.rm || '—',
        eta: s.eta || '',
        _m: !!s._m, maritime7: !!s.maritime7,
        maritime7Note: s.maritime7Note || '', maritime7By: s.maritime7By || '',
        bizType: s.bizType || ''
      }));
      await API.batchSaveShips(date, apiShips);
      return true;
    } catch (e) {
      console.warn('[API] 保存船期失败，仅本地保存:', e.message);
      return localOk;
    }
  }
  return localOk;
}

async function saveDeclHybrid(date, name, iv, ev, declData) {
  /* 先存本地 */
  if (typeof saveDeclToDB === 'function') {
    await saveDeclToDB(date, name, iv, ev, declData);
  }
  /* 推送到 API */
  if (API.getToken()) {
    try {
      /* 先找到对应船舶的 id */
      const ships = await API.loadShips(date);
      const hit = ships.find(s => s.name === name && s.iv === iv && s.ev === ev);
      if (hit) {
        await API.updateMaritime(hit.id, declData);
      }
    } catch (e) {
      console.warn('[API] 海事申报同步失败:', e.message);
    }
  }
}

function normalizeShip(s) {
  s._m = !!s._m;
  s.eta = s.eta || '';
  s.maritime7 = !!s.maritime7;
  s.maritime7Note = s.maritime7Note || '';
  s.maritime7By = s.maritime7By || '';
  return s;
}

/* ═══ 混合黑板：API 优先 + IndexedDB ═══ */

async function loadBBHybrid(date) {
  if (API.getToken()) {
    try {
      return await API.loadMessages(date);
    } catch (e) {
      console.warn('[API] 加载黑板消息失败，降级到本地:', e.message);
    }
  }
  if (typeof loadBBMessages === 'function') {
    return await loadBBMessages(date);
  }
  return [];
}

async function sendBBHybrid(date, message) {
  if (API.getToken()) {
    try {
      return await API.sendMessage(date, message);
    } catch (e) {
      console.warn('[API] 发送消息失败，降级到本地:', e.message);
    }
  }
  /* 本地保存 */
  if (typeof saveBBMessage === 'function') {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const entry = {
      date, message,
      author: user ? user.username : '离线',
      role: user ? user.role : 'dispatcher',
      ts: Date.now()
    };
    await saveBBMessage(entry);
    entry.id = Date.now();
    return entry;
  }
  return null;
}

/* ═══ 混合流程跟踪：API 优先 + IndexedDB ═══ */

async function loadWFHybrid(date) {
  if (API.getToken()) {
    try {
      return await API.loadWorkflows(date);
    } catch (e) {
      console.warn('[API] 加载流程失败，降级到本地:', e.message);
    }
  }
  if (typeof WORKFLOW !== 'undefined') {
    const all = await WORKFLOW.getAll();
    return all.filter(r => r.date === date);
  }
  return [];
}
