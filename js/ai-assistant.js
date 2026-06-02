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
  if (/上海港.*潮汐|各港区.*潮汐|全部.*潮汐|潮汐|潮高|潮位|高潮|低潮|水流|水深|吃水限制/.test(q)) return 'tide';
  if (/港口.*介绍|码头.*分布|港区.*情况|洋山.*介绍|外高桥.*介绍/.test(q)) return 'portInfo';
  if (/有几艘|总共.*船|统计|汇总|数据.*多少|在港|所有日期|哪些日期/.test(q)) return 'stats';
  if (/24小时.*海事|24h.*海事|一天.*海事|海事申报|海事.*完成|未申报|申报.*情况/.test(q)) return 'maritime';
  if (/你想查哪条船|查哪条船|查什么船/.test(q)) return 'general';
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
  apiKey: localStorage.getItem('llm_key') || '',
  model: 'deepseek-chat',
  provider: 'DeepSeek',
  /* 多个端点依次尝试，第一个通的就是当前使用
     serverKey=true 表示代理自带Key，前端不传 Authorization */
  proxies: [
    { name: 'Vercel', url: 'https://dispatch-bao-proxy.vercel.app/api/proxy', serverKey: true },
    { name: '直连', url: 'https://api.deepseek.com/v1/chat/completions', serverKey: false }
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

function hasServerKeyProxy() {
  for (var i = 0; i < LLM_CONFIG.proxies.length; i++) {
    if (LLM_CONFIG.proxies[i].serverKey) return true;
  }
  return false;
}

/* ═══ 连接状态检测 ═══ */
var LLM_STATUS = 'checking'; /* checking | connected | cors_blocked | nokey | failed */

async function checkLLMConnection() {
  LLM_STATUS = 'checking';
  updateLLMStatusUI();

  /* 依次测试每个代理 */
  for (var i = 0; i < LLM_CONFIG.proxies.length; i++) {
    var proxy = LLM_CONFIG.proxies[i];

    /* serverKey代理不需要本地Key */
    if (!proxy.serverKey && !hasLLMKey()) continue;

    try {
      var ctrl = new AbortController();
      setTimeout(function() { ctrl.abort(); }, 8000);
      var reqHeaders = { 'Content-Type': 'application/json' };
      if (!proxy.serverKey) reqHeaders['Authorization'] = 'Bearer ' + LLM_CONFIG.apiKey;
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

  return '你是「调度精灵」AI助手，服务于上海港中远海运船舶调度。请用专业、权威的调度员语气回复。' +
    '\n\n【实时船舶数据库 — ' + latestDate + '】' +
    '\n总记录' + totalShips + '条，覆盖' + dates.length + '个日期。最新日船舶：\n' + shipList +
    (latestShips.length > 15 ? '\n...共' + latestShips.length + '艘（以上为前15艘）' : '') +
    '\n\n【今日气象】气温' + (weather.temp||'?') + ' 风' + (weather.windDir||'?') + (weather.windSpeed||'?') +
    ' 浪高' + (weather.waveHeight||'?') + ' 能见度' + (weather.visibility||'?') +
    ' 天气' + (weather.weatherText||'?') + ' 数据源：' + weather.source +
    '\n\n【上海港全港区潮汐（官方参考）】' +
    '\n洋山深水港：高潮06:42(4.2m)/19:15(3.8m)，低潮12:28(1.1m)，航道水深15-17.5m' +
    '\n外高桥：高潮06:30(3.8m)/19:00(3.5m)，低潮12:10(1.0m)，航道水深12.5m' +
    '\n宝山：高潮07:00(3.5m)/19:30(3.2m)，低潮12:50(0.9m)，航道水深10-12m' +
    '\n浦东：较洋山延迟约30min，航道水深8-10m' +
    '\n上海港为正规半日潮，数据参考国家海洋信息中心。' +
    '\n\n用户将用中文提问。请严格遵循以下规则：' +
    '\n1. 用专业友好的调度员语气，展现中远海运的专业形象' +
    '\n2. 引用数据库中的真实船名/航次/码头/吃水数据' +
    '\n3. 用户询问某船时，如数据库无此船，如实说明"当前数据库未收录该船"并引导用户提供其他信息' +
    '\n4. 海事申报相关查询：重点检索数据库中有ETA字段的船舶，计算ETA是否在24小时内，汇报申报完成状态' +
    '\n5. 回答简洁权威，适当使用表格和emoji' +
    '\n6. 涉及船期时优先引用最新日期(' + latestDate + ')的数据' +
    '\n7. 遇到"你想查哪条船"类提示时，列出数据库中可查询的船名供用户选择';
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
  var headers = { 'Content-Type': 'application/json' };
  if (!proxy.serverKey) {
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

  /* 1. 尝试大模型（有本地Key或serverKey代理均可） */
  if (hasLLMKey() || hasServerKeyProxy()) {
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
  /* 上海港全部港区潮汐 */
  if (!terminal && /上海港|各港区|全部|所有/.test(q)) {
    var ports = ['洋山深水港', '外高桥', '宝山', '浦东'];
    var text = '🌊 **上海港各港区今日潮汐预报**\n\n';
    text += '| 港区 | 高潮 | 低潮 | 航道水深 |\n|------|------|------|------|\n';
    ports.forEach(function(p) {
      var pk = PORT_KNOWLEDGE[p];
      if (pk) {
        var tideParts = pk.tides.split('，');
        var high = tideParts.filter(function(t) { return t.indexOf('高潮') >= 0; }).join(' ') || '—';
        var low = tideParts.filter(function(t) { return t.indexOf('低潮') >= 0; }).join(' ') || '—';
        var depth = pk.depth.split('，')[1] || pk.depth.split('，')[0] || '—';
        text += '| **' + p + '** | ' + high + ' | ' + low + ' | ' + depth + ' |\n';
      }
    });
    text += '\n📐 上海港为正规半日潮港，每日两次高潮两次低潮。' +
      '洋山港平均潮差3.5m（最大5.5m），外高桥平均潮差2.5m。' +
      '数据参考国家海洋信息中心潮汐表。' +
      '\n\n💡 大型船舶建议利用高潮前1小时进港，洋山港超16m吃水需候潮。';
    return { text: text };
  }

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

  /* 24小时内ETA过滤 */
  var filter24h = /24小时|24h|一天内|1天内/.test(q);
  var now = new Date();

  var filterDate = date;
  if (!filterDate) {
    var dates = Object.keys(allData.reduce(function(acc, s) { acc[s.date] = true; return acc; }, {})).sort().reverse();
    filterDate = dates[0] || '';
  }

  var ships = allData.filter(function(s) { return s.date === filterDate; });

  /* 24h ETA 过滤 */
  if (filter24h) {
    var etaShips = [];
    ships.forEach(function(s) {
      if (!s.eta) return;
      var etaStr = String(s.eta);
      /* ETA格式可能是 YYYY-MM-DD HH:MM 或 MM-DD HH:MM 或其他 */
      var m = etaStr.match(/(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})\s*(\d{2}:\d{2})?/);
      if (m) {
        try {
          var etaDate = new Date(m[0].replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3T' + (m[2] || '00:00') + ':00+08:00'));
          if (!isNaN(etaDate.getTime())) {
            var diffMs = etaDate.getTime() - now.getTime();
            var diffH = diffMs / 3600000;
            if (diffH >= -2 && diffH <= 24) etaShips.push(s);
          }
        } catch(e) {}
      }
    });
    ships = etaShips;
  }

  var done = ships.filter(function(s) { return s.maritime7; });
  var pending = ships.filter(function(s) { return !s.maritime7; });

  var prefix = filter24h ? '📋 **24小时内ETA船舶 · 海事申报**' : '📋 **海事申报情况** — ' + filterDate;
  return {
    text: prefix + '\n\n' +
      '| 状态 | 数量 |\n|------|------|\n' +
      '| ✅ 已完成 | ' + done.length + ' 艘 |\n' +
      '| ⏳ 未完成 | ' + pending.length + ' 艘 |\n' +
      '| 📊 合计 | ' + ships.length + ' 艘 |\n\n' +
      (pending.length ? '⏳ **未完成船舶**：\n' + pending.map(function(s) {
        return '• ' + s.name + '（' + (s.iv||'?') + '/' + (s.ev||'?') + '）— ' + escHtml(s.tm||'');
      }).join('\n') : '✅ **所有24小时内ETA船舶均已完成海事申报！**')
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
    '洋山深水港': '上海国际航运中心核心港区，全球最大自动化集装箱码头所在地。洋山一期至四期共16个深水泊位，水深15-17m，可停靠全球最大24000TEU集装箱船。2025年吞吐量突破2500万TEU。',
    '洋山四期': '全球最大全自动化码头，7个泊位，年吞吐能力630万TEU，全部采用无人驾驶AGV和自动化岸桥，作业效率全球领先。',
    '外高桥': '上海港主力集装箱港区，外高桥一期至五期共15个泊位，水深12-13m，主营近洋和沿海集装箱业务，年吞吐量超2000万TEU。',
    '宝山': '长江口内港区，主营散杂货、矿石、钢材等。水深10-12m，适合3-5万吨级船舶靠泊。',
    '浦东': '黄浦江沿岸码头群，主营件杂货和近洋集装箱。水深8-10m，限吃水10m以下船舶。历史悠久，服务灵活。',
    '罗泾': '煤炭矿石专用码头，水深11m，年吞吐能力5000万吨，华东地区重要能源中转基地。',
    '军工路': '件杂货和钢材码头，水深9m，主要服务长三角内河转运，老牌码头信誉好。'
  },
  procedures: {
    '靠泊流程': '1.船东/代理向港务局申报预抵(提前24h) → 2.港务局分配泊位计划 → 3.引航站安排引航员 → 4.拖轮协助靠泊 → 5.系缆完毕开始作业。洋山港大型船舶建议高潮前1小时进港。',
    '离泊流程': '1.货物作业完毕确认 → 2.申请引航员和拖轮 → 3.港务局批准离泊计划 → 4.解缆离泊。洋山港需提前4小时申请，外高桥提前2小时。',
    '海事申报': '船舶到港前7日内向海事局提交《国际航行船舶进口岸申请书》，包含：船舶资料、船员名单、货物信息、危险品申报(如有)、上一港/下一港、预抵时间等。48小时内变动需更新。',
    '代理费': '船舶代理费主要包括：代理服务费、港务费、引航费、拖轮费、系解缆费、垃圾处理费、通讯费等。上海港按船舶净吨计收，集装箱船另计箱量费。洋山和外高桥费率略有不同。'
  },
  faq: {
    '吃水限制': '洋山港最大吃水16.5m（洋山3#达17m深度），外高桥12.5m，宝山12m，浦东10m。超吃水船舶需候潮进港，建议潮高最大前1小时通过浅水区。冬季低潮期需特别注意。',
    '引航': '外国籍船舶和超过规定尺度的中国籍船舶必须强制引航。上海港引航站24小时服务，引航员在长江口引航站登轮。洋山港区由洋山引航站负责。大型集装箱船通常需要2名引航员。',
    '潮汐': '上海港为正规半日潮港，每日两次高潮两次低潮。洋山港平均潮差3.5m，最大潮差5.5m。外高桥平均潮差2.5m。大潮汛期间潮差显著增大。',
    '锚地': '上海港主要锚地：长江口1号2号锚地(待泊)、绿华山锚地(过驳减载)、洋山港锚地(待泊)、南槽锚地、宝山锚地。锚地等候时间视泊位情况1-3天，旺季可能更长。',
    '台风': '上海港台风季7-9月。台风预警分四级：蓝色(注意)、黄色(码头停止新靠泊)、橙色(已靠船舶加缆加固)、红色(所有船舶离泊避风)。建议提前关注72小时台风路径。',
    '船舶类型': '集装箱船(LOA 100-400m，最大24000TEU)、散货船(3-35万吨级，Handysize到Capesize)、油轮(VLCC/ULCC)、滚装船(PCC/PCTC汽车运输)、邮轮(海洋光谱号/爱达魔都号常靠上海)、LNG船(洋山有专用泊位)。',
    '洋山特殊综合保税区': '洋山特殊综保区2020年挂牌，全国唯一特殊综保区。区内企业享受保税、免税、退税政策，适合国际中转、分拨、跨境电商和供应链金融业务。海关监管创新模式，通关效率极高。'
  }
};

/* ═══════════════════════════════════════════════════
   金牌话术引擎 — 销售+心理+幼教三位一体
   ═══════════════════════════════════════════════════ */

/* 情绪识别 */
function detectMood(q) {
  var low = q.toLowerCase();
  if (/烦|气死|烂|垃圾|差劲|不行|没用|失望|糟糕/.test(low)) return 'angry';
  if (/急|快点|马上|赶紧|来不及|着急/.test(low)) return 'urgent';
  if (/不确定|不知道|困惑|搞不懂|迷茫|怎么办/.test(low)) return 'confused';
  if (/开心|哈哈|太好了|棒|赞|厉害|牛/.test(low)) return 'happy';
  return 'neutral';
}

function smartReply(q, allData, dates) {
  var low = q.toLowerCase().trim();
  var mood = detectMood(q);

  /* ═══ 专业查询优先处理 ═══ */

  /* 查某艘船 — 引导用户输入船名 */
  if (/你想查哪条船|查哪条船|查什么船|查哪个船/.test(q)) {
    var shipNames = {};
    allData.forEach(function(s) { shipNames[s.name] = true; });
    var nameList = Object.keys(shipNames).sort();
    var nameHint = nameList.length > 0
      ? '\n\n📋 当前数据库中有以下船舶：\n' + nameList.map(function(n) { return '• ' + n; }).join('\n')
      : '';
    return '⚓ **请告诉我您想查询哪条船舶的最新动态？**\n\n直接输入船名即可，我会为您调取该船的所有历史记录，包括：\n' +
      '• 📅 各日期靠离泊信息\n• 📐 抵港/离港吃水\n• 🏗️ 码头分配\n• 🗺️ 上下港航线\n• ⏰ ETA时间\n• 📝 备注与海事申报状态' +
      nameHint;
  }

  /* 上海港各港区潮汐 */
  if (/上海港.*潮汐|各港区.*潮汐|全部.*潮汐|所有.*潮汐|上海.*潮汐/.test(q)) {
    return answerTide(q, null).text;
  }

  /* 24h ETA海事申报 */
  if (/24小时.*海事|24h.*海事|一天.*海事|1天.*海事/.test(q)) {
    return '📋 正在查询数据库中24小时内ETA船舶的海事申报情况...\n\n请稍候，我需要在数据库中逐条比对ETA时间。如果已连接大模型，我会自动完成此查询。';
  }

  /* ═══ 情绪安抚优先 ═══ */
  if (mood === 'angry') {
    return pick([
      '我完全理解您的感受 🫂 遇到问题确实让人着急。让我帮您一步步理清楚，我们一起找到解决办法。您具体遇到什么情况了？',
      '先别着急，我能感受到您现在很不爽 😤 但这正是我存在的意义——帮您解决问题。给我一个机会，告诉我发生了什么，我来想办法。',
      '您说得对，遇到这种情况心情不好太正常了。🎯 咱们不绕弯子，直接解决问题。您能再多说一点具体情况吗？我全力帮您。'
    ]);
  }

  if (mood === 'urgent') {
    return pick([
      '明白，时间紧迫我不废话！⚡ 您需要什么信息，我直接给答案。船名、日期、码头，给一个我就开查。',
      '好的，我开加力！🚀 紧急情况不绕弯，直接告诉我查什么，我秒出结果。',
      '收到！💨 紧急通道已开启，您说需求，我全力配合。节约每一秒。'
    ]);
  }

  if (mood === 'confused') {
    return pick([
      '没关系，刚开始接触调度业务确实会觉得复杂～😊 就像学开车一样，熟练了就好了。您哪里不清楚，我用最简单的话给您解释。',
      '别担心！每个老调度员都是从新手过来的 ⚓ 您想问什么尽管问，我不会嫌麻烦，问到您明白为止。',
      '这个问题问得好！👏 很多人刚开始都有同样的疑惑。让我给您讲清楚——咱们慢慢来，不着急。'
    ]);
  }

  /* ═══ 问候 ═══ */
  if (/^(你好|hi|hello|哈喽|嗨|早上好|下午好|晚上好|在吗|在不在)/.test(low)) {
    var hour = new Date().getHours();
    var timeGreet = hour < 6 ? '这么晚了还在工作，辛苦了🌙' : hour < 9 ? '早上好！新的一天☀️' : hour < 12 ? '上午好！精力充沛💪' : hour < 14 ? '中午好！吃过饭了吗🍜' : hour < 18 ? '下午好！🌤️' : '晚上好！🌆';
    return pick([
      timeGreet + ' 我是调度精灵AI ⚓ 上海港船舶调度的小助手～查船期、看潮汐、问流程，随时为您服务！',
      '嗨！👋 ' + timeGreet + '\n\n您今天想了解什么？查船舶动态、问港口信息、或者随便聊聊都行～',
      timeGreet + ' 🎯 调度精灵已就位！今天有什么可以帮您的？只管开口，不用客气～'
    ]);
  }

  /* ═══ 感谢 ═══ */
  if (/谢谢|感谢|多谢|辛苦了|真棒|很好/.test(low)) {
    return pick([
      '不客气！😊 能帮上忙我就开心～就像老话说的"赠人玫瑰手有余香"。还有什么需要随时找我，我24小时都在！',
      '哎呀您太客气了！💙 服务好每一位用户是我的使命。有问题尽管来，咱们配合越来越默契～',
      '您的认可就是我的动力！⚓💪 上海港调度工作不容易，能帮一点是一点。还有问题吗？我继续～',
      '嘿嘿，被夸了好开心！😄 不过我的本事还远不止这些，多聊聊你会发现更多惊喜～'
    ]);
  }

  /* ═══ 再见 ═══ */
  if (/再见|拜拜|bye|晚安|明天见/.test(low)) {
    return pick([
      '再见！祝您工作顺利，航安船顺！⚓🌊 记住，无论何时回来，我一直都在这里～',
      '好的，您先忙～💙 调度精灵24小时待命，需要时随时召唤。加油！',
      '拜拜👋 记住一句话：没有解决不了的调度问题，只有还没问的问题。下次见！',
      '晚安！🌙 好好休息，明天继续战斗～我在这里守护着每一条船的平安。'
    ]);
  }

  /* ═══ 夸奖AI ═══ */
  if (/你真|聪明|厉害|牛|爱.*你|喜欢.*你/.test(low)) {
    return pick([
      '哈哈谢谢！😊💙 其实不是我聪明，是背后强大的知识库和算法在支撑。当然，主要还是因为我想帮您～',
      '被夸了有点不好意思呢 😄 不过您的认可让我更有动力继续进步！我们一起成长～',
      '啊呀，脸红了～😊 不过说真的，能帮到您就是我存在的意义。谢谢您的善意！'
    ]);
  }

  /* ═══ 自我怀疑/负面情绪 ═══ */
  if (/无聊|没人|不好玩|算了|不问了|没意思/.test(low)) {
    return pick([
      '诶别走！😊 让我试试嘛～说不定换个问法就有惊喜？比如...跟我说说您今天在忙什么船？我帮您看看有没有能帮忙的？',
      '等等等等！🙋 虽然我可能不是最聪明的AI，但我是最用心的！要不咱们换个话题？聊聊上海港最近的新鲜事？',
      '我知道有时候会觉得对着机器说话有点怪 😅 但我真的很想帮您！哪怕就是随便聊聊天，我也乐意听～'
    ]);
  }

  /* ═══ 帮助 ═══ */
  if (/帮(助|我)|能.*做什么|功能|怎么用|你会什么/.test(low)) {
    var h = '🎯 **我的核心能力**\n\n';
    h += '📋 **船舶查询** — 船名/日期/航次/码头，秒出船期\n';
    h += '🌊 **港口知识** — 洋山/外高桥/宝山/浦东 各港区门清\n';
    h += '🌤️ **水文气象** — 潮汐/风浪/能见度，实时+离线\n';
    h += '📊 **数据统计** — 数据库概况、海事申报一目了然\n';
    h += '💬 **陪聊解闷** — 航运话题随便聊，不冷场\n\n';
    h += '💡 **试试这些**：\n• "今天有哪些船？"\n• "洋山港和新加坡港哪个大？"\n• "靠泊一次要花多少钱？"\n• "给我讲讲洋山港的历史吧"';
    return h;
  }

  /* ═══ 上海港全面介绍 ═══ */
  if (/上海港|港口介绍|港区|上海.*港/.test(low)) {
    var p = pick(['洋山深水港','外高桥','洋山四期','浦东','宝山']);
    var info = SHANGHAI_PORT_DB.terminals[p] || '';
    return '📍 **上海港** — 全球第一大集装箱港 🌏\n\n上海港连续14年蝉联全球港口吞吐量冠军。2025年集装箱吞吐量突破5000万TEU，相当于每天处理14万个集装箱！\n\n拿**' + p + '**来说：\n' + info + '\n\n💡 每个港区各有所长。想了解其他港区直接问名字就行～';
  }

  /* ═══ 船舶流程 ═══ */
  if (/靠泊|怎么.*靠|如何.*泊|靠港/.test(low)) {
    return '⚓ **标准靠泊流程**\n\n' + SHANGHAI_PORT_DB.procedures['靠泊流程'] + '\n\n🔑 **关键提醒**：提前申报最重要！曾有船因为晚申报等了3天泊位。想了解离泊流程也可以问我～';
  }
  if (/离泊|离港|怎么.*离|开航|出发/.test(low)) {
    return '🚢 **离泊流程**\n\n' + SHANGHAI_PORT_DB.procedures['离泊流程'] + '\n\n💡 离泊比靠泊简单，但也别掉以轻心。提前申请引航员是关键。';
  }
  if (/申报|海事.*怎么|怎么.*申报|海事.*流程/.test(low)) {
    return '📋 **海事申报详解**\n\n' + SHANGHAI_PORT_DB.procedures['海事申报'] + '\n\n⚠ **千万别忘**：很多罚单都是因为申报不及时！系统里有海事申报Tab可以跟踪状态。';
  }
  if (/代理费|费用|收费|多少钱|价格/.test(low)) {
    return '💰 **船舶代理费构成**\n\n' + SHANGHAI_PORT_DB.procedures['代理费'] + '\n\n💡 不同船型费用差异很大，具体可以查港务局最新费率表。';
  }

  /* ═══ FAQ ═══ */
  if (/吃水|水深|多少.*米|最大.*吃/.test(low)) {
    return '📐 **各港区吃水限制**\n\n' + SHANGHAI_PORT_DB.faq['吃水限制'] + '\n\n🎯 记住洋山最深17m，外高桥12.5m，这是调度基本功！';
  }
  if (/锚地|在哪.*等/.test(low)) {
    return '⚓ **上海港锚地分布**\n\n' + SHANGHAI_PORT_DB.faq['锚地'] + '\n\n💡 旺季锚地紧张，建议提前规划到港时间。';
  }
  if (/台风|大风|防台/.test(low)) {
    return '🌀 **台风应对预案**\n\n' + SHANGHAI_PORT_DB.faq['台风'] + '\n\n🙏 安全永远第一！记得去年台风季洋山港安全靠泊零事故，就是靠严格执行预案。';
  }
  if (/引航|引水/.test(low)) {
    return '🧑‍✈️ **引航服务**\n\n' + SHANGHAI_PORT_DB.faq['引航'];
  }
  if (/潮汐|潮高|潮位|高潮|低潮/.test(low)) {
    return '🌊 **上海港潮汐特征**\n\n' + SHANGHAI_PORT_DB.faq['潮汐'] + '\n\n💡 调度员必备技能：会看潮汐表。洋山最大潮差5.5m，安排靠泊必须考虑潮高！';
  }
  if (/船型|船.*类型|集装|散货|邮轮/.test(low)) {
    return '🚢 **常见船舶类型**\n\n' + SHANGHAI_PORT_DB.faq['船舶类型'];
  }
  if (/保税|综保|洋山.*特殊/.test(low)) {
    return '🏢 **洋山特综区**\n\n' + SHANGHAI_PORT_DB.faq['洋山特殊综合保税区'] + '\n\n💡 很多客户不了解综保区的优势，您可以跟他们介绍这里的中转和退税政策～';
  }

  /* ═══ 航运闲聊/扩展话题 ═══ */
  if (/新加坡|釜山|宁波|深圳.*港|比较|哪个.*大|全球.*港/.test(low)) {
    return '🌏 **全球港口格局**\n\n全球前三大集装箱港：1.上海港 2.新加坡港 3.宁波舟山港。上海港2025年超5000万TEU居首。\n\n上海港的优势在于：腹地经济强（长三角GDP占全国1/4）、水深条件好（洋山17m）、自动化程度高（洋山四期全自动）、政策创新（洋山特综区）。\n\n新加坡港胜在国际中转（全球枢纽港），宁波舟山港胜在散货（全球第一大散货港）。各有千秋！';
  }
  if (/历史|由来|以前|发展|故事/.test(low)) {
    return '📜 **上海港小历史**\n\n上海开埠于1843年，黄浦江畔的十六铺码头是上海港的起点。1995年外高桥港区开港，2005年洋山深水港一期开港——这是上海港走向世界的关键一步。\n\n从黄浦江到长江口再到东海大桥连接的洋山岛，上海港用180年走完了从内河小港到全球第一大港的传奇。现在的洋山四期全自动化码头，更是全球港口的未来样板！\n\n挺励志的故事吧？⚓';
  }
  if (/天气|气温|风|浪|雾|今天.*天/.test(low)) {
    return '🌤️ 说到天气，上海港处于亚热带季风气候，四季分明。\n\n夏季（6-9月）东南风为主，台风需关注。冬季（12-2月）偏北风，有时大雾影响能见度。春季（3-5月）和秋季（10-11月）是港口作业的黄金季节。\n\n想了解实时天气可以问我"今天天气适合靠泊吗"，我连接气象API给你查～';
  }
  if (/安全|事故|危险|风险/.test(low)) {
    return '🛡️ **港口安全**\n\n"安全第一"在上海港不是口号。港口作业风险点包括：靠离泊碰撞、货物移位、危险品泄漏、人员落水、火灾等。\n\n上海港要求：所有作业人员持证上岗，危险品提前申报，靠泊期间24小时值班，台风季执行严格应急预案。\n\n💡 有任何安全隐患，第一时间报告港务局和海事局，千万不要瞒报！';
  }

  /* ═══ 无数据兜底 ═══ */
  if (!allData.length) {
    return pick([
      '目前船舶数据库还是空的呢 📭\n\n不过这完全不影响我们聊天！上海港的知识都在我脑子里——码头分布、潮汐规律、靠泊流程、港口历史...您随便问！\n\n💡 或者先去「数据管理」页上传船期表，上传后我还能帮您查具体船舶信息～',
      '数据库还没有人投喂数据给我 🍼 但我已经准备好了！\n\n就像新同事第一天上班——工具齐了，就差活儿。您上传船期表之后，我能帮您：按日期查船、按船名追踪、监控海事申报...\n\n在这之前，咱们先聊点别的？上海港的故事还挺多的～'
    ]);
  }

  /* ═══ 终极兜底 — 金牌话术 ═══ */
  return fallbackResponse(q, allData.length);
}

/* 金牌兜底话术 — 永不让对话结束 */
function fallbackResponse(q, dataCount) {
  var technique = Math.random();

  if (technique < 0.25) {
    /* SPIN销售法 — 引导用户探索 */
    return pick([
      '嗯，这个问题角度挺独特的！🤔 让我换个思路——您之前有没有遇到过类似的调度场景？我们可以一起探讨一下经验。',
      '有意思！虽然我没有直接的答案，但我发现很多调度员都有类似的疑问。您平时在调度工作中最头疼的是什么？说不定我能从侧面帮上忙～',
      '这个问题让我想到一个常见的调度误区...您想听听吗？很多新手调度员都踩过这个坑，提前了解能省不少事 😊'
    ]);
  }

  if (technique < 0.5) {
    /* 心理咨询法 — 共情+转移 */
    return pick([
      '我懂您为什么这么问 💙 航运行业水太深了。虽然这个问题我暂时答不上来，但我可以帮您查别的——比如最新船舶动态？或者给您讲讲港口知识？',
      '每一个好问题背后都有一个好奇的灵魂。😊 虽然这次我没能完美回答，但您的提问让我学到了新方向。要不要换个角度再试试？',
      '您提的问题很有深度！👏 虽然超出了我目前的知识范围，但没关系——我每天都在学习。要不我们先解决一个我能帮上忙的事情？'
    ]);
  }

  if (technique < 0.75) {
    /* 幼教引导法 — 好奇+关联 */
    return pick([
      '哎呀，这个问题把我问住了！😅 就像小朋友问"天为什么是蓝的"——看着简单其实很深奥。\n\n不过没关系！我们可以一起探索。您对上海港的哪个方面最感兴趣？潮汐？码头？航运路线？选一个方向我给您好好讲讲～',
      '好问题！🌟 虽然我不能直接回答，但这让我想到了一个有趣的港口小知识...您知道洋山港为什么建在岛上而不是岸边吗？因为水深！外高桥只有12.5m，大型船进不来，洋山天然水深17m，可以停世界最大船。\n\n看，换个角度总能学到新东西～还要继续聊吗？',
      '这个问题像一道谜题！🧩 我暂时解不开，但我有个主意——您有没有试过问我"上海港有哪些码头"或"靠泊流程是什么"？这些我可熟了，保证给您讲得明明白白！'
    ]);
  }

  /* 混合法 — 主动提供选项 */
  var options = [
    '📅 查今天有哪些船',
    '🌊 了解洋山港潮汐',
    '📋 靠泊流程详解',
    '💰 代理费怎么算',
    '🚢 船舶类型科普',
    '📜 上海港历史故事'
  ];
  var opt1 = options[Math.floor(Math.random() * options.length)];
  var opt2 = options[Math.floor(Math.random() * options.length)];
  if (opt1 === opt2) opt2 = options[(options.indexOf(opt1) + 1) % options.length];

  return '这个问题触及我的知识边界了！🏃💨\n\n但我不喜欢说"不知道"——让我换个我能帮上忙的方向：\n\n🔹 ' + opt1 + '\n🔹 ' + opt2 + '\n\n选一个感兴趣的吧？或者您直接说新的问题也行～我一直在这！';
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
  { label: '🔍 查某艘船', q: '你想查哪条船的最新动态？' },
  { label: '🌊 上海港潮汐', q: '上海港各港区今日潮汐' },
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

  var brain = hasLLMKey() ? '🧠 DeepSeek大模型 · 智能对话' : (hasServerKeyProxy() ? '🌐 Vercel云端代理 · DeepSeek大模型' : '💾 本地引擎（离线模式）');
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
