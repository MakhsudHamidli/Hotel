<?php
require __DIR__ . '/auth.php';

if (!is_admin()) fail('Giriş tələb olunur', 401);
$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && !hash_equals(csrf(), (string)($_SERVER['HTTP_X_CSRF'] ?? ''))) {
    fail('CSRF yoxlaması uğursuz oldu', 403);
}
$pdo = db();
$types = catalog()['types'];

function row_out(array $r, array $types): array
{
    $r['id'] = (int)$r['id'];
    $r['nights'] = (int)$r['nights'];
    $r['adults'] = (int)$r['adults'];
    $r['children'] = (int)$r['children'];
    $r['total'] = (float)$r['total'];
    $r['seen'] = (int)$r['seen'];
    $r['type_name'] = $types[$r['room_type']]['name'] ?? $r['room_type'];
    unset($r['ip']);
    return $r;
}

function guest_message(array $r, string $status, array $types): array
{
    $type = $types[$r['room_type']]['name'] ?? $r['room_type'];
    $h = catalog()['hotel'];
    if ($status === 'confirmed') {
        $title = 'Rezervasiyanız təsdiqləndi';
        $text = "Hörmətli {$r['first_name']}, {$h['name']} otelində rezervasiyanız təsdiqləndi. Kod: {$r['code']}. Otaq {$r['room_no']} ({$type}), "
            . az_date($r['check_in']) . " – " . az_date($r['check_out']) . ", {$r['nights']} gecə, " . number_format((float)$r['total'], 0, '.', ' ')
            . " AZN. Giriş {$h['checkIn']}-dan etibarən. Sizi gözləyirik!";
    } elseif ($status === 'rejected') {
        $title = 'Rezervasiya sorğunuz təsdiqlənmədi';
        $text = "Hörmətli {$r['first_name']}, təəssüf ki, {$r['code']} kodlu sorğunuzu seçdiyiniz tarixlər üçün təsdiqləyə bilmədik. Alternativ variantlar üçün bizimlə əlaqə saxlayın: {$h['phone']}.";
    } else {
        $title = 'Rezervasiyanız ləğv edildi';
        $text = "Hörmətli {$r['first_name']}, {$r['code']} kodlu rezervasiyanız ləğv edildi. Sualınız olarsa: {$h['phone']}.";
    }
    if (!empty($r['admin_note'])) $text .= ' Qeyd: ' . $r['admin_note'];
    return [$title, $text];
}

