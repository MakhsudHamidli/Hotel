<?php
declare(strict_types=1);

date_default_timezone_set('Asia/Baku');
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('APP_ROOT', dirname(__DIR__));

/* ---------- config ---------- */
$CONFIG = [
    'admin_user'     => 'admin',
    'admin_password' => '',          // set in config.local.php (generated at deploy)
    'admin_email'    => '',          // optional: new-reservation e-mails go here
    'mail_from'      => '',          // optional: defaults to noreply@<host>
    'hotel_name'     => 'Baku Marriott Hotel Boulevard',
];
if (is_file(APP_ROOT . '/config.local.php')) {
    $local = require APP_ROOT . '/config.local.php';
    if (is_array($local)) {
        foreach ($local as $k => $v) {
            if ($v !== '' && $v !== null) $CONFIG[$k] = $v;
        }
    }
}

function cfg(string $key)
{
    global $CONFIG;
    return $CONFIG[$key] ?? null;
}

/* ---------- storage ---------- */
function data_dir(): string
{
    // Prefer a folder outside the web root; fall back to ./data (blocked by .htaccess).
    $candidates = [dirname(APP_ROOT) . '/hotel_data', APP_ROOT . '/data'];
    foreach ($candidates as $dir) {
        if (is_dir($dir) && is_writable($dir)) return $dir;
        if (!is_dir($dir) && @mkdir($dir, 0750, true)) return $dir;
    }
    throw new RuntimeException('No writable data directory');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO('sqlite:' . data_dir() . '/hotel.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    $pdo->exec("CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        room_no TEXT NOT NULL,
        room_type TEXT NOT NULL,
        check_in TEXT NOT NULL,
        check_out TEXT NOT NULL,
        nights INTEGER NOT NULL,
        adults INTEGER NOT NULL,
        children INTEGER NOT NULL DEFAULT 0,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        note TEXT,
        total REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        seen INTEGER NOT NULL DEFAULT 0,
        admin_note TEXT,
        notify_result TEXT,
        ip TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_res_room ON reservations(room_no, check_in, check_out)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS room_blocks (room_no TEXT PRIMARY KEY, reason TEXT, created_at TEXT)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT, ts INTEGER)");
    return $pdo;
}

/* ---------- catalog ---------- */
function catalog(): array
{
    static $c = null;
    if ($c === null) {
        $c = json_decode((string)file_get_contents(APP_ROOT . '/assets/data/rooms.json'), true);
    }
    return $c;
}

function find_room(string $no): ?array
{
    foreach (catalog()['rooms'] as $r) {
        if ($r['no'] === $no) return $r;
    }
    return null;
}

/* ---------- helpers ---------- */
function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400, array $extra = []): void
{
    json_out(['ok' => false, 'error' => $msg] + $extra, $code);
}

function body(): array
{
    $raw = file_get_contents('php://input');
    $j = json_decode($raw ?: '[]', true);
    return is_array($j) ? $j : $_POST;
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

function valid_date(string $d): bool
{
    $dt = DateTime::createFromFormat('Y-m-d', $d);
    return $dt && $dt->format('Y-m-d') === $d;
}

function nights_between(string $in, string $out): int
{
    return (int)(new DateTime($in))->diff(new DateTime($out))->format('%r%a');
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

function new_code(): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $s = '';
    for ($i = 0; $i < 6; $i++) $s .= $chars[random_int(0, strlen($chars) - 1)];
    return 'MB-' . $s;
}

/**
 * Room status for a date range.
 * Returns: free | pending | booked | closed
 */
function room_statuses(string $in, string $out): array
{
    $st = [];
    foreach (catalog()['rooms'] as $r) $st[$r['no']] = 'free';
    foreach (db()->query('SELECT room_no FROM room_blocks') as $b) {
        if (isset($st[$b['room_no']])) $st[$b['room_no']] = 'closed';
    }
    $q = db()->prepare("SELECT room_no, status FROM reservations
        WHERE status IN ('pending','confirmed') AND check_in < :out AND check_out > :in");
    $q->execute([':in' => $in, ':out' => $out]);
    foreach ($q as $r) {
        $no = $r['room_no'];
        if (!isset($st[$no]) || $st[$no] === 'closed') continue;
        if ($r['status'] === 'confirmed') $st[$no] = 'booked';
        elseif ($st[$no] === 'free') $st[$no] = 'pending';
    }
    return $st;
}

/* ---------- mail ---------- */
function send_mail(string $to, string $subject, string $html): bool
{
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $host = preg_replace('/^www\./', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $host = preg_replace('/[^a-z0-9.\-]/i', '', $host);
    $from = cfg('mail_from') ?: ('noreply@' . $host);
    $name = '=?UTF-8?B?' . base64_encode((string)cfg('hotel_name')) . '?=';
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        "From: {$name} <{$from}>",
        "Reply-To: {$from}",
        'X-Mailer: PHP/' . PHP_VERSION,
    ];
    $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail($to, $subj, $html, implode("\r\n", $headers), '-f' . $from);
}

function h($s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function az_date(string $d): string
{
    $m = ['', 'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
    $t = strtotime($d);
    return date('j', $t) . ' ' . $m[(int)date('n', $t)] . ' ' . date('Y', $t);
}

function mail_layout(string $title, string $inner): string
{
    $hotel = h(cfg('hotel_name'));
    return "<!doctype html><html><body style=\"margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#1c1c1c\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f4f4f4;padding:24px 0\"><tr><td align=\"center\">
<table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden\">
<tr><td style=\"background:#1c1c1c;color:#fff;padding:22px 28px;font-size:13px;letter-spacing:3px;text-transform:uppercase\">{$hotel}</td></tr>
<tr><td style=\"padding:28px\"><h1 style=\"font-size:22px;margin:0 0 14px\">" . h($title) . "</h1>{$inner}</td></tr>
<tr><td style=\"padding:18px 28px;background:#fafafa;color:#707070;font-size:12px\">" . h(catalog()['hotel']['address']) . "</td></tr>
</table></td></tr></table></body></html>";
}

function reservation_table(array $r): string
{
    $type = catalog()['types'][$r['room_type']]['name'] ?? $r['room_type'];
    $rows = [
        'Rezervasiya kodu' => '<b>' . h($r['code']) . '</b>',
        'Qonaq' => h($r['first_name'] . ' ' . $r['last_name']),
        'Otaq' => h($r['room_no'] . ' · ' . $type),
        'Giriş' => h(az_date($r['check_in'])) . ' · ' . h(catalog()['hotel']['checkIn']),
        'Çıxış' => h(az_date($r['check_out'])) . ' · ' . h(catalog()['hotel']['checkOut']),
        'Gecə sayı' => (int)$r['nights'],
        'Qonaqlar' => (int)$r['adults'] . ' böyük' . ((int)$r['children'] ? ', ' . (int)$r['children'] . ' uşaq' : ''),
        'Məbləğ' => number_format((float)$r['total'], 0, '.', ' ') . ' AZN',
    ];
    $html = '<table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px">';
    foreach ($rows as $k => $v) {
        $html .= "<tr><td style=\"padding:9px 0;border-bottom:1px solid #eee;color:#707070\">{$k}</td><td style=\"padding:9px 0;border-bottom:1px solid #eee;text-align:right\">{$v}</td></tr>";
    }
    return $html . '</table>';
}
