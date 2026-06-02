/* ═══════════════════════════════════════════════════
   调度精灵 DispatchHub V5 — 主应用逻辑
   依赖: ships-map.js (SHIP_MAP), SheetJS (XLSX CDN)
   ═══════════════════════════════════════════════════ */

/* ═══ 配置（部署时修改此处） ═══ */
var APP_CONFIG = {
  shipxyKey: 'SHIPXY_KEY_REDACTED',   // 船讯网API密钥
  githubOwner: 'DylanWilde',
  githubRepo: 'diaodujingling-V2',
  githubBranch: 'main',
  dataPath: 'data/ships.json'
};

/* ═══ INDEXED DB ═══ */
var DB = 'DDB_v4';
var db = null;

function opDB() {
  return new Promise(function(ok, no) {
    var r = indexedDB.open(DB, 2);
    r.onupgradeneeded = function(e) {
      var d = e.target.result;
      if (!d.objectStoreNames.contains('ships')) {
        var s = d.createObjectStore('ships', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!d.objectStoreNames.contains('blackboard')) {
        d.createObjectStore('blackboard', { keyPath: 'id', autoIncrement: true });
      }
      if (!d.objectStoreNames.contains('accounts')) {
        var ast = d.createObjectStore('accounts', { keyPath: 'username' });
        ast.add({ username: 'admin', password: simpleHash('admin888'), role: 'admin', created: Date.now() });
      }
    };
    r.onsuccess = function(e) { db = e.target.result; window._bbDB = db; ok(db); };
    r.onerror = function(e) {
      no(e);
      var el = document.getElementById('dbStatus');
      if (el) { el.textContent = '❌ 数据库不可用'; el.style.color = '#DC2626'; }
    };
  });
}

async function saveDateData(list, date) {
  if (!db) return false;
  var tx = db.transaction('ships', 'readwrite');
  var st = tx.objectStore('ships');
  var idx = st.index('date');
  var all = await new Promise(function(ok) {
    var r = idx.getAll(date);
    r.onsuccess = function() { ok(r.result || []); };
    r.onerror = function() { ok([]); };
  });
  all.forEach(function(s) { st.delete(s.id); });
  list.forEach(function(s) {
    st.add({
      date: date, name: s.name, en: s.en || '',
      iv: s.iv || '', ev: s.ev || '', tm: s.tm || '',
      arRaw: s.arRaw || '', arV: s.arV,
      drRaw: s.drRaw || '', drV: s.drV,
      pp: s.pp || '—', np: s.np || '—', rm: s.rm || '—',
      _m: s._m ? 1 : 0,
      eta: s.eta || '',
      maritime7: s.maritime7 ? 1 : 0,
      maritime7Note: s.maritime7Note || '',
      maritime7By: s.maritime7By || ''
    });
  });
  return new Promise(function(ok) { tx.oncomplete = function() { ok(true); }; });
}

function loadDateData(date) {
  return new Promise(function(ok) {
    if (!db) { ok([]); return; }
    var tx = db.transaction('ships', 'readonly');
    var st = tx.objectStore('ships');
    var idx = st.index('date');
    var r = idx.getAll(date);
    r.onsuccess = function() {
      ok((r.result || []).map(function(s) {
        s._m = !!s._m;
        s.eta = s.eta || '';
        s.maritime7 = !!s.maritime7;
        s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || '';
        s.maritime7By = s.maritime7By || '';
        return s;
      }));
    };
    r.onerror = function() { ok([]); };
  });
}

function listDates() {
  return new Promise(function(ok) {
    var allDates = {};
    /* 合并sharedShips日期 */
    if (typeof sharedShips !== 'undefined' && sharedShips.length) {
      sharedShips.forEach(function(s) { if (s.date) allDates[s.date] = true; });
    }
    if (!db) {
      ok(Object.keys(allDates).sort().reverse());
      return;
    }
    var tx = db.transaction('ships', 'readonly');
    var st = tx.objectStore('ships');
    var r = st.getAll();
    r.onsuccess = function() {
      (r.result || []).forEach(function(s) { if (s.date) allDates[s.date] = true; });
      ok(Object.keys(allDates).sort().reverse());
    };
    r.onerror = function() {
      ok(Object.keys(allDates).sort().reverse());
    };
  });
}

function saveDeclToDB(date, name, iv, ev, data) {
  return new Promise(function(ok) {
    if (!db) { ok(false); return; }
    var tx = db.transaction('ships', 'readwrite');
    var st = tx.objectStore('ships');
    var idx = st.index('date');
    var r = idx.getAll(date);
    r.onsuccess = function() {
      var hit = null;
      (r.result || []).forEach(function(s) {
        if (s.name === name && s.iv === iv && s.ev === ev) hit = s;
      });
      if (hit) {
        hit.maritime7 = data.maritime7 ? 1 : 0;
        hit.maritime7Note = data.maritime7Note || '';
        hit.maritime7By = data.maritime7By || '';
        st.put(hit);
      }
    };
    tx.oncomplete = function() { ok(true); };
  });
}

async function saveAllENames(updates) {
  if (!db || !updates.length) return;
  var tx = db.transaction('ships', 'readwrite');
  var st = tx.objectStore('ships');
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    var idx = st.index('date');
    var r = idx.getAll(u.date);
    var hit = null;
    await new Promise(function(ok) {
      r.onsuccess = function() {
        (r.result || []).forEach(function(s) {
          if (s.name === u.name && s.iv === (u.iv||'') && s.ev === (u.ev||'')) hit = s;
        });
        if (hit) { hit.en = u.en; st.put(hit); }
        ok();
      };
    });
  }
  return new Promise(function(ok) { tx.oncomplete = function() { ok(); }; });
}

function getAllData() {
  return new Promise(function(ok) {
    if (!db) { ok([]); return; }
    var tx = db.transaction('ships', 'readonly');
    var st = tx.objectStore('ships');
    var r = st.getAll();
    r.onsuccess = function() { ok(r.result || []); };
    r.onerror = function() { ok([]); };
  });
}

function restoreAllData(data) {
  return new Promise(function(ok) {
    if (!db) { ok(false); return; }
    var tx = db.transaction('ships', 'readwrite');
    var st = tx.objectStore('ships');
    var r = st.getAll();
    r.onsuccess = function() { (r.result || []).forEach(function(s) { st.delete(s.id); }); };
    tx.oncomplete = function() {
      var tx2 = db.transaction('ships', 'readwrite');
      var st2 = tx2.objectStore('ships');
      data.forEach(function(s) { st2.add(s); });
      tx2.oncomplete = function() { ok(true); };
    };
  });
}

/* ═══ 解析引擎 ═══ */
function xd(s) {
  if (!s) return null;
  var m = String(s).replace(/\s+/g, ' ').trim().match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
function nn(n) { return String(n||'').replace(/<br\s*\/?>/gi,' ').replace(/[\n\r]+/g,' ').replace(/\s+/g,' ').trim(); }

function parseWorkbook(rows) {
  var list = [];
  if (!rows || rows.length < 3) return list;
  var hr = -1, cm = { sn: -1, ad: -1, dd: -1, pp: -1, np: -1, rm: -1, iv: -1, ev: -1, tm: -1, en: -1, eta: -1 };
  for (var i = 0; i < Math.min(rows.length, 20); i++) {
    var r = rows[i]; if (!r) continue; var found = 0;
    for (var c = 0; c < r.length; c++) {
      var v = String(r[c] || '').trim();
      if (v === '船名' || v.indexOf('船名') >= 0) { cm.sn = c; found++; }
      if (v.indexOf('抵港吃水') >= 0 || (v.indexOf('抵港')>=0 && v.indexOf('吃水')>=0)) cm.ad = c;
      if (v.indexOf('开航吃水') >= 0 || (v.indexOf('开航')>=0 && v.indexOf('吃水')>=0)) cm.dd = c;
      if (v === '上港' || v.indexOf('上港') >= 0) cm.pp = c;
      if (v === '下港' || v.indexOf('下港') >= 0) cm.np = c;
      if (v === '备注' || v.indexOf('备注') >= 0) cm.rm = c;
      if (v.indexOf('进口航次') >= 0) cm.iv = c;
      if (v.indexOf('出口航次') >= 0) cm.ev = c;
      if (v === '码头' || v.indexOf('码头') >= 0) cm.tm = c;
      var vl = v.toLowerCase();
      if (vl.indexOf('英文') >= 0 || vl.indexOf('english') >= 0 || vl.indexOf('en name') >= 0) cm.en = c;
      if (v === 'ETA' || v.indexOf('确报时间') >= 0 || v.indexOf('预计到港') >= 0 || v.indexOf('抵港时间') >= 0 || v.indexOf('到港时间') >= 0 || v.indexOf('预计抵港') >= 0 || v.indexOf('靠泊时间') >= 0 || v.indexOf('计划靠泊') >= 0 || vl.indexOf('eta') >= 0) { cm.eta = c; found++; }
    }
    if (found && (cm.ad !== -1 || cm.dd !== -1 || cm.eta !== -1)) { hr = i; break; }
  }
  if (hr === -1) {
    for (var i2 = 0; i2 < Math.min(rows.length, 15); i2++) {
      var r2 = rows[i2]; if (!r2) continue;
      for (var c2 = 0; c2 < r2.length; c2++) {
        if (String(r2[c2]||'').indexOf('船名') >= 0) { cm.sn = c2; hr = i2; break; }
      }
      if (hr !== -1) break;
    }
    if (hr !== -1) {
      var rh = rows[hr];
      for (var c3 = 0; c3 < rh.length; c3++) {
        var v3 = String(rh[c3]||'').trim();
        if (v3.indexOf('抵港吃水') >= 0) cm.ad = c3;
        if (v3.indexOf('开航吃水') >= 0) cm.dd = c3;
        if (v3 === '上港' || v3.indexOf('上港') >= 0) cm.pp = c3;
        if (v3 === '下港' || v3.indexOf('下港') >= 0) cm.np = c3;
        if (v3 === '备注' || v3.indexOf('备注') >= 0) cm.rm = c3;
        if (v3.indexOf('进口航次') >= 0) cm.iv = c3;
        if (v3.indexOf('出口航次') >= 0) cm.ev = c3;
        if (v3 === '码头' || v3.indexOf('码头') >= 0) cm.tm = c3;
        var vl3 = v3.toLowerCase();
        if (vl3.indexOf('英文')>=0 || vl3.indexOf('english')>=0 || vl3.indexOf('en name')>=0) cm.en = c3;
        if (v3 === 'ETA' || v3.indexOf('确报时间') >= 0 || v3.indexOf('预计到港') >= 0 || v3.indexOf('抵港时间') >= 0 || v3.indexOf('到港时间') >= 0 || v3.indexOf('预计抵港') >= 0 || v3.indexOf('靠泊时间') >= 0 || v3.indexOf('计划靠泊') >= 0 || v3.toLowerCase().indexOf('eta') >= 0) cm.eta = c3;
      }
    }
  }
  if (cm.sn === -1) return list;

  for (var rowI = hr + 1; rowI < rows.length; rowI++) {
    var row = rows[rowI]; if (!row || !row.length) continue;
    var raw = (cm.sn !== -1 && row[cm.sn]) ? String(row[cm.sn]).trim() : '';
    if (!raw || raw === '0') continue;
    if (raw.indexOf('下昼夜')>=0 || raw.indexOf('PS:')>=0 || raw.indexOf('集中办公')>=0 || raw.indexOf('此行不要删除')>=0 || raw.indexOf('（（')>=0) continue;
    var sn = nn(raw); if (!sn) continue;
    var ar = (cm.ad !== -1 && row[cm.ad]) ? String(row[cm.ad]) : '';
    var dr = (cm.dd !== -1 && row[cm.dd]) ? String(row[cm.dd]) : '';
    var enRaw = (cm.en !== -1 && row[cm.en]) ? String(row[cm.en]).trim() : '';
    var etaRaw = (cm.eta !== -1 && row[cm.eta]) ? String(row[cm.eta]).trim() : '';
    list.push({
      name: sn, en: enRaw || '',
      iv: (cm.iv!==-1 && row[cm.iv]) ? String(row[cm.iv]).trim() : '',
      ev: (cm.ev!==-1 && row[cm.ev]) ? String(row[cm.ev]).trim() : '',
      tm: (cm.tm!==-1 && row[cm.tm]) ? String(row[cm.tm]).trim() : '',
      arRaw: ar, arV: xd(ar), drRaw: dr, drV: xd(dr),
      pp: (cm.pp!==-1 && row[cm.pp]) ? String(row[cm.pp]).trim() : '—',
      np: (cm.np!==-1 && row[cm.np]) ? String(row[cm.np]).trim() : '—',
      rm: (cm.rm!==-1 && row[cm.rm]) ? String(row[cm.rm]).trim() : '—',
      eta: etaRaw, maritime7: false, maritime7Note: '', _m: false
    });
  }
  return list;
}

/* ═══ 状态 ═══ */
var ships = [];
var curDate = '';
var enChanges = {};

/* ═══ 上传 ═══ */
async function up() {
  var fi = document.getElementById('fu');
  if (!fi.files.length) return;
  curDate = document.getElementById('sd').value;
  if (!curDate) { alert('请先选择日期'); return; }
  if (!checkEditPerm(curDate)) return;
  /* 检查该日期是否已有数据，提示覆盖 */
  var existing = await loadDateData(curDate);
  if (existing.length && !confirm('⚠️ ' + curDate + ' 已有 ' + existing.length + ' 条船期数据，新上传将覆盖旧数据。\n\n相同日期仅保留最新的一份船期表。\n\n确定继续？')) return;
  var el = document.getElementById('upSt');
  el.innerHTML = '⏳ 解析中...'; el.className = 'st st-info';
  var all = [];
  for (var f = 0; f < fi.files.length; f++) {
    try {
      var buf = await fi.files[f].arrayBuffer();
      var wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      all = all.concat(parseWorkbook(rows));
    } catch(e) {
      el.innerHTML = '❌ ' + fi.files[f].name + ' 解析失败'; el.className = 'st st-err';
      return;
    }
  }
  var map = {};
  for (var i = 0; i < all.length; i++) {
    var s = all[i];
    var k = s.name + '|' + s.iv + '|' + s.ev;
    if (map[k]) {
      var e = map[k];
      if (e.arV == null && s.arV != null) { e.arV = s.arV; e.arRaw = s.arRaw; }
      if (e.drV == null && s.drV != null) { e.drV = s.drV; e.drRaw = s.drRaw; }
      if (!e.eta && s.eta) { e.eta = s.eta; }
    } else { map[k] = s; }
  }
  ships = [];
  for (var mk in map) ships.push(map[mk]);
  var ok = await saveDateData(ships, curDate);
  el.innerHTML = ok ? '✅ 已导入 ' + ships.length + ' 条并保存到数据库' : '❌ 保存失败';
  el.className = ok ? 'st st-ok' : 'st st-err';
  await refreshDates();
  rd();

  /* 管理员自动发布到线上 */
  if (ok && getCurrentUser() && getCurrentUser().role === 'admin') {
    el.innerHTML += ' 🔄 自动发布中...';
    try { await publishDataSilent(); el.innerHTML += ' ✅ 已同步到线上'; }
    catch(e) { el.innerHTML += ' ⚠️ 自动发布失败，请手动发布'; }
  }
}

/* ═══ 加载 ═══ */
async function ld() {
  curDate = document.getElementById('sd').value;
  if (!curDate) return;
  ships = await loadDateData(curDate);
  var el = document.getElementById('upSt');
  el.innerHTML = '📅 ' + curDate + ' — 数据库 ' + ships.length + ' 条记录';
  el.className = 'st st-info';
  document.getElementById('sr').innerHTML = ships.length ? '⚡ ' + ships.length + ' 条，输入船名查询' : '无数据';
  rd();
}

async function refreshDates() {
  var dates = await listDates();
  ['dl', 'dDate', 'dDate3'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">— 选择 —</option>';
    dates.forEach(function(d) {
      var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
    });
  });
  if (dates.length) {
    var latest = dates[0];
    if (!ships.length || curDate !== latest) {
      var dDateEl = document.getElementById('dDate');
      if (dDateEl) dDateEl.value = latest;
      var dDate3El = document.getElementById('dDate3');
      if (dDate3El) dDate3El.value = latest;
      var sdEl = document.getElementById('sd');
      if (sdEl) sdEl.value = latest;
      curDate = latest;
      ships = await loadDateData(latest);
      /* 本地没数据回落sharedShips */
      if (!ships.length && sharedShips.length) {
        ships = sharedShips.filter(function(s) { return s.date === curDate; });
        ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
      }
    }
  }
  updateAIStats();
  renderMonthlyArchive();
}

