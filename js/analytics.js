/* ═══════════════════════════════════════════════════
   调度精灵 V7 — 数据分析引擎
   从船期表中提取领导层汇报用统计分析
   ═══════════════════════════════════════════════════ */

var ANALYTICS = {

  /* ── 获取全部数据 ── */
  getAllShips: function() {
    return new Promise(function(ok) {
      if (typeof isViewerMode !== 'undefined' && isViewerMode && typeof sharedShips !== 'undefined') {
        ok(sharedShips.slice()); return;
      }
      if (typeof getAllData === 'function') { getAllData().then(function(d) { ok(d || []); }); }
      else { ok([]); }
    });
  },

  /* ── 1. 码头作业量统计 ── */
  terminalStats: async function() {
    var data = await this.getAllShips();
    var terms = {};
    data.forEach(function(s) {
      var tm = s.tm || '未知';
      if (!terms[tm]) terms[tm] = { count: 0, drafts: [], maritimeDone: 0, maritimeTotal: 0 };
      terms[tm].count++;
      if (s.arV != null) terms[tm].drafts.push(s.arV);
      if (s.drV != null) terms[tm].drafts.push(s.drV);
      terms[tm].maritimeTotal++;
      if (s.maritime7) terms[tm].maritimeDone++;
    });
    var result = Object.keys(terms).map(function(k) {
      var t = terms[k];
      var drafts = t.drafts.sort(function(a,b){return a-b;});
      return {
        terminal: k,
        count: t.count,
        draftMin: drafts.length ? drafts[0] : 0,
        draftMax: drafts.length ? drafts[drafts.length-1] : 0,
        draftAvg: drafts.length ? (drafts.reduce(function(a,b){return a+b;},0)/drafts.length).toFixed(1) : 0,
        maritimeRate: t.maritimeTotal ? (t.maritimeDone/t.maritimeTotal*100).toFixed(0) : 0
      };
    });
    result.sort(function(a,b){ return b.count - a.count; });
    return result;
  },

  /* ── 2. 月度趋势 ── */
  monthlyTrend: async function() {
    var data = await this.getAllShips();
    var months = {};
    data.forEach(function(s) {
      if (!s.date) return;
      var m = s.date.substring(0, 7);
      if (!months[m]) months[m] = { total: 0, maritimeDone: 0, drafts: [] };
      months[m].total++;
      if (s.maritime7) months[m].maritimeDone++;
      if (s.drV != null) months[m].drafts.push(s.drV);
      if (s.arV != null) months[m].drafts.push(s.arV);
    });
    var sorted = Object.keys(months).sort();
    return sorted.map(function(m) {
      var mo = months[m];
      return {
        month: m,
        total: mo.total,
        maritimeDone: mo.maritimeDone,
        maritimeRate: mo.total ? (mo.maritimeDone/mo.total*100).toFixed(0) : 0,
        avgDraft: mo.drafts.length ? (mo.drafts.reduce(function(a,b){return a+b;},0)/mo.drafts.length).toFixed(1) : 0
      };
    });
  },

  /* ── 3. 航线流量分析 ── */
  routeFlow: async function() {
    var data = await this.getAllShips();
    var routes = {};
    data.forEach(function(s) {
      var pp = (s.pp || '—').trim();
      var np = (s.np || '—').trim();
      if (pp === '—' && np === '—') return;
      var key = pp + ' → ' + np;
      if (!routes[key]) routes[key] = 0;
      routes[key]++;
    });
    var result = Object.keys(routes).map(function(k) {
      return { route: k, count: routes[k] };
    });
    result.sort(function(a,b){ return b.count - a.count; });
    return result.slice(0, 20);
  },

  /* ── 4. 吃水分布 ── */
  draftDistribution: async function() {
    var data = await this.getAllShips();
    var arrDrafts = [], depDrafts = [];
    data.forEach(function(s) {
      if (s.arV != null && s.arV > 0) arrDrafts.push(s.arV);
      if (s.drV != null && s.drV > 0) depDrafts.push(s.drV);
    });
    /* 按0.5m分桶 0-15m */
    function bucket(list) {
      var b = {};
      for (var i = 0; i <= 15; i += 0.5) {
        var key = i.toFixed(1) + '-' + (i+0.5).toFixed(1);
        b[key] = 0;
      }
      list.forEach(function(v) {
        var slot = Math.floor(v * 2) / 2;
        if (slot > 15) slot = 15;
        var key2 = slot.toFixed(1) + '-' + (slot+0.5).toFixed(1);
        if (b[key2] !== undefined) b[key2]++;
        else b['15.0-15.5']++;
      });
      return Object.keys(b).map(function(k) { return { range: k, count: b[k] }; });
    }
    return { arrival: bucket(arrDrafts), departure: bucket(depDrafts) };
  },

  /* ── 5. 海事申报完成率 ── */
  maritimeCompletion: async function() {
    var data = await this.getAllShips();
    var total = data.length;
    var done = data.filter(function(s){ return s.maritime7; }).length;
    var byDate = {};
    data.forEach(function(s) {
      if (!s.date) return;
      if (!byDate[s.date]) byDate[s.date] = { total: 0, done: 0 };
      byDate[s.date].total++;
      if (s.maritime7) byDate[s.date].done++;
    });
    var byTerm = {};
    data.forEach(function(s) {
      var tm = s.tm || '未知';
      if (!byTerm[tm]) byTerm[tm] = { total: 0, done: 0 };
      byTerm[tm].total++;
      if (s.maritime7) byTerm[tm].done++;
    });
    /* 按调度员统计 */
    var byPerson = {};
    data.forEach(function(s) {
      if (!s.maritime7By) return;
      var p = s.maritime7By;
      if (!byPerson[p]) byPerson[p] = 0;
      byPerson[p]++;
    });
    return {
      overview: { total: total, done: done, rate: total ? (done/total*100).toFixed(0) : 0 },
      byDate: byDate,
      byTerm: byTerm,
      byPerson: byPerson
    };
  },

  /* ── 6. ETA预警分布 ── */
  etaWarnings: async function() {
    var data = await this.getAllShips();
    var stats = { danger: 0, warn: 0, ok: 0, noETA: 0, expired: 0 };
    data.forEach(function(s) {
      if (!s.eta) { stats.noETA++; return; }
      if (typeof getETAHours === 'function') {
        var h = getETAHours(s.eta);
        if (h < 0) stats.expired++;
        else if (h <= 24) stats.danger++;
        else if (h <= 48) stats.warn++;
        else stats.ok++;
      } else { stats.noETA++; }
    });
    return stats;
  },

  /* ── 7. 高频船舶 ── */
  frequentVessels: async function(limit) {
    limit = limit || 15;
    var data = await this.getAllShips();
    var freq = {};
    data.forEach(function(s) {
      if (!freq[s.name]) freq[s.name] = { count: 0, dates: {}, terminals: {} };
      freq[s.name].count++;
      if (s.date) freq[s.name].dates[s.date] = true;
      if (s.tm) freq[s.name].terminals[s.tm] = true;
    });
    var result = Object.keys(freq).map(function(k) {
      var f = freq[k];
      return {
        name: k,
        visits: f.count,
        dateCount: Object.keys(f.dates).length,
        terminals: Object.keys(f.terminals).join(', ')
      };
    });
    result.sort(function(a,b){ return b.visits - a.visits; });
    return result.slice(0, limit);
  },

  /* ── 8. 日期范围分析 ── */
  dateRangeStats: async function(from, to) {
    var data = await this.getAllShips();
    var filtered = data.filter(function(s) {
      return s.date >= from && s.date <= to;
    });
    var terminals = {};
    var routes = {};
    var total = filtered.length;
    var maritimeDone = 0;
    filtered.forEach(function(s) {
      var tm = s.tm || '未知';
      terminals[tm] = (terminals[tm] || 0) + 1;
      if (s.maritime7) maritimeDone++;
      var rk = (s.pp||'—') + ' → ' + (s.np||'—');
      routes[rk] = (routes[rk] || 0) + 1;
    });
    return {
      period: from + ' ~ ' + to,
      totalShips: total,
      uniqueShips: new Set(filtered.map(function(s){return s.name;})).size,
      maritimeRate: total ? (maritimeDone/total*100).toFixed(0) : 0,
      terminalCount: Object.keys(terminals).length,
      topTerminals: Object.keys(terminals).map(function(k){return {name:k,count:terminals[k]};}).sort(function(a,b){return b.count-a.count;}).slice(0,5),
      topRoutes: Object.keys(routes).map(function(k){return {route:k,count:routes[k]};}).sort(function(a,b){return b.count-a.count;}).slice(0,5)
    };
  },

  /* ── 9. 日报快照 (当天) ── */
  dailySnapshot: async function(date) {
    date = date || (typeof curDate !== 'undefined' ? curDate : new Date().toISOString().split('T')[0]);
    var data = await this.getAllShips();
    var today = data.filter(function(s) { return s.date === date; });
    if (!today.length) {
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      var yd = yesterday.toISOString().split('T')[0];
      today = data.filter(function(s) { return s.date === yd; });
      date = yd;
    }
    var total = today.length;
    var done = today.filter(function(s){return s.maritime7;}).length;
    var eta24 = 0, eta48 = 0;
    today.forEach(function(s) {
      if (typeof getETAHours === 'function') {
        var h = getETAHours(s.eta);
        if (h >= 0 && h <= 24) eta24++;
        if (h > 24 && h <= 48) eta48++;
      }
    });
    var terms = {};
    today.forEach(function(s) { var tm = s.tm||'未知'; terms[tm] = (terms[tm]||0)+1; });
    var topTerms = Object.keys(terms).map(function(k){return {name:k,count:terms[k]};}).sort(function(a,b){return b.count-a.count;});

    return {
      date: date,
      total: total,
      maritimeDone: done,
      maritimePending: total - done,
      eta24h: eta24,
      eta48h: eta48,
      terminalCount: Object.keys(terms).length,
      topTerminals: topTerms.slice(0, 5),
      ships: today.map(function(s) {
        return {
          name: s.name, iv: s.iv||'', ev: s.ev||'', tm: s.tm||'',
          eta: s.eta||'', arV: s.arV, drV: s.drV,
          pp: s.pp||'', np: s.np||'', maritime7: !!s.maritime7
        };
      })
    };
  },

  /* ── 10. 生成文本汇报 ── */
  generateReport: async function() {
    var snap = await this.dailySnapshot();
    var month = await this.monthlyTrend();
    var terms = await this.terminalStats();
    var routes = await this.routeFlow();
    var maritime = await this.maritimeCompletion();
    var freq = await this.frequentVessels(10);

    var now = new Date();
    var timeStr = now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日 ' +
      now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');

    var report = [];
    report.push('═══════════════════════════════════');
    report.push('  上海港 · 调度数据分析汇报');
    report.push('  生成时间: ' + timeStr);
    report.push('═══════════════════════════════════');
    report.push('');
    report.push('【一、今日概况】日期: ' + snap.date);
    report.push('  在港船舶: ' + snap.total + ' 艘');
    report.push('  海事已申报: ' + snap.maritimeDone + ' 艘 (' + (snap.total?(snap.maritimeDone/snap.total*100).toFixed(0):0) + '%)');
    report.push('  24h内预抵: ' + snap.eta24h + ' 艘');
    report.push('  48h内预抵: ' + snap.eta48h + ' 艘');
    report.push('  活跃码头: ' + snap.terminalCount + ' 个');
    if (snap.topTerminals.length) {
      report.push('  繁忙码头: ' + snap.topTerminals.map(function(t){return t.name+'('+t.count+'艘)';}).join('、'));
    }
    report.push('');
    report.push('【二、码头作业量排名】');
    terms.slice(0, 5).forEach(function(t, i) {
      report.push('  ' + (i+1) + '. ' + t.terminal + ': ' + t.count + ' 艘 | 吃水 ' + t.draftMin + '~' + t.draftMax + 'm | 海事完成率 ' + t.maritimeRate + '%');
    });
    report.push('');
    report.push('【三、月度趋势】');
    var recentMonths = month.slice(-6);
    recentMonths.forEach(function(m) {
      report.push('  ' + m.month + ': ' + m.total + ' 艘 | 海事 ' + m.maritimeRate + '% | 均吃水 ' + m.avgDraft + 'm');
    });
    report.push('');
    report.push('【四、主要航线 (Top 5)】');
    routes.slice(0, 5).forEach(function(r, i) {
      report.push('  ' + (i+1) + '. ' + r.route + ' — ' + r.count + ' 次');
    });
    report.push('');
    report.push('【五、高频船舶 (Top 10)】');
    freq.forEach(function(v, i) {
      report.push('  ' + (i+1) + '. ' + v.name + ': ' + v.visits + ' 次 / ' + v.dateCount + ' 天 / 码头: ' + v.terminals);
    });
    report.push('');
    report.push('【六、海事申报汇总】');
    report.push('  总完成率: ' + maritime.overview.rate + '% (' + maritime.overview.done + '/' + maritime.overview.total + ')');
    var persons = Object.keys(maritime.byPerson).sort(function(a,b){return maritime.byPerson[b]-maritime.byPerson[a];});
    if (persons.length) {
      report.push('  确认人员: ' + persons.map(function(p){return p+'('+maritime.byPerson[p]+'艘)';}).join('、'));
    }
    report.push('');
    report.push('═══════════════════════════════════');
    report.push('  汇报完毕 — 调度精灵 V7');
    report.push('═══════════════════════════════════');

    return report.join('\n');
  }
};
