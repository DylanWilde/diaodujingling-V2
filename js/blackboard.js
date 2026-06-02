/* ═══════════════════════════════════════════════════
   调度精灵 — 调度小黑板 (按日期的调度提醒)
   数据存储在 IndexedDB 'blackboard' store
   ═══════════════════════════════════════════════════ */

var bbMessages = [];
var bbDate = '';

/* 初始化小黑板DB store */
function initBBStore(db) {
  return new Promise(function(ok) {
    var tx = db.transaction('blackboard', 'readwrite');
    var st;
    try { st = tx.objectStore('blackboard'); }
    catch(e) {
      /* store不存在，需要升级DB版本 */
      db.close();
      var r2 = indexedDB.open('DDB_v5', 2);
      r2.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('blackboard')) {
          d.createObjectStore('blackboard', { keyPath: 'id', autoIncrement: true });
          /* 兼容旧stores */
          if (!d.objectStoreNames.contains('ships')) {
            var s = d.createObjectStore('ships', { keyPath: 'id', autoIncrement: true });
            s.createIndex('date', 'date', { unique: false });
          }
        }
      };
      r2.onsuccess = function(e) {
        window._bbDB = e.target.result;
        ok();
      };
      return;
    }
    ok();
  });
}

function getBBDB() {
  return window._bbDB || db;
}

function loadBBMessages(date) {
  return new Promise(function(ok) {
    var d = getBBDB();
    if (!d) { ok([]); return; }
    try {
      var tx = d.transaction('blackboard', 'readonly');
      var st = tx.objectStore('blackboard');
      var r = st.getAll();
      r.onsuccess = function() {
        var all = (r.result || []).filter(function(m) { return m.date === date; });
        all.sort(function(a, b) { return (a.ts || 0) - (b.ts || 0); });
        ok(all);
      };
      r.onerror = function() { ok([]); };
    } catch(e) { ok([]); }
  });
}

function saveBBMessage(msg) {
  return new Promise(function(ok) {
    var d = getBBDB();
    if (!d) { ok(false); return; }
    try {
      var tx = d.transaction('blackboard', 'readwrite');
      var st = tx.objectStore('blackboard');
      st.add(msg);
      tx.oncomplete = function() { ok(true); };
    } catch(e) { ok(false); }
  });
}

function deleteBBMessage(id) {
  return new Promise(function(ok) {
    var d = getBBDB();
    if (!d) { ok(false); return; }
    try {
      var tx = d.transaction('blackboard', 'readwrite');
      var st = tx.objectStore('blackboard');
      st.delete(id);
      tx.oncomplete = function() { ok(true); };
    } catch(e) { ok(false); }
  });
}

