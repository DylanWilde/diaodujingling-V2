/* ═══════════════════════════════════════════════════
   调度精灵 — 上海港海图 (Canvas动画)
   ═══════════════════════════════════════════════════ */

var portChart = null;     // Canvas引用
var portCtx = null;       // 绘图上下文
var portFrame = 0;        // 动画帧计数
var portAnimId = null;    // requestAnimationFrame ID

/* 上海港关键点位 (Canvas坐标系, 800x600画布) */
var PORT_POINTS = {
  /* 码头 */
  terminals: [
    { name: '洋山深水港', x: 620, y: 420, size: 18, color: '#0EA5E9', desc: '深水集装箱枢纽' },
    { name: '洋山四期',   x: 660, y: 390, size: 14, color: '#06B6D4', desc: '全自动化码头' },
    { name: '外高桥一期', x: 480, y: 160, size: 14, color: '#3B82F6', desc: '集装箱/滚装' },
    { name: '外高桥二期', x: 500, y: 190, size: 14, color: '#3B82F6', desc: '集装箱码头' },
    { name: '外高桥三期', x: 520, y: 215, size: 13, color: '#3B82F6', desc: '集装箱码头' },
    { name: '外高桥四期', x: 505, y: 240, size: 13, color: '#2563EB', desc: '多用途码头' },
    { name: '外高桥五期', x: 525, y: 260, size: 13, color: '#2563EB', desc: '集装箱码头' },
    { name: '浦东码头',   x: 380, y: 130, size: 15, color: '#6366F1', desc: '散杂货/集装箱' },
    { name: '宝山码头',   x: 340, y: 60,  size: 14, color: '#8B5CF6', desc: '散货/件杂货' },
    { name: '军工路码头',  x: 360, y: 100, size: 12, color: '#7C3AED', desc: '件杂货/钢材' },
    { name: '罗泾码头',   x: 300, y: 40,  size: 13, color: '#A78BFA', desc: '煤炭/矿石' },
    { name: '张华浜码头',  x: 350, y: 80,  size: 12, color: '#8B5CF6', desc: '件杂货' },
  ],
  /* 锚地 */
  anchorages: [
    { name: '长江口1号锚地', x: 550, y: 80,  size: 10, desc: '大型船舶待泊' },
    { name: '长江口2号锚地', x: 580, y: 100, size: 10, desc: '散货船锚地' },
    { name: '绿华山锚地',    x: 700, y: 280, size: 10, desc: '深水减载锚地' },
    { name: '洋山港锚地',    x: 580, y: 460, size: 10, desc: '集装箱船待泊' },
    { name: '南槽锚地',      x: 440, y: 200, size: 9,  desc: '小型船舶锚地' },
    { name: '宝山锚地',      x: 310, y: 25,  size: 10, desc: '内河船舶锚地' },
  ],
  /* 航线动态点 */
  routes: [
    { from: '长江口1号锚地', to: '外高桥一期', ships: 3 },
    { from: '绿华山锚地',    to: '洋山深水港', ships: 2 },
    { from: '长江口2号锚地', to: '宝山码头',   ships: 2 },
    { from: '洋山港锚地',    to: '洋山四期',   ships: 3 },
  ]
};

function initPortChart() {
  var canvas = document.getElementById('portCanvas');
  if (!canvas) return;
  portChart = canvas;
  portCtx = canvas.getContext('2d');

  /* 高清适配 */
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.parentElement.getBoundingClientRect();
  var w = Math.min(rect.width - 32, 800);
  var h = 520;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  portCtx.scale(dpr, dpr);
  canvas._w = w;
  canvas._h = h;

  /* 启动动画循环 */
  if (portAnimId) cancelAnimationFrame(portAnimId);
  function loop() {
    portFrame++;
    drawPortChart();
    portAnimId = requestAnimationFrame(loop);
  }
  loop();
}

