/* Room3D — CSS 3D room renderer (no WebGL, no libraries).
   Coordinates: x → right, y → down, z → toward viewer. Room centre = origin. */
(function (global) {
  'use strict';
  var W = 760, H = 380, D = 640;          // room size (px)
  var FLOOR = H / 2, BACK = -D / 2;
  var EYE = 760, ZC = 117, EXT = 320, DD = D + EXT, ZO = EXT / 2;                 // camera perspective / room centre depth

  function el(cls, style) {
    var e = document.createElement('div');
    e.className = cls;
    if (style) e.style.cssText = style;
    return e;
  }

  // a single plane of size w×h, centred, then transformed
  function plane(parent, w, h, tf, bg, cls) {
    var f = el('r3-f' + (cls ? ' ' + cls : ''), 'width:' + w + 'px;height:' + h + 'px;margin:' + (-h / 2) + 'px 0 0 ' + (-w / 2) + 'px;transform:' + tf + ';background-color:' + (bg && bg.charAt(0) === '#' ? bg : 'transparent') + ';');
    if (bg && bg.charAt(0) !== '#') f.style.background = bg;
    parent.appendChild(f);
    return f;
  }

  // a solid cuboid centred at (x,y,z)
  function box(parent, o) {
    var b = el('r3-box', 'transform:translate3d(' + o.x + 'px,' + o.y + 'px,' + o.z + 'px)' + (o.ry ? ' rotateY(' + o.ry + 'deg)' : ''));
    var w = o.w, h = o.h, d = o.d, c = o.c;
    var faces = o.faces || {};
    plane(b, w, h, 'translateZ(' + d / 2 + 'px)', faces.front || c);
    plane(b, w, h, 'rotateY(180deg) translateZ(' + d / 2 + 'px)', faces.back || c, 'sh');
    plane(b, d, h, 'rotateY(90deg) translateZ(' + w / 2 + 'px)', faces.side || c, 'sh');
    plane(b, d, h, 'rotateY(-90deg) translateZ(' + w / 2 + 'px)', faces.side || c, 'sh');
    plane(b, w, d, 'rotateX(90deg) translateZ(' + h / 2 + 'px)', faces.top || c, 'hl');
    if (!o.noBottom) plane(b, w, d, 'rotateX(-90deg) translateZ(' + h / 2 + 'px)', c, 'sh');
    parent.appendChild(b);
    return b;
  }
  // box standing on the floor; lift = height above floor of its bottom
  function fbox(parent, o) {
    o.y = FLOOR - (o.lift || 0) - o.h / 2;
    o.noBottom = true;
    return box(parent, o);
  }
  // camera-facing light glow
  function glow(parent, x, y, z, s, op) {
    var g = el('r3-glow', 'width:' + s + 'px;height:' + s + 'px;left:' + (-s / 2) + 'px;top:' + (-s / 2) + 'px;transform:translate3d(' + x + 'px,' + y + 'px,' + z + 'px);opacity:' + (op || 1));
    parent.appendChild(g);
    return g;
  }

  /* ---------- materials ---------- */
  var M = {
    panel: 'linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,0) 35%,rgba(0,0,0,.25)),repeating-linear-gradient(90deg,#5d402b 0 30px,#3f2a1c 30px 32px),repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 6px)',
    marble: 'linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,0) 40%,rgba(0,0,0,.18)),linear-gradient(118deg,transparent 38%,rgba(110,96,82,.12) 39%,transparent 40%),linear-gradient(64deg,transparent 58%,rgba(110,96,82,.09) 59%,transparent 60%),linear-gradient(140deg,transparent 70%,rgba(160,130,90,.18) 71%,transparent 72%),radial-gradient(ellipse at 30% 30%,#f2ede5,#ddd4c6)',
    stone: 'linear-gradient(180deg,rgba(0,0,0,.2),rgba(0,0,0,0) 40%,rgba(0,0,0,.2)),repeating-linear-gradient(0deg,rgba(90,70,50,.18) 0 1px,transparent 1px 64px),repeating-linear-gradient(90deg,rgba(90,70,50,.12) 0 1px,transparent 1px 190px),linear-gradient(90deg,#cbbba3,#d8cab4,#c7b79e)',
    plaster: 'linear-gradient(90deg,rgba(0,0,0,.28),rgba(0,0,0,0) 60%),linear-gradient(180deg,#cfc5b6,#bdb2a2)',
    plasterR: 'linear-gradient(270deg,rgba(0,0,0,.28),rgba(0,0,0,0) 60%),linear-gradient(180deg,#cfc5b6,#bdb2a2)',
    floor: 'linear-gradient(0deg,rgba(0,0,0,0),rgba(0,0,0,.35)),repeating-linear-gradient(90deg,#8d6646 0 46px,#6d4d34 46px 48px),repeating-linear-gradient(0deg,transparent 0 158px,rgba(0,0,0,.28) 158px 160px)',
    ceil: 'radial-gradient(circle at 25% 40%,#fff7e4 0 5px,rgba(255,220,160,.3) 7px,transparent 40px),radial-gradient(circle at 75% 40%,#fff7e4 0 5px,rgba(255,220,160,.3) 7px,transparent 40px),radial-gradient(circle at 50% 80%,#fff7e4 0 5px,rgba(255,220,160,.3) 7px,transparent 40px),linear-gradient(0deg,rgba(0,0,0,.25),rgba(0,0,0,0)),#e8e2d8'
  };

  /* ---------- window views (Baku: Caspian + Flame Towers) ---------- */
  function flames(fill, lit) {
    var s = '<g fill="' + fill + '">' +
      '<path d="M40 100 C40 70 46 46 56 30 C62 50 66 72 66 100Z"/>' +
      '<path d="M66 100 C66 62 72 34 84 14 C92 40 96 70 94 100Z"/>' +
      '<path d="M94 100 C94 72 100 52 110 38 C116 58 120 78 118 100Z"/></g>';
    if (lit) s += '<g fill="none" stroke="#ff9a3c" stroke-width="1.2" opacity=".9"><path d="M42 98 C42 70 47 48 56 32 C61 52 64 72 64 98"/><path d="M68 98 C68 62 74 36 84 17 C91 41 94 70 92 98"/><path d="M96 98 C96 72 101 54 110 41 C115 59 118 78 116 98"/></g>';
    return s;
  }
  function city(fill, win, seed) {
    var s = '', x = 0, r = seed || 7;
    function rnd() { r = (r * 9301 + 49297) % 233280; return r / 233280; }
    while (x < 320) {
      var w = 14 + rnd() * 22, h = 20 + rnd() * 46;
      s += '<rect x="' + x.toFixed(1) + '" y="' + (100 - h).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + fill + '"/>';
      if (win) for (var yy = 100 - h + 4; yy < 96; yy += 6) for (var xx = x + 3; xx < x + w - 3; xx += 5) if (rnd() > .55) s += '<rect x="' + xx.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="1.8" height="2.2" fill="' + win + '"/>';
      x += w + 2;
    }
    return s;
  }
  function viewSVG(kind) {
    var sky, body;
    if (kind === 'sea-day') {
      sky = '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec6ea"/><stop offset="1" stop-color="#e6f2f7"/></linearGradient>';
      body = '<rect width="320" height="200" fill="url(#s)"/><g transform="translate(-10,40) scale(.9)">' + flames('#7f93a3') + '</g><g transform="translate(150,72) scale(1,.5)">' + city('#a9b6bf', null, 3) + '</g>' +
        '<rect y="118" width="320" height="82" fill="#3e88ad"/><rect y="118" width="320" height="3" fill="#cfe6f0" opacity=".7"/>' +
        '<g stroke="#e8f6fb" stroke-width="1.2" opacity=".55"><path d="M20 140h40M110 152h60M200 136h50M60 170h70M230 176h50"/></g>';
    } else if (kind === 'sea-sunset') {
      sky = '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a6b"/><stop offset=".55" stop-color="#e4572e"/><stop offset="1" stop-color="#ffc857"/></linearGradient>';
      body = '<rect width="320" height="200" fill="url(#s)"/><circle cx="210" cy="112" r="20" fill="#ffe2a2"/><g transform="translate(-6,34) scale(.95)">' + flames('#2a1d3d') + '</g>' +
        '<rect y="118" width="320" height="82" fill="#4a2c4f"/><path d="M190 122h40l-6 70h-28z" fill="#ffb35c" opacity=".55"/>' +
        '<g stroke="#ffcf8a" stroke-width="1.2" opacity=".6"><path d="M196 140h28M192 156h36M200 172h20"/></g>';
    } else if (kind === 'sea-night') {
      sky = '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1230"/><stop offset="1" stop-color="#2c2f5e"/></linearGradient>';
      body = '<rect width="320" height="200" fill="url(#s)"/><g fill="#fff" opacity=".7"><circle cx="40" cy="20" r=".9"/><circle cx="120" cy="34" r=".8"/><circle cx="260" cy="18" r="1"/><circle cx="300" cy="44" r=".7"/></g>' +
        '<g transform="translate(150,60) scale(1,.58)">' + city('#0b1022', '#ffd98a', 11) + '</g><g transform="translate(-6,34) scale(.95)">' + flames('#1a1430', true) + '</g>' +
        '<rect y="118" width="320" height="82" fill="#081227"/><g stroke="#ffb35c" stroke-width="1.4" opacity=".6"><path d="M60 128v40M84 124v50M110 130v30M200 126v34M250 128v26"/></g>';
    } else if (kind === 'city-day') {
      sky = '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7d3ee"/><stop offset="1" stop-color="#f4ead6"/></linearGradient>';
      body = '<rect width="320" height="200" fill="url(#s)"/><g transform="translate(150,20) scale(1.1)">' + flames('#8396a5') + '</g><g transform="translate(0,90) scale(1,1.1)">' + city('#c7bba8', '#9aa6ae', 5) + '</g>';
    } else { // city-night
      sky = '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1330"/><stop offset=".75" stop-color="#3a2a5c"/><stop offset="1" stop-color="#e07a5f"/></linearGradient>';
      body = '<rect width="320" height="200" fill="url(#s)"/><g transform="translate(140,20) scale(1.1)">' + flames('#140f24', true) + '</g><g transform="translate(0,92) scale(1,1.1)">' + city('#0a0f1d', '#ffd98a', 9) + '</g>';
    }
    return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice"><defs>' + sky + '</defs>' + body + '</svg>') + '") center/cover';
  }

  function windowOn(face, left, top, w, h, view) {
    var win = el('', 'position:absolute;left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h + 'px;background:' + view + ';box-shadow:0 0 0 8px #1b1612,0 0 60px rgba(255,255,255,.12)');
    var mull = el('', 'position:absolute;inset:0;background:linear-gradient(90deg,transparent calc(50% - 3px),#1b1612 calc(50% - 3px) calc(50% + 3px),transparent calc(50% + 3px)),linear-gradient(180deg,rgba(255,255,255,.14),transparent 40%)');
    win.appendChild(mull);
    face.appendChild(win);
    // sheer curtains
    face.appendChild(el('', 'position:absolute;left:' + (left - 46) + 'px;top:' + (top - 30) + 'px;width:52px;height:' + (h + 90) + 'px;background:repeating-linear-gradient(90deg,#efe7da 0 6px,#d9cfbf 6px 12px);opacity:.95;box-shadow:4px 0 10px rgba(0,0,0,.2)'));
    face.appendChild(el('', 'position:absolute;left:' + (left + w - 6) + 'px;top:' + (top - 30) + 'px;width:52px;height:' + (h + 90) + 'px;background:repeating-linear-gradient(90deg,#efe7da 0 6px,#d9cfbf 6px 12px);opacity:.95;box-shadow:-4px 0 10px rgba(0,0,0,.2)'));
    return win;
  }

  /* ---------- furniture ---------- */
  function bed(room, bx, bw, look) {
    var wood = look.accent, z0 = BACK + 14;
    var baseD = 290, bz = z0 + baseD / 2;
    fbox(room, { x: bx, z: z0 - 6, w: bw + 50, h: 200, d: 12, c: '#d6c8b0', faces: { front: 'repeating-linear-gradient(90deg,#dccfb8 0 30px,#c6b79c 30px 32px)' } });
    fbox(room, { x: bx, z: bz, w: bw, h: 38, d: baseD, c: wood, lift: 8 });
    fbox(room, { x: bx, z: bz, w: bw - 8, h: 26, d: baseD - 8, c: '#f8f6f1', lift: 46 });
    fbox(room, { x: bx, z: bz + 40, w: bw + 6, h: 8, d: 212, c: look.bedding, lift: 70 });
    fbox(room, { x: bx, z: bz + 100, w: bw + 10, h: 6, d: 64, c: look.throw, lift: 76 });
    var pw = bw > 160 ? bw / 2 - 16 : bw - 24;
    if (bw > 160) {
      fbox(room, { x: bx - bw / 4, z: z0 + 42, w: pw, h: 24, d: 44, c: '#ffffff', lift: 72 });
      fbox(room, { x: bx + bw / 4, z: z0 + 42, w: pw, h: 24, d: 44, c: '#ffffff', lift: 72 });
      fbox(room, { x: bx, z: z0 + 64, w: 60, h: 20, d: 18, c: look.throw, lift: 72 });
    } else {
      fbox(room, { x: bx, z: z0 + 42, w: pw, h: 24, d: 44, c: '#ffffff', lift: 72 });
    }
  }
  function nightstand(room, x, look, lamp) {
    fbox(room, { x: x, z: BACK + 40, w: 56, h: 54, d: 44, c: look.accent });
    if (lamp !== false) {
      fbox(room, { x: x, z: BACK + 40, w: 6, h: 30, d: 6, c: '#b8935a', lift: 54 });
      fbox(room, { x: x, z: BACK + 40, w: 34, h: 28, d: 34, c: '#f3e6c8', lift: 80 });
      glow(room, x, FLOOR - 94, BACK + 70, 170, .9);
    }
  }
  function rug(room, x, z, w, d, c) {
    plane(room, w, d, 'translate3d(' + x + 'px,' + (FLOOR - 1) + 'px,' + z + 'px) rotateX(90deg)',
      'linear-gradient(90deg,' + c + ' 0 8px,#c9a46a 8px 10px,' + c + ' 10px calc(100% - 10px),#c9a46a calc(100% - 10px) calc(100% - 8px),' + c + ' calc(100% - 8px)),' + c);
  }
  function desk(room, z, look) {
    fbox(room, { x: 335, z: z, w: 76, h: 6, d: 170, c: look.accent, lift: 72 });
    fbox(room, { x: 335, z: z - 80, w: 70, h: 72, d: 6, c: '#1e1a17' });
    fbox(room, { x: 335, z: z + 80, w: 70, h: 72, d: 6, c: '#1e1a17' });
    fbox(room, { x: 330, z: z + 10, w: 34, h: 2, d: 46, c: '#c7c9cc', lift: 78 });
    fbox(room, { x: 262, z: z, w: 48, h: 10, d: 48, c: '#2b2b2b', lift: 44 });
    fbox(room, { x: 238, z: z, w: 8, h: 56, d: 48, c: '#2b2b2b', lift: 54 });
    fbox(room, { x: 262, z: z, w: 6, h: 44, d: 6, c: '#111' });
    fbox(room, { x: 345, z: z - 60, w: 6, h: 44, d: 6, c: '#b8935a', lift: 78 });
    glow(room, 340, FLOOR - 128, z - 50, 120, .8);
  }
  function sofa(room, z, look) {
    var c = '#d3c7b4';
    fbox(room, { x: 318, z: z, w: 100, h: 44, d: 210, c: c, lift: 6 });
    fbox(room, { x: 362, z: z, w: 24, h: 90, d: 210, c: c, lift: 6 });
    fbox(room, { x: 318, z: z - 104, w: 100, h: 64, d: 18, c: c, lift: 6 });
    fbox(room, { x: 318, z: z + 104, w: 100, h: 64, d: 18, c: c, lift: 6 });
    fbox(room, { x: 335, z: z - 40, w: 18, h: 40, d: 46, c: look.throw, lift: 50 });
    fbox(room, { x: 335, z: z + 40, w: 18, h: 40, d: 46, c: look.throw, lift: 50 });
    fbox(room, { x: 214, z: z, w: 70, h: 40, d: 100, c: look.accent, faces: { top: 'radial-gradient(ellipse at 30% 30%,#f3eee6,#d8d0c4)' } });
  }
  function plant(room, x, z) {
    fbox(room, { x: x, z: z, w: 40, h: 46, d: 40, c: '#2a2622' });
    var leaves = 'radial-gradient(ellipse 18px 40px at 30% 45%,#3f7a4c 0 60%,transparent 62%),radial-gradient(ellipse 16px 46px at 62% 35%,#2f6a3e 0 60%,transparent 62%),radial-gradient(ellipse 22px 36px at 48% 62%,#4b8a58 0 60%,transparent 62%),radial-gradient(ellipse 15px 32px at 80% 60%,#2b5f39 0 60%,transparent 62%),radial-gradient(ellipse 14px 30px at 15% 70%,#336f43 0 60%,transparent 62%)';
    [0, 60, 120].forEach(function (a) {
      plane(room, 110, 130, 'translate3d(' + x + 'px,' + (FLOOR - 46 - 62) + 'px,' + z + 'px) rotateY(' + a + 'deg)', leaves);
    });
  }
  function bath(room, x, z) {
    fbox(room, { x: x, z: z, w: 180, h: 58, d: 88, c: '#f6f4ef' });
    plane(room, 160, 68, 'translate3d(' + x + 'px,' + (FLOOR - 52) + 'px,' + z + 'px) rotateX(90deg)', 'radial-gradient(ellipse at 40% 40%,#cfe8f0,#8fc3d8)');
    fbox(room, { x: x - 86, z: z, w: 6, h: 40, d: 6, c: '#b8935a', lift: 58 });
  }
  function tv(face) {
    face.appendChild(el('', 'position:absolute;left:' + (170 + EXT) + 'px;top:120px;width:170px;height:98px;background:linear-gradient(135deg,#1a1d22,#08090b);box-shadow:0 0 0 4px #050505,0 8px 20px rgba(0,0,0,.4)'));
  }
  function art(face, left, top, w, h) {
    face.appendChild(el('', 'position:absolute;left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h + 'px;border:6px solid #1c140d;box-shadow:0 0 0 1px #b8935a,0 6px 14px rgba(0,0,0,.35);background:radial-gradient(circle at 72% 30%,#e7b768 0 9px,transparent 10px),repeating-linear-gradient(180deg,rgba(255,255,255,.25) 0 2px,transparent 2px 9px) 0 60%/100% 40% no-repeat,linear-gradient(180deg,#e6dac5 0 55%,#2d5f73 55%)'));
  }

  /* ---------- build ---------- */
  function build(host, look) {
    host.innerHTML = '';
    var fit = el('r3-fit'), stage = el('r3-stage'), cam = el('r3-cam'), room = el('r3-room', 'transform:translateZ(' + ZC + 'px)');
    cam.appendChild(room); stage.appendChild(cam); stage.appendChild(el('r3-vig')); fit.appendChild(stage); host.appendChild(fit);

    var back = plane(room, W, H, 'translateZ(' + BACK + 'px)', M[look.wall] || M.panel);
    plane(room, W, DD, 'translate3d(0,' + FLOOR + 'px,' + ZO + 'px) rotateX(90deg)', M.floor);
    plane(room, W, DD, 'translate3d(0,' + (-H / 2) + 'px,' + ZO + 'px) rotateX(-90deg)', M.ceil);
    var left = plane(room, DD, H, 'translate3d(' + (-W / 2) + 'px,0,' + ZO + 'px) rotateY(90deg)', M.plaster);
    var right = plane(room, DD, H, 'translate3d(' + (W / 2) + 'px,0,' + ZO + 'px) rotateY(-90deg)', M.plasterR);
    // skirting + cove light
    [left, right, back].forEach(function (f) {
      f.appendChild(el('', 'position:absolute;left:0;right:0;bottom:0;height:12px;background:#2a1f17'));
      f.appendChild(el('', 'position:absolute;left:0;right:0;top:0;height:26px;background:linear-gradient(180deg,rgba(255,214,150,.5),transparent)'));
    });

    var view = viewSVG(look.view);
    windowOn(back, 440, 60, 270, 210, view);
    var extras = look.extras || [];
    if (extras.indexOf('terrace') > -1) {
      // floor-to-ceiling glass door to the terrace on the right wall (far part)
      var t = el('', 'position:absolute;left:40px;top:30px;width:220px;height:338px;background:' + view + ';box-shadow:0 0 0 8px #1b1612');
      t.appendChild(el('', 'position:absolute;left:0;right:0;bottom:0;height:70px;background:repeating-linear-gradient(90deg,#1b1612 0 3px,transparent 3px 18px),linear-gradient(180deg,#1b1612 0 4px,transparent 4px)'));
      t.appendChild(el('', 'position:absolute;inset:0;background:linear-gradient(90deg,transparent calc(50% - 3px),#1b1612 calc(50% - 3px) calc(50% + 3px),transparent calc(50% + 3px))'));
      right.appendChild(t);
    }
    tv(left);
    fbox(room, { x: -358, z: -10, w: 40, h: 56, d: 200, c: look.accent });

    // beds
    if (look.beds === 'twin') {
      bed(room, -250, 120, look); bed(room, -70, 120, look); nightstand(room, -160, look);
      art(back, 70, 30, 280, 70);
    } else if (look.beds === 'family') {
      bed(room, -230, 200, look); bed(room, -20, 110, look); nightstand(room, -105, look, true);
      art(back, 40, 24, 200, 70);
    } else {
      bed(room, -150, 230, look); nightstand(room, -305, look); nightstand(room, 5, look);
      art(back, 115, 24, 200, 76);
    }
    rug(room, look.beds === 'twin' ? -160 : -150, 30, 380, 210, look.rug);

    // right-side slots: back (z -210), mid (z 10), front (z 200)
    var used = {};
    if (extras.indexOf('bath') > -1) { bath(room, 220, -200); used.back = 1; }
    if (extras.indexOf('desk') > -1) { var dz = used.back ? 30 : -170; desk(room, dz, look); used[used.back ? 'mid' : 'back'] = 1; }
    if (extras.indexOf('sofa') > -1 && extras.indexOf('terrace') === -1) { sofa(room, used.mid ? 220 : 120, look); }
    else if (extras.indexOf('sofa') > -1) { sofa(room, 210, look); }
    if (extras.indexOf('plant') > -1) plant(room, -330, 220);

    // pendants above nightstands
    [-260, 20].forEach(function (x) {
      plane(room, 2, 110, 'translate3d(' + x + 'px,' + (-H / 2 + 55) + 'px,' + (BACK + 60) + 'px)', '#111');
      glow(room, x, -H / 2 + 118, BACK + 60, 90, .95);
    });
    return { stage: stage, cam: cam };
  }

  /* ---------- controller ---------- */
  function Room3D(host) {
    this.host = host;
    this.yaw = 0; this.pitch = 0; this.ty = 0; this.tp = 0;
    this.raf = 0; this.alive = false;
    var self = this, drag = null;
    this.onDown = function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, yaw: self.ty, pitch: self.tp };
      host.setPointerCapture && host.setPointerCapture(e.pointerId);
    };
    this.onMove = function (e) {
      if (!drag) return;
      var k = 960 / Math.max(320, host.clientWidth);
      self.ty = clamp(drag.yaw - (e.clientX - drag.x) * 0.12 * k, -32, 32);
      self.tp = clamp(drag.pitch + (e.clientY - drag.y) * 0.08 * k, -12, 10);
    };
    this.onUp = function () { drag = null; };
    host.addEventListener('pointerdown', this.onDown);
    host.addEventListener('pointermove', this.onMove);
    host.addEventListener('pointerup', this.onUp);
    host.addEventListener('pointercancel', this.onUp);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  Room3D.prototype.show = function (look, reduce) {
    this.parts = build(this.host, look);
    this.fit();
    this.yaw = reduce ? 0 : -16; this.ty = 0; this.pitch = 0; this.tp = 0;
    this.alive = true;
    var self = this;
    cancelAnimationFrame(this.raf);
    (function loop() {
      if (!self.alive) return;
      self.yaw += (self.ty - self.yaw) * (reduce ? 1 : 0.06);
      self.pitch += (self.tp - self.pitch) * (reduce ? 1 : 0.08);
      self.parts.cam.style.transform = 'rotateX(' + self.pitch.toFixed(3) + 'deg) rotateY(' + self.yaw.toFixed(3) + 'deg)';
      self.raf = requestAnimationFrame(loop);
    })();
  };
  Room3D.prototype.look = function (dir) {
    this.ty = dir === 0 ? 0 : clamp(this.ty + dir * 14, -32, 32);
    if (dir === 0) this.tp = 0;
  };
  Room3D.prototype.fit = function () {
    var fit = this.host.firstChild;
    if (!fit) return;
    var s = Math.max(this.host.clientWidth / 960, this.host.clientHeight / 600);
    fit.style.transform = 'scale(' + s.toFixed(4) + ')';
  };
  Room3D.prototype.stop = function () {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    var h = this.host;
    setTimeout(function () { if (!h.closest('.modal:not([hidden])')) h.innerHTML = ''; }, 400);
  };

  global.Room3D = Room3D;
})(window);
