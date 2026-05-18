/* ═══════════════════════════════════════════════════
   调度精灵 AI — 智能调度助手引擎
   依赖: app.js (db, getAllData, loadDateData, listDates, findAllShips)
         ships-map.js (SHIP_MAP)
   ═══════════════════════════════════════════════════ */

/* ═══ 港口水文气象知识库（离线兜底） ═══ */
var PORT_KNOWLEDGE = {
  '洋山深水港': {
    desc: '上海国际航运中心核心港区，全球最大自动化码头所在地',
    tides: '半日潮，高潮06:42(4.2m)/19:15(3.8m)，低潮12:28(1.1m)',
    depth: '航道水深15-17.5m，泊位水深16-17m',
    wind: '夏季盛行东南风，冬季偏北风，台风季7-9月需关注',
    terminals: '洋山一期~四期，共16个深水泊位',
    limits: '洋山4#泊位低潮时限吃水<12m'
  },
  '外高桥': {
    desc: '上海港主力集装箱港区，位于长江口南岸',
    tides: '半日潮，高潮06:30(3.8m)/19:00(3.5m)，低潮12:10(1.0m)',
    depth: '航道水深12.5m，泊位水深12-13m',
    wind: '受长江口地形影响，偏东风时涌浪较大',
    terminals: '外高桥一期~五期，共15个泊位',
    limits: '吃水>13m的超大型船需候潮进港'
  },
  '宝山': {
    desc: '长江口内港区，主营散杂货',
    tides: '半日潮，高潮07:00(3.5m)/19:30(3.2m)，低潮12:50(0.9m)',
    depth: '航道水深10-12m，泊位水深10-12m',
    wind: '冬季偏北风5-6级时影响靠泊作业',
    terminals: '宝山码头、罗泾码头等',
    limits: ''
  },
  '浦东': {
    desc: '黄浦江沿岸码头群，主营件杂货和近洋集装箱',
    tides: '半日潮，受黄浦江径流影响，潮时较洋山延迟约30分钟',
    depth: '航道水深8-10m，泊位水深8-11m',
    wind: '黄浦江内风力较外港小，但夏季雷暴天气需注意',
    terminals: '浦东码头、军工路码头等',
    limits: '吃水>10m的船舶需候潮通过吴淞口'
  }
};

/* ═══ 外部气象API（Open-Meteo 免费无需密钥） ═══ */
var WEATHER_CACHE = null;
var WEATHER_CACHE_TIME = 0;

async function fetchLiveWeather() {
  var now = Date.now();
  if (WEATHER_CACHE && (now - WEATHER_CACHE_TIME) < 600000) return WEATHER_CACHE; /* 10分钟缓存 */

  try {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(); }, 5000);

    /* 上海港坐标: 31.2N, 121.5E → 洋山30.6N 122.1E */
    var resp = await fetch('https://api.open-meteo.com/v1/forecast?latitude=30.65&longitude=122.05&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,visibility,weather_code&timezone=Asia/Shanghai', { signal: ctrl.signal });
    if (!resp.ok) throw new Error('API error');
    var data = await resp.json();
    var cur = data.current || {};

    /* 海浪数据 */
    var marineCtrl = new AbortController();
    setTimeout(function() { marineCtrl.abort(); }, 4000);
    var mResp = await fetch('https://marine-api.open-meteo.com/v1/marine?latitude=30.65&longitude=122.1&current=wave_height,wave_direction,wave_period,ocean_current_velocity&timezone=Asia/Shanghai', { signal: marineCtrl.signal });
    var mData = mResp.ok ? await mResp.json() : {};
    var mCur = (mData.current || {});

    var weatherCodeMap = {0:'晴天',1:'大部晴',2:'多云',3:'阴天',45:'雾',48:'霜雾',51:'小毛毛雨',53:'毛毛雨',55:'大毛毛雨',61:'小雨',63:'中雨',65:'大雨',71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'中阵雨',82:'大阵雨',95:'雷暴',96:'雷暴+冰雹',99:'强雷暴+冰雹'};

    WEATHER_CACHE = {
      temp: (cur.temperature_2m != null) ? cur.temperature_2m + '°C' : null,
      humidity: (cur.relative_humidity_2m != null) ? cur.relative_humidity_2m + '%' : null,
      windSpeed: (cur.wind_speed_10m != null) ? (cur.wind_speed_10m * 3.6).toFixed(1) + 'km/h' : null,
      windDir: (cur.wind_direction_10m != null) ? degToWindDir(cur.wind_direction_10m) : null,
      visibility: (cur.visibility != null) ? (cur.visibility / 1000).toFixed(1) + 'km' : null,
      weatherCode: cur.weather_code,
      weatherText: weatherCodeMap[cur.weather_code] || ('代码' + cur.weather_code),
      waveHeight: (mCur.wave_height != null) ? mCur.wave_height.toFixed(2) + 'm' : null,
      waveDir: (mCur.wave_direction != null) ? degToWindDir(mCur.wave_direction) : null,
      currentVelocity: (mCur.ocean_current_velocity != null) ? (mCur.ocean_current_velocity * 1.944).toFixed(2) + '节' : null,
      source: 'Open-Meteo 实时',
      ts: now
    };
    WEATHER_CACHE_TIME = now;
    return WEATHER_CACHE;
  } catch(e) {
    /* 离线兜底 */
    return {
      temp: '16-25°C', humidity: '68%', windSpeed: '15-22km/h', windDir: '东南风',
      visibility: '8km+', weatherText: '晴转多云', waveHeight: '0.8m',
      currentVelocity: '2.1节', source: '离线估算（无网络）', ts: 0
    };
  }
}

function degToWindDir(deg) {
  var dirs = ['北','东北偏北','东北','东北偏东','东','东南偏东','东南','东南偏南','南','西南偏南','西南','西南偏西','西','西北偏西','西北','西北偏北'];
  return dirs[Math.round(deg / 22.5) % 16] + '风';
}

/* ═══ 日期解析 ═══ */
function parseDateFromQuery(q) {
  var now = new Date();
  if (/今天|今日|当天/.test(q)) return dateStr(now);
  if (/昨天|昨日/.test(q)) return dateStr(new Date(now - 86400000));
  if (/前天/.test(q)) return dateStr(new Date(now - 172800000));
  if (/明天|明日/.test(q)) return dateStr(new Date(now.getTime() + 86400000));
  var mMDD = q.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (mMDD) {
    var m = parseInt(mMDD[1]), d = parseInt(mMDD[2]);
    var y = now.getFullYear();
    if (m > now.getMonth() + 1) y--;
    return y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  }
  var mISO = q.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mISO) return mISO[0];
  return null;
}

function dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ═══ 码头名标准化 ═══ */
function parseTerminal(q) {
  var map = {
    '洋山': '洋山', '外高桥': '外高桥', '宝山': '宝山', '浦东': '浦东',
    '罗泾': '罗泾', '军工路': '军工路', '张华浜': '张华浜', '龙吴': '龙吴',
    '洋山1': '洋山1', '洋山2': '洋山2', '洋山3': '洋山3', '洋山4': '洋山4'
  };
  for (var k in map) { if (q.indexOf(k) >= 0) return map[k]; }
  return null;
}

/* ═══ 意图识别 ═══ */
function detectIntent(q) {
  if (/天气|气温|风|浪|能见度|雾|降水|下雨|台风|海况/.test(q)) return 'weather';
  if (/潮汐|潮高|潮位|高潮|低潮|水流|水深|吃水限制/.test(q)) return 'tide';
  if (/港口.*介绍|码头.*分布|港区.*情况|洋山.*介绍|外高桥.*介绍/.test(q)) return 'portInfo';
  if (/有几艘|总共.*船|统计|汇总|数据.*多少|在港|所有日期|哪些日期/.test(q)) return 'stats';
  if (/海事申报|海事.*完成|未申报|申报.*情况/.test(q)) return 'maritime';
  if (/什么.*航次|航次.*多少|查.*航次|哪个.*航次/.test(q)) return 'voyage';
  if (/船名|什么船|有哪些船|查.*船|船.*信息|船舶|哪艘/.test(q)) return 'ships';
  if (/上港|下港|从哪里|去哪|航线|航程/.test(q)) return 'route';
  if (/吃水|排水|吨位/.test(q)) return 'draft';
  return 'general';
}

/* ═══ 合并本地+共享数据 ═══ */
async function aiGetAllData() {
  var local = [];
  try { local = await getAllData(); } catch(e) { local = []; }

  /* 合并 sharedShips（访客模式/线上数据） */
  var shared = (typeof sharedShips !== 'undefined' && sharedShips.length) ? sharedShips : [];
  if (!shared.length) return local;

  var seen = {};
  var merged = [];
  local.forEach(function(s) {
    var k = s.date + '|' + s.name + '|' + (s.iv||'') + '|' + (s.ev||'');
    seen[k] = true;
    merged.push(s);
  });
  shared.forEach(function(s) {
    var k = s.date + '|' + s.name + '|' + (s.iv||'') + '|' + (s.ev||'');
    if (!seen[k]) { seen[k] = true; merged.push(s); }
  });
  return merged;
}

function aiGetDates(allData) {
  var dates = {};
  allData.forEach(function(s) { if (s.date) dates[s.date] = true; });
  return Object.keys(dates).sort().reverse();
}

/* ═══ 大模型配置 ═══ */
var LLM_CONFIG = {
  apiKey: localStorage.getItem('llm_key') || 'sk-012f84b897de4f93ba6bebf897b637e8',
  model: 'deepseek-chat',
  provider: 'DeepSeek',
  /* 多个端点依次尝试，第一个通的就是当前使用 */
  proxies: [
    { name: '同域', url: '/api/proxy' },
    { name: 'Vercel', url: 'https://dispatch-bao-proxy.vercel.app/api/proxy' },
    { name: '直连', url: 'https://api.deepseek.cn/v1/chat/completions' },
    { name: 'corsproxy', url: 'https://corsproxy.io/?' + encodeURIComponent('https://api.deepseek.cn/v1/chat/completions') }
  ],
  currentProxy: -1 /* -1=未检测 */
};

function setLLMKey(key) {
  LLM_CONFIG.apiKey = key.trim();
  localStorage.setItem('llm_key', LLM_CONFIG.apiKey);
}

function hasLLMKey() {
  return !!(LLM_CONFIG.apiKey && LLM_CONFIG.apiKey.length > 20);
}

/* ═══ 连接状态检测 ═══ */
var LLM_STATUS = 'checking'; /* checking | connected | cors_blocked | nokey | failed */

async function checkLLMConnection() {
  if (!hasLLMKey()) {
    LLM_STATUS = 'nokey';
    updateLLMStatusUI();
    return;
  }
  LLM_STATUS = 'checking';
  updateLLMStatusUI();

  /* 依次测试每个代理 */
  for (var i = 0; i < LLM_CONFIG.proxies.length; i++) {
    var proxy = LLM_CONFIG.proxies[i];
    try {
      var ctrl = new AbortController();
      setTimeout(function() { ctrl.abort(); }, 8000);
      /* Vercel代理自带Key，不传Authorization避免触发严格预检 */
      var reqHeaders = { 'Content-Type': 'application/json' };
      if (proxy.name !== 'Vercel') reqHeaders['Authorization'] = 'Bearer ' + LLM_CONFIG.apiKey;
      var resp = await fetch(proxy.url, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ model: LLM_CONFIG.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
        signal: ctrl.signal
      });
      if (resp.ok) {
        LLM_CONFIG.currentProxy = i;
        LLM_STATUS = 'connected';
        updateLLMStatusUI();
        return;
      }
    } catch(e) {
      console.log(proxy.name + ' 不通: ' + e.message);
    }
  }
  LLM_STATUS = 'cors_blocked';
  updateLLMStatusUI();
}

function updateLLMStatusUI() {
  var tag = document.getElementById('aiDbStats');
  if (!tag) return;

  switch (LLM_STATUS) {
    case 'connected':
      var pn = LLM_CONFIG.proxies[LLM_CONFIG.currentProxy];
      tag.textContent = '🧠 DeepSeek 已连接' + (pn ? ' · ' + pn.name : '');
      tag.style.background = '#ECFDF5';
      tag.style.color = '#059669';
      tag.style.fontWeight = '700';
      break;
    case 'checking':
      tag.textContent = '⏳ 正在连接DeepSeek...';
      tag.style.background = '#FFFBEB';
      tag.style.color = '#D97706';
      tag.style.fontWeight = '400';
      break;
    case 'cors_blocked':
      tag.textContent = '⚠ CORS拦截·需代理';
      tag.style.background = '#FEF2F2';
      tag.style.color = '#DC2626';
      tag.style.fontWeight = '700';
      break;
    case 'nokey':
      tag.textContent = '🔑 未配置API Key';
      tag.style.background = '#F1F5F9';
      tag.style.color = '#64748B';
      tag.style.fontWeight = '400';
      break;
    default:
      tag.textContent = '❌ DeepSeek 未连接';
      tag.style.background = '#FEF2F2';
      tag.style.color = '#DC2626';
      tag.style.fontWeight = '700';
  }
}