function drawPortChart() {
  var ctx = portCtx;
  if (!ctx || !portChart) return;
  var W = portChart._w || 800;
  var H = portChart._h || 520;

  ctx.clearRect(0, 0, W, H);

  /* 1. 海洋背景 */
  var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0A1628');
  bgGrad.addColorStop(0.5, '#0F2040');
  bgGrad.addColorStop(1, '#162848');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  /* 2. 网格线 */
  ctx.strokeStyle = 'rgba(30, 64, 128, 0.2)';
  ctx.lineWidth = 0.5;
  for (var gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (var gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

  /* 3. 海岸线 */
  ctx.strokeStyle = 'rgba(100, 180, 220, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 0);
  ctx.quadraticCurveTo(200, 30, 280, 85);
  ctx.quadraticCurveTo(350, 130, 420, 200);
  ctx.quadraticCurveTo(480, 260, 550, 310);
  ctx.quadraticCurveTo(650, 380, 710, 430);
  ctx.quadraticCurveTo(750, 460, 780, 490);
  ctx.stroke();

  /* 4. 长江/黄浦江入海口 */
  ctx.fillStyle = 'rgba(20, 50, 100, 0.5)';
  ctx.beginPath();
  ctx.moveTo(280, 85);
  ctx.quadraticCurveTo(250, 60, 200, 30);
  ctx.lineTo(300, 15);
  ctx.quadraticCurveTo(320, 50, 320, 70);
  ctx.fill();

  /* 江河水道 */
  ctx.strokeStyle = 'rgba(40, 100, 180, 0.35)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(280, 85);
  ctx.quadraticCurveTo(330, 120, 380, 130);
  ctx.quadraticCurveTo(440, 140, 500, 200);
  ctx.stroke();

  /* 5. 航线动态 - 从锚地到码头的船舶 */
  var routes = PORT_POINTS.routes;
  for (var ri = 0; ri < routes.length; ri++) {
    var route = routes[ri];
    var fromPt = findPoint(route.from);
    var toPt = findPoint(route.to);
    if (!fromPt || !toPt) continue;

    /* 航线虚线 */
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = 'rgba(80, 160, 240, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fromPt.x, fromPt.y);
    ctx.lineTo(toPt.x, toPt.y);
    ctx.stroke();
    ctx.setLineDash([]);

    /* 移动的船舶点 */
    for (var si = 0; si < route.ships; si++) {
      var phase = ((portFrame * 0.3 + si * 120) % 360);
      var t = (Math.sin(phase * Math.PI / 180) + 1) / 2;  /* 0~1 往返 */
      var sx = fromPt.x + (toPt.x - fromPt.x) * t;
      var sy = fromPt.y + (toPt.y - fromPt.y) * t;

      /* 光晕 */
      var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 8);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
      glow.addColorStop(0.5, 'rgba(56, 189, 248, 0.3)');
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();

      /* 船点 */
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* 6. 锚地 */
  var anchs = PORT_POINTS.anchorages;
  for (var ai = 0; ai < anchs.length; ai++) {
    var a = anchs[ai];
    var pulse = Math.sin(portFrame * 0.04 + ai) * 0.3 + 0.7;
    ctx.fillStyle = 'rgba(251, 191, 36, ' + (0.15 * pulse) + ')';
    ctx.strokeStyle = 'rgba(251, 191, 36, ' + (0.5 * pulse) + ')';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.size + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    /* 锚图标 */
    ctx.fillStyle = '#FBBF24';
    ctx.font = (a.size - 2) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚓', a.x, a.y + 3);

    /* 标签 */
    ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
    ctx.font = '9px "Microsoft YaHei", sans-serif';
    ctx.fillText(a.name, a.x, a.y - a.size - 8);
  }

  /* 7. 码头 */
  var terms = PORT_POINTS.terminals;
  for (var ti = 0; ti < terms.length; ti++) {
    var t = terms[ti];
    var pulse2 = Math.sin(portFrame * 0.05 + ti * 1.5) * 0.25 + 0.75;
    var r = t.size * pulse2;

    /* 外圈光晕 */
    var glow2 = ctx.createRadialGradient(t.x, t.y, r * 0.3, t.x, t.y, r * 1.8);
    glow2.addColorStop(0, t.color);
    glow2.addColorStop(0.5, hexToRgba(t.color, 0.3));
    glow2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow2;
    ctx.beginPath(); ctx.arc(t.x, t.y, r * 1.8, 0, Math.PI * 2); ctx.fill();

    /* 内圈 */
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();

    /* 白色高光 */
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(t.x - r * 0.25, t.y - r * 0.25, r * 0.35, 0, Math.PI * 2); ctx.fill();

    /* 标签 */
    ctx.fillStyle = '#E2E8F0';
    ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.name, t.x, t.y + r + 14);
  }

  /* 8. 标题 */
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SHANGHAI PORT', 20, 48);

  /* 9. 图例 */
  var lx = 20, ly = H - 90;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(lx - 5, ly - 5, 140, 82);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(lx - 5, ly - 5, 140, 82);

  ctx.fillStyle = '#38BDF8';
  ctx.beginPath(); ctx.arc(lx + 6, ly + 12, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '10px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('码头 / Terminal', lx + 16, ly + 15);

  ctx.fillStyle = '#FBBF24';
  ctx.fillText('⚓', lx + 2, ly + 38);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('锚地 / Anchorage', lx + 16, ly + 39);

  ctx.fillStyle = 'rgba(56,189,248,0.8)';
  ctx.beginPath(); ctx.arc(lx + 6, ly + 58, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('航线船舶', lx + 16, ly + 61);

  /* 10. 网格坐标标注 */
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('121°E', W - 10, H - 5);
  ctx.fillText('122°E', W * 0.7, H - 5);
  ctx.fillText('31°N', W - 55, H * 0.5);
  ctx.fillText('32°N', W - 55, H * 0.25);
}

function findPoint(name) {
  var all = PORT_POINTS.terminals.concat(PORT_POINTS.anchorages);
  for (var i = 0; i < all.length; i++) {
    if (all[i].name === name) return all[i];
  }
  return null;
}

function hexToRgba(hex, alpha) {
  var r = parseInt(hex.slice(1,3), 16);
  var g = parseInt(hex.slice(3,5), 16);
  var b = parseInt(hex.slice(5,7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

/* 窗口resize时重绘 */
window.addEventListener('resize', function() {
  if (document.getElementById('t4') && document.getElementById('t4').classList.contains('on')) {
    initPortChart();
  }
});
