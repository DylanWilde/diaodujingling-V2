/* ═══════════════════════════════════════════════════
   调度精灵 V7 — 账号权限系统
   角色: admin(管理员) / leader(领导) / dispatcher(调度员)
   admin: 全部功能 + 账号管理 + 改密码
   leader: 除数据管理外全部
   dispatcher: 除数据管理和数据分析外
   游客: 仅AI助手 + 船舶动态
   ═══════════════════════════════════════════════════ */

var ACCOUNTS_DB = 'DDB_v5';
var currentUser = null;

var ROLES = {
  admin:      { label: '管理员', color: '#2563EB', bg: '#DBEAFE', tabs: [0,1,2,3,4,5,6,7] },
  leader:     { label: '领导',   color: '#7C3AED', bg: '#EDE9FE', tabs: [0,1,2,3,4,6,7] },
  dispatcher: { label: '调度员', color: '#D97706', bg: '#FEF3C7', tabs: [0,1,2,3,4,7] }
};

function getRoleInfo(role) { return ROLES[role] || ROLES.dispatcher; }

/* ── 初始化 accounts store ── */
function initAccountsStore(d) {
  if (!d.objectStoreNames.contains('accounts')) {
    var st = d.createObjectStore('accounts', { keyPath: 'username' });
    st.add({ username: 'admin', password: secureHash('admin888'), role: 'admin', created: Date.now() });
  }
}

/* ── DB 迁移 v4: 修正权限+新增用户 ── */
function migrateAccountsV4(d) {
  if (!d.objectStoreNames.contains('accounts')) return;
  var tx = d.transaction('accounts', 'readwrite');
  var st = tx.objectStore('accounts');

  /* 预设用户清单 */
  var preset = {
    'admin':  { role: 'admin', pwd: 'admin888' },
    '姜磊':   { role: 'leader' },
    '杨华':   { role: 'leader' },
    '王剑峰': { role: 'leader' },
    '韩韦':   { role: 'leader', pwd: 'hanwei888' },
    '冯磊':   { role: 'dispatcher' },
    '赵逢时': { role: 'dispatcher' },
    '丁思樑': { role: 'dispatcher' },
    '肖明':   { role: 'dispatcher' },
    '沈正阳': { role: 'dispatcher' },
    '聂铭辰': { role: 'dispatcher' },
    '索翼':   { role: 'dispatcher', pwd: 'suoyi888' },
    '李诗年': { role: 'dispatcher', pwd: 'lishinian888' }
  };

  var names = Object.keys(preset);
  var done = 0;

  function next() {
    if (done >= names.length) return;
    var uname = names[done];
    var cfg = preset[uname];
    var r = st.get(uname);
    r.onsuccess = function() {
      var existing = r.result;
      if (existing) {
        /* 更新已有用户 */
        existing.role = cfg.role;
        if (cfg.pwd) existing.password = secureHash(cfg.pwd);
        delete existing.needReset;
        st.put(existing);
      } else {
        /* 新增用户 */
        var pwd = cfg.pwd || generatePassword(12);
        st.add({ username: uname, password: secureHash(pwd), role: cfg.role, created: Date.now() });
      }
      done++;
      next();
    };
    r.onerror = function() { done++; next(); };
  }

  /* 修正已有 dispatcher/admin 角色 */
  st.getAll().onsuccess = function(e) {
    var all = e.target.result || [];
    all.forEach(function(a) {
      var cfg = preset[a.username];
      if (cfg) {
        /* 在预设清单中，跳过 get 单独处理 */
      } else if (a.role === 'dispatcher' || a.role === 'leader' || a.role === 'admin') {
        /* 未知用户保持原样 */
      }
    });
    next();
  };
}

/* ── 注册 ── */
function registerAccount(username, password, role) {
  return new Promise(function(ok, no) {
    var d = getBBDB() || db;
    if (!d) { no('数据库未就绪'); return; }
    try {
      var tx = d.transaction('accounts', 'readwrite');
      var st = tx.objectStore('accounts');
      var r = st.get(username);
      r.onsuccess = function() {
        if (r.result) { no('账号已存在'); return; }
        st.add({ username: username, password: secureHash(password), role: role || 'dispatcher', created: Date.now() });
        tx.oncomplete = function() { ok(true); };
      };
      r.onerror = function() { no('查询失败'); };
    } catch(e) { no('操作失败: ' + e.message); }
  });
}

/* ── 登录 ── */
function loginAccount(username, password) {
  return new Promise(function(ok, no) {
    var d = getBBDB() || db;
    if (!d) { no('数据库未就绪'); return; }
    try {
      var tx = d.transaction('accounts', 'readonly');
      var st = tx.objectStore('accounts');
      var r = st.get(username);
      r.onsuccess = function() {
        var acc = r.result;
        if (!acc) { no('账号不存在'); return; }
        if (!verifyHash(password, acc.password)) { no('密码错误'); return; }
        currentUser = { username: acc.username, role: acc.role };
        ok(currentUser);
      };
      r.onerror = function() { no('查询失败'); };
    } catch(e) { no('操作失败: ' + e.message); }
  });
}

