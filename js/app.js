/* ═══════════════════════════════════════════════════
   调度精灵 DispatchHub V5 — 主应用逻辑
   依赖: ships-map.js (SHIP_MAP), SheetJS (XLSX CDN)
   ═══════════════════════════════════════════════════ */

/* ═══ 配置（部署时修改此处） ═══ */
var APP_CONFIG = {
  shipxyKey: '97e629f2456c4e00bfa208741d1707f5',   // 船讯网API密钥
  githubOwner: 'DylanWilde',
  githubRepo: 'diaodujingling-V1',
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
    if (!db) { ok([]); return; }
    var tx = db.transaction('ships', 'readonly');
    var st = tx.objectStore('ships');
    var r = st.getAll();
    r.onsuccess = function() {
      var dates = {};
      (r.result || []).forEach(function(s) { if (s.date) dates[s.date] = true; });
      ok(Object.keys(dates).sort().reverse());
    };
    r.onerror = function() { ok([]); };
  });
}

function updateDraftDB(date, name, iv, ev, field, val) {
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
        if (field === 'arrival') { hit.arV = val; hit.arRaw = val + ' (手动)'; hit._m = 1; }
        else if (field === 'eta') { hit.eta = val; }
        else { hit.drV = val; hit.drRaw = val + ' (手动)'; hit._m = 1; }
        st.put(hit);
      }
    };
    tx.oncomplete = function() { ok(true); };
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
    if (raw.indexOf('下昼夜')>=0 || raw.indexOf('PS:')>=0 || raw.indexOf('集中办公')>=0) continue;
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
    sel.innerHTML = '<option value="">— 选择 —</option>';
    dates.forEach(function(d) {
      var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
    });
  });
  if (dates.length) {
    var latest = dates[0];
    if (!ships.length || curDate !== latest) {
      document.getElementById('dDate').value = latest;
      document.getElementById('dDate3').value = latest;
      document.getElementById('sd').value = latest;
      curDate = latest;
      ships = await loadDateData(latest);
    }
  }
}

function gd() {
  var v = document.getElementById('dl').value;
  if (v) { document.getElementById('sd').value = v; ld(); }
}

