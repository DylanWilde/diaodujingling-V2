/* ═══════════════════════════════════════════════════
   调度精灵 V7 — 船代数据分析引擎
   时间跨度: 周/月/季/年 · 行业KPI · 全量数据
   ═══════════════════════════════════════════════════ */

var ANALYTICS = {

  /* ── 获取全部数据（IndexedDB 全量）── */
  getAllShips: function() {
    return new Promise(function(ok) {
      /* 方案1: 调用 app.js 的 getAllData() 直接读 IndexedDB ships store */
      if (typeof getAllData === 'function') {
        getAllData().then(function(d) {
          if (d && d.length) { console.log('[Analytics] IndexedDB: ' + d.length + ' 条'); ok(d); return; }
          _fallback();
        }).catch(function() { _fallback(); });
      } else { _fallback(); }

      function _fallback() {
        /* 方案2: 共享数据 (GitHub Pages) */
        if (typeof sharedShips !== 'undefined' && sharedShips.length) {
          console.log('[Analytics] sharedShips: ' + sharedShips.length + ' 条');
          ok(sharedShips.slice());
          return;
        }
        /* 方案3: 直接读 db */
        try {
          if (typeof db !== 'undefined' && db) {
            var tx = db.transaction('ships', 'readonly');
            var st = tx.objectStore('ships');
            var r = st.getAll();
            r.onsuccess = function() { console.log('[Analytics] db direct: ' + (r.result||[]).length + ' 条'); ok(r.result || []); };
            r.onerror = function() { ok([]); };
          } else { ok([]); }
        } catch(e) { ok([]); }
      }
    });
  },

  /* ── 时间跨度计算 ── */
  getPeriodRange: function(period) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var from;
    var label = '';
    switch (period) {
      case 'week':
        /* 7天前 ~ 今天 */
        from = new Date(today);
        from.setDate(today.getDate() - 7);
        label = '近7天 (' + this.fmtDate(from) + ' ~ ' + this.fmtDate(today) + ')';
        break;
      case 'month':
        /* 本月1日 ~ 今天 */
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        label = '本月 (' + (today.getMonth()+1) + '月' + today.getFullYear() + ' · ' + (today.getDate()) + '天)';
        break;
      case 'quarter':
        /* 本季度第1天 ~ 今天 */
        var q = Math.floor(today.getMonth() / 3);
        var qMonths = ['1-3月','4-6月','7-9月','10-12月'];
        from = new Date(today.getFullYear(), q * 3, 1);
        label = 'Q' + (q+1) + '季度 (' + qMonths[q] + ' ' + today.getFullYear() + ')';
        break;
      case 'year':
        /* 1月1日 ~ 今天 */
        from = new Date(today.getFullYear(), 0, 1);
        label = '年度 (' + today.getFullYear() + '年 · YTD)';
        break;
      default:
        label = '全部历史数据';
    }
    var fromStr = from ? this.fmtDate(from) : '';
    return { from: fromStr, to: this.fmtDate(today), label: label };
  },

  fmtDate: function(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  },

  /* ── 按时间跨度过滤（包含边界）── */
  filterByPeriod: function(data, period) {
    if (!period || period === 'all') return data.slice();
    var range = this.getPeriodRange(period);
    var from = range.from, to = range.to;
    var filtered = data.filter(function(s) {
      return s.date >= from && s.date <= to;
    });
    console.log('[Analytics] filter ' + period + ': ' + filtered.length + ' / ' + data.length + ' total (range ' + from + ' ~ ' + to + ')');
    return filtered;
  },

  /* ── 去重键: 船名+进+出航次 = 唯一一次靠泊 ── */
  _key: function(s) { return (s.name||'') + '|' + (s.iv||'') + '|' + (s.ev||''); },

  /* ── 1. 总览卡片 ── */
  overview: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var dedup = {}, nameSet = {}, dateSet = {}, monthSet = {};
    var termCount = {}, maritimeDone = 0, maritimeTotal = 0;
    var etaDanger = 0, etaWarn = 0;
    filtered.forEach(function(s) {
      var k = ANALYTICS._key(s);
      if (dedup[k]) return; dedup[k] = true;  /* 去重 */
      if (s.name) nameSet[s.name] = true;
      if (s.date) { dateSet[s.date] = true; monthSet[s.date.substring(0,7)] = true; }
      if (s.tm) termCount[s.tm] = (termCount[s.tm]||0) + 1;
      maritimeTotal++;
      if (s.maritime7) maritimeDone++;
      if (typeof getETAHours === 'function') {
        var h = getETAHours(s.eta);
        if (h >= 0 && h <= 24) etaDanger++;
        if (h > 24 && h <= 48) etaWarn++;
      }
    });
    return {
      totalShips: maritimeTotal,
      uniqueShips: Object.keys(nameSet).length,
      activeDays: Object.keys(dateSet).length,
      activeMonths: Object.keys(monthSet).length,
      activeTerminals: Object.keys(termCount).length,
      maritimeDone: maritimeDone,
      maritimeRate: maritimeTotal ? Math.round(maritimeDone/maritimeTotal*100) : 0,
      etaDanger: etaDanger,
      etaWarn: etaWarn,
      topTerminal: Object.keys(termCount).sort(function(a,b){return termCount[b]-termCount[a];})[0] || '—'
    };
  },

  /* ── 2. 码头作业量排名 ── */
  terminalStats: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var terms = {}, dedupGlobal = {};
    filtered.forEach(function(s) {
      var k = ANALYTICS._key(s);
      if (dedupGlobal[k]) return; dedupGlobal[k] = true;
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

  /* ── 3. 时间趋势 ── */
  timeTrend: async function(period) {
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var buckets = {}, dedupGlobal = {};
    var isDay = (period === 'week' || period === 'month');
    filtered.forEach(function(s) {
      if (!s.date) return;
      var kk = ANALYTICS._key(s);
      if (dedupGlobal[kk]) return; dedupGlobal[kk] = true;
      var key = isDay ? s.date : s.date.substring(0, 7);
      if (!buckets[key]) buckets[key] = { total: 0, done: 0 };
      buckets[key].total++;
      if (s.maritime7) buckets[key].done++;
    });
    return Object.keys(buckets).sort().map(function(k) {
      var b = buckets[k];
      return { key: k, total: b.total, done: b.done, rate: b.total ? Math.round(b.done/b.total*100) : 0 };
    });
  },

  /* ── 4. 航线流量 Top ── */
  routeFlow: async function(period, limit) {
    limit = limit || 15;
    var data = await this.getAllShips();
    var filtered = this.filterByPeriod(data, period);
    var routes = {}, dedupGlobal = {};
    filtered.forEach(function(s) {
      var kk = ANALYTICS._key(s);
      if (dedupGlobal[kk]) return; dedupGlobal[kk] = true;
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
    var arr = [], dep = [], dedupGlobal = {};
    filtered.forEach(function(s) {
      var kk = ANALYTICS._key(s);
      if (dedupGlobal[kk]) return; dedupGlobal[kk] = true;
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
    var s = { danger: 0, warn: 0, ok: 0, noETA: 0, expired: 0 }, dedupGlobal = {};
    filtered.forEach(function(ship) {
      var kk = ANALYTICS._key(ship);
      if (dedupGlobal[kk]) return; dedupGlobal[kk] = true;
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
    var by = {}, dedupGlobal = {};
    filtered.forEach(function(s) {
      if (!s.maritime7By) return;
      var kk = ANALYTICS._key(s);
      if (dedupGlobal[kk]) return; dedupGlobal[kk] = true;
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
    var freq = {}, dedupGlobal = {};
    filtered.forEach(function(s) {
      var kk = ANALYTICS._key(s);
      if (dedupGlobal[kk]) return; dedupGlobal[kk] = true;
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
    var terms = {}, dedupGlobal = {};
    filtered.forEach(function(s) {
      var kk = ANALYTICS._key(s);
      if (dedupGlobal[kk]) return; dedupGlobal[kk] = true;
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
    var today = this.fmtDate(now);
    var data = await this.getAllShips();
    var ships = data.filter(function(s) { return s.date === today; });
    if (!ships.length) {
      now.setDate(now.getDate() - 1);
      today = this.fmtDate(now);
      ships = data.filter(function(s) { return s.date === today; });
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