/* ═══ 构建系统提示词（注入实时数据上下文） ═══ */
async function buildSystemPrompt() {
  var allData = await aiGetAllData();
  var dates = aiGetDates(allData);
  var latestDate = dates[0] || '无数据';
  var latestShips = allData.filter(function(s) { return s.date === latestDate; });
  var totalShips = allData.length;

  /* 船舶数据摘要 */
  var shipSummary = '最新日期：' + latestDate + '，共' + latestShips.length + '艘船';
  var shipList = latestShips.slice(0, 15).map(function(s) {
    return s.name + '（' + (s.iv||'') + '/' + (s.ev||'') + '）泊' + (s.tm||'?') + ' ' + (s.pp||'') + '→' + (s.np||'') + ' 吃水' + (s.arV||'?') + '/' + (s.drV||'?') + 'm';
  }).join('\n');

  /* 天气数据 */
  var weather = await fetchLiveWeather();

  return '你是「调度精灵」AI助手，服务于上海港中远海运船舶调度。' +
    '\n\n【实时船舶数据库 — ' + latestDate + '】' +
    '\n总记录' + totalShips + '条，覆盖' + dates.length + '个日期。最新日船舶：\n' + shipList +
    (latestShips.length > 15 ? '\n...共' + latestShips.length + '艘（以上为前15艘）' : '') +
    '\n\n【今日气象】气温' + (weather.temp||'?') + ' 风' + (weather.windDir||'?') + (weather.windSpeed||'?') +
    ' 浪高' + (weather.waveHeight||'?') + ' 能见度' + (weather.visibility||'?') +
    ' 天气' + (weather.weatherText||'?') + ' 数据源：' + weather.source +
    '\n\n【港口知识】洋山深水港(水深17m/全球最大自动化码头)、外高桥(水深12.5m/主力集装箱)、宝山(水深12m/散杂货)、浦东(水深10m/近洋件杂货)。半日潮港，今日洋山高潮06:42(4.2m)/19:15(3.8m)，低潮12:28(1.1m)。' +
    '\n\n用户将用中文提问。请：' +
    '\n1. 用专业友好的调度员语气回答' +
    '\n2. 引用数据库中的真实船名/航次/码头/吃水数据' +
    '\n3. 如问题超出数据范围，诚实说明并给出建议' +
    '\n4. 回答简洁有用，适当使用表格和emoji' +
    '\n5. 涉及船期时优先引用最新日期(' + latestDate + ')的数据';
}

/* ═══ API调用（轻量请求头避免预检） ═══ */
async function callLLM(userQuery) {
  if (LLM_STATUS !== 'connected') {
    await checkLLMConnection();
    if (LLM_STATUS !== 'connected') return null;
  }

  var systemPrompt = await buildSystemPrompt();
  var body = JSON.stringify({
    model: LLM_CONFIG.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery }
    ],
    temperature: 0.7,
    max_tokens: 1500
  });

  var proxy = LLM_CONFIG.proxies[LLM_CONFIG.currentProxy];
  /* Vercel代理自带Key，不需要发送Authorization */
  var headers = { 'Content-Type': 'application/json' };
  if (proxy.name !== 'Vercel') {
    headers['Authorization'] = 'Bearer ' + LLM_CONFIG.apiKey;
  }

  try {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(); }, 30000);
    var resp = await fetch(proxy.url, {
      method: 'POST',
      headers: headers,
      body: body,
      signal: ctrl.signal
    });
    if (!resp.ok) throw new Error('API ' + resp.status);
    var data = await resp.json();
    var reply = (data.choices && data.choices[0] && data.choices[0].message)
      ? data.choices[0].message.content : '';
    if (!reply) throw new Error('empty');
    return { text: reply + '\n\n<span style="font-size:9px;color:#94A3B8">🧠 DeepSeek · ' + proxy.name + ' · ' + new Date().toTimeString().slice(0,5) + '</span>' };
  } catch(e) {
    LLM_CONFIG.currentProxy++;
    if (LLM_CONFIG.currentProxy < LLM_CONFIG.proxies.length) {
      LLM_STATUS = 'checking';
      updateLLMStatusUI();
      return await callLLM(userQuery);
    }
    LLM_STATUS = 'failed';
    updateLLMStatusUI();
    return null;
  }
}

/* ═══ 主查询函数 — DeepSeek优先，本地兜底 ═══ */
async function aiQuery(query) {
  var q = query.trim();
  if (!q) return { text: '您好，请问有什么可以帮您？' };

  /* 1. 尝试大模型 */
  if (hasLLMKey()) {
    var llmResult = await callLLM(q);
    if (llmResult) return llmResult;
  }

  /* 2. 降级本地引擎 */
  var intent = detectIntent(q);
  var date = parseDateFromQuery(q);
  var terminal = parseTerminal(q);
  var allData = await aiGetAllData();
  var dates = aiGetDates(allData);

  switch (intent) {
    case 'weather':
      return await answerWeather(q, terminal);
    case 'tide':
      return answerTide(q, terminal);
    case 'portInfo':
      return answerPortInfo(q, terminal);
    case 'stats':
      return await answerStats(allData, dates);
    case 'ships':
      return await answerShips(q, allData, date, terminal);
    case 'voyage':
      return await answerVoyage(q, allData);
    case 'maritime':
      return await answerMaritime(q, allData, date);
    case 'draft':
      return await answerDraft(q, allData, date);
    default:
      return await answerGeneral(q, allData, date, terminal, dates);
  }
}