function getCurrentUser() { return currentUser; }

/* ── 登出 ── */
function logoutAccount() {
  currentUser = null;
  document.getElementById('userArea').style.display = 'none';
  document.getElementById('loginArea').style.display = '';
  document.getElementById('adminArea').style.display = 'none';
  var allBtns = document.querySelectorAll('.tb-btn');
  for (var t = 1; t < allBtns.length; t++) {
    if (allBtns[t]) allBtns[t].style.display = 'none';
  }
  ['gh_token','llm_key','dispatch_user','shipxy_key'].forEach(function(k) {
    localStorage.removeItem('enc:' + k); localStorage.removeItem(k);
  });
  alert('已退出登录'); location.reload();
}

/* ── 日期编辑权限 ── */
function canEditDate(date) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin' || currentUser.role === 'leader') return true;
  var today = new Date().toISOString().split('T')[0];
  return date === today;
}

/* ── 更新 UI: 头像 + 标签 + Tab按钮 ── */
function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('loginArea').style.display = 'none';
  var ua = document.getElementById('userArea');
  ua.style.display = 'flex';
  var info = getRoleInfo(currentUser.role);
  var roleTag = '<span style="background:' + info.bg + ';color:' + info.color
    + ';font-size:10px;padding:2px 8px;border-radius:10px;margin:0 4px">' + info.label + '</span>';
  ua.innerHTML = '<span style="font-size:12px;color:#475569">👤 <b>' + escHtml(currentUser.username) + '</b></span>' + roleTag
    + (currentUser.role === 'admin' ? '<button class="btn btn-sm btn-s" onclick="openAccountModal()" style="font-size:10px">👥 账号</button>' : '')
    + '<button class="btn btn-sm btn-g" onclick="logoutAccount()" style="font-size:10px">🚪 退出</button>';

  /* Tab可见性 */
  var allowedTabs = info.tabs;
  var allBtns = document.querySelectorAll('.tb-btn');
  allBtns.forEach(function(btn, idx) {
    btn.style.display = allowedTabs.indexOf(idx) >= 0 ? '' : 'none';
  });

  /* 管理员显示发布按钮 */
  if (currentUser.role === 'admin') {
    document.getElementById('adminArea').style.display = 'inline';
  }
}

/* ── 账号管理弹窗 (仅admin) ── */
function openAccountModal() {
  if (currentUser.role !== 'admin') { alert('仅管理员可管理账号'); return; }
  var overlay = document.getElementById('acctModal');
  if (!overlay) return;
  var d = getBBDB() || db;
  try {
    var tx = d.transaction('accounts', 'readonly');
    var st = tx.objectStore('accounts');
    var r = st.getAll();
    r.onsuccess = function() {
      var accounts = r.result || [];
      var html = '<div style="overflow-x:auto"><table><tr><th>账号</th><th>角色</th><th>操作</th></tr>';
      accounts.forEach(function(a) {
        var info = getRoleInfo(a.role);
        var roleBadge = '<span style="background:' + info.bg + ';color:' + info.color
          + ';font-size:10px;padding:2px 8px;border-radius:10px">' + info.label + '</span>';
        var actions = '';
        if (a.username !== 'admin') {
          actions += '<select onchange="changeRole(\'' + escHtml(a.username) + '\', this.value)" style="font-size:10px;padding:2px 4px;width:70px">'
            + '<option value="leader"' + (a.role==='leader'?' selected':'') + '>领导</option>'
            + '<option value="dispatcher"' + (a.role==='dispatcher'?' selected':'') + '>调度员</option>'
            + '</select> ';
          actions += '<button class="btn btn-sm btn-g" onclick="resetPassword(\'' + escHtml(a.username) + '\')" style="font-size:10px">改密</button> ';
          actions += '<button class="btn btn-sm btn-g" onclick="deleteAccount(\'' + escHtml(a.username) + '\')" style="font-size:10px;color:#DC2626">删除</button>';
        }
        html += '<tr><td>' + escHtml(a.username) + '</td><td>' + roleBadge + '</td><td>' + actions + '</td></tr>';
      });
      html += '</table></div>'
        + '<div style="margin-top:16px;padding:12px;background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0">'
        + '<h4 style="margin-bottom:8px;font-size:13px">➕ 新建账号</h4>'
        + '<div class="r">'
        + '<div class="c"><input id="newUsername" placeholder="账号名"></div>'
        + '<div class="c"><input id="newPassword" type="password" placeholder="密码"></div>'
        + '<div class="c"><select id="newRole" style="font-size:12px"><option value="dispatcher">调度员</option><option value="leader">领导</option></select></div>'
        + '<div><button class="btn btn-p" onclick="createUser()">创建</button></div>'
        + '</div><div id="acctMsg" class="st" style="margin-top:6px"></div></div>';
      document.getElementById('acctModalBody').innerHTML = html;
      overlay.classList.add('on');
    };
  } catch(e) {}
}

