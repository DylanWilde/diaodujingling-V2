/* ═══════════════════════════════════════════════════
   调度精灵 V7 — 流程跟踪 Kanban
   工作流: 港务局船期 → 引航申报 → 单一窗口 → 走槽确认
   存储: IndexedDB 'workflow' store
   自动同步当日船期，走槽确认需填南/北槽+时间
   ═══════════════════════════════════════════════════ */

var WORKFLOW = {

  STAGES: [
    { key: 'schedule',    label: '港务局船期', icon: '📋', color: '#2563EB', bg: '#DBEAFE' },
    { key: 'pilotage',    label: '引航申报',   icon: '📡', color: '#D97706', bg: '#FEF3C7' },
    { key: 'singleWindow',label: '单一窗口',   icon: '🪟', color: '#7C3AED', bg: '#EDE9FE' },
    { key: 'channelPass', label: '走槽确认',   icon: '✅', color: '#16A34A', bg: '#DCFCE7' }
  ],

  /* ── 当前查看日期 ── */
  currentDate: new Date().toISOString().split('T')[0],

  _db: function() { return db || window._bbDB; },

  getAll: function() {
    var self = this;
    return new Promise(function(ok) {
      /* V8: 优先 API */
      if (typeof API !== 'undefined' && API.getToken()) {
        try {
          API.loadWorkflows(self.currentDate).then(function(data) {
            if (data && data.length) { ok(data); return; }
            self._getAllLocal(ok);
          }).catch(function() { self._getAllLocal(ok); });
          return;
        } catch(e) {}
      }
      self._getAllLocal(ok);
    });
  },

  _getAllLocal: function(ok) {
    var d = this._db();
    if (!d || !d.objectStoreNames.contains('workflow')) { ok([]); return; }
    var tx = d.transaction('workflow', 'readonly');
    var st = tx.objectStore('workflow');
    var r = st.getAll();
    r.onsuccess = function() { ok(r.result || []); };
    r.onerror = function() { ok([]); };
  },

  getById: function(id) {
    return new Promise(function(ok) {
      var d = WORKFLOW._db();
      if (!d) { ok(null); return; }
      var tx = d.transaction('workflow', 'readonly');
      var st = tx.objectStore('workflow');
      var r = st.get(id);
      r.onsuccess = function() { ok(r.result || null); };
      r.onerror = function() { ok(null); };
    });
  },

  save: function(record) {
    return new Promise(function(ok) {
      var d = WORKFLOW._db();
      if (!d) { ok(false); return; }
      var tx = d.transaction('workflow', 'readwrite');
      var st = tx.objectStore('workflow');
      if (record.id) { st.put(record); }
      else { st.add(record); }
      tx.oncomplete = function() { ok(true); };
    });
  },

  saveBatch: function(records) {
    return new Promise(function(ok) {
      var d = WORKFLOW._db();
      if (!d || !records.length) { ok(false); return; }
      var tx = d.transaction('workflow', 'readwrite');
      var st = tx.objectStore('workflow');
      records.forEach(function(r) { st.add(r); });
      tx.oncomplete = function() { ok(true); };
    });
  },

  advance: function(record, stageKey, extra) {
    var user = getCurrentUser();
    var data = {
      status: 'done',
      by: user ? user.username : '未知',
      at: new Date().toISOString()
    };
    if (extra) {
      for (var k in extra) { data[k] = extra[k]; }
    }
    record[stageKey] = data;
    record.updatedAt = new Date().toISOString();

    /* V8: 优先推送到 API */
    if (typeof API !== 'undefined' && API.getToken()) {
      if (stageKey === 'channelPass' && extra) {
        API.confirmChannelPass(record.id, extra).catch(function(){});
      } else {
        API.advanceWorkflow(record.id, stageKey).catch(function(){});
      }
    }
    return this.save(record);
  },

  getStage: function(record) {
    if (record.channelPass && record.channelPass.status === 'done') return 3;
    if (record.singleWindow && record.singleWindow.status === 'done') return 2;
    if (record.pilotage && record.pilotage.status === 'done') return 1;
    return 0;
  },

  getNextStage: function(record) {
    var s = this.getStage(record);
    if (s >= 3) return null;
    return this.STAGES[s + 1];
  },

  getActiveStage: function(record) {
    var s = this.getStage(record);
    return this.STAGES[s];
  },

  remove: function(id) {
    return new Promise(function(ok) {
      var d = WORKFLOW._db();
      if (!d) { ok(false); return; }
      var tx = d.transaction('workflow', 'readwrite');
      var st = tx.objectStore('workflow');
      st.delete(id);
      tx.oncomplete = function() { ok(true); };
    });
  },

  /* ── 从当日船期自动同步（去重：船名+iv+ev+日期）── */
  autoSync: function(date) {
    var self = this;
    return new Promise(function(ok) {
      /* 优先使用 API 同步 */
      if (typeof API !== 'undefined' && API.getToken()) {
        API.syncWorkflows(date).then(function(result) {
          if (result && result.added >= 0) { ok(result.added); return; }
          self._localAutoSync(date, ok);
        }).catch(function() { self._localAutoSync(date, ok); });
        return;
      }
      self._localAutoSync(date, ok);
    });
  },

  _localAutoSync: function(date, ok) {
    var self = this;
    loadDateData(date).then(function(localShips) {
      var ships = localShips;
      if (!ships.length && typeof sharedShips !== 'undefined' && sharedShips.length) {
        ships = sharedShips.filter(function(s) { return s.date === date; });
        ships.forEach(function(s) { s.eta = s.eta || ''; });
      }
      if (!ships.length) { ok(0); return; }

      self.getAll().then(function(wfList) {
        var wfMap = {};
        wfList.forEach(function(w) { wfMap[w.date + '|' + w.name + '|' + w.iv + '|' + w.ev] = true; });

        var toAdd = [];
        ships.forEach(function(s) {
          var key = s.date + '|' + s.name + '|' + (s.iv||'') + '|' + (s.ev||'');
          if (!wfMap[key]) toAdd.push(s);
        });

        if (!toAdd.length) { ok(0); return; }

        var batch = toAdd.map(function(s) {
          return {
            date: s.date, name: s.name, en: s.en || '',
            iv: s.iv || '', ev: s.ev || '', tm: s.tm || '',
            arV: s.arV != null ? s.arV : '', drV: s.drV != null ? s.drV : '',
            arRaw: s.arRaw || '', drRaw: s.drRaw || '',
            eta: s.eta || '', pp: s.pp || '', np: s.np || '',
            schedule:     { status: 'done', by: 'auto', at: new Date().toISOString() },
            pilotage:     { status: 'pending', by: '', at: '' },
            singleWindow: { status: 'pending', by: '', at: '' },
            channelPass:  { status: 'pending', by: '', at: '' },
            note: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
          };
        });
        self.saveBatch(batch).then(function() { ok(batch.length); });
      });
    });
  }
};

