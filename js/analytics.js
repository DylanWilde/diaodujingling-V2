/* ═══════════════════════════════════════════════════
   调度精灵 V7 — 船代数据分析引擎
   时间跨度: 周/月/季/年 · 行业KPI · 全量数据
   ═══════════════════════════════════════════════════ */

var ANALYTICS = {

  /* ── 获取全部数据（强制读取 IndexedDB）── */
  getAllShips: function() {
    return new Promise(function(ok) {
      /* 1. 优先从 IndexedDB 全量读取 */
      if (typeof getAllData === 'function') {
        getAllData().then(function(d) {
          if (d && d.length) { ok(d); return; }
          /* fallback 到 sharedShips */
          if (typeof sharedShips !== 'undefined' && sharedShips.length) {
            ok(sharedShips.slice());
          } else { ok([]); }
        }).catch(function() {
          if (typeof sharedShips !== 'undefined' && sharedShips.length) {
            ok(sharedShips.slice());
          } else { ok([]); }
        });
      } else if (typeof sharedShips !== 'undefined' && sharedShips.length) {
        ok(sharedShips.slice());
      } else {
        /* 最后尝试直接从 db 读 */
        try {
          if (typeof db !== 'undefined' && db) {
            var tx = db.transaction('ships', 'readonly');
            var st = tx.objectStore('ships');
            var r = st.getAll();
            r.onsuccess = function() { ok(r.result || []); };
            r.onerror = function() { ok([]); };
          } else { ok([]); }
        } catch(e) { ok([]); }
      }
    });
  },

  /* ── 时间跨度计算 ── */
  getPeriodRange: function(period) {
    var now = new Date();
    var from = new Date();
    var label = '';
    switch (period) {
      case 'week':
        var day = now.getDay();
        var monday = new Date(now);
        monday.setDate(now.getDate() - ((day + 6) % 7));
        from = monday;
        label = '本周 (' + this.fmtDate(monday) + ' ~ ' + this.fmtDate(now) + ')';
        break;
      case 'month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        label = '本月 (' + (now.getMonth()+1) + '月)';
        break;
      case 'quarter':
        var q = Math.floor(now.getMonth() / 3);
        from = new Date(now.getFullYear(), q * 3, 1);
        label = '本季度 (Q' + (q+1) + ' ' + now.getFullYear() + ')';
        break;
      case 'year':
        from = new Date(now.getFullYear(), 0, 1);
        label = '本年度 (' + now.getFullYear() + ')';
        break;
      default:
        label = '全部历史数据';
    }
    return { from: from.toISOString().split('T')[0], label: label };
  },

  fmtDate: function(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); },

  /* ── 按时间跨度过滤 ── */
  filterByPeriod: function(data, period) {
    if (!period || period === 'all') return data;
    var range = this.getPeriodRange(period);
    return data.filter(function(s) { return s.date >= range.from; });
  },

  /* ── 1. 总览卡片 ── */
  overview: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var uniqueShips = {}, uniqueDates = {}, uniqueMonths = {};
    var terminals = {}, maritimeDone = 0, maritimeTotal = 0;
    var etaDanger = 0, etaWarn = 0;
    filtered.forEach(function(s) {
      if (s.name) uniqueShips[s.name] = true;
      if (s.date) { uniqueDates[s.date] = true; uniqueMonths[s.date.substring(0,7)] = true; }
      if (s.tm) terminals[s.tm] = (terminals[s.tm]||0) + 1;
      maritimeTotal++;
      if (s.maritime7) maritimeDone++;
      if (typeof getETAHours === 'function') {
        var h = getETAHours(s.eta);
        if (h >= 0 && h <= 24) etaDanger++;
        if (h > 24 && h <= 48) etaWarn++;
      }
    });
    return {
      totalShips: filtered.length,
      uniqueShips: Object.keys(uniqueShips).length,
      activeDays: Object.keys(uniqueDates).length,
      activeMonths: Object.keys(uniqueMonths).length,
      activeTerminals: Object.keys(terminals).length,
      maritimeDone: maritimeDone,
      maritimeRate: maritimeTotal ? Math.round(maritimeDone/maritimeTotal*100) : 0,
      etaDanger: etaDanger,
      etaWarn: etaWarn,
      topTerminal: Object.keys(terminals).sort(function(a,b){return terminals[b]-terminals[a];})[0] || '—'
    };
  },

  /* ── 2. 码头作业量排名 ── */
  terminalStats: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var terms = {};
    filtered.forEach(function(s) {
      var tm = s.tm || '未知';
      if (!terms[tm]) terms[tm] = { total: 0, done: 0, drafts: [], names: {} };
      terms[tm].total++;
      if (s.maritime7) terms[tm].done++;
      if (s.arV != null) terms[tm].drafts.push(s.arV);
      terms[tm].names[s.name] = true;
    });
    return Object.keys(terms).map(function(k) {
      var t = terms[k];
      var drafts = t.drafts.sort(function(a,b){return a-b;});
      return {
        terminal: k,
        vessels: t.total,
        maritimeDone: t.done,
        maritimeRate: t.total ? Math.round(t.done/t.total*100) : 0,
        uniqueShips: Object.keys(t.names).length,
        draftMin: drafts[0] || 0,
        draftMax: drafts[drafts.length-1] || 0
      };
    }).sort(function(a,b){ return b.vessels - a.vessels; });
  },

  /* ── 3. 时间趋势 (周/月/季) ── */
  timeTrend: async function(period, granularity) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var buckets = {};
    filtered.forEach(function(s) {
      if (!s.date) return;
      var key;
      if (granularity === 'week') {
        var d = new Date(s.date);
        var day = d.getDay();
        var monday = new Date(d);
        monday.setDate(d.getDate() - ((day + 6) % 7));
        key = monday.toISOString().split('T')[0];
      } else if (granularity === 'month') {
        key = s.date.substring(0, 7);
      } else if (granularity === 'quarter') {
        var d2 = new Date(s.date);
        var q = Math.floor(d2.getMonth() / 3);
        key = d2.getFullYear() + '-Q' + (q+1);
      } else {
        key = s.date.substring(0, 4);
      }
      if (!buckets[key]) buckets[key] = { total: 0, done: 0 };
      buckets[key].total++;
      if (s.maritime7) buckets[key].done++;
    });
    return Object.keys(buckets).sort().map(function(k) {
      var b = buckets[k];
      return {
        key: k, total: b.total, done: b.done,
        rate: b.total ? Math.round(b.done/b.total*100) : 0
      };
    });
  },

  /* ── 4. 航线流量 Top ── */
  routeFlow: async function(period, limit) {
    limit = limit || 15;
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var routes = {};
    filtered.forEach(function(s) {
      var pp = (s.pp||'—').trim(), np = (s.np||'—').trim();
      if (pp === '—' && np === '—') return;
      var key = pp + ' → ' + np;
      routes[key] = (routes[key]||0) + 1;
    });
    return Object.keys(routes).map(function(k) { return { route: k, count: routes[k] }; })
      .sort(function(a,b){ return b.count - a.count; }).slice(0, limit);
  },

  /* ── 5. 吃水分布 ── */
  draftDistribution: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var arr = [], dep = [];
    filtered.forEach(function(s) {
      if (s.arV != null && s.arV > 0 && s.arV <= 18) arr.push(parseFloat(s.arV.toFixed(1)));
      if (s.drV != null && s.drV > 0 && s.drV <= 18) dep.push(parseFloat(s.drV.toFixed(1)));
    });
    function bucket(list, step) {
      var b = {};
      for (var i = 0; i <= 18; i += step) {
        var label = i.toFixed(1) + '-' + (i+step).toFixed(1) + 'm';
        b[label] = 0;
      }
      list.forEach(function(v) {
        var slot = Math.floor(v / step) * step;
        if (slot > 18) slot = 18;
        var label2 = slot.toFixed(1) + '-' + (slot+step).toFixed(1) + 'm';
        if (b[label2] !== undefined) b[label2]++;
      });
      return Object.keys(b).map(function(k) { return { range: k, count: b[k] }; }).filter(function(d){return d.count>0;});
    }
    return { arrival: bucket(arr, 1), departure: bucket(dep, 1) };
  },

  /* ── 6. ETA预警统计 ── */
  etaWarnings: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var s = { danger: 0, warn: 0, ok: 0, noETA: 0, expired: 0 };
    filtered.forEach(function(ship) {
      if (!ship.eta) { s.noETA++; return; }
      if (typeof getETAHours === 'function') {
        var h = getETAHours(ship.eta);
        if (h < 0) s.expired++;
        else if (h <= 24) s.danger++;
        else if (h <= 48) s.warn++;
        else s.ok++;
      } else { s.noETA++; }
    });
    return s;
  },

  /* ── 7. 调度员绩效 ── */
  dispatcherStats: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var by = {};
    filtered.forEach(function(s) {
      if (!s.maritime7By) return;
      by[s.maritime7By] = (by[s.maritime7By]||0) + 1;
    });
    return Object.keys(by).map(function(k) { return { name: k, count: by[k] }; })
      .sort(function(a,b){ return b.count - a.count; });
  },

  /* ── 8. 高频船舶 ── */
  frequentVessels: async function(period, limit) {
    limit = limit || 20;
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var freq = {};
    filtered.forEach(function(s) {
      if (!freq[s.name]) freq[s.name] = { count: 0, dates: {}, terms: {} };
      freq[s.name].count++;
      if (s.date) freq[s.name].dates[s.date] = true;
      if (s.tm) freq[s.name].terms[s.tm] = true;
    });
    return Object.keys(freq).map(function(k) {
      var f = freq[k];
      return {
        name: k, visits: f.count,
        dateCount: Object.keys(f.dates).length,
        terminals: Object.keys(f.terms).join('、')
      };
    }).sort(function(a,b){ return b.visits - a.visits; }).slice(0, limit);
  },

  /* ── 9. 码头作业明细 ── */
  terminalDetail: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var terms = {};
    filtered.forEach(function(s) {
      var tm = s.tm || '未知';
      if (!terms[tm]) terms[tm] = { total: 0, done: 0, ships: [] };
      terms[tm].total++;
      if (s.maritime7) terms[tm].done++;
      terms[tm].ships.push(s.name + '/' + (s.iv||'') + '/' + (s.ev||''));
    });
    return Object.keys(terms).map(function(k) {
      var t = terms[k];
      return {
        terminal: k, total: t.total, done: t.done,
        rate: t.total ? Math.round(t.done/t.total*100) : 0
      };
    }).sort(function(a,b){ return b.total - a.total; });
  },

  /* ── 10. 日报快照 ── */
  dailySnapshot: async function() {
    var now = new Date();
    var today = now.toISOString().split('T')[0];
    var data = await this.getAllShips();
    var ships = data.filter(function(s) { return s.date === today; });
    if (!ships.length) {
      var yesterday = new Date(now); yesterday.setDate(yesterday.getDate()-1);
      var yd = yesterday.toISOString().split('T')[0];
      ships = data.filter(function(s) { return s.date === yd; });
      today = yd;
    }
    var done = ships.filter(function(s){return s.maritime7;}).length;
    var eta24 = 0, eta48 = 0;
    ships.forEach(function(s) {
      if (typeof getETAHours === 'function') {
        var h = getETAHours(s.eta);
        if (h >= 0 && h <= 24) eta24++;
        if (h > 24 && h <= 48) eta48++;
      }
    });
    var terms = {};
    ships.forEach(function(s) { var tm = s.tm||'未知'; terms[tm] = (terms[tm]||0)+1; });
    return {
      date: today, total: ships.length, maritimeDone: done,
      maritimePending: ships.length - done, eta24h: eta24, eta48h: eta48,
      terminalCount: Object.keys(terms).length
    };
  },

  /* ── 11. 生成文本汇报 ── */
  generateReport: async function(period) {
    var snap = await this.dailySnapshot();
    var ov = await this.overview(period);
    var terms = await this.terminalStats(period);
    var routes = await this.routeFlow(period, 10);
    var freq = await this.frequentVessels(period, 10);
    var disp = await this.dispatcherStats(period);
    var rangeLabel = period ? this.getPeriodRange(period).label : '全部历史数据';

    var r = [];
    r.push('═══════════════════════════════');
    r.push('  调度精灵 · 数据分析汇报');
    r.push('  统计周期: ' + rangeLabel);
    r.push('  生成时间: ' + new Date().toLocaleString('zh-CN'));
    r.push('═══════════════════════════════');
    r.push('');
    r.push('【今日快报】' + snap.date);
    r.push('  在港: ' + snap.total + '艘 | 海事完成: ' + snap.maritimeDone + '艘 | 24h预抵: ' + snap.eta24h + '艘');
    r.push('');
    r.push('【周期总览】');
    r.push('  船舶总数: ' + ov.totalShips + ' | 不重复船: ' + ov.uniqueShips + ' | 活跃天: ' + ov.activeDays);
    r.push('  海事完成率: ' + ov.maritimeRate + '% | 活跃码头: ' + ov.activeTerminals + ' | 紧急预警: ' + ov.etaDanger);
    r.push('');
    r.push('【码头作业量排名】');
    terms.slice(0, 8).forEach(function(t, i) {
      r.push('  ' + (i+1) + '. ' + t.terminal + ': ' + t.vessels + '艘 | 海事' + t.maritimeRate + '% | 不重复船' + t.uniqueShips + '艘');
    });
    r.push('');
    r.push('【主要航线 Top 10】');
    routes.forEach(function(rt, i) {
      r.push('  ' + (i+1) + '. ' + rt.route + ' — ' + rt.count + '次');
    });
    r.push('');
    r.push('【高频船舶 Top 10】');
    freq.forEach(function(v, i) {
      r.push('  ' + (i+1) + '. ' + v.name + ': ' + v.visits + '次 / ' + v.terminals);
    });
    if (disp.length) {
      r.push('');
      r.push('【调度员海事确认】');
      disp.forEach(function(d, i) {
        r.push('  ' + (i+1) + '. ' + d.name + ': ' + d.count + '艘');
      });
    }
    r.push('');
    r.push('═══════════════════════════════');
    r.push('  调度精灵 V7 · 船舶代理数据分析');
    r.push('═══════════════════════════════');
    return r.join('\n');
  }
};
