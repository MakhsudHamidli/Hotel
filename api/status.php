<?php
require __DIR__ . '/bootstrap.php';

$b = body();
$code  = strtoupper(trim((string)($b['code'] ?? '')));
$email = strtolower(trim((string)($b['email'] ?? '')));
if (!preg_match('/^MB-[A-Z0-9]{6}$/', $code) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail('Kod və ya e-poçt düzgün deyil');
}
$q = db()->prepare('SELECT * FROM reservations WHERE code = ? AND lower(email) = ?');
$q->execute([$code, $email]);
$r = $q->fetch();
if (!$r) fail('Rezervasiya tapılmadı', 404);
$t = catalog()['types'][$r['room_type']] ?? ['name' => $r['room_type']];
json_out(['ok' => true, 'reservation' => [
    'code' => $r['code'], 'status' => $r['status'], 'room' => $r['room_no'], 'type' => $t['name'],
    'in' => $r['check_in'], 'out' => $r['check_out'], 'nights' => (int)$r['nights'],
    'total' => (float)$r['total'], 'name' => $r['first_name'], 'admin_note' => (string)$r['admin_note'],
]]);