/* ── 创建用户 ── */
async function createUser() {
  var u = document.getElementById('newUsername').value.trim();
  var p = document.getElementById('newPassword').value.trim();
  var role = document.getElementById('newRole').value;
  var el = document.getElementById('acctMsg');
  if (!u || !p) { el.innerHTML = '请填写完整'; el.className = 'st st-err'; return; }
  if (u.length < 2) { el.innerHTML = '账号名至少2个字'; el.className = 'st st-err'; return; }
  try {
    await registerAccount(u, p, role);
    el.innerHTML = '✅ ' + u + ' 创建成功 (' + getRoleInfo(role).label + ')'; el.className = 'st st-ok';
    setTimeout(function() { openAccountModal(); }, 500);
  } catch(e) {
    el.innerHTML = '❌ ' + e; el.className = 'st st-err';
  }
}

/* ── 修改角色 ── */
async function changeRole(username, newRole) {
  if (!confirm('确定将 ' + username + ' 改为「' + getRoleInfo(newRole).label + '」？')) return;
  var d = getBBDB() || db;
  try {
    var tx = d.transaction('accounts', 'readwrite');
    var st = tx.objectStore('accounts');
    var r = st.get(username);
    r.onsuccess = function() {
      var acc = r.result;
      if (acc) { acc.role = newRole; st.put(acc); }
      tx.oncomplete = function() { openAccountModal(); };
    };
  } catch(e) {}
}

/* ── 重置密码 ── */
async function resetPassword(username) {
  var newPwd = prompt('为「' + username + '」设置新密码（至少4位）:');
  if (!newPwd || newPwd.length < 4) { alert('密码至少4位'); return; }
  var d = getBBDB() || db;
  try {
    var tx = d.transaction('accounts', 'readwrite');
    var st = tx.objectStore('accounts');
    var r = st.get(username);
    r.onsuccess = function() {
      var acc = r.result;
      if (acc) { acc.password = secureHash(newPwd); st.put(acc); }
      tx.oncomplete = function() { alert('✅ ' + username + ' 密码已重置'); openAccountModal(); };
    };
  } catch(e) {}
}

/* ── 删除账号 ── */
async function deleteAccount(username) {
  if (!confirm('确定删除 ' + username + '？此操作不可恢复！')) return;
  var d = getBBDB() || db;
  try {
    var tx = d.transaction('accounts', 'readwrite');
    var st = tx.objectStore('accounts');
    st.delete(username);
    tx.oncomplete = function() { openAccountModal(); };
  } catch(e) {}
}

function closeAcctModal() {
  document.getElementById('acctModal').classList.remove('on');
}

/* ── 登录弹窗 ── */
function openLoginModal() {
  var overlay = document.getElementById('loginModal');
  if (!overlay) return;
  document.getElementById('loginModalBody').innerHTML = ''
    + '<div style="margin-bottom:12px"><label>👤 账号</label><input id="loginUser" placeholder="输入账号"></div>'
    + '<div style="margin-bottom:12px"><label>🔒 密码</label><input id="loginPass" type="password" placeholder="输入密码" onkeydown="if(event.key===\'Enter\')doLogin()"></div>'
    + '<div id="loginMsg" class="st" style="text-align:center;margin-bottom:8px"></div>'
    + '<div style="text-align:center"><button class="btn btn-p" onclick="doLogin()">🔑 登录</button></div>';
  document.getElementById('loginModalFt').innerHTML = ''
    + '<button class="btn" style="background:#E2E8F0;color:#475569" onclick="closeLoginModal()">关闭</button>';
  overlay.classList.add('on');
}

async function doLogin() {
  var u = document.getElementById('loginUser').value.trim();
  var p = document.getElementById('loginPass').value.trim();
  var el = document.getElementById('loginMsg');
  if (!u || !p) { el.innerHTML = '请填写账号密码'; el.className = 'st st-err'; return; }
  try {
    var user = await loginAccount(u, p);
    el.innerHTML = '✅ 欢迎，' + user.username + '!';
    el.className = 'st st-ok';
    updateUserUI();
    if (user.role === 'dispatcher' || user.role === 'leader') {
      var today = new Date().toISOString().split('T')[0];
      document.getElementById('sd').value = today;
      document.getElementById('dDate').value = today;
      document.getElementById('dDate3').value = today;
      curDate = today;
      ships = await loadDateData(today);
      if (!ships.length && typeof sharedShips !== 'undefined' && sharedShips.length) {
        ships = sharedShips.filter(function(s) { return s.date === today; });
      }
      rd();
    }
    localStorage.setItem('dispatch_user', u);
    setTimeout(function() { closeLoginModal(); }, 800);
  } catch(e) {
    el.innerHTML = '❌ ' + e; el.className = 'st st-err';
  }
}

function closeLoginModal() { document.getElementById('loginModal').classList.remove('on'); }
function adminLogin() { openLoginModal(); }