/* ═══ 各类型回答 ═══ */
async function answerWeather(q, terminal) {
  var port = terminal || '洋山深水港';
  var pk = PORT_KNOWLEDGE[port];
  if (!pk) {
    for (var k in PORT_KNOWLEDGE) { if (k.indexOf(port) >= 0) { pk = PORT_KNOWLEDGE[k]; port = k; break; } }
  }
  if (!pk) pk = PORT_KNOWLEDGE['洋山深水港'];

  /* 尝试外部API获取实时数据 */
  var w = await fetchLiveWeather();

  var text = '🌤️ **' + port + '** 实时气象观测\n\n' +
    '| 项目 | 实时值 |\n|------|--------|\n' +
    '| 🌡️ 气温 | ' + (w.temp || '—') + ' |\n' +
    '| 💨 风向风力 | ' + (w.windDir || '—') + ' ' + (w.windSpeed || '—') + ' |\n' +
    '| 👁️ 能见度 | ' + (w.visibility || '—') + ' |\n' +
    '| 💧 湿度 | ' + (w.humidity || '—') + ' |\n' +
    '| 🌊 浪高 | ' + (w.waveHeight || '—') + ' |\n' +
    '| 🌊 流向流速 | ' + (w.waveDir || '—') + ' ' + (w.currentVelocity || '—') + ' |\n' +
    '| ☁️ 天气 | ' + (w.weatherText || '—') + ' |\n\n' +
    '📡 数据源：**' + w.source + '**\n' +
    '🕐 查询时间：' + new Date().toTimeString().slice(0,5) + '\n\n' +
    getWeatherAdviceFromLive(w, port);

  return { text: text };
}

function getWeatherAdviceFromLive(w, port) {
  var tips = [];
  var visKm = parseFloat(w.visibility);
  if (!isNaN(visKm) && visKm >= 5) tips.push('✓ 能见度' + w.visibility + '，靠泊作业正常');
  else if (!isNaN(visKm) && visKm < 5) tips.push('⚠ 能见度偏低（' + w.visibility + '），请注意瞭望');
  else tips.push('✓ 能见度良好');

  var windKmh = parseFloat(w.windSpeed);
  if (!isNaN(windKmh) && windKmh > 30) tips.push('⚠ 风力较大(' + w.windSpeed + ')，建议加固系缆');
  else if (!isNaN(windKmh) && windKmh > 15) tips.push('✓ 风力适中，可正常作业');
  else tips.push('✓ 风力较小，作业条件理想');

  var waveH = parseFloat(w.waveHeight);
  if (!isNaN(waveH) && waveH > 1.5) tips.push('⚠ 浪高' + w.waveHeight + '，小型船舶注意摇摆');
  else tips.push('✓ 浪高正常');

  if (w.source.indexOf('离线') >= 0) tips.push('⚠ 当前无网络，数据为离线估算，建议联网后重新查询');
  return '**作业建议**：\n' + tips.join('\n');
}

function answerTide(q, terminal) {
  var port = terminal || '洋山深水港';
  var pk = PORT_KNOWLEDGE[port];
  if (!pk) {
    for (var k in PORT_KNOWLEDGE) { if (k.indexOf(port) >= 0) { pk = PORT_KNOWLEDGE[k]; port = k; break; } }
  }
  if (!pk) pk = PORT_KNOWLEDGE['洋山深水港'];

  return {
    text: '🌊 **' + port + '** 今日潮汐预报\n\n' +
      '| 潮时 | 潮高 | 类型 |\n|------|------|------|\n' +
      pk.tides.replace(/高潮/g, '| 🌊 高潮').replace(/低潮/g, '| 📉 低潮').replace(/，/g, ' |\n') + ' |\n\n' +
      '📐 航道水深：' + pk.depth + '\n' +
      (pk.limits ? '⚠ **限制**：' + pk.limits + '\n' : '') +
      '\n💡 大型船舶建议利用高潮时段（06:00-12:00）进港靠泊。'
  };
}

function answerPortInfo(q, terminal) {
  var port = terminal || '洋山深水港';
  var pk = PORT_KNOWLEDGE[port];
  if (!pk) {
    for (var k in PORT_KNOWLEDGE) { if (k.indexOf(port) >= 0) { pk = PORT_KNOWLEDGE[k]; port = k; break; } }
  }
  if (!pk) {
    // 返回所有港口概览
    var list = [];
    for (var k in PORT_KNOWLEDGE) {
      list.push('**' + k + '**：' + PORT_KNOWLEDGE[k].desc + ' | 泊位水深' + PORT_KNOWLEDGE[k].depth.split('，')[1] || PORT_KNOWLEDGE[k].depth);
    }
    return { text: '📍 **上海港主要港区概览**\n\n' + list.join('\n\n') };
  }
  return {
    text: '📍 **' + port + '**\n\n' +
      pk.desc + '\n\n' +
      '| 参数 | 详情 |\n|------|------|\n' +
      '| 潮汐 | ' + pk.tides + ' |\n' +
      '| 水深 | ' + pk.depth + ' |\n' +
      '| 气象 | ' + pk.weather + ' |\n' +
      '| 风况 | ' + pk.wind + ' |\n' +
      '| 码头 | ' + pk.terminals + ' |\n' +
      (pk.limits ? '| 限制 | ' + pk.limits + ' |\n' : '')
  };
}

async function answerStats(allData, dates) {
  if (!allData.length) return { text: '📊 数据库暂无船舶数据。请先在「数据管理」页上传船期表。' };

  var dateCount = {};
  var terminalCount = {};
  var totalShips = 0;
  allData.forEach(function(s) {
    dateCount[s.date] = (dateCount[s.date] || 0) + 1;
    if (s.tm) terminalCount[s.tm] = (terminalCount[s.tm] || 0) + 1;
    totalShips++;
  });

  var uniqueDates = Object.keys(dateCount).sort().reverse();
  var latestDate = uniqueDates[0];

  var text = '📊 **调度精灵数据统计**\n\n' +
    '| 指标 | 数值 |\n|------|------|\n' +
    '| 📅 数据覆盖日期 | ' + uniqueDates.length + ' 天 |\n' +
    '| 🚢 船舶记录总数 | ' + totalShips + ' 条 |\n' +
    '| 📅 最新数据日期 | ' + latestDate + ' |\n' +
    '| 🏗️ 覆盖码头数 | ' + Object.keys(terminalCount).length + ' 个 |\n\n' +
    '**各日期船舶数**：\n' + uniqueDates.slice(0, 10).map(function(d) {
      return '• ' + d + '：' + dateCount[d] + ' 艘';
    }).join('\n') +
    (uniqueDates.length > 10 ? '\n• ...共' + uniqueDates.length + '个日期' : '');

  return { text: text };
}

