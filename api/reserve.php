<?php
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Yalnız POST', 405);
$b = body();

// honeypot: bots fill hidden fields
if (!empty($b['website'])) json_out(['ok' => true, 'code' => 'MB-000000']);

$errors = [];
$roomNo = trim((string)($b['room'] ?? ''));
$in     = trim((string)($b['in'] ?? ''));
$out    = trim((string)($b['out'] ?? ''));
$adults = (int)($b['adults'] ?? 1);
$kids   = (int)($b['children'] ?? 0);
$first  = trim((string)($b['first_name'] ?? ''));
$last   = trim((string)($b['last_name'] ?? ''));
$email  = trim((string)($b['email'] ?? ''));
$phone  = trim((string)($b['phone'] ?? ''));
$note   = trim((string)($b['note'] ?? ''));

$room = find_room($roomNo);
if (!$room) $errors['room'] = 'Otaq seçin';
if (!valid_date($in)) $errors['in'] = 'Giriş tarixini seçin';
if (!valid_date($out)) $errors['out'] = 'Çıxış tarixini seçin';
if (!isset($errors['in']) && !isset($errors['out'])) {
    if ($in < date('Y-m-d')) $errors['in'] = 'Giriş tarixi keçmişdə ola bilməz';
    $n = nights_between($in, $out);
    if ($n < 1) $errors['out'] = 'Çıxış girişdən sonra olmalıdır';
    if ($n > 30) $errors['out'] = 'Maksimum 30 gecə';
}
if (mb_strlen($first) < 2 || mb_strlen($first) > 60) $errors['first_name'] = 'Adınızı yazın';
if (mb_strlen($last) < 2 || mb_strlen($last) > 60) $errors['last_name'] = 'Soyadınızı yazın';
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 120) $errors['email'] = 'E-poçt ünvanı düzgün deyil';
if (!preg_match('/^\+?[0-9 ()\-]{7,20}$/', $phone)) $errors['phone'] = 'Telefon nömrəsi düzgün deyil (məs. +994 50 123 45 67)';
if (mb_strlen($note) > 600) $errors['note'] = 'Qeyd çox uzundur';
if ($adults < 1 || $adults > 6 || $kids < 0 || $kids > 6) $errors['adults'] = 'Qonaq sayı düzgün deyil';
if ($room && !isset($errors['adults'])) {
    $cap = catalog()['types'][$room['type']]['capacity'];
    if ($adults + $kids > $cap) $errors['adults'] = "Bu otaq maksimum {$cap} nəfərlikdir";
}
if (empty($b['consent'])) $errors['consent'] = 'Razılıq tələb olunur';
if ($errors) fail('Formada səhvlər var', 422, ['fields' => $errors]);

$pdo = db();
// rate limit: 5 reservations / hour / IP
$ip = client_ip();
$q = $pdo->prepare('SELECT COUNT(*) FROM reservations WHERE ip = ? AND created_at > ?');
$q->execute([$ip, date('Y-m-d H:i:s', time() - 3600)]);
if ((int)$q->fetchColumn() >= 5) fail('Çox sayda sorğu. Bir az sonra yenidən cəhd edin.', 429);

$type = catalog()['types'][$room['type']];
$nights = nights_between($in, $out);
$total = $nights * (float)$type['price'];

try {
    $pdo->exec('BEGIN IMMEDIATE');
    $st = room_statuses($in, $out)[$roomNo] ?? 'closed';
    if ($st !== 'free') {
        $pdo->exec('ROLLBACK');
        fail('Bu otaq seçilmiş tarixlərdə artıq tutulub. Başqa otaq və ya tarix seçin.', 409, ['fields' => ['room' => 'Otaq bu tarixlərdə doludur']]);
    }
    do {
        $code = new_code();
        $c = $pdo->prepare('SELECT 1 FROM reservations WHERE code = ?');
        $c->execute([$code]);
    } while ($c->fetchColumn());
    $ins = $pdo->prepare("INSERT INTO reservations
        (code, room_no, room_type, check_in, check_out, nights, adults, children, first_name, last_name, email, phone, note, total, status, seen, ip, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',0,?,?,?)");
    $ins->execute([$code, $roomNo, $room['type'], $in, $out, $nights, $adults, $kids, $first, $last, strtolower($email), $phone, $note, $total, $ip, now(), now()]);
    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->exec('ROLLBACK');
    error_log('reserve.php: ' . $e->getMessage());
    fail('Server xətası. Zəhmət olmasa yenidən cəhd edin.', 500);
}

$q = $pdo->prepare('SELECT * FROM reservations WHERE code = ?');
$q->execute([$code]);
$r = $q->fetch();

// Optional e-mail to the admin (the admin panel itself is notified via polling regardless)
if (cfg('admin_email')) {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $link = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '') . '/admin/';
    send_mail((string)cfg('admin_email'), "Yeni rezervasiya: {$code} · otaq {$roomNo}",
        mail_layout('Yeni rezervasiya sorğusu', reservation_table($r)
            . '<p style="margin:16px 0 0;font-size:14px">Telefon: ' . h($phone) . '<br>E-poçt: ' . h($email)
            . ($note !== '' ? '<br>Qeyd: ' . h($note) : '') . '</p>'
            . '<p style="margin:22px 0 0"><a href="' . h($link) . '" style="background:#1c1c1c;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-size:14px">Admin paneldə aç</a></p>'));
}

// Acknowledgement to the guest
send_mail($r['email'], "Rezervasiya sorğunuz qəbul edildi · {$code}",
    mail_layout('Sorğunuz qəbul edildi', '<p style="font-size:15px;line-height:1.6">Hörmətli ' . h($first)
        . ', rezervasiya sorğunuzu aldıq. Resepsiyonumuz qısa müddətdə təsdiq edəcək və sizə ayrıca məlumat göndərəcək.</p>'
        . reservation_table($r)));

json_out(['ok' => true, 'code' => $code, 'total' => $total, 'nights' => $nights]);
