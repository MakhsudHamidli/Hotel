(function () {
  'use strict';

  var CAM_MAX = 7150, END_Z = 7800, SPACING = 580, L_START = 1500, R_START = 1790;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var STATUS_TXT = { free: 'Boş', pending: 'Gözləmədə', booked: 'Dolu', closed: 'Satışda deyil' };
  var LAMP_TXT = { free: 'BOŞ', pending: 'GÖZLƏMƏDƏ', booked: 'DOLU', closed: 'BAĞLI' };
  var MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
  var ICONS = {
    wifi: ['Pulsuz Wi-Fi', '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r=".8"/>'],
    coffee: ['Kofe aparatı', '<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM16 10h2a2 2 0 0 1 0 4h-2M8 2v3M12 2v3"/>'],
    tv: ['Smart TV', '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>'],
    safe: ['Seyf', '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v1M7 20v1M17 20v1"/>'],
    rain: ['Yağış duşu', '<path d="M4 4h10a4 4 0 0 1 4 4v1M6 12v2M10 12v2M14 12v2M6 17v2M10 17v2M14 17v2"/>'],
    ac: ['Kondisioner', '<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"/>'],
    sea: ['Dəniz mənzərəsi', '<path d="M2 16c2 0 2-1.5 4-1.5S8 16 10 16s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 20c2 0 2-1.5 4-1.5S8 20 10 20s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="12" cy="8" r="3"/>'],
    sofa: ['Oturma guşəsi', '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2v-5ZM5 18v2M19 18v2"/>'],
    club: ['M Club Lounge', '<path d="M12 2 15 8l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>'],
    breakfast: ['Səhər yeməyi daxil', '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>'],
    family: ['Ailələr üçün', '<circle cx="8" cy="6" r="2.5"/><circle cx="16" cy="8" r="2"/><path d="M4 21v-6a4 4 0 0 1 8 0v6M13 21v-4a3 3 0 0 1 6 0v4"/>'],
    terrace: ['Şəxsi terras', '<path d="M3 21h18M5 21V11M19 21V11M3 11h18M12 3 3 9h18l-9-6Z"/>'],
    bath: ['Vanna', '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3ZM6 12V5a2 2 0 0 1 4 0M7 20l-1 2M17 20l1 2"/>']
  };

  var CAT = null, ROOMS = [], STATUS = {}, OFFLINE = false;
  var B = { in: '', out: '', adults: 2, kids: 0 };
  var world = $('#world');

  /* ---------- helpers ---------- */
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
  function nights(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
  function fmtD(s, short) { var d = new Date(s + 'T12:00:00'); return d.getDate() + ' ' + (short ? MONTHS[d.getMonth()].slice(0, 3) : MONTHS[d.getMonth()]); }
  function money(n) { return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₼'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function typeOf(no) { var r = ROOMS.filter(function (x) { return x.no === no; })[0]; return r ? CAT.types[r.type] : null; }
  function toast(msg, err) {
    var t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function ssGet(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- corridor build ---------- */
  function doorZ(i, side) { return (side === 'L' ? L_START : R_START) + i * SPACING; }
  function buildCorridor() {
    var html = '<div class="plane floor"></div><div class="plane ceil"></div>' +
      '<div class="plane wall l" id="wl"></div><div class="plane wall r" id="wr"></div>' +
      '<div class="plane endw" style="transform:translateZ(-' + END_Z + 'px)"><div class="wm">BAKU MARRIOTT</div><div class="ws">HOTEL BOULEVARD</div><div class="rcp-word">RESEPSİYON</div><div class="keys"></div></div>' +
      '<div class="plane desk" data-z="7540" data-x="0" data-y="147"><span class="dsk-l">RESEPSİYON</span></div>' +
      '<div class="plane desk-top" data-z="7580" data-x="0" data-y="84" data-rx="90"></div>' +
      '<div class="plane bell" data-z="7560" data-x="120" data-y="68"></div>' +
      '<div class="plane plant" data-z="7700" data-x="-250" data-y="85"></div>' +
      '<div class="plane plant" data-z="7700" data-x="250" data-y="85"></div>';
    world.insertAdjacentHTML('afterbegin', html);

    var wl = '', wr = '', li = 0, ri = 0;
    ROOMS.forEach(function (r) {
      var t = CAT.types[r.type];
      var i = r.side === 'L' ? li++ : ri++;
      var D = doorZ(i, r.side);
      // left wall: element x p ↔ depth p-1200 ; right wall: depth 7800-p
      var p = r.side === 'L' ? D + 1200 - 85 : 7800 - D - 85;
      var door = '<div class="door" data-no="' + r.no + '" data-z="' + D + '" data-st="free" style="left:' + p + 'px">' +
        '<div class="lamp"><i></i><span>BOŞ</span></div><div class="dn">' + r.no + '</div><div class="rd"></div><div class="dh"></div></div>';
      var plqP = r.side === 'L' ? p + 200 : p - 180;
      var plq = '<div class="plq" style="left:' + plqP + 'px"><b>' + esc(t.name) + '</b><span>' + money(t.price) + ' / gecə</span></div>';
      var scP = r.side === 'L' ? p + 372 : p - 230;
      var artP = r.side === 'L' ? p + 404 : p - 390;
      var deco = (i % 2 ? '<div class="art" style="left:' + artP + 'px"></div>' : '') + '<div class="sc" style="left:' + scP + 'px"></div>';
      if (r.side === 'L') wl += door + plq + deco; else wr += door + plq + deco;
    });
    // entrance sconces
    wl += '<div class="sc" style="left:2400px"></div>';
    wr += '<div class="sc" style="left:6700px"></div>';
    $('#wl').innerHTML = wl;
    $('#wr').innerHTML = wr;
  }

  var items = [];
  function layout() {
    var mob = window.innerWidth < 700;
    items = [];
    $$('[data-z]', world).forEach(function (n) {
      if (n.classList.contains('door')) return;
      var z = +n.dataset.z, x = (+n.dataset.x || 0) * (mob ? 0.35 : 1), y = +n.dataset.y || 0;
      var w = n.offsetWidth, h = n.offsetHeight;
      n.style.left = (-w / 2) + 'px';
      n.style.top = (-h / 2) + 'px';
      n.style.transform = 'translate3d(' + x + 'px,' + y + 'px,' + (-z) + 'px)' + (n.dataset.rx ? ' rotateX(' + n.dataset.rx + 'deg)' : '');
      items.push({ el: n, z: z, fixed: z > 7300 });
    });
  }

  /* ---------- availability ---------- */
  function applyStatus() {
    $$('.door').forEach(function (d) {
      var st = STATUS[d.dataset.no] || 'free';
      d.dataset.st = st;
      $('.lamp span', d).textContent = LAMP_TXT[st];
      var t = typeOf(d.dataset.no);
      d.classList.toggle('filtered', !!t && B.adults + B.kids > t.capacity);
    });
    var free = ROOMS.filter(function (r) { return STATUS[r.no] === 'free' && CAT.types[r.type].capacity >= B.adults + B.kids; }).length;
    $('#freeCount').textContent = free;
    renderList();
    fillRoomSelect();
  }
  function loadStatus(announce) {
    var url = 'api/rooms.php?in=' + B.in + '&out=' + B.out;
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error); STATUS = j.status; OFFLINE = false; })
      .catch(function () { OFFLINE = true; ROOMS.forEach(function (r) { STATUS[r.no] = STATUS[r.no] || 'free'; }); })
      .then(function () {
        applyStatus();
        if (announce) {
          var n = $('#freeCount').textContent;
          toast(fmtD(B.in, 1) + ' – ' + fmtD(B.out, 1) + ': ' + n + ' boş otaq tapıldı');
        }
      });
  }

  /* ---------- booking bar ---------- */
  function syncBar() {
    $('#bIn').value = B.in; $('#bOut').value = B.out;
    $('#bIn').min = iso(new Date());
    $('#bOut').min = addDays(B.in, 1);
    $('#bAdults').value = String(B.adults); $('#bKids').value = String(B.kids);
    var n = nights(B.in, B.out);
    $('#chipText').textContent = fmtD(B.in, 1) + ' – ' + fmtD(B.out, 1) + ' · ' + n + ' gecə · ' + (B.adults + B.kids) + ' qonaq';
    $('#listDates').textContent = fmtD(B.in, 1) + ' – ' + fmtD(B.out, 1) + ' · ' + (B.adults + B.kids) + ' qonaq';
    ssSet('mb_b', B);
  }
  function setDates(i, o) {
    var today = iso(new Date());
    if (!i || i < today) i = today;
    if (!o || o <= i) o = addDays(i, 1);
    B.in = i; B.out = o;
  }
  $('#bIn').addEventListener('change', function () { setDates(this.value, B.out); syncBar(); });
  $('#bOut').addEventListener('change', function () { setDates(B.in, this.value); syncBar(); });
  $('#bAdults').addEventListener('change', function () { B.adults = +this.value; syncBar(); });
  $('#bKids').addEventListener('change', function () { B.kids = +this.value; syncBar(); });
  $('#bbar').addEventListener('submit', function (e) {
    e.preventDefault();
    $('#bbar').classList.remove('open');
    $('#bbarChip').setAttribute('aria-expanded', 'false');
    loadStatus(true);
    if (cur < 800) goDepth(1100);
  });
  $('#bbarChip').addEventListener('click', function () {
    var o = $('#bbar').classList.toggle('open');
    this.setAttribute('aria-expanded', String(o));
  });

  /* ---------- camera ---------- */
  var cur = 0, target = 0;
  function maxScroll() { return document.documentElement.scrollHeight - window.innerHeight; }
  function read() {
    var m = maxScroll();
    target = (m > 0 ? Math.min(1, Math.max(0, window.scrollY / m)) : 0) * CAM_MAX;
  }
  function goDepth(z, instant) {
    var top = Math.max(0, Math.min(1, z / CAM_MAX)) * maxScroll();
    window.scrollTo({ top: top, behavior: instant || reduce ? 'auto' : 'smooth' });
  }
  var rcpAuto = false, rcpDismissed = false;
  function frame() {
    cur += (target - cur) * (reduce ? 1 : 0.085);
    if (Math.abs(target - cur) < 0.1) cur = target;
    var w = window.innerWidth;
    var scale = w < 700 ? Math.min(1, Math.max(0.7, w / 420)) : Math.min(1, Math.max(0.64, w / 780));
    world.style.transform = 'scale(' + scale + ') translateZ(' + cur.toFixed(2) + 'px)';
    for (var i = 0; i < items.length; i++) {
      var it = items[i], ahead = it.z - cur, o = 1;
      if (ahead < 260) o = Math.max(0, (ahead - 90) / 170);
      else if (!it.fixed && ahead > 1700) o = Math.max(0, 1 - (ahead - 1700) / 1700);
      it.el.style.opacity = o.toFixed(3);
      it.el.style.visibility = o <= 0 ? 'hidden' : 'visible';
    }
    $('#meter').textContent = '7-ci mərtəbə · ' + Math.round(cur / 100) + ' m';
    $('#hint').style.opacity = cur > 300 ? 0 : 1;
    if (++nearTick % 12 === 0) updateNear();
    var bb = $('#bbar'), compact = cur > 350 && w > 820;
    if (compact !== bb.classList.contains('compact')) {
      bb.classList.toggle('compact', compact);
      if (!compact) bb.classList.remove('open');
    }
    $('#prog').style.transform = 'scaleX(' + (cur / CAM_MAX).toFixed(4) + ')';
    // reception reveal at the end of the corridor
    if (cur > CAM_MAX - 180 && !rcpDismissed && !rcpAuto && !modalOpen()) { rcpAuto = true; openReception(); }
    if (cur < CAM_MAX - 700) { rcpDismissed = false; if (rcpAuto && rcp.classList.contains('on') && !rcpPinned) { closeReception(true); } rcpAuto = false; }
    requestAnimationFrame(frame);
  }
  window.addEventListener('scroll', function () {
    read();
    if (hoverDoor) { hoverDoor.classList.remove('hot'); hoverDoor = null; document.body.style.cursor = ''; tip.hidden = true; }
  }, { passive: true });
  window.addEventListener('resize', function () { layout(); read(); if (viewer) viewer.fit(); });

  /* ---------- door picking ---------- */
  var doors = [], hoverDoor = null, tip = $('#doorTip');
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  function pickAt(x, y) {
    var best = null, bw = 0, pad = coarse ? 28 : 0;
    for (var i = 0; i < doors.length; i++) {
      var d = doors[i], z = +d.dataset.z;
      if (z - cur < -480 || z - cur > 4200) continue;
      var r = d.getBoundingClientRect();
      if (r.width < 14 || r.width > window.innerWidth * 1.5 || x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
      if (r.width > bw) { bw = r.width; best = d; }
    }
    return best;
  }
  function overUI(e) { return e.target.closest && e.target.closest('.hdr,.bbar,.hud,.modal,.rcp,.toasts,.near'); }
  document.addEventListener('mousemove', function (e) {
    if (!fine || modalOpen() || overUI(e)) { if (hoverDoor) { hoverDoor.classList.remove('hot'); hoverDoor = null; tip.hidden = true; document.body.style.cursor = ''; } return; }
    var t = pickAt(e.clientX, e.clientY);
    document.body.style.cursor = t ? 'pointer' : '';
    if (t !== hoverDoor) {
      if (hoverDoor) hoverDoor.classList.remove('hot');
      hoverDoor = t;
      if (t) {
        t.classList.add('hot');
        var ty = typeOf(t.dataset.no), st = STATUS[t.dataset.no] || 'free';
        tip.innerHTML = '<b>' + t.dataset.no + ' · ' + esc(ty.name) + '</b>' + ty.size + ' m² · ' + money(ty.price) + ' / gecə<br><span class="s" style="color:var(--' + st + '-ink)">' + STATUS_TXT[st] + '</span>';
      }
    }
    tip.hidden = !t;
    if (t) {
      var tx = Math.min(e.clientX + 18, window.innerWidth - 280), tyy = Math.min(e.clientY + 18, window.innerHeight - 110);
      tip.style.left = tx + 'px'; tip.style.top = tyy + 'px';
    }
  });
  document.addEventListener('click', function (e) {
    if (modalOpen() || overUI(e)) return;
    if (rcp.classList.contains('on') && e.target.closest('.rcp')) return;
    var t = pickAt(e.clientX, e.clientY);
    if (t) openRoom(t.dataset.no);
  });

  /* ---------- nearby rooms bar (big tap targets, esp. phones) ---------- */
  var nearTick = 0, nearKey = '';
  function updateNear() {
    var box = $('#near');
    if (!box || !ROOMS.length) return;
    var pick = { L: null, R: null };
    doors.forEach(function (d) {
      var ahead = +d.dataset.z - cur;
      if (ahead < 380 || ahead > 1350) return;
      var side = d.closest('#wl') ? 'L' : 'R';
      if (!pick[side] || +d.dataset.z < +pick[side].dataset.z) pick[side] = d;
    });
    var list = [pick.L, pick.R].filter(Boolean);
    if (modalOpen() || rcp.classList.contains('on')) list = [];
    var key = list.map(function (d) { return d.dataset.no + (STATUS[d.dataset.no] || ''); }).join(',');
    if (key === nearKey) return;
    nearKey = key;
    box.innerHTML = list.map(function (d) {
      var no = d.dataset.no, t = typeOf(no), st = STATUS[no] || 'free';
      return '<button type="button" data-no="' + no + '" data-st="' + st + '" aria-label="Otaq ' + no + ' — ' + esc(t.name) + ', ' + STATUS_TXT[st] + '"><span class="n">' + no + '</span><span><span class="t">' + esc(t.name) + '</span><small>● ' + STATUS_TXT[st] + '</small></span></button>';
    }).join('');
  }
  $('#near').addEventListener('click', function (e) {
    var b = e.target.closest('[data-no]');
    if (b) openRoom(b.dataset.no);
  });
  document.addEventListener('click', function (e) {
    var bb = $('#bbar');
    if (bb.classList.contains('open') && !e.target.closest('#bbar')) { bb.classList.remove('open'); $('#bbarChip').setAttribute('aria-expanded', 'false'); e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ---------- modals ---------- */
  var lastFocus = null;
  function modalOpen() { return !!$('.modal:not([hidden])'); }
  function showModal(m) {
    lastFocus = document.activeElement;
    m.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    tip.hidden = true;
    setTimeout(function () { var f = $('.x', m) || $('button', m); f && f.focus(); }, 30);
  }
  function hideModal(m) {
    m.hidden = true;
    if (!modalOpen()) document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { if (m.id === 'roomModal') closeRoom(); else hideModal(m); }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var m = $('.modal:not([hidden])');
      if (m) { if (m.id === 'roomModal') closeRoom(); else hideModal(m); }
      else if (rcp.classList.contains('on')) closeReception();
    }
    if (e.key === 'Tab') { // simple focus trap
      var box = $('.modal:not([hidden])');
      if (!box) return;
      var f = $$('button:not([disabled]),input,select,textarea,a[href]', box).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- room viewer ---------- */
  var viewer = null, openNo = null, openTimer = 0;
  var rm = $('#roomModal');
  function openRoom(no) {
    var r = ROOMS.filter(function (x) { return x.no === no; })[0];
    if (!r) return;
    var t = CAT.types[r.type], st = STATUS[no] || 'free', n = nights(B.in, B.out);
    openNo = no;
    $('#leafNo').textContent = no;
    $('#rmEyebrow').textContent = 'Otaq ' + no + ' · 7-ci mərtəbə';
    $('#rmTitle').textContent = t.name;
    var s = $('#rmStatus');
    s.className = 'status ' + st;
    s.textContent = STATUS_TXT[st] + ' · ' + fmtD(B.in, 1) + ' – ' + fmtD(B.out, 1);
    $('#rmSummary').textContent = t.summary;
    $('#rmFacts').innerHTML = [['Sahə', t.size + ' m²'], ['Çarpayı', t.bed], ['Mənzərə', t.view], ['Maksimum', t.capacity + ' qonaq']]
      .map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('');
    $('#rmAmen').innerHTML = t.amenities.map(function (a) { var ic = ICONS[a]; return ic ? '<li><svg viewBox="0 0 24 24" aria-hidden="true">' + ic[1] + '</svg>' + ic[0] + '</li>' : ''; }).join('');
    $('#rmPrice').textContent = money(t.price);
    $('#rmTotal').textContent = n + ' gecə · cəmi ' + money(n * t.price);
    var book = $('#rmBook'), tooMany = B.adults + B.kids > t.capacity;
    book.disabled = false;
    if (st !== 'free') { book.textContent = 'Bu tarixlərdə dolu — tarixi dəyiş'; book.dataset.mode = 'dates'; }
    else if (tooMany) { book.textContent = 'Maksimum ' + t.capacity + ' qonaq — başqa otaq seç'; book.dataset.mode = 'list'; }
    else { book.textContent = 'Bu otağı rezerv et'; book.dataset.mode = 'book'; }

    var box = $('.rm', rm);
    box.classList.remove('open');
    showModal(rm);
    if (!viewer) viewer = new window.Room3D($('#r3host'));
    viewer.show(t.look, reduce);
    clearTimeout(openTimer);
    void box.offsetWidth;
    openTimer = setTimeout(function () { box.classList.add('open'); }, reduce ? 0 : 280);
  }
  function closeRoom() {
    clearTimeout(openTimer);
    $('.rm', rm).classList.remove('open');
    if (viewer) viewer.stop();
    hideModal(rm);
  }
  $$('[data-look]', rm).forEach(function (b) { b.addEventListener('click', function () { viewer && viewer.look(+b.dataset.look); }); });
  $('#rmBook').addEventListener('click', function () {
    var mode = this.dataset.mode, no = openNo;
    closeRoom();
    if (mode === 'book') { selectRoom(no); goReception(); }
    else if (mode === 'list') { openList(true); }
    else {
      var bb = $('#bbar');
      if (window.innerWidth <= 820) { bb.classList.add('open'); $('#bbarChip').setAttribute('aria-expanded', 'true'); }
      $('#bIn').focus();
      toast('Başqa tarix seçin və «Boş otaqları göstər» düyməsini basın');
    }
  });

  /* ---------- room list ---------- */
  var listFilter = 'all';
  function renderList() {
    var html = ROOMS.slice().sort(function (a, b) { return a.no.localeCompare(b.no); }).map(function (r) {
      var t = CAT.types[r.type], st = STATUS[r.no] || 'free', fits = B.adults + B.kids <= t.capacity;
      var hide = listFilter === 'free' && (st !== 'free' || !fits);
      return '<li class="' + (hide ? 'hide' : '') + '"><button type="button" data-no="' + r.no + '"><span class="no">' + r.no + '</span>' +
        '<span><span class="nm">' + esc(t.name) + '</span><span class="mt">' + t.size + ' m² · ' + esc(t.bed) + (fits ? '' : ' · maks. ' + t.capacity) + '</span><br><span class="status ' + st + '">' + STATUS_TXT[st] + '</span></span>' +
        '<span class="pr">' + money(t.price) + '<br><span class="mt">/ gecə</span></span></button></li>';
    }).join('');
    $('#rlist').innerHTML = html;
  }
  function openList(freeOnly) {
    if (freeOnly) { listFilter = 'free'; $$('.fchip').forEach(function (c) { c.classList.toggle('on', c.dataset.f === 'free'); }); renderList(); }
    showModal($('#listModal'));
  }
  $('#roomListBtn').addEventListener('click', function () { openList(false); });
  $$('.fchip').forEach(function (c) {
    c.addEventListener('click', function () {
      listFilter = c.dataset.f;
      $$('.fchip').forEach(function (x) { x.classList.toggle('on', x === c); });
      renderList();
    });
  });
  $('#rlist').addEventListener('click', function (e) {
    var b = e.target.closest('[data-no]');
    if (!b) return;
    var no = b.dataset.no, d = $('.door[data-no="' + no + '"]');
    hideModal($('#listModal'));
    var z = +d.dataset.z - 620;
    if (Math.abs(z - cur) < 200 || reduce) return openRoom(no);
    goDepth(z);
    var t0 = Date.now();
    (function wait() {
      if (Math.abs(target - cur) < 25 || Date.now() - t0 > 3500) openRoom(no);
      else requestAnimationFrame(wait);
    })();
  });

  /* ---------- reception / form ---------- */
  var rcp = $('#reception'), form = $('#resForm'), rcpPinned = false;
  function openReception() {
    rcp.hidden = false;
    requestAnimationFrame(function () { rcp.classList.add('on'); document.body.classList.add('rcp-open'); if (window.innerWidth < 900) document.documentElement.classList.add('rcp-lock'); });
    updateSummary();
  }
  function closeReception(silent) {
    rcp.classList.remove('on');
    document.body.classList.remove('rcp-open');
    document.documentElement.classList.remove('rcp-lock');
    rcpPinned = false;
    if (!silent) rcpDismissed = true;
  }
  function goReception() {
    rcpPinned = true;
    rcpDismissed = false;
    if (cur > CAM_MAX - 200) { openReception(); return; }
    goDepth(CAM_MAX);
    var t0 = Date.now();
    (function wait() {
      if (cur > CAM_MAX - 260 || Date.now() - t0 > 4000) { rcpAuto = true; openReception(); setTimeout(function () { $('#fFirst').focus({ preventScroll: true }); }, 450); }
      else requestAnimationFrame(wait);
    })();
  }
  $('#rcpClose').addEventListener('click', function () { closeReception(); });

  function fillRoomSelect() {
    var sel = $('#fRoom'), keep = sel.value;
    sel.innerHTML = '<option value="">Otaq seçin…</option>' + ROOMS.slice().sort(function (a, b) { return a.no.localeCompare(b.no); }).map(function (r) {
      var t = CAT.types[r.type], st = STATUS[r.no] || 'free';
      return '<option value="' + r.no + '"' + (st !== 'free' ? ' disabled' : '') + '>' + r.no + ' · ' + esc(t.name) + ' — ' + money(t.price) + (st !== 'free' ? ' (' + STATUS_TXT[st].toLowerCase() + ')' : '') + '</option>';
    }).join('');
    if (keep && STATUS[keep] === 'free') sel.value = keep;
    $('#fIn').value = B.in; $('#fOut').value = B.out;
    $('#fIn').min = iso(new Date()); $('#fOut').min = addDays(B.in, 1);
    $('#fAdults').value = String(B.adults); $('#fKids').value = String(B.kids);
    updateSummary();
  }
  function selectRoom(no) {
    if (STATUS[no] === 'free') $('#fRoom').value = no;
    updateSummary();
  }
  function updateSummary() {
    var no = $('#fRoom').value, s = $('#summary'), n = nights(B.in, B.out);
    if (!no) {
      s.className = 'summary empty';
      s.innerHTML = 'Otaq seçin və ya dəhlizdə istənilən qapıya toxunaraq otağı 3D görün. Seçilmiş tarixlər: <b>' + fmtD(B.in) + ' – ' + fmtD(B.out) + '</b> (' + n + ' gecə).';
      return;
    }
    var t = typeOf(no);
    s.className = 'summary';
    s.innerHTML = '<span class="sn">' + no + '</span><b>' + esc(t.name) + '</b><span>' + fmtD(B.in) + ' – ' + fmtD(B.out) + ' · ' + n + ' gecə · ' + (B.adults + B.kids) + ' qonaq</span><span class="tot">' + money(n * t.price) + '</span>';
  }
  $('#fRoom').addEventListener('change', function () { clearErr('room'); updateSummary(); });
  $('#fIn').addEventListener('change', function () { setDates(this.value, B.out); syncBar(); loadStatus(); });
  $('#fOut').addEventListener('change', function () { setDates(B.in, this.value); syncBar(); loadStatus(); });
  $('#fAdults').addEventListener('change', function () { B.adults = +this.value; syncBar(); applyStatus(); clearErr('adults'); });
  $('#fKids').addEventListener('change', function () { B.kids = +this.value; syncBar(); applyStatus(); clearErr('adults'); });

  function setErr(name, msg) {
    var em = $('[data-err="' + name + '"]', form);
    if (em) em.textContent = msg || '';
    var f = em && em.closest('.f');
    if (f) f.classList.toggle('bad', !!msg);
    var inp = form.elements[name];
    if (inp && inp.setAttribute) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  }
  function clearErr(name) { setErr(name, ''); }
  function validate(data) {
    var e = {};
    if (!data.room) e.room = 'Otaq seçin';
    if (data.first_name.length < 2) e.first_name = 'Adınızı yazın';
    if (data.last_name.length < 2) e.last_name = 'Soyadınızı yazın';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) e.email = 'E-poçt ünvanı düzgün deyil';
    if (!/^\+?[0-9 ()\-]{7,20}$/.test(data.phone)) e.phone = 'Telefon nömrəsi düzgün deyil (məs. +994 50 123 45 67)';
    if (!data.consent) e.consent = 'Davam etmək üçün razılıq verin';
    var t = data.room && typeOf(data.room);
    if (t && data.adults + data.children > t.capacity) e.adults = 'Bu otaq maksimum ' + t.capacity + ' nəfərlikdir';
    return e;
  }
  ['first_name', 'last_name', 'email', 'phone'].forEach(function (n) {
    form.elements[n].addEventListener('blur', function () {
      var d = collect(), e = validate(d);
      if (this.value.trim()) setErr(n, e[n] || '');
    });
    form.elements[n].addEventListener('input', function () { clearErr(n); });
  });
  form.elements.consent.addEventListener('change', function () { clearErr('consent'); });
  function collect() {
    return {
      room: $('#fRoom').value, in: B.in, out: B.out, adults: B.adults, children: B.kids,
      first_name: form.elements.first_name.value.trim(), last_name: form.elements.last_name.value.trim(),
      email: form.elements.email.value.trim(), phone: form.elements.phone.value.trim(),
      note: form.elements.note.value.trim(), consent: form.elements.consent.checked, website: form.elements.website.value
    };
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var data = collect(), errs = validate(data), fe = $('#formErr');
    ['room', 'in', 'out', 'adults', 'first_name', 'last_name', 'email', 'phone', 'note', 'consent'].forEach(function (k) { setErr(k, errs[k]); });
    fe.hidden = true;
    var first = Object.keys(errs)[0];
    if (first) { var el = form.elements[first]; el && el.focus && el.focus(); return; }
    if (OFFLINE) { fe.textContent = 'Server ilə əlaqə yoxdur. İnternet bağlantınızı yoxlayın və yenidən cəhd edin.'; fe.hidden = false; return; }
    var btn = $('#submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Göndərilir…';
    fetch('api/reserve.php', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Server cavab vermədi' }; }); })
      .then(function (j) {
        if (!j.ok) {
          if (j.fields) Object.keys(j.fields).forEach(function (k) { setErr(k, j.fields[k]); });
          fe.textContent = j.error || 'Xəta baş verdi';
          fe.hidden = false;
          if (j.fields && j.fields.room) loadStatus();
          return;
        }
        $('#doneCode').textContent = j.code;
        $('#doneText').textContent = 'Otaq ' + data.room + ', ' + fmtD(data.in) + ' – ' + fmtD(data.out) + ' (' + j.nights + ' gecə, ' + money(j.total) + '). Resepsiyon təsdiq etdikdən sonra ' + data.email + ' ünvanına məlumat göndəriləcək.';
        ssSet('mb_last', { code: j.code, email: data.email });
        form.hidden = true;
        $('#rcpDone').hidden = false;
        $('#rcpDone .btn').focus();
        form.reset();
        loadStatus();
      })
      .catch(function () { fe.textContent = 'Şəbəkə xətası. Yenidən cəhd edin.'; fe.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = 'Rezervasiya sorğusu göndər'; });
  });
  $('#doneBack').addEventListener('click', function () {
    $('#rcpDone').hidden = true; form.hidden = false; fillRoomSelect();
    closeReception(); goDepth(1400);
  });
  $('#doneStatus').addEventListener('click', function () { openStatus(); });

  /* ---------- status check ---------- */
  var stLbl = { pending: 'Təsdiq gözləyir', confirmed: 'Təsdiqlənib', rejected: 'Təsdiqlənmədi', cancelled: 'Ləğv edilib' };
  var stCls = { pending: 'pending', confirmed: 'free', rejected: 'booked', cancelled: 'closed' };
  function openStatus() {
    var last = ssGet('mb_last');
    if (last) { $('#stCode').value = last.code; $('#stEmail').value = last.email; }
    $('#stResult').innerHTML = '';
    showModal($('#statusModal'));
  }
  $('#statusBtn').addEventListener('click', openStatus);
  $('#stForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var res = $('#stResult');
    res.innerHTML = '<div class="st-res">Yoxlanılır…</div>';
    fetch('api/status.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('#stCode').value, email: $('#stEmail').value }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { res.innerHTML = '<div class="st-res"><b>' + esc(j.error) + '</b></div>'; return; }
        var r = j.reservation;
        res.innerHTML = '<div class="st-res"><span class="status ' + stCls[r.status] + '">' + stLbl[r.status] + '</span><b>' + esc(r.code) + ' · otaq ' + esc(r.room) + '</b><span>' + esc(r.type) + '</span><span>' + fmtD(r.in) + ' – ' + fmtD(r.out) + ' · ' + r.nights + ' gecə · ' + money(r.total) + '</span>' + (r.admin_note ? '<span>Resepsiyonun qeydi: ' + esc(r.admin_note) + '</span>' : '') + '</div>';
      })
      .catch(function () { res.innerHTML = '<div class="st-res"><b>Şəbəkə xətası</b></div>'; });
  });

  /* ---------- nav ---------- */
  $$('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      var g = b.dataset.go;
      if (g === 'reception') goReception();
      else if (g === 'rooms') goDepth(1050);
      else goDepth(+g - 650);
    });
  });

  /* ---------- boot ---------- */
  fetch('assets/data/rooms.json').then(function (r) { return r.json(); }).then(function (c) {
    CAT = c; ROOMS = c.rooms;
    var saved = ssGet('mb_b');
    var today = iso(new Date());
    if (saved && saved.in >= today) { B = saved; } else { B.in = today; B.out = addDays(today, 1); }
    setDates(B.in, B.out);
    buildCorridor();
    doors = $$('.door');
    layout();
    syncBar();
    fillRoomSelect();
    read(); cur = target;
    requestAnimationFrame(frame);
    loadStatus();
    setInterval(function () { if (!document.hidden) loadStatus(); }, 60000);
  }).catch(function () { toast('Məlumat yüklənmədi. Səhifəni yeniləyin.', true); });
})();