/* 渲染小黑板 */
function renderBlackboard() {
  var el = document.getElementById('bbMsgs');
  if (!el) return;

  /* 游客无法查看聊天室 */
  var user = getCurrentUser();
  if (!user) {
    el.innerHTML = '<div style="text-align:center;padding:60px 40px;color:#94A3B8"><div style="font-size:48px;margin-bottom:12px">🔒</div><div style="font-size:16px;font-weight:700;color:#475569;margin-bottom:6px">调度聊天室仅限登录用户访问</div><div style="font-size:13px">请点击右上角「管理员登录」进入</div></div>';
    document.getElementById('bbPermHint').textContent = '🔒 游客无权查看';
    return;
  }

  if (!bbMessages.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#94A3B8">📝 暂无消息，发一条吧~</div>';
    return;
  }

  var isAdmin = (getCurrentUser() || {}).role === 'admin';
  var curUser = (getCurrentUser() || {}).username || '';

  var html = '';
  for (var i = 0; i < bbMessages.length; i++) {
    var m = bbMessages[i];
    var time = new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    var isMine = m.author === curUser;
    var canDelete = isAdmin || isMine;
    var roleTag = m.role === 'admin' ? '<span style="background:#DBEAFE;color:#2563EB;font-size:10px;padding:1px 6px;border-radius:8px;margin-left:4px">管理员</span>' : '';

    html += '<div class="bb-msg" style="' + (isMine ? 'text-align:right' : '') + '">'
      + '<div class="bb-bubble ' + (isMine ? 'bb-mine' : '') + '">'
      + '<div class="bb-meta"><b>' + escHtml(m.author) + '</b>' + roleTag + ' · ' + time
      + (canDelete ? ' <span class="bb-del" onclick="delBB(' + m.id + ')" title="删除">✕</span>' : '')
      + '</div>'
      + '<div class="bb-text">' + escHtml(m.message) + '</div>'
      + '</div></div>';
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* 切换日期 */
async function bbChangeDate() {
  var sel = document.getElementById('bbDate');
  if (!sel) return;
  bbDate = sel.value;
  if (!bbDate) return;
  bbMessages = await loadBBMessages(bbDate);
  renderBlackboard();
}

/* 发送消息 */
async function bbSend() {
  var inp = document.getElementById('bbInput');
  var msg = (inp.value || '').trim();
  if (!msg) return;
  if (!bbDate) { alert('请先选择日期'); return; }

  var user = getCurrentUser();
  if (!user) { alert('请先登录'); return; }

  var entry = {
    date: bbDate,
    author: user.username,
    role: user.role,
    message: msg,
    ts: Date.now()
  };

  var ok = await saveBBMessage(entry);
  if (ok) {
    inp.value = '';
    bbMessages = await loadBBMessages(bbDate);
    renderBlackboard();
  }
}

/* 删除消息 */
async function delBB(id) {
  if (!confirm('确定删除这条提醒？')) return;
  var ok = await deleteBBMessage(id);
  if (ok) {
    bbMessages = bbMessages.filter(function(m) { return m.id !== id; });
    renderBlackboard();
  }
}

/* 获取全部黑板消息（用于发布） */
function getAllBBMessages() {
  return new Promise(function(ok) {
    var d = getBBDB();
    if (!d) { ok([]); return; }
    try {
      var tx = d.transaction('blackboard', 'readonly');
      var st = tx.objectStore('blackboard');
      var r = st.getAll();
      r.onsuccess = function() { ok(r.result || []); };
      r.onerror = function() { ok([]); };
    } catch(e) { ok([]); }
  });
}

var bbPollTimer = null;

function mergeBBMessages(local, shared) {
  var map = {};
  var result = [];
  /* 先加本地消息 */
  for (var i = 0; i < local.length; i++) {
    var m = local[i];
    var key = (m.author||'') + '|' + (m.message||'') + '|' + (m.ts||0);
    map[key] = true;
    result.push(m);
  }
  /* 合并共享消息 */
  for (var j = 0; j < shared.length; j++) {
    var sm = shared[j];
    if (sm.date !== bbDate) continue;
    var key2 = (sm.author||'') + '|' + (sm.message||'') + '|' + (sm.ts||0);
    if (!map[key2]) {
      map[key2] = true;
      result.push(sm);
    }
  }
  result.sort(function(a, b) { return (a.ts || 0) - (b.ts || 0); });
  return result;
}

async function bbPollShared() {
  try {
    var resp = await fetch(SHARED_DATA_URL + '?t=' + Date.now());
    if (!resp.ok) return;
    var data = await resp.json();
    var bb = [];
    if (Array.isArray(data)) { /* legacy format, no BB */ }
    else if (data && data.blackboard) { bb = data.blackboard; }
    if (bb.length) {
      sharedBB = bb;
      var local = await loadBBMessages(bbDate);
      var merged = mergeBBMessages(local, sharedBB);
      if (merged.length !== bbMessages.length) {
        bbMessages = merged;
        renderBlackboard();
      }
    }
  } catch(e) {}
}

/* Tab切换时初始化小黑板 */
async function initBlackboard() {
  var user = getCurrentUser();
  var hint = document.getElementById('bbPermHint');
  if (!user) {
    renderBlackboard();
    return;
  }
  if (hint) hint.textContent = '👤 ' + user.username + ' · 已登录';

  /* 设置默认日期 */
  if (!bbDate) {
    bbDate = curDate || new Date().toISOString().split('T')[0];
  }
  var sel = document.getElementById('bbDate');
  if (sel) {
    sel.value = bbDate;
    /* 填充日期选项 */
    if (sel.options.length <= 1) {
      var dates = await listDates();
      if (typeof sharedShips !== 'undefined' && sharedShips.length) {
        var sd = {};
        sharedShips.forEach(function(s) { if (s.date) sd[s.date] = true; });
        dates = Object.keys(sd).sort().reverse();
      }
      sel.innerHTML = '<option value="">— 选择 —</option>';
      dates.forEach(function(d) {
        var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
      });
      sel.value = bbDate;
    }
  }
  var local = await loadBBMessages(bbDate);
  bbMessages = mergeBBMessages(local, sharedBB);
  renderBlackboard();

  /* 启动实时轮询（每8秒） */
  if (bbPollTimer) clearInterval(bbPollTimer);
  bbPollTimer = setInterval(function() { bbPollShared(); }, 8000);
}

/* 停止轮询（Tab切换时调用） */
function stopBBPoll() {
  if (bbPollTimer) { clearInterval(bbPollTimer); bbPollTimer = null; }
}