/* ═══ 渲染 Kanban ═══ */
function renderWorkflow() {
  var board = document.getElementById('wfBoard');
  var statsEl = document.getElementById('wfStats');
  if (!board) return;

  board.innerHTML = '<div style="text-align:center;padding:30px;color:#94A3B8">⏳ 加载中...</div>';
  var date = WORKFLOW.currentDate;

  /* 先自动同步当日船期 */
  WORKFLOW.autoSync(date).then(function(newCount) {
    if (newCount > 0) console.log('[Workflow] 自动同步 ' + newCount + ' 条新船');

    WORKFLOW.getAll().then(function(records) {
      /* 只显示当前日期的记录 */
      var dayRecords = records.filter(function(r) { return r.date === date; });

      if (!dayRecords.length) {
        board.innerHTML = '<div style="text-align:center;padding:50px;color:#94A3B8">'
          + '<div style="font-size:48px;margin-bottom:16px">📭</div>'
          + '<div style="font-size:16px;font-weight:700">' + date + ' 当日无船期数据</div>'
          + '<div style="font-size:13px;margin-top:8px">请先在「数据管理」Tab 上传当日船期表</div>'
          + '</div>';
        statsEl.innerHTML = '';
        return;
      }

      /* 按阶段分组 */
      var cols = { schedule: [], pilotage: [], singleWindow: [], channelPass: [] };
      dayRecords.forEach(function(r) {
        var s = WORKFLOW.getStage(r);
        cols[WORKFLOW.STAGES[s].key].push(r);
      });
      var doneCount = cols.channelPass.length;
      var total = dayRecords.length;

      /* 统计栏 */
      statsEl.innerHTML = ''
        + '<div class="sb-item sb-blue"><div class="n">' + total + '</div><div class="l">当日船舶</div></div>'
        + '<div class="sb-item sb-amber"><div class="n">' + (total - doneCount) + '</div><div class="l">待处理</div></div>'
        + '<div class="sb-item sb-green"><div class="n">' + doneCount + '</div><div class="l">已完成</div></div>'
        + '<div class="sb-item sb-blue"><div class="n">' + Math.round(doneCount / Math.max(total, 1) * 100) + '%</div><div class="l">完成率</div></div>';

      /* 渲染 4 列 */
      var html = '<div class="wf-kanban">';
      WORKFLOW.STAGES.forEach(function(stage) {
        var items = cols[stage.key];
        html += '<div class="wf-col">';
        html += '<div class="wf-col-hd" style="border-bottom:3px solid ' + stage.color + '">';
        html += '<span>' + stage.icon + ' ' + stage.label + '</span>';
        html += '<span style="background:' + stage.bg + ';color:' + stage.color + '">' + items.length + '</span>';
        html += '</div><div class="wf-col-body">';
        if (!items.length) {
          html += '<div class="wf-empty">—</div>';
        } else {
          items.forEach(function(r) { html += renderWFCard(r); });
        }
        html += '</div></div>';
      });
      html += '</div>';
      board.innerHTML = html;
    });
  });
}

