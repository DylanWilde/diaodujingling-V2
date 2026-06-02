/* ═══════════════════════════════════════════════════
   调度精灵 — 调度员账号系统
   账号存储: IndexedDB 'accounts' store
   权限: 管理员可改任意日期, 调度员仅今日
   ═══════════════════════════════════════════════════ */

var ACCOUNTS_DB = 'DDB_v5';
var currentUser = null;

/* 简单哈希 (非加密，仅防明文存储) */
function simpleHash(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return 'h_' + Math.abs(h).toString(36);
}

/* 初始化accounts store */
function initAccountsStore(d) {
  if (!d.objectStoreNames.contains('accounts')) {
    var st = d.createObjectStore('accounts', { keyPath: 'username' });
    /* 创建默认管理员 */
    st.add({ username: 'admin', password: simpleHash('admin888'), role: 'admin', created: Date.now() });
  }
}

/* 注册 */
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
        st.add({ username: username, password: simpleHash(password), role: role || 'dispatcher', created: Date.now() });
        tx.oncomplete = function() { ok(true); };
      };
      r.onerror = function() { no('查询失败'); };
    } catch(e) { no('操作失败: ' + e.message); }
  });
}

/* 登录 */
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
        if (acc.password !== simpleHash(password)) { no('密码错误'); return; }
        currentUser = { username: acc.username, role: acc.role };
        ok(currentUser);
      };
      r.onerror = function() { no('查询失败'); };
    } catch(e) { no('操作失败: ' + e.message); }
  });
}

/* 获取当前用户 */
function getCurrentUser() { return currentUser; }

/* 登出 */
function logoutAccount() {
  currentUser = null;
  document.getElementById('userArea').style.display = 'none';
  document.getElementById('loginArea').style.display = '';
  document.getElementById('adminArea').style.display = 'none';
  for (var t = 2; t <= 6; t++) {
    var btn = document.querySelectorAll('.tb-btn')[t];
    if (btn) btn.style.display = 'none';
  }
  localStorage.removeItem('gh_token_enc');
  localStorage.removeItem('dispatch_user');
  alert('已退出登录');
  location.reload();
}

/* 检查是否可编辑指定日期 */
function canEditDate(date) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  var today = new Date().toISOString().split('T')[0];
  return date === today;
}

/* UI: 更新用户显示 */
function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('loginArea').style.display = 'none';
  var ua = document.getElementById('userArea');
  ua.style.display = 'flex';
  var roleTag = currentUser.role === 'admin'
    ? '<span style="background:#DBEAFE;color:#2563EB;font-size:10px;padding:2px 8px;border-radius:10px;margin:0 4px">管理员</span>'
    : '<span style="background:#FEF3C7;color:#D97706;font-size:10px;padding:2px 8px;border-radius:10px;margin:0 4px">调度员</span>';
  ua.innerHTML = '<span style="font-size:12px;color:#475569">👤 <b>' + escHtml(currentUser.username) + '</b></span>' + roleTag
    + '<button class="btn btn-sm btn-s" onclick="openAccountModal()" style="font-size:10px">👥 账号</button>'
    + '<button class="btn btn-sm btn-g" onclick="logoutAccount()" style="font-size:10px">🚪 退出</button>';

  /* Tab按钮权限: 调度员Tab2-5 / 管理员Tab2-6 */
  var tb1 = document.getElementById('tbAdmin1');
  var tb2 = document.getElementById('tbAdmin2');
  var tb3 = document.getElementById('tbAdmin3');
  if (tb1) tb1.style.display = '';  /* 引航转换 */
  if (tb2) tb2.style.display = '';  /* 调度黑板 */
  if (tb3) tb3.style.display = currentUser.role === 'admin' ? '' : 'none';  /* 数据管理: 仅管理员 */

  if (currentUser.role === 'admin') {
    document.getElementById('adminArea').style.display = 'inline';
  }
}

/* 账号管理弹窗 (仅管理员可见) */
function openAccountModal() {
  if (currentUser.role !== 'admin') {
    alert('仅管理员可管理账号');
    return;
  }
  var overlay = document.getElementById('acctModal');
  if (!overlay) return;

  /* 加载所有账号 */
  var d = getBBDB() || db;
  try {
    var tx = d.transaction('accounts', 'readonly');
    var st = tx.objectStore('accounts');
    var r = st.getAll();
    r.onsuccess = function() {
      var accounts = r.result || [];
      var html = '<div style="overflow-x:auto"><table><tr><th>账号</th><th>角色</th><th>创建时间</th><th>操作</th></tr>';
      accounts.forEach(function(a) {
        var roleTag = a.role === 'admin' ? '管理员' : '调度员';
        var created = new Date(a.created).toLocaleDateString('zh-CN');
        html += '<tr><td>' + escHtml(a.username) + '</td><td>' + roleTag + '</td><td>' + created + '</td>'
          + '<td>' + (a.username !== 'admin' ? '<button class="btn btn-sm btn-g" onclick="deleteAccount(\'' + escHtml(a.username) + '\')" style="font-size:10px;color:#DC2626">删除</button>' : '系统账号') + '</td></tr>';
      });
      html += '</table></div>'
        + '<div style="margin-top:16px;padding:12px;background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0">'
        + '<h4 style="margin-bottom:8px;font-size:13px">➕ 新建调度员账号</h4>'
        + '<div class="r">'
        + '<div class="c"><input id="newUsername" placeholder="账号名"></div>'
        + '<div class="c"><input id="newPassword" type="password" placeholder="密码"></div>'
        + '<div><button class="btn btn-p" onclick="createDispatcher()">创建</button></div>'
        + '</div><div id="acctMsg" class="st" style="margin-top:6px"></div></div>';

      document.getElementById('acctModalBody').innerHTML = html;
      overlay.classList.add('on');
    };
  } catch(e) {}
}

async function createDispatcher() {
  var u = document.getElementById('newUsername').value.trim();
  var p = document.getElementById('newPassword').value.trim();
  var el = document.getElementById('acctMsg');
  if (!u || !p) { el.innerHTML = '请填写完整'; el.className = 'st st-err'; return; }
  if (u.length < 2) { el.innerHTML = '账号名至少2个字'; el.className = 'st st-err'; return; }
  try {
    await registerAccount(u, p, 'dispatcher');
    el.innerHTML = '✅ 调度员 ' + u + ' 创建成功'; el.className = 'st st-ok';
    setTimeout(function() { openAccountModal(); }, 500);
  } catch(e) {
    el.innerHTML = '❌ ' + e; el.className = 'st st-err';
  }
}

async function deleteAccount(username) {
  if (!confirm('确定删除调度员 ' + username + '？')) return;
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

/* 登录弹窗 */
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
    /* 通知权限 */
    if (user.role === 'dispatcher') {
      var today = new Date().toISOString().split('T')[0];
      document.getElementById('sd').value = today;
      document.getElementById('dDate').value = today;
      document.getElementById('dDate3').value = today;
      curDate = today;
      ships = await loadDateData(today);
      if (!ships.length && sharedShips.length) {
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

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('on');
}

/* 修改现有adminLogin — 改用新系统 */
function adminLogin() {
  openLoginModal();
}