async function answerShips(q, allData, date, terminal) {
  if (!allData.length) return { text: '📭 数据库暂无船舶数据，请先在「数据管理」页上传船期表。' };

  // 提取船名关键词
  var shipName = extractShipName(q, allData);

  var results;
  if (shipName) {
    results = findAllShips(shipName, allData);
    if (!results.length) return { text: '❌ 未找到「' + escHtml(shipName) + '」相关船舶记录，请检查船名是否正确。' };
  } else if (date) {
    results = allData.filter(function(s) { return s.date === date; });
    if (terminal) results = results.filter(function(s) { return s.tm && s.tm.indexOf(terminal) >= 0; });
    if (!results.length) return { text: '📭 ' + date + '暂无船舶数据' + (terminal ? '（码头：' + terminal + '）' : '') + '。' };
  } else if (terminal) {
    results = allData.filter(function(s) { return s.tm && s.tm.indexOf(terminal) >= 0; });
    if (!results.length) return { text: '📭 暂无「' + terminal + '」码头的船舶记录。' };
  } else {
    // 默认只返回最新日期的数据
    var dateMap = {};
    allData.forEach(function(s) { if (s.date) dateMap[s.date] = true; });
    var datesList = Object.keys(dateMap).sort().reverse();
    if (datesList.length) {
      date = datesList[0];
      results = allData.filter(function(s) { return s.date === date; });
    } else {
      results = [];
    }
  }

  // 去重
  var seen = {};
  results = results.filter(function(s) {
    var k = s.name + '|' + s.date + '|' + (s.iv||'') + '|' + (s.ev||'');
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });

  if (results.length === 0) return { text: '📭 未找到匹配的船舶记录。' };

  var title = shipName ? ('🔍 查询「' + escHtml(shipName) + '」' ) : ('📋 ' + (date || '全部') + '船舶列表');
  var text = title + ' — 共 **' + results.length + '** 条\n\n';

  if (results.length === 1) {
    var s = results[0];
    text += formatShipDetail(s);
  } else if (results.length <= 8) {
    text += '| 日期 | 船名 | 航次 | 码头 | 吃水(抵/离) | 航线 |\n|------|------|------|------|------|------|\n';
    results.slice(0, 30).forEach(function(s) {
      var ivEv = (s.iv||'') + (s.iv && s.ev ? '/' : '') + (s.ev||'');
      text += '| ' + s.date + ' | ' + escHtml(s.name) + ' | ' + ivEv + ' | ' + escHtml(s.tm||'') + ' | ' + (s.arV||'—') + '/' + (s.drV||'—') + ' | ' + escHtml(s.pp||'') + '→' + escHtml(s.np||'') + ' |\n';
    });
    if (results.length > 30) text += '| ... | 共' + results.length + '条，请缩小查询范围 |\n';
  } else {
    text += '查询结果较多（' + results.length + '条），建议缩小范围。例如：\n';
    text += '• 输入具体船名查询\n';
    text += '• 输入具体日期查询（如"5月9日的船"）\n';
    text += '• 输入码头名查询（如"浦东码头的船"）\n\n';
    text += '**匹配船名列表**：\n';
    var names = {};
    results.forEach(function(s) { names[s.name] = true; });
    Object.keys(names).slice(0, 20).forEach(function(n) { text += '• ' + n + '\n'; });
    if (Object.keys(names).length > 20) text += '• ...共' + Object.keys(names).length + '个不同船名';
  }

  return { text: text };
}

function extractShipName(q, allData) {
  // 先尝试从SHIP_MAP匹配
  for (var name in SHIP_MAP) {
    if (q.indexOf(name) >= 0) return name;
  }
  // 从数据库匹配
  var names = {};
  allData.forEach(function(s) { names[s.name] = true; });
  var sorted = Object.keys(names).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < sorted.length; i++) {
    if (q.indexOf(sorted[i]) >= 0) return sorted[i];
  }
  return null;
}

async function answerVoyage(q, allData) {
  if (!allData.length) return { text: '📭 数据库暂无数据。' };

  // 提取航次号 (如 585W, 2604SA, 2606N)
  var mVoyage = q.match(/(\d{3,4}[WENS]|[A-Z]{2,4}\d{2,4}|[A-Z]?\d{4}[A-Z]{1,2})/i);
  var voyagePattern = mVoyage ? mVoyage[0].toUpperCase() : '';

  if (!voyagePattern) return { text: '请提供航次号，例如"查询航次585W"。' };

  var results = [];
  allData.forEach(function(s) {
    var iv = (s.iv||'').toUpperCase();
    var ev = (s.ev||'').toUpperCase();
    if (iv.indexOf(voyagePattern) >= 0 || ev.indexOf(voyagePattern) >= 0) {
      results.push(s);
    }
  });

  if (!results.length) return { text: '❌ 未找到航次「' + voyagePattern + '」的记录。' };

  var text = '🔍 航次「' + voyagePattern + '」查询结果 — **' + results.length + '** 条\n\n';
  results.forEach(function(s) {
    text += formatShipDetail(s) + '\n---\n';
  });

  return { text: text };
}

async function answerMaritime(q, allData, date) {
  if (!allData.length) return { text: '📭 数据库暂无数据。' };

  var filterDate = date;
  if (!filterDate) {
    var dates = Object.keys(allData.reduce(function(acc, s) { acc[s.date] = true; return acc; }, {})).sort().reverse();
    filterDate = dates[0] || '';
  }

  var ships = allData.filter(function(s) { return s.date === filterDate; });
  var done = ships.filter(function(s) { return s.maritime7; });
  var pending = ships.filter(function(s) { return !s.maritime7; });

  return {
    text: '📋 **海事申报情况** — ' + filterDate + '\n\n' +
      '| 状态 | 数量 |\n|------|------|\n' +
      '| ✅ 已完成 | ' + done.length + ' 艘 |\n' +
      '| ⏳ 未完成 | ' + pending.length + ' 艘 |\n' +
      '| 📊 合计 | ' + ships.length + ' 艘 |\n\n' +
      (pending.length ? '**未完成船舶**：\n' + pending.map(function(s) {
        return '• ' + s.name + '（' + (s.iv||'?') + '/' + (s.ev||'?') + '）— ' + escHtml(s.tm||'');
      }).join('\n') : '✅ 所有船舶海事申报已完成！')
  };
}

