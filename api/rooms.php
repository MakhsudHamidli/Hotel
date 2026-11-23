<?php
require __DIR__ . '/bootstrap.php';

$in  = (string)($_GET['in'] ?? date('Y-m-d'));
$out = (string)($_GET['out'] ?? date('Y-m-d', strtotime('+1 day')));
if (!valid_date($in) || !valid_date($out) || nights_between($in, $out) < 1) {
    fail('Tarixlər düzgün deyil');
}
try {
    json_out(['ok' => true, 'in' => $in, 'out' => $out, 'status' => room_statuses($in, $out)]);
} catch (Throwable $e) {
    error_log('rooms.php: ' . $e->getMessage());
    fail('Server xətası', 500);
}
