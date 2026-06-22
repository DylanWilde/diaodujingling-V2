/* ═══════════════════════════════════════════════════
   调度精灵 V7 — 船代数据分析引擎
   时间跨度: 周(7天)/月/季/年/全部 · 行业KPI
   ═══════════════════════════════════════════════════ */

var ANALYTICS = {

  /* ── 读取全部数据（合并 IndexedDB + sharedShips）── */
  getAllShips: function() {
    return new Promise(function(ok) {
      try {
        var localRows = [], sharedRows = [];

        function dedupKey(s) {
          return (s.name||'') + '|' + (s.iv||'') + '|' + (s.ev||'');
        }

        function normalize(rows) {
          rows.forEach(function(s) {
            s.eta = s.eta || '';
            s.maritime7 = !!s.maritime7;
            s.maritime7Note = s.maritime7Note || '';
            s.maritime7By = s.maritime7By || '';
          });
        }

        function merge() {
          var map = {};
          sharedRows.forEach(function(s) { map[dedupKey(s)] = s; });
          localRows.forEach(function(s) { map[dedupKey(s)] = s; });
          var merged = Object.values(map);
          console.log('[Analytics] Merged: ' + localRows.length + ' local + ' + sharedRows.length + ' shared = ' + merged.length + ' total rows');
          if (merged.length) {
            var dates = {}; merged.forEach(function(s){ if(s.date) dates[s.date]=true; });
            console.log('[Analytics] Date range: ' + Object.keys(dates).sort().slice(0,3).join(', ') + '... (' + Object.keys(dates).length + ' dates)');
          }
          ok(merged);
        }

        function loadShared() {
          if (typeof sharedShips !== 'undefined' && sharedShips.length) {
            sharedRows = sharedShips.slice();
            normalize(sharedRows);
          }
        }

        function doneLocal() {
          loadShared();
          merge();
        }

        if (typeof db !== 'undefined' && db) {
          var tx = db.transaction('ships', 'readonly');
          var st = tx.objectStore('ships');
          var r = st.getAll();
          r.onsuccess = function() {
            localRows = r.result || [];
            normalize(localRows);
            doneLocal();
          };
          r.onerror = function() {
            console.log('[Analytics] DB read error, using shared only');
            doneLocal();
          };
        } else {
          loadShared();
          if (!sharedRows.length && typeof getAllData === 'function') {
            getAllData().then(function(d) {
              localRows = d || [];
              normalize(localRows);
              merge();
            });
            return;
          }
          merge();
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

  /* ── 时间跨度（支持 week / month-N / quarter-N / year-NNNN / all）── */
  getPeriodRange: function(period) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var from = null, to = null, label = '';

    if (period === 'week') {
      from = new Date(today); from.setDate(today.getDate() - 7);
      to = today;
      label = '近7天 ' + this.fmtDate(from) + ' ~ ' + this.fmtDate(today);
    } else if (period && period.indexOf('month-') === 0) {
      var m = parseInt(period.split('-')[1]);
      var y = today.getFullYear();
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 0);
      label = y + '年' + m + '月';
    } else if (period && period.indexOf('quarter-') === 0) {
      var q = parseInt(period.split('-')[1]);
      var y2 = today.getFullYear();
      from = new Date(y2, (q - 1) * 3, 1);
      to = new Date(y2, q * 3, 0);
      label = y2 + '年 Q' + q + ' (' + ['1-3月','4-6月','7-9月','10-12月'][q-1] + ')';
    } else if (period && period.indexOf('year-') === 0) {
      var y3 = parseInt(period.split('-')[1]);
      from = new Date(y3, 0, 1);
      to = new Date(y3, 11, 31);
      label = y3 + '年度';
    } else {
      label = '全部历史';
    }
    var fromStr = from ? this.fmtDate(from) : null;
    var toStr = this.fmtDate(to) || this.fmtDate(today);
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

  /* ── 航次去重键（船名+航次=1代理航次，跨天重复报船期去重）── */
  vKey: function(s) {
    return (s.name||'') + '|' + (s.iv||'') + '|' + (s.ev||'');
  },

  /* ── 1. 总览 ── */
  overview: async function(period) {
    var self = this;
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var voyageSet = {}, dateSet = {}, monthSet = {}, termSet = {};
    var marDone = 0, etaDanger = 0, etaWarn = 0;
    rows.forEach(function(s) {
      voyageSet[self.vKey(s)] = true;
      if (s.date) { dateSet[s.date] = true; monthSet[s.date.substring(0,7)] = true; }
      if (s.tm) termSet[s.tm] = true;
      if (s.maritime7) marDone++;
      if (typeof getETAHours === 'function') {
        var h = getETAHours(s.eta);
        if (h >= 0 && h <= 24) etaDanger++;
        if (h > 24 && h <= 48) etaWarn++;
      }
    });
    var voyageCount = Object.keys(voyageSet).length;
    return {
      voyageCount: voyageCount,
      activeDays: Object.keys(dateSet).length,
      activeMonths: Object.keys(monthSet).length,
      activeTerminals: Object.keys(termSet).length,
      maritimeDone: marDone,
      maritimeRate: voyageCount ? Math.round(marDone/voyageCount*100) : 0,
      etaDanger: etaDanger,
      etaWarn: etaWarn
    };
  },

  /* ── 2. 码头作业量（航次去重）── */
  terminalStats: async function(period) {
    var self = this;
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var t = {};
    rows.forEach(function(s) {
      var tm = s.tm || '未知';
      if (!t[tm]) t[tm] = { vkeys: {}, names: {}, drafts: [], marDone: 0 };
      if (t[tm].vkeys[self.vKey(s)]) return;
      t[tm].vkeys[self.vKey(s)] = true;
      t[tm].names[s.name] = true;
      if (s.maritime7) t[tm].marDone++;
      if (s.arV != null) t[tm].drafts.push(s.arV);
    });
    return Object.keys(t).map(function(k) {
      var o = t[k]; var d = o.drafts.sort(function(a,b){return a-b;});
      var cnt = Object.keys(o.vkeys).length;
      return { terminal: k, vessels: cnt, maritimeDone: o.marDone, maritimeRate: cnt ? Math.round(o.marDone/cnt*100) : 0, uniqueShips: Object.keys(o.names).length, draftMin: d[0]||0, draftMax: d[d.length-1]||0 };
    }).sort(function(a,b){ return b.vessels - a.vessels; });
  },

  /* ── 3. 时间趋势（航次去重）── */
  timeTrend: async function(period) {
    var self = this;
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var isDay = (period === 'week' || (period && period.indexOf('month-') === 0));
    var b = {};
    rows.forEach(function(s) {
      if (!s.date) return;
      var k = isDay ? s.date : s.date.substring(0, 7);
      if (!b[k]) b[k] = { vkeys: {}, marDone: 0 };
      if (b[k].vkeys[self.vKey(s)]) return;
      b[k].vkeys[self.vKey(s)] = true;
      if (s.maritime7) b[k].marDone++;
    });
    return Object.keys(b).sort().map(function(k) {
      var o = b[k]; var cnt = Object.keys(o.vkeys).length;
      return { key: k, total: cnt, done: o.marDone, rate: cnt ? Math.round(o.marDone/cnt*100) : 0 };
    });
  },

  /* ── 4. 航线流量（航次去重）── */
  routeFlow: async function(period, limit) {
    limit = limit || 15;
    var self = this;
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var r = {}, seen = {};
    rows.forEach(function(s) {
      var pp = (s.pp||'—').trim(), np = (s.np||'—').trim();
      if (pp === '—' && np === '—') return;
      var route = pp + ' → ' + np;
      var ck = route + '|' + self.vKey(s);
      if (seen[ck]) return;
      seen[ck] = true;
      r[route] = (r[route]||0) + 1;
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

  /* ── 8. 高频船舶（航次去重）── */
  frequentVessels: async function(period, limit) {
    limit = limit || 20;
    var self = this;
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var f = {};
    rows.forEach(function(s) {
      if (!f[s.name]) f[s.name] = { vkeys: {}, dates: {}, terms: {} };
      var vk = self.vKey(s);
      if (f[s.name].vkeys[vk]) return;
      f[s.name].vkeys[vk] = true;
      if (s.date) f[s.name].dates[s.date] = true;
      if (s.tm) f[s.name].terms[s.tm] = true;
    });
    return Object.keys(f).map(function(k){
      var o = f[k]; return { name:k, visits:Object.keys(o.vkeys).length, dateCount:Object.keys(o.dates).length, terminals:Object.keys(o.terms).join('、') };
    }).sort(function(a,b){return b.visits-a.visits;}).slice(0,limit);
  },

  /* ── 9. 码头明细（航次去重）── */
  terminalDetail: async function(period) {
    var self = this;
    var data = await this.getAllShips();
    var rows = this.filterByPeriod(data, period);
    var t = {};
    rows.forEach(function(s) {
      var tm = s.tm || '未知';
      if (!t[tm]) t[tm] = { vkeys: {}, marDone: 0 };
      if (t[tm].vkeys[self.vKey(s)]) return;
      t[tm].vkeys[self.vKey(s)] = true;
      if (s.maritime7) t[tm].marDone++;
    });
    return Object.keys(t).map(function(k){
      var o = t[k]; var cnt = Object.keys(o.vkeys).length;
      return { terminal:k, total:cnt, done:o.marDone, rate:cnt?Math.round(o.marDone/cnt*100):0 };
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

  /* ── 10. 文本汇报 ── */
  generateReport: async function(period) {
    var ov = await this.overview(period);
    var terms = await this.terminalStats(period);
    var routes = await this.routeFlow(period, 10);
    var freq = await this.frequentVessels(period, 10);
    var range = this.getPeriodRange(period);

    var r = [];
    r.push('═══════════════════════════════');
    r.push('  调度精灵 · 数据分析汇报');
    r.push('  统计周期: ' + range.label);
    r.push('  生成时间: ' + new Date().toLocaleString('zh-CN'));
    r.push('═══════════════════════════════');
    r.push('');
    r.push('【周期总览】');
    r.push('  代理航次: ' + ov.voyageCount + ' | 活跃天: ' + ov.activeDays + ' | 活跃码头: ' + ov.activeTerminals);
    r.push('  海事完成率: ' + ov.maritimeRate + '% | 24h预警: ' + ov.etaDanger);
    r.push('');
    r.push('【码头作业量排名】');
    terms.slice(0, 8).forEach(function(t, i) {
      r.push('  ' + (i+1) + '. ' + t.terminal + ': ' + t.vessels + '航次 | 海事' + t.maritimeRate + '% | 船型' + t.uniqueShips + '种');
    });
    r.push('');
    r.push('【主要航线 Top 10】');
    routes.forEach(function(rt, i) { r.push('  ' + (i+1) + '. ' + rt.route + ' — ' + rt.count + '次'); });
    r.push('');
    r.push('【高频船舶 Top 10】');
    freq.forEach(function(v, i) { r.push('  ' + (i+1) + '. ' + v.name + ': ' + v.visits + '航次 / ' + v.terminals); });
    r.push('');
    r.push('═══════════════════════════════');
    r.push('  调度精灵 V7 · 船舶代理数据分析');
    r.push('═══════════════════════════════');
    return r.join('\n');
  }
};
