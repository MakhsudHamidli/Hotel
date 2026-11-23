(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var STATUS = { pending: 'Gözləyir', confirmed: 'Təsdiqlənib', rejected: 'İmtina', cancelled: 'Ləğv edilib', free: 'Boş', booked: 'Dolu', closed: 'Bağlı' };
  var MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
  var state = { status: 'all', q: '', items: [], lastMax: null, sound: localGet('mb_sound') !== '0' };

  function localGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function d(s) { var p = String(s).slice(0, 10).split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1]; }
  function money(n) { return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₼'; }
  function ago(s) {
    var t = new Date(s.replace(' ', 'T')), m = Math.round((Date.now() - t) / 60000);
    if (isNaN(m)) return s;
    if (m < 1) return 'indicə';
    if (m < 60) return m + ' dəq əvvəl';
    if (m < 1440) return Math.round(m / 60) + ' saat əvvəl';
    return d(s) + ' ' + s.slice(11, 16);
  }

  function api(action, opts) {
    opts = opts || {};
    var url = 'api.php?action=' + action + (opts.query ? '&' + opts.query : '');
    var init = { credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (opts.body) {
      init.method = 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.headers['X-CSRF'] = window.CSRF;
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url, init).then(function (r) {
      if (r.status === 401) { location.reload(); throw new Error('auth'); }
      return r.json().then(function (j) { if (!j.ok) throw new Error(j.error || 'Xəta'); return j; });
    });
  }

  function toast(msg, err) {
    var el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 4500);
  }

  /* ---------- sound + browser notifications ---------- */
  var actx = null;
  function chime() {
    if (!state.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [880, 1320].forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.18;
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.55);
      });
    } catch (e) {}
  }
  function desktopNotify(item) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var n = new Notification('Yeni rezervasiya · ' + item.code, { body: item.first_name + ' ' + item.last_name + ' — otaq ' + item.room_no + ', ' + d(item.check_in) + ' – ' + d(item.check_out), tag: item.code });
      n.onclick = function () { window.focus(); openById(+item.id); };
    } catch (e) {}
  }
  function askPermission() {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }
  document.addEventListener('click', askPermission, { once: true });

  var soundBtn = $('#soundBtn');
  soundBtn.setAttribute('aria-pressed', String(state.sound));
  soundBtn.addEventListener('click', function () {
    state.sound = !state.sound;
    localSet('mb_sound', state.sound ? '1' : '0');
    soundBtn.setAttribute('aria-pressed', String(state.sound));
    if (state.sound) chime();
  });

  /* ---------- polling ---------- */
  var baseTitle = document.title;
  function poll() {
    api('poll').then(function (j) {
      var badge = $('#bellBadge');
      badge.hidden = j.unseen === 0;
      badge.textContent = j.unseen > 99 ? '99+' : j.unseen;
      document.title = (j.unseen ? '(' + j.unseen + ') ' : '') + baseTitle;
      renderBell(j.latest);
      if (state.lastMax !== null && j.maxId > state.lastMax) {
        var fresh = j.latest.filter(function (x) { return +x.id > state.lastMax; });
        chime();
        fresh.forEach(desktopNotify);
        toast(fresh.length > 1 ? fresh.length + ' yeni rezervasiya gəldi' : 'Yeni rezervasiya: ' + (fresh[0] ? fresh[0].code : ''));
        loadList();
        loadStats();
      }
      state.lastMax = j.maxId;
    }).catch(function () {});
  }
  function renderBell(list) {
    var box = $('#bellList');
    if (!list.length) { box.innerHTML = '<div class="bell-empty">Yeni bildiriş yoxdur</div>'; return; }
    box.innerHTML = list.map(function (x) {
      return '<button class="bell-item" data-id="' + x.id + '"><b>' + esc(x.first_name + ' ' + x.last_name) + ' · otaq ' + esc(x.room_no) + '</b><small>' + esc(x.code) + ' · ' + d(x.check_in) + ' – ' + d(x.check_out) + ' · ' + ago(x.created_at) + '</small></button>';
    }).join('');
  }
  var bellBtn = $('#bellBtn'), bellPop = $('#bellPop');
  bellBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    bellPop.hidden = !bellPop.hidden;
    bellBtn.setAttribute('aria-expanded', String(!bellPop.hidden));
  });
  document.addEventListener('click', function (e) { if (!bellPop.hidden && !bellPop.contains(e.target)) { bellPop.hidden = true; bellBtn.setAttribute('aria-expanded', 'false'); } });
  bellPop.addEventListener('click', function (e) {
    var b = e.target.closest('.bell-item');
    if (b) { bellPop.hidden = true; openById(+b.dataset.id); }
  });
  $('#markAll').addEventListener('click', function () {
    api('seen', { body: { all: true } }).then(function () { poll(); loadList(); });
  });

  /* ---------- stats ---------- */
  function loadStats() {
    api('stats').then(function (j) {
      $('#sPending').textContent = j.pending;
      $('#sArrivals').textContent = j.arrivals;
      $('#sOcc').textContent = j.occupancy + '%';
      $('#sRev').textContent = money(j.revenue);
    }).catch(function () {});
  }

  /* ---------- list ---------- */
  function loadList() {
    var q = 'status=' + state.status + '&q=' + encodeURIComponent(state.q);
    return api('list', { query: q }).then(function (j) {
      state.items = j.items;
      var rows = $('#rows');
      if (!j.items.length) { rows.innerHTML = '<tr><td colspan="7" class="empty">Rezervasiya tapılmadı</td></tr>'; return; }
      rows.innerHTML = j.items.map(function (r) {
        return '<tr data-id="' + r.id + '" class="' + (r.seen ? '' : 'new') + '" tabindex="0">' +
          '<td><span class="code">' + esc(r.code) + '</span></td>' +
          '<td>' + esc(r.first_name + ' ' + r.last_name) + '<span class="sub">' + esc(r.phone) + '</span></td>' +
          '<td>' + esc(r.room_no) + '<span class="sub">' + esc(r.type_name) + '</span></td>' +
          '<td>' + d(r.check_in) + ' – ' + d(r.check_out) + '<span class="sub">' + r.nights + ' gecə · ' + r.adults + (r.children ? '+' + r.children : '') + ' qonaq</span></td>' +
          '<td class="num">' + money(r.total) + '</td>' +
          '<td><span class="pill ' + r.status + '">' + STATUS[r.status] + '</span></td>' +
          '<td>' + ago(r.created_at) + '</td></tr>';
      }).join('');
    }).catch(function (e) { toast(e.message, true); });
  }
  $('#rows').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) openById(+tr.dataset.id); });
  $('#rows').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var tr = e.target.closest('tr[data-id]'); if (tr) openById(+tr.dataset.id); } });
  $$('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      $$('.chip').forEach(function (x) { x.classList.toggle('on', x === c); });
      state.status = c.dataset.status; loadList();
    });
  });
  var st;
  $('#search').addEventListener('input', function (e) { clearTimeout(st); st = setTimeout(function () { state.q = e.target.value.trim(); loadList(); }, 250); });

  /* ---------- drawer ---------- */
  var drawer = $('#drawer'), dBody = $('#dBody'), lastFocus = null;
  function openById(id) {
    var r = state.items.filter(function (x) { return x.id === id; })[0];
    if (r) return openDrawer(r);
    state.status = 'all'; state.q = '';
    $('#search').value = '';
    $$('.chip').forEach(function (x) { x.classList.toggle('on', x.dataset.status === 'all'); });
    loadList().then(function () {
      var r2 = state.items.filter(function (x) { return x.id === id; })[0];
      if (r2) openDrawer(r2);
    });
  }
  function waLink(phone, text) {
    var p = String(phone).replace(/[^0-9]/g, '');
    if (p.indexOf('0') === 0) p = '994' + p.slice(1);
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text);
  }
  function notifyBlock(r, n) {
    if (!n || !n.text) return '';
    var mail = 'mailto:' + encodeURIComponent(r.email) + '?subject=' + encodeURIComponent(n.title + ' · ' + r.code) + '&body=' + encodeURIComponent(n.text);
    return '<div class="d-notify"><b>' + (n.mail ? '✓ Müştəriyə e-poçt göndərildi' : 'Avtomatik e-poçt göndərilmədi — əl ilə göndərin') + '</b>' +
      '<span>' + esc(n.text) + '</span><div class="row">' +
      '<a class="btn btn-ghost" href="' + esc(mail) + '">E-poçt ilə yaz</a>' +
      '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + esc(waLink(r.phone, n.text)) + '">WhatsApp ilə yaz</a></div></div>';
  }
  function openDrawer(r, notify) {
    lastFocus = document.activeElement;
    var row = function (k, v) { return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; };
    dBody.innerHTML =
      '<div class="d-head"><small>Rezervasiya</small><h2 id="dTitle" class="code">' + esc(r.code) + '</h2><span class="pill ' + r.status + '">' + STATUS[r.status] + '</span></div>' +
      '<dl class="d-list">' +
      row('Qonaq', esc(r.first_name + ' ' + r.last_name)) +
      row('E-poçt', '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>') +
      row('Telefon', '<a href="tel:' + esc(r.phone.replace(/\s/g, '')) + '">' + esc(r.phone) + '</a>') +
      row('Otaq', esc(r.room_no + ' · ' + r.type_name)) +
      row('Giriş – çıxış', d(r.check_in) + ' – ' + d(r.check_out) + ' (' + r.nights + ' gecə)') +
      row('Qonaqlar', r.adults + ' böyük' + (r.children ? ', ' + r.children + ' uşaq' : '')) +
      row('Məbləğ', money(r.total)) +
      row('Yaradılıb', esc(r.created_at)) +
      (r.notify_result ? row('Bildiriş', esc(r.notify_result)) : '') +
      '</dl>' +
      (r.note ? '<p class="d-note"><b>Qonağın qeydi:</b>\n' + esc(r.note) + '</p>' : '') +
      '<div class="d-field"><label for="dNote">Müştəriyə qeyd (istəyə görə)</label><textarea id="dNote" placeholder="Məs.: Erkən giriş təsdiqləndi">' + esc(r.admin_note || '') + '</textarea></div>' +
      '<label class="d-check"><input type="checkbox" id="dNotify" checked> Müştəriyə avtomatik e-poçt göndər</label>' +
      '<div class="d-actions">' +
      (r.status !== 'confirmed' ? '<button class="btn btn-ok" data-act="confirmed">Təsdiqlə</button>' : '') +
      (r.status === 'pending' ? '<button class="btn btn-bad" data-act="rejected">İmtina et</button>' : '') +
      (r.status === 'confirmed' ? '<button class="btn btn-bad" data-act="cancelled">Ləğv et</button>' : '') +
      (r.status !== 'pending' && r.status !== 'confirmed' ? '<button class="btn btn-ghost" data-act="pending">Gözləməyə qaytar</button>' : '') +
      '</div>' + notifyBlock(r, notify);
    drawer.classList.add('on');
    drawer.setAttribute('aria-hidden', 'false');
    setTimeout(function () { var b = $('.d-actions .btn', dBody) || $('.drawer-x'); b && b.focus(); }, 50);
    if (!r.seen) api('seen', { body: { id: r.id } }).then(function () { r.seen = 1; poll(); var tr = $('tr[data-id="' + r.id + '"]'); tr && tr.classList.remove('new'); });

    $$('[data-act]', dBody).forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.act;
        if ((act === 'rejected' || act === 'cancelled') && !confirm(act === 'rejected' ? 'Bu sorğunu rədd etmək istəyirsiniz?' : 'Bu rezervasiyanı ləğv etmək istəyirsiniz?')) return;
        $$('[data-act]', dBody).forEach(function (x) { x.disabled = true; });
        b.textContent = 'Göndərilir…';
        api('status', { body: { id: r.id, status: act, note: $('#dNote').value, notify: $('#dNotify').checked } })
          .then(function (j) {
            toast(act === 'confirmed' ? 'Rezervasiya təsdiqləndi' : 'Status yeniləndi');
            var idx = state.items.findIndex(function (x) { return x.id === r.id; });
            if (idx > -1) state.items[idx] = j.item;
            openDrawer(j.item, j.notify);
            loadList(); loadStats();
          })
          .catch(function (e) { toast(e.message, true); openDrawer(r); });
      });
    });
  }
  function closeDrawer() {
    drawer.classList.remove('on');
    drawer.setAttribute('aria-hidden', 'true');
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  drawer.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('on')) closeDrawer(); });

  /* ---------- tabs + rooms ---------- */
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('.tab').forEach(function (x) { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', String(x === t)); });
      $('#view-res').hidden = t.dataset.view !== 'res';
      $('#view-rooms').hidden = t.dataset.view !== 'rooms';
      if (t.dataset.view === 'rooms') loadRooms();
    });
  });
  function iso(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
  var today = new Date(), tom = new Date(Date.now() + 864e5);
  $('#rIn').value = iso(today); $('#rOut').value = iso(tom);
  ['#rIn', '#rOut'].forEach(function (s) { $(s).addEventListener('change', loadRooms); });
  function loadRooms() {
    api('rooms', { query: 'in=' + $('#rIn').value + '&out=' + $('#rOut').value }).then(function (j) {
      $('#roomGrid').innerHTML = j.items.map(function (r) {
        return '<div class="room-card"><div class="row"><span class="no">' + esc(r.no) + '</span><span class="pill ' + r.status + '">' + STATUS[r.status] + '</span></div>' +
          '<span class="t">' + esc(r.type) + ' · ' + money(r.price) + '/gecə</span>' +
          (r.block ? '<span class="t">Səbəb: ' + esc(r.block) + '</span>' : '') +
          '<div class="row"><span></span><button class="btn btn-ghost" data-room="' + esc(r.no) + '" data-closed="' + (r.block ? '0' : '1') + '">' + (r.block ? 'Satışa aç' : 'Satışdan çıxar') + '</button></div></div>';
      }).join('');
    }).catch(function (e) { toast(e.message, true); });
  }
  $('#roomGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-room]');
    if (!b) return;
    var closed = b.dataset.closed === '1', reason = '';
    if (closed) { reason = prompt('Səbəb (məs. təmir):', 'Texniki xidmət'); if (reason === null) return; }
    api('block', { body: { room: b.dataset.room, closed: closed, reason: reason } }).then(function () { toast('Otaq ' + b.dataset.room + ' yeniləndi'); loadRooms(); loadStats(); })
      .catch(function (er) { toast(er.message, true); });
  });

  loadStats(); loadList(); poll();
  setInterval(poll, 10000);
  setInterval(loadStats, 60000);
})();
