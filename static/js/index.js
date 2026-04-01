window.HELP_IMPROVE_VIDEOJS = false;

// ─── Pipeline animation ──────────────────────────────────────
function initPipelineAnimation() {
  var items = document.querySelectorAll('#pipeline-anim .pipe-step, #pipeline-anim .pipe-arrow');
  if (!items.length) return;
  items.forEach(function(el, i) {
    setTimeout(function() { el.classList.add('visible'); }, i * 180 + 300);
  });
}

// ─── FSM interactive diagram ─────────────────────────────────
var FSM_INFO = {
  LOOKING: {
    title: 'LOOKING',
    desc: 'System scans for target objects using G.DINO. Selects highest-confidence bounding box as the target. RPY controller centers end-effector over target.',
    predicate: 'close_t ≜ A(B*_t) ≥ τ_close → transition to GRASPED'
  },
  GRASPED: {
    title: 'GRASPED',
    desc: 'Object is within grasp proximity. System monitors claw detection to confirm contact. If target re-appears, returns to LOOKING; if claw detected, advances to PLACING.',
    predicate: 'det_t(claw) = 1 → PLACING  |  det_t(target) = 1 → LOOKING'
  },
  PLACING: {
    title: 'PLACING',
    desc: 'End-effector moves object toward goal region. Placement confirmed when object is in goal region AND release signal fires.',
    predicate: 'in_goal_region_t = 1 ∧ release_t = 1 → PLACED'
  },
  PLACED: {
    title: 'PLACED',
    desc: 'Object placed. System evaluates goal similarity score S_t against threshold τ_goal. If goal achieved, task terminates (DONE); otherwise returns to LOOKING for next object.',
    predicate: 'S_t ≥ τ_goal → DONE  |  otherwise → LOOKING'
  }
};

function initFSM() {
  var states = document.querySelectorAll('.fsm-state');
  var panel  = document.getElementById('fsm-info-panel');
  if (!states.length || !panel) return;

  states.forEach(function(el) {
    function activate() {
      states.forEach(function(s) { s.classList.remove('active'); });
      el.classList.add('active');
      var info = FSM_INFO[el.dataset.state];
      panel.innerHTML =
        '<div class="fsm-info-content">' +
          '<h4>' + info.title + '</h4>' +
          '<p>' + info.desc + '</p>' +
          '<span class="fsm-predicate">' + info.predicate + '</span>' +
        '</div>';
    }
    el.addEventListener('click', activate);
    el.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') activate(); });
  });
}

