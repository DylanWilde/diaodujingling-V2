/* ═══════════════════════════════════════════════════
   调度精灵 V6 — 航海之夜 · 交互特效引擎
   粒子海洋 + 波纹反馈 + 数字动画 + 卡片级联
   ═══════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ═══ 粒子海洋背景 ═══ */
  var canvas, ctx, particles = [];
  var W, H;

  function initOcean() {
    canvas = document.createElement('canvas');
    canvas.id = 'particleOcean';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
    resizeOcean();
    spawnParticles();
    window.addEventListener('resize', resizeOcean);
    animateOcean();
  }

  function resizeOcean() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function spawnParticles() {
    var count = Math.floor((W * H) / 12000);
    count = Math.min(count, 200);
    particles = [];
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.3,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.2 - 0.1,
        a: Math.random() * 0.5 + 0.2,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.005
      });
    }
  }

  function animateOcean() {
    ctx.clearRect(0, 0, W, H);

    /* 绘制连线 */
    for (var i = 0; i < particles.length; i++) {
      var p1 = particles[i];
      for (var j = i + 1; j < particles.length; j++) {
        var p2 = particles[j];
        var dx = p1.x - p2.x;
        var dy = p1.y - p2.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = 'rgba(37,99,235,' + (0.04 * (1 - dist / 100)) + ')';
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }
    }

    /* 绘制粒子 */
    for (var k = 0; k < particles.length; k++) {
      var p = particles[k];
      p.pulse += p.pulseSpeed;
      var glow = Math.sin(p.pulse) * 0.3 + 0.7;
      var alpha = p.a * glow;

      /* 光晕 */
      var grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      grd.addColorStop(0, 'rgba(37,99,235,' + (alpha * 0.35) + ')');
      grd.addColorStop(0.4, 'rgba(56,189,248,' + (alpha * 0.18) + ')');
      grd.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      /* 核心 */
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(37,99,235,' + (alpha * 0.5) + ')';
      ctx.fill();

      /* 移动 */
      p.x += p.vx;
      p.y += p.vy;

      /* 缓慢漂移 */
      p.vx += (Math.random() - 0.5) * 0.01;
      p.vy += (Math.random() - 0.5) * 0.01;
      p.vx *= 0.999;
      p.vy *= 0.999;

      /* 边界回绕 */
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20;
      if (p.y > H + 20) p.y = -20;
    }

    requestAnimationFrame(animateOcean);
  }

  initOcean();

  /* ═══ 波纹效果 ═══ */
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn');
    if (!btn) return;
    if (btn.querySelector('.ripple')) return;

    var ripple = document.createElement('span');
    ripple.className = 'ripple';
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);

    setTimeout(function() {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 600);
  });

  /* ═══ 数字跳动动画 ═══ */
  window.animateCount = function(el, target) {
    if (!el) return;
    var current = parseInt(el.textContent) || 0;
    if (current === target) return;
    var duration = 800;
    var start = performance.now();
    function step(ts) {
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(current + (target - current) * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  };

  /* ═══ 卡片交错入场动画 ═══ */
  function staggerCards() {
    var cards = document.querySelectorAll('.sc');
    cards.forEach(function(card, i) {
      card.style.animation = 'cardSlideUp .4s ease backwards';
      card.style.animationDelay = (i * 0.03) + 's';
    });
  }

  /* ═══ 实时同步脉冲 ═══ */
  function updateSyncIndicator() {
    var statusEl = document.getElementById('dbStatus');
    if (!statusEl) return;
    var html = statusEl.innerHTML;
    if (html.indexOf('💾') >= 0 || html.indexOf('📤') >= 0) {
      statusEl.innerHTML = '<span class="pulse-dot syncing"></span>' + html;
    }
  }

  /* ═══ 鼠标光晕追踪 ═══ */
  var mouseX = -100, mouseY = -100;
  document.addEventListener('mousemove', function(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    updateGlowCards();
  });

  function updateGlowCards() {
    var cards = document.querySelectorAll('.sc:hover, .cd:hover, .sb-item:hover');
    if (!cards.length) return;
    cards.forEach(function(card) {
      var rect = card.getBoundingClientRect();
      var cx = mouseX - rect.left;
      var cy = mouseY - rect.top;
      var gradX = (cx / rect.width) * 100;
      var gradY = (cy / rect.height) * 100;
      card.style.background = 'radial-gradient(circle at ' + gradX + '% ' + gradY + '%, rgba(37,99,235,0.06), #FFFFFF)';
    });
  }

  /* ═══ 页面就绪后增强 ═══ */
  function enhanceDOM() {
    /* 给统计数字加动画class */
    ['stT', 'stA', 'stD', 'stM', 'stT3', 'stMar3', 'stWarn3'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('count-up');
    });

    /* 初始加载时给卡片做级联 */
    setTimeout(staggerCards, 100);

    /* 给实时状态加脉冲 */
    setTimeout(updateSyncIndicator, 500);

    /* 观察DOM变化，新卡片自动级联 */
    if (window.MutationObserver) {
      var obs = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          if (m.addedNodes.length) {
            var hasCards = false;
            m.addedNodes.forEach(function(n) {
              if (n.nodeType === 1 && (n.classList.contains('sc') || n.querySelector('.sc'))) {
                hasCards = true;
              }
            });
            if (hasCards) staggerCards();
          }
        });
      });
      var dg = document.getElementById('dg');
      var dg3 = document.getElementById('dg3');
      if (dg) obs.observe(dg, { childList: true, subtree: true });
      if (dg3) obs.observe(dg3, { childList: true, subtree: true });
    }
  }

  /* 启动 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceDOM);
  } else {
    enhanceDOM();
  }

})();