async function answerDraft(q, allData, date) {
  if (!allData.length) return { text: '📭 数据库暂无数据。' };

  var shipName = extractShipName(q, allData);
  if (!shipName) return { text: '请指定船名查询吃水信息，例如"仁川协成的吃水"。' };

  var results = findAllShips(shipName, allData);
  if (!results.length) return { text: '❌ 未找到「' + escHtml(shipName) + '」。' };

  var text = '📐 「' + escHtml(shipName) + '」吃水记录\n\n';
  text += '| 日期 | 抵港吃水 | 离港吃水 | 航次 |\n|------|------|------|------|\n';
  results.forEach(function(s) {
    text += '| ' + s.date + ' | ' + (s.arV != null ? s.arV + 'm' : '—') + ' | ' + (s.drV != null ? s.drV + 'm' : '—') + ' | ' + (s.iv||'') + '/' + (s.ev||'') + ' |\n';
  });

  return { text: text };
}

async function answerGeneral(q, allData, date, terminal, dates) {
  // 综合查询：尝试匹配船名 + 日期 + 码头
  var shipName = extractShipName(q, allData);

  if (shipName) {
    var results = findAllShips(shipName, allData);
    if (date) results = results.filter(function(s) { return s.date === date; });
    if (results.length === 1) {
      return { text: formatShipDetail(results[0]) };
    } else if (results.length > 1) {
      var t = '🔍 「' + escHtml(shipName) + '」共 **' + results.length + '** 条记录\n\n';
      results.slice(0, 10).forEach(function(s) {
        t += '• ' + s.date + ' | ' + (s.iv||'') + '/' + (s.ev||'') + ' | ' + escHtml(s.tm||'') + ' | ' + escHtml(s.pp||'') + '→' + escHtml(s.np||'') + '\n';
      });
      if (results.length > 10) t += '• ...共' + results.length + '条';
      return { text: t };
    }
  }

  /* ═══ 人性化智能回复 ═══ */
  var conv = smartReply(q, allData, dates);
  return { text: conv };
}

/* ═══════════════════════════════════════════════════
   上海港船舶知识库 + 人性化对话引擎
   ═══════════════════════════════════════════════════ */

var SHANGHAI_PORT_DB = {
  terminals: {
    '洋山深水港': '上海国际航运中心核心港区，全球最大自动化集装箱码头所在地。洋山一期至四期共16个深水泊位，水深15-17m，可停靠全球最大24000TEU集装箱船。',
    '洋山四期': '全球最大全自动化码头，7个泊位，年吞吐能力630万TEU，全部采用无人驾驶AGV和自动化岸桥。',
    '外高桥': '上海港主力集装箱港区，外高桥一期至五期共15个泊位，水深12-13m，主营近洋和沿海集装箱业务。',
    '宝山': '长江口内港区，主营散杂货、矿石、钢材等。水深10-12m，适合3-5万吨级船舶靠泊。',
    '浦东': '黄浦江沿岸码头群，主营件杂货和近洋集装箱。水深8-10m，限吃水10m以下船舶。',
    '罗泾': '煤炭矿石专用码头，水深11m，年吞吐能力5000万吨。',
    '军工路': '件杂货和钢材码头，水深9m，主要服务长三角内河转运。'
  },
  procedures: {
    '靠泊流程': '1.船东/代理向港务局申报预抵 → 2.港务局分配泊位 → 3.引航站安排引航员 → 4.拖轮协助靠泊 → 5.系缆完毕开始作业。一般提前24小时申报。',
    '离泊流程': '1.货物作业完毕 → 2.申请引航员和拖轮 → 3.港务局批准离泊 → 4.解缆离泊。洋山港需提前4小时申请。',
    '海事申报': '船舶到港前7日内向海事局提交《国际航行船舶进口岸申请书》，包含船舶资料、船员名单、货物信息、上一港和下一港等。',
    '代理费': '船舶代理费通常包括：代理服务费、港务费、引航费、拖轮费、系解缆费、垃圾处理费等。上海港按船舶净吨计收。'
  },
  faq: {
    '吃水限制': '洋山港最大吃水16.5m（洋山3#17m），外高桥12.5m，宝山12m，浦东10m。超吃水船舶需候潮进港，一般在潮高最大前1小时通过浅水区。',
    '引航': '外国籍船舶和超过一定尺度的中国籍船舶必须强制引航。上海港引航站24小时服务，引航员在长江口引航站登轮。',
    '潮汐': '上海港为半日潮港，每天两次高潮两次低潮。洋山港平均潮差3.5m，最大潮差5.5m。外高桥平均潮差2.5m。',
    '锚地': '上海港主要锚地：长江口1号2号锚地（待泊）、绿华山锚地（过驳减载）、洋山锚地（待泊）、南槽锚地、宝山锚地。锚地等候时间视泊位情况，通常1-3天。',
    '台风': '上海港台风季7-9月。台风预警期间：黄色预警时码头停止新靠泊，橙色预警时已靠船舶加缆，红色预警时所有船舶离泊避风。',
    '船舶类型': '集装箱船（LOA 100-400m）、散货船（3-35万吨级）、油轮、滚装船（汽车运输）、邮轮（海洋光谱号、爱达魔都号常靠上海）。',
    '洋山特殊综合保税区': '洋山特殊综保区2020年挂牌，全国唯一特殊综保区。区内企业享受保税、免税、退税等政策，适合国际中转和分拨业务。'
  }
};