// ─── IoU canvas demo ─────────────────────────────────────────
function initIoUDemo() {
  var canvasEl = document.getElementById('iou-canvas');
  if (!canvasEl) return;

  // HiDPI / retina fix
  var dpr = window.devicePixelRatio || 1;
  var LW = 560, LH = 360; // logical (CSS) dimensions
  canvasEl.width  = LW * dpr;
  canvasEl.height = LH * dpr;
  canvasEl.style.width  = LW + 'px';
  canvasEl.style.height = LH + 'px';

  var ctx = canvasEl.getContext('2d');
  ctx.scale(dpr, dpr);
  var W = LW, H = LH;

  // Goal box (fixed, dark dashed)
  var goal = { x: W * 0.15, y: H * 0.18, w: W * 0.38, h: H * 0.52 };
  // Detection box (draggable + resizable, orange)
  var det  = { x: W * 0.43, y: H * 0.27, w: W * 0.36, h: H * 0.45 };

  var MIN_SIZE   = 28;
  var HANDLE_R   = 6;  // visual radius
  var HANDLE_HIT = 11; // hit area radius

  // mode: null | 'drag' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br'
  var mode = null;
  var dragOffX = 0, dragOffY = 0;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function computeIoU() {
    var ax1 = goal.x, ay1 = goal.y, ax2 = goal.x + goal.w, ay2 = goal.y + goal.h;
    var bx1 = det.x,  by1 = det.y,  bx2 = det.x  + det.w,  by2 = det.y  + det.h;
    var ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
    var ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
    var inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
    var union = goal.w * goal.h + det.w * det.h - inter;
    return union > 0 ? inter / union : 0;
  }

  function computeDist() {
    var gcx = (goal.x + goal.w / 2) / W, gcy = (goal.y + goal.h / 2) / H;
    var dcx = (det.x  + det.w  / 2) / W, dcy = (det.y  + det.h  / 2) / H;
    return Math.sqrt((gcx - dcx) * (gcx - dcx) + (gcy - dcy) * (gcy - dcy));
  }

  function updateStats() {
    var iouVal = computeIoU();
    var dist   = computeDist();
    // matches Python _pair_score: max(0, min(1, (iou + (1 - dist)) / 2))
    var sim    = Math.max(0.0, Math.min(1.0, (iouVal + (1.0 - dist)) / 2.0));
    document.getElementById('iou-val').textContent  = iouVal.toFixed(3);
    document.getElementById('dist-val').textContent = dist.toFixed(3);
    document.getElementById('sim-val').textContent  = sim.toFixed(3);
    document.getElementById('iou-score-bar').style.width = (sim * 100).toFixed(1) + '%';
  }

  function drawHandle(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = '#e67e22';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Intersection highlight
    var ix1 = Math.max(goal.x, det.x), iy1 = Math.max(goal.y, det.y);
    var ix2 = Math.min(goal.x + goal.w, det.x + det.w);
    var iy2 = Math.min(goal.y + goal.h, det.y + det.h);
    if (ix2 > ix1 && iy2 > iy1) {
      ctx.fillStyle = 'rgba(100,180,100,0.22)';
      ctx.fillRect(ix1, iy1, ix2 - ix1, iy2 - iy1);
    }

    // Goal box (dark dashed)
    ctx.strokeStyle = '#363636';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(goal.x, goal.y, goal.w, goal.h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(54,54,54,0.04)';
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
    ctx.fillStyle = '#363636';
    ctx.font = 'bold 11px "Space Mono", monospace';
    ctx.fillText('Goal State', goal.x + 6, goal.y + 15);

    // Detection box (orange, solid)
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 2;
    ctx.strokeRect(det.x, det.y, det.w, det.h);
    ctx.fillStyle = 'rgba(230,126,34,0.07)';
    ctx.fillRect(det.x, det.y, det.w, det.h);
    ctx.fillStyle = '#b5571a';
    ctx.font = 'bold 11px "Space Mono", monospace';
    ctx.fillText('Detection', det.x + 6, det.y + 15);

    // Center dots
    ctx.fillStyle = '#363636';
    ctx.beginPath(); ctx.arc(goal.x + goal.w/2, goal.y + goal.h/2, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e67e22';
    ctx.beginPath(); ctx.arc(det.x + det.w/2, det.y + det.h/2, 4, 0, Math.PI*2); ctx.fill();

    // Center distance dashed line
    ctx.strokeStyle = 'rgba(100,100,100,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(goal.x + goal.w/2, goal.y + goal.h/2);
    ctx.lineTo(det.x  + det.w/2,  det.y  + det.h/2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner resize handles on detection box
    drawHandle(det.x,           det.y);
    drawHandle(det.x + det.w,   det.y);
    drawHandle(det.x,           det.y + det.h);
    drawHandle(det.x + det.w,   det.y + det.h);

    updateStats();
  }

  function getPos(e) {
    var r = canvasEl.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    var cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: cx * (W / r.width), y: cy * (H / r.height) };
  }

  function hitHandle(p, hx, hy) {
    return Math.abs(p.x - hx) <= HANDLE_HIT && Math.abs(p.y - hy) <= HANDLE_HIT;
  }

  function pickMode(p) {
    if (hitHandle(p, det.x,           det.y))          return 'resize-tl';
    if (hitHandle(p, det.x + det.w,   det.y))          return 'resize-tr';
    if (hitHandle(p, det.x,           det.y + det.h))  return 'resize-bl';
    if (hitHandle(p, det.x + det.w,   det.y + det.h))  return 'resize-br';
    if (p.x >= det.x && p.x <= det.x + det.w &&
        p.y >= det.y && p.y <= det.y + det.h)          return 'drag';
    return null;
  }

  function setCursor(m) {
    if (!m || m === null)        canvasEl.style.cursor = 'default';
    else if (m === 'drag')       canvasEl.style.cursor = 'grab';
    else if (m === 'resize-tl' || m === 'resize-br') canvasEl.style.cursor = 'nwse-resize';
    else                         canvasEl.style.cursor = 'nesw-resize';
  }

  function onDown(e) {
    var p = getPos(e);
    mode = pickMode(p);
    if (mode === 'drag') { dragOffX = p.x - det.x; dragOffY = p.y - det.y; }
    if (mode && e.cancelable) e.preventDefault();
    if (mode === 'drag') canvasEl.style.cursor = 'grabbing';
  }

  function onMove(e) {
    if (!mode) { setCursor(pickMode(getPos(e))); return; }
    if (e.cancelable) e.preventDefault();
    var p = getPos(e);
    if (mode === 'drag') {
      det.x = clamp(p.x - dragOffX, 0, W - det.w);
      det.y = clamp(p.y - dragOffY, 0, H - det.h);
    } else if (mode === 'resize-br') {
      det.w = clamp(p.x - det.x, MIN_SIZE, W - det.x);
      det.h = clamp(p.y - det.y, MIN_SIZE, H - det.y);
    } else if (mode === 'resize-bl') {
      var nx = clamp(p.x, 0, det.x + det.w - MIN_SIZE);
      det.w = (det.x + det.w) - nx; det.x = nx;
      det.h = clamp(p.y - det.y, MIN_SIZE, H - det.y);
    } else if (mode === 'resize-tr') {
      det.w = clamp(p.x - det.x, MIN_SIZE, W - det.x);
      var ny = clamp(p.y, 0, det.y + det.h - MIN_SIZE);
      det.h = (det.y + det.h) - ny; det.y = ny;
    } else if (mode === 'resize-tl') {
      var nx2 = clamp(p.x, 0, det.x + det.w - MIN_SIZE);
      det.w = (det.x + det.w) - nx2; det.x = nx2;
      var ny2 = clamp(p.y, 0, det.y + det.h - MIN_SIZE);
      det.h = (det.y + det.h) - ny2; det.y = ny2;
    }
    draw();
  }

  function onUp() { mode = null; canvasEl.style.cursor = 'grab'; }

  canvasEl.addEventListener('mousedown',  onDown);
  canvasEl.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mouseup',    onUp);
  window.addEventListener('touchend',   onUp);
  window.addEventListener('mousemove',  onMove);
  canvasEl.addEventListener('touchmove', function(e) {
    if (!mode) return;
    onMove(e);
  }, { passive: false });

  draw();
}


// ─── Success bars animate-in on scroll ───────────────────────
function initSuccessBars() {
  var bars = document.querySelectorAll('.success-bar:not(.success-bar-tbd)');
  if (!bars.length) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var el = entry.target;
        var target = el.style.width;
        el.style.width = '0%';
        requestAnimationFrame(function() {
          el.style.transition = 'width 1s cubic-bezier(0.4,0,0.2,1)';
          el.style.width = target;
        });
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.3 });
  bars.forEach(function(b) { observer.observe(b); });
}