try {
    switch ($action) {
        case 'poll':
            $pending = (int)$pdo->query("SELECT COUNT(*) FROM reservations WHERE status='pending'")->fetchColumn();
            $unseen = (int)$pdo->query('SELECT COUNT(*) FROM reservations WHERE seen=0')->fetchColumn();
            $latest = $pdo->query('SELECT id, code, first_name, last_name, room_no, check_in, check_out, created_at FROM reservations WHERE seen=0 ORDER BY id DESC LIMIT 8')->fetchAll();
            $maxId = (int)$pdo->query('SELECT COALESCE(MAX(id),0) FROM reservations')->fetchColumn();
            json_out(['ok' => true, 'pending' => $pending, 'unseen' => $unseen, 'latest' => $latest, 'maxId' => $maxId]);

        case 'list':
            $status = (string)($_GET['status'] ?? 'all');
            $search = trim((string)($_GET['q'] ?? ''));
            $sql = 'SELECT * FROM reservations WHERE 1=1';
            $args = [];
            if (in_array($status, ['pending', 'confirmed', 'rejected', 'cancelled'], true)) {
                $sql .= ' AND status = ?';
                $args[] = $status;
            }
            if ($search !== '') {
                $sql .= ' AND (code LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR room_no LIKE ?)';
                $like = '%' . $search . '%';
                array_push($args, $like, $like, $like, $like, $like, $like);
            }
            $sql .= ' ORDER BY id DESC LIMIT 500';
            $q = $pdo->prepare($sql);
            $q->execute($args);
            json_out(['ok' => true, 'items' => array_map(fn($r) => row_out($r, $types), $q->fetchAll())]);

        case 'stats':
            $today = date('Y-m-d');
            $tomorrow = date('Y-m-d', strtotime('+1 day'));
            $st = room_statuses($today, $tomorrow);
            $occupied = count(array_filter($st, fn($s) => $s === 'booked' || $s === 'pending'));
            $q = $pdo->prepare("SELECT COUNT(*) FROM reservations WHERE status='confirmed' AND check_in = ?");
            $q->execute([$today]);
            $arrivals = (int)$q->fetchColumn();
            $q = $pdo->prepare("SELECT COALESCE(SUM(total),0) FROM reservations WHERE status='confirmed' AND substr(check_in,1,7) = ?");
            $q->execute([date('Y-m')]);
            $revenue = (float)$q->fetchColumn();
            json_out(['ok' => true,
                'pending' => (int)$pdo->query("SELECT COUNT(*) FROM reservations WHERE status='pending'")->fetchColumn(),
                'arrivals' => $arrivals,
                'occupancy' => count($st) ? round($occupied / count($st) * 100) : 0,
                'revenue' => $revenue,
            ]);

        case 'seen':
            $b = body();
            if (!empty($b['all'])) $pdo->exec('UPDATE reservations SET seen=1 WHERE seen=0');
            else $pdo->prepare('UPDATE reservations SET seen=1 WHERE id=?')->execute([(int)($b['id'] ?? 0)]);
            json_out(['ok' => true]);

        case 'status':
            if ($method !== 'POST') fail('POST tələb olunur', 405);
            $b = body();
            $id = (int)($b['id'] ?? 0);
            $new = (string)($b['status'] ?? '');
            $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 500);
            $notify = !isset($b['notify']) || !empty($b['notify']);
            if (!in_array($new, ['confirmed', 'rejected', 'cancelled', 'pending'], true)) fail('Status düzgün deyil');
            $q = $pdo->prepare('SELECT * FROM reservations WHERE id=?');
            $q->execute([$id]);
            $r = $q->fetch();
            if (!$r) fail('Tapılmadı', 404);
            if ($new === 'confirmed') {
                $c = $pdo->prepare("SELECT code FROM reservations WHERE id<>? AND room_no=? AND status='confirmed' AND check_in < ? AND check_out > ?");
                $c->execute([$id, $r['room_no'], $r['check_out'], $r['check_in']]);
                if ($other = $c->fetchColumn()) fail("Bu otaq həmin tarixlərdə artıq {$other} kodu ilə təsdiqlənib.", 409);
            }
            $pdo->prepare('UPDATE reservations SET status=?, admin_note=?, seen=1, updated_at=? WHERE id=?')
                ->execute([$new, $note, now(), $id]);
            $r['status'] = $new;
            $r['admin_note'] = $note;

            $result = ['mail' => null];
            if ($notify && $new !== 'pending') {
                [$title, $text] = guest_message($r, $new, $types);
                $inner = '<p style="font-size:15px;line-height:1.6">' . h($text) . '</p>' . ($new === 'confirmed' ? reservation_table($r) : '');
                $sent = send_mail($r['email'], $title . ' · ' . $r['code'], mail_layout($title, $inner));
                $result = ['mail' => $sent, 'text' => $text, 'title' => $title];
                $pdo->prepare('UPDATE reservations SET notify_result=? WHERE id=?')
                    ->execute([($sent ? 'E-poçt göndərildi ' : 'E-poçt göndərilmədi ') . now(), $id]);
            }
            $q->execute([$id]);
            json_out(['ok' => true, 'item' => row_out($q->fetch(), $types), 'notify' => $result]);

        case 'rooms':
            $in = (string)($_GET['in'] ?? date('Y-m-d'));
            $out = (string)($_GET['out'] ?? date('Y-m-d', strtotime('+1 day')));
            if (!valid_date($in) || !valid_date($out) || nights_between($in, $out) < 1) fail('Tarixlər düzgün deyil');
            $st = room_statuses($in, $out);
            $blocks = [];
            foreach ($pdo->query('SELECT * FROM room_blocks') as $bl) $blocks[$bl['room_no']] = $bl['reason'];
            $items = [];
            foreach (catalog()['rooms'] as $rm) {
                $items[] = ['no' => $rm['no'], 'type' => $types[$rm['type']]['name'], 'price' => $types[$rm['type']]['price'],
                    'status' => $st[$rm['no']], 'block' => $blocks[$rm['no']] ?? null];
            }
            json_out(['ok' => true, 'items' => $items]);

        case 'block':
            if ($method !== 'POST') fail('POST tələb olunur', 405);
            $b = body();
            $no = (string)($b['room'] ?? '');
            if (!find_room($no)) fail('Otaq tapılmadı', 404);
            if (!empty($b['closed'])) {
                $pdo->prepare('INSERT OR REPLACE INTO room_blocks (room_no, reason, created_at) VALUES (?,?,?)')
                    ->execute([$no, mb_substr(trim((string)($b['reason'] ?? 'Texniki xidmət')), 0, 120), now()]);
            } else {
                $pdo->prepare('DELETE FROM room_blocks WHERE room_no=?')->execute([$no]);
            }
            json_out(['ok' => true]);

        default:
            fail('Naməlum əməliyyat', 404);
    }
} catch (Throwable $e) {
    error_log('admin/api.php: ' . $e->getMessage());
    fail('Server xətası', 500);
}