/* ═══ 搜索 ═══ */
function findShip(kw) {
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

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function qr() {
  var kw = document.getElementById('si').value.trim();
  var el = document.getElementById('sr');
  if (!kw) { el.innerHTML = '请输入船名'; el.className = 'st st-err'; return; }
  if (!ships.length) { el.innerHTML = '无数据'; el.className = 'st st-err'; return; }
  var r = findShip(kw);
  if (!r) { el.innerHTML = '❌ 未找到'; el.className = 'st st-err'; return; }
  var a = r.arV != null ? r.arV : (r.arRaw || '—');
  var d = r.drV != null ? r.drV : (r.drRaw || '—');
  var m = r._m ? ' <span class="tg tg-warn">✏️手动</span>' : '';
  el.innerHTML = '<div style="background:#F1F5F9;border-radius:10px;padding:14px">'
    + '<div style="font-weight:700;margin-bottom:8px">✨ ' + esc(r.name) + m + '</div>'
    + '<div class="tw"><table><tr><th>船名</th><th>英文名</th><th>航次</th><th>码头</th><th>抵港吃水</th><th>开航吃水</th><th>上港</th><th>下港</th><th>ETA</th><th>备注</th></tr>'
    + '<tr><td style="font-weight:700">' + esc(r.name) + '</td><td>' + esc(r.en||'') + '</td>'
    + '<td>' + esc(r.iv||r.ev) + '</td><td>' + esc(r.tm) + '</td><td>' + a + '</td><td>' + d + '</td>'
    + '<td>' + esc(r.pp) + '</td><td>' + esc(r.np) + '</td><td>' + esc(r.eta||'') + '</td><td>' + esc(r.rm) + '</td></tr></table></div></div>';
  el.className = '';
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

/* ═══ 修改吃水 ═══ */
async function ed() {
  if (!checkEditPerm(curDate)) return;
  var n = document.getElementById('es').value.trim();
  var t = document.getElementById('et').value;
  var v = parseFloat(document.getElementById('ev').value);
  var el = document.getElementById('em');
  if (!n) { el.innerHTML = '请输入船名'; el.className = 'st st-err'; return; }
  if (isNaN(v)) { el.innerHTML = '请输入有效数值'; el.className = 'st st-err'; return; }
  if (!ships.length) { el.innerHTML = '无数据'; el.className = 'st st-err'; return; }
  var r = findShip(n);
  if (!r) { el.innerHTML = '未找到'; el.className = 'st st-err'; return; }
  if (t === 'arrival') { r.arV = v; r.arRaw = v + ' (手动)'; }
  else { r.drV = v; r.drRaw = v + ' (手动)'; }
  r._m = true;
  await updateDraftDB(curDate, r.name, r.iv, r.ev, t, v);
  el.innerHTML = '✅ ' + r.name + ' ' + (t==='arrival'?'抵港':'开航') + '吃水 → ' + v + '米（已保存）';
  el.className = 'st st-ok';
}

/* ═══ 批量核对 ═══ */
function bc() {
  var at = document.getElementById('ab').value;
  var dt = document.getElementById('db').value;
  var br = document.getElementById('br');
  if (!ships.length) { br.innerHTML = ''; return; }
  function parse(t, ty) {
    var items = [];
    var lines = t.trim().split('\n');
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim(); if (!l) continue;
      var ps = l.split(/\s+/);
      var n = ps[0], ud = null;
      if (ps.length >= 2) {
        var f = parseFloat(ps[ps.length - 1]);
        if (!isNaN(f)) { ud = f; n = ps.slice(0, -1).join(' '); }
      }
      items.push({ n: n.trim(), ud: ud, ty: ty });
    }
    return items;
  }
  var items = [];
  if (at.trim()) items = items.concat(parse(at, 'arrival'));
  if (dt.trim()) items = items.concat(parse(dt, 'departure'));
  if (!items.length) { br.innerHTML = ''; return; }
  var html = '<div class="tw"><table><tr><th>类型</th><th>输入</th><th>匹配</th><th>航次</th><th>输入(m)</th><th>实际(m)</th><th>上港</th><th>下港</th><th>备注</th><th>结果</th></tr>';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var r = findShip(it.n);
    if (!r) { html += '<tr><td>' + (it.ty==='arrival'?'抵港':'开航') + '</td><td>' + esc(it.n) + '</td><td colspan="8">❌ 未匹配</td></tr>'; continue; }
    var act = it.ty === 'arrival' ? r.arV : r.drV;
    var raw = it.ty === 'arrival' ? r.arRaw : r.drRaw;
    var disp = act != null ? act : (raw || '无');
    var res = '';
    if (it.ud != null && act != null) {
      var df = Math.abs(act - it.ud);
      res = df <= 0.02 ? '<span class="tg tg-ok">✓ 一致</span>' : '<span class="tg tg-err">✗差' + df.toFixed(3) + 'm</span>';
    } else if (it.ud == null) { res = '<span class="tg tg-info">仅展示</span>'; }
    else { res = '<span class="tg tg-warn">无值</span>'; }
    html += '<tr><td>' + (it.ty==='arrival'?'抵港':'开航') + '</td><td>' + esc(it.n) + '</td>'
      + '<td style="font-weight:700;color:#2563EB">' + esc(r.name) + (r._m?' ✏️':'') + '</td>'
      + '<td>' + esc(r.iv||r.ev) + '</td><td>' + (it.ud!=null?it.ud:'—') + '</td><td>' + disp + '</td>'
      + '<td>' + esc(r.pp) + '</td><td>' + esc(r.np) + '</td><td>' + esc(r.rm) + '</td><td>' + res + '</td></tr>';
  }
  html += '</table></div>';
  br.innerHTML = html;
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

  /* 新统计: 代理船舶数 / 24h预抵(ETA≤24h) / 48h预抵(ETA≤48h) / 码头数 */
  var count24h = 0, count48h = 0;
  filtered.forEach(function(s) {
    var hours = getETAHours(s.eta);
    if (hours >= 0 && hours <= 24) count24h++;
    if (hours >= 0 && hours <= 48) count48h++;
  });
  document.getElementById('stT').textContent = filtered.length;
  document.getElementById('stA').textContent = count24h;
  document.getElementById('stD').textContent = count48h;
  var terms = {};
  filtered.forEach(function(s){ if (s.tm) terms[s.tm] = true; });
  document.getElementById('stM').textContent = Object.keys(terms).length;

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
      var ha = sh.arV != null, hd = sh.drV != null;
      var etaHours = getETAHours(sh.eta);
      var tags = '';
      if (ha) tags += '<span class="tag tag-arr">抵' + sh.arV + 'm</span>';
      if (hd) tags += '<span class="tag tag-dep">开' + sh.drV + 'm</span>';
      if (etaHours >= 0 && etaHours <= 24) tags += '<span class="eta-tag eta-red">24h</span>';
      else if (etaHours > 24 && etaHours <= 48) tags += '<span class="eta-tag eta-orange">48h</span>';

      var key = sh.name + '|' + (sh.iv||'') + '|' + (sh.ev||'');
      var shipInfo = SHIP_MAP[sh.name];
      var matchedEn = sh.en || (shipInfo ? shipInfo.en : '');
      var imoNumber = shipInfo && shipInfo.imo ? shipInfo.imo : '';
      var imoDisplay = imoNumber ? 'IMO' + imoNumber : '';

      html += '<div class="sc" style="cursor:pointer;background:#F0F7FF" onclick="openShipModal(\'' + (sh.name||'').replace(/'/g,"\\'") + '\',\'' + imoNumber + '\',\'' + (matchedEn||'').replace(/'/g,"\\'") + '\')" title="点击查看船舶实时动态">'
        + '<div class="sn"><span>' + esc(sh.name) + '</span><span class="tags">' + tags + '</span></div>'
        + '<div class="info">'
        + (sh.iv ? '航次 <b>' + esc(sh.iv) + '/' + esc(sh.ev) + '</b> · ' : '')
        + 'ETA: <b>' + fmtETA(sh.eta) + '</b>'
        + '<br>🚢 <b>' + esc(sh.pp) + '</b> → <b>' + esc(sh.np) + '</b>'
        + (sh.rm !== '—' ? ' · ' + esc(sh.rm) : '')
        + (sh.maritime7By ? '<br><span style="font-size:9px;color:#16A34A">✅ 海事已确认 by ' + esc(sh.maritime7By) + '</span>' : '')
        + '</div></div>';
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
  document.getElementById('dDate3').value = d;
  if (isViewerMode) {
    ships = sharedShips.filter(function(s) { return s.date === d; });
    ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
  } else {
    ships = await loadDateData(d);
    /* 本地无数据则回退到共享数据 */
    if (!ships.length && sharedShips.length) {
      ships = sharedShips.filter(function(s) { return s.date === d; });
      ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
    }
  }
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
function sw(i) {
  /* 未登录用户只能访问 Tab 0-3 (看板/申报/海图/黑板) */
  var isLoggedIn = !!getCurrentUser();
  if (!isLoggedIn && i >= 4) { alert('👀 请先登录管理员或调度员账号'); return; }

  var btns = document.querySelectorAll('.tb-btn');
  var tabs = document.querySelectorAll('.tc');
  for (var j = 0; j < btns.length; j++) btns[j].classList.toggle('on', j === i);
  for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('on', j === i);

  if (i === 0) { rd(); startDashRefresh(); }
  else { if (dashRefreshTimer) { clearInterval(dashRefreshTimer); dashRefreshTimer = null; } }

  if (i === 1) rd3();
  if (i === 2) {} /* 海图已是静态HTML */
  if (i === 3) initBlackboard();

  /* 调度员进管理Tab时锁定当日 */
  if (i === 5) {
    var user = getCurrentUser();
    if (user && user.role === 'dispatcher') {
      var today = new Date().toISOString().split('T')[0];
      document.getElementById('sd').value = today;
      document.getElementById('sd').disabled = true;
    } else {
      document.getElementById('sd').disabled = false;
    }
    ld();
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

      var etaTag = '';
      if (alert === 'danger') etaTag = '<span class="eta-tag eta-red">🔴 <24h</span>';
      else if (alert === 'warn') etaTag = '<span class="eta-tag eta-orange">🟠 <48h</span>';
      else if (alert === 'ok') etaTag = '<span class="eta-tag eta-ok">🟢 >48h</span>';
      else if (alert === 'expired') etaTag = '<span class="eta-tag" style="background:#E5E7EB;color:#6B7280">⚫ 已过</span>';

      var cardClass = 'sc';
      if (alert === 'danger') cardClass += ' sc-eta-danger';
      else if (alert === 'warn') cardClass += ' sc-eta-warn';
      else if (alert === 'ok') cardClass += ' sc-eta-ok';
      else cardClass += ' sc-eta-ok';

      var m7Icon = sh.maritime7 ? '✅' : '⬜';
      var m7Note = sh.maritime7Note ? ' <span style="color:#64748B;font-size:9px">(' + esc(sh.maritime7Note) + ')</span>' : '';

      html += '<div class="' + cardClass + '" style="cursor:pointer" onclick="openDeclModal(\'' + esc(sh.name.replace(/'/g,"\\'")) + '\',\'' + esc((sh.iv||'').replace(/'/g,"\\'")) + '\',\'' + esc((sh.ev||'').replace(/'/g,"\\'")) + '\')" title="点击确认7日海事">'
        + '<div class="sn">'
        + '<span>' + esc(sh.name) + '</span>'
        + '<span>' + etaTag + '</span>'
        + '</div>'
        + '<div class="info">'
        + '📅 ETA: <b>' + fmtETA(sh.eta) + '</b>'
        + (sh.iv ? '<br>航次 <b>' + esc(sh.iv) + '/' + esc(sh.ev) + '</b>' : '')
        + '<br>🚢 <b>' + esc(sh.pp) + '</b> → <b>' + esc(sh.np) + '</b>'
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
  document.getElementById('dbStatus').textContent = '💾 申报状态已保存';
}

function closeDeclModal() {
  document.getElementById('declModal').classList.remove('on');
}

async function onDashDate3() {
  var d = document.getElementById('dDate3').value;
  if (!d) return;
  curDate = d;
  document.getElementById('sd').value = d;
  document.getElementById('dDate').value = d;
  if (isViewerMode) {
    ships = sharedShips.filter(function(s) { return s.date === d; });
    ships.forEach(function(s) {
      s.eta = s.eta || '';
      s.maritime7 = !!s.maritime7;
      s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || '';
    });
  } else {
    ships = await loadDateData(d);
    /* 本地无数据则回退到共享数据 */
    if (!ships.length && sharedShips.length) {
      ships = sharedShips.filter(function(s) { return s.date === d; });
      ships.forEach(function(s) {
        s.eta = s.eta || '';
        s.maritime7 = !!s.maritime7;
        s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || '';
      });
    }
  }
  rd3();
}

/* ═══════════════════════════════════════════════════
   共享数据发布 & 访客模式
   ═══════════════════════════════════════════════════ */

var SHARED_DATA_URL = 'https://dylanwilde.github.io/' + APP_CONFIG.githubRepo + '/data/ships.json';
var PRE_CONFIG_TOKEN = '';
var isViewerMode = false;
var sharedShips = [];

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function publishData() {
  if (!getCurrentUser() || getCurrentUser().role !== 'admin') { alert('🔒 仅管理员可发布'); return; }
  var tokenEnc = localStorage.getItem('gh_token_enc');
  if (!tokenEnc) {
    var token = prompt('请输入 GitHub Personal Access Token：');
    if (!token) return;
    localStorage.setItem('gh_token_enc', btoa(token));
    tokenEnc = btoa(token);
  }
  var token = atob(tokenEnc);

  var data = await getAllData();
  if (!data.length) { alert('暂无数据可发布'); return; }

  var btn = document.querySelector('#adminArea button');
  btn.textContent = '⏳ 发布中...'; btn.disabled = true;

  try {
    var content = base64Encode(JSON.stringify(data, null, 2));
    var sha = null;

    try {
      var r1 = await fetch('https://api.github.com/repos/' + APP_CONFIG.githubOwner + '/' + APP_CONFIG.githubRepo + '/contents/' + APP_CONFIG.dataPath, {
        headers: { 'Authorization': 'token ' + token }
      });
      if (r1.ok) { var info = await r1.json(); sha = info.sha; }
    } catch(e) {}

    var body = {
      message: '🚢 调度精灵数据更新 ' + new Date().toISOString().slice(0, 10),
      content: content,
      branch: APP_CONFIG.githubBranch
    };
    if (sha) body.sha = sha;

    var r2 = await fetch('https://api.github.com/repos/' + APP_CONFIG.githubOwner + '/' + APP_CONFIG.githubRepo + '/contents/' + APP_CONFIG.dataPath, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    var result = await r2.json();
    if (r2.ok) {
      alert('✅ 发布成功！\n已推送 ' + data.length + ' 条船舶数据到线上。\nGitHub Pages 约1-2分钟后生效。');
      document.getElementById('dbStatus').textContent = '📤 已发布 ' + data.length + ' 条到线上';
    } else {
      alert('❌ 发布失败：' + (result.message || '未知错误'));
    }
  } catch(e) {
    alert('❌ 网络错误：' + e.message);
  }

  btn.textContent = '📤 发布到线上'; btn.disabled = false;
}

async function tryLoadSharedData() {
  try {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 5000);
    var resp = await fetch(SHARED_DATA_URL + '?t=' + Date.now(), { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    var data = await resp.json();
    if (Array.isArray(data) && data.length) return data;
  } catch(e) {}
  return null;
}

function fillSharedDateSelect(data, selId) {
  var dates = {};
  data.forEach(function(s) { if (s.date) dates[s.date] = true; });
  var list = Object.keys(dates).sort().reverse();
  var sel = document.getElementById(selId);
  sel.innerHTML = '<option value="">— 选择 —</option>';
  list.forEach(function(d) {
    var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
  });
  if (list.length) sel.value = list[0];
  return list[0] || '';
}

function enterViewerMode(sharedData) {
  isViewerMode = true;
  sharedShips = sharedData;

  document.getElementById('tbAdmin2').style.display = 'none';
  document.getElementById('tbAdmin3').style.display = 'none';

  var latest = fillSharedDateSelect(sharedData, 'dDate');
  fillSharedDateSelect(sharedData, 'dDate3');
  if (latest) {
    curDate = latest;
    ships = sharedData.filter(function(s) { return s.date === latest; });
    ships.forEach(function(s) {
      s.eta = s.eta || '';
      s.maritime7 = !!s.maritime7;
      s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || '';
    });
    rd();
    document.getElementById('dbStatus').textContent = '👀 访客模式 · 共 ' + sharedData.length + ' 条共享数据';
  } else {
    document.getElementById('dg').innerHTML = '<div class="st-big">📭 暂无共享数据，请联系管理员</div>';
    document.getElementById('dg3').innerHTML = '';
    document.getElementById('dbStatus').textContent = '👀 访客模式 · 暂无数据';
  }
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

/* ═══ 启动 ═══ */
(async function() {
  var sharedData = await tryLoadSharedData();

  /* 预加载共享数据 */
  if (sharedData) {
    sharedShips = sharedData;
    fillSharedDateSelect(sharedData, 'dDate');
    fillSharedDateSelect(sharedData, 'dDate3');
    document.getElementById('dbStatus').textContent = '👀 在线数据 · 共 ' + sharedData.length + ' 条';
  }

  var today = new Date().toISOString().split('T')[0];
  document.getElementById('sd').value = today;
  await opDB();

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
    curDate = dates[0];
    document.getElementById('sd').value = curDate;
    document.getElementById('dDate').value = curDate;
    document.getElementById('dDate3').value = curDate;
    ships = await loadDateData(curDate);
    if (!ships.length && sharedShips.length) {
      ships = sharedShips.filter(function(s) { return s.date === curDate; });
      ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
    }
    document.getElementById('upSt').innerHTML = '📅 ' + curDate + ' — 数据库 ' + ships.length + ' 条记录';
    document.getElementById('upSt').className = 'st st-info';
    document.getElementById('dbStatus').textContent = '💾 已加载 ' + ships.length + ' 条数据';
    ['dl','dDate','dDate3'].forEach(function(id) {
      var sel = document.getElementById(id);
      sel.innerHTML = '<option value="">— 选择 —</option>';
      dates.forEach(function(d) {
        var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
      });
      if (id === 'dl') sel.value = curDate;
    });
    rd();
    startDashRefresh();
  } else if (sharedShips.length) {
    /* 只有共享数据 */
    var sdates = {};
    sharedShips.forEach(function(s) { if (s.date) sdates[s.date] = true; });
    var sdatesList = Object.keys(sdates).sort().reverse();
    if (sdatesList.length) {
      curDate = sdatesList[0];
      ships = sharedShips.filter(function(s) { return s.date === curDate; });
      ships.forEach(function(s) { s.eta = s.eta || ''; s.maritime7 = !!s.maritime7; s.maritime7Note = s.maritime7Note || ''; s.maritime7By = s.maritime7By || ''; });
      sdatesList.forEach(function(d) {
        ['dl','dDate','dDate3'].forEach(function(id) {
          var sel = document.getElementById(id);
          var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
        });
      });
      document.getElementById('sd').value = curDate;
      document.getElementById('dDate').value = curDate;
      document.getElementById('dDate3').value = curDate;
      document.getElementById('upSt').innerHTML = '📅 ' + curDate + ' — 在线数据 ' + ships.length + ' 条';
      document.getElementById('upSt').className = 'st st-info';
      document.getElementById('dbStatus').textContent = '👀 在线数据 · 共 ' + sharedShips.length + ' 条';
      rd();
      startDashRefresh();
    }
  } else {
    document.getElementById('upSt').innerHTML = '📅 暂无数据，请上传船期表';
    document.getElementById('dbStatus').textContent = '💾 数据库就绪，等待上传';
  }
})();