// ─── Likert chart ─────────────────────────────────────────────
function initLikertChart() {
  var el = document.getElementById('likert-chart');
  if (!el || typeof Chart === 'undefined') return;

  // Monochromatic green palette matching paper figure (lightest→darkest)
  // Percentages estimated from paper fig 6.5v2, sums to 100 per category
  new Chart(el, {
    type: 'bar',
    data: {
      labels: ['Two-Group Cross', 'Triple-Attribute', 'Three-Way Spatial', 'Overlapping'],
      datasets: [
        { label: '1 – Strongly Disagree', data: [13, 15,  7,  9], backgroundColor: '#c8e6c9' },
        { label: '2',                     data: [10, 13, 11, 13], backgroundColor: '#81c784' },
        { label: '3',                     data: [13, 12, 14, 13], backgroundColor: '#4caf50' },
        { label: '4',                     data: [17, 17, 19, 18], backgroundColor: '#2e7d32' },
        { label: '5 – Strongly Agree',    data: [47, 43, 49, 47], backgroundColor: '#1b5e20' }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y + '%'; }
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          stacked: true, max: 100,
          ticks: { callback: function(v) { return v + '%'; }, font: { size: 11 } },
          grid: { color: '#f0f0f0' }
        }
      }
    }
  });
}

// ─── Sortable comparison table ────────────────────────────────
function initSortableTable() {
  var table = document.getElementById('comparison-table');
  if (!table) return;
  var headers = table.querySelectorAll('th.sortable');
  var sortState = { col: null, asc: true };

  headers.forEach(function(th) {
    th.addEventListener('click', function() {
      var col = this.dataset.col;
      if (sortState.col === col) { sortState.asc = !sortState.asc; }
      else { sortState.col = col; sortState.asc = true; }

      var tbody = table.querySelector('tbody');
      var rows  = Array.from(tbody.querySelectorAll('tr'));

      rows.sort(function(a, b) {
        var aEl = col === 'demos' ? a.querySelector('td[data-val]') : a.querySelector('td');
        var bEl = col === 'demos' ? b.querySelector('td[data-val]') : b.querySelector('td');
        var aV  = col === 'demos' ? parseFloat(aEl.dataset.val) : aEl.textContent.trim().toLowerCase();
        var bV  = col === 'demos' ? parseFloat(bEl.dataset.val) : bEl.textContent.trim().toLowerCase();
        if (typeof aV === 'number') return sortState.asc ? aV - bV : bV - aV;
        return sortState.asc ? aV.localeCompare(bV) : bV.localeCompare(aV);
      });

      rows.forEach(function(r) { tbody.appendChild(r); });

      headers.forEach(function(h) {
        h.querySelector('.sort-icon').className = 'fas fa-sort sort-icon';
      });
      this.querySelector('.sort-icon').className =
        'fas fa-sort-' + (sortState.asc ? 'up' : 'down') + ' sort-icon';
    });
  });
}