/* ═══ 人性化话术引擎 ═══ */
function smartReply(q, allData, dates) {
  var low = q.toLowerCase().trim();

  /* 问候 */
  if (/^(你好|hi|hello|哈喽|嗨|早上好|下午好|晚上好|在吗|在不在)/.test(low)) {
    return pick([
      '您好呀！⚓ 我是调度精灵助手，上海港船舶调度的小帮手~\n\n有什么可以帮您的？查船期、看天气、问潮汐、了解港口信息，随时问我！',
      '嗨！👋 我在呢~\n\n查船舶数据、问港口情况、看海事申报进展，我都能帮上忙。尽管问吧！',
      '您好！😊 调度精灵AI已就位。\n\n不管您是要查某艘船的动态，还是想了解上海港的情况，直接说就行～'
    ]);
  }

  /* 感谢 */
  if (/谢谢|感谢|多谢|辛苦了|真棒|很好/.test(low)) {
    return pick([
      '不客气！😊 能帮到您我也开心～还有什么需要查的吗？',
      '应该的！⚓ 调度工作本来就忙，能帮一点是一点。还有其他问题吗？',
      '谢谢您的认可！💪 继续努力，有问题随时找我～'
    ]);
  }

  /* 再见 */
  if (/再见|拜拜|bye|晚安|明天见/.test(low)) {
    return pick([
      '再见！祝您工作顺利，航行安全！⚓🌊',
      '拜拜～有需要随时回来找我，我一直在这里！👋',
      '好的，您先忙～调度精灵随时待命！⚓'
    ]);
  }

  /* 帮助 */
  if (/帮(助|我)|能.*做什么|功能|怎么用|你会什么/.test(low)) {
    var h = '🚢 **我能帮您这些**：\n\n';
    h += '📋 **船舶查询** — 按船名、日期、航次、码头查船期\n';
    h += '🌊 **港口信息** — 洋山/外高桥/宝山/浦东各港区详情\n';
    h += '🌤️ **水文气象** — 潮汐、风力、能见度实时数据\n';
    h += '📊 **数据统计** — 数据库概况、海事申报进度\n';
    h += '💬 **随便聊聊** — 问好、咨询流程、了解港口知识\n\n';
    h += '💡 试试这些：\n• "今天有哪些船？"\n• "洋山港潮汐"\n• "仁川协成的信息"\n• "靠泊流程是什么？"';
    return h;
  }

  /* 上海港相关 */
  if (/上海港|港口介绍|港区|码头.*介绍/.test(low)) {
    var port = pick(['洋山深水港','外高桥','宝山','浦东']);
    var info = SHANGHAI_PORT_DB.terminals[port] || '';
    return '📍 **上海港**是中国最大、全球最繁忙的集装箱港口。\n\n拿' + port + '来说：\n' + info + '\n\n💡 想了解其他港区，直接问"洋山港"或"外高桥"就行～';
  }

  /* 船舶流程类 */
  if (/靠泊|怎么.*靠|如何.*泊|靠港/.test(low)) {
    return '⚓ **靠泊流程**\n\n' + SHANGHAI_PORT_DB.procedures['靠泊流程'] + '\n\n💡 想了解离泊流程也可以问我～';
  }
  if (/离泊|离港|怎么.*离|开航|出发/.test(low)) {
    return '⚓ **离泊流程**\n\n' + SHANGHAI_PORT_DB.procedures['离泊流程'];
  }
  if (/申报|海事.*怎么|怎么.*申报/.test(low)) {
    return '📋 **海事申报**\n\n' + SHANGHAI_PORT_DB.procedures['海事申报'] + '\n\n💡 在「海事申报」Tab可以查看每条船的申报状态～';
  }
  if (/代理费|费用|收费/.test(low)) {
    return '💰 **船舶代理费**\n\n' + SHANGHAI_PORT_DB.procedures['代理费'] + '\n\n💡 具体费用以港务局和引航站账单为准。';
  }

  /* 吃水/水深 */
  if (/吃水|水深|多少.*米|最大.*吃/.test(low)) {
    return '📐 **上海港吃水限制**\n\n' + SHANGHAI_PORT_DB.faq['吃水限制'];
  }

  /* 锚地/台风/引航等FAQ */
  if (/锚地|在哪.*等/.test(low)) {
    return '⚓ **上海港锚地**\n\n' + SHANGHAI_PORT_DB.faq['锚地'];
  }
  if (/台风|大风|防台/.test(low)) {
    return '🌀 **台风应对**\n\n' + SHANGHAI_PORT_DB.faq['台风'] + '\n\n⚠ 安全第一，台风季请密切关注气象预警！';
  }
  if (/引航|引水/.test(low)) {
    return '🧑‍✈️ **引航服务**\n\n' + SHANGHAI_PORT_DB.faq['引航'];
  }
  if (/船型|船.*类型|集装|散货|邮轮/.test(low)) {
    return '🚢 **船舶类型**\n\n' + SHANGHAI_PORT_DB.faq['船舶类型'];
  }
  if (/保税|综保|洋山.*特殊/.test(low)) {
    return '🏢 **洋山特殊综合保税区**\n\n' + SHANGHAI_PORT_DB.faq['洋山特殊综合保税区'];
  }

  /* 完全没有匹配 — 友好兜底 */
  if (!allData.length) {
    return pick([
      '嗯...这个问题我暂时没有找到相关数据呢 😅\n\n目前数据库还没有船舶记录，建议先上传船期表哦～上传后我可以帮您查船名、航次、吃水、航线等各种信息！\n\n💡 试试问我："洋山港潮汐"、"靠泊流程"、"上海港有哪些码头"',
      '抱歉，数据库还是空的 📭\n\n不过关于上海港的知识我倒是懂不少～比如潮汐、码头分布、靠泊流程这些，随时可以问我！'
    ]);
  }

  return pick([
    '这个问题我不太确定呢～但我可以帮您查这些：\n\n🚢 船舶动态（说船名或日期就行）\n🌊 港口水文（潮汐/天气/水深）\n📋 海事申报进度\n💡 港口流程知识\n\n要不试试？😊',
    '嗯...没找到直接匹配的信息 🤔\n\n不如换个方式问我？比如：\n• "今天有哪些船？"\n• "洋山港水深多少？"\n• "靠泊需要什么流程？"\n\n我很乐意帮您～',
    '这个问题超出我的知识范围啦，但我对上海港调度业务很熟！\n\n要不要查查今天的船期？或者了解港口信息？直接说"船舶动态"或"港口情况"就行～'
  ]);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatShipDetail(s) {
  var mapInfo = SHIP_MAP[s.name] || {};
  var enName = s.en || mapInfo.en || '';
  var imo = mapInfo.imo || '';

  var t = '🚢 **' + escHtml(s.name) + '**';
  if (enName) t += ' / ' + enName;
  if (imo) t += ' [IMO:' + imo + ']';
  t += '\n\n';

  t += '| 参数 | 详情 |\n|------|------|\n';
  t += '| 📅 日期 | ' + s.date + ' |\n';
  t += '| 🔢 航次 | 进' + (s.iv||'—') + ' / 出' + (s.ev||'—') + ' |\n';
  t += '| 🏗️ 码头 | ' + escHtml(s.tm||'—') + ' |\n';
  t += '| 📐 抵港吃水 | ' + (s.arV != null ? s.arV + 'm' : '—') + ' |\n';
  t += '| 📐 离港吃水 | ' + (s.drV != null ? s.drV + 'm' : '—') + ' |\n';
  t += '| 🗺️ 航线 | ' + escHtml(s.pp||'—') + ' → ' + escHtml(s.np||'—') + ' |\n';
  t += '| ⏰ ETA | ' + (s.eta ? escHtml(s.eta) : '—') + ' |\n';
  t += '| 📝 备注 | ' + escHtml(s.rm||'—') + ' |\n';
  if (s.maritime7) t += '| ✅ 海事申报 | 已完成' + (s.maritime7By ? ' · ' + escHtml(s.maritime7By) : '') + ' |\n';

  return t;
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ═══ 聊天 UI ═══ */
var AI_QUICK_QUERIES = [
  { label: '📅 最新船期', q: '今天有哪些船？' },
  { label: '🔍 查某艘船', q: '查询仁川协成' },
  { label: '🌊 洋山潮汐', q: '洋山港今天的潮汐情况' },
  { label: '🌤️ 天气评估', q: '现在天气适合靠泊吗？' },
  { label: '📊 数据统计', q: '数据库一共有多少条记录？' },
  { label: '📋 海事申报', q: '最近的海事申报完成情况' },
];

var _aiInitialized = false;

function initAIAssistant() {
  var chat = document.getElementById('aiChatMessages');
  if (!chat) return;

  // 渲染快捷提问
  var chipsEl = document.getElementById('aiQuickChips');
  if (chipsEl) {
    chipsEl.innerHTML = '';
    AI_QUICK_QUERIES.forEach(function(item) {
      var chip = document.createElement('span');
      chip.className = 'ai-chip';
      chip.textContent = item.label;
      chip.addEventListener('click', function() {
        document.getElementById('aiInput').value = item.q;
        aiSend();
      });
      chipsEl.appendChild(chip);
    });
  }

  // 发送按钮
  var sendBtn = document.getElementById('aiSendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', aiSend);
  }

  // 回车发送
  var input = document.getElementById('aiInput');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); }
    });
  }

  // 更新统计
  updateAIStats();

  // 初始欢迎消息（仅首次）
  if (!_aiInitialized) {
    _aiInitialized = true;
    setTimeout(welcomeMessage, 600);
  }
}

