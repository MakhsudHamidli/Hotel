<?php
require __DIR__ . '/auth.php';
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');

if (isset($_GET['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: ./');
    exit;
}

$error = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login'])) {
    if (!hash_equals(csrf(), (string)($_POST['csrf'] ?? ''))) {
        $error = 'Sessiya vaxtı bitib. Yenidən cəhd edin.';
    } else {
        $error = try_login(trim((string)($_POST['user'] ?? '')), (string)($_POST['pass'] ?? ''));
        if ($error === null) {
            header('Location: ./');
            exit;
        }
    }
}
$hotel = h(cfg('hotel_name'));
?><!doctype html>
<html lang="az">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Admin · <?= $hotel ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="admin.css?v=1">
</head>
<body>
<?php if (!is_admin()): ?>
<main class="login">
  <form method="post" class="login-card" autocomplete="on">
    <div class="brand"><span class="brand-mark">M</span><div><b>Admin panel</b><small><?= $hotel ?></small></div></div>
    <?php if ($error): ?><div class="alert" role="alert"><?= h($error) ?></div><?php endif; ?>
    <label for="user">İstifadəçi adı</label>
    <input id="user" name="user" autocomplete="username" required value="admin">
    <label for="pass">Şifrə</label>
    <input id="pass" name="pass" type="password" autocomplete="current-password" required autofocus>
    <input type="hidden" name="csrf" value="<?= h(csrf()) ?>">
    <button class="btn btn-dark btn-block" name="login" value="1">Daxil ol</button>
    <a class="back" href="../">← Sayta qayıt</a>
  </form>
</main>
<?php else: ?>
<header class="top">
  <div class="brand"><span class="brand-mark">M</span><div><b>Rezervasiya paneli</b><small><?= $hotel ?></small></div></div>
  <div class="top-actions">
    <button class="icon-btn" id="soundBtn" type="button" aria-pressed="true" title="Səs bildirişi">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>
    </button>
    <div class="bell-wrap">
      <button class="icon-btn" id="bellBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Bildirişlər">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        <span class="badge" id="bellBadge" hidden>0</span>
      </button>
      <div class="bell-pop" id="bellPop" hidden>
        <div class="bell-head"><b>Yeni rezervasiyalar</b><button type="button" class="link" id="markAll">Hamısını oxunmuş et</button></div>
        <div id="bellList" class="bell-list"></div>
      </div>
    </div>
    <a class="btn btn-ghost" href="../" target="_blank" rel="noopener">Sayt</a>
    <a class="btn btn-ghost" href="?logout=1">Çıxış</a>
  </div>
</header>

<main class="wrap">
  <section class="stats" aria-label="Göstəricilər">
    <div class="stat"><small>Təsdiq gözləyən</small><b id="sPending">–</b></div>
    <div class="stat"><small>Bu gün giriş</small><b id="sArrivals">–</b></div>
    <div class="stat"><small>Bu gecə doluluq</small><b id="sOcc">–</b></div>
    <div class="stat"><small>Bu ay gəlir (təsdiqlənmiş)</small><b id="sRev">–</b></div>
  </section>

  <nav class="tabs" role="tablist">
    <button role="tab" class="tab on" data-view="res" aria-selected="true">Rezervasiyalar</button>
    <button role="tab" class="tab" data-view="rooms" aria-selected="false">Otaqlar</button>
  </nav>

  <section id="view-res">
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Status filtri">
        <button class="chip on" data-status="all">Hamısı</button>
        <button class="chip" data-status="pending">Gözləyir</button>
        <button class="chip" data-status="confirmed">Təsdiqlənib</button>
        <button class="chip" data-status="rejected">İmtina</button>
        <button class="chip" data-status="cancelled">Ləğv</button>
      </div>
      <label class="search"><span class="sr">Axtarış</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="search" type="search" placeholder="Kod, ad, e-poçt, telefon, otaq">
      </label>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Kod</th><th>Qonaq</th><th>Otaq</th><th>Tarixlər</th><th class="num">Məbləğ</th><th>Status</th><th>Yaradılıb</th></tr></thead>
        <tbody id="rows"><tr><td colspan="7" class="empty">Yüklənir…</td></tr></tbody>
      </table>
    </div>
  </section>

  <section id="view-rooms" hidden>
    <div class="toolbar">
      <div class="date-range">
        <label>Giriş <input type="date" id="rIn"></label>
        <label>Çıxış <input type="date" id="rOut"></label>
      </div>
      <div class="legend"><span class="dot free"></span>Boş <span class="dot pending"></span>Gözləmədə <span class="dot booked"></span>Dolu <span class="dot closed"></span>Bağlı</div>
    </div>
    <div class="room-grid" id="roomGrid"></div>
  </section>
</main>

<aside class="drawer" id="drawer" aria-hidden="true">
  <div class="drawer-scrim" data-close></div>
  <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="dTitle">
    <button class="icon-btn drawer-x" data-close aria-label="Bağla">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    <div id="dBody"></div>
  </div>
</aside>
<div class="toasts" id="toasts" aria-live="polite"></div>
<script>window.CSRF = <?= json_encode(csrf()) ?>;</script>
<script src="admin.js?v=1"></script>
<?php endif; ?>
</body>
</html>