/* ═══ 单张卡片 ═══ */
function renderWFCard(r) {
  var activeStage = WORKFLOW.getActiveStage(r);
  var nextStage = WORKFLOW.getNextStage(r);
  var done = !nextStage;

  var voyage = [r.iv, r.ev].filter(Boolean).join('/') || '—';
  var ar = r.arRaw || (r.arV != null ? r.arV + 'm' : '—');
  var dr = r.drRaw || (r.drV != null ? r.drV + 'm' : '—');
  var eta = r.eta || '—';

  var html = '<div class="wf-card' + (done ? ' wf-done' : '') + '" id="wf-' + r.id + '">';

  /* 顶部：船名 + 阶段标签 */
  html += '<div class="wf-card-top">';
  html += '<div class="wf-card-name">🚢 ' + escHtml(r.name) + '</div>';
  html += '<span class="wf-stage-tag" style="background:' + activeStage.bg + ';color:' + activeStage.color + '">' + activeStage.label + '</span>';
  html += '</div>';

  /* 航次 + ETA + 吃水 */
  html += '<div class="wf-card-info">';
  html += '<div class="wf-card-row"><span class="wf-label">航次</span><span class="wf-val">' + escHtml(voyage) + '</span></div>';
  html += '<div class="wf-card-row"><span class="wf-label">ETA</span><span class="wf-val wf-eta">⏰ ' + escHtml(eta) + '</span></div>';
  html += '<div class="wf-card-row"><span class="wf-label">吃水</span><span class="wf-val">抵 ' + escHtml(ar) + ' / 离 ' + escHtml(dr) + '</span></div>';
  html += '<div class="wf-card-row"><span class="wf-label">码头</span><span class="wf-val">' + escHtml(r.tm || '—') + '</span></div>';
  html += '</div>';

  /* 时间线 */
  html += '<div class="wf-card-timeline">';
  WORKFLOW.STAGES.forEach(function(s) {
    var rec = r[s.key];
    if (rec && rec.status === 'done') {
      var dt = rec.at ? new Date(rec.at).toLocaleString('zh-CN', { month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' }) : '';
      var extra = '';
      if (s.key === 'channelPass') {
        extra = (rec.channel ? rec.channel + '槽' : '');
        if (rec.passTime) extra += ' ' + rec.passTime;
      }
      html += '<div class="wf-timeline-item done">'
        + '<span class="wf-timeline-dot" style="background:' + s.color + '"></span>'
        + '<span class="wf-timeline-label">' + s.label + '</span>'
        + '<span class="wf-timeline-by">' + escHtml(rec.by) + '</span>'
        + (extra ? '<span class="wf-timeline-extra">' + escHtml(extra) + '</span>' : '')
        + '<span class="wf-timeline-at">' + dt + '</span>'
        + '</div>';
    }
  });
  html += '</div>';

  /* 操作按钮 */
  html += '<div class="wf-card-actions">';
  if (done) {
    /* 显示走槽信息 */
    var cp = r.channelPass || {};
    html += '<span class="wf-done-badge">✅ 完成 — ' + escHtml((cp.channel||'') + '槽 ' + (cp.passTime||'')) + '</span>';
  } else if (nextStage.key === 'channelPass') {
    /* 走槽确认：弹出弹窗 */
    html += '<button class="btn btn-p btn-sm" onclick="openChannelPassModal(' + r.id + ')" style="font-size:11px">'
      + '✅ 走槽确认（填槽名+时间）</button>';
  } else {
    html += '<button class="btn btn-p btn-sm" onclick="advanceWF(' + r.id + ', \'' + nextStage.key + '\')" style="font-size:11px">'
      + nextStage.icon + ' 推进到「' + nextStage.label + '」</button>';
  }
  html += '<button class="btn btn-s btn-sm" onclick="removeWF(' + r.id + ')" style="font-size:10px;color:#DC2626">✕</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

/* ═══ 普通推进（非走槽） ═══ */
function advanceWF(id, stageKey) {
  WORKFLOW.getById(id).then(function(r) {
    if (!r) return;
    WORKFLOW.advance(r, stageKey).then(function() { renderWorkflow(); });
  });
}

/* ═══ 走槽确认弹窗 ═══ */
function openChannelPassModal(id) {
  WORKFLOW.getById(id).then(function(r) {
    if (!r) return;
    window._wfPendingId = id;

    var voyage = [r.iv, r.ev].filter(Boolean).join('/') || '—';
    var ar = r.arRaw || (r.arV != null ? r.arV + 'm' : '—');
    var dr = r.drRaw || (r.drV != null ? r.drV + 'm' : '—');

    var body = '';
    body += '<div class="wf-modal-ship">';
    body += '<div class="wf-modal-ship-name">🚢 ' + escHtml(r.name) + '</div>';
    body += '<div class="wf-modal-ship-info">航次: ' + escHtml(voyage) + ' | ETA: ' + escHtml(r.eta||'—') + ' | 吃水: 抵' + escHtml(ar) + '/离' + escHtml(dr) + '</div>';
    body += '</div>';

    body += '<div style="margin-bottom:14px"><label style="font-weight:700;margin-bottom:6px">📍 南槽 / 北槽</label>';
    body += '<div style="display:flex;gap:10px">';
    body += '<label class="wf-radio-label" style="flex:1"><input type="radio" name="wfChannel" value="南" checked> 南槽</label>';
    body += '<label class="wf-radio-label" style="flex:1"><input type="radio" name="wfChannel" value="北"> 北槽</label>';
    body += '</div></div>';

    body += '<div style="margin-bottom:14px"><label style="font-weight:700;margin-bottom:6px">⏰ 走槽时间</label>';
    body += '<input type="datetime-local" id="wfPassTime" style="width:100%"></div>';

    body += '<div id="wfModalMsg" class="st" style="margin-top:6px"></div>';

    document.getElementById('wfModalBody').innerHTML = body;

    /* 默认填当前时间 */
    var now = new Date();
    var tz = now.getTimezoneOffset();
    var local = new Date(now.getTime() - tz * 60000).toISOString().slice(0, 16);
    document.getElementById('wfPassTime').value = local;

    document.getElementById('wfModal').classList.add('on');
  });
}

function confirmChannelPass() {
  var channel = document.querySelector('input[name="wfChannel"]:checked');
  var passTime = document.getElementById('wfPassTime').value;
  var msgEl = document.getElementById('wfModalMsg');

  if (!channel) { msgEl.innerHTML = '请选择南槽或北槽'; msgEl.className = 'st st-err'; return; }
  if (!passTime) { msgEl.innerHTML = '请填写走槽时间'; msgEl.className = 'st st-err'; return; }

  var id = window._wfPendingId;
  WORKFLOW.getById(id).then(function(r) {
    if (!r) return;
    WORKFLOW.advance(r, 'channelPass', {
      channel: channel.value,
      passTime: passTime
    }).then(function() {
      closeChannelPassModal();
      renderWorkflow();
    });
  });
}

function closeChannelPassModal() {
  document.getElementById('wfModal').classList.remove('on');
  window._wfPendingId = null;
}

/* ═══ 删除 ═══ */
function removeWF(id) {
  if (!confirm('确定从流程中移除此船？')) return;
  WORKFLOW.remove(id).then(function() { renderWorkflow(); });
}

/* ═══ 切换日期 ═══ */
function changeWFDate() {
  var el = document.getElementById('wfDate');
  if (!el || !el.value) return;
  WORKFLOW.currentDate = el.value;
  renderWorkflow();
}