// ─── BibTeX copy button ───────────────────────────────────────
function initBibTexCopy() {
  var btn   = document.getElementById('bibtex-copy-btn');
  var label = document.getElementById('bibtex-copy-label');
  var icon  = document.getElementById('bibtex-copy-icon');
  var code  = document.getElementById('bibtex-code');
  if (!btn || !code) return;

  btn.addEventListener('click', function() {
    navigator.clipboard.writeText(code.textContent).then(function() {
      btn.classList.add('copied');
      icon.className = 'fas fa-check';
      label.textContent = 'Copied!';
      setTimeout(function() {
        btn.classList.remove('copied');
        icon.className = 'fas fa-copy';
        label.textContent = 'Copy';
      }, 2000);
    });
  });
}

// ─── Navbar burger ────────────────────────────────────────────
function initNavbar() {
  $('.navbar-burger').click(function() {
    $('.navbar-burger').toggleClass('is-active');
    $('.navbar-menu').toggleClass('is-active');
  });
}

// ─── Image modal ─────────────────────────────────────────────
function setupImageModal() {
  var modal      = document.getElementById('image-modal');
  if (!modal) return;
  var modalImage = document.getElementById('modal-image');
  var closeBtns  = modal.querySelectorAll('.modal-background, .modal-close');

  $(document).on('click', '.gallery-slide img, #maps-gallery img, .figure-block img', function() {
    modalImage.src = this.src;
    modalImage.alt = this.alt || '';
    modal.classList.add('is-active');
  });

  closeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      modal.classList.remove('is-active');
      modalImage.src = '';
    });
  });

  document.addEventListener('keyup', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('is-active')) {
      modal.classList.remove('is-active');
      modalImage.src = '';
    }
  });
}

// ─── Paper figure scroll-fade ─────────────────────────────────
function initFigureAnimations() {
  var figs = document.querySelectorAll('.figure-block');
  if (!figs.length) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  figs.forEach(function(f) { observer.observe(f); });
}

// ─── Boot ─────────────────────────────────────────────────────
$(document).ready(function() {
  initNavbar();
  initPipelineAnimation();
  initFSM();
  initIoUDemo();
  initSuccessBars();
  initLikertChart();
  initSortableTable();
  initBibTexCopy();
  setupImageModal();
  initFigureAnimations();
});
