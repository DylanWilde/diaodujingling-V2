/* ═══════════════════════════════════════════════════
   调度精灵 V7 — 船代数据分析引擎
   时间跨度: 周(7天)/月/季/年/全部 · 行业KPI
   ═══════════════════════════════════════════════════ */

var ANALYTICS = {

  /* ── 读取全部数据 ── */
  getAllShips: function() {
    var self = this;
    return new Promise(function(ok) {
      /* 直接读 IndexedDB ships store */
      try {
        if (typeof db !== 'undefined' && db) {
          var tx = db.transaction('ships', 'readonly');
          var st = tx.objectStore('ships');
          var r = st.getAll();
          r.onsuccess = function() {
            var rows = r.result || [];
            /* normalize: expand short fields */
            rows.forEach(function(s) {
              s.eta = s.eta || '';
              s.maritime7 = !!s.maritime7;
              s.maritime7Note = s.maritime7Note || '';
              s.maritime7By = s.maritime7By || '';
            });
            console.log('[Analytics] IndexedDB ships: ' + rows.length + ' rows');
            if (rows.length) {
              var dates = {}; rows.forEach(function(s){ if(s.date) dates[s.date]=true; });
              console.log('[Analytics] Date range: ' + Object.keys(dates).sort().slice(0,3).join(', ') + '... (' + Object.keys(dates).length + ' dates)');
            }
            ok(rows);
          };
          r.onerror = function() { console.log('[Analytics] DB read error'); ok([]); };
        } else if (typeof sharedShips !== 'undefined' && sharedShips.length) {
          console.log('[Analytics] sharedShips: ' + sharedShips.length + ' rows');
          ok(sharedShips.slice());
        } else if (typeof getAllData === 'function') {
          getAllData().then(function(d) {
            console.log('[Analytics] getAllData(): ' + (d||[]).length + ' rows');
            ok(d || []);
          });
        } else {
          console.log('[Analytics] No data source available');
          ok([]);
        }
      } catch(e) {
        console.log('[Analytics] Error:', e.message);
        ok([]);
      }
    });
  },

  /* ── 日期工具 ── */
  fmtDate: function(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  },
  parseDate: function(s) {
    if (!s) return null;
    var p = s.split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1]-1, +p[2]);
  },

  /* ── 时间跨度 ── */
  getPeriodRange: function(period) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var from = null, label = '';
    switch (period) {
      case 'week':
        from = new Date(today); from.setDate(today.getDate() - 7);
        label = '近7天 ' + this.fmtDate(from) + ' ~ ' + this.fmtDate(today);
        break;
      case 'month':
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        label = today.getFullYear() + '年' + (today.getMonth()+1) + '月';
        break;
      case 'quarter':
        var q = Math.floor(today.getMonth() / 3);
        var qm = ['1-3月','4-6月','7-9月','10-12月'];
        from = new Date(today.getFullYear(), q * 3, 1);
        label = today.getFullYear() + '年 Q' + (q+1) + '(' + qm[q] + ')';
        break;
      case 'year':
        from = new Date(today.getFullYear(), 0, 1);
        label = today.getFullYear() + '年 (YTD)';
        break;
      default:
        label = '全部历史';
    }
    var fromStr = from ? this.fmtDate(from) : null;
    var toStr = this.fmtDate(today);
    return { from: fromStr, to: toStr, label: label };
  },

  /* ── 按周期过滤 ── */
  filterByPeriod: function(data, period) {
    if (!period || period === 'all') return data.slice();
    var r = this.getPeriodRange(period);
    var from = r.from, to = r.to;
    var result = data.filter(function(s) {
      return s.date && s.date >= from && s.date <= to;
    });
    console.log('[Analytics] filter ' + period + ': ' + result.length + ' of ' + data.length + ' (' + from + ' ~ ' + to + ')');
    return result;
  },

  /* ── 1. 总览 ── */
  overview: async function(period) {
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var nameSet = {}, dateSet = {}, monthSet = {}, termSet = {};
    var marDone = 0, etaDanger = 0, etaWarn = 0;
    rows.forEach(function(s) {
      if (s.name) nameSet[s.name] = true;
      if (s.date) { dateSet[s.date] = true; monthSet[s.date.substring(0,7)] = true; }
      if (s.tm) termSet[s.tm] = true;
      if (s.maritime7) marDone++;
      if (typeof getETAHours === 'function') {
        var h = getETAHours(s.eta);
        if (h >= 0 && h <= 24) etaDanger++;
        if (h > 24 && h <= 48) etaWarn++;
      }
    });
    return {
      totalShips: rows.length,
      uniqueShips: Object.keys(nameSet).length,
      activeDays: Object.keys(dateSet).length,
      activeMonths: Object.keys(monthSet).length,
      activeTerminals: Object.keys(termSet).length,
      maritimeDone: marDone,
      maritimeRate: rows.length ? Math.round(marDone/rows.length*100) : 0,
      etaDanger: etaDanger,
      etaWarn: etaWarn
    };
  },

  /* ── 2. 码头作业量 ── */
  terminalStats: async function(period) {
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var t = {};
    rows.forEach(function(s) {
      var tm = s.tm || '未知';
      if (!t[tm]) t[tm] = { total: 0, done: 0, names: {}, drafts: [] };
      t[tm].total++;
      if (s.maritime7) t[tm].done++;
      t[tm].names[s.name] = true;
      if (s.arV != null) t[tm].drafts.push(s.arV);
    });
    return Object.keys(t).map(function(k) {
      var o = t[k]; var d = o.drafts.sort(function(a,b){return a-b;});
      return { terminal: k, vessels: o.total, maritimeDone: o.done, maritimeRate: o.total ? Math.round(o.done/o.total*100) : 0, uniqueShips: Object.keys(o.names).length, draftMin: d[0]||0, draftMax: d[d.length-1]||0 };
    }).sort(function(a,b){ return b.vessels - a.vessels; });
  },

  /* ── 3. 时间趋势 ── */
  timeTrend: async function(period) {
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var isDay = (period === 'week' || period === 'month');
    var b = {};
    rows.forEach(function(s) {
      if (!s.date) return;
      var k = isDay ? s.date : s.date.substring(0, 7);
      if (!b[k]) b[k] = { total: 0, done: 0 };
      b[k].total++;
      if (s.maritime7) b[k].done++;
    });
    return Object.keys(b).sort().map(function(k) {
      var o = b[k]; return { key: k, total: o.total, done: o.done, rate: o.total ? Math.round(o.done/o.total*100) : 0 };
    });
  },

  /* ── 4. 航线流量 ── */
  routeFlow: async function(period, limit) {
    limit = limit || 15;
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var r = {};
    rows.forEach(function(s) {
      var pp = (s.pp||'—').trim(), np = (s.np||'—').trim();
      if (pp === '—' && np === '—') return;
      var k = pp + ' → ' + np;
      r[k] = (r[k]||0) + 1;
    });
    return Object.keys(r).map(function(k){ return {route:k, count:r[k]}; }).sort(function(a,b){return b.count-a.count;}).slice(0,limit);
  },

  /* ── 5. 吃水分布 ── */
  draftDistribution: async function(period) {
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var arr = [], dep = [];
    rows.forEach(function(s) {
      if (s.arV != null && s.arV > 0 && s.arV <= 18) arr.push(parseFloat(s.arV.toFixed(1)));
      if (s.drV != null && s.drV > 0 && s.drV <= 18) dep.push(parseFloat(s.drV.toFixed(1)));
    });
    function bucket(list) {
      var b = {};
      for (var i = 0; i < 18; i++) { var lb = i+'-'+(i+1)+'m'; b[lb] = 0; }
      list.forEach(function(v) { var s = Math.floor(v); if (s > 17) s = 17; b[s+'-'+(s+1)+'m']++; });
      return Object.keys(b).map(function(k){ return {range:k, count:b[k]}; }).filter(function(d){return d.count>0;});
    }
    return { arrival: bucket(arr), departure: bucket(dep) };
  },

  /* ── 6. ETA ── */
  etaWarnings: async function(period) {
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var s = { danger:0, warn:0, ok:0, noETA:0, expired:0 };
    rows.forEach(function(ship) {
      if (!ship.eta) { s.noETA++; return; }
      if (typeof getETAHours === 'function') {
        var h = getETAHours(ship.eta);
        if (h < 0) s.expired++; else if (h <= 24) s.danger++; else if (h <= 48) s.warn++; else s.ok++;
      } else { s.noETA++; }
    });
    return s;
  },

  /* ── 7. 调度员 ── */
  dispatcherStats: async function(period) {
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var b = {};
    rows.forEach(function(s) { if (s.maritime7By) b[s.maritime7By] = (b[s.maritime7By]||0) + 1; });
    return Object.keys(b).map(function(k){ return {name:k, count:b[k]}; }).sort(function(a,b){return b.count-a.count;});
  },

  /* ── 8. 高频船舶 ── */
  frequentVessels: async function(period, limit) {
    limit = limit || 20;
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var f = {};
    rows.forEach(function(s) {
      if (!f[s.name]) f[s.name] = { visits:0, dates:{}, terms:{} };
      f[s.name].visits++;
      if (s.date) f[s.name].dates[s.date] = true;
      if (s.tm) f[s.name].terms[s.tm] = true;
    });
    return Object.keys(f).map(function(k){
      var o = f[k]; return { name:k, visits:o.visits, dateCount:Object.keys(o.dates).length, terminals:Object.keys(o.terms).join('、') };
    }).sort(function(a,b){return b.visits-a.visits;}).slice(0,limit);
  },

  /* ── 9. 码头明细 ── */
  terminalDetail: async function(period) {
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var t = {};
    rows.forEach(function(s) {
      var tm = s.tm || '未知';
      if (!t[tm]) t[tm] = { total:0, done:0 };
      t[tm].total++;
      if (s.maritime7) t[tm].done++;
    });
    return Object.keys(t).map(function(k){
      var o = t[k]; return { terminal:k, total:o.total, done:o.done, rate:o.total?Math.round(o.done/o.total*100):0 };
    }).sort(function(a,b){return b.total-a.total;});
  },

  /* ── 10. 日报 ── */
  dailySnapshot: async function() {
    var now = new Date();
    var today = this.fmtDate(now);
    var data = await this.getAllShips();
    var ships = data.filter(function(s){ return s.date === today; });
    if (!ships.length) {
      now.setDate(now.getDate() - 1);
      today = this.fmtDate(now);
      ships = data.filter(function(s){ return s.date === today; });
    }
    var done = ships.filter(function(s){ return s.maritime7; }).length;
    var eta24 = 0, eta48 = 0;
    ships.forEach(function(s) {
      if (typeof getETAHours === 'function') {
        var h = getETAHours(s.eta);
        if (h >= 0 && h <= 24) eta24++; if (h > 24 && h <= 48) eta48++;
      }
    });
    var terms = {}; ships.forEach(function(s){ var tm = s.tm||'未知'; terms[tm]=(terms[tm]||0)+1; });
    return { date:today, total:ships.length, maritimeDone:done, maritimePending:ships.length-done, eta24h:eta24, eta48h:eta48, terminalCount:Object.keys(terms).length };
  },

  /* ── 11. 文本汇报 ── */
  generateReport: async function(period) {
    var ov = await this.overview(period);
    var terms = await this.terminalStats(period);
    var routes = await this.routeFlow(period, 10);
    var freq = await this.frequentVessels(period, 10);
    var disp = await this.dispatcherStats(period);
    var range = this.getPeriodRange(period);

    var r = [];
    r.push('═══════════════════════════════');
    r.push('  调度精灵 · 数据分析汇报');
    r.push('  统计周期: ' + range.label);
    r.push('  生成时间: ' + new Date().toLocaleString('zh-CN'));
    r.push('═══════════════════════════════');
    r.push('');
    r.push('【周期总览】');
    r.push('  船舶总次: ' + ov.totalShips + ' | 不重复船: ' + ov.uniqueShips + ' | 活跃天: ' + ov.activeDays);
    r.push('  海事完成率: ' + ov.maritimeRate + '% | 活跃码头: ' + ov.activeTerminals + ' | 24h预警: ' + ov.etaDanger);
    r.push('');
    r.push('【码头作业量排名】');
    terms.slice(0, 8).forEach(function(t, i) {
      r.push('  ' + (i+1) + '. ' + t.terminal + ': ' + t.vessels + '艘 | 海事' + t.maritimeRate + '% | 船型' + t.uniqueShips + '种');
    });
    r.push('');
    r.push('【主要航线 Top 10】');
    routes.forEach(function(rt, i) { r.push('  ' + (i+1) + '. ' + rt.route + ' — ' + rt.count + '次'); });
    r.push('');
    r.push('【高频船舶 Top 10】');
    freq.forEach(function(v, i) { r.push('  ' + (i+1) + '. ' + v.name + ': ' + v.visits + '次 / ' + v.terminals); });
    if (disp.length) {
      r.push('');
      r.push('【调度员海事确认】');
      disp.forEach(function(d, i) { r.push('  ' + (i+1) + '. ' + d.name + ': ' + d.count + '艘'); });
    }
    r.push('');
    r.push('═══════════════════════════════');
    r.push('  调度精灵 V7 · 船舶代理数据分析');
    r.push('═══════════════════════════════');
    return r.join('\n');
  }
};
