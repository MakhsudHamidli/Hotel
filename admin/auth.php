<?php
require dirname(__DIR__) . '/api/bootstrap.php';

$secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_name('mbadmin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/admin', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Strict']);
session_start();

function is_admin(): bool
{
    return !empty($_SESSION['admin']) && ($_SESSION['exp'] ?? 0) > time();
}

function csrf(): string
{
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
    return $_SESSION['csrf'];
}

function too_many_attempts(string $ip): bool
{
    $q = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND ts > ?');
    $q->execute([$ip, time() - 900]);
    return (int)$q->fetchColumn() >= 8;
}

function try_login(string $user, string $pass): ?string
{
    $ip = client_ip();
    db()->prepare('DELETE FROM login_attempts WHERE ts < ?')->execute([time() - 86400]);
    if (too_many_attempts($ip)) return 'Çox sayda uğursuz cəhd. 15 dəqiqə sonra yenidən yoxlayın.';
    $expected = (string)cfg('admin_password');
    if ($expected === '') return 'Admin şifrəsi hələ qurulmayıb (config.local.php).';
    $ok = hash_equals((string)cfg('admin_user'), $user) && hash_equals($expected, $pass);
    if (!$ok) {
        db()->prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)')->execute([$ip, time()]);
        usleep(400000);
        return 'İstifadəçi adı və ya şifrə yanlışdır.';
    }
    session_regenerate_id(true);
    $_SESSION['admin'] = true;
    $_SESSION['exp'] = time() + 60 * 60 * 10;
    csrf();
    return null;
}