function welcomeMessage() {
  var chat = document.getElementById('aiChatMessages');
  if (!chat) return;

  /* 先显示检测中 */
  updateLLMStatusUI();
  /* 异步检测连接 */
  checkLLMConnection();

  var brain = hasLLMKey() ? '🧠 DeepSeek大模型 · 智能对话' : '💾 本地引擎（点击 ⚙️ 配置 DeepSeek API Key）';
  var text = '您好！我是 **调度精灵 AI 助手** ⚓\n\n' +
    '当前模式：**' + brain + '**\n\n' +
    '🔍 **船舶查询**：默认返回最新日期数据\n' +
    '🌤️ **天气水文**：Open-Meteo实时气象 + 港口知识库\n' +
    '📍 **港口信息**：洋山、外高桥、宝山、浦东\n\n' +
    '👈 点击下方快捷提问，或直接输入您的问题。';

  addAIMessage(text);
}

function aiSend() {
  var input = document.getElementById('aiInput');
  var q = input.value.trim();
  if (!q) return;
  input.value = '';

  addUserMessage(q);

  // 显示打字中
  var typingEl = addTypingIndicator();

  aiQuery(q).then(function(result) {
    removeTypingIndicator(typingEl);
    addAIMessage(result.text);
  }).catch(function(err) {
    removeTypingIndicator(typingEl);
    addAIMessage('⚠️ 查询出错：' + err.message + '\n\n请检查数据库是否已初始化，或刷新页面重试。');
  });
}

function addUserMessage(text) {
  var chat = document.getElementById('aiChatMessages');
  var div = document.createElement('div');
  div.className = 'ai-msg ai-msg-user';
  div.innerHTML = '<div class="ai-bubble ai-bubble-user">' + formatAIText(text) + '</div>' +
    '<span class="ai-time">' + new Date().toTimeString().slice(0,5) + '</span>';
  chat.appendChild(div);
  scrollChat();
}

function addAIMessage(text) {
  var chat = document.getElementById('aiChatMessages');
  var div = document.createElement('div');
  div.className = 'ai-msg ai-msg-bot';
  div.innerHTML = '<div class="ai-avatar">⚓</div>' +
    '<div class="ai-bubble ai-bubble-bot">' + formatAIText(text) + '</div>' +
    '<span class="ai-time">' + new Date().toTimeString().slice(0,5) + '</span>';
  chat.appendChild(div);
  scrollChat();
}

function addTypingIndicator() {
  var chat = document.getElementById('aiChatMessages');
  var div = document.createElement('div');
  div.className = 'ai-msg ai-msg-bot ai-typing';
  div.innerHTML = '<div class="ai-avatar">⚓</div>' +
    '<div class="ai-bubble ai-bubble-bot"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>';
  chat.appendChild(div);
  scrollChat();
  return div;
}

function removeTypingIndicator(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function formatAIText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/\| (.+) \|/g, function(m) {
      return '<span class="ai-table-row">' + m + '</span>';
    });
}

function scrollChat() {
  var chat = document.getElementById('aiChatMessages');
  if (chat) {
    setTimeout(function() { chat.scrollTop = chat.scrollHeight; }, 50);
  }
}

/* ═══ AI配置面板 ═══ */
function toggleAIConfig() {
  var panel = document.getElementById('aiConfigPanel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  var input = document.getElementById('aiApiKey');
  if (input && panel.style.display !== 'none') {
    input.value = LLM_CONFIG.apiKey;
    input.focus();
  }
}

function saveAIConfig() {
  var input = document.getElementById('aiApiKey');
  var hint = document.getElementById('aiConfigHint');
  var key = input ? input.value.trim() : '';
  if (key) {
    setLLMKey(key);
    if (hint) { hint.textContent = '✅ DeepSeek大模型已启用'; hint.style.color = '#16A34A'; }
    setTimeout(function() {
      var panel = document.getElementById('aiConfigPanel');
      if (panel) panel.style.display = 'none';
    }, 800);
  } else {
    localStorage.removeItem('llm_key');
    LLM_CONFIG.apiKey = '';
    if (hint) { hint.textContent = '已清除Key，使用本地引擎'; hint.style.color = '#64748B'; }
  }
}

/* 初始化时恢复已保存的Key */
(function() {
  var saved = localStorage.getItem('llm_key');
  if (saved) LLM_CONFIG.apiKey = saved;
})();

/* initAIAssistant() 由 app.js 启动代码调用，确保 db 已就绪 */
