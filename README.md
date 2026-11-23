# Baku Marriott Hotel Boulevard — 3D dəhliz və rezervasiya saytı (konsept)

İstifadəçi sayta girəndə otelin 7-ci mərtəbə dəhlizində olur. Aşağı sürüşdürdükcə dəhlizlə irəliləyir, qapıların üstündəki işıqlardan otağın boş/dolu olduğunu görür. Qapıya toxunanda qapı açılır və otağın içi 3D görünür (sürüşdürərək ətrafa baxmaq olur). «Rezerv et» düyməsi istifadəçini dəhlizin sonundakı resepsiyona aparır, orada forma doldurulur.

## Necə işləyir

| Hissə | Fayl |
|---|---|
| Sayt (dəhliz, 3D otaq, resepsiyon forması) | `index.html`, `assets/css/site.css`, `assets/js/app.js`, `assets/js/room3d.js` |
| Otaq tipləri, qiymətlər, otaq nömrələri | `assets/data/rooms.json` |
| API (boş/dolu, rezervasiya, status) | `api/rooms.php`, `api/reserve.php`, `api/status.php` |
| Admin panel | `admin/` → `https://<domen>/admin/` |
| Verilənlər bazası | SQLite, `public_html`-dən **kənarda**: `../hotel_data/hotel.sqlite` (yazmaq mümkün olmasa `data/`) |

### Rezervasiya axını
1. Qonaq formanı göndərir → status **Gözləyir** (otaq həmin tarixlər üçün sarı işıqla bağlanır, ikiqat rezerv mümkün deyil).
2. Admin panel hər 10 saniyədən bir yoxlayır: yeni rezervasiyada səs siqnalı, brauzer bildirişi, zəng nişanında say, tab başlığında `(n)`.
   `ADMIN_EMAIL` qurulubsa, admin e-poçtla da xəbər alır.
3. Admin **Təsdiqlə** / **İmtina et** / **Ləğv et** basır → müştəriyə avtomatik e-poçt gedir (PHP `mail()`).
   E-poçt alınmasa, panel eyni mətni **WhatsApp** və ya **e-poçt** ilə əl ilə göndərmək üçün düymələr göstərir.
4. Qonaq saytda «Rezervasiyam» düyməsi ilə kod + e-poçt yazıb statusu yoxlaya bilər.

## Deploy (GitHub Actions → Hostinger FTP)

`main` branch-ə hər push `.github/workflows/deploy.yml` ilə FTP-yə yüklənir.

Repo secrets:

| Secret | Məcburi | Təsvir |
|---|---|---|
| `FTP_SERVER` | ✔ | məs. `194.55.133.115` (`ftp://` yazılsa da olar) |
| `FTP_USERNAME` | ✔ | Hostinger FTP istifadəçisi |
| `FTP_PASSWORD` | ✔ | FTP şifrəsi |
| `FTP_SERVER_DIR` | ✔ | məs. `public_html/` |
| `ADMIN_PASSWORD` | ✔ | admin panel şifrəsi (istifadəçi adı: `admin`) |
| `ADMIN_EMAIL` | – | yeni rezervasiya bildirişlərinin gedəcəyi e-poçt |

Workflow bu dəyərlərdən serverdə `config.local.php` yaradır (repoya düşmür).

## Lokal işə salma

```bash
php -S localhost:8080
```
`config.local.php` faylı yaradın:
```php
<?php return ['admin_password' => 'test-şifrə', 'admin_email' => ''];
```

## Məzmunu dəyişmək
- Qiymətlər, sahələr, otaq tipləri: `assets/data/rooms.json` (`types`).
- Hansı nömrənin hansı tip olduğu: `rooms.json` → `rooms`.
- 3D otağın görünüşü: hər tipin `look` hissəsi (`wall`: `panel|marble|stone`, `view`: `sea-day|sea-sunset|sea-night|city-day|city-night`, `beds`: `king|twin|family`, `extras`: `desk, sofa, plant, bath, terrace`).

> Qeyd: qiymətlər, otaq sahələri və giriş/çıxış saatları nümunədir — otel tərəfindən təsdiqlənməlidir.