function gd() {
  var v = document.getElementById('dl').value;
  if (v) { document.getElementById('sd').value = v; ld(); }
}

/* ═══ 手动增删船期 ═══ */
async function manualAddShip() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') { alert('🔒 仅管理员可操作'); return; }

  var date = document.getElementById('mDate').value;
  var name = document.getElementById('mName').value.trim();
  if (!date || !name) { alert('日期和船名为必填'); return; }

  var newShip = {
    date: date,
    name: name,
    en: document.getElementById('mEn').value.trim(),
    iv: document.getElementById('mIv').value.trim(),
    ev: document.getElementById('mEv').value.trim(),
    tm: document.getElementById('mTm').value.trim(),
    arRaw: document.getElementById('mAr').value.trim(),
    arV: xd(document.getElementById('mAr').value),
    drRaw: document.getElementById('mDr').value.trim(),
    drV: xd(document.getElementById('mDr').value),
    pp: document.getElementById('mPp').value.trim() || '—',
    np: document.getElementById('mNp').value.trim() || '—',
    rm: document.getElementById('mRm').value.trim() || '—',
    eta: document.getElementById('mEta').value.trim(),
    _m: 1,  /* 标记为手动录入 */
    maritime7: false,
    maritime7Note: '',
    maritime7By: ''
  };

  /* 加载该日期已有数据，去重（同船名+航次覆盖） */
  var existing = await loadDateData(date);
  var key = name + '|' + newShip.iv + '|' + newShip.ev;
  var found = false;
  for (var i = 0; i < existing.length; i++) {
    var ek = existing[i].name + '|' + (existing[i].iv||'') + '|' + (existing[i].ev||'');
    if (ek === key) { existing[i] = newShip; found = true; break; }
  }
  if (!found) existing.push(newShip);

  var ok = await saveDateData(existing, date);
  var el = document.getElementById('mSt');
  if (ok) {
    el.textContent = '✅ ' + (found ? '已覆盖' : '已添加') + ' · ' + name + ' · ' + date;
    el.className = 'st st-ok';
    if (curDate === date) { ships = existing; rd(); }
    await refreshDates();
  } else {
    el.textContent = '❌ 保存失败';
    el.className = 'st st-err';
  }
}

async function deleteShip(date, name, iv, ev) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') { alert('🔒 仅管理员可操作'); return; }
  if (!confirm('⚠️ 确定删除 ' + date + ' 「' + name + '」？此操作不可恢复。')) return;

  var all = await loadDateData(date);
  var filtered = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].name === name && (all[i].iv||'') === iv && (all[i].ev||'') === ev) continue;
    filtered.push(all[i]);
  }
  if (filtered.length === all.length) { alert('未找到该记录'); return; }

  var ok = await saveDateData(filtered, date);
  if (ok) {
    alert('✅ 已删除');
    if (curDate === date) { ships = filtered; rd(); }
    await refreshDates();
    qr(); /* 刷新查询结果 */
  }
}

/* ═══ 搜索 ═══ */
function findShipLocal(kw) {
  if (!ships.length) return null;
  var l = kw.toLowerCase().trim();
  for (var i = 0; i < ships.length; i++) {
    if (ships[i].name.toLowerCase() === l) return ships[i];
  }
  for (var i2 = 0; i2 < ships.length; i2++) {
    if (ships[i2].name.toLowerCase().indexOf(l) >= 0) return ships[i2];
  }
  for (var i3 = 0; i3 < ships.length; i3++) {
    var iv = (ships[i3].iv||'').toLowerCase();
    var ev = (ships[i3].ev||'').toLowerCase();
    if (iv.indexOf(l) >= 0 || ev.indexOf(l) >= 0) return ships[i3];
  }
  return null;
}

function findShipAll(kw, allData) {
  var l = kw.toLowerCase().trim();
  for (var i = 0; i < allData.length; i++) {
    if (allData[i].name.toLowerCase() === l) return allData[i];
  }
  for (var i2 = 0; i2 < allData.length; i2++) {
    if (allData[i2].name.toLowerCase().indexOf(l) >= 0) return allData[i2];
  }
  for (var i3 = 0; i3 < allData.length; i3++) {
    var iv = (allData[i3].iv||'').toLowerCase();
    var ev = (allData[i3].ev||'').toLowerCase();
    if (iv.indexOf(l) >= 0 || ev.indexOf(l) >= 0) return allData[i3];
  }
  return null;
}

function findAllShips(kw, allData) {
  var l = kw.toLowerCase().trim();
  var exact = [];
  var partial = [];
  var voyage = [];
  var seen = {};
  for (var i = 0; i < allData.length; i++) {
    var s = allData[i];
    var key = s.name + '|' + s.date + '|' + (s.iv||'') + '|' + (s.ev||'');
    if (seen[key]) continue;
    var nameLow = s.name.toLowerCase();
    var ivLow = (s.iv||'').toLowerCase();
    var evLow = (s.ev||'').toLowerCase();
    var enLow = (s.en||'').toLowerCase();
    if (nameLow === l) { exact.push(s); seen[key] = true; }
    else if (nameLow.indexOf(l) >= 0 || enLow.indexOf(l) >= 0) { partial.push(s); seen[key] = true; }
    else if (ivLow.indexOf(l) >= 0 || evLow.indexOf(l) >= 0) { voyage.push(s); seen[key] = true; }
  }
  return exact.concat(partial).concat(voyage);
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function qr() {
  var kw = document.getElementById('si').value.trim();
  var el = document.getElementById('sr');
  if (!kw) { el.innerHTML = '请输入船名'; el.className = 'st st-err'; return; }
  var allData = await getAllData();
  if (!allData.length) { el.innerHTML = '数据库无数据'; el.className = 'st st-err'; return; }
  var results = findAllShips(kw, allData);
  if (!results.length) { el.innerHTML = '❌ 未找到: ' + esc(kw); el.className = 'st st-err'; return; }
  var user = getCurrentUser();
  var isAdmin = user && user.role === 'admin';
  var html = '<div style="background:#F1F5F9;border-radius:10px;padding:14px"><div style="font-weight:700;margin-bottom:8px">🔍 找到 ' + results.length + ' 条匹配</div>'
    + '<div class="tw"><table><tr><th>日期</th><th>船名</th><th>英文名</th><th>航次</th><th>码头</th><th>抵港吃水</th><th>开航吃水</th><th>上港</th><th>下港</th><th>ETA</th><th>备注</th>'
    + (isAdmin ? '<th>操作</th>' : '') + '</tr>';
  for (var ri = 0; ri < results.length; ri++) {
    var r = results[ri];
    var a = r.arV != null ? r.arV : (r.arRaw || '—');
    var d = r.drV != null ? r.drV : (r.drRaw || '—');
    var m = r._m ? ' <span class="tg tg-warn">✏️手动</span>' : '';
    var ivEv = esc(r.iv||'') + (r.iv && r.ev ? '/' : '') + esc(r.ev||'');
    var delBtn = isAdmin ? '<td><button class="btn btn-sm btn-g" onclick="deleteShip(\'' + esc(r.date) + '\',\'' + esc(r.name).replace(/'/g,"\\'") + '\',\'' + esc(r.iv||'') + '\',\'' + esc(r.ev||'') + '\')" style="color:#DC2626;font-size:10px">🗑️</button></td>' : '';
    html += '<tr><td>' + esc(r.date||'') + '</td><td style="font-weight:700">' + esc(r.name) + m + '</td><td>' + esc(r.en||'') + '</td>'
      + '<td>' + ivEv + '</td><td>' + esc(r.tm||'') + '</td><td>' + a + '</td><td>' + d + '</td>'
      + '<td>' + esc(r.pp||'') + '</td><td>' + esc(r.np||'') + '</td><td>' + esc(r.eta||'') + '</td><td>' + esc(r.rm||'') + '</td>' + delBtn + '</tr>';
  }
  html += '</table></div></div>';
  el.innerHTML = html;
  el.className = '';
  /* 也更新sm区域方便管理 */
  var smEl = document.getElementById('sm');
  if (smEl) smEl.innerHTML = results.length ? '<span style="font-size:10px;color:#64748B">💡 管理员可点击🗑️删除记录</span>' : '';
}

/* ═══ 权限检查 ═══ */
function checkEditPerm(date) {
  var user = getCurrentUser();
  if (!user) { alert('请先登录'); return false; }
  if (user.role === 'admin') return true;
  var today = new Date().toISOString().split('T')[0];
  if (date !== today) { alert('🔒 调度员仅可修改当日(' + today + ')数据'); return false; }
  return true;
}

/* ═══ 导出 ═══ */
function exp() {
  if (!ships.length) { alert('无数据可导出'); return; }
  var h = [['船名','英文名','进口航次','出口航次','码头','抵港吃水(m)','开航吃水(m)','上港','下港','ETA','备注','数据来源']];
  ships.forEach(function(s) {
    h.push([s.name, s.en||'', s.iv||'', s.ev||'', s.tm||'',
      s.arV != null ? s.arV : '', s.drV != null ? s.drV : '',
      s.pp, s.np, s.eta||'', s.rm, s._m ? '手动修正' : '原始数据']);
  });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(h), '船期表');
  XLSX.writeFile(wb, '船期表_' + (document.getElementById('sd').value || '') + '.xlsx');
}

/* ═══ 备份/恢复 ═══ */
async function bk() {
  var data = await getAllData();
  if (!data.length) { alert('数据库为空'); return; }
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '调度精灵_备份_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}
async function rs() {
  var fi = document.getElementById('ri');
  if (!fi.files.length) return;
  try {
    var text = await fi.files[0].text();
    var data = JSON.parse(text);
    await restoreAllData(data);
    alert('✅ 已恢复 ' + data.length + ' 条记录！');
    await refreshDates();
    ld();
  } catch(e) { alert('❌ 恢复失败: ' + e.message); }
}

/* ═══ 看板渲染 ═══ */
var dashRefreshTimer = null;

function rd() {
  var kw = (document.getElementById('dFilter').value || '').trim().toLowerCase();
  var dockSel = document.getElementById('dDock');
  var dockFilter = (dockSel && dockSel.value) ? dockSel.value.trim() : '';

  /* 先收集并更新码头下拉 */
  if (dockSel && dockSel.options) {
    var allDocks = {};
    ships.forEach(function(s) { if (s.tm) allDocks[s.tm] = true; });
    var dockList = Object.keys(allDocks).sort();
    if (dockSel.options.length !== dockList.length + 1) {
    dockSel.innerHTML = '<option value="">全部码头</option>';
    dockList.forEach(function(d) {
      var o = document.createElement('option'); o.value = d; o.textContent = d; dockSel.appendChild(o);
    });
    if (dockFilter) dockSel.value = dockFilter;
    }
  }

  var filtered = ships;
  if (kw) {
    filtered = filtered.filter(function(s) {
      return s.name.toLowerCase().indexOf(kw) >= 0 ||
        (s.iv||'').toLowerCase().indexOf(kw) >= 0 ||
        (s.ev||'').toLowerCase().indexOf(kw) >= 0 ||
        (s.en||'').toLowerCase().indexOf(kw) >= 0;
    });
  }
  if (dockFilter) {
    filtered = filtered.filter(function(s) { return (s.tm||'') === dockFilter; });
  }

  /* 新统计: 代理船舶数 / 24h预抵(ETA≤24h) / 72小时预抵(ETA≤72h) / 码头数 */
  var count24h = 0, count72h = 0;
  filtered.forEach(function(s) {
    var hours = getETAHours(s.eta);
    if (hours >= 0 && hours <= 24) count24h++;
    if (hours >= 0 && hours <= 72) count72h++;
  });
  document.getElementById('stT').textContent = filtered.length;
  document.getElementById('stA').textContent = count24h;
  document.getElementById('stD').textContent = count72h;
  var terms = {};
  filtered.forEach(function(s){ if (s.tm) terms[s.tm] = true; });
  document.getElementById('stM').textContent = Object.keys(terms).length;
  /* 动画数字 */
  if (typeof animateCount === 'function') {
    animateCount(document.getElementById('stT'), filtered.length);
    animateCount(document.getElementById('stA'), count24h);
    animateCount(document.getElementById('stD'), count72h);
    animateCount(document.getElementById('stM'), Object.keys(terms).length);
  }

  /* 倒计时 */
  updateCountdown();

  if (!filtered.length) {
    document.getElementById('dg').innerHTML = '<div class="st-big">无匹配船舶</div>';
    return;
  }

  /* 按码头分组 */
  var groups = {};
  filtered.forEach(function(s) {
    var key = s.tm || '';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  var keys = Object.keys(groups).filter(function(k){ return k !== ''; }).sort(function(a,b){ return groups[b].length - groups[a].length; });
  if (groups['']) keys.push('');

  var html = '<div class="tc-grid">';
  for (var g = 0; g < keys.length; g++) {
    var tm = keys[g];
    var grp = groups[tm];
    if (!grp || !grp.length) continue;
    var label = tm || '⛵ 其他';
    html += '<div class="tc-col"><h3>' + esc(label) + ' <span>' + grp.length + '</span></h3>';
    for (var i = 0; i < grp.length; i++) {
      var sh = grp[i];
      var etaHours = getETAHours(sh.eta);
      var aria = sh.arV != null ? sh.arV : (sh.arRaw||'—');
      var dria = sh.drV != null ? sh.drV : (sh.drRaw||'—');
      var arrivalDisplay = sh.arV != null ? '抵' + sh.arV + 'm' : (sh.arRaw ? '抵' + aria + 'm' : '');
      var departDisplay = sh.drV != null ? '开' + sh.drV + 'm' : (sh.drRaw ? '开' + dria + 'm' : '');
      var voyageDisplay = (sh.iv || sh.ev) ? esc(sh.iv||'') + '/' + esc(sh.ev||'') : '';

      var key = sh.name + '|' + (sh.iv||'') + '|' + (sh.ev||'');
      var shipInfo = SHIP_MAP[sh.name];
      var matchedEn = sh.en || (shipInfo ? shipInfo.en : '');
      var imoNumber = shipInfo && shipInfo.imo ? shipInfo.imo : '';
      var imoDisplay = imoNumber ? 'IMO' + imoNumber : '';
	      var draftLine = '';
	      if (arrivalDisplay || departDisplay) {
	        draftLine = '<div class="info-draft">吃水: ' + (arrivalDisplay || '—') + ' / ' + (departDisplay || '—') + '</div>';
	      }

      html += '<div class="sc sc-big" style="cursor:pointer" onclick="openShipModal(\'' + (sh.name||'').replace(/'/g,"\\'") + '\',\'' + imoNumber + '\',\'' + (matchedEn||'').replace(/'/g,"\\'") + '\')" title="点击查看船舶实时动态">'
        + '<div class="sn-name">' + esc(sh.name) + '</div>'
        + (voyageDisplay ? '<div class="info-voyage">航次: <b>' + voyageDisplay + '</b></div>' : '')
        + draftLine
        + '<div class="info-eta">ETA: <b>' + fmtETA(sh.eta) + '</b>'
        + (etaHours >= 0 && etaHours <= 24 ? ' <span class="eta-tag eta-red">24h</span>' : '')
        + (etaHours > 24 && etaHours <= 72 ? ' <span class="eta-tag eta-orange">72h</span>' : '')
        + '</div>'
        + '<div class="info-route"><b>' + esc(sh.pp) + '</b> → <b>' + esc(sh.np) + '</b></div>'
        + (sh.rm && sh.rm !== '—' ? '<div class="info-remark">' + esc(sh.rm) + '</div>' : '')
        + (sh.maritime7By ? '<div class="info-confirm">海事已确认 by ' + esc(sh.maritime7By) + '</div>' : '')
        + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  document.getElementById('dg').innerHTML = html;
}

/* 10分钟倒计时 */
var dashCountdown = 600;
function updateCountdown() {
  var el = document.getElementById('dCountdown');
  if (!el) return;
  var m = Math.floor(dashCountdown / 60);
  var s = dashCountdown % 60;
  el.textContent = '下次刷新: ' + m + ':' + (s<10?'0':'') + s;
}

function startDashRefresh() {
  if (dashRefreshTimer) clearInterval(dashRefreshTimer);
  dashCountdown = 600;
  updateCountdown();
  dashRefreshTimer = setInterval(function() {
    dashCountdown--;
    updateCountdown();
    if (dashCountdown <= 0) {
      dashCountdown = 600;
      /* 重新加载当前日期数据 */
      (async function() {
        if (curDate) {
          ships = await loadDateData(curDate);
          if (!ships.length && sharedShips.length) {
            ships = sharedShips.filter(function(s) { return s.date === curDate; });
            ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
          }
          rd();
        }
      })();
    }
  }, 1000);
}

function trackEn(el) {
  enChanges[el.dataset.key] = el.value;
}

async function svAllEn() {
  var keys = Object.keys(enChanges);
  if (!keys.length) { alert('没有需要保存的英文名'); return; }
  var updates = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var parts = key.split('|');
    updates.push({ date: curDate, name: parts[0], iv: parts[1]||'', ev: parts[2]||'', en: enChanges[key] });
  }
  await saveAllENames(updates);
  for (var u = 0; u < updates.length; u++) {
    var upd = updates[u];
    for (var j = 0; j < ships.length; j++) {
      if (ships[j].name === upd.name && ships[j].iv === upd.iv && ships[j].ev === upd.ev) {
        ships[j].en = upd.en;
      }
    }
  }
  enChanges = {};
  document.getElementById('dbStatus').textContent = '💾 已保存 ' + updates.length + ' 个英文名';
}

async function onDashDate() {
  var d = document.getElementById('dDate').value;
  if (!d) return;
  curDate = d;
  document.getElementById('sd').value = d;
  var dDate3El = document.getElementById('dDate3');
  if (dDate3El) dDate3El.value = d;
  /* 优先本地，再回退共享 */
  if (isViewerMode) {
    ships = sharedShips.filter(function(s) { return s.date === d; });
  } else {
    ships = await loadDateData(d);
    if (!ships.length && sharedShips.length) {
      ships = sharedShips.filter(function(s) { return s.date === d; });
    }
  }
  ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
  rd();
}

/* ═══ 引航站转换器 ═══ */
function tugs(s) {
  s = s.trim(); if (!s) return '';
  var m = s.match(/^(\d+)\s+港拖$/); if (m) return m[1] + '港拖';
  m = s.match(/^(\d+)(沪救)(\d+)$/); if (m) return '救' + m[3];
  m = s.match(/^(\d+)(海平)(\d+)$/); if (m) return m[2] + m[3];
  m = s.match(/^(\d+)(兴晟)(\d+)$/); if (m) return m[2] + m[3];
  m = s.match(/^(\d+)\s+洋山拖$/); if (m) return m[1] + '洋山拖';
  return s;
}
function tstr(r) {
  var s = r.replace(/；/g, ';');
  if (s.indexOf(';') < 0) { var res = tugs(s); return (res !== s || /港拖|沪救|海平|兴晟|洋山拖/.test(s)) ? res : null; }
  return s.split(';').map(function(p){ return tugs(p.trim()); }).filter(Boolean).join('/') || null;
}
function tmr(r) {
  var m = r.match(/^(\d{2})(\d{2})\/(\d{1,2})\.(\d{1,2})-(\d{2})(\d{2})\/(\d{1,2})\.(\d{1,2});?$/);
  if (!m) return null; var y = new Date().getFullYear();
  return y + '-' + (+m[3]<10?'0':'') + (+m[3]) + '-' + (+m[4]<10?'0':'') + (+m[4]) + ' ' + m[1] + ':' + m[2] + ' - ' + y + '-' + (+m[7]<10?'0':'') + (+m[7]) + '-' + (+m[8]<10?'0':'') + (+m[8]) + ' ' + m[5] + ':' + m[6];
}
function splr(l) { var t = l.replace(/；/g,';'), ms = t.match(/\d{4}\/\d{1,2}\.\d{1,2}-\d{4}\/\d{1,2}\.\d{1,2};?/g); if (!ms) return null; return ms.map(tmr).filter(Boolean); }
function dcp(dt) { var m = dt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2});?$/); return m ? m[3] + '/' + m[4] + m[5] : null; }
function spp(p) { var m = p.match(/^洋山NO\.(\d+)$/i); if (m) return '洋' + m[1]; m = p.match(/^洋山(\d+)$/); if (m) return '洋' + m[1]; return p; }
function pln(l) {
  l = l.trimEnd(); if (!l) return '';
  var r = splr(l); if (r && r.length) return r;
  if (l.indexOf('\t') >= 0) {
    var parts = l.split('\t'); var p = spp(parts[0].trim()); var c = parts.slice(1).join('\t').trim();
    if (c) { var dc = dcp(c); if (dc) return p + ' ' + dc; var tg = tstr(c); if (tg !== null) return p + ' ' + tg; }
    return c ? p + '\t' + c : p;
  }
  var m = l.match(/^([NA])\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2});?$/);
  if (m) { var dc2 = dcp(m[2]); if (dc2) return m[1] + ' ' + dc2; }
  var tg = tstr(l); if (tg !== null && (tg !== l || /港拖|沪救|海平|兴晟|洋山拖/.test(l))) return tg;
  m = l.match(/^([NA])\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (m) return m[1] + ' ' + m[4] + '/' + m[5] + m[6];
  m = l.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (m) return m[3] + '/' + m[4] + m[5];
  m = l.match(/^([NA])\s+(\d+)\s+港拖$/);
  if (m) return m[1] + ' ' + m[2] + '港拖';
  return l;
}
function cv() {
  var inp = document.getElementById('ci').value, st = document.getElementById('cs');
  if (!inp.trim()) { st.innerHTML = '请输入数据'; st.className = 'st st-err'; return; }
  var out = [];
  inp.split('\n').forEach(function(l) { var r = pln(l); if (Array.isArray(r)) out.push.apply(out, r); else out.push(r); });
  document.getElementById('co').value = out.join('\n');
  st.innerHTML = '✅ 完成'; st.className = 'st st-ok';
}
function cc() {
  var o = document.getElementById('co').value, st = document.getElementById('cs');
  if (!o.trim()) { st.innerHTML = '无内容'; st.className = 'st st-err'; return; }
  navigator.clipboard.writeText(o).then(function(){ st.innerHTML='📋已复制'; st.className='st st-ok'; }).catch(function(){ document.getElementById('co').select(); document.execCommand('copy'); st.innerHTML='📋已复制'; st.className='st st-ok'; });
}
function cx() { document.getElementById('ci').value=''; document.getElementById('co').value=''; document.getElementById('cs').innerHTML=''; }

/* ═══ Tab切换 ═══ */
/* 权限: 游客0-4 / 调度员0-5 / 管理员0-6 */
function sw(i) {
  var user = getCurrentUser();
  var isLoggedIn = !!user;
  var isAdmin = user && user.role === 'admin';
  var isDispatcher = user && user.role === 'dispatcher';

  /* 权限: 游客0-1 / 调度员0-5 / 管理员0-6 */
  if (!isLoggedIn && i >= 2) { alert('👀 游客仅可查看AI助手和港口实况，请登录后访问更多功能'); return; }
  if (isDispatcher && i >= 6) { alert('🔒 数据管理仅管理员可访问'); return; }

  var btns = document.querySelectorAll('.tb-btn');
  var tabs = document.querySelectorAll('.tc');
  for (var j = 0; j < btns.length; j++) btns[j].classList.toggle('on', j === i);
  for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('on', j === i);

  /* 清理旧定时器 */
  if (i !== 2) { if (dashRefreshTimer) { clearInterval(dashRefreshTimer); dashRefreshTimer = null; } }

  /* 离开黑板时停止轮询 */
  if (i !== 5 && typeof stopBBPoll === 'function') stopBBPoll();

  /* Tab 0: AI助手 */
  if (i === 0) updateAIStats();

  /* Tab 2: 船舶动态 */
  if (i === 2) { rd(); startDashRefresh(); }

  /* Tab 3: 海事申报 */
  if (i === 3) rd3();

  /* Tab 5: 调度黑板 */
  if (i === 5) initBlackboard();

  /* Tab 6: 数据管理 — 仅管理员 */
  if (i === 6) {
    document.getElementById('sd').disabled = false;
    ld();
    renderMonthlyArchive();
  }
}

/* ═══ 更新AI助手统计标签 ═══ */
async function updateAIStats() {
  var el = document.getElementById('aiDbStats');
  if (!el) return;
  try {
    var allData = await getAllData();
    var dates = {};
    allData.forEach(function(s) { if (s.date) dates[s.date] = true; });
    var dc = Object.keys(dates).length;
    el.textContent = '📅 ' + dc + '天 | 🚢 ' + allData.length + '条';
  } catch(e) {
    el.textContent = '📅 加载中...';
  }
}

/* ═══════════════════════════════════════════════════
   V5: 申报看板 + ETA预警
   ═══════════════════════════════════════════════════ */

function getETAHours(etaStr) {
  if (!etaStr) return Infinity;
  var now = new Date();
  var y = now.getFullYear();
  var mNow = now.getMonth();
  var dNow = now.getDate();
  var etaStrClean = etaStr.trim();
  var mDD = etaStrClean.match(/^(\d{1,2})\/(\d{3,4})$/);
  if (mDD) {
    var dayD = parseInt(mDD[1]);
    var timeStr = mDD[2];
    var hourD = 0, minD = 0;
    if (timeStr.length === 4) { hourD = parseInt(timeStr.slice(0,2)); minD = parseInt(timeStr.slice(2)); }
    else if (timeStr.length === 3) { hourD = parseInt(timeStr.slice(0,1)); minD = parseInt(timeStr.slice(1)); }
    else if (timeStr.length === 2) { hourD = parseInt(timeStr); }
    else if (timeStr.length === 1) { hourD = parseInt(timeStr); }
    var etaDateD = new Date(y, mNow, dayD, hourD, minD);
    if ((etaDateD - now) < -30*24*60*60*1000) {
      etaDateD = new Date(y, mNow + 1, dayD, hourD, minD);
    }
    var diffH = (etaDateD - now) / (1000 * 60 * 60);
    return diffH < 0 ? -1 : diffH;
  }
  var mDD2 = etaStrClean.match(/^(\d{1,2})\/?$/);
  if (mDD2) {
    var dayD2 = parseInt(mDD2[1]);
    var etaDateD2 = new Date(y, mNow, dayD2, 23, 59);
    if ((etaDateD2 - now) < -30*24*60*60*1000) {
      etaDateD2 = new Date(y, mNow + 1, dayD2, 23, 59);
    }
    return Math.max(0, (etaDateD2 - now) / (1000 * 60 * 60));
  }
  var m = etaStrClean.match(/^(\d{1,2})[\/\-\.](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    var month = parseInt(m[1]) - 1;
    var day = parseInt(m[2]);
    var hour = parseInt(m[3]);
    var min = parseInt(m[4]);
    var etaDate = new Date(y, month, day, hour, min);
    if (etaDate < now) {
      if (month < now.getMonth()) { etaDate = new Date(y + 1, month, day, hour, min); }
      else { etaDate = new Date(y, month, day + 1, hour, min); }
    }
    return (etaDate - now) / (1000 * 60 * 60);
  }
  var m2 = etaStrClean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m2) {
    var etaDate2 = new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]), parseInt(m2[4]), parseInt(m2[5]));
    return (etaDate2 - now) / (1000 * 60 * 60);
  }
  var m3 = etaStrClean.match(/^(\d{1,2}):(\d{2})$/);
  if (m3) {
    var etaDate3 = new Date(y, now.getMonth(), now.getDate(), parseInt(m3[1]), parseInt(m3[2]));
    if (etaDate3 < now) etaDate3.setDate(etaDate3.getDate() + 1);
    return (etaDate3 - now) / (1000 * 60 * 60);
  }
  return Infinity;
}

function getETAAlertLevel(etaStr) {
  var hours = getETAHours(etaStr);
  if (hours === Infinity) return '';
  if (hours < 0) return 'expired';
  if (hours <= 24) return 'danger';
  if (hours <= 48) return 'warn';
  return 'ok';
}

function fmtETA(etaStr) {
  if (!etaStr) return '—';
  return esc(etaStr);
}

function rd3() {
  var kw = (document.getElementById('dFilter3').value || '').trim().toLowerCase();
  var filtered = ships;
  if (kw) {
    filtered = [];
    for (var i = 0; i < ships.length; i++) {
      var s = ships[i];
      if (s.name.toLowerCase().indexOf(kw) >= 0 ||
          (s.iv||'').toLowerCase().indexOf(kw) >= 0 ||
          (s.ev||'').toLowerCase().indexOf(kw) >= 0 ||
          (s.en||'').toLowerCase().indexOf(kw) >= 0) {
        filtered.push(s);
      }
    }
  }

  var countMarDone = 0, countWarn = 0;
  filtered.forEach(function(s) {
    if (s.maritime7) countMarDone++;
    var alert = getETAAlertLevel(s.eta);
    if (alert === 'danger' || alert === 'warn') countWarn++;
  });
  document.getElementById('stT3').textContent = filtered.length;
  document.getElementById('stMar3').textContent = countMarDone;
  document.getElementById('stWarn3').textContent = countWarn;

  if (!filtered.length) {
    document.getElementById('dg3').innerHTML = '<div class="st-big">无匹配船舶</div>';
    return;
  }

  var groups = {};
  filtered.forEach(function(s) {
    var key = s.tm || '';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });
  Object.keys(groups).forEach(function(k) {
    groups[k].sort(function(a, b) {
      if (a.maritime7 !== b.maritime7) return a.maritime7 ? 1 : -1;
      return getETAHours(a.eta) - getETAHours(b.eta);
    });
  });

  var keys = Object.keys(groups).filter(function(k){ return k !== ''; }).sort(function(a,b){ return groups[b].length - groups[a].length; });
  if (groups['']) keys.push('');

  var html = '<div class="tc-grid">';
  for (var g = 0; g < keys.length; g++) {
    var tm = keys[g];
    var grp = groups[tm];
    if (!grp || !grp.length) continue;
    var label = tm || '⛵ 其他';
    html += '<div class="tc-col"><h3>' + esc(label) + ' <span>' + grp.length + '</span></h3>';
    for (var i = 0; i < grp.length; i++) {
      var sh = grp[i];
      var alert = getETAAlertLevel(sh.eta);

      var maritimeDone = sh.maritime7;
      var hoursLeft = getETAHours(sh.eta);
      var cardStatusColor = '';
      var statusText = '';
      if (maritimeDone) {
        cardStatusColor = 'sc-maritime-done';
        statusText = '<span class="eta-tag eta-green">\u5df2\u7533\u62a5</span>';
      } else if (hoursLeft >= 0 && hoursLeft < 24) {
        cardStatusColor = 'sc-maritime-danger';
        statusText = '<span class="eta-tag eta-red">\u26a0 24h\u5185\u5f85\u62a5</span>';
      } else {
        cardStatusColor = 'sc-maritime-warn';
        statusText = '<span class="eta-tag eta-orange">\u5f85\u7533\u62a5</span>';
      }
      var cardClass = 'sc ' + cardStatusColor;

      var m7Icon = sh.maritime7 ? '🟢' : (hoursLeft >= 0 && hoursLeft < 24 ? '🔴' : '🟠');
      var m7Note = sh.maritime7Note ? ' <span style="color:#64748B;font-size:9px">(' + esc(sh.maritime7Note) + ')</span>' : '';

      html += '<div class="' + cardClass + '" style="cursor:pointer" onclick="openDeclModal(\'' + esc(sh.name.replace(/'/g,"\\'")) + '\',\'' + esc((sh.iv||'').replace(/'/g,"\\'")) + '\',\'' + esc((sh.ev||'').replace(/'/g,"\\'")) + '\')" title="点击确认7日海事">'
        + '<div class="sn">'
        + '<span>' + esc(sh.name) + '</span>'
        + '<span>' + statusText + '</span>'
        + '</div>'
        + '<div class="info">'
        + 'ETA: <b>' + fmtETA(sh.eta) + '</b>'
        + (sh.iv ? '<br>航次 <b>' + esc(sh.iv) + '/' + esc(sh.ev) + '</b>' : '')
        + '<br><b>' + esc(sh.pp) + '</b> → <b>' + esc(sh.np) + '</b>'
        + '</div>'
        + '<div class="decl-status">'
        + '<span class="item ' + (sh.maritime7?'done':'pending') + '">' + m7Icon + ' 7日海事' + m7Note + '</span>'
        + '</div>'
        + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  document.getElementById('dg3').innerHTML = html;
}

/* 申报弹窗 */
var _declShipKey = '';

function openDeclModal(name, iv, ev) {
  var s = null;
  for (var i = 0; i < ships.length; i++) {
    if (ships[i].name === name && (ships[i].iv||'') === iv && (ships[i].ev||'') === ev) {
      s = ships[i]; break;
    }
  }
  if (!s) { alert('未找到船舶数据'); return; }

  _declShipKey = name + '|' + iv + '|' + ev;
  document.getElementById('declModalTitle').textContent = '📋 申报确认 · ' + name;
  var alertLevel = getETAAlertLevel(s.eta);
  var alertHTML = '';
  if (alertLevel === 'danger') alertHTML = '<span class="eta-tag eta-red" style="display:inline-block;margin-top:4px">🔴 ETA <24小时，请优先处理</span>';
  else if (alertLevel === 'warn') alertHTML = '<span class="eta-tag eta-orange" style="display:inline-block;margin-top:4px">🟠 ETA <48小时，请尽快处理</span>';
  else if (alertLevel === 'expired') alertHTML = '<span class="eta-tag" style="display:inline-block;margin-top:4px;background:#E5E7EB;color:#6B7280">⚫ ETA已过期</span>';

  var body = document.getElementById('declModalBody');
  body.innerHTML = ''
    + '<div style="margin-bottom:14px;padding:10px 14px;background:#F0F7FF;border:1px solid #DBEAFE;border-radius:10px">'
    + '<div style="font-size:12px;color:#475569">📅 ETA: <b style="color:#0F172A">' + fmtETA(s.eta) + '</b>'
    + ' · 航次 ' + esc(s.iv||'—') + '/' + esc(s.ev||'—')
    + ' · 🚢 ' + esc(s.pp) + ' → ' + esc(s.np)
    + '</div>'
    + alertHTML
    + '</div>'
    + '<div class="decl-section">'
    + '<h4>⚓ 7日海事</h4>'
    + '<div class="check-row">'
    + '<input type="checkbox" id="declMaritime7" ' + (isViewerMode ? 'disabled ' : '') + (s.maritime7 ? 'checked' : '') + '>'
    + '<label for="declMaritime7"' + (isViewerMode ? ' style="color:#94A3B8"' : '') + '>已完成7日海事申报' + (isViewerMode ? ' （只读）' : '') + '</label>'
    + '<span id="declMaritimeBadge" class="status-badge ' + (s.maritime7 ? 'badge-done' : 'badge-pending') + '">' + (s.maritime7 ? '✅ 已完成' + (s.maritime7By ? ' · ' + esc(s.maritime7By) : '') : '⏳ 未完成') + '</span>'
    + '</div>'
    + '<label for="declMaritimeNote" style="font-size:11px;color:#64748B;margin-top:4px">备注（可选）</label>'
    + '<textarea id="declMaritimeNote" placeholder="未完成原因或备注..." ' + (isViewerMode ? 'disabled style="background:#F8FAFC;color:#94A3B8"' : '') + '>' + esc(s.maritime7Note) + '</textarea>'
    + '</div>';

  document.getElementById('declMaritime7').addEventListener('change', function() {
    var badge = document.getElementById('declMaritimeBadge');
    if (this.checked) { badge.textContent = '✅ 已完成'; badge.className = 'status-badge badge-done'; }
    else { badge.textContent = '⏳ 未完成'; badge.className = 'status-badge badge-pending'; }
  });

  document.getElementById('declModalFt').innerHTML = isViewerMode
    ? '<span style="color:#94A3B8;font-size:12px;padding:4px 0">👀 访客模式，仅可查看</span><button class="btn" style="background:#E2E8F0;color:#475569" onclick="closeDeclModal()">关闭</button>'
    : '<button class="btn btn-p" onclick="saveDecl()">💾 保存</button>'
    + '<button class="btn" style="background:#E2E8F0;color:#475569" onclick="closeDeclModal()">关闭</button>';

  document.getElementById('declModal').classList.add('on');
}

async function saveDecl() {
  if (!checkEditPerm(curDate)) return;
  var user = getCurrentUser();
  var parts = _declShipKey.split('|');
  var name = parts[0], iv = parts[1]||'', ev = parts[2]||'';
  var maritime7 = document.getElementById('declMaritime7').checked;
  var maritime7Note = document.getElementById('declMaritimeNote').value.trim();
  var confirmedBy = maritime7 && user ? user.username : '';

  for (var i = 0; i < ships.length; i++) {
    if (ships[i].name === name && (ships[i].iv||'') === iv && (ships[i].ev||'') === ev) {
      ships[i].maritime7 = maritime7;
      ships[i].maritime7Note = maritime7Note;
      ships[i].maritime7By = confirmedBy;
      break;
    }
  }

  await saveDeclToDB(curDate, name, iv, ev, {
    maritime7: maritime7,
    maritime7Note: maritime7Note,
    maritime7By: confirmedBy
  });

  closeDeclModal();
  rd3();

  /* 自动发布到线上，合并远程数据避免覆盖 */
  var stEl = document.getElementById('dbStatus');
  stEl.textContent = '💾 已保存 · 🔄 同步发布中...';
  try {
    await publishDeclChange(name, iv, ev, {
      maritime7: maritime7,
      maritime7Note: maritime7Note,
      maritime7By: confirmedBy
    }, curDate);
    stEl.textContent = '✅ 申报已同步到线上 · ' + new Date().toTimeString().slice(0,5);
  } catch(e) {
    stEl.innerHTML = '<span style="color:#D97706">⚠️ 本地已保存，同步失败：' + escHtml(e.message) + '（请管理员手动点"发布到线上"）</span>';
  }
}

/* ═══ 增量发布申报变更（合并远程数据，不覆盖历史） ═══ */
async function publishDeclChange(name, iv, ev, declData, date) {
  var tokenEnc = localStorage.getItem('gh_token_enc');
  if (!tokenEnc) throw new Error('未配置GitHub Token');
  var token = atob(tokenEnc);

  /* 1. 拉取远程现有数据 */
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, 8000);
  var resp = await fetch(SHARED_DATA_URL + '?t=' + Date.now(), { signal: controller.signal });
  clearTimeout(timeout);
  if (!resp.ok) throw new Error('拉取远程数据失败');

  var remote = await resp.json();
  var remoteShips = Array.isArray(remote) ? remote : (remote.ships || []);

  /* 2. 合并：更新匹配的船舶申报状态 */
  var found = false;
  for (var i = 0; i < remoteShips.length; i++) {
    var s = remoteShips[i];
    if (s.name === name && (s.iv||'') === iv && (s.ev||'') === ev && s.date === date) {
      s.maritime7 = declData.maritime7 ? 1 : 0;
      s.maritime7Note = declData.maritime7Note || '';
      s.maritime7By = declData.maritime7By || '';
      found = true;
      break;
    }
  }
  if (!found) throw new Error('远程数据中未找到该船舶');

  /* 3. 推送到GitHub */
  var payload = { ships: remoteShips, blackboard: remote.blackboard || [], updated: Date.now() };
  var token = atob(tokenEnc);

  /* 获取远程文件SHA */
  var sha = null;
  try {
    var r1 = await fetch('https://api.github.com/repos/' + APP_CONFIG.githubOwner + '/' + APP_CONFIG.githubRepo + '/contents/' + APP_CONFIG.dataPath, {
      headers: { 'Authorization': 'token ' + token }
    });
    if (r1.ok) { var info = await r1.json(); sha = info.sha; }
  } catch(e) {}

  var body = {
    message: '📋 海事申报更新 ' + name + ' ' + new Date().toISOString().slice(0,16).replace('T',' '),
    content: base64Encode(JSON.stringify(payload, null, 2)),
    branch: APP_CONFIG.githubBranch
  };
  if (sha) body.sha = sha;

  var r2 = await fetch('https://api.github.com/repos/' + APP_CONFIG.githubOwner + '/' + APP_CONFIG.githubRepo + '/contents/' + APP_CONFIG.dataPath, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r2.ok) {
    var errResult = await r2.json();
    throw new Error(errResult.message || 'GitHub API失败');
  }
}

function closeDeclModal() {
  document.getElementById('declModal').classList.remove('on');
}

async function onDashDate3() {
  var d = document.getElementById('dDate3').value;
  if (!d) return;
  curDate = d;
  document.getElementById('sd').value = d;
  /* 同步船舶动态日期 */
  var dDateEl = document.getElementById('dDate');
  if (dDateEl) dDateEl.value = d;
  if (isViewerMode) {
    ships = sharedShips.filter(function(s) { return s.date === d; });
  } else {
    ships = await loadDateData(d);
    if (!ships.length && sharedShips.length) {
      ships = sharedShips.filter(function(s) { return s.date === d; });
    }
  }
  ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
  rd3();
}

/* ═══════════════════════════════════════════════════
   共享数据发布 & 访客模式
   ═══════════════════════════════════════════════════ */

var SHARED_DATA_URL = 'https://dylanwilde.github.io/' + APP_CONFIG.githubRepo + '/data/ships.json';
var PRE_CONFIG_TOKEN = '';
var isViewerMode = false;
var sharedShips = [];
var sharedBB = [];

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function publishData() {
  if (!getCurrentUser() || getCurrentUser().role !== 'admin') { alert('🔒 仅管理员可发布'); return; }
  var tokenEnc = localStorage.getItem('gh_token_enc');
  if (!tokenEnc) {
    var token = prompt('请输入 GitHub Personal Access Token（仅存本机，不会上传）：');
    if (!token) return;
    localStorage.setItem('gh_token_enc', btoa(token));
    tokenEnc = btoa(token);
  }
  var token = atob(tokenEnc);

  var localData = await getAllData();
  if (!localData.length) { alert('暂无本地数据可发布'); return; }

  var btn = document.querySelector('#adminArea button');
  btn.textContent = '⏳ 合并远程数据...'; btn.disabled = true;

  try {
    var remote = await fetchRemoteData(token);
    var mergedShips = remote ? mergeShips(localData, remote.ships) : localData;
    var mergedBB = remote ? remote.blackboard : [];
    if (typeof getAllBBMessages === 'function') {
      try { var bb = await getAllBBMessages(); if (bb.length) mergedBB = bb; } catch(e) {}
    }

    btn.textContent = '⏳ 发布中...';
    var payload = { ships: mergedShips, blackboard: mergedBB, updated: Date.now() };
    var jsonStr = JSON.stringify(payload);
    var content = btoa(unescape(encodeURIComponent(jsonStr)));

    var apiUrl = 'https://api.github.com/repos/' + APP_CONFIG.githubOwner + '/' + APP_CONFIG.githubRepo + '/contents/' + APP_CONFIG.dataPath;

    var body = {
      message: '🚢 调度精灵数据更新 ' + new Date().toISOString().slice(0, 10),
      content: content,
      branch: APP_CONFIG.githubBranch
    };
    if (remote && remote.sha) body.sha = remote.sha;

    var r2 = await fetch(apiUrl, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    var result = await r2.json();
    if (r2.ok) {
      var dateCount = Object.keys(mergedShips.reduce(function(acc,s){acc[s.date]=true;return acc;},{})).length;
      alert('✅ 发布成功！\n' + mergedShips.length + ' 条船舶 | ' + dateCount + ' 个日期\n（合并远程 ' + (remote ? remote.ships.length : 0) + ' 条 + 本机 ' + localData.length + ' 条）');
      document.getElementById('dbStatus').innerHTML = '<span class="pulse-dot syncing"></span>📤 已发布 ' + mergedShips.length + ' 条 · 所有人可见';
      sharedShips = mergedShips;
    } else {
      var errMsg = result.message || '未知错误';
      if (r2.status === 422) errMsg = '文件过大或格式错误：' + errMsg;
      if (r2.status === 401) errMsg = 'Token无效，请重新输入';
      if (r2.status === 403) errMsg = 'Token无写入权限，请确认Token勾选了repo权限';
      alert('❌ 发布失败 [' + r2.status + ']：' + errMsg);
    }
  } catch(e) {
    alert('❌ ' + e.message);
  }

  btn.textContent = '📤 发布到线上'; btn.disabled = false;
}

async function fetchRemoteData(token) {
  try {
    var r = await fetch('https://api.github.com/repos/' + APP_CONFIG.githubOwner + '/' + APP_CONFIG.githubRepo + '/contents/' + APP_CONFIG.dataPath, {
      headers: { 'Authorization': 'token ' + token }
    });
    if (r.ok) {
      var info = await r.json();
      var jsonStr = decodeURIComponent(escape(atob(info.content)));
      var data = JSON.parse(jsonStr);
      return { sha: info.sha, ships: data.ships || [], blackboard: data.blackboard || [] };
    }
  } catch(e) { console.log('获取远程数据失败: ' + e.message); }
  return null;
}

function mergeShips(localShips, remoteShips) {
  var localDates = {};
  localShips.forEach(function(s) { if (s.date) localDates[s.date] = true; });

  var map = {};
  remoteShips.forEach(function(s) {
    if (!s.date) return;
    if (localDates[s.date]) return;
    map[s.date + '|' + (s.name||'') + '|' + (s.iv||'') + '|' + (s.ev||'')] = s;
  });
  localShips.forEach(function(s) {
    if (!s.date) return;
    map[s.date + '|' + (s.name||'') + '|' + (s.iv||'') + '|' + (s.ev||'')] = s;
  });
  return Object.values(map);
}

async function publishDataSilent() {
  var tokenEnc = localStorage.getItem('gh_token_enc');
  if (!tokenEnc) throw new Error('未配置Token，请手动点"发布到线上"输入');
  var token = atob(tokenEnc);

  var localData = await getAllData();
  if (!localData.length) throw new Error('no data');

  var remote = await fetchRemoteData(token);
  var mergedShips = remote ? mergeShips(localData, remote.ships) : localData;
  var mergedBB = remote ? remote.blackboard : [];
  if (typeof getAllBBMessages === 'function') {
    try { var bb = await getAllBBMessages(); if (bb.length) mergedBB = bb; } catch(e) {}
  }

  var payload = { ships: mergedShips, blackboard: mergedBB, updated: Date.now() };
  var content = base64Encode(JSON.stringify(payload, null, 2));

  var body = {
    message: '🚢 调度精灵数据更新 ' + new Date().toISOString().slice(0, 10),
    content: content,
    branch: APP_CONFIG.githubBranch
  };
  if (remote && remote.sha) body.sha = remote.sha;

  var r2 = await fetch('https://api.github.com/repos/' + APP_CONFIG.githubOwner + '/' + APP_CONFIG.githubRepo + '/contents/' + APP_CONFIG.dataPath, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r2.ok) throw new Error('publish failed');
  document.getElementById('dbStatus').innerHTML = '<span class="pulse-dot syncing"></span>📤 已发布 ' + localData.length + ' 条船舶数据（合并远程 ' + (remote ? remote.ships.length : 0) + ' 条）';
}

async function tryLoadSharedData() {
  /* 最多重试3次，每次15秒超时 */
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 15000);
      var resp = await fetch(SHARED_DATA_URL + '?t=' + Date.now(), {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeout);
      if (!resp.ok) {
        console.log('共享数据加载HTTP错误: ' + resp.status);
        continue;
      }
      var data = await resp.json();
      if (Array.isArray(data)) return { ships: data, blackboard: [] };
      if (data && data.ships) {
        console.log('✅ 共享数据已加载: ' + data.ships.length + ' 条船舶');
        return data;
      }
      console.log('共享数据格式异常，重试...');
    } catch(e) {
      console.log('共享数据加载失败(尝试' + (attempt+1) + '/3): ' + e.message);
    }
  }
  console.log('❌ 共享数据加载失败，3次重试均未成功');
  return null;
}

function fillSharedDateSelect(payload, selId) {
  var data = Array.isArray(payload) ? payload : (payload.ships || []);
  var dates = {};
  data.forEach(function(s) { if (s.date) dates[s.date] = true; });
  var list = Object.keys(dates).sort().reverse();
  var sel = document.getElementById(selId);
  if (!sel) return '';
  sel.innerHTML = '<option value="">— 选择 —</option>';
  list.forEach(function(d) {
    var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
  });
  if (list.length) sel.value = list[0];
  return list[0] || '';
}

function enterViewerMode(payload) {
  isViewerMode = true;
  sharedShips = payload.ships || [];
  sharedBB = payload.blackboard || [];

  /* 游客仅可见Tab0-1，隐藏Tab2-6 */
  for (var t = 2; t <= 6; t++) {
    var btn = document.querySelectorAll('.tb-btn')[t];
    if (btn) btn.style.display = 'none';
  }

  var latest = fillSharedDateSelect(payload, 'dDate');
  fillSharedDateSelect(payload, 'dDate3');
  if (latest) {
    curDate = latest;
    ships = sharedShips.filter(function(s) { return s.date === latest; });
    ships.forEach(function(s) {
      s.eta = s.eta || '';
      s.maritime7 = !!s.maritime7;
      s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || '';
    });
    rd();
    document.getElementById('dbStatus').textContent = '👀 访客模式 · 共 ' + sharedShips.length + ' 条共享数据';
  } else {
    document.getElementById('dg').innerHTML = '<div class="st-big">📭 暂无共享数据，请联系管理员</div>';
    document.getElementById('dg3').innerHTML = '';
    document.getElementById('dbStatus').textContent = '👀 访客模式 · 暂无数据';
  }
}


/* 天气/拥堵状态设置 */
var _weatherState = 'normal';
function setWeather(state) {
  _weatherState = state;
  var wEl = document.getElementById('cjWeather');
  var cEl = document.getElementById('wgqCongestion');
  var upEl = document.getElementById('weatherUpdated');
  var now = new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
  if (wEl) {
    if (state === 'normal') {
      wEl.textContent = '正常'; wEl.className = 'w-value w-normal';
      cEl.textContent = '正常'; cEl.className = 'w-value w-normal';
    } else if (state === 'wind') {
      wEl.textContent = '大风 (6-7级)'; wEl.className = 'w-value w-danger';
      cEl.textContent = '正常'; cEl.className = 'w-value w-normal';
    } else if (state === 'fog') {
      wEl.textContent = '大雾 (能见度<500m)'; wEl.className = 'w-value w-danger';
      cEl.textContent = '正常'; cEl.className = 'w-value w-normal';
    }
  }
  if (upEl) upEl.textContent = '更新于 ' + now;
}

/* ═══════════════════════════════════════════════════
   船讯网API联动
   ═══════════════════════════════════════════════════ */

var CORS_PROXIES = [
  function(u){ return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
  function(u){ return 'https://corsproxy.io/?' + encodeURIComponent(u); },
  function(u){ return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); }
];

function shipxyFetch(url, cb, idx) {
  idx = idx || 0;
  if (idx >= CORS_PROXIES.length) { cb(null); return; }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', CORS_PROXIES[idx](url), true);
  xhr.timeout = 8000;
  xhr.onload = function(){
    try{ var d = JSON.parse(xhr.responseText); cb(d); }
    catch(e){ shipxyFetch(url, cb, idx+1); }
  };
  xhr.onerror = function(){ shipxyFetch(url, cb, idx+1); };
  xhr.ontimeout = function(){ shipxyFetch(url, cb, idx+1); };
  xhr.send();
}

function shipxyFind(imo, nameEn, cb) {
  var key = APP_CONFIG.shipxyKey;
  shipxyFetch('http://api.shipxy.com/apicall/v3/SearchShip?key=' + key + '&keywords=' + imo + '&max=1', function(d){
    if (d && d.status===0 && d.data && d.data.length) { cb(d.data[0]); return; }
    if (nameEn) {
      shipxyFetch('http://api.shipxy.com/apicall/v3/SearchShip?key=' + key + '&keywords=' + encodeURIComponent(nameEn) + '&max=1', function(d2){
        cb(d2 && d2.status===0 && d2.data && d2.data.length ? d2.data[0] : null);
      });
    } else { cb(null); }
  });
}

function shipxyAIS(mmsi, cb) {
  var key = APP_CONFIG.shipxyKey;
  shipxyFetch('http://api.shipxy.com/apicall/v3/GetSingleShip?key=' + key + '&mmsi=' + mmsi, function(d){
    cb(d && d.status===0 && d.data ? d.data : null);
  });
}

var SHIP_TYPES={0:'未知',1:'油轮',2:'油轮',3:'油轮',4:'油轮',5:'油轮',6:'油轮',7:'货船',8:'货船',9:'货船',10:'货船',11:'货船',12:'货船',13:'货船',14:'货船',15:'货船',16:'货船',20:'高速艇',21:'高速艇',22:'高速艇',23:'高速艇',24:'高速艇',25:'高速艇',26:'高速艇',27:'高速艇',28:'高速艇',29:'高速艇',30:'渔船',31:'拖轮',32:'拖轮',33:'拖轮',34:'拖轮',35:'拖轮',36:'拖轮',37:'拖轮',40:'高速艇',41:'高速艇',42:'高速艇',43:'高速艇',44:'高速艇',45:'高速艇',46:'高速艇',47:'高速艇',48:'高速艇',49:'高速艇',50:'引航/助航',51:'搜救船',52:'拖轮',53:'港务船',54:'防污船',55:'执法船',56:'备件船',57:'医疗船',58:'客船',60:'客船',61:'客船',62:'客船',63:'客船',64:'客船',65:'客船',66:'客船',67:'客船',68:'客船',69:'客船',70:'货船',71:'货船',72:'货船',73:'货船',74:'货船',75:'货船',76:'货船',77:'货船',78:'货船',79:'货船',80:'油轮',81:'油轮',82:'油轮',83:'油轮',84:'油轮',85:'油轮',86:'油轮',87:'油轮',88:'油轮',89:'油轮',90:'其他',91:'其他',92:'其他',93:'其他',94:'其他',95:'其他',96:'其他',97:'其他',98:'其他',99:'其他'};
function getShipType(t){ return SHIP_TYPES[t] || ('类型'+t); }

function openShipModal(name, imo, nameEn) {
  var overlay = document.getElementById('shipModal');
  var body = document.getElementById('modalBody');
  var ft = document.getElementById('modalFt');
  document.getElementById('modalTitle').textContent = '🚢 ' + name;
  body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#94A3B8"><div style="font-size:32px;margin-bottom:10px">⏳</div><div>正在查询实时位置...</div></div>';
  ft.innerHTML = '';
  overlay.classList.add('on');

  var searchKw = imo || (nameEn || name);
  var key = APP_CONFIG.shipxyKey;
  shipxyFetch('http://api.shipxy.com/apicall/v3/SearchShip?key=' + key + '&keywords=' + encodeURIComponent(searchKw) + '&max=1', function(d){
      if (!d || d.status!==0 || !d.data || !d.data.length) {
        if (imo && nameEn) {
          shipxyFetch('http://api.shipxy.com/apicall/v3/SearchShip?key=' + key + '&keywords=' + encodeURIComponent(nameEn) + '&max=1', function(d2){
            if (!d2 || d2.status!==0 || !d2.data || !d2.data.length) {
              var link = imo ? 'https://www.shipxy.com/Ship/Index?imo=' + imo : 'https://www.shipxy.com/';
              body.innerHTML = '<div style="text-align:center;padding:20px;color:#94A3B8"><div style="font-size:36px;margin-bottom:8px">🔍</div><div style="font-weight:600;color:#475569">船讯网暂无该船数据</div></div>';
              ft.innerHTML = '<a class="btn btn-p" href="' + link + '" target="_blank" rel="noopener">🔗 去船讯网试试</a><button class="btn" style="background:#E2E8F0;color:#475569" onclick="closeModal()">关闭</button>';
              return;
            }
            getAISAndRender(d2.data[0], name, imo, body, ft);
          });
        } else {
          var link = imo ? 'https://www.shipxy.com/Ship/Index?imo=' + imo : 'https://www.shipxy.com/';
          body.innerHTML = '<div style="text-align:center;padding:20px;color:#94A3B8"><div style="font-size:36px;margin-bottom:8px">🔍</div><div style="font-weight:600;color:#475569">船讯网暂无该船数据</div></div>';
          ft.innerHTML = '<a class="btn btn-p" href="' + link + '" target="_blank" rel="noopener">🔗 去船讯网试试</a><button class="btn" style="background:#E2E8F0;color:#475569" onclick="closeModal()">关闭</button>';
        }
        return;
      }
      getAISAndRender(d.data[0], name, imo, body, ft);
    });
}

function getAISAndRender(ship, name, imo, body, ft) {
  shipxyAIS(ship.mmsi, function(ais){
    if (!ais) {
      body.innerHTML = '<div style="text-align:center;padding:20px;color:#94A3B8"><div style="font-size:36px;margin-bottom:8px">📡</div><div style="font-weight:600;color:#475569">暂无实时AIS信号</div></div>';
      ft.innerHTML = '<a class="btn btn-p" href="https://www.shipxy.com/Ship/Index?imo=' + (ship.imo||'') + '" target="_blank" rel="noopener">🔗 船讯网查看</a><button class="btn" style="background:#E2E8F0;color:#475569" onclick="closeModal()">关闭</button>';
      return;
    }
    renderShipCard({found:true, has_ais:true, ship:ship, ais:ais}, name, imo, ft, body);
  });
}

function renderShipCard(data, name, imo, ft, body) {
  if (!body) body = document.getElementById('modalBody');
  if (!data.has_ais) {
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#94A3B8"><div style="font-size:40px;margin-bottom:12px">📡</div><div style="font-weight:600;color:#475569">暂无实时AIS信号</div></div>';
    ft.innerHTML = '<a class="btn btn-p" href="https://www.shipxy.com/Ship/Index?imo=' + (data.ship.imo||'') + '" target="_blank" rel="noopener">🔗 船讯网查看</a><button class="btn" style="background:#E2E8F0;color:#475569" onclick="closeModal()">关闭</button>';
    return;
  }
  var a = data.ais;
  var NAVS=[{k:'0',v:'在航',c:'#059669',b:'#D1FAE5'},{k:'1',v:'锚泊',c:'#D97706',b:'#FEF3C7'},{k:'2',v:'失控',c:'#DC2626',b:'#FEE2E2'},{k:'3',v:'限速',c:'#EA580C',b:'#FFEDD5'},{k:'4',v:'吃水受限',c:'#7C3AED',b:'#EDE9FE'},{k:'5',v:'靠泊',c:'#2563EB',b:'#DBEAFE'},{k:'6',v:'搁浅',c:'#DC2626',b:'#FEE2E2'},{k:'7',v:'捕鱼',c:'#0891B2',b:'#CFFAFE'},{k:'8',v:'航行中',c:'#059669',b:'#D1FAE5'}];
  var naviObj = {v:'—',c:'#64748B',b:'#F1F5F9'};
  for(var i=0;i<NAVS.length;i++){ if(NAVS[i].k==a.navistat){ naviObj=NAVS[i]; break; } }
  var naviText = naviObj.v, naviColor = naviObj.c, naviBg = naviObj.b;
  var TYPES={0:'未知',1:'油轮',7:'货船',20:'高速艇',30:'渔船',31:'拖轮',36:'拖轮',50:'引航/助航',51:'搜救船',52:'拖轮',53:'港务船',55:'执法船',58:'客船',60:'客船',70:'货船',80:'油轮',90:'其他'};
  var st = TYPES[a.ship_type] || (a.ship_type ? '类型'+a.ship_type : '—');
  var lat = (a.lat||a.lat===0)?Number(a.lat).toFixed(3):'—';
  var lng = (a.lng||a.lng===0)?Number(a.lng).toFixed(3):'—';
  var sog = (a.sog||a.sog===0)?Number(a.sog).toFixed(1):'—';
  var cog = (a.cog||a.cog===0)?Number(a.cog).toFixed(1)+'°':'—';
  var hdg = (a.hdg||a.hdg===0)?Number(a.hdg).toFixed(1)+'°':'—';
  var call = a.call_sign?esc(a.call_sign):'—';
  var len = a.length||'—', wid = a.width||'—';
  var dr = (a.draught||a.draught===0)?a.draught.toFixed(1):'—';
  var dest = a.dest?esc(a.dest):'—';
  var dcode = a.destcode?esc(a.destcode):'—';
  var eta = a.eta?esc(a.eta):'—';
  var ut = a.last_time||'—';
  var cnName = a.ship_cnname ? esc(a.ship_cnname) : '';

  body.style.padding = '0';
  body.innerHTML =
    '<div style="background:linear-gradient(135deg,#0A1628,#1E3A5F,#2563EB);border-radius:16px 16px 0 0;padding:20px 20px 16px;color:#fff">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div><div style="font-size:19px;font-weight:800;letter-spacing:.5px">🚢 ' + esc(a.ship_name||name) + '</div>'
    + (cnName?'<div style="font-size:12px;color:#93C5FD;margin-top:2px">'+cnName+'</div>':'')
    + '<div style="font-size:11px;color:#94A3D8;margin-top:4px">IMO ' + (a.imo||'—') + ' · MMSI ' + (a.mmsi||'—') + ' · ' + call + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:11px;font-weight:600;background:rgba(255,255,255,.15);padding:4px 12px;border-radius:8px;backdrop-filter:blur(4px)">' + st + '</div>'
    + '<div style="margin-top:6px;display:inline-block;background:'+naviBg+';color:'+naviColor+';font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px">● ' + naviText + '</div></div></div></div>'
    + '<div style="display:flex;gap:8px;padding:12px 16px;background:#F8FAFC">'
    + '<div style="flex:1;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
    + '<div style="font-size:10px;color:#64748B;font-weight:600">💧 吃水</div>'
    + '<div style="font-size:20px;font-weight:800;color:#0F172A;margin-top:2px">' + dr + '<span style="font-size:12px;font-weight:400;color:#64748B;margin-left:2px">m</span></div></div>'
    + '<div style="flex:2;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
    + '<div style="font-size:10px;color:#64748B;font-weight:600">🏁 目的地</div>'
    + '<div style="font-size:16px;font-weight:700;color:#0F172A;margin-top:2px">' + dest + (dcode!=='—'?' <span style="font-size:11px;font-weight:400;color:#64748B">('+dcode+')</span>':'') + '</div></div>'
    + '</div>'
    + '<div style="padding:0 16px 10px">'
    + '<div style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border:1px solid #BFDBFE;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:10px">'
    + '<div style="background:#2563EB;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px">⏰</div>'
    + '<div><div style="font-size:10px;color:#1E40AF;font-weight:600">预计到达时间 (ETA)</div>'
    + '<div style="font-size:16px;font-weight:800;color:#1E3A8A;margin-top:1px">' + eta + '</div></div></div></div>'
    + '<div style="display:flex;gap:1px;padding:0 16px;margin-bottom:10px">'
    + '<div style="flex:1;background:#F0F7FF;padding:10px 8px;text-align:center;border-radius:10px 0 0 10px"><div style="font-size:15px;font-weight:800;color:#1D4ED8">' + lat + '°</div><div style="font-size:9px;color:#64748B;margin-top:1px">纬度 N</div></div>'
    + '<div style="flex:1;background:#F0F7FF;padding:10px 8px;text-align:center"><div style="font-size:15px;font-weight:800;color:#1D4ED8">' + lng + '°</div><div style="font-size:9px;color:#64748B;margin-top:1px">经度 E</div></div>'
    + '<div style="flex:1;background:#F0F7FF;padding:10px 8px;text-align:center"><div style="font-size:15px;font-weight:800;color:#1D4ED8">' + sog + '<span style="font-size:10px">kn</span></div><div style="font-size:9px;color:#64748B;margin-top:1px">船速</div></div>'
    + '<div style="flex:1;background:#F0F7FF;padding:10px 8px;text-align:center;border-radius:0 10px 10px 0"><div style="font-size:15px;font-weight:800;color:#1D4ED8">' + cog + '</div><div style="font-size:9px;color:#64748B;margin-top:1px">航向</div></div>'
    + '</div>'
    + '<div style="padding:0 16px 10px">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">'
    + '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:8px;text-align:center"><div style="font-size:12px;font-weight:700;color:#0F172A">' + len + '×' + wid + '</div><div style="font-size:9px;color:#64748B;margin-top:1px">尺寸(m)</div></div>'
    + '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:8px;text-align:center"><div style="font-size:12px;font-weight:700;color:#0F172A">' + hdg + '</div><div style="font-size:9px;color:#64748B;margin-top:1px">船首向</div></div>'
    + '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:8px;text-align:center"><div style="font-size:12px;font-weight:700;color:#0F172A">' + dr + 'm</div><div style="font-size:9px;color:#64748B;margin-top:1px">吃水</div></div>'
    + '</div></div>'
    + '<div style="padding:8px 16px 12px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94A3B8">'
    + '<span>🔄 更新于 ' + ut + '</span>'
    + '<span>📡 AIS数据·船讯网</span>'
    + '</div>';
  ft.innerHTML = '<a class="btn btn-p" href="https://www.shipxy.com/Ship/Index?imo=' + (a.imo||data.ship.imo||'') + '" target="_blank" rel="noopener" style="font-size:13px;padding:10px 20px">🔗 在船讯网查看完整详情</a><button class="btn" style="background:#E2E8F0;color:#475569;font-size:13px;padding:10px 20px" onclick="closeModal()">关闭</button>';
}

function closeModal(){ document.getElementById('shipModal').classList.remove('on'); }

/* ═══ 预置账号 ═══ */
async function seedAccounts() {
  var d = db;
  if (!d) return;
  var presetUsers = [
    { username: '姜磊', password: simpleHash('888'), role: 'admin' },
    { username: '王剑峰', password: simpleHash('888'), role: 'admin' },
    { username: '杨华', password: simpleHash('888'), role: 'admin' },
    { username: '冯磊', password: simpleHash('888'), role: 'dispatcher' },
    { username: '赵逢时', password: simpleHash('888'), role: 'dispatcher' },
    { username: '丁思樑', password: simpleHash('888'), role: 'dispatcher' },
    { username: '肖明', password: simpleHash('888'), role: 'dispatcher' },
    { username: '沈正阳', password: simpleHash('888'), role: 'dispatcher' },
    { username: '聂铭辰', password: simpleHash('888'), role: 'dispatcher' }
  ];
  var tx = d.transaction('accounts', 'readwrite');
  var st = tx.objectStore('accounts');
  for (var i = 0; i < presetUsers.length; i++) {
    var pu = presetUsers[i];
    await new Promise(function(ok) {
      var r = st.get(pu.username);
      r.onsuccess = function() {
        if (!r.result) {
          st.add({ username: pu.username, password: pu.password, role: pu.role, created: Date.now() });
        }
        ok();
      };
      r.onerror = function() { ok(); };
    });
  }
  await new Promise(function(ok) { tx.oncomplete = function() { ok(); }; });
}

/* ═══ 月度归档 ═══ */
async function renderMonthlyArchive() {
  var allData = isViewerMode ? sharedShips : await getAllData();
  if (!allData.length) {
    document.getElementById('maStats').innerHTML = '';
    document.getElementById('maGrid').innerHTML = '<div class="st-info" style="text-align:center;padding:20px">暂无数据</div>';
    return;
  }

  var months = {};
  allData.forEach(function(s) {
    if (!s.date) return;
    var m = s.date.substring(0, 7);
    if (!months[m]) months[m] = { dates: {}, total: 0 };
    months[m].dates[s.date] = (months[m].dates[s.date] || 0) + 1;
    months[m].total++;
  });

  var sorted = Object.keys(months).sort().reverse();
  var dateCount = sorted.reduce(function(a, m) { return a + Object.keys(months[m].dates).length; }, 0);

  document.getElementById('maStats').innerHTML =
    '<div class="ma-stat"><div class="ma-sn">' + allData.length + '</div><div class="ma-sl">总船舶记录</div></div>' +
    '<div class="ma-stat"><div class="ma-sn">' + dateCount + '</div><div class="ma-sl">覆盖日期</div></div>' +
    '<div class="ma-stat"><div class="ma-sn">' + sorted.length + '</div><div class="ma-sl">覆盖月份</div></div>';

  var html = '';
  sorted.forEach(function(m) {
    var info = months[m];
    var dates = Object.keys(info.dates).sort().reverse();
    var dateRows = dates.map(function(d) {
      return '<div class="ma-date-row" onclick="event.stopPropagation();document.getElementById(\'sd\').value=\'' + d + '\';ld();sw(6)"><span>📅 ' + d + '</span><span class="ma-dn">' + info.dates[d] + ' 条</span></div>';
    }).join('');

    html += '<div class="ma-card" id="mac-' + m + '" onclick="toggleMonthCard(\'' + m + '\')">' +
      '<div class="ma-month">📦 ' + m.replace('-', '年') + '月</div>' +
      '<div class="ma-count">' + info.total + ' 条船期 · ' + dates.length + ' 个日期</div>' +
      '<div class="ma-dates">' + dateRows + '</div>' +
      '<div class="ma-actions">' +
        '<button class="btn btn-s btn-sm" onclick="event.stopPropagation();exportMonthData(\'' + m + '\')">📥 导出</button>' +
        '<button class="btn btn-s btn-sm" onclick="event.stopPropagation();toggleMonthCard(\'' + m + '\');this.blur()">📂 ' + dates.length + '天</button>' +
      '</div>' +
    '</div>';
  });

  document.getElementById('maGrid').innerHTML = html;
}

function toggleMonthCard(m) {
  var card = document.getElementById('mac-' + m);
  if (!card) return;
  card.classList.toggle('expanded');
}

function exportMonthData(m) {
  var allData = isViewerMode ? sharedShips : [];
  if (!allData.length) {
    try { var tx = db.transaction('ships', 'readonly'); tx.objectStore('ships').getAll().onsuccess = function(e) {
      exportMonthRows(m, e.target.result || []);
    }; } catch(e) { alert('导出失败: ' + e.message); }
    return;
  }
  exportMonthRows(m, allData);
}

function exportMonthRows(m, allData) {
  var rows = allData.filter(function(s) { return s.date && s.date.substring(0, 7) === m; });
  if (!rows.length) { alert(m + ' 无数据'); return; }

  var headers = ['日期', '船名', '英文名', '进口航次', '出口航次', '码头', '抵港吃水', '离港吃水', '上港', '下港', '备注', 'ETA', '海事申报'];
  var csv = '﻿' + headers.join(',') + '\n';
  rows.forEach(function(s) {
    csv += [s.date||'', s.name||'', s.en||'', s.iv||'', s.ev||'', s.tm||'', s.arRaw||s.arV||'', s.drRaw||s.drV||'', s.pp||'', s.np||'', s.rm||'', s.eta||'', s.maritime7?'已完成':'未完成'].map(function(v) {
      return '"' + String(v).replace(/"/g, '""') + '"';
    }).join(',') + '\n';
  });

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = '调度精灵_' + m.replace('-', '') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══ 启动 ═══ */
(async function() {
  var sharedData = await tryLoadSharedData();

  /* 预加载共享数据 */
  if (sharedData) {
    sharedShips = sharedData.ships || [];
    sharedBB = sharedData.blackboard || [];
    fillSharedDateSelect(sharedData, 'dDate');
    fillSharedDateSelect(sharedData, 'dDate3');
    document.getElementById('dbStatus').innerHTML = '<span class="pulse-dot syncing"></span>👀 在线数据 · 共 ' + sharedShips.length + ' 条';
  }

  var today = new Date().toISOString().split('T')[0];
  document.getElementById('sd').value = today;
  await opDB();

  /* 预置调度员和经理账号 */
  await seedAccounts();

  /* 尝试自动登录 */
  var savedUser = localStorage.getItem('dispatch_user');
  if (savedUser) {
    try {
      var d = db || window._bbDB;
      var tx = d.transaction('accounts', 'readonly');
      var st = tx.objectStore('accounts');
      var r = st.get(savedUser);
      await new Promise(function(ok) { r.onsuccess = ok; r.onerror = ok; });
      if (r.result) {
        currentUser = { username: r.result.username, role: r.result.role };
        updateUserUI();
      } else {
        localStorage.removeItem('dispatch_user');
      }
    } catch(e) {}
  }

  /* 初始化小黑板日期下拉 */
  var bbSel = document.getElementById('bbDate');
  if (bbSel) {
    var dates = await listDates();
    if (!dates.length && sharedShips.length) {
      var sd = {};
      sharedShips.forEach(function(s) { if (s.date) sd[s.date] = true; });
      dates = Object.keys(sd).sort().reverse();
    }
    if (!dates.length) dates = [today];
    bbSel.innerHTML = '<option value="">— 选择 —</option>';
    dates.forEach(function(d) {
      var o = document.createElement('option'); o.value = d; o.textContent = d; bbSel.appendChild(o);
    });
    bbSel.value = today;
    bbDate = today;
    bbMessages = await loadBBMessages(today);
    renderBlackboard();
  }

  var dates = await listDates();
  if (dates.length) {
    /* 优先选今天，今天没数据则选最新日期 */
    var today = new Date().toISOString().split('T')[0];
    curDate = (dates.indexOf(today) >= 0) ? today : dates[0];
    document.getElementById('sd').value = curDate;
    var dDateEl2 = document.getElementById('dDate');
    if (dDateEl2) dDateEl2.value = curDate;
    var dDate3El2 = document.getElementById('dDate3');
    if (dDate3El2) dDate3El2.value = curDate;
    ships = await loadDateData(curDate);
    if (!ships.length && sharedShips.length) {
      ships = sharedShips.filter(function(s) { return s.date === curDate; });
      ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
    }
    document.getElementById('upSt').innerHTML = '📅 ' + curDate + ' — 数据库 ' + ships.length + ' 条记录';
    document.getElementById('upSt').className = 'st st-info';
    document.getElementById('dbStatus').innerHTML = '<span class="pulse-dot"></span>💾 已加载 ' + ships.length + ' 条数据';
    ['dl','dDate','dDate3'].forEach(function(id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '<option value="">— 选择 —</option>';
      dates.forEach(function(d) {
        var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
      });
      sel.value = curDate;
    });
    rd(); rd3(); startDashRefresh();
    updateAIStats();
  } else if (sharedShips.length) {
    /* 本地无数据，使用线上共享数据 — 进入访客模式 */
    enterViewerMode({ ships: sharedShips, blackboard: sharedBB });
    var sdates = {};
    sharedShips.forEach(function(s) { if (s.date) sdates[s.date] = true; });
    var sdatesList = Object.keys(sdates).sort().reverse();
    if (sdatesList.length) {
      /* 优先今天，否则最新 */
      var today2 = new Date().toISOString().split('T')[0];
      curDate = (sdatesList.indexOf(today2) >= 0) ? today2 : sdatesList[0];
      ships = sharedShips.filter(function(s) { return s.date === curDate; });
      ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
      ['dl','dDate','dDate3'].forEach(function(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">— 选择 —</option>';
        sdatesList.forEach(function(d) {
          var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
        });
        sel.value = curDate;
      });
      document.getElementById('sd').value = curDate;
      document.getElementById('upSt').innerHTML = '📅 ' + curDate + ' — 在线数据 ' + ships.length + ' 条';
      document.getElementById('upSt').className = 'st st-info';
      document.getElementById('dbStatus').innerHTML = '<span class="pulse-dot syncing"></span>👀 在线数据 · 共 ' + sharedShips.length + ' 条';
      rd(); rd3(); startDashRefresh();
      updateAIStats();
    }
  } else {
    document.getElementById('upSt').innerHTML = '📅 暂无数据，请上传船期表';
    document.getElementById('dbStatus').textContent = '💾 数据库就绪，等待上传';
    /* 无本地也无共享数据，游客仅看Tab0-1 */
    for (var t2 = 2; t2 <= 6; t2++) {
      var btn2 = document.querySelectorAll('.tb-btn')[t2];
      if (btn2) btn2.style.display = 'none';
    }
  }

  /* 初始化AI助手 */
  if (typeof initAIAssistant === 'function') { initAIAssistant(); }
  updateAIStats();
  renderMonthlyArchive();
})();
