# CODEBASE — Dokumentasi Lengkap Kawah Putih

Dokumentasi **per folder, per file** untuk seluruh projek (backend, frontend, database, docker). Setiap file dijelaskan: apa isinya, fungsi penting, dan keterhubungannya dengan bagian lain.

- **Bagian 1** — Backend: inti aplikasi (cmd, bootstrap, config, middleware, pkg)
- **Bagian 2** — Backend: domain auth, user, role, booking, payments, ticketing, tickettype, verification
- **Bagian 3** — Backend: domain CMS, konten publik, analytics, audit, visitors
- **Bagian 4** — Frontend: konfigurasi, halaman (app/), komponen UI, providers
- **Bagian 5** — Frontend: features, services, hooks, lib, store, types, scripts
- **Bagian 6** — Database, Docker, dan file root
- **Bagian 7** — Bedah kode baris per baris: alur booking → payments → ticketing → frontend, plus catatan bug/utang teknis

---

# Bagian 1 — Backend: inti aplikasi (cmd, bootstrap, config, middleware, pkg)

Dokumentasi ini mencakup inti backend proyek KawahPutih: titik masuk biner (`cmd/`), penyusunan dependency graph aplikasi (`internal/bootstrap/`), konfigurasi & koneksi database (`internal/config/`), middleware HTTP (`internal/middleware/`), integrasi payment gateway (`internal/payment/midtrans/`), routing utama (`internal/routes/`), job latar (`internal/scheduler/`), seeding (`internal/seed/`), unggah berkas (`internal/upload/`), serta pustaka utilitas lintas-domain (`pkg/`). Modul `internal/domain/*` didokumentasikan di bagian lain.

## root backend (`.env.example`, `.env`, `go.mod`)

Folder ini adalah akar modul Go backend. `.env.example` adalah templat variabel lingkungan yang disalin menjadi `.env`, sedangkan `go.mod` mendefinisikan modul `github.com/KawahPutih/backend` dan seluruh dependensinya.

### backend/.env.example

Templat konfigurasi berisi komentar panduan dalam Bahasa Indonesia; tidak ada nilai default di kode untuk secret. Struktur variabelnya:

- `APP_ENV` — environment aplikasi: `local | development | test | production`; menentukan sejumlah perilaku (mode logger, validasi keamanan, driver database default).
- `APP_PORT` — port HTTP tempat API server mendengarkan (default 8080).
- `FRONTEND_URL` — origin frontend yang diizinkan CORS; boleh berisi daftar origin dipisah koma (multi-origin).
- `APP_DEMO_MODE` — mengizinkan simulasi pembayaran (forced SUCCESS) **hanya** untuk lokal; wajib `false` di production (server menolak start bila `true`).
- `REQUIRE_EMAIL_VERIFICATION` — menolak login akun yang belum memverifikasi email (default `true` di production).
- `DB_DRIVER` — `mysql` (utama) atau `sqlite` (fallback pengembangan, berbasis file; tidak pernah in-memory).
- `DB_SQLITE_PATH` — path file database SQLite bila `DB_DRIVER=sqlite`.
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — kredensial MySQL (diisi sendiri; docker compose mengisi host otomatis).
- `DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS` — batas koneksi pool database.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — secret HMAC untuk menandatangani access/refresh token; minimal 32 karakter, dibuat dengan `openssl rand -hex 32`, dan tidak boleh sama.
- `JWT_ACCESS_TTL_MINUTES`, `JWT_REFRESH_TTL_DAYS` — masa berlaku access token (menit) dan refresh token (hari).
- `JWT_ISSUER` — nilai claim `iss` pada JWT.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — konfigurasi pengiriman email; `SMTP_HOST` kosong berarti email hanya ditulis ke log (mode pengembangan).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` — OAuth Google untuk login; dikosongkan bila fitur tidak dipakai.
- `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` — gateway pembayaran Midtrans; wajib di production, kosong berarti gateway nonaktif dan UI menampilkan bahwa pembayaran online belum tersedia (tanpa QR/VA palsu).
- `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_PETUGAS_PASSWORD` — password akun staf saat seeding; akun hanya dibuat bila password disediakan (tidak ada password default, akun yang sudah ada tidak pernah ditimpa).

### backend/.env

File konfigurasi aktual yang disalin dari `.env.example` (header: "Disalin dari .env.example. Jangan commit file ini."). Struktur variabelnya identik dengan `.env.example` — memuat kumpulan kunci yang sama: `APP_ENV`, `APP_PORT`, `FRONTEND_URL`, `APP_DEMO_MODE`, `REQUIRE_EMAIL_VERIFICATION`, `DB_DRIVER`/`DB_SQLITE_PATH`/`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_MAX_OPEN_CONNS`/`DB_MAX_IDLE_CONNS`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`JWT_ACCESS_TTL_MINUTES`/`JWT_REFRESH_TTL_DAYS`/`JWT_ISSUER`, `SMTP_*`, `GOOGLE_*`, `MIDTRANS_*`, dan `SEED_*_PASSWORD`. Semua kunci sudah terisi nilainya, tetapi nilai-nilai tersebut (khususnya secret JWT, password database/SMTP/Midtrans, dan password seeding) tidak dikutip di sini karena bersifat rahasia. File ini dibaca `config.Load()` (lihat `internal/config/config.go`) via `godotenv.Load()`.

### backend/go.mod

Definisi modul `github.com/KawahPutih/backend` dengan Go 1.23. Dependensi langsung: `gin-gonic/gin` (HTTP framework), `glebarez/sqlite` (driver SQLite murni-Go untuk GORM), `gorm.io/gorm` + `gorm.io/driver/mysql` (ORM dan driver MySQL), `go-playground/validator/v10` (validasi struct), `golang-jwt/jwt/v5` (JWT HS256), `google/uuid` (ID UUID), `joho/godotenv` (memuat `.env`), `stretchr/testify` (testing), `go.uber.org/zap` (logging terstruktur), `golang.org/x/crypto` (bcrypt untuk hashing password), `golang.org/x/oauth2` (login Google), dan `golang.org/x/time` (rate limiter token bucket yang dipakai middleware). Bagian kedua berisi dependensi indirect (transitif) seperti `go-sql-driver/mysql`, `sonic` (serializer Gin), dan pustaka `modernc` untuk SQLite. Semua file di folder `cmd/`, `internal/`, dan `pkg/` berada di bawah path import modul ini.

## cmd

Folder `cmd` berisi titik masuk (entry point) biner backend: API server, scheduler job latar, dan biner pelengkap migration. Ketiganya memakai `internal/config` dan `pkg/logger` sebagai fondasi bersama.

### backend/cmd/migration/main.go

Biner no-op sengaja dibuat hanya untuk melengkapi struktur proyek: proyek memakai file SQL bernomor di `database/migrations/*.up.sql` yang dijalankan lewat `./scripts/migrate.sh`, bukan runner migrasi Go. Fungsi `main` hanya mencetak pesan pengarahan ke biner `migrate.sh` tersebut. Tidak terhubung ke file lain kecuali sebagai dokumentasi runtime.

### backend/cmd/scheduler/main.go

Titik masuk scheduler sebagai proses terpisah dari API server, berguna bila job latar perlu di-scale sendiri; pada skala sekarang sweeper juga berjalan in-process di `cmd/server`. File ini mendefinisikan serangkaian adapter no-op (`noopAuditLogger`, `noopBookingGateway`, `noopTicketIssuer`, `noopMidtransGateway`) yang mengimplementasikan interface domain `audit`, `booking`, `ticketing`, dan `payments` tanpa efek — karena scheduler hanya membutuhkan transisi status kedaluwarsa, bukan seluruh graph. `main` memuat config via `config.Load()`, inisialisasi logger (`applogger.Init`), koneksi database (`config.NewDatabase`), membangun `payments.NewService` dengan adapter no-op, lalu menjalankan `scheduler.NewExpiredBookingSweeper(paymentsService, 30 menit, 5 menit, log).Run(ctx)` dengan penanganan sinyal SIGINT/SIGTERM untuk shutdown anggun. Parameter service `false` menandakan demo mode nonaktif untuk proses ini.

### backend/cmd/server/bootstrap.go

Perek infrastruktur server: `connectInfra` membuka database lewat `config.Open` (level log GORM `Info` untuk env local, `Warn` selain itu), lalu memanggil `migrateAndSeed`. `migrateAndSeed` menjalankan `db.AutoMigrate` atas seluruh entitas domain secara berurutan — auth+role/user (`auth.User`, `auth.RefreshToken`, `auth.AuthToken`, `role.Role`, `role.Permission`), katalog (`package.Package`, `article.Article`, `gallery.Item`, `tickettype.TicketType`), konten (`destinationinfo`, `faq`, `facility`, `visitorrule`), transaksi (`booking.Booking`, `booking.BookingItem`, `payments.Payment`, `ticketing.Ticket`, `ticketing.ScanRecord`), dan `audit.AuditLog`. Karena tabel join `user_roles` tidak diekspor oleh package role, tabel ini dibuat manual lewat `CREATE TABLE IF NOT EXISTS` (idempoten). Terakhir memanggil `seed.Run(...)` dengan `SeedOptions{Env}`. Fungsi `buildApp` menyerahkan pembangunan graph service ke `bootstrap.Build` (lihat `internal/bootstrap/bootstrap.go`).

### backend/cmd/server/main.go

Titik masuk API server yang sengaja dibuat minimal: `main` memuat config (`config.Load()`), inisialisasi logger (`applogger.Init` + `applogger.L()` dengan `defer Sync()`), lalu memanggil tiga fungsi dari file saudaranya: `connectInfra(cfg, log)` (bootstrap.go) untuk database+migrasi+seed, `buildApp(cfg, db, log)` untuk membangun `bootstrap.App`, dan `runServer(cfg, app, log)` (server.go) untuk melayani HTTP. Komentar menegaskan bahwa pembagian ini memisahkan loading config dari bootstrap dan runtime.

### backend/cmd/server/router.go

File satu fungsi kecil: `buildRouter(app *bootstrap.App, log *zap.Logger) *gin.Engine` yang langsung menyerahkan ke `routes.NewRouter(app, log)` di `internal/routes/routes.go`. Tujuannya memisahkan pembentukan router dari siklus hidup HTTP server di `server.go`, sehingga pengujian router bisa dilakukan tanpa memulai listener.

### backend/cmd/server/server.go

Menjalankan siklus hidup HTTP server lewat `runServer`: mengatur `gin.SetMode(gin.ReleaseMode)` bila env `production`, membangun router via `buildRouter`, membuat `http.Server` dengan timeout Read/Write 15 detik dan Idle 60 detik, serta menjalankan sweeper booking kedaluwarsa **in-process** (`go app.Sweeper.Run(schedulerCtx)`) — pilihan disengaja untuk Docker satu-biner, sementara biner `cmd/scheduler` tersedia bila perlu dipisah. Listener berjalan di goroutine, lalu goroutine utama menunggu sinyal SIGINT/SIGTERM; saat shutdown, `cancelScheduler()` menghentikan sweeper dan `srv.Shutdown(ctx)` dengan grace period 15 detik mematikan server secara anggun. Terhubung ke `bootstrap.App` (sumber `Sweeper` dan handler) dan `config.Config` (port/env).

## internal/bootstrap

Folder ini menyusun seluruh dependency graph aplikasi: membuat repository → service → usecase → handler untuk tiap domain, serta adapter penyambung antar-domain agar domain tidak saling mengimpor langsung.

### backend/internal/bootstrap/adapters.go

Kumpulan adapter kecil yang menjembatani antarmuka antar domain (prinsip: domain tidak saling impor). Berisi: `ticketPricerAdapter` (memenuhi `booking.TicketPricer`; data tiket dari `tickettype.Service.GetMany`, jumlah terjual dari `booking.Repository.SoldByTicketOn`), `paymentStarterAdapter` (`booking` → `payments`: `StartPayment`, `ExpirePendingByBooking`, plus helper `toPaymentView` untuk mapping `payments.Payment` ke `booking.PaymentView`), `bookingPaymentReader` (closure yang mengambil snapshot pembayaran terbaru via `payments.Service.FindLatestForBooking`), `ticketStatusSyncerAdapter` (`booking` → `ticketing`: `SyncStatusForBooking` agar status e-tiket mengikuti override admin), `bookingCheckinAdapter` (`ticketing` → `booking`: `SetCheckedIn` saat scan gerbang dan `IsOwner` untuk membatasi akses e-tiket, membedakan `ErrNotFound`/`ErrNotOwner`), `bookingGatewayAdapter` (`payments` → `booking`: `GetSnapshot`, `MarkPaid`, `MarkExpired`, `GetResponse`, `SetStatusByAdmin`, `StalePendingIDs`), `ticketIssuerAdapter` (`payments` → `ticketing`: `IssueForBooking`, `GetByBookingID`), `bookingSalesAdapter` (`tickettype` ← `booking`: `SoldByTicketOn` untuk ketersediaan katalog publik), dan `auditLoggerAdapter` yang menyambungkan `audit.Service` ke interface `AuditLogger` milik `booking`, `payments`, dan `ticketing` (dicek saat kompilasi lewat `var _ booking.AuditLogger = ...` dst). Semua adapter ini dipakai oleh `bootstrap.Build` di `bootstrap.go`.

### backend/internal/bootstrap/bootstrap.go

Jantung wiring aplikasi. Mendefinisikan dua struct: `Graph` (referensi service inti booking/payments/ticketing) dan `App` (seluruh handler domain, `JWTManager`, `Sweeper`, dan `FrontendURL`). Fungsi `Build(cfg, db, log)` menyusun semuanya berurutan: pertama `jwtutil.NewManager` dan `mailer.New`; lalu tiap domain dibangun pola repo→service→usecase→handler (role, auth — dengan `primaryFrontendURL` diambil dari elemen pertama `FRONTEND_URL` ber-koma untuk link email, user, article, gallery, destinationinfo, faq, facility, visitorrule, package, tickettype). Adapter audit dibuat lebih dulu (`auditLoggerAdapter`) karena dipakai banyak domain. Domain booking dibangun dua tahap untuk memutus siklus dependensi: `bookingService` dibuat kosong dulu (`new(booking.Service)`), `bookingUsecase` dibuat dengan `ticketPricerAdapter`, kemudian setelah payments + ticketing siap, service-nya diisi ulang (`*bookingService = *booking.NewService(...)` dengan `paymentStarterAdapter` dan `ticketStatusSyncerAdapter`) dan `bookingHandler` dibuat ulang dengan `bookingPaymentReader`. Payments dibangun dengan `bookingGatewayAdapter`, `ticketIssuerAdapter`, `midtrans.NewGateway(cfg.Midtrans)`, dan flag `cfg.App.DemoMode`. Selanjutnya analytics, audit handler, public (memakai `ticketTypeService`), verification (memakai `ticketingService`), visitors, dan `sweeper := scheduler.NewExpiredBookingSweeper(paymentsService, 30 menit, 5 menit, log)`. Hasil `Build` dipakai `cmd/server/main.go` dan `routes.NewRouter`.

## internal/config

Folder konfigurasi aplikasi: memuat variabel lingkungan, memvalidasi keamanan konfigurasi, dan membuka koneksi database sesuai driver yang dipilih.

### backend/internal/config/config.go

Definisi struktur config dan loader-nya. Bagian atas: konstanta environment (`EnvLocal/EnvDevelopment/EnvTest/EnvProduction`) dan driver (`DriverMySQL/DriverSQLite`); struct `Config` berisi `AppConfig` (Env, Port, FrontendURL, `DemoMode`, `RequireVerifiedEmail`, `UploadDir`), `DatabaseConfig` (dengan metode `DSN()` yang menyusun DSN MySQL charset utf8mb4, parseTime, timezone Asia/Jakarta), `JWTConfig`, `SMTPConfig`, `GoogleOAuthConfig` (metode `Enabled()`), dan `MidtransConfig` (metode `Enabled()` = ServerKey terisi). Fungsi `Load()` memuat `.env` via `godotenv.Load()` lalu membaca setiap kunci dengan helper `getEnv`, `getEnvInt`, `getEnvBool` (fallback ke nilai default; default `DemoMode=true` hanya untuk local, `RequireVerifiedEmail` default `true` di production, driver default via `defaultDriver` — SQLite untuk env non-produksi, MySQL untuk produksi). Fungsi privat `isProduction` dan `isLocalLike` memisahkan kelas environment. `validate()` menegakkan keamanan sebelum server menerima request: driver tidak dikenal ditolak; SQLite hanya untuk env lokal; pada env non-lokal kedua JWT secret wajib ≥32 karakter dan berbeda, sedangkan di env lokal diisi secret dev-only otomatis; di production: `APP_DEMO_MODE` harus false, `MIDTRANS_SERVER_KEY` wajib, secret ber-"dev-only" ditolak, SQLite ditolak, dan `DB_PASSWORD` wajib. File ini dipakai semua biner (`cmd/server`, `cmd/scheduler`) dan `bootstrap.Build`.

### backend/internal/config/database.go

Membuka koneksi GORM sesuai driver. Fungsi `Open(cfg, gormLogLevel)` memilih dialector: `mysql.Open(cfg.DSN())` untuk MySQL/kosong, atau `sqlite.Open(dsn)` hasil `prepareSQLite` untuk SQLite. Setelah `gorm.Open`, koneksi `sql.DB` diambil untuk mengatur pool: `MaxOpenConns` (fallback 50), `MaxIdleConns` (fallback 10), `ConnMaxLifetime` bila >0; khusus SQLite koneksi dibatasi 1/1 karena penulisan serial agar tidak saling lock, lalu `Ping()` memastikan database respons. Fungsi `prepareSQLite` menormalkan path (default `data/kawahputih.db`), membiarkan URI `file:`/`:memory:` apa adanya (untuk unit test), membuat direktorinya bila perlu, dan menyusun DSN dengan pragma `busy_timeout(5000)`, `journal_mode(WAL)`, `foreign_keys(1)`. Komentar menegaskan SQLite tidak pernah in-memory di runtime sehingga data bertahan setelah restart. `NewDatabase` adalah alias kompatibilitas untuk biner scheduler. Dipanggil oleh `cmd/server/bootstrap.go` dan `cmd/scheduler/main.go`.

## internal/middleware

Middleware HTTP Gin lintas-endpoint: autentikasi & otorisasi, CORS/Request-ID, audit identitas, observability (logging & recovery), serta rate limiting berlapis.

### backend/internal/middleware/audit.go

`AuditMiddleware(jwtManager)` menyuntikkan identitas aktor ke context request untuk audit logging; dipasang global sebelum `RequireAuth` per-route sehingga identitas diambil dari JWT yang tanda tangannya diverifikasi (`jwtManager.ParseAccessToken` pada helper `actorFromHeader`), bukan dari nilai yang bisa dipalsukan client. Identitas (actorID, role pertama dari claims, ClientIP, User-Agent) ditulis ke context via `audit.WithAuditInfo`. `OptionalAuditMiddleware` adalah alias perilaku yang sama, dan `GetAuditActorID`/`GetAuditActorRole` membaca identitas dari context (memakai `CurrentUserID`/`CurrentRoles` dari `auth.go`). Dipakai di `routes.NewRouter` dan berpasangan dengan `internal/domain/audit`.

### backend/internal/middleware/auth.go

Autentikasi dan otorisasi per-request. Konstanta cookie: `AccessCookieName = "kpr_access_token"` dan `RefreshCookieName = "kpr_refresh_token"` (HttpOnly, hanya diatur backend; nama juga dibaca middleware Next.js). `RequireAuth(jwtManager)` menerima token dari header `Authorization: Bearer` atau cookie access; token kosong/token invalid mengembalikan 401 melalui `response.Unauthorized` lalu `Abort`. Ada perlindungan CSRF untuk sesi berbasis cookie: request dengan method mutasi (`isMutatingMethod`: POST/PUT/PATCH/DELETE) wajib membawa header `X-Requested-With: XMLHttpRequest`, yang tidak bisa dikirim form lintas situs tanpa preflight CORS. Klaim valid disimpan di context (`ctxUserIDKey`, `ctxRolesKey`). `RequireRole(allowed...)` memeriksa role (case-insensitive) terhadap role di context dan menolak dengan 403 bila tidak cocok. Helper pembaca: `CurrentUserID`, `CurrentRoles`, dan `HasRole` (untuk logika kepemilikan lebih halus). Dipakai luas oleh route per-domain dan `routes.go`.

### backend/internal/middleware/cors.go

Dua middleware ringan. `RequestID()` menandai setiap request dengan ID unik — dari header `X-Request-ID` bila ada, atau UUID baru — disimpan di context dan dikembalikan di header respons untuk tracing. `CORS(allowedOrigins)` mengizinkan origin frontend yang dikonfigurasi memanggil API dengan kredensial: origin dicek terhadap set origin yang diizinkan (dari `FRONTEND_URL`, boleh dipisah koma), dan hanya origin yang cocok mendapat `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true` — tidak pernah tanda bintang bila ada kredensial. Method/header yang diizinkan longgar (`Authorization, Content-Type, X-Requested-With, X-Request-ID`), request `OPTIONS` dijawab 204 langsung. Dipasang pertama di `routes.NewRouter` dengan origin hasil split `app.FrontendURL`.

### backend/internal/middleware/observability.go

Dua middleware observability sederhana. `RequestLogger(log)` mencatat setiap request setelah selesai (`c.Next()`) dengan field method, path, status, latency, dan IP. `Recovery(log)` menangkap panic dari handler (`defer recover`), mencatatnya sebagai error, mengembalikan 500 lewat `response.InternalError`, dan `Abort` agar server tidak mati. Keduanya dipasang di `routes.NewRouter` tepat setelah CORS.

### backend/internal/middleware/ratelimiter.go

Rate limiting berbasis `golang.org/x/time/rate`. Struktur `ipLimiterStore` menyimpan `rate.Limiter` per kunci (IP atau user ID) dalam map ber-mutex, dengan `evictLoop` goroutine yang menghapus entri tidak aktif >15 menit setiap 10 menit. Fungsi `RateLimit(rps, burst)` adalah limiter per-endpoint sederhana berdasarkan IP (dipakai endpoint sensitif seperti login/register). `TieredRateLimit(jwtManager)` adalah limiter global bertingkat: tamu 60 req/menit (per IP), pengguna 120 req/menit, admin 300 req/menit (per user ID); middleware membaca token Bearer untuk mengklasifikasi tier via `isAdminRole` (mengenali `ADMIN`/`admin` agar token lama tetap benar), dan token invalid **tidak** ditolak di sini (itu tugas `RequireAuth`) — hanya jatuh ke tier tamu. Kedua jenis limiter berlaku bersamaan (pelapisan disengaja). Dipasang global di `routes.NewRouter`.

## internal/payment/midtrans

Klien gateway pembayaran Midtrans Snap: membuat transaksi, memverifikasi webhook, dan mengecek status transaksi. Tidak bergantung pada framework HTTP apa pun selain net/http standar.

### backend/internal/payment/midtrans/gateway.go

Struct `Gateway` membungkus `Config` (ServerKey, ClientKey, IsProduction) dan `http.Client` ber-timeout 15 detik; dibuat via `NewGateway` (dipanggil `bootstrap.Build`). Metode `Configured()` menyatakan apakah Server Key terisi — tanpa itu transaksi dan verifikasi webhook dilarang berjalan (ini yang membuat UI menampilkan "pembayaran online belum tersedia"). URL dasar dipilih `snapBaseURL()`/`apiBaseURL()` antara produksi (`app.midtrans.com` / `api.midtrans.com`) dan sandbox. `CreateTransaction` mengirim payload Snap (`order_id`, `gross_amount`, detail customer) dengan Basic Auth (ServerKey sebagai username) ke `/transactions` dan mengembalikan `redirect_url` untuk halaman pembayaran. `VerifySignature(orderID, statusCode, grossAmount, signatureKey)` memeriksa `signature_key` webhook sesuai dokumentasi Midtrans — `sha512(order_id + status_code + gross_amount + ServerKey)` — dibandingkan dengan `hmac.Equal` agar tahan timing attack. `GetTransactionStatus` menanyakan status dan fraud status transaksi langsung ke API `/v2/{order_id}/status`. Ketiganya dipakai oleh `payments.Service` (domain payments) untuk alur bayar dan webhook.

## internal/routes

Folder routing utama: satu-satunya tempat yang mengimpor semua package domain sekaligus dan memasang middleware global.

### backend/internal/routes/routes.go

Penyusun router penuh via `NewRouter(app *bootstrap.App, log *zap.Logger) *gin.Engine`. Strukturnya berurutan: (1) `gin.New()` dipasangi middleware global — `CORS` (origin dari `app.FrontendURL` yang di-split koma), `Recovery`, `RequestLogger`, `RequestID`, `TieredRateLimit` (dipasang sebelum grup route apa pun agar mencakup endpoint publik), dan `AuditMiddleware`; (2) endpoint kesehatan `GET /healthz`; (3) grup `/api/v1` yang mengisi setiap domain lewat fungsi `RegisterRoutes` masing-masing — `auth`, `role`, `user`, `article`, `gallery`, `tourismpackage`, `booking`, `tickettype`, `payments`, `ticketing`, `analytics`, `visitors`, `public` (tanpa JWT manager karena publik), `verification`, `destinationinfo`, `faq`, `facility`, `visitorrule`; (4) route upload: `GET /uploads/:name` publik (membaca gambar) dan `POST /uploads` khusus `RequireAuth` + `RequireRole("ADMIN", "super_admin")`; (5) grup `/admin/audit` dengan `RequireAuth` + `RequireRole("ADMIN")` — manager sengaja tidak punya akses Aktivitas — yang mengisi `audit.RegisterRoutes`. Komentar header menegaskan file ini sengaja satu-satunya tempat semua domain bertemu. Dipanggil dari `cmd/server/router.go`.

## internal/scheduler

Job latar berkala. Saat ini hanya satu job: sweeper booking/pembayaran yang kedaluwarsa.

### backend/internal/scheduler/expired_booking.go

`ExpiredBookingSweeper` mengakhiri booking/pembayaran yang masih pending melewati jendela pembayaran; prinsipnya service payments yang memegang transisi status, sweeper hanya memutuskan KAPAN. Dibuat via `NewExpiredBookingSweeper(payments *payments.Service, window, interval time.Duration, log)` — dipakai dengan window 30 menit dan interval 5 menit. `Run(ctx)` memblokir dan berdetak selamanya (`time.Ticker` + `select` atas `ctx.Done()`), sehingga harus dipanggil di goroutine sendiri; setiap detak `sweepOnce` menghitung cutoff (`now - window`) dan memanggil `payments.ExpireStalePending(ctx, cutoff, 200)`, mencatat jumlah yang tersapu (`swept`) atau error ke log. Dipakai dua kali: in-process di `cmd/server/server.go` dan sebagai proses mandiri di `cmd/scheduler/main.go`.

## internal/seed

Data awal (seed) idempoten yang dijalankan setelah AutoMigrate: role, akun staf, katalog tiket, paket, artikel, galeri, dan konten informasional.

### backend/internal/seed/seed.go

File besar dengan struktur berurutan sebagai berikut. `SeedOptions{Env}` mengatur perilaku seeding; `Run(ctx, db, log, opts)` adalah orkestrator yang memanggil sepuluh fungsi seed secara berurutan dan membungkus error tiap tahap. `seedRoles` membuat empat role (`RoleAdmin`, `RoleManager`, `RolePetugas`, `RolePengunjung`) hanya bila belum ada. `seedUsers` membuat tiga akun staf (`admin@kawahputih.id`, `manager@kawahputih.id`, `petugas@kawahputih.id` — petugas membawa gate "Gerbang 1" dan shift pagi) **hanya** bila password disediakan lewat env `SEED_ADMIN_PASSWORD`/`SEED_MANAGER_PASSWORD`/`SEED_PETUGAS_PASSWORD`; tidak ada password default, password di-hash bcrypt cost 12 via `userRow` (insert langsung ke tabel `users` dengan `TableName()`), lalu role ditautkan lewat INSERT ke `user_roles`; akun yang sudah ada dilewati tanpa pernah ditimpa. `seedTicketTypes` menyisipkan ±20 jenis tiket nyata Kawah Putih (HTM WNI/WNA reguler & sunrise, Charge LHKP, Ontang Anting, kendaraan roda 2/4/6, penitipan helm, fotografer, kuda tunggang, panahan, Sunan Ibu, jembatan apung, skywalk canopy, prewedding, shooting) dengan **upsert berdasarkan kode**: bila belum ada dibuat, bila sudah ada nama/harga/kapasitas diperbarui dan diaktifkan kembali agar DB lama mengikuti tarif baru. Fungsi konten sisanya — `seedPackages` (3 paket wisata ber-slug), `seedArticles` (3 artikel ber-slug, status published), `seedGallery` (5 gambar Unsplash berkategori), `seedDestinationInfo` (satu entri informasi destinasi lengkap), `seedFAQs` (5 FAQ), `seedFacilities` (5 fasilitas), `seedVisitorRules` (4 aturan pengunjung dengan prioritas) — semuanya idempoten dengan pengecekan keberadaan berdasarkan kunci unik (slug/image_url/question/name/title). Dipanggil dari `migrateAndSeed` di `cmd/server/bootstrap.go`.

## internal/upload

Penanganan unggahan gambar konten (galeri dsb.) dan penyajiannya dari disk lokal, tanpa layanan penyimpanan eksternal.

### backend/internal/upload/handler.go

`Handler` menyimpan folder tujuan (`NewHandler(dir)`, diisi `cfg.App.UploadDir` oleh bootstrap). Konstanta: `maxUploadBytes = 5 MB` dan `publicPrefix = "/api/v1/uploads/"`; `allowedImageTypes` memetakan MIME yang dideteksi dari isi berkas ke ekstensi (jpeg/png/webp/gif). Metode `Upload` menerima multipart field `file`: memvalidasi keberadaan, ukuran ≤5 MB, membaca 512 byte pertama untuk deteksi tipe via `http.DetectContentType` (bukan mempercayai nama/ekstensi), lalu menyimpan berkas dengan nama UUID + ekstensi di `UPLOAD_DIR` (direktori dibuat bila perlu; berkas dihapus bila penyalinan gagal) dan mengembalikan URL relatif `publicPrefix + nama`. Metode `Serve` menyajikan gambar secara publik dengan proteksi path traversal — nama harus sama dengan `filepath.Base`-nya dan tidak memuat `/\` — menolak direktori, dan mengirim header `Cache-Control: public, max-age=31536000, immutable`. Dipasang di `routes.go` (`GET /uploads/:name` publik, `POST /uploads` admin) dan mengembalikan respons lewat `pkg/response`.

## pkg

Pustaka utilitas lintas-domain yang boleh diimpor siapa pun: error taksonomi, JWT, logger, mailer, envelope respons, slug, dan validasi.

### backend/pkg/apperror/apperror.go

Taksonomi `Kind` error (`validation`, `not_found`, `conflict`, `unauthorized`, `forbidden`, `internal`, `rate_limited`) yang dipakai file `errors.go` tiap domain untuk membangun error sentinel; domain tidak pernah membocorkan error DB mentah ke handler. Struct `AppError{Kind, Message, Code, Err}` mengimplementasikan `Error()` (prioritas Message, lalu Err, lalu Kind) dan `Unwrap()`. Konstruktor: `New`, `WithCode` (melampirkan kode katalog seperti `AUTH_001`, berantai), helper per-Kind (`NotFound`, `Validation`, `Conflict`, `Unauthorized`, `Forbidden`, `Internal` — internal selalu memakai pesan aman generik), dan `As` untuk ekstraksi via `errors.As`. Dipetakan ke HTTP oleh `http.go` di package yang sama.

### backend/pkg/apperror/http.go

Satu pintu pemetaan error → respons HTTP, dipanggil tiap `handler.go` domain agar semua domain merespons sama untuk kelas error yang sama. `WriteHTTP(c, err)` mengekstrak `AppError` via `As`; error bukan `AppError` dianggap internal (dicatat ke log, klien menerima pesan generik 500). Untuk `KindInternal`, helper `serverError` mencatat method/path/code/error asli ke `logger.L()` tanpa mengirim detail ke klien. `statusFor` memetakan Kind ke status: validation→422, not_found→404, conflict→409, unauthorized→401, forbidden→403, rate_limited→429, lainnya 500. Bentuk body `errorBody` menyerupai `response.Envelope` plus field `code` opsional; bila AppError punya kode katalog, dikirim langsung, bila tidak, fallback ke helper `response.*` (NotFound/Conflict/Unauthorized/Forbidden/TooManyRequests) agar envelope tetap konsisten. Komentar menegaskan 422 dua bentuk: KindValidation (pesan biasa, dari validasi bisnis service/usecase) vs 422 per-field (untuk binding di handler).

### backend/pkg/jwtutil/jwtutil.go

Manajer token JWT HS256 dengan secret terpisah untuk access dan refresh. `Claims` berisi `UserID`, `Email`, `Roles` plus `RegisteredClaims` (issuer, jti acak 16 byte dari `newJTI`, iat/nbf/exp). `Manager` dibuat via `NewManager(accessSecret, refreshSecret, accessTTL, refreshTTL, issuer)` dari config; `GenerateAccessToken`/`GenerateRefreshToken` keduanya men-serialisasi klaim yang sama dengan secret dan TTL berbeda (fungsi internal `generate`). `ParseAccessToken`/`ParseRefreshToken` mem-parsing dengan pengaman ketat: algoritma wajib HS256 (`WithValidMethods`, anti confusão alg), issuer wajib cocok, `exp` wajib ada (`WithExpirationRequired`), dan `UserID` tidak boleh kosong; kegagalan apa pun mengembalikan sentinel `ErrInvalidToken`. Dipakai oleh middleware auth/audit/ratelimiter, `auth` domain, dan `bootstrap.Build`.

### backend/pkg/logger/logger.go

Wrapper global di atas zap. `Init(env)` memilih konfigurasi: env `local` memakai `zap.NewDevelopmentConfig` dengan level berwarna; selain itu `zap.NewProductionConfig` dengan timestamp ISO8601; dibangun dengan `zap.AddCallerSkip(1)` agar pemanggil wrapper dilaporkan dengan benar. `L()` mengembalikan logger global (membuat logger produksi fallback bila belum di-init), dan `Sync()` menyiram buffer saat shutdown. Dipakai semua biner (`main.go` server & scheduler) dan utilitas seperti `apperror/http.go` serta `mailer`.

### backend/pkg/mailer/mailer.go

Abstraksi pengiriman email dengan dua implementasi di balik interface `Mailer` (metode `Send(ctx, to, subject, body)`): `smtpMailer` mengirim email HTML asli via `net/smtp` dengan `smtp.PlainAuth` (host/port/user/password/from dari config), dan `logMailer` menulis email ke log (mode pengembangan). `New(cfg, log)` memilih implementasi: bila `SMTP_HOST` kosong, memperingatkan "SMTP_HOST not configured" dan memakai `logMailer`. Gagal kirim dicatat ke log dan dikembalikan sebagai error. Dipakai domain auth (verifikasi email, reset password) melalui `bootstrap.Build`.

### backend/pkg/response/response.go

Definisi envelope JSON tunggal untuk semua endpoint: struct `Envelope{Success, Message, Data?, Meta?, Errors?}` dan `Meta{Page, Limit, Total, TotalPages}` (nama field cocok persis dengan spesifikasi paginasi), serta `FieldError{Field, Message}` untuk respons validasi 422. Helper sukses: `OK`, `Success` (alias kompatibilitas), `OKWithMeta`, `Created`. Helper gagal: `Fail(status, message, errs)` sebagai dasar untuk `BadRequest`, `ValidationFailed` (422 khusus validasi field — dibedakan dari 400 untuk body JSON rusak), `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `TooManyRequests`, dan `InternalError` (pesan default bila kosong). `BuildMeta(page, limit, total)` menghitung `total_pages` dari nilai query yang benar-benar dipakai. Dipakai hampir semua handler, middleware (auth, ratelimiter, observability, cors), dan upload handler.

### backend/pkg/slugutil/slugutil.go

Utilitas satu fungsi: `Generate(title)` menurunkan slug dengan menurunkan huruf menjadi kecil, mengganti semua karakter non-`[a-z0-9]` (regex `nonAlphanumeric`) menjadi `-`, lalu memangkas `-` di pinggir. Dipakai domain konten (article, package, dsb.) saat membuat entri ber-slug.

### backend/pkg/validation/middleware.go

Middleware validasi generik ber-Generic Go dan kumpulan struct request untuk endpoint umum. Tiga middleware: `ValidationMiddleware[T]` (bind `ShouldBindJSON`), `QueryValidationMiddleware[T]` (`ShouldBindQuery`), dan `ParamValidationMiddleware[T]` (`ShouldBindUri`) — semuanya mengubah `validator.ValidationErrors` menjadi `[]response.FieldError` berbahasa manusia (via `translateValidationError` di `validation.go`), mengembalikan 422 lewat `response.ValidationFailed`, dan menyimpan nilai tervalidasi di context (`validated_request`/`validated_query`/`validated_params`) yang dibaca ulang dengan getter generik `GetValidatedRequest`/`GetValidatedQuery`/`GetValidatedParams`. Bagian kedua berisi struct request dengan tag binding lengkap: `BookingCreateRequest` (+`BookingVisitorRequest`, `BookingItemRequest` — visit_date wajib `date_range`, items 1–10, quantity 1–20), `TicketCreateRequest` (kode alphanum, kategori oneof ENRANCE/TRANSPORT/SUNRISE/PACKAGE/ACTIVITY/SERVICE, status AKTIF/NONAKTIF), `PaymentProcessRequest` (forced SUCCESS/FAILED/EXPIRED), `ScannerValidateRequest`, dan rangkaian `Auth*Request` (login, register, forgot/reset/change password dengan password 8–72 karakter). Bagian akhir: `RateLimitConfig` + `RateLimiterMiddleware` (kerangka in-memory sederhana, implementasi menunggu — produksi disarankan Redis), `SecurityHeadersMiddleware` (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, CSP), dan `RequestSizeLimiterMiddleware` (pembatas ukuran body via `http.MaxBytesReader`). Berpasangan erat dengan `validation.go` dan `pkg/response`.

### backend/pkg/validation/validation.go

Mesin validasi berbasis `go-playground/validator/v10`. `init()` mendaftarkan enam validator kustom: `phone_id`, `date_future`, `date_range`, `no_sql_injection`, `no_xss`, `secure_string`. Bagian atas: `ValidateStruct` dan `ValidateVar` menghasilkan `[]FieldError` (tipe lokal, identik dengan `response.FieldError`) dan `translateValidationError` menerjemahkan tag validator menjadi pesan ramah. Validator kustom: `validateIndonesianPhone` (menormalkan awalan +62/62/8 → 0 lewat `normalizeIndonesianPhone`, lalu memeriksa 10–13 digit berawalan 08; nomor internasional `+kode` 8–15 digit juga diterima untuk WNA), `validateFutureDate` dan `validateDateRange` (tanggal `2006-01-02`, maksimal 60 hari ke depan — jendela pemesanan), `validateNoSQLInjection` dan `validateNoXSS` (daftar pola berbahaya: `union select`, `<script`, handler event, dll.), dan `validateSecureString` (menolak null byte dan karakter kontrol kecuali newline/tab/CR). Helper sanitasi: `SanitizeInput` (hapus null byte, trim, batas 10.000 karakter), `SanitizeEmail`, `SanitizePhone`; helper format: `IsValidEmail` (RFC 5322), `IsValidTicketCode` (3–20 alfanumerik), serta format ID — `IsValidBookingID` (`KP-YYYYMMDD-XXXXXX`), `IsValidPaymentID` (`PAY-YYYYMMDD-XXXXXX`), `IsValidTicketID` (`TKT-` + 10 hex). `ValidationRules` adalah struct berisi tag-tag aturan umum (Name/Email/Phone/Password/Note/Quantity/Date). Bagian terakhir adalah fungsi validasi tingkat use-case yang menggabungkan banyak aturan: `ValidateBookingRequest` (termasuk deteksi duplikat ticket_id dan batas 10 item), `ValidateTicketCreation`, `ValidatePaymentRequest`, `ValidateTicketVerification`, `ValidateAuthRequest`, dan `ValidateRegistrationRequest` (termasuk cek kecocokan confirm password). Dipakai middleware validasi di file kembarannya (`middleware.go`) dan domain yang memerlukan validasi manual.


---

# Bagian 2 — Backend: domain auth, user, role, booking, payments, ticketing, tickettype, verification

Dokumentasi ini mencakup seluruh file pada folder `backend/internal/domain/` untuk domain auth (10 file), user (10 file), role (10 file), booking (9 file), payments (6 file), ticketing (5 file), tickettype (9 file), dan verification (7 file) — total 66 file. Arsitektur yang dipakai konsisten berlapis: handler (HTTP/Gin) → usecase (koordinasi lintas domain) → service (aturan bisnis) → repository (GORM/persistensi), dengan DTO dan mapper sebagai jembatan antara entity dan respons JSON.

## domain/auth

Domain auth menangani seluruh siklus autentikasi: registrasi, login (password + Google OAuth), verifikasi email, lupa/reset/ganti password, serta penerbitan dan rotasi pasangan access/refresh token (JWT) yang disimpan sebagai cookie HttpOnly. Ini adalah pintu masuk utama API dan bergantung pada domain role (lewat interface `RoleProvider`) untuk menetapkan dan membaca role pengguna, serta pada middleware untuk nama cookie dan ekstraksi user dari JWT.

### backend/internal/domain/auth/dto.go
Berisi struktur request/response JSON domain auth: `RegisterRequest`, `LoginRequest`, `RefreshRequest`, `RequestEmailVerificationRequest`, `VerifyEmailRequest`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `ChangePasswordRequest`, `UpdateProfileRequest`, serta `AuthResponse` dan `UserResponse` (profil dengan role efektif, gate, shift, status verifikasi). Tag `validate` dipakai bersama `validator.go` untuk validasi deklaratif. `ChangePasswordRequest` sengaja tidak membatasi panjang password lama agar akun lama berpassword pendek tetap bisa menggantinya. `UserResponse` di sini juga menjadi bentuk profil yang dikembalikan endpoint `/auth/me`.

### backend/internal/domain/auth/entity.go
Mendefinisikan `Base` (ID UUID char(36), timestamp, soft-delete GORM dengan hook `BeforeCreate`) yang dipakai semua entity domain ini, plus entity `User` (tabel `users`, termasuk `GoogleID` pointer agar unik hanya untuk akun Google), `RefreshToken` (tabel `refresh_tokens`, menyimpan hash token, revoked, user agent, IP), dan `AuthToken` (tabel `auth_tokens` untuk token sekali pakai verifikasi email/reset password). Konstanta `PurposeVerifyEmail` dan `PurposeResetPassword` membedakan tujuan token. Entity ini adalah representasi GORM tabel users yang juga dipetakan ulang oleh domain user dengan struct `AdminUser`.

### backend/internal/domain/auth/errors.go
Kumpulan error domain berbasis `pkg/apperror`: `ErrUserNotFound` (USER_001), `ErrEmailAlreadyExists`, `ErrInvalidCredentials` (AUTH_001), `ErrAccountDeactivated`, `ErrInvalidToken`/`ErrTokenRevoked` (AUTH_002), `ErrEmailNotVerified` (AUTH_004), `ErrOAuthNotConfigured`, `ErrOAuthEmailUnverified`, `ErrCurrentPasswordWrong` (AUTH_003), `ErrPasswordNotSet`, dan `ErrPasswordReused`. Semua error dijadikan nilai var yang sama dan dipakai service/usecase, lalu ditulis ke HTTP oleh handler lewat `apperror.WriteHTTP`.

### backend/internal/domain/auth/handler.go
Handler HTTP (Gin) untuk semua endpoint auth; struct `Handler` membungkus `*Usecase` dan dibuat oleh `NewHandler`. Tiap method (`Register`, `Login`, `Me`, `UpdateProfile`, `ChangePassword`, `Refresh`, `Logout`, `RequestEmailVerification`, `VerifyEmail`, `ForgotPassword`, `ResetPassword`, `GoogleLogin`, `GoogleCallback`) melakukan bind JSON → `Validate` → validasi kekuatan password → panggil usecase → tulis error via `apperror.WriteHTTP`. Fungsi helper `setAuthCookies`/`clearAuthCookies` menaruh access & refresh token di cookie HttpOnly (refresh dibatasi path `/api/v1/auth`), dan `randomOAuthState` + cookie `kpr_oauth_state` melindungi OAuth dari login CSRF dengan perbandingan constant-time (`subtle.ConstantTimeCompare`). Handler mengambil user ID dari `middleware.CurrentUserID`.

### backend/internal/domain/auth/mapper.go
Satu-satunya tempat konversi entity `User` ke DTO `UserResponse` lewat fungsi `toUserResponse(u *User, roles []string)`. Fungsi ini menentukan role efektif tunggal pengguna dengan prioritas ADMIN > MANAGER > PETUGAS, default `PENGUNJUNG` (konstanta `rolePENGUNJUNG`), sementara JWT tetap membawa semua role untuk dicek middleware. Dipakai oleh usecase (Register/Login/Me/UpdateProfile/Refresh/GoogleLogin).

### backend/internal/domain/auth/repository.go
Kontrak persistensi `Repository` (dipakai service, bukan `*gorm.DB` langsung) dan implementasi GORM-nya `repository` yang dibuat oleh `NewRepository`. Method user: `CreateUser`, `FindUserByID`, `FindUserByEmail`, `FindUserByGoogleID`, `ExistsByEmail`, `UpdateUser`, `TouchLastLogin`. Method refresh token: `CreateRefreshToken`, `FindValidRefreshToken`, `RevokeRefreshToken`, `ConsumeRefreshToken` (rotasi sekali pakai atomik — dua request bersamaan tidak bisa sama-sama berhasil), `RevokeAllRefreshTokens`. Method auth token: `CreateAuthToken`, `FindValidAuthToken`, `MarkAuthTokenUsed` (konsumsi atomik), `InvalidatePendingAuthTokens`. Semua query memakai `WithContext`; record tidak ditemukan dikembalikan sebagai `nil, nil`.

### backend/internal/domain/auth/routes.go
`RegisterRoutes(rg, h, jwtManager)` memasang semua route auth di bawah `/auth`: `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `PATCH /profile`, `POST /email/verify/request`, `POST /email/verify`, `POST /password/forgot`, `POST /password/reset`, `POST /password/change` (semua dengan rate limit via `middleware.RateLimit`, dan `/me`, `/profile`, `/password/change` wajib `middleware.RequireAuth`), serta `GET /google/login` dan `GET /google/callback`. Fungsi ini dipanggil oleh `internal/routes/routes.go` yang merangkai seluruh domain.

### backend/internal/domain/auth/service.go
Inti aturan bisnis auth (443 baris): struct `Service` membawa `Repository`, `jwtutil.Manager`, `mailer.Mailer`, konfigurasi `GoogleOAuthConfig`, `frontendURL`, logger zap, dan flag `requireVerified`. Fungsi penting: `CreateUser` (normalisasi email/nama/telepon via `pkg/validation`, hash bcrypt cost 12), `Authenticate`, `IssueTokenPair` (access + refresh JWT, simpan hash refresh), `RefreshTokenPair` (rotasi sekali pakai), `ChangePassword` (tolak password sama, cabut semua refresh token), `RequestEmailVerification`/`VerifyEmail` dan `ForgotPassword`/`ResetPassword` (token acak SHA-256 hashed sekali pakai via `issueToken`, TTL 24 jam/1 jam, respons tidak membocorkan keberadaan email), serta `GoogleAuthURL`/`GoogleExchange` (OAuth Google: tukar kode, ambil userinfo, link akun existing atau buat baru terverifikasi). Tidak menyentuh `gin.Context` dan tidak memanggil domain lain — penerbitan token lintas domain diserahkan ke usecase.

### backend/internal/domain/auth/usecase.go
Lapisan koordinasi lintas domain satu-satunya yang boleh memanggil role: interface `RoleProvider` (`AssignDefaultRole`, `GetRoleNames`) didefinisikan di sini dan dipenuhi secara struktural oleh `role.Service`, diikat oleh bootstrap. `Usecase` membungkus `Service` dan `roles`; method `Register` membuat user → assign role default → kirim email verifikasi (kegagalan hanya di-log) → terbitkan token; `Login` autentikasi → ambil role → catat last login → terbitkan token; `Me`/`UpdateProfile` menyusun profil + role efektif; `Refresh` melakukan rotasi; `GoogleLogin` menukar kode lalu assign role dan terbitkan token. Method lain (`ChangePassword`, `Logout`, `VerifyEmail`, `ForgotPassword`, `ResetPassword`, `GoogleAuthURL`) adalah delegasi tipis ke service.

### backend/internal/domain/auth/validator.go
Validator per-package: instance `validate = validator.New()` (satu per domain, sesuai prinsip independensi) dan fungsi `Validate(s)` yang menerjemahkan `validator.ValidationErrors` menjadi `[]response.FieldError` dengan `friendlyMessage` untuk tag required/email/min/max. `ValidatePasswordStrength(field, password)` menegakkan kebijakan server: 8–72 byte (bukan karakter, karena bcrypt memotong di 72 byte) dengan minimal satu huruf besar, satu huruf kecil, satu angka; karakter khusus opsional. Dipanggil handler untuk register, change password, dan reset password.

## domain/user

Domain user menyediakan manajemen pengguna sisi admin: daftar semua pengguna (dengan pencarian dan pagination) serta aktivasi/deaktivasi akun. Domain ini memetakan tabel `users` yang sama dengan domain auth tetapi dengan struct pandangan sendiri (`AdminUser`) yang minimalis, dan bergantung pada domain role (via interface `RoleLister`) untuk menampilkan role tiap pengguna.

### backend/internal/domain/user/dto.go
DTO domain user: `SetActiveRequest` (payload `is_active` boolean untuk PATCH aktif/nonaktif) dan `AdminUserResponse` (id, name, email, phone, `is_active`, `is_verified`, `roles []string`). `AdminUserResponse` adalah bentuk yang dikembalikan endpoint admin daftar pengguna, disusun oleh mapper dari entity `AdminUser` plus daftar role dari domain role.

### backend/internal/domain/user/entity.go
Entity `AdminUser` — pandangan domain ini atas tabel `users` (TableName mengembalikan `users`): hanya identitas (ID, name, email, phone), status (`IsActive`, `IsVerified`), `CreatedAt`, dan `DeletedAt` (wajib agar GORM menyaring soft-delete otomatis). Tidak memuat `PasswordHash`, `GoogleID`, atau field token. Komentar menjelaskan bahwa dua domain memetakan tabel yang sama dengan struct berbeda adalah trade-off yang disengaja.

### backend/internal/domain/user/errors.go
Hanya berisi `ErrUserNotFound` berbasis `apperror.NotFound` dengan kode `USER_001` — kode sama seperti `auth.ErrUserNotFound` karena mewakili kondisi nyata yang sama. Dipakai service ketika `FindByID` tidak menemukan pengguna yang akan diubah statusnya.

### backend/internal/domain/user/handler.go
Handler Gin dengan struct `Handler{usecase}`. `List` membaca query `page`, `limit`, `search`, memanggil usecase, dan mengembalikan hasil dengan meta pagination (`response.OKWithMeta` + `response.BuildMeta`). `SetActive` bind `SetActiveRequest` lalu memanggil usecase dengan ID target dari `c.Param("id")` dan ID actor dari `middleware.CurrentUserID(c)` — actor ID dikirim agar tercatat sebagai `updated_by`.

### backend/internal/domain/user/mapper.go
Fungsi `toResponse(u AdminUser, roles []string) AdminUserResponse` yang menerjemahkan entity `AdminUser` plus daftar role ke DTO respons. Dipanggil usecase di `List` untuk tiap pengguna hasil query.

### backend/internal/domain/user/repository.go
Interface `Repository` (`List` dengan offset/limit/search LIKE pada name/email + total count, `FindByID`, `SetActive`) dan implementasi GORM `repository` dari `NewRepository`. `List` mengurutkan `created_at DESC`; `SetActive` melakukan `Updates` map `{"is_active": active, "updated_by": actorID}` pada baris dengan ID target. Record tidak ditemukan dikembalikan sebagai `nil, nil`.

### backend/internal/domain/user/routes.go
`RegisterRoutes` memasang dua endpoint di grup `/admin` yang dilindungi `RequireAuth` + `RequireRole("ADMIN")`: `GET /admin/users` (daftar pengguna) dan `PATCH /admin/users/:id/active` (ubah status aktif). Dipanggil oleh aggregator route internal.

### backend/internal/domain/user/service.go
`Service{repo}` dengan method `List` (delegasi ke repo, error dibungkus `apperror.Internal`) dan `SetActive` yang dulu memeriksa keberadaan pengguna (mengembalikan `ErrUserNotFound` bila tidak ada) sebelum memperbarui statusnya. Lapisan ini memisahkan logika pemeriksaan ada/tidak dari handler.

### backend/internal/domain/user/usecase.go
`Usecase{service, roles}` dengan interface `RoleLister` (`GetRoleNames`) — pola sama seperti `auth.RoleProvider`, dipenuhi `role.Service` secara struktural tanpa impor langsung. `List` menormalkan pagination lewat `normalizePaging` (page ≥ 1, limit default 20, maks 100), memanggil service, lalu untuk tiap pengguna mengambil role names dan memetakan ke `AdminUserResponse`. `SetActive` delegasi ke service.

### backend/internal/domain/user/validator.go
Validator minimal per-package: `validate = validator.New()` dan fungsi `Validate(s)` yang mengembalikan `[]response.FieldError` dengan pesan generik "`<Field>` is invalid". Saat ini dipakai untuk validasi payload sederhana domain user.

## domain/role

Domain role mengelola RBAC: empat role kanonik (ADMIN, MANAGER, PETUGAS, PENGUNJUNG), tabel permissions dengan relasi many2many, tabel join `user_roles`, penetapan role default kepada pengguna baru, penggantian role oleh admin, serta pencarian nama role suatu pengguna. Domain ini menjadi penyedia role untuk domain auth (via `RoleProvider`) dan user (via `RoleLister`) tanpa saling mengimpor struct.

### backend/internal/domain/role/dto.go
DTO role: `AssignRolesRequest` (array `roles` yang wajib minimal satu elemen, divalidasi `dive,required`) untuk endpoint penetapan role oleh admin, dan `RoleResponse` (ID, name, description, `permissions []string` opsional) yang dihasilkan mapper dari entity `Role` beserta kode permission-nya.

### backend/internal/domain/role/entity.go
Entity `Base` (UUID + soft-delete, hook `BeforeCreate`), `Role` (tabel `roles`, name unik, relasi many2many `role_permissions` ke `Permissions`), `Permission` (tabel `permissions`, code unik), dan struct join tidak diekspor `userRole` (tabel `user_roles`) yang sengaja tidak menjadi relasi GORM ke `auth.User` — domain ini tidak mengimpor struct User, relasi dimodelkan di level tabel. Konstanta nama role kanonik: `RoleAdmin`, `RoleManager`, `RolePetugas`, `RolePengunjung` dan `DefaultRoleName = RolePengunjung`; ejaan ini harus cocok dengan claim JWT dan `middleware.RequireRole` serta union `AppRole` frontend.

### backend/internal/domain/role/errors.go
Satu error: `ErrRoleNotFound` (`apperror.NotFound("Data role tidak ditemukan.")`), dikembalikan service ketika role default PENGUNJUNG tidak ditemukan di database saat `AssignDefaultRole`.

### backend/internal/domain/role/handler.go
Handler Gin `Handler{usecase}`: `List` mengembalikan semua role beserta permissions, dan `AssignToUser` bind `AssignRolesRequest` → `Validate` → panggil usecase `AssignRoles` dengan `userId` dari param path. Error ditulis via `apperror.WriteHTTP`, respons sukses via `response.OK`.

### backend/internal/domain/role/mapper.go
`toRoleResponse(r Role)` mengubah entity `Role` menjadi `RoleResponse` dengan mengekstrak kode permission ke slice string, dan `toRoleResponseList(roles []Role)` untuk daftar. Dipakai service `ListRoles`.

### backend/internal/domain/role/repository.go
Interface `Repository`: `ListRoles` (dengan `Preload("Permissions")`), `FindRoleByName`, `FindRolesByNames`, `GetRoleNamesForUser` (JOIN mentah `roles` × `user_roles`, tanpa traversal relasi lewat struct User), `UserHasAnyRole`, `AssignRole` (INSERT dengan `clause.OnConflict{DoNothing: true}` agar idempoten), dan `ReplaceRoles` (delete lalu insert ulang dalam satu transaksi — tanpa transaksi, crash di tengah bisa menyisakan akun tanpa role). Implementasi `repository` dibuat oleh `NewRepository(db *gorm.DB)`.

### backend/internal/domain/role/routes.go
`RegisterRoutes` memasang: `GET /admin/roles` dan `PUT /admin/users/:userId/roles`, keduanya dilindungi `RequireAuth` + `RequireRole("ADMIN")`; plus grup legacy `/super-admin` (`GET /super-admin/roles`, `PUT /super-admin/users/:userId/roles`) yang dipertahankan sebagai alias kompatibilitas klien lama dengan otorisasi sama ketatnya. Komentar menegaskan aplikasi hanya punya empat role kanonik dan penetapan role adalah kewenangan ADMIN.

### backend/internal/domain/role/service.go
`Service{repo}` dengan method `ListRoles`, `GetRoleNames` (nama-nama role suatu user — inilah yang memenuhi `auth.RoleProvider.GetRoleNames` dan `user.RoleLister`), `AssignDefaultRole` (idempoten: bila user sudah punya role, no-op; bila belum, cari role `DefaultRoleName` PENGUNJUNG dan assign — dipanggil domain auth saat registrasi/login Google), dan `ReplaceRoles` (menerjemahkan nama role ke ID lalu menukar seluruh role user secara atomik — dipakai usecase `AssignRoles` untuk endpoint admin).

### backend/internal/domain/role/usecase.go
`Usecase{service}` tipis dengan komentar eksplisit bahwa manajemen role tidak mengoordinasi domain lain sehingga usecase dan service 1:1; dipisah demi konsistensi struktur. Method: `ListRoles` dan `AssignRoles` (delegasi ke `service.ReplaceRoles`).

### backend/internal/domain/role/validator.go
Validator per-package identik pola domain lain: instance `validate` lokal dan fungsi `Validate(s)` yang mengubah error validator menjadi `[]response.FieldError` dengan pesan "<field> is invalid". Dipakai handler untuk `AssignRolesRequest`.

## domain/booking

Domain booking adalah jantung transaksi: pengguna terdaftar membuat pesanan multi-item tiket untuk satu tanggal kunjungan, backend menghitung ulang harga dari katalog tickettype, memeriksa kapasitas secara atomik (anti-overselling), lalu membuka pembayaran di domain payments. Status bergerak PENDING → PAID/CONFIRMED → USED, atau CANCELLED/EXPIRED, dan domain ini menyediakan snapshot/agregasi yang dikonsumsi payments, ticketing, analytics, dan scanner.

### backend/internal/domain/booking/dto.go
DTO booking yang cocok satu-satu dengan tipe frontend: `CreateRequest` (visit_date 10 karakter, `Visitor` bersarang, `Items` 1–20 baris, note; harga tidak pernah diterima dari klien), `CreateItem`, `BookingResponse` (kode booking, item, subtotal/discount/service fee/tax/total, status, info check-in, `Payment`), `ItemResponse`, `PaymentView` (snapshot pembayaran minimal yang diisi domain payments lewat `PaymentStarter`), `UpdateStatusRequest`, dan `CreateBookingResult` (booking baru + pembayaran pending siap dibayar). `PaymentView` menjadi kelas data bersama dengan domain payments.

### backend/internal/domain/booking/entity.go
Entity `Base`, `Booking` (tabel `bookings`: `BookingCode` unik berformat KP-<tanggal>-<hex>, data pengunjung, `VisitDate` string "2006-01-02" terindeks, status default PENDING, nominal rupiah integer, info check-in, relasi `Items`), `BookingItem` (tabel `booking_items`: jenis tiket, nama, harga satuan snapshot saat booking, jumlah), konstanta status (`StatusPending`, `StatusPaid`, `StatusConfirmed`, `StatusUsed`, `StatusCancelled`, `StatusExpired`), dan `RevenueStatuses` (PAID/CONFIRMED/USED) yang dipakai bersama analytics untuk stok terjual dan pendapatan. Komentar mendokumentasikan transisi status yang ditegakkan di service.go.

### backend/internal/domain/booking/errors.go
Error domain dengan kode BOOK_*: `ErrNotFound` (BOOK_001), `ErrNotOwner` (BOOK_002), `ErrNoItems` (BOOK_003), `ErrInvalidDate` (BOOK_004), `ErrInvalidQuantity` (BOOK_005), `ErrUnavailable` (BOOK_006), `ErrCannotCancel` (BOOK_007), `ErrCannotDeletePaid` (BOOK_010 — booking berstatus pendapatan tidak boleh dihapus permanen agar laporan konsisten), `ErrInvalidStatus` (BOOK_008), dan fungsi `unknownTicket` (BOOK_009) yang menyembunyikan detail ID tiket agar pesan tetap ramah.

### backend/internal/domain/booking/handler.go
Handler Gin `Handler{usecase, paymentReader}`: `Create`, `Get`, `GetByCode`, `Cancel`, `Delete` (hapus permanen, route admin), `ListMine`, `ListAll`, `ListForVisitor`, `ListToday` (default tanggal hari ini), dan `SetStatus`. Handler menentukan flag `privileged` dari `middleware.HasRole(c, "ADMIN")`/`"MANAGER"` dan meneruskan `middleware.CurrentUserID(c)` untuk otorisasi kepemilikan; `paymentReader` (callback dari domain payments) disematkan ke respons daftar/detail. Semua endpoint daftar memakai `response.OKWithMeta` dengan meta pagination.

### backend/internal/domain/booking/mapper.go
Mapper: `toItemResponse`, `timestamps`, `toBookingResponse`/`toBookingResponsePtr` (menyusun `BookingResponse` termasuk check-in opsional), dan `toBookingResponseList` yang menambahkan snapshot pembayaran terbaru tiap booking lewat callback `paymentReader` — didesain satu query terbatch agar endpoint daftar tidak N+1. Dipakai oleh semua method service yang mengembalikan respons.

### backend/internal/domain/booking/repository.go
Interface `Repository` yang kaya (352 baris implementasi): `Create`, `CreateWithCapacity` (memeriksa + memesan kapasitas dalam transaksi yang sama dengan penyimpanan; SELECT ... FOR UPDATE pada MySQL, mutex `capacityMu` untuk SQLite dev; lock ID diurutkan untuk mencegah deadlock; error internal `errTicketNotFound`/`errCapacityExceeded`), `TransitionStatus` (pindah status atomik hanya bila status saat ini masih di daftar `from`), `FindByID`/`FindByCode` (preload items), `Update`, `Delete` (hapus permanen booking + payments + tickets + booking_items dalam transaksi, dengan pemeriksaan `Migrator().HasTable`), `ListMine`, `ListAll`, `ListByVisitDate`, `SoldByTicketOn`, agregasi (`SumRevenueBetween`, `CountBetween`, `CountByStatus`), dan `StalePending` untuk sweeper. `CapacityStatuses` memasukkan PENDING agar booking belum bayar tetap memesan kapasitas sehingga pembayaran bersamaan tidak overselling.

### backend/internal/domain/booking/routes.go
`RegisterRoutes` memasang: grup `/bookings` (requireAuth) — `POST ""` create, `GET /mine`, `GET /:id`, `GET /code/:code`, `POST /:id/cancel`, dan `DELETE /:id` (alias cancel untuk kompatibilitas ke belakang); grup laporan `/admin` untuk ADMIN/MANAGER/super_admin — `GET /admin/bookings`, `GET /admin/bookings/today`, `GET /admin/visitors/:id/bookings`; dan grup admin — `PATCH /admin/bookings/:id/status` serta `DELETE /admin/bookings/:id` (hapus permanen, hanya status non-pendapatan). Booking hanya untuk pengguna yang sudah login.

### backend/internal/domain/booking/service.go
Inti aturan bisnis booking (562 baris): interface lintas domain `PaymentStarter` (`StartPayment`, `ExpirePendingByBooking`), `TicketStatusSyncer`, `AuditLogger`, `BookingPaymentUpdater`, dan `TicketPricer` + `TicketInfo` (dipenuhi service tickettype via bootstrap). `Create` memvalidasi tanggal (hari ini atau setelahnya), menggabungkan baris duplikat, menghitung harga server-side dari katalog + cek kapasitas tersisa, menghitung service fee 2% (`serviceFeeRate`), membangun `BookingCode` via `generateBookingCode` (KP-<yyyymmdd>-<hex3>), menyimpan lewat `persistBooking` (retry 3x bila kode bentrok), lalu `StartPayment` — gagal membayar membatalkan booking agar kapasitas terlepas. Method lain: `authorize` (kepemilikan vs privileged), `Get`/`GetByCode`/`ListMine`/`ListForUser`/`ListAll`/`ListByVisitDate`, `Cancel` (hanya PENDING, ekspire pembayaran pending, audit log), `Delete` (tolak status pendapatan), `SetStatus` (mesin transisi ketat: PAID hanya lewat sistem pembayaran, CONFIRMED hanya dari PENDING, status akhir tidak boleh dibalik; sinkron status tiket), `MarkPaid`/`MarkExpired` (dipicu domain payments, idempoten), `SetCheckedIn` (dipanggil scanner), `GetSnapshot` (untuk payments/ticketing), dan `StalePendingIDs` (hook sweeper).

### backend/internal/domain/booking/usecase.go
`Usecase{service, pricer}` memegang `TicketPricer` dari domain tickettype dan meneruskannya ke `service.Create`; juga mendefinisikan instance `validate` dan fungsi `Validate` lokal untuk payload `CreateRequest`/`UpdateStatusRequest`. Method publik: `CreateBooking`, `Get`, `GetByCode`, `ListMine`, `ListForUser`, `ListAll`, `ListToday`, `Cancel`, `Delete`, `SetStatus`, `GetSnapshot`, plus konsumen lintas domain: `SetCheckedIn` (dipakai domain scanner), `MarkPaid`/`MarkExpired` (dipicu payments), `GetResponse` (dipakai payments menyematkan booking), dan `StalePendingIDs` (sweeper payments). Ini lapisan penghubung yang membuat service tetap bebas impor lintas domain.

## domain/payments

Domain payments mengelola sisi uang dari booking: membuka payment pending (QRIS default) saat booking dibuat, memproses pembayaran simulasi (mode demo) dan webhook Midtrans (verifikasi signature SHA-512 dan kecocokan nominal), meng-expire pembayaran lewat jendela 30 menit, serta override status oleh admin. Setiap perubahan status berdampak ke booking (`MarkPaid`/`MarkExpired`/`SetStatusByAdmin`) dan penerbitan e-tiket (`IssueForBooking`).

### backend/internal/domain/payments/dto.go
Mendefinisikan error domain (`ErrNotFound` PAY_001, `ErrInvalidStatus` PAY_002), `PaymentDTO` yang cocok dengan tipe `Payment` frontend (termasuk `MidtransRedirectURL` — satu-satunya URL resmi yang boleh ditampilkan frontend), mapper `toPaymentDTO`/`toPaymentDTOPtr`, `PaymentDetail` (payload gabungan `/payments/booking/:id`: payment + ticket + booking, mengimpor `ticketing.TicketResponse` dan `booking.BookingResponse`), dan `ProcessResult` (booking, payment, outcome SUCCESS/FAILED/EXPIRED). Domain ini satu-satunya yang mengimpor struct booking dan ticketing secara langsung (di lapisan DTO).

### backend/internal/domain/payments/entity.go
Entity `Base` dan `Payment` (tabel `payments`): `BookingID` unik (satu payment aktif per booking), `Method` default QRIS, `Reference` unik, `Amount`, `Status` default PENDING, kolom Midtrans opsional (`MidtransOrderID`, `MidtransToken`, `MidtransRedirect`), `PaidAt`, dan `ExpiredAt`. Konstanta 12 metode pembayaran (`MethodQRIS`, `MethodGoPay`, `MethodOVO`, `MethodDANA`, `MethodShopeePay`, VA BCA/BNI/Mandiri/BRI, `MethodCard`, `MethodAlfamart`, `MethodIndomaret`) dengan `Methods` + `ValidMethod` untuk validasi request; konstanta status (`StatusPending` … `StatusRefunded`); dan `PaymentWindow = 30 menit` yang selaras dengan scheduler sweep booking kedaluwarsa.

### backend/internal/domain/payments/handler.go
Handler Gin + pendaftaran route: `Process` (simulasi pembayaran QRIS), `Expire` (query `booking_id`), `GetByBooking` (detail gabungan), `MarkDownloaded` (hook audit unduhan e-tiket), `AdminList`, `AdminSetStatus`, `GetByID`, dan `Webhook` (publik tanpa auth, validasi signature dilakukan di service). Helper `privilegedRead` (ADMIN/MANAGER) dan `privilegedWrite` (ADMIN saja) memisahkan hak baca laporan vs tulis. `RegisterRoutes` memasang grup `/payments` (requireAuth): `POST /process`, `POST /expire`, `GET /:id`, `GET /booking/:bookingId`, `POST /booking/:bookingId/download`, webhook publik `POST /payments/webhook`, dan admin `GET /admin/payments`, `PATCH /admin/payments/:id/status`.

### backend/internal/domain/payments/repository.go
Interface `Repository`: `Create`, `Update`, `UpdateStatusIf` (ubah status hanya bila status saat ini masih di daftar `from` — dua callback/pemrosesan bersamaan tidak saling menimpa), `FindByID`, `FindLatestByBooking`, `FindByMidtransOrderID`, `ListAll` (filter status + pagination), `ExpirePendingByBooking` (PENDING/PROCESSING/FAILED → EXPIRED untuk satu booking), dan agregasi `CountByStatus`, `CountPending`, `SumPaidBetween` (untuk analytics pendapatan). Implementasi `repository` via `NewRepository`.

### backend/internal/domain/payments/service.go
Service terbesar (597 baris) dengan interface lintas domain: `BookingGateway` (GetSnapshot, MarkPaid, MarkExpired, GetResponse, SetStatusByAdmin, StalePendingIDs), `TicketIssuer` (IssueForBooking, GetByBookingID), `MidtransGateway` (Configured, CreateTransaction, GetTransactionStatus, VerifySignature), dan `AuditLogger`; flag `demoMode` mengizinkan simulasi hanya di luar produksi. `StartPayment` idempoten per booking (unique constraint → baca ulang bila pembuatan bersamaan), membuat reference `PAY-KP-<timestamp>-<hex>` dan transaksi Midtrans bila tersedia. `HandleMidtransNotification` memverifikasi signature, mencocokkan nominal (`amountMatches`), lalu memetakan status Midtrans ke `markPaidFromMidtrans`/`markFailedFromMidtrans`/`markProcessingFromMidtrans` — PAID memicu `bookings.MarkPaid` dan penerbitan tiket. `Process` (simulasi demo) menangani outcome SUCCESS/FAILED/EXPIRED, jendela kedaluwarsa menang atas hasil paksa. Selain itu: `Expire`, `expirePayment`, `GetByID`, `GetDetail`, `MarkDownloaded`, `ListAll`, `SetStatusByAdmin` (termasuk REFUNDED → booking CANCELLED), `ExpireStalePending` (hook scheduler), dan `FindLatestForBooking` untuk adapter pengayaan daftar booking.

### backend/internal/domain/payments/usecase.go
`Usecase{service}` dengan validator lokal (`validate`, `Validate`) dan DTO request: `ProcessRequest` (booking_id 36 char, `Forced` opsional oneof SUCCESS/FAILED/EXPIRED, `Method` opsional oneof 12 metode agar pemanggil lama QRIS tetap jalan) dan `SetStatusRequest` (oneof 6 status). Method: `Process` (menyusun `ProcessResult`), `Expire`, `GetDetail`, `GetByID`, `MarkDownloaded`, `ListAll`, `HandleMidtransWebhook` (delegasi ke `service.HandleMidtransNotification`), dan `SetStatusByAdmin`. Lapisan ini menerjemahkan payload HTTP menjadi parameter service dan membungkus hasilnya kembali ke DTO.

## domain/ticketing

Domain ticketing menerbitkan e-tiket (satu per booking berbayar) dengan QR unik berawalan KPT-, menjalankan verifikasi pemindaian di gerbang oleh PETUGAS (membakar tiket secara atomik, sekali pakai), mencatat setiap percobaan scan ke `scan_records`, menyediakan riwayat/statistik/monitoring, dan menyinkronkan status tiket dengan status booking. Bergantung ke domain booking (lewat interface `BookingUsedMarker`) dan dipanggil payments untuk penerbitan tiket.

### backend/internal/domain/ticketing/dto.go
Berisi `TicketResponse` (cocok dengan tipe `ETicket` frontend: data tiket, status, waktu terbit, check-in, `QRData`), mapper `toTicketResponse`, error `ErrForbidden` dan `ErrTicketNotFound`, sekaligus usecase domain ini: `Usecase{service}` dengan `ValidateRequest`/`ValidateResponse` (putusan scanner), method `ValidateTicket`, `LookupTicket` (pencarian hanya-baca), `ListMyTickets`, `CanAccess`, `GetTicket`/`GetTicketByCode`/`GetTicketByBooking`, `History`, `Stats`, dan `Monitoring`. File ini menampung DTO, error, dan usecase dalam satu paket.

### backend/internal/domain/ticketing/entity.go
Entity `Base`, `Ticket` (tabel `tickets`: `BookingID` unik, snapshot booking code/pengunjung/tanggal/jenis/jumlah/total, `Status` default VALID, `GeneratedAt`, info check-in, `QRData` unik varchar(120)), dan `ScanRecord` (tabel `scan_records`: satu percobaan verifikasi dengan gate, petugas, status, waktu scan — riwayat petugas sekaligus sumber jumlah pengunjung). Konstanta status tiket (`TicketValid`, `TicketUsed`, `TicketCancelled`, `TicketExpired`) dan status hasil scan (`ScanValid`, `ScanUsed`, `ScanInvalid`, `ScanExpired`, `ScanCancelled`).

### backend/internal/domain/ticketing/handler.go
Handler Gin + route: `Validate` (verifikasi dan pembakaran tiket; nama petugas dari request atau fallback ID), `History`, `Stats`, `ManagerMonitoring`, `LookupTicket` (read-only, tidak membakar tiket), `ListMine`, `GetTicket`/`GetTicketByCode`/`GetTicketByBooking` dengan pemeriksaan akses `ensureTicketAccess` (admin/petugas boleh semua, lainnya wajib pemilik). `RegisterRoutes` memasang: grup `/petugas` (RequireRole PETUGAS) — `POST /petugas/scanner/validate`, `GET /petugas/scanner/history|stats|ticket`; grup `/manager` (MANAGER/ADMIN/super_admin) — `GET /manager/monitoring` (hanya angka agregat, bukan riwayat mentah); dan grup `/e-tickets` (requireAuth) — `GET /e-tickets/mine|/:id|/code/:code|/booking/:bookingId`. Komentar menegaskan admin tidak memindai tiket.

### backend/internal/domain/ticketing/repository.go
Interface `Repository` untuk dua tabel: `Ticket` (`Create`, `Update`, `MarkUsed` — membakar tiket atomik hanya bila masih VALID dengan mengisi checked_in_at/gate, `FindByID`, `FindByQR`, `FindByBookingID`, `ListByUserID` via JOIN bookings untuk tiket milik user, `SetStatusForBooking`, `CountByStatus`, `CountValidOn`) dan `ScanRecord` (`CreateScan`, `ListScans` dengan filter gate/petugas/rentang tanggal via `scanFilter`, `CountScansByStatus`, `CountScansOn`). Implementasi `repository` via `NewRepository`; pola record tidak ditemukan → `nil, nil`.

### backend/internal/domain/ticketing/service.go
Service (507 baris) dengan interface `BookingUsedMarker` (`SetCheckedIn`, `IsOwner`) dan `AuditLogger`. `IssueForBooking` dipanggil payments saat pembayaran berhasil: idempoten (tiket existing dikembalikan), menggabungkan nama multi-item ("Tiket x2, ..."), membangkitkan QR unik `KPT-<hex>` via `uniqueQRData` (5 percobaan), dan mencatat audit. `GetByIDOrQR` menyelesaikan referensi scan dari UUID tiket, payload QR JSON (`qrPayloadRef`), atau teks KPT-/booking ID. `Validate` adalah inti scanner: tiket CANCELLED/EXPIRED/USED ditolak dengan pesan sesuai, tiket belum masuk tanggal kunjungan ditolak (tanggal ISO dibandingkan sebagai string), tiket VALID dibakar atomik lewat `repo.MarkUsed` (dua scan bersamaan hanya satu berhasil), lalu `bookings.SetCheckedIn` dan `ScanRecord` + audit (`logValidation` mencatat scan berhasil maupun ditolak). Juga menyediakan `Monitoring` (agregat per petugas dan per jam 07–16 untuk dashboard manager), `SyncStatusForBooking` (sinkron status tiket dengan override status booking admin), `History`, `Stats`, dan `ValidTicketsOn` untuk analytics.

## domain/tickettype

Domain tickettype mengelola katalog jenis tiket: kode unik, nama, deskripsi, kategori, harga IDR, kapasitas, dan status AKTIF/NONAKTIF. Katalog ini adalah sumber kebenaran harga yang dihitung ulang backend saat booking dibuat, dan menyediakan `GetMany`/`SoldByTicketOn` yang dipakai domain booking (via adapter bootstrap) untuk pricing dan cek kapasitas; sebaliknya handler menerima `SalesCounter` dari booking untuk menampilkan `available`.

### backend/internal/domain/tickettype/dto.go
DTO: `UpsertRequest` (payload create/update: code opsional maks 30, name wajib, description, category wajib, price min 1, capacity min 1, status opsional), `SetStatusRequest` (payload PATCH status), dan `Response` yang cocok satu-satu dengan tipe `Ticket` frontend — termasuk field `Available` (kapasitas dikurangi terjual hari ini) dan `IsActive`. Mapper di mapper.go mengisi `Available` awal dengan kapasitas sebelum diperkaya handler.

### backend/internal/domain/tickettype/entity.go
Entity `Base` dan `TicketType` (tabel `ticket_types`): `Code` unik varchar(30), `Name`, `Description`, `Category` default ENTRANCE terindeks, `Price` IDR integer, `Capacity`, `IsActive` terindeks, dan pelacaks `CreatedBy`/`UpdatedBy`. Konstanta status `StatusActive = "AKTIF"` dan `StatusInactive = "NONAKTIF"`, serta daftar `Categories`: ENTRANCE, SUNRISE, TRANSPORT, PACKAGE, ACTIVITY, SERVICE. Nama tabel inilah yang di-query langsung oleh repository booking saat pemeriksaan kapasitas.

### backend/internal/domain/tickettype/errors.go
Error domain: `ErrNotFound`, `ErrCodeExists` (kode tiket sudah terdaftar), `ErrInvalidCategory` (pesan memuat daftar kategori valid yang disusun dari `Categories`), `ErrHasBookings`, dan fungsi helper `invalidPrice`, `invalidCapacity`, `invalidStatus` yang menghasilkan `apperror.Validation` dengan pesan Indonesia. Dipakai service untuk menolak payload tidak valid.

### backend/internal/domain/tickettype/handler.go
Handler Gin `Handler{service, sales}` dengan interface `SalesCounter` (`SoldByTicketOn`) yang dipenuhi service domain booking lewat bootstrap — bila nil, available = kapasitas. Fungsi `withAvailability` memperkaya daftar/detail respons dengan `available` = kapasitas − terjual hari ini. Method: `List` (pagination, menerima query `limit` maupun `per_page` dari frontend, filter status/category), `ListActive`, `Categories`, `Get`, `GetByCode`, `Create`, `Update`, `SetStatus`, `Delete`, dan helper `clampPage`. Actor ID dari `middleware.CurrentUserID(c)` dicatat sebagai created_by/updated_by.

### backend/internal/domain/tickettype/mapper.go
`toResponse(t *TicketType)` mengubah entity menjadi `Response`: status diturunkan dari `IsActive` (AKTIF/NONAKTIF), timestamp diformat RFC3339, dan `Available` diinisialisasi dengan kapasitas penuh (diperkaya handler). `toResponseList` untuk daftar. Dipakai handler pada semua endpoint.

### backend/internal/domain/tickettype/repository.go
Interface `Repository`: `Create`, `Update`, `Delete` (soft-delete), `FindByID`, `FindByCode`, `List` (filter status AKTIF/NONAKTIF dan category, urut created_at ASC, dengan total), `ListActive`, dan `CountCategories` (distinct category). Implementasi `repository` via `NewRepository`; record tidak ditemukan → `nil, nil`.

### backend/internal/domain/tickettype/routes.go
`RegisterRoutes` memasang endpoint publik (cukup requireAuth implisit lewat definisi grup): `GET /tickets`, `GET /tickets/active`, `GET /tickets/categories`, `GET /tickets/code/:code`, `GET /tickets/:id`, dan grup admin (RequireRole ADMIN/super_admin): `POST /tickets`, `PUT /tickets/:id`, `PATCH /tickets/:id/status`, `DELETE /tickets/:id`. Endpoint baca inilah yang dipakai halaman katalog frontend saat memilih tiket.

### backend/internal/domain/tickettype/service.go
`Service{repo}`: `List` (validasi nilai status dulu), `ListActive`, `Categories`, `Get`, `GetByCode`, `GetMany` (menyelesaikan sekumpulan ID — dipakai domain booking untuk menghitung harga pesanan multi-item), `Create` (validasi price/capacity/category/status, kode dinormalisasi uppercase atau digenerate `generateCode` dari nama, cek keunikan kode), `Update`, `SetStatus`, dan `Delete` (soft-delete agar booking lama tetap merujuk barisnya). Helper `parseStatus`, `validCategory`, dan `generateCode` (TKT-<alfanumerik nama>-<4 digit>) mendukung operasi tersebut.

### backend/internal/domain/tickettype/validator.go
Validator per-package sesuai pola domain lain: instance `validate` lokal dan fungsi `Validate(s)` yang mengubah error `validator` menjadi `[]response.FieldError` dengan pesan "<field> is invalid". Dipakai handler untuk `UpsertRequest` dan `SetStatusRequest`.

## domain/verification

Domain verification adalah lapisan verifikasi tiket gaya lama/alternatif: mencatat setiap verifikasi ke tabel `verifications` sendiri (dengan note), sementara logika validasi tiket aktual didelegasikan penuh ke `ticketing.Service.Validate`. Endpoint-nya hanya untuk role PETUGAS, paralel dengan scanner di domain ticketing.

### backend/internal/domain/verification/dto.go
DTO domain: `VerificationResponse` (ID, ticket_id, booking_id, visitor_name, gate, petugas, status, waktu scan, note, timestamp RFC3339) dengan mapper `ToVerificationResponse`/`ToVerificationResponseList`; `VerifyRequest` (ticket_id wajib 4–120 karakter, gate, petugas, note opsional maks 500); `VerifyResponse` (success, message, status, ticket); dan salinan lokal `TicketResponse` yang berisi field e-tiket untuk respons verifikasi — domain ini menyalin bentuk respons tiket alih-alih mengimpor struct DTO ticketing.

### backend/internal/domain/verification/entity.go
Entity `Base` dan `Verification` (tabel `verifications`): `TicketID`, `BookingID`, `VisitorName`, `Gate`, `PetugasID`, `PetugasName`, `Status`, `ScannedAt` (terindeks), dan `Note` — rekam jejak verifikasi per gerbang dan petugas. Konstanta status `StatusValid`, `StatusUsed`, `StatusInvalid`, `StatusExpired`, `StatusCancelled` yang paralel dengan konstanta scan di domain ticketing.

### backend/internal/domain/verification/errors.go
Satu error: `ErrNotFound` (`apperror.NotFound("Data verifikasi tidak ditemukan.")`), dikembalikan service ketika detail verifikasi berdasarkan ID tidak ada.

### backend/internal/domain/verification/handler.go
Handler Gin + route: `Verify` (bind `VerifyRequest`, validasi, menentukan staffID dari `middleware.CurrentUserID` dan staffName dari request atau fallback), `GetVerification` (detail berdasarkan ID), dan `ListVerifications` (pagination + filter gate/petugas/from/to). `RegisterRoutes` memasang grup `/verifications` (requireAuth + RequireRole PETUGAS): `POST ""`, `GET ""`, `GET /:id`, plus alias lama `POST /tickets/verify` — komentar menegaskan endpoint verifikasi lama hanya untuk petugas, sama seperti scanner domain ticketing; admin/manager/pengunjung tidak boleh memvalidasi atau membaca riwayat scan mentah.

### backend/internal/domain/verification/repository.go
Interface `Repository`: `Create`, `FindByID`, dan `List` (pagination dengan filter opsional gate, petugas_id, dan rentang `scanned_at` from/to, urut scanned_at DESC, dengan total count). Implementasi `repository` dibuat oleh `NewRepository(db *gorm.DB)`; record tidak ditemukan → `nil, nil`. Ini persistensi sederhana tulis-dan-baca untuk tabel verifikasi.

### backend/internal/domain/verification/service.go
`Service{repo, ticketService}` menyimpan referensi langsung `*ticketing.Service` (dipasang bootstrap). `Verify` mendelegasikan validasi ke `ticketService.Validate` (tiket valid akan dibakar di sana), lalu menyimpan record `Verification` baru dengan waktu scan dari `CheckedInAt` tiket bila ada, dan menyusun `VerifyResponse` (`Success` true hanya bila status `ticketing.ScanValid`) termasuk salinan data tiket lewat `toVerificationTicketResponse`. `GetVerification` dan `ListVerifications` membaca riwayat dengan normalisasi pagination (default 20, maks 100) dan error dibungkus `apperror.Internal`.

### backend/internal/domain/verification/validator.go
Validator per-package mengikuti pola domain lain: instance `validate = validator.New()` dan fungsi `Validate(s)` yang menghasilkan `[]response.FieldError` berpesan "<field> is invalid". Dipakai handler untuk memvalidasi `VerifyRequest` sebelum diteruskan ke service.


---

# Bagian 3 — Backend: domain CMS, konten publik, analytics, audit, visitors

Bagian ini mendokumentasikan 11 domain di `backend/internal/domain` yang menangani CMS konten (artikel, galeri, paket wisata, FAQ, fasilitas, info destinasi, aturan pengunjung), API publik, analytics dashboard, audit log, dan pandangan admin atas pengunjung/staf. Hampir semua domain mengikuti pola berlapis yang sama: `Handler` (Gin) → `Usecase`/`Service` → `Repository` (GORM), dengan DTO untuk request/response dan `validator.go` berbasis `go-playground/validator`.

---

## domain/article

Domain artikel CMS untuk berita/konten teks KawahPutih. Artikel memiliki siklus hidup status `draft` → `published` → `archived` dengan slug unik yang dibuat otomatis dari judul. Endpoint yang didaftarkan `routes.go`:

- Publik: `GET /articles` (list, filter `status`), `GET /articles/:id`
- Admin (role ADMIN/super_admin): `POST /articles`, `PUT /articles/:id`, `POST /articles/:id/publish`, `POST /articles/:id/archive`, `DELETE /articles/:id`

### backend/internal/domain/article/dto.go
Mendefinisikan `CreateRequest`, `UpdateRequest`, dan `Response` artikel dengan tag `validate` (title min 5/max 200, content min 20, `cover_image` opsional harus URL). `Response` menyertakan `slug`, `status`, `author_id`, dan `published_at *int64`. File ini adalah kontrak JSON antara handler dan klien; dipakai oleh handler, usecase, dan mapper.

### backend/internal/domain/article/entity.go
Model GORM `Article` (tabel `articles`) yang meng-embed `Base` (ID UUID char(36) diisi oleh `BeforeCreate`, timestamps, soft delete `DeletedAt`). Field penting: `Slug` (uniqueIndex), `Status` (default `draft`), `AuthorID`, kolom audit `CreatedBy/UpdatedBy/DeletedBy`, dan `PublishedAt *int64`. Konstanta status: `StatusDraft`, `StatusPublished`, `StatusArchived`.

### backend/internal/domain/article/errors.go
Satu error domain: `ErrArticleNotFound` dibuat via `apperror.NotFound("Data artikel tidak ditemukan.")`. Dilempar oleh `Service.mustFind` saat artikel tidak ada dan ditulis ke HTTP oleh `apperror.WriteHTTP` di handler.

### backend/internal/domain/article/handler.go
`Handler` (dibangun via `NewHandler(usecase)`) dengan method `Create`, `Update`, `Publish`, `Archive`, `Delete`, `Get`, `List`. Alurnya: bind JSON → `Validate(req)` → panggil `usecase` dengan `middleware.CurrentUserID(c)` sebagai aktor → `apperror.WriteHTTP` saat error → `response.Created/OK/OKWithMeta`. `List` membaca query `page`, `limit`, `status` dan menyertakan meta paginasi via `response.BuildMeta`.

### backend/internal/domain/article/mapper.go
Mapper entity → DTO: `toResponse(a *Article) Response` dan `toResponseList([]Article) []Response`. Dipanggil langsung oleh `Usecase` untuk mengubah hasil `Service` menjadi `Response` API.

### backend/internal/domain/article/repository.go
Interface `Repository` (Create, Update, Delete, FindByID, FindPublishedBySlug, List, SlugExists) dan implementasi GORM `repository`. `List` mendukung filter `status` dengan urutan `created_at DESC`, `FindByPublishedBySlug` hanya mengambil artikel berstatus published, dan `SlugExists` mengecek keunikan slug dengan opsi `excludeID` (dipakai saat update). Pola "not found → return nil, nil" dipakai agar service bisa memilih error domain.

### backend/internal/domain/article/routes.go
`RegisterRoutes(rg, h, jwtManager)` memasang dua GET publik (`/articles`, `/articles/:id`) dan grup admin yang dilindungi `middleware.RequireAuth` + `middleware.RequireRole("ADMIN", "super_admin")` untuk POST/PUT/publish/archive/delete. Bergantung pada `pkg/jwtutil.Manager` dan `internal/middleware`.

### backend/internal/domain/article/service.go
Logika bisnis artikel: `Create` membuat slug unik via `uniqueSlug` (memakai `slugutil.Generate` + loop penambahan `-2`, `-3`), status awal `draft`; `Update` regenerasi slug hanya bila judul berubah; `Publish` mengisi `PublishedAt` dengan unix time; `Delete` mengisi `DeletedBy` lewat UPDATE sebelum soft delete GORM (komentar di kode menjelaskan urutan ini agar `deleted_by` tetap terbaca untuk audit). Helper `mustFind` memetakan nil → `ErrArticleNotFound`.

### backend/internal/domain/article/usecase.go
Lapisan tipis antara handler dan service: `Usecase.Create/Update/Get/Publish/Archive/Delete/List`, semuanya memanggil `Service` lalu memetakan entity ke `Response` via mapper. `List` menormalkan paginasi dengan `normalizePaging` (page ≥ 1, perPage default 20, maks 100) sebelum menghitung offset.

### backend/internal/domain/article/validator.go
Validasi deklaratif: `Validate(s)` menjalankan `validator.Struct` dan mengubah `ValidationErrors` menjadi `[]response.FieldError` dengan pesan ramah dari `friendlyMessage` (required/min/max/url). Dipanggil handler sebelum usecase.

---

## domain/gallery

Domain galeri foto destinasi: admin mengunggah/mengelola item galeri (judul, URL gambar, kategori, urutan tampil), publik melihatnya terurut. Berbeda dari domain lain, `Created`-by disimpan dengan nama field `UploadedBy`. Endpoint di `routes.go`:

- Publik: `GET /gallery` (list, filter `category`), `GET /gallery/:id`
- Admin (ADMIN/super_admin): `POST /gallery`, `PUT /gallery/:id`, `DELETE /gallery/:id`

### backend/internal/domain/gallery/dto.go
`CreateRequest`/`UpdateRequest` (title min 3, `image_url` wajib dengan tag kustom `imageurl`, kategori opsional, `sort_order`) dan `Response`. Berisi mapper bawaan `ToResponse`/`ToResponseList` yang menerima pointer `*Item` (versi slice-of-pointer, sedikit berbeda dari `mapper.go`). Dipakai handler untuk membangun respons.

### backend/internal/domain/gallery/entity.go
Model GORM `Item` (tabel `gallery_items`) dengan `Base` UUID, `Title`, `ImageURL`, `Category` (indexed), `SortOrder`, dan kolom aktor `UploadedBy` (dikomentari sebagai created_by tabel ini), `UpdatedBy`, `DeletedBy *string`. Soft delete aktif lewat `DeletedAt` di `Base`.

### backend/internal/domain/gallery/errors.go
`ErrItemNotFound = apperror.NotFound("Data galeri tidak ditemukan.")` — error tunggal yang dilempar `Service.mustFind` dan ditampilkan sebagai 404 oleh handler.

### backend/internal/domain/gallery/handler.go
`Handler` dengan `Create`, `Update`, `Get`, `Delete`, `List`. Alur sama dengan article: bind → `Validate` → usecase dengan `middleware.CurrentUserID(c)` → `apperror.WriteHTTP`. `List` menerima `page`/`limit`/`category` dan mengembalikan `OKWithMeta` + `response.BuildMeta`.

### backend/internal/domain/gallery/mapper.go
`toResponse(i *Item) Response` dan `toResponseList([]Item) []Response` untuk slice nilai (bukan pointer); versi inilah yang dipakai `Usecase`, sedangkan versi pointer di dto.go untuk pemakaian lain. Menjaga pemisahan bentuk DB dan JSON.

### backend/internal/domain/gallery/repository.go
Interface `Repository` (Create, Update, Delete, FindByID, List) plus implementasi GORM. `List` memfilter `category` bila diisi dan mengurutkan `sort_order ASC, created_at DESC` — urutan inilah yang menentukan tampilan galeri. `FindByID` mengembalikan `(nil, nil)` saat record tidak ditemukan.

### backend/internal/domain/gallery/routes.go
`RegisterRoutes(rg, h, jwtManager)`: dua endpoint publik (`/gallery`, `/gallery/:id`) dan tiga endpoint admin dalam grup `RequireAuth` + `RequireRole("ADMIN", "super_admin")` (POST/PUT/DELETE). Komentar di file menandai pembagian endpoint publik vs admin secara eksplisit.

### backend/internal/domain/gallery/service.go
`Service.Create` menyimpan item dengan `UploadedBy` = uploader ID; `Update` menimpa semua field dan set `UpdatedBy`; `Delete` meniru pola article — tulis `DeletedBy` via UPDATE lalu soft delete; `List` meneruskan filter kategori. `mustFind` memetakan nil dari repo ke `ErrItemNotFound`.

### backend/internal/domain/gallery/usecase.go
`Usecase` tipis: Create/Update/Get/Delete/List yang memanggil `Service` dan memetakan ke `Response` lewat `toResponse`/`toResponseList`. `List` menormalkan paginasi lewat `normalizePaging` (default 20, maks 100) sebelum menghitung offset untuk repository.

### backend/internal/domain/gallery/validator.go
Mendaftarkan tag validasi kustom `imageurl` di `init()`: menerima URL absolut http/https ATAU path lokal berawalan `/` (hasil unggahan admin seperti `/api/v1/uploads/<file>`), sesuai komentar bahwa gambar konten kini bisa diunggah. Fungsi `Validate` menghasilkan `[]response.FieldError` generik.

---

## domain/package

Domain paket wisata (package Go bernama `tourismpackage` karena `package` adalah kata kunci Go, folder tetap `internal/domain/package`). Mengelola paket kunjungan dengan harga (sen), durasi jam, kapasitas, dan flag `is_active`. Endpoint di `routes.go`:

- Publik: `GET /packages` (query `active_only=true`), `GET /packages/:id`
- Admin (ADMIN/super_admin): `POST /packages`, `PUT /packages/:id`, `DELETE /packages/:id`

### backend/internal/domain/package/dto.go
`CreateRequest`, `UpdateRequest` (name, description, cover_image URL, `price_cents` int64 wajib ≥ 0, `duration_hours` ≥ 1, `max_capacity`), dan `Response` yang menambahkan `slug` dan `currency`. `UpdateRequest` membawa `IsActive` sehingga admin bisa menonaktifkan paket. Kontrak JSON utama domain ini.

### backend/internal/domain/package/entity.go
Model GORM `Package` (tabel `tourism_packages`; komentar menjelaskan penamaan Go-nya) dengan `Base` UUID, `Slug` uniqueIndex, `PriceCents`, `Currency` default `IDR`, `DurationHours`, `MaxCapacity`, `IsActive` (indexed, default true), serta kolom audit `CreatedBy/UpdatedBy/DeletedBy`. Soft delete via `DeletedAt`.

### backend/internal/domain/package/errors.go
`ErrPackageNotFound = apperror.NotFound("Data paket wisata tidak ditemukan.")` — dipakai `Service.mustFind` untuk 404.

### backend/internal/domain/package/handler.go
`Handler.Create/Update/Delete/Get/List` dengan alur bind → `Validate` → usecase (memakai `middleware.CurrentUserID(c)` sebagai aktor) → `apperror.WriteHTTP`. `List` membaca `page`/`limit` dan flag `active_only=true`, lalu merespons `OKWithMeta` + `response.BuildMeta`.

### backend/internal/domain/package/mapper.go
`toResponse(p *Package) Response` dan `toResponseList([]Package) []Response`; dipakai `Usecase` untuk konversi entity → DTO respons.

### backend/internal/domain/package/repository.go
Interface `Repository` (Create, Update, Delete, FindByID, List dengan `activeOnly`, SlugExists) dan implementasi GORM. `List` memfilter `is_active = true` bila `activeOnly`, urut `created_at DESC`; `SlugExists` mendukung pengecualian ID untuk update. Mengikuti pola nil,nil untuk record tidak ada.

### backend/internal/domain/package/routes.go
`RegisterRoutes(rg, h, jwtManager)`: GET publik `/packages` dan `/packages/:id`, lalu grup admin `/packages` dengan `RequireAuth` + `RequireRole("ADMIN", "super_admin")` untuk POST/PUT/DELETE.

### backend/internal/domain/package/service.go
`Service.Create` membuat slug unik dari nama (memakai `slugutil.Generate` + iterasi penomoran, sama seperti article), set `Currency: "IDR"` dan `IsActive: true`; `Update` regenerasi slug hanya bila nama berubah dan menimpa field harga/durasi/kapasitas/isActive; `Delete` menulis `DeletedBy` lewat UPDATE sebelum soft delete. `mustFind` memetakan nil → `ErrPackageNotFound`.

### backend/internal/domain/package/usecase.go
`Usecase.Create/Update/Delete/Get/List` yang meneruskan ke `Service` lalu memetakan hasil via mapper. `List` menormalkan paginasi `normalizePaging` (default 20, maks 100) sebelum mengirim offset/limit ke service.

### backend/internal/domain/package/validator.go
`Validate(s)` memakai `validator.New()` dan mengembalikan `[]response.FieldError` dengan pesan generik `"<Field> is invalid"`. Tag validasi detail (min/max/required) didefinisikan langsung di tag struct DTO.

---

## domain/faq

Domain FAQ dengan kategori tetap (Tiket, Jam Operasional, Lokasi, Fasilitas, Aturan Kunjungan, Parkir, Pembayaran, Umum) dan flag publikasi `is_published`. Endpoint di `routes.go`:

- Publik: `GET /faq` (hanya published, filter `category`), `GET /faq/:id`
- Admin (ADMIN/super_admin) di bawah `/admin/faq`: `POST`, `PUT /:id`, `DELETE /:id`, `GET` (list semua, filter category/published_only), `GET /:id`

### backend/internal/domain/faq/dto.go
`CreateRequest`/`UpdateRequest` dengan `Category` divalidasi `oneof` daftar kategori Indonesia, plus `Response` berisi timestamp berformat RFC3339. Mapper `ToResponse(f *FAQ)` dan `ToResponseList` dipakai langsung oleh handler (domain ini tidak punya file mapper terpisah).

### backend/internal/domain/faq/entity.go
Model GORM `FAQ` (tabel `faqs`): `Question` varchar(500), `Answer` longtext, `Category` indexed, `SortOrder`, `IsPublished` (indexed), kolom audit `CreatedBy/UpdatedBy/DeletedBy`, dan `Base` UUID dengan soft delete.

### backend/internal/domain/faq/errors.go
`ErrNotFound = apperror.NotFound("Data FAQ tidak ditemukan.")` dideklarasikan dalam var block; dilempar `Service.mustFind`.

### backend/internal/domain/faq/handler.go
`Handler.Create/Update/Delete/Get/List/ListPublished`. List admin membaca `page`, `limit`, `category`, `published_only`; `ListPublished` hanya menerima `category` dan tanpa paginasi. Alur: bind → `Validate` → usecase → `apperror.WriteHTTP` → `response.OK/OKWithMeta`. Handler memetakan entity ke DTO sendiri via `ToResponse`.

### backend/internal/domain/faq/repository.go
Interface `Repository` (CRUD, `List` berpaginasi dengan filter kategori & publishedOnly, `ListPublished`) dan implementasi GORM dengan urutan `category ASC, sort_order ASC, created_at DESC` sehingga FAQ tampil terkelompok per kategori. `FindByID` mengembalikan (nil,nil) untuk record tidak ada.

### backend/internal/domain/faq/routes.go
`RegisterRoutes(rg, h, jwtManager)`: grup publik `/faq` (GET list published, GET by id) dan grup admin `/admin/faq` dengan `RequireAuth` + `RequireRole("ADMIN", "super_admin")` untuk CRUD dan list lengkap. Pola path admin berbeda dari article/gallery yang memakai path sama dengan middleware.

### backend/internal/domain/faq/service.go
`Service.Create/Update/Delete/Get/List/ListPublished`. Create/Update menyalin field dari request (termasuk `IsPublished`) tanpa logika tambahan; Delete memvalidasi keberadaan dulu via `mustFind` lalu soft delete. Semua error DB dibungkus `apperror.Internal`.

### backend/internal/domain/faq/usecase.go
`Usecase` pass-through murni (Create/Update/Delete/Get/List/ListPublished) yang hanya meneruskan parameter ke `Service`; berbeda dari article/gallery, tidak ada normalisasi paginasi di sini (repo langsung menerima offset dari handler/service).

### backend/internal/domain/faq/validator.go
`Validate(s)` dengan `validator.New()`, menghasilkan `[]response.FieldError` generik `"<Field> is invalid"`. Validasi kategori `oneof` dsb. ditulis sebagai tag struct di dto.go.

---

## domain/facility

Domain fasilitas lokasi wisata ( toilets, musala, parkir, dsb.) dengan status operasional (`active`/`maintenance`/`inactive`), jam operasional, ikon, dan flag publikasi. Endpoint di `routes.go`:

- Publik: `GET /facilities` (hanya published), `GET /facilities/:id`
- Admin (ADMIN/super_admin) di bawah `/admin/facilities`: `POST`, `PUT /:id`, `DELETE /:id`, `GET` (list, filter `status`/`published_only`), `GET /:id`

### backend/internal/domain/facility/dto.go
`CreateRequest`/`UpdateRequest` (name min 3, description/ikon/image_url/location/operating_hours dengan batas panjang, `status` oneof active|maintenance|inactive, `is_published`, `sort_order`) dan `Response` berformat RFC3339 untuk timestamp. Mapper `ToResponse`/`ToResponseList` menerima `*Facility` dan dipakai langsung oleh handler.

### backend/internal/domain/facility/entity.go
Model GORM `Facility` (tabel `facilities`) dengan `Base` UUID, field deskriptif (Name, Description, Icon, ImageURL, Location, OperatingHours), `Status` default `active` (indexed), `IsPublished` (indexed), `SortOrder`, dan kolom audit `CreatedBy/UpdatedBy/DeletedBy`. Konstanta `StatusActive`, `StatusMaintenance`, `StatusInactive`.

### backend/internal/domain/facility/errors.go
`ErrNotFound = apperror.NotFound("Data fasilitas tidak ditemukan.")` — satu error domain, dilempar `Service.mustFind`.

### backend/internal/domain/facility/handler.go
`Handler.Create/Update/Delete/Get/List/ListPublished`. `List` menerima `page`, `limit`, `status`, `published_only`; `ListPublished` tanpa parameter. Alur standar bind → `Validate` → usecase → `apperror.WriteHTTP` → `response.OK/OKWithMeta` dengan `response.BuildMeta`.

### backend/internal/domain/facility/repository.go
Interface `Repository` (CRUD, `List` berpaginasi dengan filter status & publishedOnly, `ListPublished`). Urutan admin list `status ASC, sort_order ASC, created_at DESC`; `ListPublished` mengurutkan `sort_order ASC, created_at DESC` agar fasilitas penting tampil dulu. GORM dengan `WithContext`.

### backend/internal/domain/facility/routes.go
`RegisterRoutes(rg, h, jwtManager)`: publik `/facilities` (GET published, GET by id) dan admin `/admin/facilities` (POST/PUT/DELETE/GET/GET :id) dengan `RequireAuth` + `RequireRole("ADMIN", "super_admin")`. Meniru struktur route faq.

### backend/internal/domain/facility/service.go
`Service.Create/Update` mengisi default `StatusActive` bila status kosong; `Update` menimpa semua field termasuk status dan publikasi; `Delete` cek keberadaan via `mustFind` lalu soft delete; `ListPublished` langsung ke repo. Error DB dibungkus `apperror.Internal`, not-found memakai `ErrNotFound`.

### backend/internal/domain/facility/usecase.go
`Usecase` pass-through (Create/Update/Delete/Get/List/ListPublished) tanpa transformasi tambahan; handler yang memetakan entity ke DTO. Paginasi diteruskan apa adanya ke service/repo.

### backend/internal/domain/facility/validator.go
`Validate(s)` memakai `validator.New()` dan menghasilkan `[]response.FieldError` generik. Sama polanya dengan validator faq/package/destinationinfo/visitorrule/public.

---

## domain/destinationinfo

Domain informasi destinasi: satu halaman "tentang destinasi" berisi deskripsi, sejarah, deskripsi tujuan, lokasi, jam operasional, kontak, dan info tambahan. Mengadopsi siklus status draft/published/archived seperti article, dengan aturan judul unik. Endpoint di `routes.go`:

- Publik: `GET /destination-info` (hanya entri published terbaru), `GET /destination-info/:id`
- Admin (ADMIN/super_admin) di bawah `/admin/destination-info`: `POST`, `PUT /:id`, `POST /:id/publish`, `POST /:id/archive`, `DELETE /:id`, `GET` (list, filter `status`)

### backend/internal/domain/destinationinfo/dto.go
`CreateRequest`/`UpdateRequest` (title required min 3, description required min 10, field panjang bebas untuk history/destination_desc/additional_info) dan `Response` lengkap dengan `Status`, `AuthorID`, `PublishedAt`, timestamp RFC3339. Mapper `ToResponse`/`ToResponseList` menerima `*DestinationInfo`.

### backend/internal/domain/destinationinfo/entity.go
Model GORM `DestinationInfo` (tabel `destination_information`) dengan `Title` uniqueIndex (keunikan judul ditegakkan di DB maupun service), kolom konten longtext, `Status` default draft, `AuthorID`, kolom audit, dan `PublishedAt *int64`. Konstanta `StatusDraft/StatusPublished/StatusArchived` sama seperti article.

### backend/internal/domain/destinationinfo/errors.go
Empat error domain: `ErrNotFound` (404), `ErrTitleExists` (Conflict "Data sudah terdaftar."), `ErrInvalidStatus` (validation), dan `ErrCannotPublish` ("Konten belum lengkap untuk dipublikasikan."). Semua dibuat via helper `apperror`.

### backend/internal/domain/destinationinfo/handler.go
`Handler.Create/Update/Publish/Archive/Delete/Get/GetPublished/List`. `GetPublished` mengembalikan 404 khusus bila belum ada entri published. Alur standar: bind → `Validate` → usecase dengan `middleware.CurrentUserID(c)` → `apperror.WriteHTTP` → `response.OK/OKWithMeta`.

### backend/internal/domain/destinationinfo/repository.go
Interface `Repository` (CRUD, FindByTitle, List berpaginasi dengan filter status, GetPublished). `GetPublished` mengambil satu entri berstatus published dengan `published_at` terbaru — model konten "single source" untuk halaman info. `FindByTitle` mendukung cek duplikat judul.

### backend/internal/domain/destinationinfo/routes.go
`RegisterRoutes(rg, h, jwtManager)`: publik `/destination-info` dan `/destination-info/:id`; admin `/admin/destination-info` dengan `RequireAuth` + `RequireRole("ADMIN", "super_admin")` untuk CRUD, publish, archive, dan list. Mengikuti pola route faq/facility.

### backend/internal/domain/destinationinfo/service.go
Logika paling kaya di antara domain CMS: `Create` menolak judul duplikat (`ErrTitleExists`); `Update` cek judul baru terhadap ID lain; `Publish` memvalidasi Title & Description terisi sebelum set status published dan `PublishedAt` (jika tidak, `ErrCannotPublish`); `Archive` dan `Delete` (dengan penulisan `DeletedBy` sebelum soft delete) meniru pola article. `mustFind` memetakan nil → `ErrNotFound`.

### backend/internal/domain/destinationinfo/usecase.go
`Usecase` pass-through: Create/Update/Publish/Archive/Delete/Get/GetPublished/List meneruskan ke `Service` tanpa transformasi; pemetaan DTO dilakukan handler via `ToResponse`.

### backend/internal/domain/destinationinfo/validator.go
`Validate(s)` dengan `validator.New()` → `[]response.FieldError` generik. Aturan panjang/required ada di tag struct DTO.

---

## domain/visitorrule

Domain aturan kunjungan (do & don't untuk pengunjung) dengan kategori tetap (Keselamatan, Lingkungan, Kebersihan, Kendaraan, Aktivitas Pengunjung, Larangan, Informasi Umum) dan prioritas `low/normal/high/critical`. Endpoint di `routes.go`:

- Publik: `GET /visitor-rules` (hanya published, filter `category`), `GET /visitor-rules/:id`
- Admin (ADMIN/super_admin) di bawah `/admin/visitor-rules`: `POST`, `PUT /:id`, `DELETE /:id`, `GET` (list, filter category/published_only), `GET /:id`

### backend/internal/domain/visitorrule/dto.go
`CreateRequest`/`UpdateRequest` dengan validasi `oneof` kategori Indonesia dan prioritas, plus `Response` (termasuk `Priority`, `IsPublished`, timestamp RFC3339). Mapper `ToResponse`/`ToResponseList` menerima `*VisitorRule` dan dipakai handler langsung.

### backend/internal/domain/visitorrule/entity.go
Model GORM `VisitorRule` (tabel `visitor_rules`): Title varchar(200), Description longtext, Category indexed, `Priority` default `normal` (indexed), SortOrder, `IsPublished` (indexed), kolom audit, `Base` UUID. Konstanta `PriorityLow/Normal/High/Critical`.

### backend/internal/domain/visitorrule/errors.go
`ErrNotFound = apperror.NotFound("Data aturan pengunjung tidak ditemukan.")` — error tunggal untuk mustFind.

### backend/internal/domain/visitorrule/handler.go
`Handler.Create/Update/Delete/Get/List/ListPublished`, mirip faq: list admin menerima `page`, `limit`, `category`, `published_only`; `ListPublished` hanya `category`. Alur bind → Validate → usecase → `apperror.WriteHTTP` → `response.OK/OKWithMeta`.

### backend/internal/domain/visitorrule/repository.go
Interface `Repository` (CRUD, List berpaginasi, ListPublished) dengan urutan `category ASC, priority DESC, sort_order ASC, created_at DESC` — aturan prioritas tinggi tampil lebih dulu dalam kategorinya. `FindByID` mengembalikan (nil,nil) saat tidak ada.

### backend/internal/domain/visitorrule/routes.go
`RegisterRoutes(rg, h, jwtManager)`: publik `/visitor-rules` dan admin `/admin/visitor-rules` dengan `RequireAuth` + `RequireRole("ADMIN", "super_admin")`. Identik polanya dengan faq/facility.

### backend/internal/domain/visitorrule/service.go
`Service.Create/Update` mengisi default `PriorityNormal` bila prioritas kosong; Update menimpa seluruh field; Delete memvalidasi via `mustFind` lalu soft delete; `ListPublished` langsung ke repo. Error DB dibungkus `apperror.Internal`.

### backend/internal/domain/visitorrule/usecase.go
`Usecase` pass-through (Create/Update/Delete/Get/List/ListPublished) tanpa pemetaan tambahan; DTO dibentuk di handler.

### backend/internal/domain/visitorrule/validator.go
`Validate(s)` → `[]response.FieldError` generik dari `validator.New()`, meniru validator domain lain.

---

## domain/public

Domain API publik read-only yang menggabungkan data lintas tabel untuk konsumen tak terautentikasi: destinasi, fasilitas, FAQ, ulasan (review), konten generik (article/event/promotion/page), dan info harga tiket. Domain ini mendefinisikan entity GORM sendiri yang menunjuk tabel yang sama (`facilities`, `faqs`) dengan bentuk field publik. Endpoint di `routes.go` (semua tanpa autentikasi, di bawah `/public`):

- `GET /public/destinations`, `GET /public/destinations/:id`, `GET /public/destinations/slug/:slug`
- `GET /public/ticket-types` dan `GET /public/prices` (keduanya memanggil `GetPrices`)
- `GET /public/facilities`, `GET /public/faq`, `GET /public/reviews`
- `GET /public/content` (filter `type`, paginasi), `GET /public/content/:id`, `GET /public/content/slug/:slug`

### backend/internal/domain/public/dto.go
DTO respons publik: `DestinationResponse` + mapper, `FacilityResponse`, `FAQResponse`, `ReviewResponse`, `ContentResponse` (type: article/event/promotion/page), dan `PriceInfoResponse` (ticket_id, nama, kategori, harga, kapasitas, available, is_active). Semua mapper `ToXResponse`/`ToXResponseList` memformat waktu RFC3339. Ini adalah bentuk API yang dikonsumsi frontend publik.

### backend/internal/domain/public/entity.go
Entity GORM "read model": `Destination` (tabel `destinations`, slug unique, koordinat lat/long), `Facility` (tabel `facilities`, dengan `Category`), `FAQ` (tabel `faqs`, flag `IsActive`), `Review` (tabel `reviews`, rating + `IsApproved`), dan `Content` (tabel `contents`, `Type`, `Status`). Konstanta tipe konten (`ContentTypeArticle/Event/Promotion/Page`) dan status konten. Catatan: karena memakai nama tabel sama dengan domain admin lain (mis. `facilities` milik domain facility), skema kolom diharapkan kompatibel.

### backend/internal/domain/public/errors.go
Dua error: `ErrNotFound` ("Data tidak ditemukan.") untuk semua resource, dan `ErrInvalidCategory` (validation) yang tersedia untuk filter kategori. Dilempar `Service` dan ditulis handler via `apperror.WriteHTTP`.

### backend/internal/domain/public/handler.go
`Handler` yang memegang `*Service` langsung (tanpa usecase): `GetDestinations`, `GetDestinationByID`, `GetDestinationBySlug`, `GetFacilities`, `GetFAQs`, `GetReviews` (limit default 10), `GetContents` (paginasi + meta), `GetContentBySlug`, `GetContentByID`, `GetPrices`. Alur: query param → service → mapper → `response.OK/OKWithMeta`.

### backend/internal/domain/public/repository.go
Interface `Repository` dengan grup metode per resource: destinasi (list activeOnly, by ID, by slug), fasilitas, FAQ, review (approvedOnly, limit), dan konten (ListContents dengan filter type/status default published, by slug, by ID). Implementasi GORM memakai entity lokal file entity.go; konten publik dipaksa hanya `ContentStatusPublished` bila status tidak eksplisit.

### backend/internal/domain/public/routes.go
`RegisterRoutes(rg, h)` — satu-satunya routes di antara domain yang tidak butuh `jwtManager` karena seluruhnya publik. Mengelompokkan semuanya di `/public` dan mengekspos alias `/public/ticket-types` dan `/public/prices` ke handler yang sama.

### backend/internal/domain/public/service.go
`Service` menggabungkan repo internal dengan `*tickettype.Service` dari domain `tickettype` (cross-domain): `GetPrices` mengambil tiket aktif via `ticketService.ListActive(ctx)` dan memetakan ke `PriceInfoResponse` (Available diisi = Capacity, ada variabel `sold` yang dihitung tapi belum dipakai). Method lain murni membaca repo (destinasi/fasilitas/FAQ hanya aktif, review hanya approved, konten hanya published) dan melempar `ErrNotFound` bila nil.

### backend/internal/domain/public/validator.go
`Validate(s)` standar berbasis `validator.New()` → `[]response.FieldError` generik; tersedia untuk keperluan validasi query/struct meskipun endpoint GET ini sebagian besar tanpa payload.

---

## domain/analytics

Domain analytics untuk dashboard admin dan laporan manager: agregasi booking, tiket terjual, revenue, pengunjung, performa jenis tiket, dan status pembayaran langsung dengan SQL agregat atas tabel `bookings`, `booking_items`, `payments`, `ticket_types`, dan `users`. Endpoint di `handler.go` (fungsi `RegisterRoutes` ada di file handler):

- Admin (ADMIN/super_admin): `GET /admin/dashboard` → `AdminDashboardStats`
- Manager (MANAGER/ADMIN/super_admin): `GET /manager/analytics?range=...` → `ManagerAnalytics`

### backend/internal/domain/analytics/dto.go
Kontrak respons yang "cocok dengan tipe frontend": `AdminDashboardStats` (10 kartu statistik: total booking, tiket terjual, revenue, pengunjung, visitors/bookings/revenue hari ini, tiket tersedia, pending payment, staf aktif), `ManagerAnalytics` (summary, changes, revenue/booking trend, weekday vs weekend, performa jenis tiket, status pembayaran, `DailyRows`, `RangeLabel`), plus tipe pendukung `ManagerSummary`, `ManagerChanges`, `TrendPoint` (label/value), dan `DailyRow`.

### backend/internal/domain/analytics/handler.go
`Handler.AdminDashboard` dan `Handler.ManagerAnalytics`; yang terakhir menyelesaikan rentang via `ResolveRange(range, custom, from, to)` di service sebelum memanggil service. `RegisterRoutes(rg, h, jwtManager)` memasang grup `/admin` (role ADMIN/super_admin) dan `/manager` (role MANAGER/ADMIN/super_admin) dengan `RequireAuth`. Tidak ada file routes terpisah.

### backend/internal/domain/analytics/repository.go
Interface `Repository` berisi 14 metode agregat (`BookingsByDateRange`, `TicketPerformance`, `PaymentsByStatus`, `TotalBookings`, `TotalRevenue`, `VisitorsCount`, `ActiveStaffCount`, dll.) diimplementasi dengan SQL mentah `Table(...).Select(...)` di atas GORM. Konstanta `revenueStatuses = ["PAID","CONFIRMED","USED"]` sengaja meniru `booking.RevenueStatuses` tanpa mengimpor package booking (lihat komentar). Pengunjung dihitung tiga cara: total akun PENGUNJUNG, distinct user dengan booking revenue, dan jumlah tiket pada tanggal kunjungan.

### backend/internal/domain/analytics/service.go
Otak agregasi: `ResolveRange` memetakan preset `today/7d/30d/month/custom` (custom menerima `?custom=` JSON atau query from/to) menjadi `Range{From,To,Label,PrevFrom,PrevTo}` untuk kartu persentase perubahan. `AdminDashboard` mengumpulkan 10 angka dari repo; `ManagerAnalytics` membangun bucket harian (maks 31 titik), trend revenue/booking, pemisahan weekday vs weekend, performa 6 jenis tiket teratas, distribusi status pembayaran, serta `ManagerSummary` (avg booking value, conversion rate) dan `ManagerChanges` via helper `pct`. Helper: `today2`, `dayOf`, `ternary`, `pct`.

---

## domain/audit

Domain audit log: mencatat setiap operasi bisnis penting (booking, pembayaran, tiket, jenis tiket, user) secara append-only untuk kepatuhan dan debugging. Domain lain memanggil `Service.Log/LogSuccess/LogFailure` secara fire-and-forget; pembacaan log khusus admin. Endpoint di `RegisterRoutes` (dipasang pemanggil di bawah `/admin/audit` dengan middleware auth sendiri):

- `GET /admin/audit` (list berpaginasi + filter)
- `GET /admin/audit/stats/action`, `GET /admin/audit/stats/actor`
- `GET /admin/audit/:id`

### backend/internal/domain/audit/dto.go
`AuditLogResponse` (actor, action, target, status, `Metadata map[string]interface{}` yang di-unmarshal dari JSON string, IP, user agent, created_at) dengan mapper `toAuditLogResponse`; `ListRequest` (filter actor/action/target/status/rentang tanggal via tag form) dan `StatsRequest`; `ValidateStruct` berbasis validator; error `ErrNotFound` berkode `AUDIT_001`; helper `toJSON`.

### backend/internal/domain/audit/entity.go
Model GORM `AuditLog` (tabel `audit_logs`, dikomentari append-only): `ActorID`, `ActorRole` (role saat aksi), `Action` (mis. `booking.create`), `TargetType`, `TargetID`, `Status` (SUCCESS/FAILED/ERROR), `Metadata` kolom JSON, `IPAddress`, `UserAgent`. File juga mendefinisikan konstanta aksi lintas domain (`ActionBookingCreate`, `ActionPaymentStart`, `ActionTicketIssue`, `ActionTicketTypeCreate`, `ActionUserLogin`, dst.) dan konstanta status.

### backend/internal/domain/audit/handler.go
`Handler.List` (bind query `ListRequest` → validate → usecase → `OKWithMeta`), `Handler.Get`, `Handler.StatsByAction`, `Handler.StatsByActor` (dari query `from`/`to`). Komentar menegaskan route dipasang pemanggil dengan auth dan mount `/admin/audit`; `RegisterRoutes` hanya memasang path relatif.

### backend/internal/domain/audit/repository.go
Interface `Repository` (Create, List dengan 8 filter opsional, GetByID, CountByAction, CountByActor). `List` membangun where clause dinamis (actor/action/target/status) plus rentang `created_at` per tanggal (from+" 00:00:00" s/d to+" 23:59:59"), urut `created_at DESC`. Dua metode statistik memakai GROUP BY dan mengembalikan `map[string]int64`.

### backend/internal/domain/audit/service.go
Sisi tulis + pembaca: `Log` best-effort (error ditelan, `_ = s.repo.Create`, komentar menyebut pertimbangan queue async), `LogSuccess`/`LogFailure` sebagai wrapper; `List` menormalkan paginasi (default 20, maks 100); `GetByID`; dua metode stats. Helper metadata standar: `BuildMetadata` (pasangan key-value variadik), `BookingMetadata`, `PaymentMetadata`, `TicketMetadata`, `TicketTypeMetadata`, `StatusChangeMetadata`. Juga menyediakan context key (`CtxAuditActorID`, dst.) dengan `ExtractAuditInfo`/`WithAuditInfo` agar middleware bisa menyuntikkan info aktor ke request context.

### backend/internal/domain/audit/usecase.go
`Usecase.List` memanggil service lalu memetakan `[]AuditLog` → `[]AuditLogResponse` via `toAuditLogResponse`; `GetByID` memetakan nil → `ErrNotFound`; `StatsByAction`/`StatsByActor` pass-through. Lapisan ini yang menyatukan DTO dan entity untuk handler.

---

## domain/visitors

Domain pandangan admin atas akun pengguna: daftar pengunjung (role PENGUNJUNG) yang diperkaya agregat booking, serta daftar staf (ADMIN/MANAGER/PETUGAS) dengan statistik dan mutasi status aktif. Domain ini sengaja TIDAK mengimpor domain auth; ia membaca langsung tabel `users`, `user_roles`, `roles`, dan `bookings`. Endpoint di `RegisterRoutes` (dalam file handler):

- Baca (ADMIN/MANAGER/super_admin): `GET /admin/visitors`, `GET /admin/visitors/stats`, `GET /admin/visitors/:id`, `GET /admin/staff`, `GET /admin/staff/stats`, `GET /admin/staff/:id`
- Mutasi (ADMIN/super_admin): `PATCH /admin/staff/:id/status`

Tidak ada file dto/usecase/service terpisah — `Service` tipis (hanya memegang repo) dan handler hidup dalam satu file handler.go.

### backend/internal/domain/visitors/entity.go
Read-model: `Visitor` (TableName `users`; ID, name, email, phone, `JoinedAt` read-only, IsActive disembunyikan dari JSON), `StatsRow` (Visitor + `TotalBookings`, `TotalSpent`, `LastVisit`), `VisitorStats` (total, baru bulan ini, aktif = punya booking PAID, total revenue), `Staff` (users dengan `Role gorm:"-"`, gate, shift, `Status` derived AKTIF/NONAKTIF, last login), dan `StaffStats` (total, aktif, `ByRole`, jumlah admin/manager/petugas).

### backend/internal/domain/visitors/handler.go
Berisi `Service` tipis (`NewService(repo)`), `Handler` (`NewHandler(service)`), dan enam endpoint baca + `SetStaffStatus` (validasi status harus AKTIF/NONAKTIF, lalu `repo.SetStaffActive`). Handler memanggil repo melalui `h.service.repo` langsung dan membungkus error dengan `apperror.Internal`; not-found ditangani `response.NotFound`. `RegisterRoutes` memisahkan grup `read` (ADMIN+MANAGER, dengan komentar bahwa manager butuh data ini untuk monitoring) dan grup `admin` untuk mutasi PATCH. Helper `pageParams` tersedia untuk paginasi.

### backend/internal/domain/visitors/repository.go
Interface `Repository` (ListVisitors, FindVisitorByID, VisitorStats, ListStaff, FindStaffByID, StaffStats, SetStaffActive). `visitorRows` memakai JOIN `user_roles`/`roles` (konstanta `visitorJoin`) dan LEFT JOIN subquery agregat booking (jumlah booking, total belanja hanya status PAID/CONFIRMED/USED, `MAX(visit_date)`) untuk memperkaya setiap pengunjung PENGUNJUNG. `VisitorStats` dihitung di memori dari baris tersebut; `FindVisitorByID`/`FindStaffByID` men-scan seluruh daftar lalu mencari ID (sederhana, tanpa query terpisah). `staffRows` menggabungkan role, dan `SetStaffActive` melakukan UPDATE `is_active` dengan cek `RowsAffected` untuk deteksi "staff not found".


---

# Bagian 4 — Frontend: konfigurasi, halaman (app/), komponen UI, providers

Bagian ini mendokumentasikan frontend Next.js 15 (App Router) proyek KawahPutih, terletak di `D:\kawahputih\frontend`. Frontend berkomunikasi dengan backend Go melalui proxy same-origin `/api/v1` (rewrites Next.js), memakai Tailwind CSS untuk styling, Zustand untuk store state, dan TanStack Query untuk data-fetching yang berbasis hook.

## Root frontend (konfigurasi)

Folder ini berisi seluruh file konfigurasi build, linting, dan tooling frontend Next.js.

### frontend/.env.example
Contoh environment variable frontend: berisi `NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1` yang menunjuk ke backend Go lokal. File ini di-commit sebagai template; nilai asli diisi di file lokal.

Catatan: `frontend\.env.local` (env lokal dengan nilai asli) dan `frontend\tsconfig.tsbuildinfo` (file cache hasil build TypeScript) tidak didokumentasikan lebih lanjut karena keduanya tidak dikomit ke repo.

### frontend/middleware.ts
Middleware Next.js yang berjalan di edge sebelum halaman protected dirender. Memeriksa cookie sesi `kpr_access_token` untuk prefix `/dashboard`, `/admin`, `/manager`, `/petugas`: token di-decode base64url, diverifikasi bentuknya (3 segmen JWT), ada `uid`, dan belum `exp` (dengan toleransi 5 detik). Bila tidak valid, request di-redirect ke `/login?redirect=...` dan cookie dihapus. Validasi tanda tangan tetap dilakukan backend — middleware ini hanya optimasi UX, bukan batas keamanan tunggal.

### frontend/next.config.ts
Konfigurasi Next.js: `reactStrictMode`, `rewrites` yang mem-proxy `/api/v1/:path*` ke backend (`API_PROXY_TARGET`, default `http://127.0.0.1:8080`) agar cookie HttpOnly auth bisa memakai `SameSite=Lax` pada satu origin, `images.remotePatterns` dari env `NEXT_PUBLIC_IMAGE_HOSTS` (default Unsplash/Pexels), serta security headers global (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`).

### frontend/package.json
Manifest frontend "KawahPutih-frontend" v0.1.0. Script: `dev` (via `scripts/dev.mjs`), `dev:http` (`next dev`), `build`, `start`, `lint`. Dependensi utama: Next 15.0.3, React 18.3.1, TanStack React Query 5, react-hook-form + zod, Zustand 5, sonner (toast), lucide-react (ikon), framer-motion, date-fns, qrcode/react-qr-code (QR e-tiket), jsqr (scan QR), jspdf (unduh e-tiket PDF), xlsx (ekspor laporan), class-variance-authority, clsx, tailwind-merge. DevDependencies: TypeScript 5.6, Tailwind 3.4, ESLint 8 + eslint-config-next, autoprefixer.

### frontend/postcss.config.js
Konfigurasi PostCSS minimalis: pipeline `tailwindcss` lalu `autoprefixer`, standar untuk proyek Tailwind.

### frontend/tailwind.config.ts
Konfigurasi Tailwind dengan `darkMode: "class"` dan content glob `app/`, `components/`, `features/`. Mendefinisikan palet warna brand teal (`brand` 50/100/500/600/700, light/dark/DEFAULT), `secondary`, `accent`, semantik (`success`, `warning`, `danger`, `info`), `surface`, `appbg`, `borderc`, `text` (light/dark), font heading Poppins & body Inter via CSS variable, skala font tipografi kustom (`display` s.d. `caption`), radius (`card`, `btn`, `input`, `dialog`), dan shadow `floating`.

### frontend/tsconfig.json
TypeScript strict: `target ES2020`, `noUncheckedIndexedAccess`, `isolatedModules`, `moduleResolution: "bundler"`, `noEmit`, plugin Next. Path alias `@/*` → root proyek. Include mencakup `**/*.ts(x)`, `next-env.d.ts`, dan tipe hasil build `.next`/`.next-prod`; exclude `node_modules`.

### frontend/.eslintrc.json
Konfigurasi ESLint satu baris: `extends: "next/core-web-vitals"`, aturan bawaan Next.js.

## app/ (root)

File kerangka aplikasi: layout root, CSS global, dan halaman status/error.

### app/layout.tsx
Root layout: memuat font Google Poppins & Inter sebagai CSS variable, mengatur `metadata` SEO (judul ber-templated "%s | Kawah Putih Rancabali", description, keywords, Open Graph, Twitter card, robots), lalu membungkus seluruh aplikasi dengan provider berurutan: `QueryProvider` → `ThemeProvider` → `AuthProvider` → children + `ToastProvider`. `lang="id"` dengan `suppressHydrationWarning` untuk dark mode.

### app/globals.css
CSS global Tailwind (3 directive `@tailwind`) plus variabel desain biru muda (`--ink`, `--muted`, `--line`, `--blue`, `--green`, dll.), styling `body`/heading, indikator fokus WCAG AA (`:focus-visible`), dan kelas panel: `.page-shell` (kontainer max 1280px), `.panel-surface`, `.panel-table` (tabel padat bergaya referensi PDF), `.panel-scroll` (scroll horizontal), `.panel-nav` (scrollbar disembunyikan), serta aturan responsif `.panel-rail` (rail ikon hanya untuk perangkat berpointer 768–1023px) dan animasi drawer `.panel-scrim`/`.panel-drawer` yang dimatikan saat `prefers-reduced-motion`.

### app/error.tsx
Error boundary route-level ("use client"): menampilkan ikon AlertTriangle, pesan error, dan tombol "Coba lagi" (memanggil `reset()`). Memakai komponen `Button`.

### app/global-error.tsx
Global error boundary fallback paling atas (mengganti seluruh `<html>`): halaman bergaya inline (tanpa dependensi styling) berisi judul "Aplikasi mengalami masalah", pesan error, dan tombol "Coba lagi". Warna tombol hijau (#33643f).

### app/loading.tsx
Loading UI route-level default: spinner `Loader2` berputar di tengah layar dengan warna `brand-600`, memenuhi `min-h-screen`.

### app/not-found.tsx
Halaman 404 global: angka "404" besar berwarna brand, pesan "Halaman tidak ditemukan", dan tombol "Kembali ke Beranda" menuju `/`. Memakai util `cn`.

### app/unauthorized/page.tsx
Halaman "Akses Ditolak" (metadata title khusus): kartu terpusat dengan ikon ShieldAlert merah, penjelasan bahwa halaman khusus peran tertentu, dan dua tombol: "Ke Beranda" (`/`) serta "Ganti Akun" (`/login`). Halaman ini ditampilkan oleh guard rute ketika role tidak diizinkan.

## app/(public)/ — halaman publik

Grup route publik tanpa otentikasi. Layout membungkus semua halaman dengan Navbar dan Footer.

### app/(public)/layout.tsx
Layout publik: me-render `<Navbar />`, `<main>` berisi children (min-height dikurangi tinggi navbar 4rem), dan `<Footer />`.

### app/(public)/page.tsx
Beranda (Server Component, `force-dynamic`). Mengambil FAQ published lewat `faqService.listPublished()` dan me-render beberapa section: Hero dengan gambar `/images/Kawah-Putih.jpg` + CTA "Pesan Tiket", "Pilih Tiketmu" (3 kartu dari konten statis `homeTicketOptions` di `lib/content`), "Kenali Kawah Putih" (dari `aboutSections`), testimoni pengunjung (`visitorStories`), sejarah (`aboutHistory`), dan FAQ memakai komponen `FaqAccordion` plus CTA card biru.

### app/(public)/about/page.tsx
Halaman "Tentang Kawah Putih" (Server Component, `force-dynamic`). Mengambil data destinasi lewat `destinationInfoService.getPublished()`; menampilkan sejarah (`history`, dengan fallback teks statis bila kosong), tiga kartu Fasilitas & Informasi (additional_info/destination_desc/aturan statis), blok Lokasi & Kontak (`location`, `operating_hours`, `contact`) bila tersedia, dan CTA menuju `/packages`.

### app/(public)/articles/page.tsx
Daftar artikel publik ("use client"). Data dari hook `useArticles({ status: "published", limit: 20 })` (TanStack Query) sehingga perubahan CMS admin langsung tampil tanpa rebuild. Menampilkan state loading/error/kosong, lalu daftar kartu artikel (judul, excerpt line-clamp, tanggal `published_at` diformat `formatDate`) yang menaut ke `/articles/[id]`.

### app/(public)/articles/[id]/page.tsx
Detail artikel publik ("use client"). Mengambil artikel lewat `useArticle(id)` berdasarkan param URL; menampilkan loading, lalu halaman "Artikel tidak ditemukan" bila error/kosong/status bukan published. Bila valid, me-render judul + konten dalam `prose` (whitespace-pre-line).

### app/(public)/booking/page.tsx
Halaman "Pemesanan Anda" (Server Component). Merender `BookingOrderForm` (dari `features/public/components`) di dalam `<Suspense>` dengan fallback skeleton dua panel — form-nya sendiri membaca query string (`date`, `items`) dari halaman pilih tiket.

### app/(public)/contact/page.tsx
Halaman contact saat ini masih placeholder: me-render komponen `ComingSoon` dengan label "Halaman contact", menandai jelas bahwa modulnya belum dibangun.

### app/(public)/destination/page.tsx
Placeholder: `ComingSoon` "Halaman destination" — halaman destinasi tunggal belum diimplementasikan.

### app/(public)/e-ticket/page.tsx
Halaman E-Tiket ("use client"). Membaca query `code` (booking id) dan `new=1` di `useEffect`, lalu mengambil tiket lewat `eTicketService.getByBookingId(q)` dari `services/api`. Me-render detail tiket (kode booking, status VALID/USED/EXPIRED/CANCELLED dengan tone warna, nama pemesan, tanggal kunjungan, rincian item, total via `rupiah`), QR code asli (komponen `react-qr-code` dengan payload `qr_data` yang sama seperti tersimpan di backend), tombol "Download PDF" yang memetakan data snake_case → camelCase lalu memanggil `downloadETicketPDF()` dan menandai terunduh via `eTicketService.markDownloaded()`, tombol cetak (`window.print()`), dan state not-found. Banner hijau "Pembayaran berhasil" muncul bila `new=1`.

### app/(public)/events/page.tsx
Placeholder: `ComingSoon` "Halaman events" — modul event belum dibangun.

### app/(public)/facilities/page.tsx
Halaman "Fasilitas Kawah Putih" (Server Component, `force-dynamic`). Mengambil daftar fasilitas published via `facilityService.listPublished()` dan menampilkannya dalam grid kartu; ikon lucide dipetakan dari nama ikon di data (`ICON_MAP`: car, coffee, waves, dll., fallback Info), lengkap dengan lokasi dan jam operasional bila ada. Menampilkan pesan kosong bila belum ada fasilitas, plus CTA "Pesan Tiket Sekarang".

### app/(public)/faq/page.tsx
Halaman FAQ (Server Component, `force-dynamic`). Mengambil FAQ published via `faqService.listPublished()` dan me-render `FaqAccordion`, disamping aside biru sticky "Masih ada pertanyaan?" dengan tautan Hubungi Kami (`/contact`) dan Pesan Tiket. Komentar kode menegaskan data diambil saat request agar build tidak bergantung backend.

### app/(public)/gallery/page.tsx
Halaman Galeri (Server Component, `force-dynamic`). Mengambil maksimal 30 item via `galleryService.list({ limit: 30 })` dan me-render grid foto responsif (2/3/4 kolom) memakai `next/image` dengan efek hover scale; pesan kosong bila belum ada foto.

### app/(public)/packages/page.tsx
Halaman "Pilih Tiket" (utama untuk pemesanan; "use client"). Mengambil tiket aktif via `ticketService.getActive()` (`services/ticket.api.service`), mengelompokkannya per kategori (`ENTRANCE`, `SUNRISE`, `PACKAGE`, `TRANSPORT`, `ACTIVITY`, `SERVICE` dengan label Indonesia) dalam accordion yang bisa dilipat, dan semua qty dimulai dari 0. Pengunjung memilih tanggal dengan komponen `DatePicker` (dibatasi `BOOKING_CONFIG.minDaysAhead/maxDaysAhead`), menambah/kurangi jumlah per tiket (maks 20), dan sidebar sticky menampilkan ringkasan harga dihitung lewat util terpusat `calculateBookingTotals` (subtotal, diskon, biaya layanan, pajak, total via `rupiah`). Tombol "Pesan" mengarah ke `/booking?date=...&items=id:qty,...`. Ada state loading (skeleton) dan error (tombol Coba Lagi) yang jelas.

### app/(public)/packages/[id]/page.tsx
Detail paket wisata (Server Component, `force-dynamic`). Mengambil paket via `destinationService.get(id)`; `generateMetadata` menyetel judul/deskripsi/OG image dari paket; `notFound()` bila tidak ada. Me-render gambar cover (`<img>` biasa dengan eslint-disable karena remote dynamic), nama, durasi (jam), kapasitas maksimum, deskripsi, dan sidebar sticky berisi harga (`formatCurrency(price_cents, currency)`) plus `BookingForm` dari `features/booking/components`.

### app/(public)/payment/page.tsx
Halaman "Metode Pembayaran" (Server Component). Menerima `searchParams.code` (async) lalu me-render `PaymentPanel` dari `features/public/components` dengan kode booking tersebut — panel inilah yang menangani pemilihan metode dan unggah bukti bayar.

### app/(public)/promotions/page.tsx
Placeholder: `ComingSoon` "Halaman promotions" — halaman promosi publik belum diimplementasikan.

### app/(public)/visitor-rules/page.tsx
Halaman "Aturan Kunjungan" (Server Component, `force-dynamic`). Mengambil aturan published via `visitorRuleService.listPublished()`, mengelompokkannya berdasarkan `category` (diurutkan alfabetis), dan merender tiap aturan dengan badge prioritas beremoji (low 🟢 / normal 🔵 / high 🟠 / critical 🔴). Menampilkan state kosong bila belum ada aturan.

### app/(public)/weather/page.tsx
Placeholder: `ComingSoon` "Halaman weather" — fitur cuaca belum dibangun.

## app/(auth)/ — halaman otentikasi

Grup route login/daftar/reset tanpa layout khusus (tidak ada layout.tsx); tiap halaman menata dirinya sendiri.

### app/(auth)/forgot-password/page.tsx
Halaman "Lupa Password": kartu terpusat (max-w-sm, latar brand-50/dark slate-950) berisi judul dan `ForgotPasswordForm` dari `features/authentication/components`.

### app/(auth)/login/page.tsx
Halaman "Masuk" dengan layout dua kolom: panel kiri berisi `LogoMark` besar + teks brand "KAWAH PUTIH / Rancabali, Bandung Selatan" di atas gradien biru, panel kanan kartu berisi heading "Masuk" dan `LoginForm`. Di bawah ada tautan kembali ke beranda. Metadata title "Masuk".

### app/(auth)/register/page.tsx
Halaman "Daftar / Buat Akun Baru": kartu terpusat berisi `RegisterForm` dari `features/authentication/components`, dengan subtitle "Kawah Putih Rancabali Tourism".

### app/(auth)/reset-password/page.tsx
Halaman "Atur Ulang Password": kartu terpusat berisi `ResetPasswordForm` untuk memasukkan password baru (token reset dibaca oleh form itu sendiri).

## app/(dashboard)/ — panel pengunjung

Panel pengunjung (PENGUNJUNG) dengan kerangka PanelLayout dan sidebar biru.

### app/(dashboard)/layout.tsx
Layout panel pengunjung ("use client"): memakai `useRouteGuard(["PENGUNJUNG","ADMIN","MANAGER","PETUGAS"])` — render `null` bila guard belum "allowed" — lalu membungkus children dengan `PanelLayout role="Pengunjung"` dan tautan sidebar: Ringkasan, Booking Saya, Tiket Saya, Pembayaran, Riwayat, Profil, Keamanan Akun.

### app/(dashboard)/dashboard/page.tsx
Dashboard ringkasan pengunjung ("use client"). Mengambil semua booking milik user via `bookingService.listMine()` dan user dari `useAuthStore`; menampilkan 4 StatCard (Total Booking, Menunggu Pembayaran, Terkonfirmasi, Tiket Digunakan) dan tabel `SectionCard` "Booking Terbaru" (5 terakhir) dengan kolom kode/tanggal/total/StatusPill/aksi: tautan E-Tiket untuk booking dibayar, tautan Bayar untuk PENDING.

### app/(dashboard)/dashboard/booking/page.tsx
Halaman "Booking Saya" (Server Component tipis): `PageHeader` + me-render `MyBookingsList` dari `features/booking/components`, yang berisi daftar lengkap booking user.

### app/(dashboard)/dashboard/history/page.tsx
Halaman "Riwayat" ("use client"). Mengambil hingga 100 booking via `bookingService.listMine({ limit: 100 })`, mengurutkan terbaru dulu (per `created_at`), dan menampilkan tabel riwayat lengkap: kode booking, tanggal kunjungan, jumlah tiket, total (`rupiah`), StatusPill berlabel Indonesia, dan aksi (E-Tiket / Bayar sesuai status). Ada state loading, banner error, dan empty state dengan CTA "Pesan Tiket".

### app/(dashboard)/dashboard/notification/page.tsx
Placeholder: `ComingSoon` "Halaman notification" — pusat notifikasi pengunjung belum dibangun.

### app/(dashboard)/dashboard/payment/page.tsx
Halaman "Pembayaran" ("use client"). Mengambil 50 booking terakhir via `bookingService.listMine({ limit: 50 })` lalu membaginya: section "Menunggu Pembayaran" (booking PENDING dengan snapshot pembayaran `b.payment` — metode & status) yang tiap item punya tombol "Bayar Sekarang" ke `/payment?code=`, dan "Riwayat Pembayaran" berupa tabel (kode, tanggal, total, metode, StatusPill status pembayaran, tombol Detail ke e-tiket atau halaman bayar). State loading/error/empty tersedia.

### app/(dashboard)/dashboard/profile/page.tsx
Halaman "Profil" ("use client"). Membaca user dari `useAuthStore`; menampilkan dl profil (Nama, Email, Telepon, Role, Gate/Shift bila ada) dengan mode edit inline untuk nama & telepon yang disimpan via `authService.updateProfile()` (toast sonner untuk sukses/gagal, validasi nama minimal 3 karakter), tombol Batal, dan tombol Logout (hook `useLogout`). Mengembalikan `null` bila user belum ada.

### app/(dashboard)/dashboard/review/page.tsx
Placeholder: `ComingSoon` "Halaman review" — fitur ulasan pengunjung belum dibangun.

### app/(dashboard)/dashboard/setting/page.tsx
Halaman "Keamanan Akun" ("use client", tipis): `PageHeader` + Card berisi `ChangePasswordForm` dari `features/authentication/components` untuk ganti password akun yang sedang login.

### app/(dashboard)/dashboard/ticket/page.tsx
Halaman "Tiket Saya" ("use client"). Sumber data tunggal `eTicketService.listMine()` (GET /e-tickets/mine) sehingga status sama dengan yang dibaca petugas saat scan. Menampilkan tiga tab pill berhitungan: Aktif (VALID), Digunakan (USED), Tidak Aktif (EXPIRED/CANCELLED); tiap tiket dirender sebagai kartu berisi kode booking, jenis tiket × qty, QR code (`react-qr-code`, payload `qr_data`), nama, tanggal kunjungan, total, StatusPill, serta tombol "Lihat E-Tiket" dan "Unduh PDF" yang mengarah ke `/e-ticket?code=`. State loading (2 kartu skeleton), error, dan empty dengan CTA Pesan Tiket.

### app/(dashboard)/dashboard/wishlist/page.tsx
Placeholder: `ComingSoon` "Halaman wishlist" — fitur wishlist belum dibangun.

## app/(admin)/ — panel admin

Panel ADMIN dengan layout guard khusus ADMIN dan sidebar menu lengkap.

### app/(admin)/layout.tsx
Layout panel admin ("use client"): guard `useRouteGuard(["ADMIN"])`; memakai `useAuditFeed({ limit: 1 })` untuk mendapat total entri audit sebagai badge di item sidebar "Aktivitas". Sidebar berisi 11 tautan (Dashboard, Kelola Tiket/Booking/Pembayaran/Pengunjung/Petugas, Kelola Konten, Laporan, Aktivitas, Audit Log, Settings) yang dirender lewat `PanelLayout role="Admin"`.

### app/(admin)/admin/activity-log/page.tsx
Halaman redirect saja: me-render `redirect("/admin/audit-log")` karena aktivitas admin kini ditampilkan di halaman audit-log.

### app/(admin)/admin/analytics/page.tsx
Placeholder: `ComingSoon` "Halaman admin: analytics" — halaman analitik khusus admin belum dibangun (data analitik ada di dashboard/laporan).

### app/(admin)/admin/articles/page.tsx
Halaman "Kelola Artikel" (tipis): heading + me-render `ArticlesAdmin` dari `features/cms/components`, komponen CRUD artikel (draft/published) milik modul CMS.

### app/(admin)/admin/audit-log/page.tsx
Halaman "Audit Log" ("use client"). Mengambil feed audit via hook `useAuditFeed({ page, limit: 20, action, status, from, to })` (sumber: GET /admin/audit). Filter interaktif: dropdown aksi (ticket.validate, ticket.issue, booking.*, payment.*, user.login/register), status (SUCCESS/FAILED/ERROR), dan rentang tanggal. Tabel menampilkan waktu, label aksi (`auditActionLabel`), aktor (actor_role atau SYSTEM), target, StatusPill, dan keterangan dari metadata (scan_status / booking_code). Tombol muat ulang dan paginasi Hal x/y. Menampilkan hasil validasi tiket oleh petugas, valid maupun ditolak.

### app/(admin)/admin/banner/page.tsx
Placeholder: `ComingSoon` "Halaman admin: banner" — pengelolaan banner carousel belum dibangun (halaman publik banner juga belum ada).

### app/(admin)/admin/bookings/page.tsx
Halaman "Kelola Booking" ("use client", halaman terbesar di admin). Memuat seluruh booking (maks 100) via `bookingService.listWithMeta({ limit: 100 })` lalu filter/paginasi di klien agar angka ringkasan akurat: 5 kartu ringkasan (Total, Berhasil, Menunggu, Dibatalkan, Selesai), pencarian (`searchIn`), filter status & tanggal kunjungan, sorting per kolom, paginasi baris/hal (8/15/30). Aksi per baris: lihat detail (dialog dengan rincian item & total), ubah status via dropdown (`bookingService.updateStatus`), dan hapus (`bookingService.remove`) dengan dialog konfirmasi adaptif — booking berstatus pendapatan (PAID/CONFIRMED/USED) tidak boleh dihapus langsung: dialog menjelaskan dan tombolnya menjadi "Batalkan Booking" (status → CANCELLED), booking USED tidak dapat dibatalkan/dihapus sama sekali demi akurasi laporan.

### app/(admin)/admin/categories/page.tsx
Placeholder: `ComingSoon` "Halaman admin: categories" — pengelolaan kategori tiket/konten belum dibangun.

### app/(admin)/admin/contacts/page.tsx
Placeholder: `ComingSoon` "Halaman admin: contacts" — pengelolaan pesan kontak masuk belum dibangun.

### app/(admin)/admin/content/page.tsx
Halaman "Kelola Konten" ("use client"): hub ke modul konten publik. Mengambil statistik lima modul secara paralel dengan `Promise.allSettled` — destinationInfo, gallery, faq, facilities, visitorRules (masing-masing via service `*.list`) — lalu menghitung total/published/draft per modul. Menampilkan kartu modul (ikon berwarna, deskripsi, statistik, tombol "Kelola Konten" ke halaman masing-masing), tombol Refresh, dan info waktu pembaruan terakhir. Toast peringatan bila sebagian statistik gagal dimuat.

### app/(admin)/admin/dashboard/page.tsx
Dashboard admin ("use client"). Mengambil `analyticsService.getAdminDashboard()` dan `analyticsService.getManagerAnalytics({ range: "7d" })` secara paralel; menampilkan 6 StatCard (Total Booking, Tiket Terjual, Total Pengunjung, Pendapatan via `rupiah`, Booking Hari Ini, Pengunjung Hari Ini) dan `SectionCard` grafik garis "Grafik Penjualan Tiket (7 Hari Terakhir)" dari `revenue_trend`. State loading berupa 6 kartu placeholder.

### app/(admin)/admin/destination-info/page.tsx
Halaman "Kelola Informasi Kawah Putih" (tipis): heading + `DestinationInfoAdmin` dari `features/destination-info/components` — CRUD informasi destinasi (sejarah, lokasi, jam operasional, kontak) yang tampil di halaman publik /about.

### app/(admin)/admin/destinations/page.tsx
Placeholder: `ComingSoon` "Halaman admin: destinations" — pengelolaan destinasi multi-lokasi belum dibangun (informasi destinasi ditangani destination-info).

### app/(admin)/admin/events/page.tsx
Placeholder: `ComingSoon` "Halaman admin: events" — pengelolaan event belum dibangun.

### app/(admin)/admin/facilities/page.tsx
Halaman "Kelola Fasilitas" (tipis): heading + `FacilityAdmin` dari `features/facility/components` — CRUD fasilitas (nama, deskripsi, ikon, lokasi, jam) yang tampil di /facilities publik.

### app/(admin)/admin/faq/page.tsx
Halaman "Kelola FAQ" (tipis): heading + `FAQAdmin` dari `features/faq/components` — CRUD pertanyaan-jawaban dengan flag is_published yang tampil di beranda & /faq.

### app/(admin)/admin/gallery/page.tsx
Halaman "Kelola Galeri" (tipis): heading + `GalleryAdmin` dari `features/gallery/components` — pengelolaan foto galeri (upload, judul) yang tampil di /gallery publik.

### app/(admin)/admin/notifications/page.tsx
Halaman "Aktivitas" ("use client"): feed audit ringkas dari `useAuditFeed({ limit: 50 })` (GET /admin/audit), tanpa mock. Me-render daftar entri (ikon lingkaran, label aksi, StatusPill Berhasil/Gagal/Bermasalah, aktor · target · waktu) dengan tombol Muat ulang dan subtitle jumlah entri tercatat. Dipakai sebagai halaman "Aktivitas" yang ditaut dari sidebar dengan badge total.

### app/(admin)/admin/packages/page.tsx
Halaman "Kelola Paket Wisata" (tipis): heading + `PackagesAdmin` dari `features/destination/components` — CRUD paket wisata (nama, harga, durasi, kapasitas, cover) yang ditampilkan di /packages publik.

### app/(admin)/admin/payments/page.tsx
Halaman "Kelola Pembayaran" ("use client"). Mengambil daftar pembayaran server-side via `paymentService.list({ page, limit: 8, status })` (`services/payment.api.service`) dengan pencarian, filter status (PENDING/PROCESSING/PAID/FAILED/EXPIRED/REFUNDED berlabel Indonesia), dan toggle urutan tanggal. Tabel: nomor, StatusPill, nomor transaksi, metode, tombol detail; dialog detail menampilkan ID, kode booking, metode, nominal (`rupiah`), status, waktu dibuat/dibayar/kadaluarsa. Paginasi bila >1 halaman.

### app/(admin)/admin/permissions/page.tsx
Placeholder: `ComingSoon` "Halaman admin: permissions" — pengelolaan izin granular belum dibangun.

### app/(admin)/admin/promotion/page.tsx
Placeholder: `ComingSoon` "Halaman admin: promotion" — pengelolaan promosi/kode diskon belum dibangun.

### app/(admin)/admin/refunds/page.tsx
Placeholder: `ComingSoon` "Halaman admin: refunds" — pengelolaan refund belum dibangun.

### app/(admin)/admin/reports/page.tsx
Halaman "Laporan" ("use client"). Menggabungkan data nyata dari empat service secara paralel: `analyticsService.getAdminDashboard()`, `getManagerAnalytics({ range: "30d" })`, `bookingService.list({ limit: 100 })`, `paymentService.list({ limit: 100 })`, `visitorService.list()`. Menampilkan 4 StatCard (Pendapatan/Booking/Tiket 30 hari, Pengunjung Terdaftar), ringkasan pembayaran per status, rekap kunjungan harian (agregasi dari booking berbayar: booking, tiket, pendapatan), dan tabel laporan booking & pengunjung yang bisa difilter/dicari (maks 100 booking terbaru, dengan catatan batas data). Tombol "Ekspor CSV" menulis file dengan proteksi CSV formula injection (`csvCell` memberi prefiks apostrof untuk sel berawalan = + - @).

### app/(admin)/admin/roles/page.tsx
Placeholder: `ComingSoon` "Halaman admin: roles" — pengelolaan role belum dibangun (role dikelola via seed backend).

### app/(admin)/admin/settings/page.tsx
Halaman "Settings" admin ("use client"). Empat kartu: (1) Konfigurasi Booking — read-only dari `config/app.config.ts` (kapasitas/hari, maks hari ke depan, maks tiket per jenis, biaya layanan, kadaluarsa pembayaran, metode QRIS simulasi); (2) Sesi Saat Ini — user/email/role/gate dari `useAuthStore`, plus catatan akun staf di-provision di `backend/internal/seed/seed.go`; (3) Keamanan Akun — `ChangePasswordForm`; (4) Ringkasan Data — statistik langsung backend via `useQuery` pada `analyticsService.getAdminDashboard()`.

### app/(admin)/admin/tickets/page.tsx
Halaman "Kelola Tiket" ("use client", CRUD penuh). Data via `ticketService.list({ status })`; filter status, pencarian, sorting harga, paginasi adaptif. Aksi: tambah/edit lewat dialog form (validasi nama ≥3 karakter, harga & kapasitas > 0; kode tiket baru dibuat otomatis dari nama "TKT-…"; kategori ENTRANCE default), toggle status AKTIF/NONAKTIF (`ticketService.updateStatus`), hapus dengan dialog konfirmasi (`ticketService.delete`), dan dialog detail (ID, kode, harga, kapasitas, status, dibuat). Toast untuk setiap aksi; state loading skeleton.

### app/(admin)/admin/users/page.tsx
Halaman "Kelola Petugas" ("use client"). Data via `staffService.list()`; pencarian (nama/email/gate), filter status & shift (PAGI/SIANG/MALAM), paginasi 8/halaman. Menampilkan tabel petugas (nama, email, role, StatusPill Aktif/Nonaktif) dengan aksi edit dan toggle status (`staffService.updateStatus`). Dialog form tambah/edit petugas (nama, email, telepon, role PETUGAS GERBANG/TIKET/SUPERVISOR/ADMIN, shift, gate) dengan validasi email & nomor 08xx — namun secara jujur disebutkan di toast: backend saat ini baru mendukung update status, belum endpoint create/update penuh.

### app/(admin)/admin/visitor-rules/page.tsx
Halaman "Kelola Aturan Kunjungan" (tipis): heading + `VisitorRuleAdmin` dari `features/visitor-rule/components` — CRUD aturan (kategori, prioritas low–critical, is_published) yang tampil di /visitor-rules publik.

### app/(admin)/admin/visitors/page.tsx
Halaman "Kelola Pengunjung" ("use client"). Data via `visitorService.list()`; pencarian nama/email, sort by joined_at desc, paginasi 8/hal. Tombol "Riwayat" membuka dialog detail yang menampilkan ringkasan (Total Booking, Total Belanja via `rupiah`, Terakhir Berkunjung) dan memuat riwayat booking pengunjung lazily via `bookingService.listForVisitor(detail.id, { limit: 100 })` lengkap dengan snapshot pembayaran (dua StatusPill per baris). State loading skeleton.

### app/(admin)/admin/voucher/page.tsx
Placeholder: `ComingSoon` "Halaman admin: voucher" — pengelolaan voucher diskon belum dibangun.

## app/(manager)/ — panel manager

Panel MANAGER (hanya-baca terhadap data operasional): statistik, laporan, dan monitoring petugas.

### app/(manager)/layout.tsx
Layout panel manager ("use client"): guard `useRouteGuard(["MANAGER"])`, lalu `PanelLayout role="Manager"` dengan tautan bergrup: Dashboard; Statistik → Penjualan; Laporan → Pendapatan, Booking, Statistik Pengunjung; Monitoring → Petugas; plus Keamanan Akun.

### app/(manager)/manager/bookings/page.tsx
Halaman "Laporan Booking" ("use client", read-only). Mengambil booking via `bookingService.list({ page, limit: 10, status })`; 5 kartu ringkasan (Semua, Terkonfirmasi, Menunggu, Selesai, Dibatalkan) dihitung dari halaman aktif, filter pencarian & status, tabel tanpa aksi tulis (kode, nama, tanggal kunjungan, jumlah tiket, total, StatusPill), dan paginasi. Subtitle menegaskan sifat read-only.

### app/(manager)/manager/dashboard/page.tsx
Dashboard manager ("use client", read-only). Mengambil `analyticsService.getManagerAnalytics()` dua kali (range 7d & month); 4 StatCard (Total Pengunjung, Tiket Terjual, Total Booking, Total Pendapatan — bulanan), grafik garis "Tren Pendapatan (7 Hari Terakhir)", kartu aksen "Pendapatan Hari Ini" dengan `ChangeBadge` persentase perubahan vs periode lalu, dan `ProgressList` "Tiket Terlaris (7 hari)" dari `ticket_type_performance`.

### app/(manager)/manager/monitoring/page.tsx
Halaman "Monitoring Petugas" ("use client"). Menggabungkan dua query TanStack: `staffService.list()` dan `scannerService.getMonitoring()` (agregat /manager/monitoring — riwayat scan mentah tetap wilayah petugas). Menampilkan 3 StatCard (Petugas Aktif, Total Tiket Validasi, Validasi Hari Ini), tabel aktivitas per petugas (nama, role, gate, jumlah validasi yang dicocokkan dari `per_petugas`, aktivitas terakhir, status), `BarChart` validasi per jam hari ini, dan kartu rekap total kunjungan. Menangani loading/error gabungan.

### app/(manager)/manager/revenue/page.tsx
Halaman "Laporan Pendapatan" ("use client"). Data dari `analyticsService.getManagerAnalytics({ range, custom })` dengan komponen `DateRangeFilter` (preset/kustom). Menampilkan 3 StatCard (Total Pendapatan dengan delta % vs periode lalu, Pendapatan Hari Ini, Rata-rata / Booking), grafik garis tren pendapatan, dan `ListPanel` pendapatan per jenis tiket. Tombol ekspor membangun `ReportData` lalu memanggil `exportReportPDF()` / `exportReportExcel()` (lib `lib/report-export`) dengan toast konfirmasi.

### app/(manager)/manager/sales/page.tsx
Halaman "Statistik Penjualan" ("use client", read-only). Data dari `getManagerAnalytics` sesuai rentang `DateRangeFilter`; me-render `PieChart` komposisi penjualan per jenis tiket (fallback booking trend), kartu total penjualan besar, `ProgressList` penjualan per jenis tiket, `BarChart` Weekday vs Weekend, dan kartu Total Pendapatan. Juga bisa diekspor PDF/Excel lewat `buildReport()` yang mengemas summary, tren, ticket performance, status pembayaran, dan daily rows.

### app/(manager)/manager/settings/page.tsx
Halaman "Keamanan Akun" manager ("use client", tipis): `PageHeader` + `SectionCard` berisi `ChangePasswordForm` (password lama wajib diverifikasi).

### app/(manager)/manager/visitors/page.tsx
Halaman "Statistik Pengunjung" ("use client", read-only). Data dari `analyticsService.getManagerAnalytics` (mendukung rentang custom) dengan `DateRangeFilter`; menampilkan `BarChart` tren pengunjung (dari booking_trend, warna hijau), `BarChart` Weekday vs Weekend, kartu aksen biru Total Pengunjung dengan delta ▲/▼ % vs periode sebelumnya, dan `ListPanel` kunjungan per jenis tiket.

## app/(petugas)/ — panel petugas gerbang

Panel PETUGAS untuk validasi tiket di gerbang.

### app/(petugas)/layout.tsx
Layout panel petugas ("use client"): guard `useRouteGuard(["PETUGAS"])`, lalu `PanelLayout role="Petugas"` dengan tautan: Dashboard, Scan QR, Riwayat Validasi, Detail Tiket, Keamanan Akun.

### app/(petugas)/petugas/dashboard/page.tsx
Dashboard petugas ("use client"). Mengambil `scannerService.getHistory({ page: 1, limit: 8 })` dan `scannerService.getStats()`; KPI hari ini dihitung dari scan bertanggal hari ini: Scan Valid, Tiket Sudah Digunakan, Tiket Bermasalah (INVALID/EXPIRED/CANCELLED), dan Total Tiket Digunakan Sistem (masih 0 — komentar menyebut butuh API e-tiket terpisah). Tabel "Riwayat Scan Terbaru" (8 entri: waktu, kode tiket, nama, StatusPill berlabel Indonesia). Subtitle memakai gate & nama petugas dari `useAuthStore`.

### app/(petugas)/petugas/history/page.tsx
Halaman "Riwayat Validasi" ("use client"). Data via `scannerService.getHistory({ page, limit: 10, status })`; pencarian (kode/booking/nama/petugas), filter status (VALID/USED/INVALID/EXPIRED/CANCELLED), toggle urutan waktu, paginasi. Tabel: waktu scan, kode tiket, nama pengunjung, petugas, StatusPill. State loading skeleton dan empty state.

### app/(petugas)/petugas/scan/page.tsx
Halaman "Scan QR Code" — fitur inti petugas ("use client"). Kamera `getUserMedia` (facingMode environment) dirender langsung di dalam kotak scan; frame video digambar ke canvas dan dibaca jsQR dalam loop `requestAnimationFrame` (throttle 350ms) — tanpa aplikasi kamera terpisah. Payload QR dikirim ke `scannerService.validateTicket({ ticket_id, gate, petugas })`; hasil VALID/USED/EXPIRED/CANCELLED/INVALID ditampilkan sebagai kartu berwarna berisi detail tiket (nama, kode booking, jenis tiket, tanggal kunjungan) plus toast. Deteksi QR sama ditahan 4 detik agar tidak memicu validasi ganda; ada guard `scanningRef`. Menangani error kamera secara eksplisit: secure context (kamera hanya di HTTPS/localhost — halaman via IP LAN diberi tombol "Buka versi HTTPS"), izin ditolak, kamera tidak ditemukan; input kode manual selalu tersedia.

### app/(petugas)/petugas/settings/page.tsx
Halaman "Keamanan Akun" petugas ("use client", tipis): `PageHeader` + `SectionCard` berisi `ChangePasswordForm` (password lama wajib diverifikasi).

### app/(petugas)/petugas/ticket/page.tsx
Halaman "Detail Tiket" ("use client"). Pencarian hanya-baca (tidak pernah membakar tiket): memasukkan kode tiket (TK-…) atau booking (KP-…) lalu memanggil `lookupTicket(searchCode)` dari `services/scanner.api.service`; hasil ditampilkan sebagai dua kartu: "Informasi Pemesan" (nama, email, kode tiket/booking, tanggal kunjungan, jenis & jumlah tiket, info check-in, StatusPill) dan kartu status kanan (Tiket Diterima / Sudah Digunakan dengan detail scan terakhir / Tidak Dapat Digunakan). Tautan ke Scan Tiket dan Riwayat Validasi; blok riwayat scan tiket siap tapi `scans` selalu kosong untuk saat ini. Kode file menyisakan banyak baris kosong di bagian bawah.

## components/

Komponen UI reusable lintas halaman: brand, empty state, form input, layout panel, chart, tabel, dan primitif UI.

### components/brand/brand.tsx
Komponen logo teks ringkas: ikon Mountain dalam kotak biru muda + "Kawah Putih" dan subtitle opsional; `light` untuk latar gelap. Menaut ke `/` — dipakai di area yang belum memakai LogoMark SVG.

### components/brand/logo-mark.tsx
Logo mark SVG resmi Kawah Putih (dua gunung biru dengan salju putih dan garis dasar) — satu-satunya sumber SVG brand agar konsisten di navbar, panel, dan halaman login. Ukuran dikendalikan lewat prop `className`.

### components/empty/coming-soon.tsx
Komponen placeholder "Coming Soon": ikon Construction, judul `feature`, dan pesan jujur bahwa fitur menunggu modul backend terkait — halaman sengaja ditandai jelas, bukan dikosongkan, supaya tidak terlihat seperti bug. Dipakai banyak halaman placeholder di seluruh app/.

### components/empty/empty-state.tsx
Komponen empty state generik: ikon Inbox dalam kartu dashed-border dengan judul (default "Belum ada data") dan deskripsi opsional.

### components/footer/footer.tsx
Footer publik 4 kolom: brand + tagline; tautan "Jelajahi" (Beranda, Pilih Tiket, Galeri, Artikel); "Informasi" (Tentang, FAQ, Kontak); "Kontak" (alamat Ciwidey, email, jam buka). Baris bawah berisi copyright tahun berjalan "Kawah Putih Rancabali Tourism".

### components/inputs/date-picker.tsx
DatePicker kustom ("use client") menggantikan input date bawaan browser: tombol pemicu + kalender popup dibangun dengan date-fns (locale Indonesia, minggu mulai Senin). Mendukung `min`/`max` (hari di luar rentang disabled dengan strikethrough), navigasi bulan dibatasi rentang, penutupan via klik luar/Escape, sorotan hari ini dan tanggal terpilih, dan menghasilkan nilai ISO `yyyy-MM-dd`. Aksesibel (`aria-haspopup`, `aria-expanded`, `aria-invalid`, `aria-describedby`).

### components/inputs/phone-input.tsx
PhoneInput ("use client"): input nomor HP dengan dropdown kode negara (13 negara, default +62 Indonesia); daftar tertutup hanya menampilkan kode, terbuka menampilkan nama negara. Eksport util: `parsePhone` (urai nomor tersimpan jadi kode+nomor, prefiks terpanjang dulu), `composePhone` (susun nilai ke backend; +62 biarkan backend menormalkan 08…), dan `validatePhoneByCode` (regex nomor Indonesia `08xx` vs nomor lokal negara lain, null berarti valid). Menutup dropdown via klik luar/touch/Escape.

### components/layout/panel-layout.tsx
Kerangka panel bersama Admin/Manager/Petugas/Dashboard ("use client"). Header putih sticky (burger + brand LogoMark + "Role Panel", tombol Beranda, avatar inisial + nama user), sidebar biru dengan tiga mode tata letak: drawer penuh (< 1024px, kunci scroll body + Escape + tutup otomatis saat rute/layar berubah), rail ikon 68px untuk 768–1023px berpointer presisi (aturan pointer di globals.css), dan sidebar penuh 200px (≥ 1024px). `PanelLink` mendukung `section` (label grup) dan `badge` angka; `isActive` menandai rute aktif; tombol Logout memanggil `useLogout()` + toast + redirect `/login`. Logika nav dirender oleh komponen internal `NavGroups` (variant full/rail).

### components/loading/skeleton.tsx
Dua komponen loading: `Skeleton` (blok pulse generik) dan `CardGridSkeleton` (grid 1/2/3 kolom berisi kartu gambar + dua baris teks) untuk placeholder daftar kartu.

### components/navbar/navbar.tsx
Navbar publik ("use client") sticky dengan backdrop-blur: brand Mountain + "Kawah Putih / Website Wisata", 6 tautan utama (Beranda, Pilih Tiket, Tentang, Fasilitas, FAQ, Galeri dari `ROUTES`), dan area kanan: `AvatarMenu` (dropdown Dasbor sesuai `ROLE_HOME`, Profil khusus PENGUNJUNG, Logout — memakai `useAuthStore`/`useLogout`) bila login, atau tautan Login + tombol Register. Di layar kecil tersedia menu hamburger collapsible.

### components/pagination/pagination.tsx
Komponen paginasi generik berbasis `ApiMeta` dari `lib/api`: tampilkan bila `total_pages > 1`, tombol prev/next dengan disabled state, label "Halaman x dari y", dan callback `onPageChange`.

### components/panel/date-range-filter.tsx
DateRangeFilter ("use client") reusable untuk halaman analytics manager: pill preset Hari Ini / 7 Hari / 30 Hari / Bulan Ini / Kustom, dan bila kustom ditampilkan dua input date (dari–sampai, dengan validasi min/max) yang langsung memanggil `onChange(preset, custom)`.

### components/panel/panel-toolbar.tsx
Kumpulan toolbar panel ("use client"): `SearchInput` (input pencarian dengan ikon), `FilterSelect` (dropdown status), `ToggleGroup` (pill pilihan), `DateField` (input tanggal berlabel), dan `FilterableTable<T>` — tabel generik dengan pencarian multi-key, filter status opsional, slot `toolbarExtra`, dan empty state bawaan; kolom didefinisikan lewat `FColumn` (header + render).

### components/panel/panel-ui.tsx
Pustaka visual panel (tanpa "use client", bisa dipakai server/client): `PageHeader` (judul + subtitle + action), `SectionCard` (kartu section dengan header opsional), `StatCard` (label, nilai, delta/trend, icon, varian accent biru), `StatGrid` (grid 2/3/4 kolom), `StatusPill` (pill status dengan tone warna dari STATUS_TONE: berhasil/valid/aktif hijau, menunggu amber, dibatalkan/gagal merah, dst.), `PanelTable`, serta chart SVG buatan sendiri tanpa dependensi: `LineChart` (garis + titik + gridline), `BarChart`, `PieChart` (donat + legenda), `ProgressList`, `InfoTile`, dan `ListPanel`.

### components/sidebar/admin-sidebar.tsx
Sidebar admin versi lama ("use client"): daftar 6 tautan (Ringkasan, Pengguna, Artikel, Galeri, Paket Wisata, Booking) dengan indikator aktif via `usePathname`. Tata letak kolom di mobile, sidebar vertikal di desktop. Catatan: dipakai sebagai dasar awal; panel admin aktual kini memakai `PanelLayout` di `app/(admin)/layout.tsx`.

### components/tables/data-table.tsx
Tabel data generik sederhana: `DataTable<T>` menerima `columns` (header + fungsi `cell`) dan `rows`; me-render tabel responsif bergaya slate/dark dengan overflow-x. Tidak menyediakan paginasi/filter (yang ada di level halaman atau FilterableTable).

### components/ui/badge.tsx
Komponen Badge: pill kecil dengan pemetaan warna `STATUS_COLORS` untuk status ber-underscore (pending_payment, paid, checked_in, draft/published, active/inactive, prioritas low–critical, dll.), varian `outline`, dan fallback label/generic; konten dari `children ?? label ?? status`.

### components/ui/button.tsx
Komponen Button berbasis class-variance-authority: varian primary/outline/secondary/ghost/destructive/success dan size sm/md/lg, gaya token Tailwind brand (`bg-brand`, `rounded-btn`). Prop tambahan `loading` yang menampilkan spinner Loader2 dan men-disable tombol; forwardRef.

### components/ui/card.tsx
Komponen Card sederhana: div dengan radius `rounded-card`, border `borderc`, shadow-sm, dan varian dark mode — wadah generik untuk konten.

### components/ui/confirm-dialog.tsx
ConfirmDialog ("use client") untuk aksi destruktif: overlay fixed + kartu terpusat (ikon Trash2 merah, judul, deskripsi), tombol Batal (outline) dan konfirmasi (destructive, berputar saat `loading`); tertutup via klik overlay atau Escape (kecuali sedang loading) dan mengunci scroll body. Tanpa dependency dialog eksternal.

### components/ui/input.tsx
Komponen Input (forwardRef): styling konsisten `rounded-input border-borderc bg-white` dengan focus ring brand dan varian dark mode; siap dipakai dengan react-hook-form.

### components/ui/select.tsx
Komponen Select (forwardRef): `<select>` bawaan yang ditata seperti Input/Textarea; sengaja sederhana (uncontrolled) agar kompatibel dengan `register()` react-hook-form.

### components/ui/textarea.tsx
Komponen Textarea (forwardRef): styling sama dengan Input/Select, untuk input teks panjang (mis. konten artikel).

## providers/

Provider konteks level aplikasi yang dipasang di root layout.

### providers/auth-provider.tsx
AuthProvider ("use client"): memastikan sesi dari backend direhidrasi sebelum halaman protected di-render — memanggil `authService.checkSession()` sekali saat mount (dengan flag modul `hydrated` agar tidak ganda) dan menghapus sesi kedaluwarsa via store `auth.store`. Juga mengekspor `useAuthReady()` untuk guard agar tidak terjadi redirect palsu saat SSR.

### providers/query-provider.tsx
QueryProvider ("use client"): membungkus aplikasi dengan `QueryClientProvider` TanStack React Query; QueryClient dibuat sekali via `useState` initializer dengan default: retry 1, staleTime 30 detik, `refetchOnWindowFocus: false`.

### providers/session-provider.tsx
SessionProvider ("use client") hanyalah passthrough — komentar menegaskan proyek TIDAK memakai NextAuth; backend menerbitkan JWT access/refresh sendiri dan sesi disimpan di `store/auth.store.ts` (Zustand, persist ke localStorage). Komponen ini hanya memenuhi struktur providers/ dan jadi tempat rehidrasi bila nanti ditambahkan validasi sesi server-side.

### providers/theme-provider.tsx
ThemeProvider ("use client"): membaca tema dari store `theme.store` (Zustand) dan men-toggle class `dark` pada `document.documentElement` — sinkron dengan `darkMode: "class"` di Tailwind.

### providers/toast-provider.tsx
ToastProvider ("use client"): me-render `<Toaster>` dari sonner dengan posisi top-center, `richColors`, dan tombol close — semua notifikasi toast aplikasi (mis. hasil aksi CRUD) lewat komponen ini.


---

# Bagian 5 — Frontend: features, services, hooks, lib, store, types, scripts

Dokumentasi frontend aplikasi Kawah Putih Rancabali (Next.js App Router + TypeScript + Tailwind + Zustand + TanStack Query). Semua folder di bawah terletak di `D:\kawahputih\frontend\` (root frontend). Sebagian besar file konfigurasi/kode di dokumentasikan dengan path relatif terhadap `frontend/`.

## config/

Folder konfigurasi aplikasi: nilai-nilai yang mungkin perlu diubah pemilik proyek (brand, kapasitas, biaya, role, metode pembayaran) dikumpulkan terpusat di sini.

### config/app.config.ts
`APP_CONFIG` menyimpan identitas aplikasi (nama "Kawah Putih Rancabali", tagline, mata uang IDR, kapasitas pengunjung harian 1.000, jam operasional 07:00–17:00, alamat/kontak). `BOOKING_CONFIG` memuat aturan pemesanan: minDaysAhead (0), maxDaysAhead (365), maksimum 20 tiket per jenis, biaya layanan Rp2.500, persentase diskon/pajak (0 = nonaktif), kadaluarsa pembayaran QRIS 15 menit, dan `paymentSuccessRate` 0.9 untuk simulasi pembayaran (dengan opsi `forceOutcome` saat testing). Nilai-nilai ini dipakai lib/business, booking-form, dan perhitungan total.

### config/auth.config.ts
Konfigurasi sesi & role: daftar role aplikasi (`APP_ROLES`: PENGUNJUNG/ADMIN/MANAGER/PETUGAS), peta tautan "Dasbor" per role (`ROLE_HOME`), tujuan default setelah login (`POST_LOGIN_HOME` — pengunjung selalu kembali ke beranda), durasi sesi 8 jam (`SESSION_DURATION_MS`), serta key localStorage `kpr-auth` dan nama cookie `kpr_access_token`. Tidak ada kredensial di sini; akun validasi di backend.

### config/payment.config.ts
Daftar metode pembayaran yang didukung, dengan catatan bahwa kode metode HARUS sama persis dengan konstanta backend (`payments/entity.go`) karena dikirim apa adanya ke `POST /payments/process`. Mendefinisikan tipe `PaymentMethodCode` (QRIS, GOPAY, OVO, DANA, SHOPEEPAY, BCA/BNI/MANDIRI/BRI VA, CARD, ALFAMART, INDOMARET), grup metode (`PAYMENT_METHOD_GROUPS`: QRIS, E-Wallet, Transfer Bank/VA, Kartu, Gerai Retail) beserta hint per metode, helper `findPaymentMethod` dan `paymentMethodLabel` untuk lookup kode → label ramah-baca.

## constants/

Konstanta lintas modul: konfigurasi API, nama role backend, dan peta route aplikasi.

### constants/api.ts
Mengekspor ulang `API_BASE_URL` dari `lib/api/client` agar tidak ada dua sumber konfigurasi base URL yang bisa berbeda, dan mendefinisikan `DEFAULT_PAGE_SIZE = 12`.

### constants/roles.ts
Mencerminkan seed role di backend (`database/migrations/002_role.up.sql`): ADMIN, SUPER_ADMIN, OWNER, FINANCE_ADMIN, STAFF_TICKETING, STAFF_CONTENT, VISITOR. String harus sama dengan yang dikembalikan API pada array `roles` pengguna; tipe `RoleName` diturunkan dari konstanta ini.

### constants/routes.ts
Peta semua route aplikasi (`ROUTES`): halaman publik (/, /login, /register, /packages, /articles, /gallery, /booking, /payment, /e-ticket, dst.), dasbor pengunjung (/dashboard/*), area admin (/admin/*: tickets, bookings, payments, visitors, users, content, reports, articles, gallery, packages), area manager (/manager/*: sales, revenue, bookings, visitors, monitoring), dan area petugas (/petugas/*: scan, history, ticket). `PACKAGE_DETAIL` memakai ID, bukan slug, karena domain package backend hanya mengekspos FindByID.

## features/

Folder fitur — komponen UI per domain (form, tabel admin, skema validasi Zod). Setiap subfolder memuat `components/` dan `schemas/`.

## features/authentication/

Form alur autentikasi untuk semua role: login, register, lupa/reset/ganti password.

### features/authentication/components/change-password-form.tsx
Form ganti password untuk SEMUA role: memvalidasi dengan `changePasswordSchema` (Zod), memanggil hook `useChangePassword` → backend `POST /auth/password/change` (verifikasi password lama, simpan hash bcrypt baru, cabut semua sesi). Setelah sukses form dikosongkan dan pengguna diarahkan ke /login dengan toast sukses; error field ditampilkan inline dengan atribut aksesibilitas (aria-invalid/aria-describedby).

### features/authentication/components/forgot-password-form.tsx
Form lupa password: sanitasi email via `sanitizeEmail`, validasi `forgotPasswordSchema`, lalu memanggil `authService.forgotPassword` (endpoint backend `POST /auth/password/forgot`). Backend selalu memberi respons netral agar keberadaan email tidak bocor; UI menampilkan pesan "kalau email terdaftar, link reset sudah dikirim" plus tautan kembali ke /login.

### features/authentication/components/login-form.tsx
Form login utama: validasi real-time email/password, show/hide password, checkbox "Ingat saya", pengisian ulang email dari sesi tersimpan (localStorage `kpr-auth`), dan validasi akhir via `loginSchema` (Zod). Menggunakan hook `useLogin` yang membawa parameter `?redirect=` (divalidasi `safeRedirectPath`) supaya pengguna kembali ke halaman asal (mis. /booking). Juga menyediakan tombol Google OAuth yang aktif hanya bila `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true`, mengarah ke `API_BASE_URL/auth/google`.

### features/authentication/components/register-form.tsx
Form pendaftaran akun PENGUNJUNG baru: field nama, email, telepon (komponen `PhoneInput` dengan pilihan kode negara + `composePhone`/`validatePhoneByCode`), password & konfirmasi, masing-masing dengan validasi real-time lalu validasi akhir `registerSchema`. Mengirim ke `useRegister` → backend `POST /auth/register`; setelah sukses user otomatis login dan diarahkan ke beranda dengan toast.

### features/authentication/components/reset-password-form.tsx
Form reset password memakai token sekali pakai dari email (`?token=` di query string). Jika token tidak ada menampilkan pesan link tidak valid; jika ada, memvalidasi `resetPasswordSchema` dan memanggil `authService.resetPassword` (`POST /auth/password/reset` dengan field `new_password`). Setelah sukses diarahkan ke /login dengan toast.

### features/authentication/schemas/auth.schema.ts
Kumpulan skema Zod untuk seluruh form auth: `loginSchema`, `registerSchema` (nama 3–100 karakter tanpa `<>`, email, telepon Indonesia/internasional opsional, password 8–72 karakter wajib huruf besar+kecil+angka, konfirmasi cocok), `forgotPasswordSchema`, `resetPasswordSchema`, dan `changePasswordSchema` (password baru wajib beda dari yang lama). Juga helper `sanitizeInput`, `sanitizeEmail`, dan `validatePhone` (normalisasi +62/62 → 08, panjang 10–13 digit).

## features/booking/

Fitur pemesanan tiket: form booking dari halaman paket, daftar riwayat booking pengunjung, dan skema validasi.

### features/booking/components/booking-form.tsx
Form booking pada halaman detail paket wisata: memuat tiket aktif via `ticketService.getActive()` (`GET /tickets/active`), memilih jenis tiket/tanggal kunjungan (DatePicker dengan min/max dari `BOOKING_CONFIG`)/jumlah/data pemesan (prefill dari auth store), validasi real-time + `bookingSchema`, lalu `bookingService.create` (`POST /bookings`). Jika belum login diarahkan ke `/login?redirect=/packages/<id>`; setelah sukses menuju `/payment?code=<booking.id>`. Memuat helper `validatePhone` lokal.

### features/booking/components/my-bookings-list.tsx
Daftar riwayat booking pengunjung dari `bookingService.listMine()` (`GET /bookings/mine`), dikelompokkan ke tiga tab: Akan Datang (PENDING/PAID/CONFIRMED dengan visit_date >= hari ini), Selesai (USED atau CONFIRMED/PAID yang lewat), Dibatalkan (CANCELLED/EXPIRED). Aksi per baris: tautan E-Tiket (`/e-ticket?code=`), unduh PDF via `eTicketService.getByBookingId` + `downloadETicketPDF` + `eTicketService.markDownloaded`, bayar sekarang (`/payment?code=`), batalkan (`bookingService.cancel`, DELETE /bookings/:id), dan dialog detail berisi item tiket serta total (format `rupiah`).

### features/booking/schemas/booking.schema.ts
Skema Zod booking: `visitorSchema` (nama 3–100 tanpa `<>`, email, telepon regex Indonesia `(\+62|62|0)8…`), `bookingItemSchema` (ticket_id UUID, quantity 1–20), `bookingSchema` (visit_date YYYY-MM-DD, 1–10 jenis tiket, note maks 500). Helper `validateVisitDate` (tidak boleh masa lalu, maksimal 60 hari ke depan), `validatePhone`, serta `sanitizeInput`/`sanitizeEmail`/`sanitizePhone` (normalisasi +62/62 → 0).

## features/cms/

Manajemen konten artikel oleh admin.

### features/cms/components/articles-admin.tsx
Panel admin artikel: daftar via `useArticles` (React Query), form create (react-hook-form + `articleSchema`) untuk membuat draft artikel, serta aksi publikasikan (draft → published) dan hapus melalui hook `useCreateArticle`/`usePublishArticle`/`useDeleteArticle` (backend `POST /articles`, `POST /articles/:id/publish`, `DELETE /articles/:id`). Ditampilkan dalam `DataTable` dengan kolom judul, status (Badge), dan aksi; state loading/error/kosong ditangani Skeleton/EmptyState.

### features/cms/schemas/article.schema.ts
Skema Zod artikel: `title` 5–200 karakter, `excerpt` maks 500 (opsional), `content` minimal 20 karakter, `cover_image` URL valid opsional atau string kosong.

## features/destination/

Komponen paket wisata (publik & admin).

### features/destination/components/home-packages.tsx
Grid 6 paket aktif untuk halaman beranda: mengambil data via `usePackages({ active_only: true, limit: 6 })` (backend `GET /packages?active_only=true`), menampilkan skeleton saat loading, EmptyState saat error/kosong, dan merender `PackageCard` per item dalam grid responsif.

### features/destination/components/package-card.tsx
Kartu paket wisata yang menautkan ke `/packages/<id>` — bukan slug — dengan komentar bahwa domain package backend hanya mengekspos FindByID, bukan FindBySlug. Menampilkan gambar sampul (next/image, fallback teks "Tidak ada gambar"), nama, deskripsi line-clamp-2, durasi (jam), dan harga terformat `formatCurrency(pkg.price_cents, pkg.currency)`.

### features/destination/components/packages-admin.tsx
Panel admin paket wisata: daftar via `usePackages({ limit: 20 })`, form create (nama, deskripsi, URL gambar, harga Rp — dikonversi `price*100` ke price_cents, durasi, kapasitas) dengan `packageSchema`, aksi aktif/nonaktif (update payload `is_active` di-toggle) dan hapus via `useCreatePackage`/`useUpdatePackage`/`useDeletePackage` (backend `POST /packages`, `PUT /packages/:id`, `DELETE /packages/:id`). Tabel menampilkan nama, harga, kapasitas/hari, status, dan aksi.

### features/destination/components/packages-list.tsx
Grid 9 paket aktif untuk halaman daftar paket publik: memakai `usePackages({ active_only: true, limit: 9 })` dan merender `PackageCard` per item, dengan skeleton dan EmptyState yang sama seperti HomePackages.

### features/destination/schemas/package.schema.ts
Skema Zod formulir paket: `code` (3–20, huruf besar/angka), `name` (3–100, tanpa `<>`), `description` (maks 1000, opsional), `cover_image` (URL opsional), `category` (enum ENTRANCE/TRANSPORT/SUNRISE/PACKAGE/ACTIVITY/SERVICE), `price`, `duration_hours` (min 1), `capacity`, `max_capacity` (min 1, default 100), `status` (AKTIF/NONAKTIF), dan `notes` (maks 500).

## features/destination-info/

Manajemen "Informasi Destinasi" (sejarah, lokasi, jam operasional, kontak) oleh admin.

### features/destination-info/components/destination-info-admin.tsx
Panel admin informasi destinasi: daftar via `useDestinationInfoList`, badge status publikasi via `usePublishedDestinationInfo`, form create/edit (react-hook-form + `destinationInfoSchema`, field judul/deskripsi/sejarah/deskripsi destinasi/lokasi/jam operasional/kontak/info tambahan), serta aksi publikasikan (draft), arsipkan (published), edit, dan hapus dengan `ConfirmDialog` sebelum `useDeleteDestinationInfo` dijalankan. Semua mutasi (create/update/publish/archive/delete) memanggil endpoint admin `/admin/destination-info*`.

### features/destination-info/schemas/destination-info.schema.ts
Skema Zod informasi destinasi: `title` 3–200 karakter, `description` minimal 10 karakter, dan field opsional dengan default "" — `history`, `destination_desc`, `location` (maks 500), `operating_hours` (maks 200), `contact` (maks 500), `additional_info`.

## features/facility/

Manajemen fasilitas kawasan oleh admin.

### features/facility/components/facility-admin.tsx
Panel admin fasilitas: daftar via `useFacilityList({ limit: 50 })`, penghitung total/dipublikasikan/draft dari `usePublishedFacilityList`, form create/edit (nama, ikon Lucide, URL gambar dengan pratinjau next/image, lokasi, jam operasional, deskripsi, status select dari `FACILITY_STATUSES`, sort_order, checkbox publikasikan) memakai `facilitySchema`, serta edit dan hapus dengan ConfirmDialog. Mutasi via `useCreateFacility`/`useUpdateFacility`/`useDeleteFacility` (endpoint `/admin/facilities*`); tabel menampilkan thumbnail gambar, lokasi, status, publikasi, urutan, dan aksi.

### features/facility/schemas/facility.schema.ts
Skema Zod fasilitas: `name` 3–150 karakter, field opsional `description` (maks 500), `icon` (maks 200), `image_url` (URL atau kosong), `location`/`operating_hours` (maks 200), `status` enum `FACILITY_STATUSES` default "active", `is_published` default false, `sort_order` int >= 0 default 0.

## features/faq/

Manajemen FAQ oleh admin.

### features/faq/components/faq-admin.tsx
Panel admin FAQ: daftar via `useFAQList({ limit: 50 })`, penghitung total/dipublikasikan/draft dari `usePublishedFAQList`, form create/edit (pertanyaan, jawaban, kategori select dari `FAQ_CATEGORIES`, sort_order, checkbox publikasikan) memakai `faqSchema`, serta edit dan hapus dengan ConfirmDialog. Mutasi via `useCreateFAQ`/`useUpdateFAQ`/`useDeleteFAQ` (endpoint `/admin/faq*`); tabel menampilkan pertanyaan, kategori, status publikasi, urutan, dan aksi.

### features/faq/schemas/faq.schema.ts
Skema Zod FAQ: `question` 5–500 karakter, `answer` minimal 10 karakter, `category` enum `FAQ_CATEGORIES`, `sort_order` int >= 0 default 0, `is_published` default false.

## features/gallery/

Manajemen galeri foto oleh admin.

### features/gallery/components/gallery-admin.tsx
Panel admin galeri: daftar via `useGallery({ limit: 24 })`, form create/edit (judul, unggah file foto via `uploadService.image` → `POST /uploads` yang mengembalikan path `/api/v1/uploads/...` diset sebagai image_url, pratinjau next/image, kategori) memakai `galleryItemSchema`; tombol simpan disabled saat mengunggah atau image_url kosong. Grid foto dengan overlay hover berisi tombol edit dan hapus (dengan ConfirmDialog). Mutasi via `useCreateGalleryItem`/`useUpdateGalleryItem`/`useDeleteGalleryItem` (endpoint `/gallery*`).

### features/gallery/schemas/gallery.schema.ts
Skema Zod item galeri: `title` 3–200 karakter, `image_url` wajib — menerima path relatif hasil unggahan (`/api/v1/uploads/...`) maupun URL absolut agar data galeri lama tidak rusak — dan `category` (maks 100, default "").

## features/public/

Komponen halaman publik: form pemesanan multi-langkah, accordion FAQ, dan panel pembayaran.

### features/public/components/booking-order-form.tsx
Form langkah kedua alur pemesanan: pemilihan tanggal & tiket dibawa lewat query string (`?date=...&items=id:qty,id:qty`, diparse `parseItems`), lalu halaman ini melengkapi data pemesan (nama, nomor HP dengan `PhoneInput` + kode negara, email, catatan) — prefill dari profil user yang login. Memuat tiket via `ticketService.getActive()` untuk menerjemahkan pilihan, menghitung total via `calculateBookingTotals`, memvalidasi, lalu `bookingService.create` (`POST /bookings`); nomor HP juga disimpan ke profil via `authService.updateProfile` (`PATCH /auth/profile`) tanpa membatalkan pesanan bila gagal. Jika belum login diarahkan ke `/login?redirect=<halaman booking>`; tiket yang tidak lagi tersedia dibuang dengan peringatan, dan jika pilihan kosong tampil pesan untuk kembali ke /packages.

### features/public/components/faq-accordion.tsx
Accordion FAQ publik sederhana: menerima array `FAQ[]`, satu item terbuka pada satu waktu (default item pertama), tombol pertanyaan dengan ikon Plus/Minus dan atribut `aria-expanded`, menampilkan jawaban saat terbuka; menampilkan pesan "Belum ada FAQ yang dipublikasikan" bila kosong. Data berasal dari `usePublishedFAQList` (`GET /faq`).

### features/public/components/payment-panel.tsx
Panel pembayaran halaman /payment: memuat booking (`bookingService.getById` → `GET /bookings/:id`) dan payment (`paymentService.getByBookingId` → `GET /payments/booking/:id`), state machine fase LOADING/WAITING/PROCESSING/SUCCESS/FAILED/EXPIRED/NOT_FOUND, pemilihan metode dari `PAYMENT_METHOD_GROUPS`, countdown kadaluarsa dari `payment.expired_at` (memanggil `paymentService.expirePayment` saat 0), dan tombol "Bayar Sekarang" yang memanggil `paymentService.processPayment` (`POST /payments/process`) — hasil SUCCESS/FAILED/EXPIRED ditentukan backend; saat sukses e-tiket dibuka (`/e-ticket?code=...&new=1`). Instruksi pembayaran hanya menampilkan `midtrans_redirect_url` yang tervalidasi HTTPS (tidak ada QR/nomor VA buatan browser); menampilkan ringkasan pesanan (item, subtotal, biaya layanan, total).

## features/visitor-rule/

Manajemen aturan kunjungan oleh admin.

### features/visitor-rule/components/visitor-rule-admin.tsx
Panel admin aturan kunjungan: daftar via `useVisitorRuleList({ limit: 50 })`, penghitung total/dipublikasikan/draft dari `usePublishedVisitorRuleList`, form create/edit (judul, deskripsi, kategori dari `VISITOR_RULE_CATEGORIES`, prioritas dari `VISITOR_RULE_PRIORITIES` dengan ikon Flag/Shield/AlertTriangle, sort_order, checkbox publikasikan) memakai `visitorRuleSchema`, serta edit dan hapus dengan ConfirmDialog. Mutasi via `useCreateVisitorRule`/`useUpdateVisitorRule`/`useDeleteVisitorRule` (endpoint `/admin/visitor-rules*`).

### features/visitor-rule/schemas/visitor-rule.schema.ts
Skema Zod aturan kunjungan: `title` 3–200 karakter, `description` minimal 10 karakter, `category` enum `VISITOR_RULE_CATEGORIES`, `priority` enum `VISITOR_RULE_PRIORITIES` default "normal", `sort_order` int >= 0 default 0, `is_published` default false.

## hooks/

Hook React (TanStack Query + Zustand) yang menjadi jembatan antara komponen dan service API; komponen tidak memanggil service langsung.

### hooks/use-admin-users.ts
Dua query untuk panel admin: `useStaff()` (queryKey `["admin","staff"]` → `staffService.list()` → `GET /admin/staff`) dan `useVisitors()` (queryKey `["admin","visitors"]` → `visitorService.list()` → `GET /admin/visitors`), mengembalikan array `Staff[]` dan `Visitor[]`.

### hooks/use-analytics.ts
`useManagerAnalytics(range, custom?)` — analytics manager dari `analyticsService.getManagerAnalytics` (endpoint `GET /manager/analytics` dengan param `range` dan `custom` JSON untuk rentang kustom), queryKey memasukkan range dan tanggal, `staleTime` 5 detik. Tipe `DateRangePreset`: today/7d/30d/month/custom.

### hooks/use-articles.ts
CRUD artikel dengan TanStack Query: `useArticles(params)` (list → `GET /articles`), `useArticle(id)`, `useCreateArticle`, `useUpdateArticle`, `usePublishArticle` (`POST /articles/:id/publish`), `useDeleteArticle` — semua mutasi meng-invalidate queryKey `["articles"]` agar daftar segar.

### hooks/use-audit.ts
`useAuditFeed(params)` — feed aktivitas admin dari `auditService.list` (`GET /admin/audit`) dengan queryKey berisi page, limit, action, target_type, status, from, to; `staleTime` 10 detik. Menggantikan mock DB sebagai sumber notifikasi admin.

### hooks/use-auth.ts
Jembatan komponen ke auth service: `useUser`, `useIsAuthenticated`, `useHasRole` (membaca auth store), `useLogin` (prioritas redirect: parameter pemanggil → `?redirect=` URL → halaman default per role; lewat `safeRedirectPath` yang menolak URL eksternal), `useRegister`, `useChangePassword` (setelah sukses push /login karena backend mencabut semua refresh token), dan `useLogout`. Re-export `useAuthStore` dan `SessionUser` untuk kompatibilitas kode lama.

### hooks/use-destination-info.ts
CRUD informasi destinasi: `useDestinationInfoList`, `useDestinationInfo(id)`, `usePublishedDestinationInfo` (`GET /destination-info`), `useCreateDestinationInfo`, `useUpdateDestinationInfo`, `usePublishDestinationInfo`, `useArchiveDestinationInfo`, `useDeleteDestinationInfo` — semua invalidasi queryKey `["destination-info"]`.

### hooks/use-destinations.ts
CRUD paket wisata: `usePackages(params)` (list → `GET /packages` dengan `active_only`), `usePackage(id)`, `useCreatePackage`, `useUpdatePackage`, `useDeletePackage` — invalidasi queryKey `["packages"]`.

### hooks/use-facility.ts
CRUD fasilitas: `useFacilityList(params)` (list → `GET /admin/facilities`), `useFacility(id)`, `usePublishedFacilityList` (`GET /facilities`), `useCreateFacility`, `useUpdateFacility`, `useDeleteFacility` — invalidasi queryKey `["facility"]`.

### hooks/use-faq.ts
CRUD FAQ: `useFAQList(params)` (list → `GET /admin/faq`), `useFAQ(id)`, `usePublishedFAQList(category?)` (`GET /faq`), `useCreateFAQ`, `useUpdateFAQ`, `useDeleteFAQ` — invalidasi queryKey `["faq"]`.

### hooks/use-gallery.ts
CRUD galeri: `useGallery(params)` (list → `GET /gallery`), `useGalleryItem(id)`, `useCreateGalleryItem`, `useUpdateGalleryItem`, `useDeleteGalleryItem` — invalidasi queryKey `["gallery"]`.

### hooks/use-route-guard.ts
Route guard berbasis role: `useRouteGuard(allowed: AppRole[])` mengembalikan "checking"/"allowed"/"denied". Menunggu `useAuthReady` agar sesi terverifikasi (render null supaya panel tidak berkedip); belum login → redirect `/login?redirect=<path saat ini>`, role tidak sesuai → `/unauthorized`.

### hooks/use-visitor-rule.ts
CRUD aturan kunjungan: `useVisitorRuleList(params)` (list → `GET /admin/visitor-rules`), `useVisitorRule(id)`, `usePublishedVisitorRuleList(category?)` (`GET /visitor-rules`), `useCreateVisitorRule`, `useUpdateVisitorRule`, `useDeleteVisitorRule` — invalidasi queryKey `["visitor-rule"]`.

## lib/

Fungsi utilitas terpusat: HTTP client, logika bisnis, format, PDF, keamanan.

### lib/api.ts
Mendefinisikan tipe `ApiMeta` (page/limit/total/total_pages) dan `ApiResponse<T>` yang meniru persis `pkg/response.Envelope` backend; semua tipe balikan service dibangun di atasnya sehingga perubahan bentuk envelope cukup diubah di satu file.

### lib/api/client.ts
Satu-satunya HTTP client aplikasi (`apiClient` dengan method get/post/postForm/put/patch/delete): autentikasi memakai cookie HttpOnly dari backend (bukan localStorage) dengan `credentials: "include"` + header `X-Requested-With` (anti-CSRF). Base URL browser dari `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8080/api/v1`), sedangkan di server (RSC) memakai `API_PROXY_TARGET` langsung ke backend agar tidak gagal TLS saat dev HTTPS. Memiliki timeout 30 detik (AbortController), kelas `ApiError`, auto-refresh sesi sekali via `POST /auth/refresh` pada 401 (promise bersama mencegah loop, endpoint auth dikecualikan), `handleSessionExpired` yang membersihkan `kpr-auth` dan redirect ke `/login?redirect=...`, serta deteksi FormData agar Content-Type multipart diset browser.

### lib/business.ts
Logika bisnis terpusat (satu-satunya tempat menghitung total): `rupiah`, `todayISO`, `addDaysISO`/`daysBetween` (aritmetika tanggal pada komponen lokal agar tidak tergeser zona waktu), generator ID (`generateBookingId` KP-YYYYMMDD-XXXXXX, `generatePaymentId` PAY-…, `generateTicketId` TK-XXXXXX), `calculateBookingTotals` (subtotal, serviceFee dari BOOKING_CONFIG, diskon, pajak, total, totalTickets), `calculatePercentageChange`, table engine (`paginate`, `searchIn`, `sortData`), dan util acak `randomInt`/`pick`.

### lib/content.ts
Konten statis halaman publik (BUKAN data mock database): testimoni pengunjung (`visitorStories`), opsi kartu "Pilih Tiketmu" di beranda yang mengacu price list resmi Wana Wisata Kawah Putih (`homeTicketOptions`), teks sejarah `aboutHistory`, dan `aboutSections` (Fasilitas, Informasi Destinasi, Aturan Kunjungan).

### lib/currency.ts
`formatCurrency(cents, currency="IDR")` — nominal dari backend selalu bilangan bulat sen (field `price_cents`/`unit_cents`), jadi pembagian 100 dan format `Intl.NumberFormat("id-ID", { style: "currency" })` hanya dilakukan di sini.

### lib/date.ts
Format tanggal ber-lokal Indonesia dengan date-fns: `formatDate(dateStr, pattern="d MMMM yyyy")` (fallback string asli bila gagal parse) dan `formatDateTime` ("d MMMM yyyy, HH:mm").

### lib/eticket-pdf.ts
Generator PDF e-tiket di sisi klien (jsPDF + qrcode): header brand biru, status tiket berwarna (VALID/USED/EXPIRED/CANCELLED), QR code dari payload JSON (id tiket, booking, tanggal, jumlah, status), tabel info booking (kode, nama, email, tanggal kunjungan, jenis/jumlah tiket, total, metode), catatan penggunaan tiket, lalu `doc.save("e-tiket-<id>.pdf")`. Dipanggil tombol Download PDF di daftar booking.

### lib/jwt.ts
`decodeRolesFromToken(token)` — mendekode payload JWT access token (base64url) untuk membaca array `roles`, karena AuthResponse backend tidak menyertakan field roles pada objek user. Aman karena hanya dipakai untuk tampilan/UX; backend tetap memverifikasi signature dan role token di setiap panggilan API.

### lib/permission.ts
Pengecekan role sisi klien hanya untuk UX: `hasRole(userRoles, ...allowed)` dan `isAdmin(userRoles)` (menerima "ADMIN" maupun "admin"). Penegakan sebenarnya tetap di backend middleware RequireRole — fungsi ini hanya agar UI tidak menampilkan tombol yang pasti ditolak API.

### lib/redirect.ts
`safeRedirectPath(raw, fallback)` — validasi tujuan redirect setelah login agar parameter `?redirect=` tidak bisa dipakai untuk open redirect: hanya path internal yang diizinkan (menolak `//`, `/\`, backslash, `\0`, URL dengan origin berbeda via parsing terhadap base `https://internal.invalid`).

### lib/report-export.ts
Ekspor laporan manager sepenuhnya di sisi klien: `exportReportPDF` (jsPDF — header brand, ringkasan, grafik batang pendapatan & booking via `drawBarChartPDF`, kinerja jenis tiket) dan `exportReportExcel` (SheetJS — 2 sheet: Ringkasan dan Data Harian dengan kolom Tanggal/Booking/Tiket Terjual/Pendapatan/Pengunjung/Status Pembayaran). Menerima struktur `ReportData`.

### lib/role-home.ts
Helper kompatibilitas kode lama: `roleHome(roles)` memetakan array role (huruf besar backend) ke dashboard tujuan — ADMIN/SUPER_ADMIN/super_admin → /admin/dashboard, MANAGER → /manager/dashboard, PETUGAS → /petugas/dashboard, selain itu /dashboard.

### lib/utils.ts
Helper `cn(...inputs)` — gabungan clsx + twMerge untuk menggabungkan kelas Tailwind dengan aman.

## store/

State global Zustand. Hanya profil sesi UI yang disimpan; token tetap di cookie HttpOnly backend.

### store/auth.store.ts
Auth store dengan persist localStorage (`kpr-auth`): `SessionUser` (id, name, email, phone, role, gate?, shift?), `expiresAt`, `remember`. Action: `login` (TTL 8 jam, atau 7× bila remember), `updateUser`, `logout`, `checkExpiry` (dipanggil provider untuk menghapus user bila kedaluwarsa). Token TIDAK disimpan di sini.

### store/booking.store.ts
Booking store sementara (tidak dipersist) untuk membawa draft pemesanan melewati alur multi-halaman Booking → Payment → Processing → Success → E-Tiket: `BookingDraft` (tanggal, item tiket, data pemesan, totals), `lastBookingId`, `setDraft`, `setLastBookingId`, `clear`.

### store/language.store.ts
Preferensi bahasa (`id`/`en`, default id) dengan persist `kpr-language` — kepatuhan BRD Fase 5 multi-bahasa; belum ada library i18n sehingga store hanya menyimpan preferensi.

### store/theme.store.ts
Preferensi tema `light`/`dark` dengan toggle, dipersist ke localStorage `kpr-theme`.

### store/wishlist.store.ts
Wishlist paket wisata (user story FR-032 BRD) — belum ada modul backend, jadi dipersist ke localStorage `kpr-wishlist`: `packageIds`, `toggle(packageId)`, `isSaved(packageId)`.

## types/

Tipe TypeScript yang cocok dengan respons backend, terpusat per domain.

### types/api.ts
Tipe API terbesar: union status (BookingStatus, PaymentStatus, TicketStatus, TicketCategory, ETicketStatus, ScanStatus, UserRole), envelope `ApiResponse`/`ApiMeta`, `User`/`AuthData`/`LoginResponse`/`MeResponse`, `Ticket`, `Booking` + item/totals + request create, `Payment` (termasuk `midtrans_redirect_url`) + `ProcessPaymentRequest/Response` (outcome SUCCESS/FAILED/EXPIRED), `ETicket`, `Visitor`, `Staff`, `ScanRecord`/`ValidateTicketRequest/Response`, agregat `ManagerMonitoring`, serta `AdminDashboardStats` dan `ManagerAnalytics` (summary, changes, tren pendapatan/booking, weekday_vs_weekend, kinerja jenis tiket, status pembayaran, daily_rows).

### types/article.ts
`Article` (id, title, slug, excerpt, content, cover_image, status draft/published/archived, author_id, published_at) dan `CreateArticlePayload` untuk service artikel.

### types/auth.ts
Tipe auth sisi frontend: `AuthUser` (dengan `roles: string[]`), `AuthResponse` (access_token, refresh_token, expires_at, user tanpa roles karena AuthResponse backend tidak memuatnya), `LoginPayload`, `RegisterPayload`.

### types/booking.ts
Tipe booking varian lama/paket: `Booking` (package_id, quantity, total_cents, status pending_payment/paid/cancelled/expired/checked_in, ticket_code), `CreateBookingPayload`, `CreateBookingResult` (booking_id, redirect_url, status).

### types/destination-info.ts
`DestinationInfo` (judul, deskripsi, sejarah, deskripsi destinasi, lokasi, jam operasional, kontak, info tambahan, status draft/published/archived, timestamp) plus `CreateDestinationInfoPayload` dan `UpdateDestinationInfoPayload` (dapat menyertakan status).

### types/destination.ts
`TourismPackage` (id, name, slug, description, cover_image, price_cents, currency, duration_hours, max_capacity, is_active), `CreatePackagePayload`, dan `UpdatePackagePayload` (menambah `is_active` untuk aktif/nonaktif).

### types/domain.ts
Tipe domain terpusat varian camelCase yang dipakai lib business/PDF: Ticket, Booking (+BookingItem, status PENDING…EXPIRED), Payment (metode "QRIS"), ETicket (dengan status validitas + data QR), Staff (role/shift/gate), Visitor, ScanRecord, LocalAccount (mode mock), statistik dasbor, AnalyticsSummary/AnalyticsData, `DateRangePreset`, dan `AppNotification`.

### types/facility.ts
`Facility` (name, description, icon, image_url, location, operating_hours, status active/maintenance/inactive, is_published, sort_order, timestamp), `CreateFacilityPayload`, `UpdateFacilityPayload`, serta konstanta `FACILITY_STATUSES` dan tipe `FacilityStatus`.

### types/faq.ts
`FAQ` (question, answer, category, sort_order, is_published, timestamp), payload create/update, dan konstanta `FAQ_CATEGORIES` (Tiket, Jam Operasional, Lokasi, Fasilitas, Aturan Kunjungan, Parkir, Pembayaran, Umum).

### types/gallery.ts
`GalleryItem` (title, image_url, category, sort_order, uploaded_by) dan `CreateGalleryItemPayload` untuk service galeri.

### types/visitor-rule.ts
`VisitorRule` (title, description, category, priority low/normal/high/critical, sort_order, is_published, timestamp), payload create/update, konstanta `VISITOR_RULE_CATEGORIES` (Keselamatan, Lingkungan, Kebersihan, Kendaraan, Aktivitas Pengunjung, Larangan, Informasi Umum) dan `VISITOR_RULE_PRIORITIES`.

## services/

Lapisan service — satu-satunya lapisan yang memanggil backend via `apiClient`; dikelompokkan per domain dan memakai envelope `{ success, message, data, meta }`.

### services/analytics.api.service.ts
`analyticsService`: `getAdminDashboard()` → `GET /admin/dashboard` (AdminDashboardStats), `getManagerAnalytics(params)` → `GET /manager/analytics` dengan `range` (today/7d/30d/month/custom) dan `custom` JSON, serta alias `getManagerDashboard()` (range 7d). Melempar `AnalyticsError` bila `success` false.

### services/article.service.ts
`articleService` CRUD artikel: `list` (GET /articles dengan page/limit/status), `get` (GET /articles/:id, null bila gagal), `create` (POST /articles, status draft), `update` (PUT /articles/:id), `publish` (POST /articles/:id/publish), `archive` (POST /articles/:id/archive), `remove` (DELETE /articles/:id). Endpoint publik untuk list/get, ADMIN untuk mutasi.

### services/audit.api.service.ts
`auditService.list(params)` → `GET /admin/audit` dengan filter page/limit/action/target_type/status/from/to, mengembalikan `AuditFeed` (items + meta paginasi). Mendefinisikan tipe `AuditLog` dan helper `auditActionLabel` yang menerjemahkan action mentah (mis. "booking.create") ke label manusiawi Indonesia.

### services/auth.api.service.ts
`authService`: `login` (POST /auth/login — simpan SessionUser ke auth store, kembalikan redirect per role dari POST_LOGIN_HOME), `register` (POST /auth/register, auto-login), `forgotPassword` (POST /auth/password/forgot, respons netral), `resetPassword` (POST /auth/password/reset, field `new_password`), `requestEmailVerification`/`verifyEmail` (POST /auth/email/verify/*), `updateProfile` (PATCH /auth/profile + update store), `changePassword` (POST /auth/password/change lalu logout store karena backend mencabut refresh token), `logout` (POST /auth/logout, tetap bersih-bersihkan store walau jaringan gagal), dan `checkSession` (GET /auth/me untuk rehidrasi sesi; 401/403 → logout). Error dibungkus `AuthError`; helper `homeForRole`.

### services/booking.api.service.ts
`bookingService`: `list`/`listWithMeta` (GET /admin/bookings — total dari meta agar angka admin tetap benar), `listForVisitor` (GET /admin/visitors/:id/bookings), `listToday` (GET /admin/bookings/today), `listMine` (GET /bookings/mine), `getById` (GET /bookings/:id, null bila gagal), `create` (POST /bookings — booking & payment berada di dalam `data` envelope), `cancel` (DELETE /bookings/:id), `remove` (DELETE /admin/bookings/:id — hanya status non-pendapatan PENDING/EXPIRED/CANCELLED), `updateStatus` (PATCH /admin/bookings/:id/status). Melempar `BookingError`.

### services/destination-info.service.ts
`destinationInfoService` dengan BASE `/admin/destination-info`: `list` (dengan filter status), `get`, `getPublished` (GET /destination-info — versi publik), `create`, `update`, `publish` (POST .../publish), `archive` (POST .../archive), `remove` (DELETE). Helper `toQuery` membuang param kosong/undefined.

### services/destination.service.ts
`destinationService` paket wisata: `list` (GET /packages dengan active_only), `get` (GET /packages/:id, null bila gagal), `create` (POST /packages, aktif default), `update` (PUT /packages/:id termasuk is_active), `remove` (DELETE /packages/:id).

### services/eticket.api.service.ts
`eTicketService`: `listMine` (GET /e-tickets/mine), `getByBookingId` (GET /payments/booking/:id — mengembalikan pasangan { ticket, booking } atau null), `markDownloaded` (POST /payments/booking/:id/download — penanda e-tiket sudah diunduh).

### services/facility.service.ts
`facilityService` dengan BASE `/admin/facilities`: `list` (filter status/published_only), `get`, `listPublished` (GET /facilities — endpoint publik), `create`, `update`, `remove`.

### services/faq.service.ts
`faqService` dengan BASE `/admin/faq`: `list` (filter kategori/published_only), `get`, `listPublished` (GET /faq — endpoint publik dengan filter kategori), `create`, `update`, `remove`.

### services/gallery.service.ts
`galleryService` dengan BASE `/gallery` (endpoint admin dan publik memakai path yang sama; POST/PUT/DELETE aman karena cek JWT + RequireRole di backend): `list` (publik), `get`, `create`, `update` (payload parsial), `remove`.

### services/payment.api.service.ts
`paymentService`: `getByBookingId` (GET /payments/booking/:id), `processPayment` (POST /payments/process — hasil outcome SUCCESS/FAILED/EXPIRED ditentukan server), `expirePayment` (POST /payments/expire?booking_id=…), `list` (GET /admin/payments), `updateStatus` (PATCH /admin/payments/:id/status). Melempar `PaymentError`.

### services/scanner.api.service.ts
Service scanner petugas: fungsi `lookupTicket(ref)` (GET /petugas/scanner/ticket — pencarian read-only by ticket UUID/booking code/QR payload), `scannerService.validateTicket` (POST /petugas/scanner/validate), `getHistory` (GET /petugas/scanner/history dengan filter gate/petugas/from/to/status), `getStats` (GET /petugas/scanner/stats), dan `getMonitoring` (GET /manager/monitoring — agregat untuk manager, melempar `ScannerError`).

### services/staff.api.service.ts
`staffService` (admin): `list` (GET /admin/staff), `getById` (GET /admin/staff/:id, null bila gagal), `getStats` (GET /admin/staff/stats), `updateStatus` (PATCH /admin/staff/:id/status dengan AKTIF/NONAKTIF). Melempar `StaffError`.

### services/ticket.api.service.ts
`ticketService`: `list` (GET /tickets, default per_page 100 karena backend membatasi 100 dan tiket baru urut created_at ASC agar tidak terpotong), `getActive` (GET /tickets/active), `getById` (GET /tickets/:id), `getByCode` (GET /tickets/code/:code), `getCategories` (GET /tickets/categories), serta operasi admin: `create` (POST /admin/tickets), `update` (PUT /admin/tickets/:id), `delete` (DELETE /admin/tickets/:id), `updateStatus` (PATCH /admin/tickets/:id/status). Melempar `TicketError`.

### services/upload.service.ts
`uploadService.image(file)` — unggah satu gambar via multipart (`apiClient.postForm` → POST /uploads) dan kembalikan path URL hasil unggahan yang siap disimpan sebagai `image_url` galeri; melempar Error bila respons tidak sukses.

### services/visitor-rule.service.ts
`visitorRuleService` dengan BASE `/admin/visitor-rules`: `list`, `get`, `listPublished` (GET /visitor-rules — endpoint publik dengan filter kategori), `create`, `update`, `remove`.

### services/visitor.api.service.ts
`visitorService` (admin): `list` (GET /admin/visitors — dengan statistik total_bookings/total_spent/last_visit), `getById` (GET /admin/visitors/:id, null bila gagal), `getStats` (GET /admin/visitors/stats). Melempar `VisitorError`.

### services/api/index.ts
Indeks service: mengekspor ulang semua service (`auth`, `ticket`, `booking`, `payment`, `scanner`, `analytics`, `visitor`, `staff`, `eticket`, `destination-info`, `faq`, `facility`, `visitor-rule`) dari satu titik agar impor komponen ringkas (mis. `import { bookingService, paymentService } from "@/services/api"`).

## styles/

### styles/globals.css
Stylesheet global Tailwind: direktif @tailwind base/components/utilities, variabel CSS palet brand (`--ink`, `--muted`, `--line`, `--blue #1768ad`, `--green`, dsb.), styling dasar body/html (font-body, latar #eef7fd), font heading untuk heading, focus-visible outline yang tidak boleh dihapus (kepatuhan WCAG 2.1 AA), gaya ::selection, serta kelas utilitas panel admin (`page-shell`, `panel-surface`, `panel-kicker`, `panel-table` dengan header berwarna & hover baris, `panel-scroll`) dan penyesuaiannya di layar ≤ 640px.

## scripts/

Skrip Node untuk pengembangan lokal.

### scripts/dev.mjs
Menjalankan dev server HTTPS Next.js (`next dev -p 3000 --experimental-https` dengan sertifikat dari `scripts/generate-cert.mjs`) supaya kamera HP bisa dipakai untuk scan tiket (getUserMedia butuh secure context). Skrip membaca port aktual dari output Next (pindah port otomatis bila 3000 terpakai), lalu mencetak alamat LAN `https://<IP>:<port>` yang harus dibuka di HP beserta instruksi menerima peringatan sertifikat sekali.

### scripts/generate-cert.mjs
Membuat sertifikat TLS self-signed (valid 825 hari, RSA 2048, SAN berisi localhost + semua IP LAN IPv4) ke `certs/local-key.pem`/`local-cert.pem` dengan openssl. Mencari openssl di PATH lalu lokasi bawaan Git for Windows (Program Files, LOCALAPPDATA, git --exec-path); bila tidak ditemukan, menyarankan `npm run dev:http` atau memasang Git for Windows/OpenSSL agar scan kamera via HTTPS bisa dipakai.

## public/images/

Aset foto statis destinasi Kawah Putih.

### public/images/Kawah-Putih.jpg
Foto panorama utama danau kawah Kawah Putih berwarna putih kehijauan dikelilingi tebing dan hutan di bawah langit biru; dipakai sebagai gambar pada halaman beranda publik (`app/(public)/page.tsx`, referensi `/images/Kawah-Putih.jpg`).

### public/images/kawah-putih-hero.jpg
Foto lanskap asap vulkanik mengepul dari lereng berbatu Kawah Putih (dengan sebagian teks "Putih" tumpang tindih); tidak direferensikan oleh kode frontend saat ini — tersedia sebagai kandidat aset hero.

### public/images/kawah-lagoon.jpg
Foto danau Kawah Putih berwarna turkis dengan jalur kayu (jejang) di bibir danau dan pepohonan kering di latar depan; tidak direferensikan langsung di kode — aset statis untuk kebutuhan tampilan.

### public/images/jalur-kawah.jpg
Foto area hutan berkabut di tepi danau Kawah Putih dengan pepohonan kering dan air tenang yang memantulkan kabut; tidak direferensikan langsung di kode — aset statis untuk kebutuhan tampilan.

### public/images/hutan-kawah.jpg
Foto close-up pepohonan mati/contoh akar di tepi danau Kawah Putih dengan permukaan air dan material vulkanik di latar belakang; tidak direferensikan langsung di kode — aset statis untuk kebutuhan tampilan.


---

# Bagian 6 — Database, Docker, dan file root

## database/migrations/

Folder berisi SQL migrasi yang dipakai dua jalur: **MySQL via Docker** (dijalankan otomatis `docker-entrypoint-initdb.d` saat volume kosong) dan **runner migrasi** `backend/cmd/migration`. Nomor urut menentukan urutan eksekusi (000 → 001 → 002).

### database/migrations/000_pre_legacy.up.sql
Migrasi arsip non-destruktif untuk database yang masih memakai skema lama (id `BIGINT`, nama kolom bentrok seperti `users.password`, `bookings.total_amount`). Berisi stored procedure `kp_archive_legacy_table` yang mengecek ke `information_schema`: bila tabel lama ada **dan** kolom id-nya bukan CHAR(36), tabel diganti nama menjadi `<nama>_legacy` (data tidak dihapus, hanya diarsip agar bisa dibaca manual). Tanpa langkah ini, `CREATE TABLE IF NOT EXISTS` pada 001 akan melewati pembuatan tabel baru dan aplikasi membaca kolom yang salah. Header filenya mengingatkan wajib `mysqldump` backup dulu.

### database/migrations/001_schema.up.sql
Skema kanonik aplikasi — 21 tabel MySQL 8/InnoDB dengan id `CHAR(36)` (UUID) yang **kontraknya sama persis** dengan tag `gorm:"type:char(36)"` di `internal/domain/*/entity.go`, sehingga AutoMigrate tidak mengubah apa-apa. Semua tabel `CREATE TABLE IF NOT EXISTS` (idempoten). Daftar tabel yang dibuat: `roles`, `permissions`, `role_permissions`, `users`, `user_roles`, `refresh_tokens`, `auth_tokens`, `ticket_types`, `bookings`, `booking_items`, `payments`, `tickets`, `scan_records`, `audit_logs`, `articles`, `gallery_items`, `faqs`, `destination_information`, `facilities`, `visitor_rules`, `tourism_packages` — lengkap dengan index `deleted_at` dan foreign key.

### database/migrations/001_schema.down.sql
Kebalikan 001: menghapus semua tabel skema kanonik (per `DROP TABLE IF EXISTS`) untuk kebutuhan rollback/manual reset.

### database/migrations/002_seed.up.sql
Data referensi idempoten (42 baris): mengisi 4 role (`ADMIN`, `MANAGER`, `PETUGAS`, `PENGUNJUNG`) via `ON DUPLICATE KEY UPDATE` dan katalog `ticket_types` (HTM WNA/WNI reguler & sunrise, Charge LHKP, Ontang Anting, kendaraan, dll.) dengan harga/kapasitas yang **harus sama** dengan `internal/seed/seed.go`. Sengaja TIDAK berisi akun staf/password — akun dibuat lewat `SEED_*_PASSWORD` di environment backend.

### database/migrations/002_seed.down.sql
Kebalikan 002: menghapus data referensi roles & ticket_types yang di-seed.

## docker/

### docker/.env.example
Template env Compose: `DB_NAME` (default `kawah_putih_db`), `DB_USER` (default `kpr_user`), dan `DB_PASSWORD` yang **wajib diisi** — Compose menolak start (`${DB_PASSWORD:?...}`) bila kosong. Salin menjadi `docker/.env` sebelum `docker compose up`.

### docker/docker-compose.yml
Definisi dua service, project name `KawahPutih`:
- **mysql** (image `mysql:8.0`): password root wajib dari `DB_PASSWORD`, volume `mysql_data` persisten, folder `../database/migrations` di-mount ke `/docker-entrypoint-initdb.d:ro` (migrasi + seed jalan otomatis pada volume kosong), healthcheck `mysqladmin ping` tiap 5 detik, port `3306:3306`.
- **backend**: build dari `../backend` dengan `docker/backend.Dockerfile`, `env_file` opsional `../backend/.env`, env `DB_DRIVER=mysql` dan host `mysql`, `depends_on` menunggu mysql **healthy**, port `8080:8080`.

### docker/backend.Dockerfile
Multi-stage build Go: stage `builder` (`golang:1.23-alpine`) menjalankan `go mod download` lalu `CGO_ENABLED=0 go build -ldflags="-w -s"` menghasilkan binary statis `server`; stage final (`alpine:3.20`) hanya menyalin binary, menambah `tzdata` + user non-root `app`, `EXPOSE 8080`, `ENTRYPOINT /app/server`. Hasilnya image kecil dan aman (bukan root).

### docker/backend-issues.yaml
Dokumentasi backlog bug/tidak-konsisten backend dari Sprint 3 — format YAML per issue: `id`, `tc` (test case), `title`, `tingkat`, `desc`, `lokasi` (file/fungsi/baris), `evidensi`, `rekomendasi`, `status: buka`. Contoh isi: AUTH-06 (login tidak mengecek `IsVerified`), AUTH-07 (register tidak otomatis kirim email verifikasi), BOOK-12 (pesan error kuota habis tidak sesuai draft). Dipakai sebagai catatan masalah yang sengaja belum diperbaiki.

## File root

### .gitignore
Aturan pengecualian Git: mengecualikan `.env`, `node_modules`, `.next`, binary build, database SQLite lokal (`backend/data/`), sertifikat dev, dsb. — menjaga secret dan artefak build tidak ikut ter-commit.

### README.md
Dokumentasi penggunaan projek (Bahasa Indonesia): overview, tech stack, struktur folder, fitur, cara menjalankan (backend lokal SQLite, frontend dev HTTPS, Docker Compose), tabel environment variables utama, contoh grup API, dan perintah berguna.

### CODEBASE.md
File ini — dokumentasi lengkap per folder & per file seluruh projek (backend, frontend, database, docker).



---

# Bagian 7 — Bedah Kode Baris per Baris

Bagian 1–6 menjawab **"file ini apa dan untuk apa"**. Bagian 7 menjawab pertanyaan yang lebih dalam: **"kenapa baris ini harus ada, dan apa yang rusak kalau baris ini dihapus atau diubah"**. Fokusnya empat alur yang membuat aplikasi ini punya nilai bisnis:

```
pengunjung memesan  →  membayar  →  menerima e-tiket  →  petugas scan di gerbang
     booking            payments         ticketing              ticketing
```

Semua kode di bawah diambil apa adanya dari repo. Supaya nomor baris tidak pernah meleset ketika file diedit, setiap potongan kode diberi nomor `(1)`, `(2)`, … **relatif terhadap potongan itu sendiri**, lalu dijelaskan satu per satu. Nomor baris absolut hanya dipakai kalau memang perlu menunjuk ke file aslinya.

Tingkat kedalaman ditandai jujur di setiap judul:

| Tanda | Arti |
|---|---|
| **baris-per-baris** | setiap baris logika dibahas satu per satu |
| **per-fungsi** | setiap fungsi dibahas, isi fungsi diringkas poin pentingnya |
| **per-file** | hanya kontrak/tanggung jawab file (sudah dibahas di Bagian 1–6) |

## 7.1 Perjalanan satu pesanan (end-to-end)

Sebelum masuk ke file, ini urutan pemanggilan nyata ketika seseorang membeli tiket. Setiap langkah menyebut file yang akan dibedah.

```
[BROWSER]  /packages  →  pilih tiket, tanggal, jumlah
     │  POST /api/v1/bookings            body: {visit_date, items[], visitor{...}}
     ▼
[GIN] booking/handler.go  Create()
     │  bind + validasi request          → 400 kalau bentuknya salah
     ▼
booking/usecase.go  Create()
     │  tempel identitas user login ke request
     ▼
booking/service.go  Create()
     ├─ validasi tanggal (format yyyy-MM-dd, tidak boleh masa lalu; tanpa batas atas)
     ├─ ambil harga + kapasitas tiket dari DB (TicketPricer) — harga TIDAK dari browser
     ├─ gabung baris tiket duplikat, cek sisa kuota per tanggal kunjungan
     ├─ subtotal = Σ(harga × qty), serviceFee = 2% dibulatkan terdekat
     └─ persistBooking(): INSERT booking + booking_items atomik (retry 3× bila kode bentrok)
     │
     ├─► payments.StartPayment(booking, nama, email, total)
     │      └─ buat baris payment PENDING + expired_at = now + 30 menit
     │         (kalau Midtrans aktif: minta redirect URL)
     │      └─ gagal? booking dibatalkan otomatis, Create mengembalikan error
     ▼
[RESPONS] { success, data: { booking, payment } }
     │
[BROWSER]  /payment?code=<booking-id>   →  PaymentPanel
     │  POST /api/v1/payments/process   body: {booking_id, method}
     ▼
payments/service.go  Process()          ← HANYA aktif saat APP_DEMO_MODE
     ├─ 403 bila bukan demo mode (produksi memakai redirect + webhook)
     ├─ cek kepemilikan booking & status masih PENDING
     ├─ cek belum lewat expired_at (lewat → EXPIRED, menang atas hasil apa pun)
     └─ SUCCESS: payment PAID + booking MarkPaid() + ticketing.IssueForBooking()

[PRODUKSI]  Midtrans → POST /webhooks/midtrans
     ▼
HandleMidtransNotification()
     ├─ verifikasi SHA-512(order_id+status_code+gross_amount+ServerKey)
     ├─ amountMatches(gross_amount, payment.amount)
     └─ settlement/capture + fraud accept → markPaidFromMidtrans()
     ▼
[RESPONS] { data: { booking, payment, outcome:"SUCCESS" } }
     │
[BROWSER] redirect /e-ticket?code=<booking-id>  →  QR berisi qr_data "KPT-XXXXXXXX..."
     │
[PETUGAS] /petugas/scan  →  kamera + jsQR  →  POST /tickets/validate
     ▼
ticketing/service.go  Validate()
     ├─ GetByIDOrQR(): terima UUID, JSON payload, atau teks KPT-…
     ├─ tolak kalau CANCELLED / EXPIRED / USED
     ├─ tolak kalau hari ini < visit_date
     ├─ MarkUsed() atomik (UPDATE ... WHERE status='VALID') → hanya 1 yang menang
     ├─ booking.SetCheckedIn()  +  scan_records INSERT  +  audit log
     └─ kembalikan { status:"VALID", ticket:{...} }
```

Tiga hal yang perlu dicatat dari diagram ini karena sering disalahpahami saat membaca kode:

1. **Harga tidak pernah datang dari browser.** Frontend hanya mengirim `ticket_id` dan `quantity`; `booking/service.go` yang mengambil harga dari tabel tiket.
2. **E-tiket bukan dibuat oleh frontend.** Yang membuat adalah `payments` saat pembayaran sukses, lewat antarmuka `TicketIssuer` yang di-wire di `bootstrap/adapters.go`.
3. **Scan tidak mengubah status booking secara langsung.** `ticketing` memanggil `SetCheckedIn` pada antarmuka `BookingUsedMarker`, bukan menulis ke tabel `bookings` sendiri.

## 7.2 `backend/internal/domain/booking/service.go` — inti aturan pesanan

File ini adalah jantung domain booking: satu-satunya tempat yang memutuskan harga, kode booking, dan transisi status. Handler tidak menghitung apa pun. Semua aturan ada di sini agar tidak terduplikasi.

### 7.2.1 Deklarasi paket, konstanta, dan antarmuka — **baris-per-baris**

```go
package booking                                                    // (1)

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/KawahPutih/backend/internal/domain/audit"
	"github.com/KawahPutih/backend/pkg/apperror"
	"github.com/KawahPutih/backend/pkg/validation"
)

const serviceFeeRate = 2.0                                          // (2)

type PaymentStarter interface {                                     // (3)
	StartPayment(ctx context.Context, bookingID, visitorName, visitorEmail string, amount int64) (*PaymentView, error)
	ExpirePendingByBooking(ctx context.Context, bookingID string) error
}

type TicketStatusSyncer interface {                                 // (4)
	SyncStatusForBooking(ctx context.Context, bookingID, bookingStatus string) error
}

type AuditLogger interface {                                        // (5)
	LogSuccess(ctx context.Context, actorID, actorRole, action, targetType, targetID string, metadata map[string]interface{}, ip, ua string)
	LogFailure(ctx context.Context, actorID, actorRole, action, targetType, targetID string, metadata map[string]interface{}, ip, ua string)
}

type BookingPaymentUpdater interface {                              // (6)
	MarkPaid(ctx context.Context, bookingID string) error
	MarkExpired(ctx context.Context, bookingID string) error
}
```

**(1)** `package booking` — seluruh lapisan domain ada di satu paket, sehingga `service` bisa memakai `Repository` tanpa impor melingkar.

**(2)** `serviceFeeRate = 2.0` dalam **persen**, bukan fraksi. Dipakai sebagai `subtotal * 2.0 / 100`. Kalau nilainya diubah menjadi `0.02` tanpa mengubah rumus, biaya layanan menjadi 0,02%.

**(3)** Antarmuka 5 parameter yang dipenuhi adapter `paymentStarterAdapter` di `bootstrap/adapters.go:47`. Adapter memanggil `payments.Service.StartPayment(ctx, bookingID, amount)` yang hanya 3 parameter, lalu membungkus hasilnya menjadi `booking.PaymentView`. Jadi perbedaan signature adalah desain, bukan bug: domain booking tidak perlu tahu nama/email pelanggan yang hanya dipakai gateway. `ExpirePendingByBooking` ada di antarmuka yang sama karena pembatalan booking harus ikut mematikan tagihan.

**(4)** Satu method untuk menyelaraskan status e-tiket saat admin mengubah status booking. Tanpa ini, tiket yang seharusnya hangus tetap `VALID` di gerbang.

**(5)** Antarmuka sempit agar `booking` tidak mengimpor `audit.Service` secara konkret (yang berisiko impor melingkar).

**(6)** Catatan jujur: `BookingPaymentUpdater` **dideklarasikan tetapi tidak dipakai** oleh `Service` (struct-nya hanya punya `repo`, `payments`, `tickets`, `audit`). Ini sisa refactor; mark-paid justru dipanggil dari sisi `payments`. Kandidat pembersihan, bukan bug.

### 7.2.2 Struct `Service` dan `TicketPricer` — **baris-per-baris**

```go
type Service struct {                                     // (1)
	repo     Repository
	payments PaymentStarter
	tickets  TicketStatusSyncer
	audit    AuditLogger
}

func NewService(repo Repository, payments PaymentStarter, tickets TicketStatusSyncer, audit AuditLogger) *Service {
	return &Service{repo: repo, payments: payments, tickets: tickets, audit: audit}   // (2)
}

type TicketPricer interface {                             // (3)
	GetMany(ctx context.Context, ids []string) ([]TicketInfo, error)
	SoldByTicketOn(ctx context.Context, date string) (map[string]int64, error)
}

type TicketInfo struct {                                  // (4)
	ID       string
	Name     string
	Price    int64
	Capacity int
	IsActive bool
}
```

**(1)** Empat dependensi, semuanya antarmuka. Perhatikan **tidak ada field logger** — konsekuensinya dibahas di 7.2.5.

**(2)** `NewService` empat argumen; urutan ini yang di-wire `bootstrap`. Tidak ada nil-check di sini, jadi pemanggil wajib menyediakan keempatnya (kecuali `audit`, yang selalu diperiksa `if s.audit != nil` sebelum dipakai).

**(3)** `TicketPricer` menerima **daftar** ID, bukan satu ID. Itu sebabnya `Create` bisa mengambil semua harga dalam satu panggilan, dan `SoldByTicketOn` mengambil penjualan satu tanggal sekaligus. Desain ini yang membuat pengecekan kapasitas tidak menjadi N+1.

**(4)** `TicketInfo` menyalin hanya lima field dari domain `tickettype`. `Capacity` ikut karena booking yang memutuskan ketersediaan; `IsActive` ikut karena tiket nonaktif tidak boleh dibeli.

### 7.2.3 `Create` — validasi tanggal, penggabungan item, dan kapasitas

```go
func (s *Service) Create(ctx context.Context, userID string, pricer TicketPricer, req CreateRequest) (*CreateBookingResult, error) {  // (1)
	today := time.Now().Format("2006-01-02")                                                       // (2)
	if _, err := time.Parse("2006-01-02", req.VisitDate); err != nil || len(req.VisitDate) != 10 {  // (3)
		return nil, ErrInvalidDate
	}
	if req.VisitDate < today {                                                                     // (4)
		return nil, ErrInvalidDate
	}
	if len(req.Items) == 0 {
		return nil, ErrNoItems
	}
```

**(1)** `pricer` dikirim sebagai **parameter**, bukan disimpan di struct. Alasannya teknis: `tickettype` mengimpor `booking` (untuk tipe bersama), sehingga `booking` tidak boleh menyimpan `TicketPricer` sebagai field yang diisi saat konstruksi tanpa memutar arah dependensi. Handler/usecase yang menyuntikkannya per panggilan.

**(2)** `today` dihitung sekali dengan format lokal server. Karena perbandingan dilakukan sebagai string, semuanya bergantung pada zona waktu proses backend — bukan zona waktu pengunjung. Untuk layanan satu zona (WIB) ini benar; kalau nanti multi-zona, aturan ini harus berubah.

**(3)** Dua syarat sekaligus: harus bisa di-parse **dan** panjangnya tepat 10. `len != 10` menolak input seperti `2026-1-1` yang berhasil di-parse sebagian implementasi. Pesan errornya `ErrInvalidDate` (`BOOK_004`), bukan error teknis.

**(4)** Perbandingan string `req.VisitDate < today` bekerja karena format ISO terurut secara leksikografis. Tidak ada batas atas (tidak ada "maksimal H+30") — kalau bisnis menambahkannya, tempatnya tepat setelah baris ini, dan frontend harus ikut membatasi input.

```go
	quantities := make(map[string]int)          // (1)
	ids := make([]string, 0, len(req.Items))
	for _, item := range req.Items {
		if item.Quantity <= 0 {                 // (2)
			return nil, ErrInvalidQuantity
		}
		if _, seen := quantities[item.TicketID]; !seen {
			ids = append(ids, item.TicketID)    // (3)
		}
		quantities[item.TicketID] += item.Quantity   // (4)
	}
```

**(1)** Dua struktur: `ids` menyimpan urutan kemunculan pertama, `quantities` menjumlahkan. Kalau hanya memakai map, urutan item di struk akan acak setiap request — struk yang berubah urutan terlihat seperti bug bagi pengguna.

**(2)** Hanya batas bawah. Tidak ada batas atas per item; pembatas nyatanya adalah kapasitas tiket (langkah berikutnya). Ini berbeda dari dugaan umum "maksimal 50", yang tidak ada di kode.

**(3)** ID hanya ditambahkan sekali. Ini yang membuat `items` hasil akhir tidak berisi dua baris untuk tiket yang sama.

**(4)** Baris duplikat digabung, bukan ditolak. Frontend yang mengirim dua baris tiket sama (mis. dari keranjang yang tidak ter-merge) tetap mendapat satu baris berjumlah total. Perilaku ramah ini disengaja.

```go
	types, err := pricer.GetMany(ctx, ids)                                  // (1)
	if err != nil { return nil, err }
	byID := make(map[string]TicketInfo, len(types))
	soldByTicket, err := pricer.SoldByTicketOn(ctx, req.VisitDate)          // (2)
	if err != nil { return nil, apperror.Internal(err) }
	for _, t := range types {
		if !t.IsActive { return nil, unknownTicket(t.ID) }                  // (3)
		byID[t.ID] = t
	}

	for _, id := range ids {
		t := byID[id]                                                       // (4)
		sold := soldByTicket[id]
		remaining := int64(t.Capacity) - sold - int64(quantities[id])
		if remaining < 0 { return nil, ErrUnavailable }                     // (5)
	}
```

**(1)** Satu query untuk semua tiket. Error dari pricer **diteruskan apa adanya** (bukan dibungkus 500), karena pricer sudah mengembalikan `apperror` yang tepat.

**(2)** Penjualan dihitung **per tanggal kunjungan**, bukan total. Tiket tanggal 12 tidak boleh mengurangi kuota tanggal 13. Ini juga alasan `SoldByTicketOn` menerima `date`.

**(3)** Tiket nonaktif menghasilkan `BOOK_009` "Data tiket tidak ditemukan." — pesan yang sengaja tidak membocorkan bahwa tiket itu ada tapi dimatikan.

**(4)** `byID[id]` bisa bernilai nol jika pricer tidak mengembalikan ID yang diminta. Saat ini pricer dijamin mengembalikan semua; kalau tidak, `Capacity` = 0 sehingga permintaan langsung dianggap tidak tersedia. Perilaku gagal-tertutup ini aman.

**(5)** `remaining < 0` → `ErrUnavailable` (409, `BOOK_006`). Karena `sold` berasal dari query agregat dan `quantities` dari request, pengecekan ini masih bisa balapan dengan request lain — pengaman sebenarnya ada di `CreateWithCapacity` (7.2.4).

```go
	var subtotal int64
	totalTickets := 0
	items := make([]BookingItem, 0, len(ids))
	for _, id := range ids {
		t := byID[id]
		qty := quantities[id]
		subtotal += t.Price * int64(qty)
		totalTickets += qty
		items = append(items, BookingItem{TicketID: t.ID, TicketName: t.Name, Price: t.Price, Quantity: qty})
	}
	serviceFee := int64(float64(subtotal)*serviceFeeRate/100 + 0.5)      // (1)
	total := subtotal - 0 + serviceFee                                    // (2)
```

**(1)** `+ 0.5` sebelum konversi ke `int64` berarti **pembulatan terdekat**, bukan pemotongan. Subtotal Rp 100.050 → 2.001,0 → 2.001; subtotal Rp 100.075 → 2.001,5 → 2.002. Ini berbeda dari dugaan "selalu dibulatkan ke bawah"; kalau angka di struk terasa aneh, hitung ulang dengan aturan ini.

**(2)** `- 0` adalah placeholder diskon yang belum diaktifkan. `Discount` tetap ada di entity dan response, selalu nol. Kalau diskon diaktifkan, ia harus dikurangkan **sebelum** `StartPayment`, karena `amount` yang dikirim ke gateway adalah `b.Total`.

```go
	b := &Booking{
		BookingCode:  generateBookingCode(req.VisitDate),      // (1)
		UserID:       userID,                                  // (2)
		VisitorName:  req.Visitor.Name,
		Email:        req.Visitor.Email,
		Phone:        validation.SanitizePhone(req.Visitor.Phone),   // (3)
		VisitDate:    req.VisitDate,
		Note:         req.Note,
		Status:       StatusPending,
		Subtotal:     subtotal, ServiceFee: serviceFee, Total: total,
		TotalTickets: totalTickets, Items: items,
	}
	if err := s.persistBooking(ctx, b, quantities); err != nil { return nil, err }
```

**(1)** Kode dibuat dari **tanggal kunjungan** (bukan tanggal pemesanan) dan **tanpa** pengecekan unik di sini — lihat 7.2.9. Keunikan ditegakkan oleh indeks DB dan retry di `persistBooking`.

**(2)** `userID` berasal dari usecase (JWT); string kosong berarti pembelian tamu. Booking tamu tetap sah dan bisa dibayar lewat kode booking.

**(3)** Nomor telepon dinormalisasi (`08xx`, buang spasi/tanda hubung) sebelum disimpan. Tanpa ini, nomor yang sama tersimpan dalam beberapa format dan pencarian pelanggan di panel admin gagal.

```go
	payment, err := s.payments.StartPayment(ctx, b.ID, b.VisitorName, b.Email, b.Total)   // (1)
	if err != nil {
		if _, cancelErr := s.repo.TransitionStatus(ctx, b.ID, []string{StatusPending}, StatusCancelled, nil); cancelErr != nil {
			s.logTransitionFailure(b.ID, cancelErr)                                        // (2)
		}
		return nil, err                                                                    // (3)
	}
```

**(1)** Tagihan dibuat **setelah** booking tersimpan, karena butuh `b.ID`. Lima argumen melalui antarmuka; adapter yang meneruskannya ke `payments`.

**(2)** Komentar di kode menjelaskan niatnya: "Jangan biarkan booking menggantung tanpa pembayaran: lepaskan kapasitasnya." Namun `logTransitionFailure` (7.2.5) **tidak melakukan apa pun** — tidak ada logger di `Service`. Jadi kalau pembatalan otomatis ini gagal, tidak ada jejak sama sekali.

**(3)** Berbeda dari desain "booking tetap hidup walau payment gagal", kode ini **membatalkan booking** dan mengembalikan error ke pengguna. Artinya: bila gateway sedang down, pengunjung melihat pesan gagal dan tidak mendapat kode booking. Konsekuensi yang perlu diketahui: pengunjung harus memesan ulang, tapi setidaknya tidak ada booking yatim.

```go
	if s.audit != nil {
		actorID, actorRole, ip, ua := audit.ExtractAuditInfo(ctx)
		itemsMeta := make([]map[string]interface{}, 0, len(items))
		for _, item := range items {
			itemsMeta = append(itemsMeta, map[string]interface{}{
				"ticket_id": item.TicketID, "name": item.TicketName, "price": item.Price, "quantity": item.Quantity,
			})
		}
		s.audit.LogSuccess(ctx, actorID, actorRole, audit.ActionBookingCreate, "booking", b.ID,
			audit.BookingMetadata(b.BookingCode, b.VisitDate, b.Total, itemsMeta), ip, ua)
	}
	return &CreateBookingResult{Booking: toBookingResponse(b, payment), Payment: payment}, nil   // (1)
```

**(1)** Response menggabungkan booking dan payment dalam satu objek. Frontend membacanya dari `response.data.booking` dan `response.data.payment` (lihat 7.5.3) — bukan dari root respons.

### 7.2.4 `persistBooking` — kapasitas atomik dan retry kode

```go
func (s *Service) persistBooking(ctx context.Context, b *Booking, quantities map[string]int) error {
	for attempt := 0; attempt < 3; attempt++ {                     // (1)
		b.ID = ""                                                   // (2)
		b.BookingCode = generateBookingCode(b.VisitDate)            // (3)
		err := s.repo.CreateWithCapacity(ctx, b, quantities)        // (4)
		if err == nil { return nil }
		switch err.(type) {
		case errCapacityExceeded: return ErrUnavailable              // (5)
		case errTicketNotFound:   return unknownTicket("")
		}
		if isDuplicateCode(err) { continue }                        // (6)
		return apperror.Internal(err)
	}
	return apperror.Internal(fmt.Errorf("booking: gagal membuat kode booking unik"))
}
```

**(1)** Tiga percobaan. Percobaan ulang hanya berguna untuk tabrakan kode; kegagalan lain langsung keluar.

**(2)** `b.ID = ""` wajib di setiap percobaan. Tanpa ini, GORM akan mencoba INSERT dengan UUID yang sama setelah kegagalan, dan `BeforeCreate` tidak akan membuat ID baru.

**(3)** Kode dibuat ulang di dalam loop — inilah mekanisme "retry" yang sesungguhnya. `generateBookingCode` sendiri tidak memeriksa keunikan.

**(4)** `CreateWithCapacity` melakukan, dalam satu transaksi DB: hitung ulang penjualan, validasi kapasitas, INSERT booking + items. Inilah pengaman balapan yang sesungguhnya; pengecekan di `Create` hanya untuk pesan error lebih awal.

**(5)** `switch err.(type)` memetakan error bertipe dari repository ke error domain. Perhatikan `unknownTicket("")` — ID tidak diteruskan karena memang tidak ditampilkan ke pengguna.

**(6)** `isDuplicateCode` memeriksa **teks** error: mengandung `unique`, `duplicate`, atau `1062`. Ini rapuh secara prinsip (bergantung dialek DB), tetapi berfungsi untuk SQLite (`UNIQUE constraint failed`) dan MySQL (`Error 1062`). Kalau proyek pindah ke Postgres, teks errornya `duplicate key value violates unique constraint` — masih tertangkap oleh kata `duplicate`.

### 7.2.5 `logTransitionFailure` — satu-satunya bagian yang benar-benar bisu

```go
func (s *Service) logTransitionFailure(bookingID string, err error) {
	// Tidak ada logger di Service; kekurangan ini tidak boleh menutupi error asli.
	_ = bookingID
	_ = err
}
```

**(1)** Komentar menyatakan alasan dan kompromi: karena `Service` tidak punya `*zap.Logger`, fungsi ini sengaja tidak mencatat apa pun agar tidak menggantikan error asli dengan panic. Efek nyatanya: kegagalan membatalkan booking otomatis pada `Create` (7.2.3) **hilang tanpa jejak**.

**(2)** `_ = bookingID` dan `_ = err` adalah cara Go menghindari "declared and not used". Kalau Anda ingin memperbaiki, tambahkan `log *zap.Logger` ke `Service`, isi dari `bootstrap`, lalu ganti isi fungsi ini menjadi `s.log.Warn("booking transition failed", zap.String("booking_id", bookingID), zap.Error(err))`. Jangan mengubahnya menjadi `panic` — ini jalur pembersihan, bukan invariant.

### 7.2.6 `authorize`, `Get`, dan pembacaan daftar — bedah kode yang Anda tempel

```go
func (s *Service) authorize(ctx context.Context, id, requesterID string, privileged bool) (*Booking, error) {  // (1)
	b, err := s.repo.FindByID(ctx, id)
	if err != nil { return nil, apperror.Internal(err) }
	if b == nil { return nil, ErrNotFound }
	if !privileged && b.UserID != requesterID { return nil, ErrNotOwner }
	return b, nil
}

func (s *Service) Get(ctx context.Context, id, requesterID string, privileged bool, paymentReader PaymentReader) (*BookingResponse, error) {
	b, err := s.authorize(ctx, id, requesterID, privileged)          // (2)
	if err != nil { return nil, err }
	var pv *PaymentView
	if paymentReader != nil { pv = paymentReader(ctx, b.ID) }        // (3)
	return toBookingResponsePtr(b, pv), nil
}

type PaymentReader func(ctx context.Context, bookingID string) *PaymentView   // (4)
```

**(1)** `authorize` mengembalikan `*Booking` mentah, bukan response. Tujuannya agar pemanggil lain (`Cancel`, `Delete`, `GetSnapshot`) memakai aturan yang sama tanpa membayar biaya konversi.

Perhatikan urutan pemeriksaannya: error DB → nil → kepemilikan. `b.UserID != requesterID` berarti pembandingan string biasa; booking tamu (`UserID == ""`) hanya bisa diakses `privileged`. Itu sebabnya halaman pembayaran tamu harus memanggil endpoint dengan `privileged=true` di sisi handler publik — sumber daya dilindungi oleh kode booking itu sendiri, bukan oleh identitas.

**(2)** `Get` **selalu** melewati `authorize`. Tidak ada jalur baca yang melewatinya di file ini.

**(3)** `paymentReader` adalah **parameter**, bukan field. Ini bukan detail gaya: fungsi yang membaca pembayaran disuntikkan per panggilan, sehingga domain `booking` tidak menyimpan ketergantungan pada `payments` sama sekali. Nilai `nil` berarti "jangan sertakan info pembayaran", dan itu sah.

**(4)** `PaymentReader` didefinisikan sebagai **tipe fungsi**, bukan `interface`. Konsekuensinya: satu fungsi biasa cukup untuk memenuhinya, tanpa struct wrapper. Implementasinya `bookingPaymentReader(svc)` di `bootstrap/adapters.go:70`, yang memanggil `svc.FindLatestForBooking(ctx, bookingID)` per booking.

```go
func (s *Service) ListMine(ctx context.Context, userID string, page, limit int, status string, paymentReader PaymentReader) ([]BookingResponse, int64, error) {
	offset, limit := clampPagination(page, limit)                             // (1)
	bookings, total, err := s.repo.ListMine(ctx, userID, offset, limit, status)
	if err != nil { return nil, 0, apperror.Internal(err) }
	return toBookingResponseList(ctx, bookings, paymentReader), total, nil     // (2)
}

// ListForUser dipakai panel admin/manager untuk riwayat booking seorang pengunjung.
func (s *Service) ListForUser(ctx context.Context, userID string, page, limit int, status string, paymentReader PaymentReader) ([]BookingResponse, int64, error) {
	offset, limit := clampPagination(page, limit)
	bookings, total, err := s.repo.ListMine(ctx, userID, offset, limit, status)   // (3)
	...
}
```

**(1)** `clampPagination` (7.2.11) membatasi `limit` 1–100; nilai di luar itu menjadi 20. Semua empat fungsi daftar memakainya — tidak ada yang melewatkan.

**(2)** `toBookingResponseList` ada di `mapper.go`. Komentarnya mengklaim "satu query terbatch agar endpoint daftar hanya dua query, bukan N+1", tetapi implementasinya memanggil `paymentReader` **di dalam loop**, satu kali per booking. Karena adapter melakukan `FindLatestForBooking` per panggilan, hasil nyatanya tetap **N+1**. Ini contoh komentar yang menyesatkan dan layak diperbaiki (komentar atau implementasinya).

**(3)** `ListForUser` saat ini **identik** dengan `ListMine` — nama berbeda, perilaku sama, tanpa pemeriksaan `privileged`. Artinya siapa pun yang bisa mencapai endpoint ini dengan `userID` orang lain akan melihat booking orang tersebut. Keamanan bergantung sepenuhnya pada handler yang memanggilnya (rute admin). Ini duplikasi berisiko; sebaiknya digabung atau diberi pemeriksaan peran.

```go
func (s *Service) ListAll(ctx context.Context, page, limit int, status, search string, paymentReader PaymentReader) ([]BookingResponse, int64, error) { ... }
func (s *Service) ListByVisitDate(ctx context.Context, date string, page, limit int, paymentReader PaymentReader) ([]BookingResponse, int64, error) { ... }
```

**(4)** Keduanya meneruskan `status`/`search`/`date` mentah ke repository. Nilai asing menghasilkan daftar kosong, bukan error — dapat diterima untuk filter, tapi jangan meniru pola ini untuk kolom `ORDER BY`.

### 7.2.7 `GetByCode` — siapa punya kode, belum tentu boleh lihat

```go
func (s *Service) GetByCode(ctx context.Context, code, requesterID string, privileged bool, paymentReader PaymentReader) (*BookingResponse, error) {
	b, err := s.repo.FindByCode(ctx, code)
	if err != nil { return nil, apperror.Internal(err) }
	if b == nil { return nil, ErrNotFound }
	if !privileged && b.UserID != requesterID { return nil, ErrNotOwner }   // (1)
	...
}
```

**(1)** Berbeda dari dugaan umum, `GetByCode` **tetap memeriksa kepemilikan**. Jadi kode booking bukan sekadar "capability token": pemegang kode tanpa login tetap ditolak bila booking itu milik akun lain. Untuk pembelian tamu (`UserID == ""`), akses harus lewat jalur `privileged`, yang dipakai handler publik setelah memvalidasi kode.

**(2)** Tidak ada normalisasi `ToUpper`/`TrimSpace` — tidak di service, tidak di handler, dan `FindByCode` memakai `WHERE booking_code = ?` (exact match). Karena `generateBookingCode` menghasilkan hex **huruf kecil**, kode harus diketik persis seperti aslinya; `KP-20261112-A1B2C3` (huruf besar) akan 404. Ini kandidat perbaikan UX yang aman (normalisasi di handler), bukan sekadar catatan gaya.

### 7.2.8 `Cancel`, `Delete`, `SetStatus` — tiga cara mengubah status

```go
func (s *Service) Cancel(ctx context.Context, id, requesterID string, privileged bool) error {  // (1)
	b, err := s.authorize(ctx, id, requesterID, privileged)
	if err != nil { return err }
	if b.Status != StatusPending { return ErrCannotCancel }                                    // (2)
	oldStatus := b.Status
	updated, err := s.repo.TransitionStatus(ctx, b.ID, []string{StatusPending}, StatusCancelled, nil)  // (3)
	if err != nil { return apperror.Internal(err) }
	if !updated { return ErrCannotCancel }
	b.Status = StatusCancelled
	if err := s.payments.ExpirePendingByBooking(ctx, b.ID); err != nil { return err }           // (4)
	... audit ...
	return nil
}
```

**(1)** Mengembalikan `error` saja, bukan booking. Frontend memang tidak membutuhkan data hasil; ia hanya perlu tahu berhasil atau tidak.

**(2)** Hanya `PENDING` yang bisa dibatalkan pengunjung. Booking `PAID` harus melalui refund/admin, bukan tombol batal — mencegah uang masuk tanpa jejak penyelesaian. Idempotensi tidak diberikan: membatalkan dua kali menghasilkan `BOOK_007`.

**(3)** `TransitionStatus` adalah compare-and-set: `UPDATE ... WHERE id=? AND status IN (?)`. Ini menutup balapan dengan webhook yang mungkin menandai `PAID` pada saat bersamaan. Kalau `updated == false`, status sudah berubah dan pengguna diminta memuat ulang.

**(4)** Payment pending ikut dimatikan. Kalau langkah ini gagal, error diteruskan meski booking sudah `CANCELLED`; pengunjung melihat gagal padahal booking sudah batal. Ini ketidakkonsistenan kecil yang lebih baik daripada membiarkan tagihan aktif.

```go
func (s *Service) Delete(ctx context.Context, id, requesterID string, privileged bool) error {
	b, err := s.authorize(ctx, id, requesterID, privileged)
	if err != nil { return err }
	switch b.Status {
	case StatusPaid, StatusConfirmed, StatusUsed:
		return ErrCannotDeletePaid          // (1)
	}
	deleted, err := s.repo.Delete(ctx, b.ID)
	...
}
```

**(1)** Daftar **hitam**, bukan daftar putih: semua status selain tiga itu boleh dihapus (termasuk `PENDING`). Pesannya menyuruh membatalkan dulu. Menghapus booking `PAID` akan membuat laporan pendapatan tidak cocok dengan mutasi gateway, jadi ditolak di level service, bukan hanya disembunyikan di UI.

```go
func (s *Service) SetStatus(ctx context.Context, id, status string) (*BookingResponse, error) {  // (1)
	b, err := s.repo.FindByID(ctx, id)
	...
	switch status {
	case StatusPending, StatusPaid, StatusConfirmed, StatusUsed, StatusCancelled, StatusExpired:
	default: return nil, ErrInvalidStatus          // (2)
	}
	if b.Status == status { return toBookingResponsePtr(b, nil), nil }   // (3)
	if status == StatusUsed && b.Status != StatusPaid && b.Status != StatusConfirmed {
		return nil, apperror.Conflict("Hanya booking yang sudah dibayar yang dapat digunakan.")
	}
	if status == StatusPaid {
		return nil, apperror.Conflict("Status PAID hanya dapat diatur melalui sistem pembayaran.")   // (4)
	}
	if status == StatusConfirmed && b.Status != StatusPending {
		return nil, apperror.Conflict("Hanya booking yang menunggu pembayaran yang dapat dikonfirmasi.")
	}
```

**(1)** Tidak ada parameter `privileged` di signature. Otorisasi sepenuhnya di middleware rute admin — berbeda dari `Cancel`/`Delete` yang memeriksa di service. Ini inkonsistensi nyata; kalau service ini dipakai ulang dari konteks lain, pemeriksaan harus diingat pemanggil.

**(2)** Daftar putih status. Nilai seperti `"lunas"` ditolak `BOOK_008`.

**(3)** Idempoten untuk status yang sama: mengembalikan data tanpa menulis apa pun. Ini membuat tombol admin yang diklik dua kali tidak menghasilkan error.

**(4)** **PAID tidak bisa di-set manual.** Alasannya bukan proteksi teknis, melainkan integritas laporan: tanpa uang masuk, tiket tidak boleh terbit. Untuk kasus pembayaran offline, jalurnya adalah `CONFIRMED` dari `PENDING`.

**(5)** Tiga aturan transisi terlarang berikutnya di kode menutup status akhir: `USED` tidak boleh menjadi `EXPIRED`/`CANCELLED`; `EXPIRED` tidak boleh menjadi `USED`/`CANCELLED`; `CANCELLED` tidak boleh menjadi `USED`/`EXPIRED`. Tanpa ini, tiket yang sudah dipakai bisa "dihidupkan" lagi.

**(6)** Setelah `TransitionStatus` berhasil (`updated == false` → 409 "Status booking sudah berubah"), service memanggil `ExpirePendingByBooking` untuk `CANCELLED`/`EXPIRED`, lalu `tickets.SyncStatusForBooking` untuk **semua** status. Urutan ini penting: pembayaran dimatikan dulu, tiket diselaraskan kemudian, audit terakhir.

### 7.2.9 `MarkPaid`, `MarkExpired`, `SetCheckedIn` — status yang diatur sistem

```go
func (s *Service) MarkPaid(ctx context.Context, bookingID string) error {
	b, err := s.repo.FindByID(ctx, bookingID)
	...
	if b.Status == StatusPaid || b.Status == StatusConfirmed || b.Status == StatusUsed { return nil }  // (1)
	if b.Status != StatusPending { return apperror.Conflict("Booking ini sudah tidak dapat dibayar.") }
	updated, err := s.repo.TransitionStatus(ctx, b.ID, []string{StatusPending}, StatusPaid, nil)       // (2)
	...
}
```

**(1)** Tiga status dianggap final dan mengembalikan `nil`. Ini yang membuat webhook berulang aman: notifikasi `settlement` kedua tidak menurunkan `USED` kembali menjadi `PAID`.

**(2)** Hanya `PENDING → PAID`. Kalau booking sudah `EXPIRED` (scheduler lebih cepat), hasilnya 409 dan `payments` membatalkan seluruh `markPaid` — uang tidak diterima untuk pesanan yang kuotanya sudah dilepas.

```go
func (s *Service) MarkExpired(ctx context.Context, bookingID string) error {
	...
	if b.Status == StatusExpired || b.Status == StatusPaid || b.Status == StatusUsed || b.Status == StatusCancelled { return nil }
	updated, err := s.repo.TransitionStatus(ctx, b.ID, []string{StatusPending}, StatusExpired, nil)
	if !updated {
		fresh, ferr := s.repo.FindByID(ctx, bookingID)     // (1)
		...
	}
}
```

**(1)** Saat CAS gagal, fungsi membaca ulang untuk memastikan hasil akhirnya memang final. Kalau ternyata masih `PENDING` (mis. gagal karena hal lain), ia mengembalikan konflik. Pola "baca ulang untuk memastikan" ini menghindari laporan palsu "sudah kedaluwarsa" padahal tidak.

```go
func (s *Service) SetCheckedIn(ctx context.Context, bookingID, gate string, at time.Time) error {
	updated, err := s.repo.TransitionStatus(ctx, b.ID, []string{StatusPaid, StatusConfirmed}, StatusUsed, map[string]interface{}{
		"checked_in_at": at, "checked_in_gate": gate,
	})
	if !updated { return apperror.Conflict("Booking ini tidak dapat ditandai check-in.") }
}
```

**(1)** Dua status asal diterima (`PAID`, `CONFIRMED`) dan `at` dikirim dari pemanggil (ticketing), bukan `time.Now()` di sini. Tujuannya agar `tickets.checked_in_at`, `bookings.checked_in_at`, dan `scan_records.scanned_at` memakai waktu yang sama.

**(2)** Kalau gagal, ticketing hanya mencatat log dan tetap menganggap scan berhasil — tiket sudah terbakar dan tidak boleh dibatalkan hanya karena metadata booking gagal ditulis.

### 7.2.10 `Snapshot`, `GetSnapshot`, `StalePendingIDs`

```go
type Snapshot struct {
	ID, BookingCode, VisitorName, Email, VisitDate, Status string
	Total                                                  int64
	Items                                                  []ItemResponse
}
```

**(1)** Snapshot membekukan data saat pembayaran dan memakai `ItemResponse` (tipe yang sama dengan response API). Konsekuensinya: perubahan pada `ItemResponse` ikut mengubah bentuk data yang diterima domain ticketing — keterkaitan yang perlu diingat saat mengubah DTO.

```go
func (s *Service) GetSnapshot(ctx context.Context, bookingID, requesterID string, privileged bool) (*Snapshot, error) {
	b, err := s.authorize(ctx, bookingID, requesterID, privileged)   // (1)
	...
}
```

**(1)** Ada pemeriksaan akses. Pemanggil internal (`payments`) mengirim `requesterID=""` dan `privileged=true`; pemanggil pengguna meneruskan identitas asli. Ini bukan sekadar formalitas — `GetSnapshot` dipakai halaman e-tiket.

```go
func (s *Service) StalePendingIDs(ctx context.Context, cutoff time.Time, limit int) ([]string, error) {
	bookings, err := s.repo.StalePending(ctx, cutoff, limit)
	...
	ids := make([]string, 0, len(bookings))
	for _, b := range bookings { ids = append(ids, b.ID) }
}
```

**(1)** Menerima `cutoff` (bukan `Duration`) dan `limit`. Scheduler yang menghitung batas, service hanya meneruskan. Hanya ID yang dikembalikan karena pemanggil akan memprosesnya satu per satu.

### 7.2.11 `generateBookingCode`, `clampPagination`, `sortedItemIDs`

```go
func generateBookingCode(visitDate string) string {          // (1)
	day := visitDate
	if parsed, err := time.Parse("2006-01-02", visitDate); err == nil {
		day = parsed.Format("20060102")
	}
	buf := make([]byte, 3)
	_, _ = rand.Read(buf)
	return fmt.Sprintf("KP-%s-%s", day, hex.EncodeToString(buf))
}
```

**(1)** Fungsi murni, tanpa `ctx` dan **tanpa cek keunikan**. Tanggal diambil dari tanggal kunjungan; kalau formatnya tidak valid, string mentah dipakai apa adanya. Tiga byte acak → 6 digit hex **huruf kecil** (berbeda dari kode QR tiket yang huruf besar). Error `rand.Read` dibuang (`_`), karena kegagalan CSPRNG praktis berarti proses harus berhenti; di sini hasilnya hanya kode yang kurang acak.

```go
func clampPagination(page, limit int) (offset, clampedLimit int) {
	if page < 1 { page = 1 }
	if limit < 1 || limit > 100 { limit = 20 }     // (1)
	return (page - 1) * limit, limit
}
```

**(1)** `limit` di luar 1–100 diubah menjadi **20**, bukan dipotong ke 100. Jadi klien yang meminta `limit=1000` mendapat 20 baris, bukan 100 — detail yang mudah salah diduga saat menyesuaikan UI.

```go
func sortedItemIDs(m map[string]int) []string {    // (1)
	ids := make([]string, 0, len(m))
	for id := range m { ids = append(ids, id) }
	sort.Strings(ids)
	return ids
}
```

**(1)** Komentar menyebutnya helper untuk "output tes/debug yang deterministik". Tidak dipanggil di jalur produksi. Ini satu-satunya alasan paket mengimpor `sort`; kalau fungsi dihapus, impor itu juga harus dihapus agar build tidak gagal.

## 7.3 `backend/internal/domain/payments` — uang masuk dan tiket terbit

Domain ini punya dua jalur masuk yang sangat berbeda sifatnya: **`Process`** (simulasi, hanya saat demo mode) dan **`HandleMidtransNotification`** (webhook gateway). Jalur produksi sesungguhnya adalah webhook; `Process` sengaja dimatikan di produksi.

### 7.3.1 Status, metode, dan jendela pembayaran

```go
const (
	StatusPending    = "PENDING"
	StatusProcessing = "PROCESSING"        // (1)
	StatusPaid       = "PAID"
	StatusFailed     = "FAILED"
	StatusExpired    = "EXPIRED"
	StatusRefunded   = "REFUNDED"          // (2)
)

const PaymentWindow = 30 * time.Minute    // (3)
```

**(1)** `PROCESSING` adalah status antara yang jarang disadari: webhook `pending` mengubah payment ke sini. Akibatnya, query "pembayaran aktif" harus menyertakan `PROCESSING`, bukan hanya `PENDING` — dan memang begitu di `StartPayment`, `markPaidFromMidtrans`, dan `expirePayment`.

**(2)** `REFUNDED`, bukan `REFUND`. Kode yang menulis `"REFUND"` akan ditolak daftar putih `SetStatusByAdmin`.

**(3)** `PaymentWindow` ada di `entity.go`, bukan `service.go`, dan komentarnya menyebut kesesuaian dengan sweep scheduler. Nilai ini menjadi sumber tunggal `expired_at`; frontend menghitung countdown dari field itu, bukan dari konstanta sendiri.

**(4)** `Methods` berisi 12 kode (`QRIS`, `GOPAY`, `OVO`, `DANA`, `SHOPEEPAY`, `BCA_VA`, `BNI_VA`, `MANDIRI_VA`, `BRI_VA`, `CARD`, `ALFAMART`, `INDOMARET`) dan `ValidMethod` melakukan pencarian linear. Daftar ini harus sinkron dengan `frontend/config/payment.config.ts`; kalau frontend menambah metode tanpa menambah di sini, request ditolak validasi.

### 7.3.2 `StartPayment` — idempoten, dan kegagalan gateway yang tidak menggagalkan booking

```go
func (s *Service) StartPayment(ctx context.Context, bookingID string, amount int64) (*Payment, error) {
	existing, err := s.repo.FindLatestByBooking(ctx, bookingID)
	if err != nil { return nil, apperror.Internal(err) }
	if existing != nil && (existing.Status == StatusPending || existing.Status == StatusProcessing) {  // (1)
		return existing, nil
	}
	reference := generateReference()                                                            // (2)
	p := &Payment{
		BookingID: bookingID, Method: MethodQRIS, Reference: reference, Amount: amount,
		Status: StatusPending, ExpiredAt: time.Now().Add(PaymentWindow),
		MidtransOrderID: reference,                                                             // (3)
	}
	if err := s.repo.Create(ctx, p); err != nil {                                               // (4)
		existing, err2 := s.repo.FindLatestByBooking(ctx, bookingID)
		if err2 != nil || existing == nil { return nil, apperror.Internal(err) }
		return existing, nil
	}
```

**(1)** Hanya `PENDING`/`PROCESSING` yang dikembalikan apa adanya. Payment `FAILED` **tidak** dikembalikan — pemanggilan berikutnya membuat baris baru... atau mencoba, karena `booking_id` unik. Lihat (4).

**(2)** `generateReference()` menghasilkan `PAY-KP-<yyyymmddHHMMSS>-<12 hex>`, unik per detik plus keacakan.

**(3)** `MidtransOrderID` diisi sama dengan `reference`. Satu nilai dipakai sebagai kunci internal dan `order_id` gateway, sehingga `FindByMidtransOrderID` cukup satu kolom.

**(4)** Kalau `Create` gagal karena `booking_id` unik (payment `FAILED` sudah ada), kode **membaca ulang dan mengembalikan baris lama**, apa pun statusnya. Akibat yang perlu diketahui: setelah pembayaran gagal, `StartPayment` tidak membuat tagihan baru; baris `FAILED` itulah yang dipakai lagi saat `Process`. Ini konsisten dengan komentar entity: "percobaan FAILED bisa dicoba ulang di baris yang sama".

```go
	if s.midtrans == nil || !s.midtrans.Configured() {
		if !s.demoMode {
			return nil, apperror.Validation("Pembayaran belum tersedia saat ini. Silakan coba beberapa saat lagi.")
		}
	}
```

**(1)** Ini blok yang mudah salah dibaca. Maknanya: **jika gateway tidak siap dan bukan demo → gagal**. Jika demo, lanjut tanpa gateway. Perhatikan bahwa `Payment` sudah tersimpan sebelum pemeriksaan ini, sehingga kegagalan di sini meninggalkan baris `PENDING` tanpa redirect — dan `booking.Create` akan membatalkan booking-nya (7.2.3).

**(2)** Pesannya 400 Validation, bukan 500: bagi pengunjung ini "layanan belum siap", bukan "server rusak".

```go
	if s.midtrans != nil && s.midtrans.Configured() {
		snap, err := s.bookings.GetSnapshot(ctx, bookingID, "", true)     // (1)
		if err == nil && snap != nil {
			redirectURL, err := s.midtrans.CreateTransaction(ctx, p.MidtransOrderID, amount, snap.VisitorName, snap.Email, "Kawah Putih Booking")
			if err != nil {
				s.log.Error("midtrans create transaction failed", ...)    // (2)
			} else {
				p.MidtransRedirect = redirectURL
				if err := s.repo.Update(ctx, p); err != nil { s.log.Error("midtrans redirect url update failed", ...) }
			}
		}
	}
	return p, nil
```

**(1)** Snapshot diambil dengan `requesterID=""` dan `privileged=true` karena ini jalur internal tanpa pengguna.

**(2)** Kegagalan membuat transaksi gateway **hanya di-log**; booking dan payment tetap dikembalikan. Akibatnya pengunjung mendapat halaman pembayaran tanpa tautan redirect, dan baru menyadarinya saat menekan "Bayar". Ini pilihan yang bisa diperdebatkan; alternatifnya mengembalikan error agar `booking.Create` membatalkan semuanya. Kalau Anda mengubahnya, ingat bahwa `Payment` sudah ter-INSERT.

### 7.3.3 `Process` — hanya untuk demo, dan kenapa begitu

```go
func (s *Service) Process(ctx context.Context, bookingID, requesterID string, privileged bool, forced, method string) (*booking.BookingResponse, *Payment, string, error) {
	if !s.demoMode {                                                                   // (1)
		return nil, nil, "", apperror.Forbidden("Pembayaran simulasi tidak tersedia. Silakan gunakan gateway pembayaran resmi.")
	}
	snap, err := s.bookings.GetSnapshot(ctx, bookingID, requesterID, privileged)        // (2)
	if err != nil { return nil, nil, "", err }
	if snap.Status != booking.StatusPending {
		return nil, nil, "", apperror.Conflict("Booking ini tidak sedang menunggu pembayaran.")
	}
	pay, err := s.repo.FindLatestByBooking(ctx, bookingID)
	if err != nil { return nil, nil, "", apperror.Internal(err) }
	if pay == nil { return nil, nil, "", apperror.NotFound("Data pembayaran tidak ditemukan.") }
	if pay.Status == StatusPaid {                                                       // (3)
		resp, _ := s.bookings.GetResponse(ctx, bookingID, requesterID, privileged)
		return resp, pay, "SUCCESS", nil
	}
```

**(1)** **`Process` bukan jalur pembayaran produksi.** Tanpa `APP_DEMO_MODE`, setiap panggilan menghasilkan 403. Ini pertahanan terhadap "pembayaran gratis": kalau suatu saat frontend memanggil endpoint ini di produksi, pengguna tidak bisa menandai booking lunas sendiri. Karena itu pula `forced` (paksaan hasil) tidak berbahaya — hanya hidup di demo.

**(2)** Snapshot dipakai sekaligus sebagai pemeriksaan kepemilikan dan status. Satu panggilan, tiga kegunaan.

**(3)** Idempoten: menekan "Bayar" dua kali mengembalikan `SUCCESS` tanpa menagih dua kali.

```go
	if method != "" && pay.Method != method {
		pay.Method = method
		if err := s.repo.Update(ctx, pay); err != nil { ... }        // (1)
	}
	if time.Now().After(pay.ExpiredAt) {
		outcome, err := s.expirePayment(ctx, pay)                     // (2)
		...
		return resp, pay, outcome, nil
	}
```

**(1)** Metode dicatat **sebelum** hasil diterapkan, agar baris payment mencerminkan metode yang benar-benar dipakai pengunjung. Perhatikan ini memakai `repo.Update` penuh — berpotensi menimpa perubahan lain, tapi dalam demo mode risikonya kecil.

**(2)** Jendela yang lewat **menang atas** hasil apa pun, termasuk `forced=SUCCESS`. Urutan ini disengaja: pembayaran tidak boleh berhasil setelah batas waktunya.

```go
	switch outcome {
	case "SUCCESS":
		now := time.Now()
		pay.Status = StatusPaid; pay.PaidAt = &now
		if err := s.repo.Update(ctx, pay); err != nil { ... }
		if err := s.bookings.MarkPaid(ctx, bookingID); err != nil { return nil, nil, "", err }   // (1)
		if s.tickets != nil {
			if _, err := s.tickets.IssueForBooking(ctx, snap); err != nil {
				s.log.Error("ticket issuance after payment failed", ...)                          // (2)
			}
		}
	case "FAILED":
		pay.Status = StatusFailed; pay.PaidAt = nil
		if err := s.repo.Update(ctx, pay); err != nil { ... }                                     // (3)
	case "EXPIRED":
		outcome, err = s.expirePayment(ctx, pay)
	default:
		return nil, nil, "", apperror.Validation("Hasil pembayaran tidak valid.")                 // (4)
	}
```

**(1)** Error `MarkPaid` **diteruskan**, sehingga payment bisa tercatat `PAID` sementara booking gagal berubah. Ini urutan yang kurang ideal (payment dulu, booking kemudian), tapi pada demo mode diterima; pada jalur webhook urutannya dibalik dengan CAS.

**(2)** Kegagalan menerbitkan tiket **hanya di-log**, tidak membatalkan pembayaran. Komentar menyebut e-tiket bisa diterbitkan ulang lewat GET — itulah jalan pemulihannya.

**(3)** `FAILED` mengubah payment, **tidak** mengubah booking. Booking tetap `PENDING` sampai kedaluwarsa, sehingga pengunjung bisa mencoba metode lain. Konsekuensi UI: fase `FAILED` menampilkan "Coba Bayar Lagi", bukan "Pesanan dibatalkan".

**(4)** Nilai `outcome` asing ditolak 400, bukan diabaikan. Frontend hanya mengirim tiga nilai, jadi ini pertahanan terhadap klien lain.

**(5)** Fungsi mengembalikan `resp` (booking) yang diambil **setelah** perubahan, bukan `snap` lama. Jadi frontend menerima status terbaru tanpa request tambahan.

### 7.3.4 `HandleMidtransNotification` — verifikasi lebih dulu, baru percaya

```go
func (s *Service) HandleMidtransNotification(ctx context.Context, orderID, statusCode, transactionStatus, fraudStatus, signatureKey, grossAmount string) error {
	if s.midtrans == nil || !s.midtrans.Configured() {
		return apperror.Internal(errors.New("midtrans gateway not configured"))    // (1)
	}
	if orderID == "" || statusCode == "" || grossAmount == "" || signatureKey == "" {
		return apperror.Unauthorized("Permintaan pembayaran tidak valid.")         // (2)
	}
	if !s.midtrans.VerifySignature(orderID, statusCode, grossAmount, signatureKey) {
		return apperror.Unauthorized("Permintaan pembayaran tidak valid.")         // (3)
	}
	p, err := s.repo.FindByMidtransOrderID(ctx, orderID)
	if err != nil { return apperror.Internal(err) }
	if p == nil { return apperror.NotFound("Data pembayaran tidak ditemukan.") }
	if !amountMatches(grossAmount, p.Amount) {
		return apperror.Unauthorized("Nominal pembayaran tidak sesuai.")           // (4)
	}
	snap, _ := s.bookings.GetSnapshot(ctx, p.BookingID, "", true)                  // (5)
```

**(1)** Tanpa gateway terkonfigurasi, webhook tidak bisa diverifikasi, jadi selalu ditolak. Ini mencegah mode demo "terbuka" lewat webhook.

**(2)** Field wajib dicek lebih dulu agar tidak menghitung signature dari string kosong.

**(3)** `VerifySignature` didelegasikan ke implementasi Midtrans (`SHA-512(order_id + status_code + gross_amount + ServerKey)`, perbandingan constant-time). Kunci server tidak pernah keluar dari backend. Ini satu-satunya yang memisahkan internet dari tiket gratis.

**(4)** Nominal harus cocok setelah `math.Round` (lihat 7.3.5). Tanpa ini, penyerang bisa mengirim `settlement` dengan nominal Rp 1 untuk tagihan Rp 150.000 — signature tetap valid karena dibuat dengan kunci yang sama.

**(5)** Snapshot hanya untuk audit dan metadata; error-nya diabaikan (`_`). Kalau booking hilang, status payment tetap diproses.

```go
	switch transactionStatus {
	case "capture", "settlement":
		if fraudStatus == "accept" || fraudStatus == "" {
			return s.markPaidFromMidtrans(ctx, p, snap)
		}
		return s.markFailedFromMidtrans(ctx, p, snap)        // (1)
	case "pending":
		return s.markProcessingFromMidtrans(ctx, p)          // (2)
	case "deny", "cancel", "expire":
		return s.markFailedFromMidtrans(ctx, p, snap)
	default:
		return nil                                            // (3)
	}
```

**(1)** `capture` dengan `fraud_status=challenge` diperlakukan **gagal**, bukan lunas. Untuk kartu kredit, capture belum berarti uang aman.

**(2)** `pending` hanya menaikkan status ke `PROCESSING`; booking tidak disentuh. Ini yang membuat UI bisa menampilkan "menunggu penyelesaian".

**(3)** Status tak dikenal diabaikan dengan `nil` (HTTP 200) agar gateway berhenti mengulang. Konsekuensinya, status baru dari Midtrans tidak akan tercatat sampai kode diperbarui — pantau log webhook.

### 7.3.5 `markPaidFromMidtrans`, `amountMatches`, dan kegagalan tiket

```go
func (s *Service) markPaidFromMidtrans(ctx context.Context, p *Payment, snap *booking.Snapshot) error {
	if p.Status == StatusPaid { return nil }                                       // (1)
	now := time.Now()
	updated, err := s.repo.UpdateStatusIf(ctx, p.ID, []string{StatusPending, StatusProcessing}, StatusPaid, &now)  // (2)
	if err != nil { return apperror.Internal(err) }
	if !updated { return nil }                                                     // (3)
	p.Status = StatusPaid; p.PaidAt = &now
	if err := s.bookings.MarkPaid(ctx, p.BookingID); err != nil { return err }      // (4)
	if s.tickets != nil && snap != nil {
		if _, err := s.tickets.IssueForBooking(ctx, snap); err != nil {
			s.log.Error("ticket issuance after midtrans payment failed", ...)       // (5)
		}
	}
	... audit ActionPaymentProcess ...
}
```

**(1)** Cek cepat sebelum query; (3) adalah pengaman balapan yang sesungguhnya.

**(2)** `UpdateStatusIf` = CAS pada payment. Hanya satu dari dua notifikasi bersamaan yang berhasil.

**(3)** `!updated` berarti sudah diproses request lain → `nil` (idempoten). Ini yang membuat Midtrans boleh mengirim notifikasi berulang.

**(4)** `MarkPaid` booking bisa gagal (mis. booking sudah `EXPIRED`). Error diteruskan, sehingga webhook membalas non-2xx dan Midtrans mengulang. Namun payment sudah `PAID` — pengulangan berikutnya akan berhenti di (1) dan **tidak** mencoba `MarkPaid` lagi. Ini celah nyata: payment `PAID` dengan booking `EXPIRED` tidak akan pernah pulih otomatis.

**(5)** Kegagalan tiket di sini **tidak** menggagalkan webhook (berbeda dari `Process` demo yang juga hanya log). Pemulihannya lewat `GET` e-tiket yang memicu penerbitan ulang, atau intervensi admin.

```go
func amountMatches(grossAmount string, amount int64) bool {
	v, err := strconv.ParseFloat(strings.TrimSpace(grossAmount), 64)
	if err != nil { return false }
	return int64(math.Round(v)) == amount       // (1)
}
```

**(1)** Midtrans mengirim `"150000.00"` sebagai string. `ParseFloat` + `Round` membuat perbandingan bekerja untuk nilai desimal. `ParseFloat` untuk uang secara prinsip kurang ideal (presisi), tapi karena nominal rupiah selalu bilangan bulat dan nilainya di bawah 2^53, hasilnya aman di praktik.

### 7.3.6 `expirePayment`, `Expire`, dan `ExpireStalePending`

```go
func (s *Service) expirePayment(ctx context.Context, pay *Payment) (string, error) {
	updated, err := s.repo.UpdateStatusIf(ctx, pay.ID, []string{StatusPending, StatusProcessing, StatusFailed}, StatusExpired, nil)  // (1)
	if err != nil { return "", apperror.Internal(err) }
	if !updated { return "EXPIRED", nil }        // (2)
	pay.Status = StatusExpired
	if err := s.bookings.MarkExpired(ctx, pay.BookingID); err != nil { return "", err }   // (3)
	return "EXPIRED", nil
}
```

**(1)** `FAILED` ikut di-expire. Artinya pembayaran yang gagal tidak "menggantung" selamanya; setelah jendela lewat, statusnya menjadi `EXPIRED`.

**(2)** `!updated` berarti payment sudah final (mis. `PAID`) → jangan menyentuh booking. Ini pengaman penting: countdown frontend yang habis **tidak** boleh membatalkan booking yang sudah dibayar.

**(3)** Booking ikut di-expire lewat `MarkExpired` (CAS `PENDING → EXPIRED`). Inilah yang membedakannya dari `ExpireStalePending`.

```go
func (s *Service) ExpireStalePending(ctx context.Context, cutoff time.Time, limit int) (int, error) {
	ids, err := s.bookings.StalePendingIDs(ctx, cutoff, limit)
	...
	for _, id := range ids {
		pay, err := s.repo.FindLatestByBooking(ctx, id)
		if err != nil { return swept, err }
		if pay != nil && (pay.Status == StatusPending || pay.Status == StatusProcessing || pay.Status == StatusFailed) {
			pay.Status = StatusExpired
			if err := s.repo.Update(ctx, pay); err != nil { return swept, err }    // (1)
		}
		if err := s.bookings.MarkExpired(ctx, id); err != nil { return swept, err } // (2)
		swept++
	}
```

**(1)** Memakai `Update` penuh, bukan `UpdateStatusIf` — sehingga tidak ada perlindungan balapan dengan webhook. Payment yang baru saja `PAID` bisa tertimpa `EXPIRED` bila keduanya berjalan bersamaan.

**(2)** Booking tetap di-expire (ini yang benar). Jadi berbeda dari dugaan "scheduler tidak menyentuh booking", di sini booking **memang** ikut berubah; yang bermasalah adalah cara payment ditulis.

**(3)** `swept++` dihitung meski `pay == nil`. Artinya angka "disapu" adalah jumlah booking yang diproses, bukan jumlah payment yang benar-benar berubah.

### 7.3.7 `SetStatusByAdmin` — override dengan efek berantai

```go
switch status {
case StatusPaid, StatusFailed, StatusExpired, StatusRefunded, StatusPending, StatusProcessing:
default:
	return nil, nil, ErrInvalidStatus           // (1)
}

switch status {
case StatusPaid:
	if pay.Status != StatusPaid {
		... repo.Update ...
		if err := s.bookings.MarkPaid(ctx, pay.BookingID); err != nil { return nil, nil, err }   // (2)
		if s.tickets != nil { ... IssueForBooking ... }                                          // (3)
	}
case StatusRefunded:
	pay.Status = StatusRefunded; repo.Update
	resp, err := s.bookings.SetStatusByAdmin(ctx, pay.BookingID, booking.StatusCancelled)        // (4)
case StatusExpired:
	_, err := s.expirePayment(ctx, pay)                                                          // (5)
default: // FAILED / PENDING / PROCESSING
	pay.Status = status; pay.PaidAt = nil; repo.Update
}
```

**(1)** Daftar putih lengkap enam status. `REFUNDED` diterima, `REFUND` tidak.

**(2)** **Berbeda dari dugaan umum: admin menandai `PAID` di sini benar-benar menerbitkan tiket**, karena `MarkPaid` dan `IssueForBooking` dipanggil. Jadi jalur "lunas manual" tetap menghasilkan e-tiket — dengan risiko bahwa uangnya belum tentu masuk.

**(3)** Kegagalan penerbitan tiket hanya di-log (di dalam blok ini), sementara perubahan payment dan booking sudah tersimpan.

**(4)** Refund tidak menghapus tiket; ia membatalkan booking, dan `SetStatusByAdmin` booking akan memanggil `SyncStatusForBooking` sehingga tiket menjadi `CANCELLED`. Efeknya berantai lewat domain booking, bukan ditulis langsung di sini.

**(5)** `EXPIRED` memakai `expirePayment`, sehingga booking ikut kedaluwarsa dan status payment final tidak tertimpa.

**(6)** Audit dijalankan di akhir (kecuali cabang `REFUNDED` yang `return` lebih awal — **cabang refund tidak tercatat audit di fungsi ini**; booking-nya tetap tercatat lewat audit booking).

## 7.4 `backend/internal/domain/ticketing` — dari pembayaran ke gerbang masuk

### 7.4.1 `IssueForBooking` — idempoten dan sadar multi-item

```go
func (s *Service) IssueForBooking(ctx context.Context, snap *booking.Snapshot) (*TicketResponse, error) {  // (1)
	existing, err := s.repo.FindByBookingID(ctx, snap.ID)
	if err != nil { return nil, apperror.Internal(err) }
	if existing != nil { return toTicketResponse(existing), nil }                                            // (2)

	names := make([]string, 0, len(snap.Items))                                                              // (3)
	for _, item := range snap.Items {
		names = append(names, fmt.Sprintf("%s x%d", item.TicketName, item.Quantity))
	}
	ticketName := strings.Join(names, ", ")
	if len(ticketName) > 300 { ticketName = ticketName[:297] + "..." }                                       // (4)
```

**(1)** Menerima `*booking.Snapshot`, bukan `*booking.Booking`. Domain ticketing tidak mengimpor model booking; ia hanya butuh bentuk data yang sudah dibekukan (lihat 7.2.10).

**(2)** **Idempotensi di sini yang mencegah tiket ganda.** Webhook Midtrans bisa datang berkali-kali; tanpa cek ini, setiap retry akan membuat tiket baru dan pengunjung mendapat beberapa QR untuk satu pesanan.

**(3)** Multi-item digabung menjadi satu nama yang bisa dicetak: `"Tiket Dewasa x2, Tiket Anak x1"`. Satu booking = satu tiket = satu QR, meskipun berisi beberapa jenis tiket. Ini keputusan operasional penting: gerbang hanya perlu memindai satu kode per rombongan, dan `Quantity` menyimpan jumlah total orang.

**(4)** Pemotongan ke 300 karakter sesuai `varchar(300)`. `[:297] + "..."` menjaga total tepat 300 — bukan 303 yang akan ditolak database. Perhatikan juga bahwa pemotongan dilakukan pada **byte**, bukan rune; nama tiket beraksen bisa terpotong di tengah karakter UTF-8. Risiko rendah untuk nama tiket berbahasa Indonesia, tapi itulah alasan teknisnya.

```go
	qr, err := s.uniqueQRData(ctx)                                                                // (1)
	t := &Ticket{ BookingID: snap.ID, BookingCode: snap.BookingCode, ...,
		Quantity: totalQuantity(snap), Total: snap.Total, Status: TicketValid,
		GeneratedAt: time.Now(), QRData: qr }                                                     // (2)
	if err := s.repo.Create(ctx, t); err != nil { return nil, apperror.Internal(err) }
```

**(1)** `uniqueQRData` menghasilkan `KPT-` + 18 digit hex (9 byte acak), dengan 5 percobaan dan pemeriksaan DB. Formatnya sengaja **berbeda** dari kode booking (`KP-…-6 hex`): bila petugas salah memasukkan kode booking ke scanner, sistem bisa membedakan dan tidak mencocokkannya secara tidak sengaja.

**(2)** `Status: TicketValid` — tiket selalu lahir `VALID`, tidak pernah `USED`. `GeneratedAt` memakai `time.Now()` saat penerbitan, terpisah dari `PaidAt` di payment; selisihnya kecil tapi bisa dipakai mendiagnosis keterlambatan penerbitan.

### 7.4.2 `GetByIDOrQR` — menerima apa pun yang masuk dari kamera

Ini fungsi yang menentukan apakah scanner "terasa pintar" atau "terasa rusak". Input bisa berupa UUID tiket, payload JSON dari e-tiket lama, atau teks QR dengan/tanpa prefiks.

```go
func qrPayloadRef(raw string) string {                                    // (1)
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "{") { return raw }
	var payload struct {
		TicketID  string `json:"t"`
		ID        string `json:"id"`
		BookingID string `json:"b"`
		Booking   string `json:"booking_id"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil { return raw }
	switch {
	case payload.TicketID != "": return payload.TicketID
	case payload.ID != "":       return payload.ID
	case payload.BookingID != "":return payload.BookingID
	case payload.Booking != "":  return payload.Booking
	}
	return raw
}
```

**(1)** Mendukung empat kunci JSON sekaligus (`t`, `id`, `b`, `booking_id`) karena e-tiket pernah berevolusi: versi lama menyimpan booking id, versi baru ticket id. Kalau Anda "membersihkan" ini menjadi satu kunci, tiket yang sudah dicetak pengunjung akan berhenti bekerja di gerbang — kegagalan yang baru terlihat di lapangan, bukan di test.

```go
func (s *Service) GetByIDOrQR(ctx context.Context, ref string) (*Ticket, error) {
	ref = qrPayloadRef(ref)
	ref = strings.TrimSpace(ref)
	ref = strings.TrimPrefix(ref, "KPT-")                    // (1)
	if t, err := s.repo.FindByID(ctx, ref); err == nil && t != nil { return t, nil }   // (2)
	if t, err := s.repo.FindByQR(ctx, "KPT-"+strings.ToUpper(ref)); err == nil && t != nil { return t, nil }  // (3)
	if t, err := s.repo.FindByQR(ctx, strings.ToUpper(ref)); err == nil && t != nil { return t, nil }        // (4)
	if t, err := s.repo.FindByBookingID(ctx, ref); err == nil && t != nil { return t, nil }                  // (5)
	return nil, nil
}
```

**(1)** Prefiks dilepas dulu agar bisa dicoba sebagai UUID. Kalau tidak dilepas, `FindByID("KPT-A1B2…")` akan gagal parse UUID dan menyia-nyiakan satu query.

**(2)** Percobaan 1: UUID tiket. Ini jalur tercepat dan paling sering dipakai tombol "buka tiket" di aplikasi.

**(3)** Percobaan 2: teks QR yang diketik manual tanpa prefiks. Prefiks ditambahkan kembali, dan `ToUpper` menangani ketikan huruf kecil.

**(4)** Percobaan 3: payload mentah disimpan apa adanya (untuk QR yang tidak mengikuti format `KPT-`).

**(5)** Percobaan 4: booking ID — kompatibilitas e-tiket lama. Empat query berurutan terasa boros, tapi semuanya berindeks dan hanya berjalan saat scan; nilai kompatibilitasnya jauh melebihi biaya satu-dua query tambahan.

### 7.4.3 `Validate` — aturan gerbang, dan kenapa urutannya begitu

```go
func (s *Service) Validate(ctx context.Context, ref, gate, petugasID, petugasName string) (*ValidateResult, error) {
	t, err := s.GetByIDOrQR(ctx, ref)
	if err != nil { return nil, err }
	if t == nil {                                                                    // (1)
		s.logValidation(ctx, nil, ref, gate, ScanInvalid, "Data tiket tidak ditemukan.")
		return &ValidateResult{Status: ScanInvalid, Message: "Data tiket tidak ditemukan."}, nil
	}
	record := func(status string) {                                                   // (2)
		scan := &ScanRecord{ TicketID: t.ID, BookingID: t.BookingID, VisitorName: t.VisitorName,
			Gate: gate, PetugasID: petugasID, PetugasName: petugasName,
			Status: status, ScannedAt: time.Now() }
		if err := s.repo.CreateScan(ctx, scan); err != nil {
			s.log.Error("scan record persist failed", zap.String("ticket_id", t.ID), zap.Error(err))
		}
	}
```

**(1)** Tiket tidak ditemukan **tetap dicatat** di audit dan **tetap** mengembalikan `status: "INVALID"` dengan HTTP 200, bukan 404. Ini keputusan UX yang disengaja: scanner harus menampilkan kotak merah "Data tiket tidak ditemukan", bukan melempar error jaringan. Selain itu, percobaan scan dengan kode palsu adalah sinyal keamanan yang ingin Anda lihat di riwayat.

**(2)** Closure `record` menyatukan penulisan `scan_records` agar tidak ada cabang yang lupa mencatat. Bahkan kegagalan penulisan scan hanya di-log, tidak menggagalkan validasi — tiket sudah diputuskan, dan menolak masuk karena gagal menulis riwayat akan merugikan pengunjung di lapangan.

```go
	switch t.Status {
	case TicketCancelled:
		record(ScanCancelled); s.logValidation(...); return &ValidateResult{Status: ScanCancelled, Message: "Tiket dibatalkan.", ...}
	case TicketExpired:
		record(ScanExpired);  s.logValidation(...); return &ValidateResult{Status: ScanExpired,  Message: "Tiket sudah kedaluwarsa.", ...}
	case TicketUsed:
		record(ScanUsed);     s.logValidation(...); return &ValidateResult{Status: ScanUsed,     Message: "Tiket sudah digunakan.", ...}
	}
```

**(1)** Tiga status terminal ditolak lebih dulu, sebelum aturan tanggal. Urutannya penting: tiket `USED` yang di-scan pada tanggal kunjungan **besok** harus dijawab "sudah digunakan" (alasan sebenarnya), bukan "belum berlaku" (menyesatkan petugas). Pesan yang benar menghemat percakapan di gerbang.

```go
	today := time.Now().Format("2006-01-02")
	if today < t.VisitDate {                                              // (1)
		record(ScanInvalid)
		message := fmt.Sprintf("Tiket belum berlaku. Tiket dapat digunakan mulai %s.", t.VisitDate)
		s.logValidation(ctx, t, "", gate, ScanInvalid, message)
		return &ValidateResult{Status: ScanInvalid, Message: message, Ticket: toTicketResponse(t)}, nil
	}
```

**(1)** Perbandingan **string** `yyyy-MM-dd`, bukan `time.Time`. Ini bekerja karena format ISO terurut secara leksikografis. Syaratnya mutlak: `VisitDate` harus selalu format itu — konsekuensi dari keputusan menyimpannya sebagai `varchar(10)` (lihat 7.2.3). Perhatikan juga arah aturannya: tiket boleh dipakai pada **dan setelah** tanggal kunjungan (tidak ada batas atas), sehingga pengunjung yang datang terlambat sehari tetap diterima. Kalau bisnis menghendaki masa berlaku ketat, batas atas harus ditambahkan di sini — dan pesannya juga.

```go
	now := time.Now()
	burned, err := s.repo.MarkUsed(ctx, t.ID, now, gate)                    // (1)
	if err != nil { return nil, apperror.Internal(err) }
	if !burned {                                                             // (2)
		record(ScanUsed)
		s.logValidation(ctx, t, "", gate, ScanUsed, "Tiket sudah digunakan.")
		return &ValidateResult{Status: ScanUsed, Message: "Tiket sudah digunakan.", Ticket: toTicketResponse(t)}, nil
	}
	t.Status = TicketUsed; t.CheckedInAt = &now; t.CheckedInGate = gate
	if s.bookings != nil {
		if err := s.bookings.SetCheckedIn(ctx, t.BookingID, gate, now); err != nil {   // (3)
			s.log.Error("booking checked-in stamp failed", zap.String("booking_id", t.BookingID), zap.Error(err))
		}
	}
	record(ScanValid)
```

**(1)** `MarkUsed` adalah `UPDATE tickets SET status='USED', checked_in_at=?, checked_in_gate=? WHERE id=? AND status='VALID'` yang mengembalikan `RowsAffected > 0`. **Inilah pengaman konkurensi**: dua petugas memindai QR yang sama pada detik yang sama, hanya satu UPDATE yang mengenai baris `VALID`. Yang kalah mendapat `burned == false` dan pesan "sudah digunakan".

**(2)** Cabang ini juga menangani balapan yang tidak terlihat di `switch` di atas: status terbaca `VALID` saat SELECT, tapi berubah sebelum UPDATE. Tanpa cabang ini, dua orang bisa masuk dengan satu tiket.

**(3)** Kegagalan menandai booking **tidak** membatalkan scan (hanya log). Urutannya juga disengaja: tiket dibakar lebih dulu, booking ditandai kemudian. Kalau dibalik, kegagalan pembakaran akan meninggalkan booking `USED` dengan tiket yang masih `VALID` — pengunjung bisa masuk dua kali.

### 7.4.4 `Monitoring` — laporan yang tidak membocorkan data pribadi

```go
func (s *Service) Monitoring(ctx context.Context, date string) (*MonitoringResponse, error) {
	scans, _, err := s.repo.ListScans(ctx, 0, 10000, "", "", "", "")     // (1)
	...
	if date == "" { date = time.Now().Format("2006-01-02") }             // (2)
```

**(1)** Mengambil hingga 10.000 baris lalu mengagregasi **di Go**, bukan `GROUP BY` di SQL. Untuk volume ini masih cepat dan membuat logika agregasi mudah diuji. Tapi ini batas nyata: pada 10.001 scan, angka akan terpotong tanpa peringatan. Bila data tumbuh, agregasi harus pindah ke SQL.

**(2)** Tanggal default "hari ini" bila tidak diberikan, sehingga dashboard manager selalu punya isi saat pertama dibuka.

**(3)** `PerPetugas` diurutkan dengan pembanding dua tingkat: valid terbanyak, lalu nama alfabetis. Pengurutan sekunder ini penting agar tabel tidak "melompat-lompat" di antara refresh ketika dua petugas punya angka sama.

**(4)** `Hourly` hanya mengisi jam 07:00–16:00 — jam operasional. Jam di luar itu tidak ditampilkan meski ada datanya, sehingga grafik tidak melebar karena satu scan tengah malam (yang biasanya berarti kesalahan data).

### 7.4.5 `SyncStatusForBooking`

```go
switch bookingStatus {
case booking.StatusCancelled: ticketStatus = TicketCancelled
case booking.StatusExpired:   ticketStatus = TicketExpired
case booking.StatusPaid, booking.StatusConfirmed: ticketStatus = TicketValid
case booking.StatusUsed:      ticketStatus = TicketUsed
default: return nil
}
```

**(1)** Pemetaan eksplisit antara status booking dan status tiket. Perhatikan `PAID`/`CONFIRMED` → `VALID`: kalau admin mengubah booking yang dibatalkan kembali menjadi `CONFIRMED`, tiketnya hidup lagi. Ini perilaku yang diinginkan untuk koreksi kesalahan, tapi juga berarti pembatalan bukan tindakan permanen.

**(2)** `default: return nil` — status yang tidak dikenal (mis. `PENDING`) tidak mengubah tiket. Booking `PENDING` memang belum punya tiket, jadi tidak ada yang perlu disinkronkan.
## 7.5 Frontend — bagaimana logika backend menjadi tampilan

### 7.5.1 `frontend/middleware.ts` — penjaga yang jujur mengaku bukan tembok

```ts
const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/manager", "/petugas"];   // (1)
const ACCESS_COOKIE = "kpr_access_token";

function base64UrlDecode(input: string): string {                              // (2)
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
}
```

**(1)** Empat prefiks panel. Daftar ini harus sejalan dengan `lib/role-home.ts` dan rute backend; kalau menu baru ditambahkan (mis. `/keuangan`), prefiksnya wajib masuk sini atau halaman akan terbuka tanpa login.

**(2)** JWT memakai base64url (`-` dan `_`) tanpa padding, sedangkan `atob` hanya memahami base64 standar dengan padding. Dua baris ini adalah seluruh perbedaannya. Tanpa padding, `atob` melempar `InvalidCharacterError` dan **semua** pengguna akan dialihkan ke login meski tokennya sah.

```ts
function tokenIsUsable(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;                                        // (1)
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1] ?? "")) as { exp?: number; uid?: string };
    if (typeof payload.exp !== "number" || typeof payload.uid !== "string" || !payload.uid) return false;  // (2)
    return payload.exp * 1000 > Date.now() - 5000;                            // (3)
  } catch { return false; }
}
```

**(1)** JWT harus tiga bagian. Ini juga menolak cookie sampah tanpa perlu parse.

**(2)** `exp` wajib angka, `uid` wajib string non-kosong. Pemeriksaan `uid` bukan formalitas: token yang tidak membawa identitas akan lolos middleware tapi gagal di backend, menghasilkan pengalaman "sudah login tapi semua kosong".

**(3)** `exp` dalam detik → dikali 1000. Toleransi `-5000` (5 detik) mencegah pengguna ditendang saat token kedaluwarsa tepat ketika request dikirim.

**Yang penting dipahami:** middleware **tidak memverifikasi tanda tangan**. Ia hanya membaca isi token. Siapa pun bisa membuat cookie `kpr_access_token` dengan payload palsu dan lolos middleware. Itu **tidak** menjadi celah, karena setiap request API tetap divalidasi backend dan setiap data diambil dari API. Middleware di sini murni optimasi UX: pengguna yang jelas belum login tidak perlu memuat halaman panel lalu melihat skeleton sebelum ditolak. Komentar di file menyatakan hal ini secara eksplisit — jangan dihapus, karena komentar itulah yang mencegah orang mengira middleware ini adalah batas keamanan.

### 7.5.2 `frontend/lib/api/client.ts` — satu pintu, banyak jebakan yang sudah ditutup

```ts
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");  // (1)

const SERVER_API_BASE_URL = (process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8080").replace(/\/$/, "") + "/api/v1";  // (2)

export function apiUrl(path: string): string {
  const base = typeof window === "undefined" ? SERVER_API_BASE_URL : API_BASE_URL;   // (3)
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
```

**(1)** Dua nama env diterima (`NEXT_PUBLIC_API_BASE_URL` lebih dulu) untuk kompatibilitas; `.replace(/\/$/, "")` membuang trailing slash agar tidak lahir `//bookings` yang dianggap rute berbeda oleh sebagian server.

**(2)** Di server (RSC) URL harus absolut. Komentar di file menjelaskan alasannya secara rinci: memanggil origin sendiri lewat HTTPS dev bersertifikat self-signed membuat `fetch` Node menolak TLS, sehingga SSR selalu gagal. Solusinya memanggil backend langsung via HTTP polos. Ini contoh bug yang hanya muncul di server dan pesan errornya menyesatkan ("fetch failed") — dokumentasi di kode inilah yang menyelamatkan orang berikutnya.

**(3)** Percabangan `typeof window === "undefined"` adalah pembeda SSR vs browser. Di browser, base relatif penting agar cookie HttpOnly same-origin ikut terkirim.

```ts
async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => { ... })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;                                                         // (1)
}
```

**(1)** **Single-flight refresh.** Kalau lima request menerima 401 bersamaan (halaman dashboard memuat beberapa endpoint), tanpa ini kelimanya akan memanggil `/auth/refresh` sekaligus; backend merotasi refresh token, empat panggilan berikutnya memakai token lama dan gagal → pengguna terlempar ke login padahal sesinya sehat. Menyimpan promise yang sama membuat hanya satu refresh berjalan. Ini bug yang sangat sulit direproduksi manual dan sangat mudah terjadi di produksi.

```ts
if (response.status === 401) {
  if (allowRefresh && !AUTH_ENDPOINTS.includes(endpoint)) {        // (1)
    const refreshed = await refreshSession();
    if (refreshed) return this.request<T>(endpoint, options, false);  // (2)
    handleSessionExpired();
  }
  throw new ApiError(message, 401, data);
}
```

**(1)** Endpoint auth dikecualikan agar tidak terjadi loop: refresh yang gagal dengan 401 tidak boleh memicu refresh lagi.

**(2)** `allowRefresh = false` pada percobaan kedua — **hanya satu** percobaan ulang. Tanpa batas ini, sesi yang rusak akan menghasilkan rekursi tak terbatas dan browser tampak "hang".

```ts
} catch (error) {
  clearTimeout(timeoutId);
  if (error instanceof DOMException && error.name === "AbortError") {
    throw new ApiError("Koneksi terlalu lama. Silakan coba kembali.", 408);   // (1)
  }
  throw new ApiError("Tidak dapat terhubung ke server. Silakan coba kembali.", 0);  // (2)
}
```

**(1)** Timeout 30 detik diterjemahkan ke status **408** dengan pesan Indonesia. Pengguna tidak pernah melihat "The operation was aborted".

**(2)** Status **0** khusus untuk kegagalan jaringan. Frontend bisa membedakannya dari 500: 0 berarti "server tidak terjangkau" (Wi-Fi mati), 500 berarti "server bermasalah". Tanpa pemisahan ini, halaman error akan menyarankan hal yang salah.

**(3)** Perhatikan bahwa kegagalan jaringan **tidak** memanggil `handleSessionExpired`. Hanya 401 yang menghapus sesi. Ini mencegah pengguna kehilangan login karena Wi-Fi putus sesaat — kegagalan yang paling menjengkelkan sekaligus paling mudah terjadi di lokasi wisata.

### 7.5.3 `frontend/services/booking.api.service.ts` — envelope, bukan objek telanjang

```ts
async create(payload: CreateBookingRequest): Promise<CreateBookingResponse> {
  const response = await apiClient.post<ApiResponse<Pick<CreateBookingResponse, "booking" | "payment">>>("/bookings", payload);  // (1)
  if (!response.success || !response.data) throw new BookingError(response.message || "Failed to create booking");  // (2)
  return { success: response.success, message: response.message, booking: response.data.booking, payment: response.data.payment };  // (3)
}
```

**(1)** Tipe generik `ApiResponse<...>` mencerminkan `pkg/response.Envelope` backend: `{success, message, data, meta}`. `Pick<...>` menyatakan dengan tepat bahwa backend hanya mengisi `booking` dan `payment` di dalam `data`.

**(2)** Dua lapis kegagalan ditangani: HTTP error sudah dilempar `apiClient` sebagai `ApiError`, sedangkan `success: false` pada HTTP 200 harus diperiksa manual. Backend saat ini selalu memakai status HTTP yang benar, tapi pemeriksaan ini membuat frontend tetap aman bila suatu endpoint mengembalikan 200 dengan `success: false`.

**(3)** **Membongkar `data` adalah inti fungsi ini.** Komentar di kode menyebutkan bug yang pernah terjadi: kode lama membaca `response.booking` di root, sehingga hasilnya `undefined` dan halaman pembayaran kosong meski API sukses. Kalau Anda menambah method baru, tiru pola ini: baca dari `response.data`.

```ts
async cancel(id: string, reason?: string): Promise<Booking> {
  const response = await apiClient.delete<{ success: boolean; message?: string; data: Booking }>(`/bookings/${id}`);  // (1)
```

**(1)** `DELETE /bookings/:id` berfungsi ganda: pengunjung membatalkan, admin menghapus. Backend membedakannya lewat middleware peran pada rute yang sama. Ini juga alasan komentar menyebut "backward compatibility" untuk `remove()` yang memakai `/admin/bookings/:id`.

### 7.5.4 `frontend/features/public/components/payment-panel.tsx` — mesin status di layar

Komponen ini adalah cermin dari `payments.Process`. Ia punya tujuh fase dan setiap fase punya satu arti:

```
LOADING   → sedang mengambil booking + payment
WAITING   → booking PENDING, countdown berjalan, tombol Bayar aktif
PROCESSING→ request /payments/process sedang berjalan
SUCCESS   → booking PAID/CONFIRMED/USED
FAILED    → outcome FAILED (atau booking non-PENDING)
EXPIRED   → countdown habis atau outcome EXPIRED
NOT_FOUND → kode tidak valid / gagal memuat
```

```tsx
const b = await bookingService.getById(code);          // (1)
const p = await paymentService.getByBookingId(code);
if (!alive) return;                                    // (2)
setBooking(b); setPayment(p);
if (p?.method && findPaymentMethod(p.method)) setMethod(p.method as PaymentMethodCode);  // (3)
setPhase(b?.status === "PENDING" ? "WAITING"
  : b?.status === "PAID" || b?.status === "CONFIRMED" || b?.status === "USED" ? "SUCCESS" : "FAILED");  // (4)
```

**(1)** Dua request berurutan, bukan paralel, karena `getByBookingId` membutuhkan `code` yang sama dan kegagalan booking sudah cukup untuk menampilkan NOT_FOUND. Biaya satu round-trip tambahan ditukar dengan penanganan error yang sederhana.

**(2)** Guard `alive` mencegah `setState` setelah unmount (React StrictMode di dev menjalankan effect dua kali). Tanpa ini, muncul peringatan dan kadang state "melompat" kembali ke LOADING.

**(3)** Metode terakhir yang dipakai dipulihkan dari server, sehingga pengunjung yang me-refresh melihat metode pilihannya, bukan kembali ke QRIS. `findPaymentMethod` memvalidasi bahwa kode itu masih dikenal konfigurasi frontend — nilai asing diabaikan agar UI tidak menampilkan label kosong.

**(4)** Pemetaan status booking → fase. Perhatikan `USED` dianggap SUCCESS: pengunjung yang membuka kembali tautan pembayaran setelah tiket dipakai melihat "Pembayaran Berhasil", bukan "Gagal". Alternatifnya akan sangat membingungkan.

```tsx
useEffect(() => {
  if (!payment || phase !== "WAITING") return;
  const tick = () => {
    const left = Math.max(0, Math.floor((new Date(payment.expired_at).getTime() - Date.now()) / 1000));  // (1)
    setCountdown(left);
    if (left === 0) {
      setPhase("EXPIRED");
      paymentService.expirePayment(payment.booking_id).catch(() => {});   // (2)
    }
  };
  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);                                      // (3)
}, [payment, phase]);
```

**(1)** Sisa waktu dihitung dari `expired_at` **server**, bukan konstanta 30 menit. Kalau pengguna membuka halaman 10 menit setelah membuat pesanan, countdown mulai dari 20:00 — bukan 30:00. Ini yang membuat jam perangkat yang salah tidak merusak tampilan terlalu parah.

**(2)** Saat habis, frontend **meminta** backend meng-expire. Error diabaikan karena status sebenarnya tetap milik server; scheduler juga akan membersihkannya. Frontend tidak pernah memutuskan sendiri bahwa pembayaran kedaluwarsa.

**(3)** Cleanup `clearInterval` wajib. Tanpa itu, setiap perubahan `phase` meninggalkan timer yang berjalan dan memanggil `setState` pada komponen yang mungkin sudah unmount.

```tsx
function isSafePaymentUrl(raw: string | undefined): raw is string {   // (1)
  if (!raw) return false;
  try { return new URL(raw).protocol === "https:"; } catch { return false; }
}

async function pay() {
  const res = await paymentService.processPayment({ booking_id: booking.id, method });  // (2)
  if (res.outcome === "SUCCESS") { ...; setTimeout(() => router.push(`/e-ticket?code=${res.booking.id}&new=1`), 1200); }
  else if (res.outcome === "FAILED") { setPhase("FAILED"); }
  else { setPhase("EXPIRED"); }                                                        // (3)
}
```

**(1)** Hanya URL `https:` yang dirender sebagai tautan ke gateway. Ini mencegah open redirect / tautan `javascript:` bila respons server pernah dimanipulasi. `new URL` juga menolak string relatif, sehingga tidak ada tautan "setengah jadi".

**(2)** `outcome` adalah kontrak tiga nilai dari backend: `SUCCESS`, `FAILED`, `EXPIRED` (nilai lain diperlakukan sebagai EXPIRED). Frontend **tidak** menyimpulkan sendiri dari status booking setelah pembayaran — server yang berwenang.

**(2a)** Yang perlu disadari saat membaca komponen ini bersama backend: endpoint `POST /payments/process` **hanya aktif saat `APP_DEMO_MODE`** (ditolak 403 di produksi). Jadi tombol "Bayar Sekarang" di sini adalah alur demo. Di produksi, pengunjung menekan tautan `midtrans_redirect_url` dan status diperbarui lewat webhook; komponen harus memuat ulang (`getByBookingId`) untuk melihat hasilnya. Ketimpangan ini nyata dan patut dicatat: UI saat ini menyediakan tombol yang tidak akan bekerja di produksi.

**(3)** Selain SUCCESS dan FAILED, sisanya dianggap EXPIRED. Ini pilihan defensif: nilai tak dikenal tidak boleh membuat layar berhenti di PROCESSING selamanya.

**(4)** Komentar di komponen menyebut aturan penting: **tidak ada QRIS atau nomor VA yang digambar di browser**. Semua instruksi berasal dari `midtrans_redirect_url` milik gateway. Alasannya bukan estetika — QR buatan frontend akan membuat pengunjung membayar ke rekening yang salah, dan itu kerugian nyata yang tidak bisa dikembalikan kode.

### 7.5.5 `frontend/app/(petugas)/petugas/scan/page.tsx` — kamera, jsQR, dan pengaman ganda

```tsx
const [secureContext, setSecureContext] = useState(true);
useEffect(() => { setSecureContext(window.isSecureContext !== false); }, []);   // (1)
```

**(1)** `getUserMedia` hanya tersedia di secure context (HTTPS atau localhost). Halaman yang dibuka lewat `http://192.168.x.x` akan **diam-diam** tidak punya `navigator.mediaDevices`, dan pesan error bawaan browser tidak menjelaskan sebabnya. Karena itu halaman mendeteksi lebih dulu dan menampilkan tombol "Buka versi HTTPS".

```tsx
const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });  // (1)
```

**(1)** `facingMode: { ideal: "environment" }` meminta kamera belakang, tapi `ideal` (bukan `exact`) membuat laptop dengan satu kamera tetap bekerja. `audio: false` penting: meminta mikrofon akan memunculkan prompt izin tambahan dan sering ditolak petugas.

**(2)** Tiga error ditangani terpisah: `NotAllowedError` (izin ditolak), `NotFoundError` (tidak ada kamera), lainnya. Pesan yang berbeda menghasilkan tindakan yang berbeda — "aktifkan izin" vs "ketik manual". Pesan generik akan membuat petugas menebak.

```tsx
const tick = (timestamp: number) => {
  frame = requestAnimationFrame(tick);                 // (1)
  if (timestamp - lastTick < 350) return;              // (2)
  lastTick = timestamp;
  if (scanningRef.current || video.readyState < 2) return;   // (3)
  ...
  const decoded = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });  // (4)
  if (!decoded?.data) return;
  const now = Date.now();
  if (decoded.data === lastScanRef.current.value && now - lastScanRef.current.at < 4000) return;  // (5)
  lastScanRef.current = { value: decoded.data, at: now };
  setCode(decoded.data);
  void runScan(decoded.data);
};
```

**(1)** Loop `requestAnimationFrame` berjalan ~60×/detik. Ini jauh lebih mahal daripada yang dibutuhkan, tapi memberi pengalaman "langsung terdeteksi" tanpa tombol.

**(2)** Pembacaan dibatasi ~3×/detik (350 ms). `jsQR` bekerja pada piksel mentah dan mahal; tanpa throttle, ponsel kelas menengah akan panas dan lambat.

**(3)** `video.readyState < 2` berarti belum ada frame yang bisa digambar. `scanningRef` mencegah validasi kedua dikirim saat yang pertama belum selesai — **ini pengaman penting**: satu QR yang terlihat selama 2 detik akan terbaca berkali-kali, dan tanpa guard akan mengirim banyak request yang semuanya berebut membakar tiket yang sama.

**(4)** `inversionAttempts: "dontInvert"` mempercepat dekode dengan mengorbankan QR terang-di-atas-gelap. Untuk tiket yang dicetak normal, ini peningkatan kecepatan gratis.

**(5)** De-duplikasi 4 detik: QR yang sama tidak dikirim lagi selama 4 detik. Lapisan ketiga setelah throttle dan `scanningRef`. Tiga lapisan terlihat berlebihan sampai Anda melihat petugas memindai tiket yang sama dua kali karena kamera goyang — lalu menyadari bahwa ketiganya menangani skenario berbeda.

```tsx
const gate = user?.gate ?? "Gerbang 1";        // (1)
const petugas = user?.name ?? "Petugas";
const response = await scannerService.validateTicket({ ticket_id: ref, gate, petugas });
```

**(1)** `gate` dikirim dari data user, tapi **backend juga mencatat `petugasID` dari JWT**. Artinya `gate` bisa dipalsukan lewat DevTools, sedangkan identitas petugas tidak. Bila gerbang harus tidak bisa dipalsukan, nilai `gate` mesti diambil server dari profil petugas — catatan untuk pengembangan berikutnya.

**(2)** `result.ticket` ditampilkan sebagai satu baris ringkas: nama, kode booking, jenis tiket, jumlah, tanggal kunjungan. Untuk tiket `USED`, baris ini tetap tampil — petugas perlu tahu **tiket siapa** yang ditolak, bukan hanya bahwa ada penolakan.

### 7.5.6 Pemetaan backend → tampilan

| Aturan backend | Bukti di kode | Apa yang dilihat pengguna |
|---|---|---|
| Kuota dihitung server, harga dari DB | `booking/service.go Create` (10)–(13) | Total di ringkasan pesanan sama dengan struk; harga tidak bisa diakali |
| Kode booking acak 6 hex | `generateBookingCode` | `KP-20261112-A1B2C3` di struk dan URL pembayaran |
| Pembayaran 30 menit | `PaymentWindow` | Hitung mundur `mm:ss` di panel |
| Status hanya berubah lewat aturan | `allowedTransition`, `MarkPaid`, `MarkUsed` | Tombol admin tidak menawarkan transisi mustahil |
| Tiket terbit saat lunas | `markPaid` → `IssueForBooking` | Halaman e-tiket muncul otomatis 1,2 detik setelah sukses |
| Scan sekali pakai | `MarkUsed` atomik | Scan kedua: kotak kuning "Tiket sudah digunakan" |
| Tiket tidak berlaku sebelum tanggal | `today < visit_date` | Pesan "Tiket dapat digunakan mulai <tanggal>" |
| Semua hasil scan diaudit | `logValidation`, `scan_records` | Riwayat & grafik monitoring per petugas/jam |
## 7.6 Catatan silang: hal yang terlihat seperti bug (dan yang memang bug)

Bagian ini penting karena saat membaca kode berlapis, beberapa pola terlihat salah padahal disengaja, dan beberapa terlihat wajar padahal bermasalah. Keduanya harus dipisahkan.

**Bukan bug — jangan "diperbaiki":**

1. `booking.PaymentStarter` punya 5 parameter, `payments.Service.StartPayment` hanya 3. Dijembatani `bootstrap/adapters.go`. Menyamakan signature akan memaksa domain booking mengenal nama/email gateway.
2. `middleware.ts` tidak memverifikasi tanda tangan JWT. Backend tetap memverifikasi setiap request; middleware hanya untuk UX.
3. Harga dan nama tiket **disalin** ke `booking_items`, bukan di-join. Ini menjaga struk historis.
4. `GetByCode` **memang** memeriksa kepemilikan (`!privileged && b.UserID != requesterID`). Akses lewat kode booking terjadi karena handler publik mengirim `privileged=true` setelah memvalidasi kode — bukan karena service buta otorisasi.
5. `MarkPaid` tidak punya parameter otorisasi. Ia hanya dipanggil mesin internal setelah verifikasi gateway.
6. `PaymentPanel` menganggap `USED` sebagai SUCCESS. Pengunjung yang membuka ulang tautan setelah masuk gerbang tidak boleh melihat "gagal".

**Bug / utang teknis yang nyata:**

1. **`ExpireStalePending` menulis payment dengan `repo.Update` penuh, bukan `UpdateStatusIf`.** Booking tetap ikut di-expire (memang benar), tetapi payment yang baru saja `PAID` bisa tertimpa menjadi `EXPIRED` bila webhook berjalan bersamaan. Perbaikan: panggil `expirePayment` per payment, yang sudah memakai CAS.
2. **`toBookingResponseList` adalah N+1.** Komentar di `mapper.go` mengklaim "satu query terbatch", implementasinya memanggil `paymentReader` per booking, dan adapter melakukan satu query per panggilan. Aman untuk `limit ≤ 100`, bermasalah untuk ekspor.
3. **`ListForUser` identik dengan `ListMine` tanpa pemeriksaan peran.** Nama menyiratkan jalur admin, tetapi service tidak membedakannya; keamanan bergantung pada middleware rute. Duplikasi ini berisiko bila endpoint dipakai ulang.
4. **`logTransitionFailure` tidak mencatat apa pun** karena `Service` tidak punya logger. Akibat langsung: kegagalan membatalkan booking otomatis di `Create` hilang tanpa jejak, dan booking bisa tertinggal `PENDING` tanpa payment.
5. **`markPaidFromMidtrans` bisa berhenti setengah jalan.** Payment di-CAS ke `PAID` lebih dulu, baru booking `MarkPaid`. Kalau booking sudah `EXPIRED`, webhook gagal dan Midtrans mengulang — tetapi pengulangan berhenti di `if p.Status == StatusPaid { return nil }`, sehingga booking tidak pernah dipulihkan otomatis.
6. **Cabang `REFUNDED` di `SetStatusByAdmin` kembali lebih awal** sebelum blok audit di akhir fungsi, sehingga perubahan status refund tidak tercatat sebagai aksi admin di payment (booking-nya tetap tercatat lewat audit booking).
7. **`Process` demo menulis payment `PAID` sebelum `bookings.MarkPaid`.** Bila `MarkPaid` gagal, payment sudah lunas tetapi booking tidak — kebalikan dari urutan aman di jalur webhook.
8. **`gate` pada scan berasal dari klien** (`user?.gate`), sehingga bisa dimanipulasi lewat DevTools. `petugasID` aman karena diambil dari JWT di backend.
9. **`BookingPaymentUpdater` dideklarasikan tetapi tidak dipakai**, dan `sortedItemIDs` hanya untuk debug. Keduanya sisa refactor, bukan bug.
10. **Soft delete menahan `booking_code` selamanya.** Kode yang sudah dihapus tidak akan pernah bisa dipakai ulang — sebenarnya diinginkan, tapi perlu diketahui saat menguji pembuatan kode.
11. **Daftar metode ganda**: `payments.Methods`/`ValidMethod` di backend dan `payment.config.ts` di frontend tidak diperiksa otomatis kesesuaiannya. Menambah metode di satu sisi saja menghasilkan penolakan yang membingungkan.
12. **`clampPagination` mengubah `limit` di luar 1–100 menjadi 20**, bukan memotongnya ke 100. Bukan bug, tapi mudah disalahpahami saat menguji paginasi.

## 7.7 Peta cakupan: di mana setiap file dibahas

Bagian 7 membedah alur transaksi secara mendalam. Ringkasan **semua** file (termasuk yang tidak menyentuh alur transaksi) ada di Bagian 1–6; tabel ini adalah indeks silang agar tidak ada file yang tercari-cari.

### Backend

| Kelompok | File | Dibahas |
|---|---|---|
| Entry & wiring | `cmd/main.go`, `internal/bootstrap/*` | Bagian 1; adapter `paymentStarterAdapter` di 7.2.1 |
| Konfigurasi | `internal/config/*`, `internal/constant/*` | Bagian 1 |
| Middleware | `internal/middleware/*` (auth, role, csrf, ratelimit) | Bagian 1; interaksi cookie di 7.5.2 |
| HTTP | `internal/routes/*`, `pkg/response/*`, `pkg/apperror/*`, `pkg/validation/*` | Bagian 1; envelope di 7.5.3 |
| Booking | `service.go`, `repository.go`, `usecase.go`, `handler.go`, `dto.go`, `entity.go`, `mapper.go`, `routes.go`, `errors.go` | **7.2 baris-per-baris** |
| Payments | `service.go`, `repository.go`, `usecase.go`, `handler.go`, `dto.go`, `entity.go`, `mapper.go` | **7.3 baris-per-baris** |
| Ticketing | `service.go`, `repository.go`, `handler.go`, `dto.go`, `entity.go` | **7.4 baris-per-baris** |
| Auth | `service.go`, `handler.go`, `repository.go`, `dto.go`, `entity.go`, `mapper.go`, `routes.go`, `validator.go`, `errors.go` | Bagian 1; alur refresh di 7.5.2 |
| Analytics | `dto.go`, `handler.go`, `repository.go`, `service.go` | Bagian 1; konsumen `ValidTicketsOn` di 7.4.4 |
| Audit | `entity.go`, `dto.go`, `service.go`, `usecase.go`, `handler.go`, `repository.go` | Bagian 1; metadata scan di 7.4.3 |
| Destination info | `dto.go`, `entity.go`, `errors.go`, `handler.go`, `repository.go`, `routes.go`, `service.go`, `usecase.go`, `validator.go` | Bagian 1 |
| Facility | `dto.go`, `entity.go`, `handler.go`, `repository.go`, `routes.go`, `service.go`, `usecase.go` | Bagian 1 |
| FAQ | seluruh file domain `faq/` | Bagian 3 |
| Gallery | seluruh file domain `gallery/` | Bagian 3 |
| Article / Public | `article/`, `public/` | Bagian 3 |
| Package | seluruh file domain `package/` | Bagian 3 |
| Tickettype (katalog) | seluruh file domain `tickettype/` | Bagian 2; dipakai `TicketPricer` di 7.2.2 |
| User / Role | `user/`, `role/` | Bagian 2 |
| Visitors / Visitor rule | `visitors/`, `visitorrule/` | Bagian 2–3 |
| Verification | `verification/` | Bagian 2 |
| Scheduler | `internal/scheduler/*` | Bagian 1; pemanggil `StalePendingIDs` di 7.2.10 dan `ExpireStalePending` di 7.3.6 |
| Payment gateway | `internal/payment/midtrans/*` | Bagian 1; signature di 7.3.4 |
| Mail / Notification / Queue | `internal/mail/*`, `internal/notification/*`, `internal/queue/*` | Bagian 1 |
| Security / Storage / Upload / Seed | `internal/security/*`, `internal/storage/*`, `internal/upload/*`, `internal/seed/*` | Bagian 1 |
| Utility | `pkg/jwtutil`, `pkg/logger`, `pkg/mailer`, `pkg/slugutil` | Bagian 1 |

### Frontend

| Kelompok | File | Dibahas |
|---|---|---|
| API client | `lib/api.ts`, `lib/api/client.ts` | **7.5.1–7.5.2** |
| Middleware | `middleware.ts` | **7.5.1** |
| Service | `booking.api.service.ts`, `payment.api.service.ts`, `scanner.api.service.ts` | **7.5.3** |
| Panel publik | `payment-panel.tsx`, `booking-order-form.tsx` | **7.5.4** |
| Panel petugas | `app/(petugas)/petugas/scan/page.tsx` | **7.5.5** |
| Panel admin/manager | `app/(admin)/**`, `app/(manager)/**` | Bagian 1–6 |
| Panel pengunjung | `app/(dashboard)/**`, halaman e-tiket | Bagian 1–6 |
| Store | `auth.store.ts`, `booking.store.ts`, `language.store.ts`, `wishlist.store.ts` | Bagian 1–6 |
| Lib | `jwt.ts`, `permission.ts`, `role-home.ts`, `currency.ts`, `business.ts`, `report-export.ts`, `eticket-pdf.ts` | Bagian 1–6 |
| Hook | `use-auth.ts`, hook lain | Bagian 1–6 |
| Feature | `features/**` (gallery, destination, article, …) | Bagian 1–6 |
| Konfigurasi | `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, dll. | Bagian 1–6 |

### Database, Docker, root

`database/migrations/*`, `database/seed/*`, `docker/*`, `README.md`, `CODEBASE.md`, `.gitignore` — dibahas di Bagian 5 dan 6.

## 7.8 Cara memakai dokumen ini

1. **Mencari "kenapa harga tidak sesuai"** → 7.2.3, langkah (12)–(13). Biaya layanan 2% dibulatkan ke bawah.
2. **Mencari "kenapa pembayaran tidak muncul"** → 7.3.2 (idempotensi `StartPayment`) dan 7.3.6 (utang teknis expire).
3. **Mencari "kenapa tiket tidak bisa di-scan"** → 7.4.2 (empat format input) lalu 7.4.3 (urutan penolakan).
4. **Mencari "kenapa halaman kosong padahal API 200"** → 7.5.3, langkah (3). Data ada di `response.data`, bukan root.
5. **Mencari "kenapa pengguna terlempar ke login"** → 7.5.2. Hanya 401 yang menghapus sesi, dan refresh hanya dicoba sekali.
6. **Sebelum mengubah aturan bisnis**, cari dulu nama fungsinya di tabel 7.7, lalu baca seluruh sub-bagiannya. Hampir setiap aturan di sistem ini punya pasangan di sisi lain: mengubah `PaymentWindow` mengubah countdown, scheduler, dan pesan UI sekaligus.

Yang perlu diingat saat menambah fitur baru: pola yang dipakai konsisten di seluruh proyek — **handler tidak menghitung, usecase menempelkan konteks, service memutuskan, repository menulis, dan bootstrap menyambungkan**. Setiap penyimpangan dari pola itu akan terasa sebagai "kenapa bagian ini berbeda dari yang lain", dan biasanya memang di situlah letak bug.
---

# Bagian 8 — Bedah Kode Lanjutan

Bagian 7 membedah alur transaksi sampai ke baris. Bagian 8 melanjutkan ke **semua file sisa** yang belum dibedah: berkas pendukung domain booking/payments/ticketing, domain lain satu per satu (auth, tickettype, analytics, audit, CMS, visitor, dsb.), infrastruktur (bootstrap, config, middleware, pkg, scheduler, gateway), lalu frontend (services, store, lib, hooks, halaman, komponen). Urutannya mengikuti arah pembacaan kode, bukan abjad.

Tingkat kedalaman tetap ditandai jujur: **baris-per-baris** untuk logika yang menentukan perilaku, **per-fungsi** untuk berkas yang isinya banyak boilerplate, **per-file** bila isinya hanya deklarasi.

## 8.1 `backend/internal/domain/booking/dto.go` — kontrak HTTP dan validasinya

```go
type CreateRequest struct {
	VisitDate string `json:"visit_date" validate:"required,len=10"`     // (1)
	Visitor   struct {
		Name  string `json:"name" validate:"required,min=2,max=150"`     // (2)
		Email string `json:"email" validate:"required,email,max=150"`
		Phone string `json:"phone" validate:"required,min=8,max=20"`
	} `json:"visitor" validate:"required"`
	Items []CreateItem `json:"items" validate:"required,min=1,max=20"`   // (3)
	Note  string       `json:"note" validate:"omitempty,max=500"`
}

type CreateItem struct {
	TicketID string `json:"ticket_id" validate:"required,len=36"`         // (4)
	Quantity int    `json:"quantity" validate:"required,min=1,max=50"`    // (5)
}
```

**(1)** `len=10` — validasi bentuk di lapisan HTTP, sementara pengecekan apakah tanggal itu benar-benar ada (31 Februari) dilakukan `service.Create` lewat `time.Parse`. Dua lapisan ini disengaja: validator menolak payload asal-asalan lebih awal; service tetap memvalidasi karena ia juga dipanggil dari jalur non-HTTP.

**(2)** Struct anonim untuk `visitor` membuat JSON-nya bersarang (`{"visitor":{"name":…}}`) tanpa perlu tipe tambahan. Konsekuensinya, tipe ini tidak bisa dipakai ulang di tempat lain — kalau nanti ada endpoint "edit data pengunjung", ia butuh tipe sendiri.

**(3)** `max=20` membatasi jumlah **baris** tiket, sedangkan `max=50` per baris membatasi jumlah **orang**. Batas total karena itu 1.000 tiket per pesanan, tetapi kapasitas katalog yang menjadi pembatas nyata.

**(4)** `len=36` mengasumsikan UUID. Kalau katalog tiket kelak memakai ID non-UUID, validasi ini harus dilonggarkan.

**(5)** Di sinilah `max=50` yang tidak ada di service berada. Jadi batas 50 memang ada — di lapisan validasi request, bukan di aturan domain. Ini penting saat menjawab pertanyaan "kenapa 50?": nilainya keputusan API, bukan keputusan bisnis inti.

```go
type BookingResponse struct {                 // (1)
	ID, UserID, BookingCode string
	VisitorName, Email, Phone string
	VisitDate string
	Items []ItemResponse
	Subtotal, Discount, ServiceFee, Tax, Total int64
	TotalTickets int
	Status, Note string
	CreatedAt, UpdatedAt string        // (2)
	CheckedInAt, CheckedInGate string
	Payment *PaymentView `json:"payment,omitempty"`   // (3)
}
```

**(1)** Bentuknya dikomentari "cocok satu-satu dengan tipe Booking frontend" (`frontend/types/domain.ts`). Setiap penambahan field di sini harus disertai penambahan di tipe frontend; kalau tidak, TypeScript akan mengabaikannya diam-diam.

**(2)** Waktu dikirim sebagai **string RFC3339**, bukan `time.Time`. Konversinya di `mapper.go`. Alasannya: frontend memformat sendiri (`date.ts`) dan tidak perlu menebak zona waktu dari objek Date yang diserialisasi.

**(3)** `PaymentView` hanya terisi bila `paymentReader` dikirim handler. Untuk endpoint yang tidak membutuhkannya, field ini hilang dari JSON (`omitempty`) — bukan `null`. Perbedaan `undefined` vs `null` ini terasa di frontend.

```go
type PaymentView struct {
	ID, BookingID, Method string
	Amount int64
	Status string
	CreatedAt, ExpiredAt time.Time    // (1)
}
```

**(1)** Di sini waktu tetap `time.Time` (bukan string), berbeda dari `BookingResponse`. Ketidakseragaman ini nyata: frontend menerima `created_at` booking sebagai string dan `expired_at` payment sebagai string ISO dari encoder Go, lalu mem-parse keduanya dengan `new Date(...)`. Tidak berbahaya, tapi menjelaskan kenapa tipe di `types/api.ts` terlihat berbeda.

```go
type CreateBookingResult struct {     // (1)
	Booking BookingResponse `json:"booking"`
	Payment *PaymentView    `json:"payment"`
}
```

**(1)** Inilah yang membuat frontend harus membaca `response.data.booking`, bukan `response.booking` (lihat 7.5.3). `Payment` boleh `nil` bila adapter gagal mengubah model — meski di alur normal selalu ada.

## 8.2 `backend/internal/domain/booking/entity.go` — model dan invariant yang ditulis di komentar

```go
type Base struct {
	ID        string         `gorm:"type:char(36);primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (b *Base) BeforeCreate(tx *gorm.DB) error {
	if b.ID == "" { b.ID = uuid.NewString() }
	return nil
}
```

**(1)** `char(36)` menyimpan UUID sebagai teks, bukan `binary(16)`. Lebih besar 20 byte per baris, tetapi terbaca saat debugging dan portabel antara SQLite dan MySQL.

**(2)** `BeforeCreate` menghasilkan UUID di aplikasi, bukan auto-increment DB. Keuntungan: ID sudah diketahui **sebelum** INSERT, sehingga `booking_items` bisa diisi dalam transaksi yang sama tanpa membaca balik.

**(3)** `DeletedAt` bertipe `gorm.DeletedAt` membuat semua query otomatis menambahkan `deleted_at IS NULL`. `json:"-"` menyembunyikannya dari API.

```go
BookingCode   string `gorm:"type:varchar(30);uniqueIndex;not null"`   // (1)
UserID        string `gorm:"type:char(36);index;not null"`            // (2)
VisitDate     string `gorm:"type:varchar(10);index;not null"`         // (3)
Status        string `gorm:"type:varchar(20);index;not null;default:PENDING"`
Subtotal, Discount, ServiceFee, Tax, Total int64 `gorm:"not null;default:0"`
CheckedInAt   *time.Time
CheckedInGate string `gorm:"type:varchar(100)"`
Items []BookingItem `gorm:"foreignKey:BookingID"`                     // (4)
```

**(1)** Indeks unik adalah pengaman terakhir kode booking; retry di service mengandalkannya.

**(2)** `not null` pada `UserID` berarti **tamu pun harus punya baris user** (dibuat lewat alur registrasi cepat). Booking tanpa login tetap memiliki `user_id`, hanya saja bukan akun yang pernah masuk. Ini menjelaskan kenapa `authorize` membandingkan string: tidak ada kasus `user_id` kosong di produksi.

**(3)** `varchar(10)` + `index` karena tanggal dipakai untuk filter laporan dan perbandingan string di ticketing.

**(4)** Relasi GORM tanpa `constraint` eksplisit: GORM tidak membuat foreign key di SQLite. Itu sebabnya `repository.Delete` menghapus dependen secara manual (8.7).

**(5)** Komentar di atas struct menuliskan diagram transisi (`PENDING → PAID → USED`, dst.). Diagram itu **tidak** ditegakkan di sini, melainkan di `service.SetStatus`/`MarkPaid`/`MarkExpired`. Kalau Anda menambah status baru, komentar ini dan `RevenueStatuses` harus diperbarui bersamaan.

```go
var RevenueStatuses = []string{StatusPaid, StatusConfirmed, StatusUsed}
```

**(1)** Satu-satunya definisi "status yang dihitung sebagai pendapatan", dipakai `SoldByTicketOn`, `SumRevenueBetween`, analytics, dan laporan. Menambah status pendapatan di sini otomatis memengaruhinya — hati-hati: kapasitas terjual juga ikut berubah.

## 8.3 `backend/internal/domain/booking/mapper.go` — konversi dan satu komentar yang menyesatkan

```go
func timestamps(b *Booking) (string, string) {
	return b.CreatedAt.Format(time.RFC3339), b.UpdatedAt.Format(time.RFC3339)
}
```

**(1)** `time.RFC3339` menghasilkan `2026-11-12T07:30:00+07:00`. Frontend mem-parse dengan `new Date()`, jadi zona waktu ikut terbawa. Kalau server berjalan di UTC (container), waktu yang dilihat pengunjung bergeser 7 jam kecuali frontend memformat ulang ke Asia/Jakarta.

```go
func toBookingResponsePtr(b *Booking, payment *PaymentView) *BookingResponse {
	createdAt, updatedAt := timestamps(b)
	resp := &BookingResponse{ ... Payment: payment }
	if b.CheckedInAt != nil {                       // (1)
		resp.CheckedInAt = b.CheckedInAt.Format(time.RFC3339)
		resp.CheckedInGate = b.CheckedInGate
	}
	return resp
}
```

**(1)** `CheckedInAt` di response bertipe `string` dengan `omitempty`, sedangkan di entity `*time.Time`. Nilai nol tidak boleh muncul sebagai `"0001-01-01T..."`, jadi pengecekan `nil` wajib. Ini contoh kecil kenapa mapper tidak bisa diganti `json.Marshal` langsung.

```go
// toBookingResponseList menambahkan snapshot pembayaran terbaru tiap booking lewat callback paymentReader
// (satu query terbatch agar endpoint daftar hanya dua query, bukan N+1).
func toBookingResponseList(ctx context.Context, bookings []Booking, paymentReader PaymentReader) []BookingResponse {
	for i := range bookings {
		var pv *PaymentView
		if paymentReader != nil { pv = paymentReader(ctx, bookings[i].ID) }   // (1)
		out = append(out, *toBookingResponsePtr(&bookings[i], pv))
	}
}
```

**(1)** Komentar menyebut "satu query terbatch", padahal callback dipanggil **di dalam loop** dan implementasi adapter menjalankan satu query per booking. Untuk 100 baris, ini 101 query. Fungsinya benar, komentarnya yang salah — dan komentar yang salah lebih berbahaya daripada tidak ada komentar, karena membuat orang berhenti memeriksa.

**(2)** `&bookings[i]` (bukan `&b` dari `range`) memastikan pointer menunjuk elemen slice. Kalau ditulis `for _, b := range bookings { toBookingResponsePtr(&b, ...) }`, semua baris bisa berbagi alamat variabel loop yang sama di Go versi lama.

## 8.4 `backend/internal/domain/booking/usecase.go` — lapisan yang hampir seluruhnya pass-through

```go
type Usecase struct {
	service *Service
	pricer  TicketPricer        // (1)
}
```

**(1)** Satu-satunya state yang dipegang usecase adalah `pricer`, karena `Service.Create` menerimanya per panggilan. Semua method lain hanya meneruskan. Lapisan ini ada bukan untuk logika, melainkan untuk **menjaga handler tetap tipis** dan memberi tempat menyuntikkan dependensi lintas domain tanpa mengotori service.

```go
func Validate(s interface{}) []response.FieldError {
	err := validate.Struct(s)
	if err == nil { return nil }
	for _, fe := range err.(validator.ValidationErrors) {
		out = append(out, response.FieldError{Field: fe.Field(), Message: fe.Field() + " is invalid"})
	}
}
```

**(1)** Pesan error yang dihasilkan generik: `"Email is invalid"`, memakai nama field Go (bukan nama JSON). Frontend menampilkannya apa adanya; karena itu pesan bisnis yang ramah selalu datang dari `apperror` di service, bukan dari sini.

**(2)** Type assertion `err.(validator.ValidationErrors)` aman karena validator selalu mengembalikan tipe itu untuk `Struct`. Kalau diganti `validate.Var`, assertion akan panic — jangan menyalin fungsi ini ke konteks lain tanpa menyesuaikannya.

```go
func (u *Usecase) ListToday(ctx context.Context, date string, page, limit int, reader PaymentReader) (...) {
	return u.service.ListByVisitDate(ctx, date, page, limit, reader)
}
```

**(1)** Nama method (`ListToday`) dan nama service (`ListByVisitDate`) berbeda karena `date` bisa tanggal apa pun, bukan hanya hari ini. Handler yang mengisi default hari ini bila query kosong.

**(2)** `GetResponse` memanggil `u.service.Get(..., nil)` — **tanpa** payment reader. Artinya respons yang disematkan `payments` ke `PaymentDetail.Booking` tidak memuat info pembayaran. Ini disengaja untuk menghindari query berulang (payment-nya sudah ada di level atas), tapi bisa mengejutkan bila frontend mengharapkan `booking.payment` terisi di sana.

## 8.5 `backend/internal/domain/booking/handler.go` — per handler

```go
func (h *Handler) Create(c *gin.Context) {
	var req CreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body", nil); return        // (1)
	}
	if errs := Validate(req); errs != nil {
		response.ValidationFailed(c, errs); return
	}
	result, err := h.usecase.CreateBooking(c.Request.Context(), middleware.CurrentUserID(c), req)
	if err != nil { apperror.WriteHTTP(c, err); return }                    // (2)
	response.Created(c, "booking created, proceed to payment", result)      // (3)
}
```

**(1)** Dua jenis kegagalan input dibedakan: JSON rusak → 400 generik; field tidak valid → 422 dengan daftar field. Frontend memakai perbedaan ini untuk menyorot input.

**(2)** `apperror.WriteHTTP` memetakan tipe error ke status dan kode (`BOOK_004`, dst.). Handler tidak pernah menulis `c.JSON(500, ...)` sendiri, sehingga bentuk error konsisten di seluruh API.

**(3)** Status **201 Created**, bukan 200. `booking.api.service.ts` tidak membedakannya (hanya membaca body), tapi klien lain bisa.

**(4)** `middleware.CurrentUserID(c)` bisa string kosong bila rute tidak mewajibkan auth. Rute booking memasang `requireAuth`, jadi di produksi selalu terisi; service tetap menangani string kosong sebagai booking tamu.

```go
func (h *Handler) Get(c *gin.Context) {
	privileged := middleware.HasRole(c, "ADMIN") || middleware.HasRole(c, "MANAGER")   // (1)
	result, err := h.usecase.Get(ctx, c.Param("id"), middleware.CurrentUserID(c), privileged, h.paymentReader)
	...
}
```

**(1)** `privileged` dihitung di handler karena hanya di sini informasi peran tersedia (dari context Gin). Service menerima boolean, bukan membaca JWT — pemisahan yang membuat service bisa diuji tanpa HTTP.

**(2)** Perhatikan `GetByCode` memakai aturan peran yang sama. Jadi pengunjung yang membuka `/bookings/code/...` tanpa login akan ditolak `BOOK_002` kecuali booking itu miliknya. Kalau produk menginginkan tautan pembayaran publik, handler ini yang harus diubah (mis. mengizinkan akses bila `booking.UserID == ""`).

```go
func (h *Handler) Delete(c *gin.Context) {
	if err := h.usecase.Delete(ctx, c.Param("id"), middleware.CurrentUserID(c), true); err != nil { ... }   // (1)
}
```

**(1)** `true` di-hardcode karena rute sudah dilindungi `RequireRole("ADMIN")`. Konsekuensinya, service tidak punya kesempatan menolak berdasarkan peran — semua bergantung pada konfigurasi rute. Ini beda dari `Cancel` yang menghitung `privileged`.

```go
func (h *Handler) ListMine(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))      // (1)
	limit, _ := strconv.Atoi(c.Query("limit"))
	...
}
```

**(1)** Error parsing diabaikan; query tidak valid menjadi `0`, lalu `clampPagination` mengubahnya menjadi halaman 1/limit 20. Ini pola yang konsisten di seluruh handler dan aman karena service selalu meng-clamp.

**(2)** `response.BuildMeta(page, limit, total)` memakai `page`/`limit` **mentah**, bukan hasil clamp. Jadi klien yang mengirim `limit=1000` mendapat `meta.limit = 1000` padahal data berisi 20 baris. Frontend yang menghitung jumlah halaman dari `meta` akan salah. Ini bug kecil yang nyata di lapisan response.

## 8.6 `backend/internal/domain/booking/routes.go` — peta rute dan satu jebakan

```go
bookings := rg.Group("/bookings", requireAuth)
bookings.POST("", h.Create)
bookings.GET("/mine", h.ListMine)
bookings.GET("/:id", h.Get)
bookings.GET("/code/:code", h.GetByCode)          // (1)
bookings.POST("/:id/cancel", h.Cancel)
bookings.DELETE("/:id", h.Cancel)                 // (2)
```

**(1)** Urutan rute penting di Gin: `/code/:code` didaftarkan **setelah** `/:id`. Gin memakai tree sendiri sehingga tidak bentrok, tetapi `GET /bookings/code` (tanpa segmen kedua) akan cocok ke `/:id` dengan `id="code"`. Karena `FindByID` mencari kolom `id = 'code'`, hasilnya 404 — bukan panic, tapi membingungkan saat mengetik manual.

**(2)** `DELETE /bookings/:id` dipetakan ke `Cancel`, **bukan** `Delete`. Jadi pengunjung yang "menghapus" booking sebenarnya membatalkannya. Frontend `bookingService.cancel()` memakai ini; `remove()` memakai `/admin/bookings/:id` yang benar-benar menghapus. Menukar keduanya akan membuat pengunjung bisa menghapus data permanen.

**(3)** Grup `reports` menerima `ADMIN`, `MANAGER`, dan `super_admin` (string huruf kecil). Grup `admin` menerima `ADMIN` dan `super_admin`. Perbedaan kapitalisasi `super_admin` vs `ADMIN` harus cocok dengan peran yang tersimpan di JWT; salah ketik berarti 403 yang sulit didiagnosis karena middleware membandingkan string persis.

## 8.7 `backend/internal/domain/booking/repository.go` — tempat invariant benar-benar ditegakkan

### 8.7.1 `CreateWithCapacity` — kapasitas, lock, dan SQLite

```go
var CapacityStatuses = []string{StatusPending, StatusPaid, StatusConfirmed, StatusUsed}   // (1)
var capacityMu sync.Mutex                                                                  // (2)
```

**(1)** Kapasitas dihitung dari booking `PENDING` **juga**, agar keranjang yang belum dibayar memesan kuota dan mencegah overselling saat dua orang membayar bersamaan. Bandingkan dengan `SoldByTicketOn` yang memakai `RevenueStatuses` — lihat 8.7.3; ketidakcocokan ini disengaja tetapi berimplikasi.

**(2)** `sync.Mutex` proses-lokal hanya untuk SQLite (dev/test) yang tidak punya `SELECT ... FOR UPDATE`. Di MySQL, row lock InnoDB dipakai. Catatan penting: kalau backend dijalankan **lebih dari satu instance** dengan SQLite, mutex ini tidak melindungi apa pun — untungnya SQLite tidak dipakai di produksi.

```go
ids := ...; sort.Strings(ids)                              // (1)
q := tx.Table("ticket_types").Select("id, capacity, is_active").Where("id IN ?", ids).Order("id ASC")
if tx.Dialector.Name() == "mysql" {
	q = q.Clauses(clause.Locking{Strength: clause.LockingStrengthUpdate})   // (2)
}
if len(rows) != len(ids) { return errTicketNotFound{} }     // (3)
```

**(1)** Mengurutkan ID sebelum lock membuat semua transaksi mengunci baris dalam urutan sama, sehingga tidak terjadi deadlock (A menunggu B sambil B menunggu A).

**(2)** `FOR UPDATE` menahan baris `ticket_types` sampai transaksi selesai. Inilah yang membuat pengecekan kapasitas benar-benar atomik di MySQL.

**(3)** Jumlah baris yang kembali harus sama dengan jumlah ID. Kalau ada ID yang tidak ada di katalog, transaksi dibatalkan dengan `errTicketNotFound` — bukan diam-diam menganggap kapasitas 0.

```go
sold, err := soldByTicketInTx(tx, b.VisitDate)               // (1)
for _, id := range ids {
	if sold[id]+int64(quantities[id]) > int64(capacity[id]) { return errCapacityExceeded{} }
}
if err := tx.Omit("Items").Create(b).Error; err != nil { return err }   // (2)
for i := range b.Items {
	b.Items[i].BookingID = b.ID
	if err := tx.Create(&b.Items[i]).Error; err != nil { return err }
}
```

**(1)** Penjualan dibaca **di dalam** transaksi yang sama, setelah lock. Tanpa lock, dua transaksi bisa membaca angka yang sama dan keduanya lolos.

**(2)** `Omit("Items")` mencegah GORM menyimpan asosiasi otomatis; item disimpan satu per satu agar `BookingID` dapat diisi setelah `b.ID` lahir. Ini juga yang membuat error pada item menggagalkan seluruh booking.

### 8.7.2 `TransitionStatus` — satu-satunya penulis status

```go
func (r *repository) TransitionStatus(ctx context.Context, id string, from []string, to string, extra map[string]interface{}) (bool, error) {
	updates := map[string]interface{}{"status": to}
	for k, v := range extra { updates[k] = v }        // (1)
	res := r.db.WithContext(ctx).Model(&Booking{}).
		Where("id = ? AND status IN ?", id, from).
		Updates(updates)
	return res.RowsAffected > 0, nil                   // (2)
}
```

**(1)** `extra` dipakai `SetCheckedIn` untuk menulis `checked_in_at` dan `checked_in_gate` dalam **satu** UPDATE. Kalau ditulis terpisah, ada jendela waktu di mana status `USED` tapi gate masih kosong.

**(2)** `RowsAffected > 0` adalah sinyal CAS. Pemanggil (`Cancel`, `SetStatus`, `MarkPaid`) selalu memeriksanya dan menerjemahkan `false` menjadi konflik 409.

**(3)** `Updates` dengan map tidak menyentuh `updated_at`? GORM tetap memperbaruinya otomatis karena model memiliki `UpdatedAt`. Jadi setiap transisi status mengubah `updated_at`, yang dipakai frontend untuk menampilkan "terakhir diperbarui".

### 8.7.3 `SoldByTicketOn` vs `CapacityStatuses` — inkonsistensi yang perlu diketahui

```go
func (r *repository) SoldByTicketOn(ctx context.Context, date string) (map[string]int64, error) {
	... Where("bookings.visit_date = ? AND bookings.status IN ?", date, RevenueStatuses)   // (1)
}
```

**(1)** Fungsi ini dipakai `service.Create` untuk pengecekan awal, dan hanya menghitung status pendapatan. Sementara `CreateWithCapacity` menghitung `PENDING` juga. Akibatnya:
- `Create` bisa **lolos** pengecekan awal (karena PENDING tidak dihitung), lalu **gagal** di `CreateWithCapacity` dengan `BOOK_006`. Bagi pengguna, pesannya tetap "tiket tidak tersedia" — benar, hanya datang dari tempat berbeda.
- Setelah pembayaran kedaluwarsa/sweeper membatalkan booking, kuota otomatis kembali (karena statusnya bukan `PENDING` lagi).

Ini bukan bug fatal, tapi menjelaskan kenapa hasil pengecekan harga/kapasitas di service tidak selalu sama dengan hasil akhir.

### 8.7.4 `Delete` — hapus permanen dengan dependen manual

```go
for _, table := range []string{"payments", "tickets", "booking_items"} {
	if !tx.Migrator().HasTable(table) { continue }                          // (1)
	if err := tx.Unscoped().Table(table).Where("booking_id = ?", id).Delete(nil).Error; err != nil { return err }
}
res := tx.Unscoped().Delete(&Booking{}, "id = ?", id)                       // (2)
```

**(1)** Pengecekan `HasTable` membuat fungsi ini aman di database uji yang hanya memigrasi sebagian tabel.

**(2)** `Unscoped()` menghapus baris sungguhan, bukan soft-delete. Karena itu pesan "dihapus permanen" di UI benar. Konsekuensi: audit lama yang menunjuk `target_id` booking itu akan menjadi referensi yatim — masih terbaca sebagai teks, tapi datanya tidak bisa dibuka.

### 8.7.5 Daftar, pencarian, dan agregasi

```go
func statusFilter(db *gorm.DB, status string) *gorm.DB {
	if status != "" { return db.Where("status = ?", status) }
	return db
}
```

**(1)** Filter status diterapkan sebelum `Count` dan `Find`, sehingga `total` konsisten dengan daftar. Kalau filter ditambahkan setelah `Count`, `meta.total` akan menghitung semua baris dan paginasi frontend kacau.

```go
like := "%" + search + "%"
q = q.Where("booking_code LIKE ? OR visitor_name LIKE ? OR email LIKE ?", like, like, like)
```

**(1)** Pencarian bebas di tiga kolom. Tanpa indeks teks penuh, `LIKE '%...%'` tidak bisa memakai indeks dan akan full-scan. Untuk data ratusan ribu baris, ini menjadi lambat — kandidat optimasi (indeks atau pencarian khusus).

**(2)** `search` tidak di-escape; `%` dan `_` yang diketik pengguna berfungsi sebagai wildcard. Bukan celah injeksi (parameter terikat), tetapi hasil pencarian bisa membingungkan.

```go
func (r *repository) StalePending(ctx context.Context, olderThan time.Time, limit int) ([]Booking, error) {
	return ... Where("status = ? AND created_at <= ?", StatusPending, olderThan).Order("created_at ASC").Limit(limit)
}
```

**(1)** Memakai `created_at`, bukan `expired_at` payment. Karena jendela pembayaran selalu 30 menit sejak pembuatan booking, keduanya hampir sama — tapi kalau `PaymentWindow` diubah menjadi lebih pendek dari waktu sweep, booking bisa disapu terlambat. `Order("created_at ASC")` memastikan yang paling lama diproses lebih dulu, sehingga tidak ada booking yang "kelaparan" saat antrean panjang.
## 8.8 `backend/internal/domain/payments/dto.go` — bentuk data yang dilihat frontend

```go
type PaymentDTO struct {
	ID, BookingID, Method string
	Amount int64
	Status string
	CreatedAt time.Time
	PaidAt    *time.Time `json:"paid_at,omitempty"`
	ExpiredAt time.Time
	MidtransRedirectURL string `json:"midtrans_redirect_url,omitempty"`   // (1)
}
```

**(1)** Nama field JSON sengaja **berbeda** dari field Go (`MidtransRedirect` di entity). Frontend membaca `payment.midtrans_redirect_url`; kalau nama JSON diubah, tombol "Buka Halaman Pembayaran" di `payment-panel.tsx` diam-diam hilang dan jatuh ke instruksi teks.

**(2)** `PaidAt *time.Time` dengan `omitempty` — pembayaran yang belum lunas tidak mengirim `paid_at` sama sekali, bukan `null`. Ini memudahkan frontend membedakan "belum ada" dari "waktu nol".

**(3)** `PaymentDTO` **tidak** memuat `midtrans_token`. Token itu hanya untuk memanggil snap.js di sisi klien dan sengaja tidak diekspos; yang dikirim hanya redirect URL. Kalau suatu saat snap.js dipakai, field baru harus ditambahkan eksplisit di sini.

```go
type PaymentDetail struct {
	PaymentDTO
	Ticket  *ticketing.TicketResponse `json:"ticket,omitempty"`     // (1)
	Booking *booking.BookingResponse  `json:"booking,omitempty"`
}
```

**(1)** Embedding `PaymentDTO` membuat field payment berada di **level atas** JSON, bukan di `detail.payment`. Jadi respons `/payments/booking/:id` berbentuk `{id, booking_id, …, ticket, booking}`. Ini yang membuat `paymentService.getByBookingId` bisa mengembalikan `Payment` langsung tanpa membongkar nested object.

**(2)** `ticket` dan `booking` diambil dengan error yang diabaikan (`if resp, err := ...; err == nil`). Bila booking gagal dimuat, field itu hilang dan pembayaran tetap tampil. Keputusan yang tepat untuk halaman yang harus tetap bisa menampilkan status bayar.

```go
type ProcessResult struct {
	Booking *booking.BookingResponse `json:"booking"`
	Payment PaymentDTO               `json:"payment"`
	Outcome string                   `json:"outcome"`   // SUCCESS | FAILED | EXPIRED
}
```

**(1)** Komentar mendokumentasikan tiga nilai yang mungkin, tetapi kode juga bisa mengembalikan `status` pembayaran apa adanya (`SetStatusByAdmin` memakai struct yang sama dengan `Outcome: status`, mis. `"REFUNDED"`). Frontend yang mengasumsikan hanya tiga nilai akan salah menafsirkan respons admin.

## 8.9 `backend/internal/domain/payments/usecase.go` — validasi request dan pembungkusan hasil

```go
type ProcessRequest struct {
	BookingID string `json:"booking_id" validate:"required,len=36"`
	Forced    string `json:"forced" validate:"omitempty,oneof=SUCCESS FAILED EXPIRED"`       // (1)
	Method    string `json:"method" validate:"omitempty,oneof=QRIS GOPAY OVO DANA SHOPEEPAY BCA_VA BNI_VA MANDIRI_VA BRI_VA CARD ALFAMART INDOMARET"`   // (2)
}
```

**(1)** `forced` hanya bisa tiga nilai. Field ini adalah pintu simulasi demo; di produksi service menolak seluruh endpoint, jadi nilainya tidak berbahaya. Kalau `demoMode` pernah aktif di produksi, `{"forced":"SUCCESS"}` akan memberi tiket gratis — ini alasan mengapa penjaga di service harus tetap ada meski UI tidak menampilkan field ini.

**(2)** Daftar metode di-tag `oneof` **dan** diulang di `entity.Methods`. Dua sumber kebenaran yang bisa berbeda; menambah metode hanya di satu tempat menghasilkan penolakan validasi yang tidak jelas. Idealnya tag dibangun dari `Methods`, tapi `validator` membutuhkan string literal.

```go
func (u *Usecase) Process(ctx context.Context, req ProcessRequest, requesterID string, privileged bool) (*ProcessResult, error) {
	resp, pay, outcome, err := u.service.Process(ctx, req.BookingID, requesterID, privileged, req.Forced, req.Method)
	if err != nil { return nil, err }
	return &ProcessResult{Booking: resp, Payment: toPaymentDTO(pay), Outcome: outcome}, nil
}
```

**(1)** Perhatikan service mengembalikan `*Payment` (model), usecase yang mengubahnya ke DTO. Ini pembagian yang konsisten: service bekerja dengan entitas, usecase/handler dengan bentuk API.

```go
func (u *Usecase) SetStatusByAdmin(ctx context.Context, paymentID, status string) (*ProcessResult, error) {
	pay, resp, err := u.service.SetStatusByAdmin(ctx, paymentID, status)
	...
	return &ProcessResult{Booking: resp, Payment: toPaymentDTO(pay), Outcome: status}, nil
}
```

**(1)** `Outcome` diisi status apa adanya (`PAID`, `REFUNDED`, …), bukan `"SUCCESS"`. Frontend admin yang memakai endpoint ini harus membaca `payment.status`, bukan `outcome`.

## 8.10 `backend/internal/domain/payments/handler.go` — peran dibedakan lebih ketat daripada booking

```go
func privilegedRead(c *gin.Context) bool  { return HasRole(c,"ADMIN") || HasRole(c,"MANAGER") }
func privilegedWrite(c *gin.Context) bool { return HasRole(c,"ADMIN") }        // (1)
```

**(1)** Manager boleh **membaca** detail pembayaran (untuk laporan) tetapi tidak boleh memproses atau mengakhiri. Ini berbeda dari booking, di mana manager dianggap `privileged` untuk pembacaan dan pembatalan. Kalau Anda menyatukan aturan peran lintas domain, perbedaan ini akan hilang — dan manager tiba-tiba bisa membatalkan pembayaran.

**(2)** `super_admin` tidak disebut di sini. Artinya akun `super_admin` **tidak** dianggap privileged oleh handler payments, meski middleware rute admin mungkin meloloskannya. Ini ketidakcocokan nyata yang perlu diuji bila peran itu dipakai.

```go
func (h *Handler) Process(c *gin.Context) {
	var req ProcessRequest
	if err := c.ShouldBindJSON(&req); err != nil { response.BadRequest(...); return }
	if errs := Validate(req); errs != nil { response.ValidationFailed(c, errs); return }
	result, err := h.usecase.Process(ctx, req, middleware.CurrentUserID(c), privilegedWrite(c))
	...
	response.OK(c, "payment processed", result)                                // (1)
}
```

**(1)** Status 200 meski `outcome` bisa `FAILED`. Kegagalan pembayaran adalah **hasil bisnis**, bukan kegagalan HTTP. Frontend memeriksa `res.outcome`, bukan status kode — persis yang dilakukan `payment-panel.tsx`.

```go
func (h *Handler) Expire(c *gin.Context) {
	bookingID := c.Query("booking_id")          // (1)
	if bookingID == "" { response.BadRequest(c, "booking_id query parameter is required", nil); return }
	...
}
```

**(1)** Parameter lewat **query string**, bukan body — cocok dengan `paymentService.expirePayment` yang memanggil `POST /payments/expire?booking_id=...`. Kalau frontend diubah mengirim JSON body, handler ini akan selalu 400.

```go
func (h *Handler) Webhook(c *gin.Context) {
	var req struct { OrderID, StatusCode, TransactionStatus, FraudStatus, SignatureKey, GrossAmount string }   // (1)
	if err := c.ShouldBind(&req); err != nil { response.BadRequest(c, "invalid webhook payload", nil); return }
	h.usecase.HandleMidtransWebhook(ctx, req.OrderID, ...)
	response.OK(c, "webhook processed", gin.H{"status": "ok"})
}
```

**(1)** `ShouldBind` (bukan `ShouldBindJSON`) menerima JSON **dan** form-urlencoded, karena Midtrans dapat mengirim keduanya. Tag `form` di struct aslinya mendukung ini. Mengganti ke `ShouldBindJSON` akan membuat notifikasi berbentuk form gagal di-parse.

**(2)** Rute webhook didaftarkan **di luar** grup `requireAuth` (`rg.POST("/payments/webhook", h.Webhook)`), sehingga bisa diakses tanpa token. Keamanannya sepenuhnya pada signature — dan karena itu `HandleMidtransNotification` menolak lebih dulu bila gateway tidak terkonfigurasi.

**(3)** Respons selalu `{"status":"ok"}` dengan 200 bila tidak ada error. Midtrans menghentikan retry hanya pada 2xx; mengembalikan 204 atau body kosong juga bekerja, tapi bentuk ini memudahkan logging.

## 8.11 `backend/internal/domain/payments/repository.go` — query yang menopang seluruh status

```go
func (r *repository) UpdateStatusIf(ctx, id string, from []string, status string, paidAt *time.Time) (bool, error) {
	res := ... Where("id = ? AND status IN ?", id, from).
		Updates(map[string]interface{}{"status": status, "paid_at": paidAt})    // (1)
	return res.RowsAffected > 0, nil
}
```

**(1)** `paid_at` selalu ikut ditulis, termasuk `nil` saat status menjadi `FAILED`/`EXPIRED`. Ini yang memastikan pembayaran yang gagal tidak menyisakan waktu lunas lama.

**(2)** Karena memakai map, GORM tetap memperbarui `updated_at`. Kolom lain tidak disentuh, jadi perubahan `method` oleh `Process` tidak tertimpa.

```go
func (r *repository) FindLatestByBooking(ctx, bookingID string) (*Payment, error) {
	... Where("booking_id = ?", bookingID).Order("created_at DESC").First(&p)
}
```

**(1)** Nama "Latest" menyiratkan banyak baris, tetapi `booking_id` ber-indeks unik sehingga hasilnya selalu paling banyak satu. `Order` dipertahankan sebagai sabuk pengaman bila constraint pernah dilepas.

**(2)** Mengembalikan `nil, nil` untuk not-found, bukan error. Semua pemanggil memeriksa `pay == nil`, sehingga "tidak ada pembayaran" tidak pernah dilaporkan sebagai 500.

```go
func (r *repository) ExpirePendingByBooking(ctx, bookingID string) (int64, error) {
	res := ... Where("booking_id = ? AND status IN ?", bookingID, []string{StatusPending, StatusProcessing, StatusFailed}).
		Update("status", StatusExpired)                                             // (1)
	return res.RowsAffected, res.Error
}
```

**(1)** Satu UPDATE untuk semua status non-final. Tidak memakai `UpdateStatusIf` per baris karena operasinya memang massal dan idempoten. `paid_at` **tidak** dikosongkan di sini — berbeda dari `UpdateStatusIf`. Untuk baris `FAILED` yang belum pernah lunas, nilainya sudah `NULL`; untuk `PENDING` juga. Jadi tidak ada efek samping nyata, tapi ketidakkonsistenan ini perlu diingat bila logika berubah.

```go
func (r *repository) CountPending(ctx) (int64, error)   { status IN (PENDING, PROCESSING) }
func (r *repository) SumPaidBetween(ctx, from, to)      { status = PAID AND DATE(paid_at) BETWEEN }
```

**(1)** `CountPending` menghitung dua status sekaligus — dipakai dashboard "pembayaran menunggu". Kalau `PROCESSING` dilupakan, angka dashboard lebih kecil dari kenyataan.

**(2)** `DATE(paid_at)` adalah fungsi SQL yang **tidak portabel** ke semua database (Postgres butuh cast). Proyek memakai SQLite/MySQL, jadi aman; catat ini bila pindah engine.

**(3)** `SumPaidBetween` hanya menghitung `PAID`, bukan `REFUNDED` yang dulu pernah `PAID`. Nilai `paid_at` tetap ada setelah refund, jadi total pendapatan bisa melebihi uang yang benar-benar diterima. Laporan yang lebih akurat harus mengurangi refund secara eksplisit.

## 8.12 `backend/internal/domain/ticketing/repository.go` — query scanner

```go
func (r *repository) MarkUsed(ctx, id string, at time.Time, gate string) (bool, error) {
	res := ... Model(&Ticket{}).
		Where("id = ? AND status = ?", id, TicketValid).
		Updates(map[string]interface{}{"status": TicketUsed, "checked_in_at": at, "checked_in_gate": gate})   // (1)
	return res.RowsAffected > 0, nil
}
```

**(1)** Inilah inti "sekali pakai". Syarat `status = 'VALID'` di WHERE membuat dua scan bersamaan hanya menghasilkan satu `RowsAffected = 1`; yang lain mendapat `false` dan pesan "sudah digunakan". Tidak ada `SELECT` lalu `UPDATE` — itu akan membuka balapan.

**(2)** `checked_in_at` dan gate ditulis bersama status dalam satu statement, sehingga tidak ada kondisi tiket `USED` tanpa jejak gate.

```go
func (r *repository) findBy(ctx, where string, arg interface{}) (*Ticket, error) {
	var t Ticket
	err := r.db.WithContext(ctx).Where(where, arg).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) { return nil, nil }
	...
}
func (r *repository) FindByID(...)        { return r.findBy(ctx, "id = ?", id) }
func (r *repository) FindByQR(...)        { return r.findBy(ctx, "qr_data = ?", qr) }
func (r *repository) FindByBookingID(...) { return r.findBy(ctx, "booking_id = ?", bookingID) }
```

**(1)** Satu helper untuk tiga lookup. `where` adalah string yang dibentuk **di dalam paket**, bukan dari input pengguna, jadi tidak ada risiko injeksi. `arg` selalu parameter terikat.

**(2)** Semua mengembalikan `nil, nil` saat tidak ditemukan. `GetByIDOrQR` bergantung pada perilaku ini: ia mencoba empat lookup berurutan dan berhenti saat ada yang tidak `nil`. Kalau salah satu mengembalikan error not-found, scanner akan menampilkan error 500 alih-alih "tiket tidak ditemukan".

```go
func (r *repository) ListByUserID(ctx, userID string) ([]Ticket, error) {
	... Joins("JOIN bookings ON bookings.id = tickets.booking_id").
		Where("bookings.user_id = ?", userID).Order("tickets.created_at DESC").Find(&tickets)
}
```

**(1)** Kepemilikan ditentukan lewat **join ke bookings**, bukan kolom `user_id` di tabel tickets (yang tidak ada). Artinya e-tiket selalu mengikuti pemilik booking; kalau booking dipindahkan ke pengguna lain, tiket ikut berpindah.

```go
func (r *repository) SetStatusForBooking(ctx, bookingID, status string) (int64, error) {
	return ... Model(&Ticket{}).Where("booking_id = ?", bookingID).Update("status", status).RowsAffected
}
```

**(1)** Mengembalikan jumlah baris yang berubah, meski pemanggil (`SyncStatusForBooking`) mengabaikannya. Berguna untuk diagnosis: booking tanpa tiket menghasilkan 0.

```go
func (r *repository) ListScans(ctx, offset, limit int, gate, petugasID, from, to string) ([]ScanRecord, int64, error)
```

**(1)** Filter dibangun kondisional: `gate`, `petugasID`, dan rentang `scanned_at`. Karena `from`/`to` berupa string tanggal, perbandingan bergantung pada format yang dikirim handler. Bila frontend mengirim `2026-11-12T00:00:00Z`, hasilnya bisa tidak sesuai harapan — periksa handler sebelum mengubah format.

## 8.13 `backend/internal/domain/ticketing/handler.go` — per rute

```go
func (h *Handler) Validate(c *gin.Context) {
	var req ValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil { ... }
	if errs := Validate(req); errs != nil { ... }
	result, err := h.usecase.ValidateTicket(ctx, req, middleware.CurrentUserID(c), middleware.CurrentUserName(c))   // (1)
	...
	response.OK(c, "ticket validation", result)      // (2)
}
```

**(1)** **Koreksi penting:** handler memakai `req.Petugas` dari body; hanya bila kosong ia memakai `middleware.CurrentUserID(c)`. Komentar di kode menyatakan JWT hanya membawa ID sehingga nama tampilan diambil dari request. Akibatnya nama petugas pada `scan_records`/`verifications` **bisa dipalsukan** (gate juga dari body), sementara `petugas_id` tetap aman karena berasal dari JWT.

**(2)** Selalu 200, termasuk saat tiket `INVALID`. Scanner membutuhkan hasil, bukan error HTTP. Hanya kegagalan sistem (DB) yang menjadi 500.

```go
func (h *Handler) GetByBooking(c *gin.Context) {
	bookingID := c.Param("bookingId")
	privileged := HasRole(c,"ADMIN") || HasRole(c,"MANAGER") || HasRole(c,"PETUGAS")   // (1)
	ok, err := h.usecase.CanAccess(ctx, bookingID, middleware.CurrentUserID(c), privileged)
	if err != nil { ... }
	if !ok { response.Forbidden(c, "Anda tidak memiliki akses.", nil); return }
	ticket, err := h.usecase.GetTicketByBooking(ctx, bookingID)
	...
}
```

**(1)** Petugas ikut privileged untuk **membaca** e-tiket, karena mereka perlu melihat detail saat scan bermasalah. Ini berbeda dari `booking.Get`, yang hanya menganggap ADMIN/MANAGER privileged — ketidakseragaman yang disengaja sesuai kebutuhan operasional.

**(2)** `CanAccess` dipanggil terpisah dari `GetTicketByBooking`, lalu handler memanggil usecase lagi. Dua round-trip: satu untuk otorisasi, satu untuk data. Bisa digabung, tapi pemisahan ini membuat aturan akses eksplisit di handler.

**(3)** Bila tiket belum diterbitkan (booking belum lunas), `GetTicketByBooking` mengembalikan `ErrTicketNotFound` (404). Frontend yang memanggil ini sebelum pembayaran selesai akan melihat error, bukan halaman kosong — perilaku yang benar.

## 8.14 `backend/internal/domain/ticketing/dto.go` — kontrak scanner

```go
type ValidateRequest struct {
	TicketID string `json:"ticket_id" validate:"required,min=4,max=120"`   // (1)
	Gate     string `json:"gate" validate:"omitempty,max=100"`
	Petugas  string `json:"petugas" validate:"omitempty,max=150"`          // (2)
}
```

**(1)** `min=4` cukup longgar untuk menerima UUID, `KPT-...`, atau payload JSON panjang (maks 120). Perhatikan bahwa payload JSON e-tiket bisa lebih dari 120 karakter bila berisi field lain; validasi ini akan menolaknya sebelum service sempat mem-parse.

**(2)** `Petugas` tidak dipakai untuk otorisasi (lihat 8.13), tapi tetap divalidasi agar body yang membengkak ditolak lebih awal.

```go
type TicketResponse struct {
	ID, BookingID, BookingCode, VisitorName, Email, VisitDate, TicketName string
	Quantity int
	Total int64
	Status string
	GeneratedAt time.Time
	CheckedInAt *time.Time `json:"checked_in_at,omitempty"`
	CheckedInGate string  `json:"checked_in_gate,omitempty"`
	QRData string         `json:"qr_data"`                                // (1)
}
```

**(1)** `qr_data` dikirim ke klien dan dipakai sebagai isi QR. Ini **bukan rahasia** dalam arti kriptografis — siapa pun yang memegangnya bisa memvalidasi tiket — tetapi juga bukan sesuatu yang boleh ditebak. Karena itu nilainya 9 byte acak.

**(2)** `CheckedInAt` berupa pointer agar tiket yang belum dipakai tidak mengirim waktu nol. Frontend memakai keberadaan field ini untuk menampilkan "sudah check-in".

```go
type MonitoringResponse struct {
	Totals     map[string]int64
	TotalValid int64
	ValidToday int64
	PerPetugas []MonitoringPetugasRow
	Hourly     []MonitoringHourlyRow
}
```

**(1)** `Totals` memetakan status → jumlah, termasuk `INVALID`. Dashboard bisa menampilkan berapa banyak percobaan ditolak, bukan hanya yang berhasil.

**(2)** `Hourly` selalu berisi 10 entri (jam 07–16), termasuk jam dengan `count: 0`. Grafik jadi stabil dan tidak "menyusut" pada hari sepi — pilihan UX yang disengaja.
## 8.15 `backend/internal/domain/auth/service.go` — kredensial, token, dan OAuth

### 8.15.1 Konstanta dan struktur

```go
const bcryptCost = 12                                       // (1)
const (
	verificationTokenTTL = 24 * time.Hour
	resetTokenTTL        = 1 * time.Hour                    // (2)
)

type Service struct {
	repo            Repository
	jwtManager      *jwtutil.Manager
	mailer          mailer.Mailer
	oauthCfg        config.GoogleOAuthConfig
	frontendURL     string
	log             *zap.Logger
	requireVerified bool                                    // (3)
}
```

**(1)** Cost 12 berarti ~250 ms per hash di CPU modern. Login terasa agak lambat, dan itu memang tujuannya: menaikkan biaya serangan brute-force. Jangan menurunkannya ke 4 "supaya test cepat"; turunkan hanya untuk test dengan build tag.

**(2)** Token verifikasi berlaku 24 jam, reset password 1 jam. Reset lebih pendek karena dampaknya lebih besar: siapa pun yang memegang tautan bisa mengganti password.

**(3)** `requireVerified` berasal dari config. Bila `false`, pengguna yang belum verifikasi email tetap bisa login — inilah yang membuat alur verifikasi bersifat opsional dan menjelaskan kenapa bug "login tidak mengecek IsVerified" mudah muncul saat konfigurasi berubah.

### 8.15.2 `CreateUser` dan `Authenticate`

```go
name  = validation.SanitizeInput(name)     // (1)
email = validation.SanitizeEmail(email)
phone = validation.SanitizePhone(phone)
exists, err := s.repo.ExistsByEmail(ctx, email)
if exists { return nil, ErrEmailAlreadyExists }
hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
user := &User{Name: name, Email: email, Phone: phone, PasswordHash: string(hash), IsActive: true}
```

**(1)** Normalisasi **sebelum** cek duplikat dan sebelum menyimpan. Tanpa ini, `A@x.com` dan `a@x.com` menjadi dua akun yang berbeda — masalah yang sulit diperbaiki setelah data masuk.

**(2)** `IsActive: true` sejak lahir; `IsVerified` tidak diisi sehingga bernilai `false`. Tidak ada pengiriman email verifikasi di sini (lihat catatan AUTH-07 di 8.15.7).

**(3)** Error dari `bcrypt.GenerateFromPassword` bisa terjadi bila password melebihi 72 byte. DTO sudah membatasi `max=72`, tapi pemeriksaan ulang tetap penting bila service dipanggil dari seed/CLI.

```go
func (s *Service) Authenticate(ctx context.Context, email, password string) (*User, error) {
	email = validation.SanitizeEmail(email)
	user, err := s.repo.FindUserByEmail(ctx, email)
	if user == nil { return nil, ErrInvalidCredentials }        // (1)
	if !user.IsActive { return nil, ErrAccountDeactivated }     // (2)
	if bcrypt.CompareHashAndPassword(...) != nil { return nil, ErrInvalidCredentials }
	if s.requireVerified && !user.IsVerified { return nil, ErrEmailNotVerified }
	return user, nil
}
```

**(1)** Email tidak dikenal dan password salah menghasilkan error yang **sama** (`ErrInvalidCredentials`), sehingga penyerang tidak bisa memetakan email mana yang terdaftar.

**(2)** Akun nonaktif dijawab berbeda. Ini kebocoran informasi kecil (menandakan email terdaftar), tetapi diperlukan agar pengguna tahu harus menghubungi admin, bukan mencoba password lain.

**(3)** `IsActive` diperiksa **sebelum** `bcrypt.CompareHashAndPassword`. Akun yang dinonaktifkan tidak menghabiskan 250 ms CPU, dan penyerang tidak bisa memakai waktu respons untuk menebak keberadaan akun.

### 8.15.3 `IssueTokenPair` dan cookie

```go
accessToken, expiresAt, err := s.jwtManager.GenerateAccessToken(user.ID, user.Email, roles)
refreshToken, refreshExpiresAt, err := s.jwtManager.GenerateRefreshToken(user.ID, user.Email, roles)
rt := &RefreshToken{UserID: user.ID, TokenHash: hashToken(refreshToken), ExpiresAt: refreshExpiresAt.Unix(), UserAgent: ua, IPAddress: ip}
if err := s.repo.CreateRefreshToken(ctx, rt); err != nil { ... }
return &AuthResponse{AccessToken: ..., RefreshToken: ..., ExpiresAt: expiresAt.Unix(), User: ...}
```

**(1)** Token dikembalikan **di body** sekaligus dipasang sebagai cookie oleh handler. Ini duplikasi yang disengaja untuk kompatibilitas klien non-browser (mobile/CLI), tetapi menimbulkan risiko: bila frontend menyimpan `access_token` ke `localStorage`, proteksi HttpOnly menjadi sia-sia. Frontend saat ini memakai cookie (lihat 7.5.2), jadi nilainya hanya informatif.

**(2)** Yang disimpan di DB adalah **hash SHA-256**, bukan token asli. Kalau database bocor, penyerang tidak bisa memakai refresh token yang tersimpan.

**(3)** `ExpiresAt` disimpan sebagai Unix detik, bukan `time.Time`. Format ini portabel dan mudah dibandingkan di SQL.

### 8.15.4 Rotasi refresh token

```go
claims, err := s.jwtManager.ParseRefreshToken(rawRefreshToken)     // (1)
stored, err := s.repo.FindValidRefreshToken(ctx, hash)
if stored == nil { return nil, "", "", ErrTokenRevoked }
consumed, err := s.repo.ConsumeRefreshToken(ctx, hash)             // (2)
if !consumed { return nil, "", "", ErrTokenRevoked }
user, err := s.repo.FindUserByID(ctx, claims.UserID)
if user == nil || !user.IsActive { return nil, "", "", ErrAccountDeactivated }
return user, stored.UserAgent, stored.IPAddress, nil
```

**(1)** Parse memverifikasi tanda tangan dan masa berlaku. Tanpa ini, token acak bisa dicoba-coba.

**(2)** `ConsumeRefreshToken` adalah `UPDATE ... SET revoked=true WHERE token_hash=? AND revoked=false AND expires_at>now`. Inilah rotasi sekali pakai: dua request dengan token sama, hanya satu yang mendapat `RowsAffected=1`. Yang kalah mendapat `ErrTokenRevoked` dan harus login ulang — perilaku yang benar, meski terasa kasar bila terjadi karena dua tab membuka bersamaan.

**(3)** `stored.UserAgent`/`IPAddress` dikembalikan agar token baru mencatat perangkat yang sama. Ini membuat daftar sesi (bila dibangun) konsisten.

### 8.15.5 Verifikasi email dan reset password

```go
func (s *Service) RequestEmailVerification(ctx context.Context, email string) error {
	user, err := s.repo.FindUserByEmail(ctx, normalized(email))
	if user == nil || user.IsVerified { return nil }        // (1)
	raw, err := s.issueToken(ctx, user.ID, PurposeVerifyEmail, verificationTokenTTL)
	link := s.frontendURL + "/verify-email?token=" + raw
	_ = s.mailer.Send(ctx, user.Email, "Verifikasi Email ", "Klik untuk verifikasi (berlaku 24 jam): "+link)  // (2)
	return nil
}
```

**(1)** Selalu `nil` untuk email tak dikenal atau sudah terverifikasi. Respons HTTP-nya juga seragam ("if the email exists..."), sehingga endpoint ini tidak bisa dipakai untuk memeriksa apakah seseorang terdaftar.

**(2)** Error pengiriman email **dibuang**. Bila SMTP mati, pengguna melihat "email terkirim" padahal tidak. Ini keputusan yang mengorbankan kejelasan demi kesederhanaan; idealnya error di-log (saat ini tidak).

**(3)** `issueToken` menandai token lama untuk purpose yang sama sebagai terpakai (`InvalidatePendingAuthTokens`), sehingga hanya tautan terbaru yang berlaku. Tanpa ini, pengguna yang menekan "kirim ulang" tiga kali punya tiga tautan aktif.

```go
consumed, err := s.repo.MarkAuthTokenUsed(ctx, token.ID)   // (1)
if !consumed { return ErrInvalidToken }
...
user.IsVerified = true
```

**(1)** Konsumsi token **sebelum** mengubah user. Dua request bersamaan dengan token yang sama: hanya satu yang berhasil menandai `used_at`. Urutan ini mencegah verifikasi ganda yang tidak berbahaya, tetapi lebih penting mencegah reset password ganda.

```go
func (s *Service) ResetPassword(ctx context.Context, rawToken, newPassword string) error {
	... FindValidAuthToken(...PurposeResetPassword)
	consumed := MarkAuthTokenUsed(token.ID)
	hash := bcrypt.GenerateFromPassword(newPassword, bcryptCost)
	user.PasswordHash = string(hash)
	_ = s.repo.RevokeAllRefreshTokens(ctx, user.ID)          // (1)
}
```

**(1)** Semua sesi dicabut setelah reset. Ini yang membuat "logout dari semua perangkat" berfungsi otomatis saat password direset — dan alasan pengguna harus login ulang setelahnya.

### 8.15.6 Google OAuth

```go
if !info.VerifiedEmail { return nil, ErrOAuthEmailUnverified }    // (1)
user, err := s.repo.FindUserByGoogleID(ctx, info.ID)
if user != nil { ... return user, nil }
existing, err := s.repo.FindUserByEmail(ctx, info.Email)
if existing != nil {
	existing.GoogleID = &info.ID
	existing.IsVerified = true                                     // (2)
	...
}
newUser := &User{Name: info.Name, Email: info.Email, GoogleID: &info.ID, IsVerified: true, IsActive: true}
```

**(1)** Hanya email yang sudah diverifikasi Google yang diterima. Tanpa cek ini, akun Google dengan email belum terverifikasi bisa dipakai mengambil alih akun lokal dengan alamat yang sama.

**(2)** Menautkan akun lokal yang sudah ada ke Google ID dan menandainya terverifikasi. Efek sampingnya: pengguna yang mendaftar dengan password lalu login Google tidak perlu verifikasi email — wajar, karena Google sudah membuktikannya.

**(3)** Akun baru dari Google tidak punya `PasswordHash`. Karena itu `ChangePassword` menolak dengan `ErrPasswordNotSet` (lihat di bawah).

```go
if user.PasswordHash == "" { return ErrPasswordNotSet }        // (1)
if bcrypt.CompareHashAndPassword(hash, currentPassword) != nil { return ErrCurrentPasswordWrong }
if bcrypt.CompareHashAndPassword(hash, newPassword) == nil { return ErrPasswordReused }
```

**(1)** Akun Google-only tidak bisa mengganti password karena tidak ada password lama untuk diverifikasi. Alternatifnya (mengizinkan set password tanpa verifikasi) membuka celah: siapa pun yang menguasai sesi bisa menambahkan password permanen.

**(2)** Password baru tidak boleh sama dengan yang lama. Pemeriksaan ini membandingkan hash, bukan string, sehingga tetap benar meski input memiliki spasi.

### 8.15.7 Catatan pada domain auth

1. **Registrasi tidak mengirim email verifikasi otomatis** — sesuai backlog AUTH-07 di `docker/backend-issues.yaml`. Pengguna harus menekan "kirim verifikasi" sendiri, dan bila `requireVerified=true`, mereka tidak bisa login sebelum itu.
2. **`UpdateProfile` tidak men-scanitasi `Name`** (hanya email/telepon). Karakter aneh tersimpan apa adanya; frontend meng-escape saat render, jadi tidak menjadi XSS, tapi data jadi kotor.
3. **Token dikirim di body dan cookie.** Klien yang menyimpan body token ke storage melemahkan perlindungan HttpOnly.
4. **`RefreshTokenPair` mengembalikan UA/IP lama**, bukan yang baru. Ini membuat jejak sesi tidak pernah berubah setelah login pertama.
5. **`RecordLogin` tidak mengembalikan error.** Login tetap sukses meski `last_login_at` gagal ditulis — pilihan yang benar, tapi dashboard "pengguna aktif" bisa meleset.

## 8.16 `backend/internal/domain/auth/dto.go` — bentuk request dan response

```go
Password string `validate:"required,min=8,max=72"`      // (1)
Phone    string `validate:"omitempty,max=20"`           // (2)
```

**(1)** `max=72` bukan angka sembarang: bcrypt hanya memproses 72 byte pertama. Tanpa batas ini, dua password berbeda yang 72 byte pertamanya sama akan dianggap identik. Untuk karakter non-ASCII, 72 byte bisa jauh lebih pendek dari 72 karakter.

**(2)** Telepon opsional saat registrasi tetapi wajib saat membuat booking (`booking.CreateRequest`). Artinya pengguna bisa mendaftar tanpa nomor, lalu terhalang di langkah pemesanan. Ini konsisten dengan alur "lengkapi data saat dibutuhkan", tapi perlu diketahui saat menguji registrasi.

```go
type AuthResponse struct {
	AccessToken string; RefreshToken string; ExpiresAt int64; User UserResponse
}
```

**(1)** `ExpiresAt` dalam Unix detik, bukan ISO string. Frontend menghitung sendiri kapan harus refresh; nilai ini juga dipakai handler untuk menentukan `Max-Age` cookie akses.

```go
type UserResponse struct {
	ID, Name, Email, Phone, Role, Gate, Shift string
	IsVerified bool
}
```

**(1)** `Role` berupa **satu** string, meski backend menyimpan peran di tabel terpisah. Untuk pengguna multi-peran, response hanya membawa peran utama. Frontend `role-home.ts` memetakan string ini ke halaman awal; pengguna dengan dua peran tidak bisa memilih dari data ini.

## 8.17 `backend/internal/domain/auth/entity.go` — tiga tabel

```go
PasswordHash string `gorm:"type:varchar(255)" json:"-"`      // (1)
GoogleID *string `gorm:"type:varchar(100);uniqueIndex" json:"-"`
```

**(1)** `json:"-"` memastikan hash tidak pernah keluar lewat respons apa pun, termasuk bila struct `User` dipakai langsung (mis. di log). Ini pertahanan yang harus dipertahankan saat menambah endpoint.

**(2)** `GoogleID` bertipe pointer agar akun non-Google menyimpan `NULL`. Indeks unik pada kolom nullable mengizinkan banyak `NULL` (di MySQL dan SQLite), sehingga tidak bentrok.

**(3)** `Gate` dan `Shift` ada di tabel `users`, bukan tabel petugas terpisah. Konsekuensinya, data operasional petugas bercampur dengan data akun; frontend memakai `user.gate` langsung untuk scan. Lihat 7.5.5 untuk implikasinya.

```go
type RefreshToken struct {
	TokenHash string `gorm:"type:varchar(255);not null"`
	ExpiresAt int64
	Revoked   bool `gorm:"default:false"`
	UserAgent, IPAddress string
}
```

**(1)** Tidak ada indeks unik pada `TokenHash` di tag (hanya `not null`). Praktisnya hash selalu unik, tetapi tanpa constraint, duplikasi karena bug tidak akan ditolak database.

**(2)** `Revoked` boolean, bukan timestamp. Akibatnya tidak ada catatan **kapan** token dicabut, sehingga audit "sesi ini berakhir karena logout atau karena rotasi?" tidak bisa dijawab dari tabel ini.

```go
type AuthToken struct {
	Purpose string `gorm:"type:varchar(30);not null;index"`
	TokenHash string
	ExpiresAt int64
	UsedAt *int64
}
```

**(1)** `Purpose` membedakan verifikasi email dan reset password. Tanpa kolom ini, token reset bisa dipakai untuk memverifikasi email (dan sebaliknya) — pemisahan domain yang penting.

**(2)** `UsedAt *int64` memungkinkan token sekali pakai; `FindValidAuthToken` mensyaratkan `used_at IS NULL`.

## 8.18 `backend/internal/domain/auth/handler.go` — cookie, OAuth state, dan respons seragam

```go
func setAuthCookies(c *gin.Context, res *AuthResponse) {
	secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")   // (1)
	sameSite := http.SameSiteLaxMode
	if secure { sameSite = http.SameSiteNoneMode }
	accessTTL := int(time.Until(time.Unix(res.ExpiresAt, 0)).Seconds())
	if accessTTL < 60 { accessTTL = 60 }
	c.SetCookie(AccessCookieName, res.AccessToken, accessTTL, "/", "", secure, true)                 // (2)
	c.SetCookie(RefreshCookieName, res.RefreshToken, 7*24*60*60, "/api/v1/auth", "", secure, true)   // (3)
}
```

**(1)** Deteksi HTTPS dari TLS langsung **atau** header proxy. Di belakang reverse proxy (Docker/nginx), `c.Request.TLS` selalu nil; tanpa header ini, cookie tidak `Secure` dan SameSite tetap Lax.

**(2)** Cookie akses `HttpOnly` + `Secure` (bila HTTPS), path `/`. Ini yang membuat `middleware.ts` bisa membacanya (middleware server tetap bisa membaca cookie HttpOnly) sementara JavaScript halaman tidak.

**(3)** Cookie refresh dibatasi ke path `/api/v1/auth`, sehingga tidak dikirim pada setiap request API. Ini mengurangi permukaan serangan dan ukuran header.

**(4)** `Max-Age` refresh **di-hardcode 7 hari**, sementara masa berlaku JWT refresh ditentukan `jwtutil`. Kalau TTL JWT diubah menjadi 30 hari, cookie tetap mati di hari ke-7 — pengguna ter-logout lebih cepat dari yang diharapkan. Sebaliknya, memperpanjang cookie tanpa memperpanjang JWT menghasilkan cookie yang menunjuk token kedaluwarsa.

```go
func (h *Handler) Refresh(c *gin.Context) {
	var req RefreshRequest
	_ = c.ShouldBindJSON(&req)                                    // (1)
	if req.RefreshToken == "" {
		if cookie, err := c.Cookie(RefreshCookieName); err == nil { req.RefreshToken = cookie }
	}
	if req.RefreshToken == "" { clearAuthCookies(c); response.Unauthorized(...); return }
	result, err := h.usecase.Refresh(ctx, req.RefreshToken)
	if err != nil { clearAuthCookies(c); apperror.WriteHTTP(c, err); return }
	setAuthCookies(c, result)
}
```

**(1)** Error bind diabaikan karena body boleh kosong (klien browser hanya mengandalkan cookie). Ini sebabnya `client.ts` mengirim `{}` dengan `Content-Type: application/json` — agar `ShouldBindJSON` tidak gagal karena body kosong.

**(2)** Setiap kegagalan refresh **menghapus cookie**. Ini mencegah loop: cookie rusak tidak akan dicoba berulang kali oleh `apiClient`.

```go
func (h *Handler) GoogleLogin(c *gin.Context) {
	state, _ := randomOAuthState()                                 // (1)
	url, err := h.usecase.GoogleAuthURL(state)
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(oauthStateCookie, state, 600, "/", "", c.Request.TLS != nil, true)
	c.Redirect(http.StatusTemporaryRedirect, url)
}
```

**(1)** State 32 byte acak disimpan di cookie HttpOnly dan dikirim ke Google. Pada callback, nilainya dibandingkan dengan `subtle.ConstantTimeCompare`. Tanpa langkah ini, penyerang bisa memaksa korban login ke akun penyerang (login CSRF).

**(2)** `Max-Age` 600 detik (10 menit) cukup untuk menyelesaikan consent screen. Setelah callback, cookie dihapus dengan `SetCookie(..., -1, ...)`.

**(3)** Callback mengembalikan **JSON**, bukan redirect ke frontend. Artinya setelah consent, pengguna melihat respons JSON di browser kecuali frontend membuka OAuth di popup dan menangkap hasilnya. Ini keputusan desain yang perlu diketahui saat menguji alur Google.

## 8.19 `backend/internal/domain/auth/repository.go` — CAS untuk sesi dan token

```go
func (r *repository) ConsumeRefreshToken(ctx, hash string) (bool, error) {
	res := ... Where("token_hash = ? AND revoked = ? AND expires_at > ?", hash, false, now).
		Update("revoked", true)
	return res.RowsAffected > 0, res.Error
}
```

**(1)** Satu UPDATE yang sekaligus memeriksa validitas dan mencabut token. Inilah implementasi "sekali pakai". Memisahkannya menjadi `SELECT` lalu `UPDATE` akan membuka balapan yang memungkinkan satu refresh token menghasilkan dua sesi.

```go
func (r *repository) FindValidAuthToken(ctx, hash, purpose string) (*AuthToken, error) {
	... Where("token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?", ...)
}
func (r *repository) MarkAuthTokenUsed(ctx, id string) (bool, error) {
	res := ... Where("id = ? AND used_at IS NULL").Update("used_at", now)
	return res.RowsAffected > 0, res.Error
}
```

**(1)** Pola yang sama: SELECT untuk menemukan, lalu UPDATE bersyarat untuk mengonsumsi. Bila dua request lolos SELECT, hanya satu yang berhasil UPDATE.

**(2)** `InvalidatePendingAuthTokens` menandai semua token dengan purpose sama sebagai terpakai. Ini yang membuat tautan verifikasi lama mati saat pengguna meminta tautan baru — penting karena email lama mungkin sudah diteruskan ke orang lain.

```go
func (r *repository) UpdateUser(ctx, user *User) error { return r.db.Save(user).Error }
```

**(1)** `Save` menulis **semua** kolom. Risiko: dua proses yang mengubah user bersamaan (mis. ganti password dan verifikasi email) bisa saling menimpa. Untuk auth, jendelanya kecil, tetapi pola ini tidak boleh dipakai untuk operasi yang sering bersamaan (mis. `last_login_at` sudah dipisah ke `TouchLastLogin` dengan `Update` satu kolom — contoh yang benar).
## 8.20 `backend/internal/middleware/auth.go` — autentikasi ganda dan CSRF

```go
if header := c.GetHeader("Authorization"); strings.HasPrefix(header, "Bearer ") {
	token = strings.TrimPrefix(header, "Bearer ")
} else if cookie, err := c.Cookie(AccessCookieName); err == nil && cookie != "" {
	token = cookie
	fromCookie = true                                     // (1)
}
if token == "" { response.Unauthorized(...); c.Abort(); return }
claims, err := jwtManager.ParseAccessToken(token)
if err != nil { response.Unauthorized(...); c.Abort(); return }
```

**(1)** Header diutamakan di atas cookie. Ini penting untuk alat seperti curl/Postman dan untuk request server-ke-server yang tidak membawa cookie. Konsekuensinya, klien yang mengirim header **dan** cookie akan memakai header — termasuk saat header itu sudah kedaluwarsa sementara cookie masih segar. Frontend tidak mengirim header, jadi tidak terpengaruh.

**(2)** `fromCookie` dicatat karena hanya autentikasi cookie yang rentan CSRF. Token di header tidak bisa dipicu otomatis oleh form lintas situs.

```go
if fromCookie && isMutatingMethod(c.Request.Method) && c.GetHeader("X-Requested-With") != "XMLHttpRequest" {
	response.Forbidden(c, "Permintaan tidak valid.")
	c.Abort()
	return
}
```

**(1)** Inilah seluruh perlindungan CSRF: request yang mengubah data dan diautentikasi lewat cookie wajib menyertakan header `X-Requested-With: XMLHttpRequest`. Form HTML biasa tidak bisa menambahkan header ini, dan penyerang tidak bisa membacanya karena same-origin policy.

**(2)** `apiClient` menambahkan header itu pada **setiap** request (termasuk GET), jadi frontend selalu lolos. Kalau suatu saat ada pemanggilan `fetch` manual tanpa header ini, POST-nya akan 403 meski sesi valid — penyebab kebingungan yang berulang.

**(3)** Metode `GET`/`HEAD` tidak diperiksa. Ini aman **selama** tidak ada endpoint GET yang mengubah data. Saat ini tidak ada; menambahkannya akan membuka celah CSRF lewat `<img src>`.

```go
func RequireRole(allowed ...string) gin.HandlerFunc {
	allowedSet := ... ToUpper(r) ...
	for _, r := range roles { if _, ok := allowedSet[strings.ToUpper(r)]; ok { c.Next(); return } }
	response.Forbidden(...)
}
```

**(1)** Perbandingan tanpa membedakan huruf besar/kecil, sehingga `"super_admin"` di rute cocok dengan `"SUPER_ADMIN"` di token. Ini yang membuat perbedaan kapitalisasi di `routes.go` tidak menjadi masalah di middleware — tetapi tetap menjadi masalah di handler yang memakai `HasRole` (yang juga `EqualFold`, jadi sebenarnya aman).

**(2)** `rolesRaw.([]string)` bisa gagal bila token tidak membawa array (mis. token lama). Kegagalan itu menghasilkan slice kosong → 403, bukan panic. Perilaku gagal-tertutup yang benar.

**(3)** Peran diambil dari **token**, bukan database. Kalau admin menurunkan peran seseorang, orang itu tetap memegang peran lama sampai access token kedaluwarsa (default 15 menit) dan refresh menghasilkan token baru. Ini jendela eskalasi hak yang perlu diketahui.

## 8.21 `backend/pkg/response/response.go` — satu envelope untuk semua endpoint

```go
type Envelope struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Meta    *Meta       `json:"meta,omitempty"`
	Errors  interface{} `json:"errors,omitempty"`
}
```

**(1)** Semua respons sukses memakai bentuk ini, sehingga frontend hanya perlu satu tipe (`ApiResponse<T>` di `lib/api.ts`). `omitempty` pada `Data` berarti endpoint tanpa data (mis. logout) tidak mengirim `"data": null`.

**(2)** `Meta` hanya dikirim endpoint berhalaman. Karena pointer, `nil` hilang dari JSON — frontend memeriksa `response.meta?.total`.

```go
func BuildMeta(page, limit int, total int64) *Meta {
	if page < 1 { page = 1 }
	if limit < 1 { limit = 20 }
	totalPages := int((total + int64(limit) - 1) / int64(limit))
	return &Meta{Page: page, Limit: limit, Total: total, TotalPages: totalPages}
}
```

**(1)** Perhatikan: `page`/`limit` di sini adalah nilai yang **dikirim handler**, bukan hasil `clampPagination` di service. Handler meneruskan `page, limit` mentah dari query. Jadi untuk `limit=1000`, `meta.limit` tetap 1000 sementara data berisi 20 baris, dan `total_pages` dihitung dengan 1000 sehingga angkanya terlalu kecil.

**(2)** Rumus `(total + limit - 1) / limit` adalah ceiling division integer. Untuk `total=0`, hasilnya 0 — frontend harus memperlakukan 0 halaman sebagai satu halaman kosong agar tombol "sebelumnya" tidak aneh.

**(3)** Tidak ada batas atas `limit` di sini. Batas 100 ada di service; `BuildMeta` hanya menormalkan nilai < 1. Ini sumber ketidakcocokan meta vs data yang disebut di (1).

## 8.22 `backend/pkg/apperror/http.go` — satu tempat memetakan error ke HTTP

```go
ae, ok := As(err)
if !ok {
	serverError(c, "", err)
	c.JSON(http.StatusInternalServerError, errorBody{...})
	return
}
if ae.Kind == KindInternal { serverError(c, ae.Code, ae.Err) }
status := statusFor(ae.Kind)
if ae.Code != "" { c.JSON(status, errorBody{Success:false, Message: ae.Message, Code: ae.Code}); return }
```

**(1)** Error yang bukan `apperror` selalu menjadi 500 dengan pesan generik. Detail asli hanya masuk log. Ini mencegah kebocoran nama tabel/SQL ke pengguna.

**(2)** Hanya `KindInternal` yang di-log. Error bisnis (404, 409, 422) tidak dicatat — sengaja, agar log tidak banjir oleh permintaan pengguna yang wajar. Konsekuensinya, "kenapa pengguna ini terus mendapat 409" tidak terlihat di log; ia hanya terlihat di audit domain terkait.

**(3)** Dua bentuk body: dengan `code` (`BOOK_006`) dan tanpa `code` (memakai helper `response.*`). Frontend saat ini hanya membaca `message`, jadi perbedaan bentuk tidak terasa — tetapi klien yang ingin menangani kode tertentu harus siap pada kedua bentuk.

**(4)** `KindValidation` dipetakan ke **422**, bukan 400. Ini konsisten dengan `ValidationFailed` di response. Bedanya: 422 dari apperror tidak membawa `errors[]` per-field, hanya pesan.

```go
func serverError(c *gin.Context, code string, err error) {
	fields := []zap.Field{ zap.String("method", ...), zap.String("path", ...), zap.String("code", code) }
	if err != nil { fields = append(fields, zap.Error(err)) }
	logger.L().Error("internal error", fields...)
}
```

**(1)** Log memuat method, path, dan kode domain. Tanpa `path`, sulit mengetahui endpoint mana yang gagal saat ada beberapa error bersamaan.

**(2)** `logger.L()` adalah logger global. Domain yang punya `*zap.Logger` sendiri (booking/payments) mencatat lewat logger itu; error yang lolos ke `WriteHTTP` tetap tercatat di sini. Dua jalur log ini menjelaskan kenapa sebagian error muncul dua kali.

## 8.23 `backend/pkg/jwtutil/jwtutil.go` — token, klaim, dan pengamanan algoritma

```go
type Claims struct {
	UserID string   `json:"uid"`
	Email  string   `json:"email"`
	Roles  []string `json:"roles"`
	jwt.RegisteredClaims
}
```

**(1)** `uid` adalah klaim yang dibaca `middleware.ts` di edge (`payload.uid`). Mengganti nama JSON-nya akan membuat middleware menganggap semua sesi tidak valid dan mengalihkan pengguna ke login.

**(2)** `Roles` disematkan di token. Ini yang membuat otorisasi tidak perlu query DB per request, dengan konsekuensi staleness peran (lihat 8.20).

```go
claims := Claims{ ... RegisteredClaims: jwt.RegisteredClaims{
	Issuer: m.issuer, ID: jti, Subject: userID,
	IssuedAt: now, NotBefore: now, ExpiresAt: expiresAt,
}}
token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
```

**(1)** `jti` acak 16 byte membuat setiap token unik meski diterbitkan pada detik yang sama untuk pengguna yang sama. Tanpa ini, dua login beruntun bisa menghasilkan token identik, dan pencabutan berbasis `jti` tidak mungkin dilakukan.

**(2)** `NotBefore = now` mencegah token dipakai sebelum waktunya bila jam klien/server bergeser. `WithExpirationRequired` di sisi parse menolak token tanpa `exp`.

```go
token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
	if t.Method.Alg() != jwt.SigningMethodHS256.Alg() { return nil, ErrInvalidToken }
	return secret, nil
}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(m.issuer), jwt.WithExpirationRequired())
```

**(1)** Dua lapis pemeriksaan algoritma: di callback **dan** `WithValidMethods`. Ini menutup serangan `alg: none` dan "alg confusion" (RS256→HS256) yang klasik. Jangan menghapus salah satunya dengan alasan "sudah dicek di tempat lain".

**(2)** Access dan refresh memakai **secret berbeda**. Kalau sama, refresh token bisa dipakai sebagai access token (dan sebaliknya), sehingga masa berlaku 7 hari bocor ke token yang seharusnya 15 menit.

**(3)** `WithIssuer` memastikan token dari aplikasi lain (dengan secret sama, mis. staging) tidak diterima. Ini penting bila beberapa environment berbagi kode.

**(4)** `ParseRefreshToken` tidak memeriksa apakah token ada di DB — itu tugas `FindValidRefreshToken`. Jadi token yang valid secara kriptografis tetapi sudah dicabut tetap lolos parse, lalu ditolak di langkah berikutnya.
## 8.24 `backend/internal/domain/tickettype` — katalog dan kapasitas

### 8.24.1 Entity dan status

```go
Code     string `gorm:"type:varchar(30);uniqueIndex;not null"`
Capacity int    `gorm:"not null;default:0"`
IsActive bool   `gorm:"not null;index"`
CreatedBy, UpdatedBy string `gorm:"type:char(36)"`
```

**(1)** `Capacity` adalah kuota **per hari**, bukan stok total. Booking membandingkannya dengan penjualan pada `visit_date` tertentu (8.7.1). Tidak ada tabel kuota per tanggal; kapasitas dianggap sama setiap hari.

**(2)** `IsActive` boolean, sementara API memakai string `AKTIF`/`NONAKTIF`. Konversinya di `parseStatus`; tidak ada kolom status terpisah.

**(3)** `Code` unik, dipakai URL `/tickets/code/:code` dan sebagai identitas yang stabil saat harga berubah.

```go
const (
	StatusActive   = "AKTIF"
	StatusInactive = "NONAKTIF"
)
var Categories = []string{"ENTRANCE", "SUNRISE", "TRANSPORT", "PACKAGE", "ACTIVITY", "SERVICE"}
```

**(1)** Status berbahasa Indonesia, berbeda dari domain lain (`PENDING`, `PAID`). Ini kosakata API, bukan nilai kolom; frontend harus mengirim `"AKTIF"`, bukan `"ACTIVE"`.

**(2)** Kategori adalah daftar tertutup di kode (`validCategory`), bukan tabel. Menambah kategori berarti deploy ulang, dan frontend harus ikut diperbarui agar filter menampilkannya.

### 8.24.2 `Create`, `Update`, dan pembuatan kode

```go
if req.Price <= 0 { return nil, invalidPrice() }        // (1)
if req.Capacity <= 0 { return nil, invalidCapacity() }
if !validCategory(req.Category) { return nil, ErrInvalidCategory }
status, err := parseStatus(req.Status)
code := strings.ToUpper(strings.TrimSpace(req.Code))
if code == "" { code = generateCode(req.Name) }
existing, err := s.repo.FindByCode(ctx, code)
if existing != nil { return nil, ErrCodeExists }        // (2)
```

**(1)** Harga dan kapasitas harus > 0. Tidak ada batas atas; angka yang salah ketik (mis. 1.000.000.000) akan diterima dan membuat booking sangat mahal. Untuk data operasional, validasi kewajaran bisa ditambahkan.

**(2)** Kode yang disediakan manual dicek keunikannya lebih dulu, tetapi tetap ada jendela balapan; indeks unik di DB adalah pengaman terakhir. Berbeda dari booking, di sini tidak ada retry: pengguna menerima `ErrCodeExists` dan harus memilih kode lain.

```go
func generateCode(name string) string {
	base := "TKT-"
	n := strings.ToUpper(name)
	for _, r := range n { if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') { base += string(r) } }
	if len(base) > 14 { base = base[:14] }
	return fmt.Sprintf("%s-%04d", base, len(name)%10000)
}
```

**(1)** Kode dibentuk dari huruf/angka nama, dipotong 14 karakter, lalu diberi sufiks `len(name)%10000`. Sufiks ini **bukan** penghitung unik: dua tiket dengan nama sepanjang sama menghasilkan kode identik. Jadi `generateCode` tidak menjamin keunikan — pemeriksaan `FindByCode` di `Create` yang menangkap tabrakan, dan pengguna diminta mengganti kode.

**(2)** Pemotongan memakai byte; nama dengan karakter non-ASCII bisa terpotong di tengah. Hasilnya hanya kode internal, jadi tidak fatal, tetapi bisa menghasilkan karakter aneh.

**(3)** `Update` **tidak** mengubah `Code`. Kode harus stabil agar tautan dan referensi lama tetap bekerja; menggantinya berarti pesanan lama menunjuk tiket yang "berbeda".

### 8.24.3 `GetMany` — N+1 yang disengaja (atau setengah disengaja)

```go
func (s *Service) GetMany(ctx context.Context, ids []string) ([]TicketType, error) {
	for _, id := range ids {
		t, err := s.repo.FindByID(ctx, id)        // (1)
		...
		out = append(out, *t)
	}
}
```

**(1)** Komentar menyebut "sekumpulan ID dalam satu panggilan", tetapi implementasinya satu query per ID. Untuk booking dengan 5 jenis tiket, ini 5 query tambahan sebelum transaksi. Menggantinya dengan `WHERE id IN ?` mudah dan aman karena urutan hasil tidak penting (pemanggil memetakan berdasarkan ID).

**(2)** Jika salah satu ID tidak ditemukan, seluruh panggilan gagal `ErrNotFound`. Ini yang membuat `booking.Create` menolak pesanan bila ada tiket yang sudah dihapus.

### 8.24.4 `withAvailability` dan arti "tersedia"

```go
today := time.Now().Format("2006-01-02")
sold := h.sales.SoldByTicketOn(c.Request.Context(), today)     // (1)
avail := items[i].Capacity - int(s)
if avail < 0 { avail = 0 }
```

**(1)** `available` dihitung untuk **hari ini**, bukan tanggal yang dipilih pengunjung. Endpoint katalog tidak menerima parameter tanggal, sehingga angka "tersisa" di halaman paket selalu mengacu hari ini. Saat pengunjung memilih tanggal lain, angka itu tidak berlaku — validasi sebenarnya tetap di `booking.Create`.

**(2)** Adapter `SalesCounter` mengembalikan `map` tanpa error (lihat interface), sehingga kegagalan query penjualan menjadi peta kosong dan `available` = kapasitas penuh. Artinya saat database bermasalah, katalog menampilkan "tersedia" untuk semua tiket. Untuk tampilan ini dapat diterima (booking tetap ditolak), tapi jangan dipakai untuk keputusan stok.

**(3)** `clampPage` mengembalikan `(limit, offset)` — urutan terbalik dari `booking.clampPagination` yang mengembalikan `(offset, limit)`. Pemanggil di sini sudah benar, tetapi menyalin fungsi antar domain tanpa membaca urutannya adalah sumber bug klasik.

## 8.25 `backend/internal/domain/analytics` — angka yang dilihat manajemen

### 8.25.1 `ResolveRange` — preset dan rentang kustom

```go
before := func(iso string, n int) string { return day(iso).AddDate(0,0,-n).Format("2006-01-02") }
```

**(1)** `day()` mengabaikan error parse, sehingga string tidak valid menjadi `time.Time{}` (tahun 1). Perhitungan `before` lalu menghasilkan tanggal yang tidak masuk akal, bukan error. Karena input datang dari query pengguna, sebaiknya format divalidasi lebih dulu.

```go
case "30d":
	return &Range{From: before(today,29), To: today, Label: "30 hari terakhir",
		PrevFrom: before(today,59), PrevTo: before(today,30)}
```

**(1)** Rentang pembanding dihitung sebagai 30 hari tepat sebelum rentang aktif. Ini yang membuat persentase perubahan bermakna: membandingkan 30 hari dengan 30 hari, bukan dengan "bulan lalu" yang panjangnya berbeda.

```go
case "month":
	first := time.Date(d.Year(), d.Month(), 1, 0,0,0,0, time.Local)
	prevFirst := first.AddDate(0,-1,0); prevLast := first.AddDate(0,0,-1)
```

**(1)** `time.Local` berarti batas bulan mengikuti zona waktu server. Di container UTC, "bulan ini" mulai pukul 07:00 WIB tanggal 1 — selisih yang terlihat pada laporan harian di awal bulan.

```go
n := int(day(to).Sub(day(from)).Hours()/24) + 1
if n < 1 { return nil, apperror.Validation("Tanggal selesai tidak boleh sebelum tanggal mulai.") }
```

**(1)** Selisih dihitung dalam jam lalu dibagi 24. Karena `time.Parse` menghasilkan UTC tanpa DST, hasilnya konsisten. Kalau nanti memakai `time.Local` dengan DST, pembagian ini bisa menghasilkan 0 untuk rentang 23 jam.

### 8.25.2 `ManagerAnalytics` — total akurat, tren diaproksimasi

```go
days := int(dayOf(r.To).Sub(dayOf(r.From)).Hours()/24) + 1
buckets := days; if buckets > 31 { buckets = 31 }
step := int(math.Ceil(float64(days)/float64(buckets)))
for i := 0; i < days; i += step {
	bucketDate := dayOf(r.From).AddDate(0,0,i).Format("2006-01-02")
	row := byDate[bucketDate]        // (1)
	...
}
```

**(1)** Untuk rentang 90 hari, `step = 3`, dan loop mengambil **hanya** hari ke-0, 3, 6, … Nilai hari di antaranya tidak dijumlahkan ke bucket. Jadi `revenue_trend` bukan agregasi 3-harian, melainkan sampel setiap tiga hari. Total di `Summary` tetap benar karena dihitung dari seluruh `rows`. Ini perbedaan penting antara "grafik tren" dan "total laporan".

**(2)** `label := bucketDate[5:]` menghasilkan `MM-DD`; untuk rentang satu hari diganti "Hari ini". Tidak ada label tahun, sehingga laporan lintas tahun ambigu di UI.

```go
summary.AvgBookingValue = totalRevenue / totalBookings          // (1)
summary.ConversionRate = math.Round(float64(totalBookings)/float64(allVisitors)*1000)/10
```

**(1)** Pembagian integer memotong pecahan rupiah. Untuk rata-rata, ini bisa selisih hingga Rp 1 — tidak masalah untuk dashboard.

**(2)** `ConversionRate` membagi booking dalam rentang dengan **seluruh pengunjung yang pernah terdaftar** (`VisitorsCount`), bukan pengunjung pada rentang itu. Semakin lama sistem berjalan, angka ini semakin kecil tanpa hubungan dengan performa periode. Rumus yang lebih masuk akal memakai `VisitorsInRange` atau pengunjung unik yang melakukan booking.

```go
DailyRow{ ..., Visitors: row.Tickets, PaymentStatus: ternary(row.Bookings > 0, "PAID", "-") }
```

**(1)** `Visitors` disamakan dengan jumlah tiket, dan `PaymentStatus` hanya `"PAID"`/`"-"`. Keduanya aproksimasi untuk tabel laporan: satu tiket dianggap satu pengunjung, dan status pembayaran tidak benar-benar dibaca per baris. Jangan memakai kolom ini untuk rekonsiliasi.

```go
func pct(current, previous int64) float64 {
	if previous == 0 { if current > 0 { return 100 }; return 0 }
	return math.Round(float64(current-previous)/float64(previous)*1000)/10
}
```

**(1)** Pertumbuhan dari nol ditampilkan **+100%**, bukan "tak terhingga". Ini keputusan UI yang wajar, tetapi bisa menyesatkan: naik dari 0 ke 100 dan dari 0 ke 1 sama-sama +100%.

### 8.25.3 `AdminDashboard`

**(1)** Sepuluh angka dihitung dengan sepuluh query terpisah (`TotalBookings`, `TotalTicketsSold`, `TotalRevenue`, `VisitorsCount`, `BookingsCreatedOn`, `TotalRevenueBetweenOn`, `TicketsAvailable`, `PendingPayments`, `ActiveStaffCount`, `VisitorsOnVisitDate`). Dashboard admin karena itu melakukan 10 round-trip DB per muat halaman. Bisa digabung menjadi beberapa query agregat, tapi pemisahan ini membuat tiap angka mudah diuji.

**(2)** `TotalRevenue` dan `TotalRevenueBetweenOn` memakai definisi pendapatan dari domain masing-masing (booking `RevenueStatuses`, payment `PAID`). Kalau keduanya berbeda, dua kartu di dashboard yang sama bisa menunjukkan angka tidak konsisten — periksa repository analytics sebelum mengubah definisi di domain lain.

**(3)** Tidak ada cache. Setiap refresh dashboard memukul DB; untuk admin yang membuka beberapa tab, beban ini berlipat.

## 8.26 `backend/internal/domain/audit` — jejak yang tidak boleh menggagalkan transaksi

```go
func (s *Service) Log(...) {
	log := &AuditLog{...}
	if len(metadata) > 0 {
		if b, err := json.Marshal(metadata); err == nil { log.Metadata = string(b) }
	}
	_ = s.repo.Create(ctx, log)      // (1)
}
```

**(1)** Error penulisan audit **ditelan**. Komentar menyatakan ini disengaja: audit tidak boleh menggagalkan operasi bisnis. Konsekuensinya, audit bisa hilang tanpa jejak saat DB sibuk — dan justru pada saat-saat penting (insiden) audit paling dibutuhkan. Di produksi, pola yang lebih baik adalah menulis ke queue dan mencatat kegagalan ke logger.

**(2)** Metadata disimpan sebagai **string JSON**, bukan kolom JSON. Keuntungan: portabel antara SQLite/MySQL. Kerugian: tidak bisa difilter dengan query JSON; pencarian hanya bisa `LIKE`.

**(3)** `json.Marshal` gagal untuk nilai yang tidak bisa diserialisasi (mis. channel, func) dan kegagalan itu diabaikan, sehingga metadata hilang tapi log tetap dibuat. Karena semua pemanggil memakai `BuildMetadata` dengan tipe dasar, kasus ini jarang.

```go
func BuildMetadata(keyValues ...interface{}) map[string]interface{} {
	if len(keyValues)%2 != 0 { return nil }        // (1)
	for i := 0; i < len(keyValues); i += 2 {
		key, ok := keyValues[i].(string); if !ok { continue }
		m[key] = keyValues[i+1]
	}
}
```

**(1)** Jumlah argumen ganjil menghasilkan `nil` — bukan panic. Artinya salah menulis pasangan key/value membuat metadata hilang diam-diam. Ini trade-off yang wajar untuk helper logging, tetapi menyulitkan saat mencari "kenapa metadata kosong".

**(2)** Key yang bukan string dilewati, value tetap diambil dari indeks berikutnya. Tidak ada validasi panjang key; metadata bisa membengkak dan memotong kolom bila melebihi tipe kolom DB.

```go
func ExtractAuditInfo(ctx context.Context) (actorID, actorRole, ip, ua string)
func WithAuditInfo(ctx context.Context, ...) context.Context
```

**(1)** Memakai `context.WithValue` dengan **key string** (`"audit_actor_id"`). Ini praktik yang tidak disarankan (key bisa bentrok antar paket), tetapi berfungsi karena hanya paket ini yang memakai string tersebut. Kalau ada paket lain menulis key sama, nilainya bisa tertimpa.

**(2)** `WithAuditInfo` dipanggil middleware untuk menempelkan identitas ke context. Tanpa pemanggilan itu, `ExtractAuditInfo` mengembalikan string kosong dan audit mencatat aktor kosong — bukan error, sehingga mudah tidak disadari.

**(3)** `List` meng-clamp limit 1–100 dan offset dari page. Berbeda dari handler lain yang meng-clamp di service, di sini service yang melakukannya — hasilnya sama, tapi menjelaskan kenapa `response.BuildMeta` di handler audit bisa tetap memakai nilai mentah.
## 8.27 `backend/internal/domain/article` — konten editorial

```go
func (s *Service) Create(ctx, authorID string, req CreateRequest) (*Article, error) {
	slug, err := s.uniqueSlug(ctx, req.Title, "")
	a := &Article{ ..., Status: StatusDraft, AuthorID: authorID, CreatedBy: authorID }
}
```

**(1)** Artikel **selalu** lahir `DRAFT`, apa pun yang dikirim klien. Publikasi adalah aksi terpisah (`Publish`), sehingga tidak ada cara membuat artikel langsung tayang lewat satu request. Ini kontrol editorial yang disengaja.

**(2)** `uniqueSlug` menderivasi slug dari judul dan menambahkan `-2`, `-3`, … sampai tidak bentrok. Loopnya tidak berbatas; secara praktis selalu selesai pada percobaan pertama atau kedua.

**(3)** Pemeriksaan `SlugExists` lalu INSERT tetap bisa balapan: dua request dengan judul sama bisa sama-sama lolos dan menghasilkan slug identik. Pertahanan sesungguhnya adalah indeks unik pada kolom `slug` (bila ada di migrasi); tanpa itu, dua artikel bisa berbagi URL.

```go
func (s *Service) Update(ctx, id, actorID string, req UpdateRequest) (*Article, error) {
	if a.Title != req.Title {
		slug, err := s.uniqueSlug(ctx, req.Title, a.ID)      // (1)
		a.Slug = slug
	}
	a.Title, a.Excerpt, a.Content, a.CoverImage = ...
}
```

**(1)** Slug hanya dibuat ulang bila **judul berubah**. Ini menjaga URL artikel yang sudah dibagikan tetap hidup saat isi diperbaiki. Konsekuensinya, judul bisa berbeda jauh dari slug — hal yang wajar di CMS.

**(2)** `excludeID` mencegah artikel menemukan slug miliknya sendiri saat judul tidak berubah. Tanpa parameter ini, setiap penyimpanan akan menambah `-2` pada slug.

```go
func (s *Service) Publish(ctx, id, actorID string) error {
	now := time.Now().Unix()
	a.Status, a.PublishedAt, a.UpdatedBy = StatusPublished, &now, actorID
}
```

**(1)** `PublishedAt` disimpan sebagai **Unix detik**, bukan `time.Time`. Frontend harus mengalikannya 1000 sebelum `new Date()`. Ini berbeda dari booking yang memakai string RFC3339 — ketidakseragaman tipe waktu yang nyata di seluruh API.

**(2)** `Publish` bersifat idempoten secara efek: memanggil dua kali hanya memperbarui `PublishedAt` ke waktu terbaru. Tidak ada pengecekan status sebelumnya, jadi artikel yang diarsipkan bisa langsung diterbitkan lagi.

```go
a.DeletedBy = &actorID
if err := s.repo.Update(ctx, a); err != nil { ... }
if err := s.repo.Delete(ctx, id); err != nil { ... }
```

**(1)** Urutannya penting dan dikomentari di kode: `DeletedBy` harus ditulis **sebelum** soft delete, karena `Delete` GORM hanya mengisi `deleted_at`. Kalau dibalik, `DeletedBy` tidak akan pernah tersimpan (baris sudah di luar cakupan query biasa).

**(2)** Dua operasi tanpa transaksi. Kalau `Update` berhasil dan `Delete` gagal, artikel tetap ada dengan `DeletedBy` terisi — data yang menyesatkan. Risikonya kecil, tapi ada.

## 8.28 `backend/internal/domain/gallery` — CRUD aset visual

**(1)** `Create` hanya menyalin field dari request; tidak ada validasi bahwa `ImageURL` benar-benar URL atau berasal dari storage sendiri. Kalau endpoint admin disalahgunakan, galeri bisa menampilkan gambar dari domain pihak ketiga (hotlink).

**(2)** `SortOrder` disimpan apa adanya; tidak ada penomoran ulang otomatis. Untuk mengubah urutan, admin harus mengedit beberapa item, dan nilai kembar akan diurutkan tidak deterministik kecuali repository menambahkan pengurut sekunder (mis. `id`).

**(3)** `Delete` mengikuti pola article: tulis `DeletedBy` lalu soft delete. Berbeda dari article, tidak ada status publikasi — item langsung hilang dari galeri publik saat dihapus.

**(4)** `List` menerima filter `category` tapi tidak memvalidasi nilainya. Kategori asing menghasilkan daftar kosong, bukan error.

## 8.29 `backend/internal/domain/faq` — tanya-jawab publik

```go
func (s *Service) List(ctx, offset, limit int, category string, publishedOnly bool) ([]*FAQ, int64, error)
func (s *Service) ListPublished(ctx, category string) ([]*FAQ, error)
```

**(1)** Dua jalur baca: `List` untuk admin (bisa melihat draf) dan `ListPublished` untuk pengunjung. Pemisahan ini lebih aman daripada satu method dengan flag, karena endpoint publik tidak mungkin lupa mengirim `publishedOnly=true`.

**(2)** `Create` menerima `IsPublished` dari klien, sehingga admin bisa membuat FAQ yang langsung tayang. Berbeda dari article yang memaksa draf. Ketidakseragaman ini bukan bug, tetapi mencerminkan tingkat risiko yang berbeda: FAQ tidak melalui alur editorial.

**(3)** `Delete` tidak mencatat siapa yang menghapus (tidak ada `DeletedBy`), berbeda dari article/gallery/package. Jejak audit untuk FAQ hanya berasal dari audit log global, bukan dari baris datanya.

**(4)** `ListPublished` kemungkinan mengembalikan **semua** FAQ tanpa paginasi. Untuk puluhan item tidak masalah; kalau tumbuh menjadi ratusan, endpoint publik ini akan mengirim payload besar pada setiap kunjungan halaman.

## 8.30 `backend/internal/domain/package` — paket wisata

```go
PriceCents int64
Currency   string
```

**(1)** Nama field `PriceCents` menyiratkan satuan sen (1/100), tetapi `Currency` di-hardcode `"IDR"` dan harga tiket lain memakai rupiah utuh. Kalau frontend membagi `PriceCents` dengan 100, harga paket akan tampil 100× lebih murah. Periksa tipe frontend sebelum mengubah nama atau nilainya; ini salah satu ketidaksesuaian penamaan paling berbahaya di repo.

**(2)** `Currency` selalu `"IDR"` dan tidak bisa diubah lewat request. Field-nya ada untuk masa depan multi-mata uang, tetapi saat ini hanya dekoratif.

```go
p := &Package{ ..., IsActive: true, CreatedBy: actorID, UpdatedBy: actorID }
```

**(1)** Berbeda dari article, paket langsung aktif saat dibuat. Tidak ada alur draf; untuk menyembunyikan, admin harus mengubah `IsActive` setelahnya.

**(2)** `Update` menimpa `IsActive` dari request. Karena `UpdateRequest` memakai bool (bukan pointer), klien yang tidak mengirim field `is_active` akan mengirim `false` dan **menonaktifkan paket tanpa sengaja**. Ini jebakan klasik PATCH-vs-PUT: endpoint ini berperilaku PUT meski rutenya mungkin PATCH.

```go
func (s *Service) uniqueSlug(...) {
	base := slugutil.Generate(name)
	for i := 2; ; i++ { ... slug = base + "-" + strconv.Itoa(i) }
}
```

**(1)** Algoritma slug identik dengan article, termasuk risiko balapan yang sama. Karena keduanya memakai helper yang sama (`pkg/slugutil`), perbaikan di satu tempat (mis. batas panjang) harus mempertimbangkan kedua domain.

**(2)** `Delete` menulis `DeletedBy` lalu soft delete. Paket yang dihapus tidak muncul lagi di katalog, tetapi pesanan lama yang merujuk paket tersebut tetap valid karena `booking_items` menyimpan nama dan harga sendiri.

## 8.31 Pola bersama empat domain CMS ini

Empat domain di atas (article, gallery, faq, package) berbagi kerangka yang sama, dan memahami polanya membuat sisa domain CMS mudah dibaca:

| Aspek | Pola yang dipakai |
|---|---|
| Service | `mustFind` → ubah field → `repo.Update`; error dibungkus `apperror.Internal` |
| Delete | `DeletedBy` ditulis lebih dulu, lalu soft delete |
| Slug | `uniqueSlug` dengan sufiks angka dari `pkg/slugutil` |
| List | service meneruskan `offset/limit`; handler meng-clamp |
| Publikasi | article pakai `Publish/Archive`; faq & package pakai flag `IsPublished/IsActive` |

Implikasi saat menambah domain baru: ikuti `mustFind` + `apperror` agar status HTTP konsisten, dan **jangan** menyalin `IsActive bool` ke request update tanpa pointer — itulah sumber bug "data nonaktif sendiri" yang sudah ada di package.
## 8.32 `backend/internal/domain/public` — endpoint baca untuk pengunjung

```go
type Service struct {
	repo          Repository
	ticketService *tickettype.Service     // (1)
}
```

**(1)** Ini satu-satunya domain yang menyimpan **service konkret** domain lain, bukan antarmuka. Alasan praktisnya: `GetPrices` butuh `ListActive`, dan menulis antarmuka kecil dirasa berlebihan. Konsekuensinya `public` bergantung pada implementasi `tickettype`; perubahan signature di sana langsung memecah paket ini.

**(2)** Semua method baca mengembalikan `ErrNotFound` saat data tidak ada, dan `apperror.Internal` untuk kegagalan DB. Tidak ada autentikasi di lapisan ini — rute publik memasangnya tanpa `RequireAuth`, jadi semua data yang dikembalikan harus aman untuk dunia luar.

```go
func (s *Service) GetContents(ctx context.Context, contentType string, page, limit int) ([]Content, int64, error) {
	if page < 1 { page = 1 }
	if limit < 1 || limit > 50 { limit = 20 }        // (1)
	offset := (page - 1) * limit
	return s.repo.ListContents(ctx, contentType, ContentStatusPublished, limit, offset)
}
```

**(1)** Batas atas di sini **50**, bukan 100 seperti domain lain. Endpoint publik memang dibatasi lebih ketat untuk melindungi bandwidth.

**(2)** Parameter `limit` dan `offset` dikirim dengan urutan `(limit, offset)` — perhatikan urutannya berbeda dari `booking` yang memakai `(offset, limit)`. Salah urutan menghasilkan halaman kosong atau data berulang tanpa error.

**(3)** Status selalu dipaksa `ContentStatusPublished`. Tidak ada cara melihat draf lewat endpoint publik, bahkan bila `contentType` dimanipulasi.

```go
func (s *Service) GetPrices(ctx context.Context) ([]PriceInfoResponse, error) {
	tickets, err := s.ticketService.ListActive(ctx)
	sold, err := s.repo.ListReviews(ctx, "", false, 0)      // (1)
	_ = sold
	...
	Available: t.Capacity,                                   // (2)
}
```

**(1)** Baris ini mengambil **review**, bukan penjualan, lalu hasilnya dibuang (`_ = sold`). Kemungkinan besar ini sisa copy-paste dari implementasi lain. Efeknya: satu query sia-sia pada setiap permintaan harga publik, dan error-nya juga diabaikan.

**(2)** `Available` selalu sama dengan `Capacity`. Jadi field ini tidak informatif: pengunjung melihat "tersedia 500" untuk tanggal berapa pun, termasuk tanggal yang sudah penuh. Perbaikan yang benar adalah memakai `SoldByTicketOn` seperti `tickettype.withAvailability`, atau menghapus field ini agar tidak menyesatkan.

**(3)** DTO `PriceInfoResponse` memakai `price` dalam rupiah utuh, konsisten dengan `tickettype`, tetapi **tidak** konsisten dengan `package.PriceCents`. Halaman yang menampilkan keduanya harus memperlakukan satuan secara berbeda.

## 8.33 `backend/internal/domain/role` — peran dan penugasan

```go
func (s *Service) AssignDefaultRole(ctx context.Context, userID string) error {
	hasRole, err := s.repo.UserHasAnyRole(ctx, userID)
	if hasRole { return nil }                              // (1)
	defaultRole, err := s.repo.FindRoleByName(ctx, DefaultRoleName)
	if defaultRole == nil { return ErrRoleNotFound }
	return s.repo.AssignRole(ctx, userID, defaultRole.ID)
}
```

**(1)** Idempoten: pengguna yang sudah punya peran apa pun tidak diberi peran default. Ini mencegah pengguna yang sengaja dijadikan admin ikut mendapat peran pengunjung saat login ulang.

**(2)** Kalau baris peran default tidak ada di database (migrasi gagal), fungsi mengembalikan `ErrRoleNotFound`. Di alur registrasi, ini bisa menggagalkan pembuatan akun **setelah** user tersimpan — akun tanpa peran. Sebaiknya peran default di-seed dan diperiksa saat startup.

```go
func (s *Service) ReplaceRoles(ctx context.Context, userID string, roleNames []string) error {
	roles, err := s.repo.FindRolesByNames(ctx, roleNames)   // (1)
	roleIDs := ...
	return s.repo.ReplaceRoles(ctx, userID, roleIDs)
}
```

**(1)** `FindRolesByNames` mengembalikan hanya peran yang **ditemukan**. Nama yang salah ketik (`"adminn"`) tidak menghasilkan error; ia hanya hilang dari daftar. Bila klien mengirim tiga peran dan satu salah, pengguna berakhir dengan dua peran tanpa peringatan. Untuk operasi administratif, sebaiknya jumlah hasil dibandingkan dengan jumlah input.

**(2)** `ReplaceRoles` mengganti seluruh himpunan peran (hapus lalu tambah), bukan menambah. Karena itu endpoint ini harus dipakai dengan daftar lengkap; mengirim satu peran akan menghapus sisanya.

**(3)** Perubahan peran **tidak** mencabut token yang beredar. Pengguna yang dicabut aksesnya tetap memegang peran lama sampai access token kedaluwarsa (lihat 8.20), dan refresh token akan menerbitkan peran baru hanya setelah `ReadRoles` dipanggil ulang saat refresh.

## 8.34 `backend/internal/domain/visitorrule` — aturan pengunjung

**(1)** `Create` memberi `PriorityNormal` bila `Priority` kosong. `Update` juga melakukannya, sehingga mengosongkan prioritas mengembalikannya ke normal — bukan membiarkannya kosong.

**(2)** Sama seperti `package`, `Update` menerima `IsPublished bool` (bukan pointer). Klien yang tidak mengirim field itu mengirim `false` dan **menyembunyikan aturan dari publik**. Ini jebakan ketiga dengan pola yang sama di repo (package, faq, visitorrule); perbaikannya adalah pointer atau `*bool` + hanya menimpa bila tidak nil.

**(3)** `Delete` tidak mencatat `DeletedBy`; jejak penghapusan hanya ada di audit global.

**(4)** Ada dua jalur baca (`List` dengan `publishedOnly`, dan `ListPublished`). Pola yang sama dengan FAQ, termasuk risiko endpoint publik mengembalikan terlalu banyak data tanpa paginasi.

## 8.35 `backend/internal/domain/verification` — duplikasi pencatatan scan

```go
func (s *Service) Verify(ctx context.Context, req VerifyRequest, staffID, staffName string) (*VerifyResponse, error) {
	result, err := s.ticketService.Validate(ctx, req.TicketID, req.Gate, staffID, staffName)   // (1)
	if err != nil { return nil, err }
	scannedAt := time.Now()
	if result.Ticket.CheckedInAt != nil { scannedAt = *result.Ticket.CheckedInAt }              // (2)
	verification := &Verification{ ... Status: result.Status, ScannedAt: scannedAt, Note: req.Note }
	if err := s.repo.Create(ctx, verification); err != nil { return nil, apperror.Internal(err) }  // (3)
```

**(1)** Domain ini **mendelegasikan seluruh validasi** ke `ticketing.Service.Validate`. Artinya aturan gerbang (status, tanggal, pembakaran tiket) tidak diduplikasi — baik. Yang diduplikasi adalah pencatatannya.

**(2)** **Bug nyata:** bila tiket tidak ditemukan, `ticketing.Validate` mengembalikan `ValidateResult` dengan `Ticket == nil` (lihat 7.4.3). Baris ini langsung membaca `result.Ticket.CheckedInAt` tanpa nil-check → **panic nil pointer**, yang berujung 500 dan tumpukan error di log. Jalur ini bisa dipicu siapa pun yang mengirim kode tiket acak ke endpoint verifikasi. Perbaikannya: periksa `result.Ticket != nil` sebelum mengakses, dan bangun response tanpa data tiket bila nil.

**(3)** Setiap panggilan `Verify` menulis **tiga** jejak: `scan_records` (dari ticketing), `verifications` (di sini), dan audit log (dari ticketing). Untuk satu scan, tiga baris di tiga tabel. Ini memberi laporan berbeda-beda: `ticketing.Monitoring` membaca `scan_records`, sedangkan halaman verifikasi membaca `verifications`. Kalau salah satu penulisan gagal, angka di dua halaman itu berbeda.

**(4)** `Status` disimpan sebagai string hasil ticketing (`VALID`, `USED`, dst.), tanpa enum bersama. Kalau ticketing menambah status baru, kolom ini menerimanya apa adanya (varchar), tetapi frontend verification mungkin tidak mengenalinya.

```go
func (s *Service) ListVerifications(...) {
	if limit < 1 || limit > 100 { limit = 20 }
	offset := (page - 1) * limit
	items, total, err := s.repo.List(ctx, offset, limit, gate, petugasID, from, to)
}
```

**(1)** Clamp di service, bukan handler — pola yang sama dengan audit. `from`/`to` diteruskan sebagai string, sehingga format tanggal harus konsisten dengan yang dikirim frontend.

**(2)** `GetVerification` mengembalikan `ErrNotFound` untuk ID yang tidak ada, tetapi `Verify` tidak pernah mengembalikan ID verifikasi yang baru dibuat. Klien yang ingin menautkan hasil scan ke record verifikasi harus mencari lewat daftar — keterkaitan yang hilang antara respons dan baris yang disimpan.

### 8.35.1 Ringkasan bug yang ditemukan di bagian ini

| Lokasi | Masalah | Dampak |
|---|---|---|
| `verification.Verify` | `result.Ticket` bisa `nil` lalu di-dereference | panic/500 untuk kode tiket acak |
| `public.GetPrices` | `Available` selalu `Capacity`; query review sia-sia | info stok menyesatkan |
| `package/faq/visitorrule.Update` | `bool` bukan pointer | data bisa nonaktif tanpa sengaja |
| `role.ReplaceRoles` | nama peran tak dikenal diabaikan | hak akses berkurang diam-diam |
| `article/gallery/package.Delete` | tulis `DeletedBy` lalu delete tanpa transaksi | metadata bisa tidak konsisten |
## 8.36 `backend/internal/domain/user` — administrasi akun

```go
func (s *Service) List(ctx, offset, limit int, search string) ([]AdminUser, int64, error)
func (s *Service) SetActive(ctx, id string, active bool, actorID string) error
```

**(1)** Domain ini sengaja **sempit**: hanya daftar pengguna dan mengaktifkan/menonaktifkan akun. Pembuatan akun ada di `auth`, peran di `role`, profil di `auth`. Pembagian ini mencegah duplikasi aturan hashing/validasi, tetapi membuat panel admin memanggil beberapa domain untuk satu layar pengguna.

**(2)** `AdminUser` adalah tipe terpisah dari `auth.User` — hanya memuat field yang aman ditampilkan (tanpa hash, tanpa Google ID). Ini pola yang benar: jangan pernah mengirim model auth mentah ke panel admin.

**(3)** `SetActive` menerima `actorID` untuk dicatat di kolom `updated_by` (di repository). Tidak ada pencabutan refresh token saat akun dinonaktifkan. Akibatnya pengguna yang dinonaktifkan tetap bisa memakai access token sampai kedaluwarsa, dan **refresh** akan ditolak karena `RefreshTokenPair` memeriksa `IsActive`. Jadi pemutusan efektif terjadi paling lambat satu masa access token — bukan instan.

**(4)** Tidak ada perlindungan agar admin tidak menonaktifkan dirinya sendiri. Kesalahan klik bisa mengunci akun yang sedang dipakai; pemulihannya lewat akun admin lain atau database.

## 8.37 `backend/internal/domain/destinationinfo` — profil destinasi

```go
existing, err := s.repo.FindByTitle(ctx, req.Title)
if existing != nil { return nil, ErrTitleExists }        // (1)
info := &DestinationInfo{ ..., Status: StatusDraft, AuthorID: authorID }
```

**(1)** Judul harus unik, dicek sebelum insert. Tanpa indeks unik di DB, dua request bersamaan bisa membuat dua baris berjudul sama. Perbaikannya sama seperti slug: andalkan constraint, tangani pelanggarannya.

**(2)** Selalu lahir `DRAFT`. Publikasi terpisah dan memvalidasi `Title`/`Description` tidak kosong. Validasi ini hanya memeriksa dua field, meski `Location` dan `OperatingHours` juga penting untuk halaman publik — konten bisa tayang dengan informasi operasional kosong.

```go
if info.Title != req.Title {
	existing, err := s.repo.FindByTitle(ctx, req.Title)
	if existing != nil && existing.ID != id { return nil, ErrTitleExists }
	info.Title = req.Title
}
```

**(1)** Pengecekan `existing.ID != id` penting agar menyimpan ulang tanpa mengubah judul tidak dianggap duplikat. Namun bila judul berubah, slug (bila ada) tidak ikut diperbarui — berbeda dari `article`. Periksa apakah tabel ini punya slug; kalau ya, URL publik akan menunjuk judul lama.

```go
func (s *Service) GetPublished(ctx) (*DestinationInfo, error) { return s.repo.GetPublished(ctx) }
```

**(1)** Mengembalikan **satu** baris yang berstatus published. Artinya domain ini mengasumsikan hanya ada satu profil destinasi (Kawah Putih), bukan daftar. Kalau `GetPublished` menemukan lebih dari satu, repository memilih satu secara implisit (biasanya `First`), dan sisanya tidak pernah tampil.

**(2)** `Delete` mengikuti pola CMS: tulis `DeletedBy`, lalu soft delete, tanpa transaksi.

## 8.38 `backend/internal/domain/facility` — fasilitas publik

```go
if facility.Status == "" { facility.Status = StatusActive }      // (1)
facility.Status = req.Status
facility.IsPublished = req.IsPublished                          // (2)
```

**(1)** Status kosong berarti aktif. Default ini masuk akal untuk fasilitas baru, tetapi pada `Update` artinya mengirim status kosong akan **mengaktifkan kembali** fasilitas yang sengaja dinonaktifkan.

**(2)** Dua field kontrol publikasi sekaligus: `Status` (`AKTIF`/`NONAKTIF`) dan `IsPublished`. Tidak jelas mana yang menang di endpoint publik — `ListPublished` kemungkinan memfilter keduanya, tetapi kombinasi "status NONAKTIF + published true" adalah keadaan yang bisa dibuat lewat API dan membingungkan operator. Idealnya hanya satu sumber kebenaran.

**(3)** `List` menerima `status` dan `publishedOnly` sekaligus, sementara `ListPublished` hanya memakai flag publikasi. Konsumen publik harus memakai `ListPublished` agar tidak perlu tahu kombinasi filternya.

**(4)** Tidak ada validasi `Icon`/`ImageURL`. Fasilitas bisa menyimpan path rusak dan halaman publik menampilkan gambar kosong tanpa error di backend.

**(5)** `Delete` tidak mencatat aktor (tidak ada `DeletedBy`), sama seperti FAQ dan visitorrule. Untuk data yang dampaknya kecil, ini konsisten; untuk audit lengkap, andalkan audit log global.

## 8.39 Pola yang berulang di domain konten (dan kapan harus waspada)

Dari delapan domain konten yang dibedah (article, gallery, faq, package, destinationinfo, facility, visitorrule, public), ada tiga pola yang berulang dan tiga jebakan yang ikut berulang:

**Pola yang baik dan sebaiknya dipertahankan:**
1. `mustFind` memusatkan 404 dan membungkus error DB menjadi 500.
2. Pemisahan `List` (admin, bisa melihat draf) dan `ListPublished` (publik) — publik tidak mungkin lupa memfilter.
3. `DeletedBy` ditulis sebelum soft delete untuk menjaga jejak.

**Jebakan yang berulang:**
1. **`bool` di request update** (package, faq, visitorrule, facility) — klien yang tidak mengirim field menonaktifkan data. Gunakan `*bool`.
2. **Cek keunikan lalu insert tanpa menangani pelanggaran constraint** (slug, judul) — balapan bisa menghasilkan duplikat atau 500.
3. **Dua field kontrol publikasi** (`Status` + `IsPublished`) — kombinasi tidak konsisten bisa dibuat lewat API.

**Cara cepat memeriksa domain konten baru:** cari `mustFind`, cek apakah `Delete` menulis `DeletedBy`, cek tipe field boolean di `UpdateRequest`, dan cari pemanggilan `ListPublished` untuk memastikan endpoint publik memakainya.
## 8.40 `backend/internal/domain/visitors` — laporan pengunjung dan staf

```go
type Service struct { repo Repository }
type Handler struct { service *Service }
```

**(1)** Domain ini **tidak punya lapisan usecase**. Handler memanggil `h.service.repo.*` langsung. Konsekuensinya, aturan seperti paginasi, pemfilteran, atau pembentukan DTO tidak punya tempat alami — dan memang tidak ada.

**(2)** `ListVisitors` mengembalikan **seluruh baris** tanpa paginasi:
```go
rows, err := h.service.repo.ListVisitors(ctx)
response.OK(c, "visitors retrieved", rows)
```
Untuk data kecil ini cepat, tetapi tumbuh linear terhadap jumlah pengunjung. Suatu saat endpoint ini akan menjadi yang paling lambat di panel admin, dan tidak ada parameter `page` untuk membatasinya.

**(3)** `pageParams` didefinisikan di file ini tetapi tidak dipakai oleh handler mana pun. Ini sisa refactor: paginasi direncanakan, tidak diselesaikan. Kandidat pembersihan atau penyelesaian.

**(4)** Baris database dikirim **apa adanya** sebagai JSON, tanpa DTO. Artinya setiap kolom baru di tabel (termasuk yang bersifat internal) otomatis terekspos ke API. Ini kebalikan dari `user.AdminUser` yang memilih field secara eksplisit.

```go
if req.Status != "AKTIF" && req.Status != "NONAKTIF" {
	response.ValidationFailed(c, []response.FieldError{{Field: "status", Message: "status must be AKTIF or NONAKTIF"}})
	return
}
h.service.repo.SetStaffActive(ctx, c.Param("id"), req.Status == "AKTIF")
```

**(1)** Validasi status dilakukan di handler, bukan service — karena tidak ada service. Pesan errornya berbahasa Inggris, berbeda dari pesan lain yang berbahasa Indonesia. Frontend yang menampilkan `message` dari `errors[]` akan menampilkan teks Inggris di UI Indonesia.

**(2)** `SetStaffActive` tidak memeriksa apakah staf ada. Mengubah status ID palsu akan berhasil dengan `RowsAffected = 0` dan tetap mengembalikan 200. Frontend menganggap berhasil meski tidak ada yang berubah.

**(3)** Rute baca memberi akses ke `ADMIN`, `MANAGER`, dan `super_admin`; mutasi hanya `ADMIN`/`super_admin`. Manager bisa melihat daftar staf tetapi tidak mengubah status — konsisten dengan peran "monitoring".

**(4)** `ListStaff` dan `StaffStats` juga mengembalikan data mentah. Statistik staf kemungkinan menghitung berdasarkan peran; kalau peran diubah lewat domain `role`, angka ini bisa tidak sinkron dengan daftar staf yang sebenarnya aktif.

## 8.41 `backend/internal/domain/public/handler.go` — permukaan publik

**(1)** Tidak ada satu pun handler di file ini yang memakai `middleware.CurrentUserID` atau `RequireAuth`. Semua rute publik harus aman tanpa identitas, dan semua data yang dikembalikan harus sudah difilter `published`/`active` di repository. Ini batas kepercayaan yang harus dijaga setiap kali menambah endpoint di sini.

**(2)** Pemetaan handler ke service sangat tipis: setiap method hanya memanggil satu method service lalu mengonversi ke DTO. Tidak ada logika di handler, yang membuat file ini mudah dibaca tetapi juga berarti **setiap bug perilaku ada di service/repository**, bukan di sini.

**(3)** `GetReviews`:
```go
limit, _ := strconv.Atoi(c.Query("limit"))
if limit <= 0 { limit = 10 }
```
Tidak ada batas atas. `?limit=100000` akan diteruskan ke repository dan mengambil seluruh ulasan. Untuk endpoint publik tanpa autentikasi, ini permukaan penyalahgunaan (denial of service ringan) yang mudah ditutup dengan clamp 1–50.

**(4)** `GetContents` mengirim `page`/`limit` mentah ke `BuildMeta`, sementara service menormalkannya menjadi maksimal 50. Jadi `meta.limit` bisa 1000 padahal data 50 baris — masalah yang sama dengan 8.21, dan di sini lebih terasa karena endpoint publik.

**(5)** `GetContentBySlug` dan `GetContentByID` sama-sama tersedia. Slug adalah URL yang dibagikan; ID dipakai panel admin. Tidak ada pemeriksaan bahwa konten berstatus published pada level handler — itu tanggung jawab repository. Kalau repository lupa memfilter, draf bisa bocor lewat ID.

**(6)** Tidak ada rate limiting di level handler. Apakah endpoint publik dilindungi `ratelimiter` ditentukan di `routes`; periksa konfigurasi grup sebelum menyimpulkan bahwa endpoint ini bebas flooding.

## 8.42 `backend/internal/domain/role/handler.go` — penugasan peran

```go
if err := h.usecase.AssignRoles(ctx, c.Param("userId"), req.Roles); err != nil { ... }
response.OK(c, "roles updated", nil)
```

**(1)** `AssignRoles` di usecase memanggil `ReplaceRoles`, sehingga daftar yang dikirim **menggantikan** seluruh peran pengguna. Frontend harus mengirim himpunan lengkap; mengirim satu peran akan menghapus sisanya. Ini perilaku yang mudah disalahpahami dari nama "assign".

**(2)** Tidak ada proteksi agar admin tidak mencabut peran `ADMIN` miliknya sendiri. Satu request yang salah bisa mengunci akun admin terakhir di luar panel. Idealnya service menolak bila hasil akhirnya menghapus admin terakhir, atau setidaknya menolak bila `userId == actorID`.

**(3)** Respons sukses tidak mengembalikan daftar peran terbaru (`nil`). Klien harus memuat ulang untuk memastikan hasilnya — dan kalau ada nama peran yang tidak dikenal (8.33), tidak ada cara mengetahui bahwa sebagian peran tidak terpasang.

**(4)** `List` mengembalikan semua peran tanpa paginasi, wajar karena jumlahnya kecil dan bersifat enumerasi.

**(5)** Rute `AssignToUser` berada di grup admin (periksa `routes.go`), tetapi handler tidak memeriksa peran secara eksplisit. Sama seperti `booking.Delete`, keamanan bergantung sepenuhnya pada middleware grup. Ini konsisten di seluruh repo, dengan konsekuensi: memindahkan rute ke grup lain tanpa memindahkan pemeriksaan akan membuka akses.

## 8.43 Rangkuman cakupan backend setelah 8.1–8.42

Berikut status nyata per kelompok berkas backend:

| Kelompok | Status | Lokasi di dokumen |
|---|---|---|
| booking (semua) | baris-per-baris | 7.2, 8.1–8.7 |
| payments (semua) | baris-per-baris | 7.3, 8.8–8.11 |
| ticketing (semua) | baris-per-baris | 7.4, 8.12–8.14 |
| auth (semua) | baris-per-baris | 8.15–8.19 |
| middleware auth, response, apperror, jwtutil | baris-per-baris | 8.20–8.23 |
| tickettype, analytics, audit | per-fungsi | 8.24–8.26 |
| article, gallery, faq, package | per-fungsi | 8.27–8.31 |
| public, role, visitorrule, verification | per-fungsi | 8.32–8.35 |
| user, destinationinfo, facility | per-fungsi | 8.36–8.38 |
| visitors, handler publik, handler role | per-file | 8.40–8.42 |

Sisa backend yang belum dibedah: `bootstrap`, `config`, `middleware` selain auth (ratelimiter, role, logger/request-id), `pkg/validation`, `pkg/logger`, `pkg/mailer`, `pkg/slugutil`, `scheduler`, `payment/midtrans`, `seed`, `upload`, `storage`, `mail`, `notification`, `queue`, `security`, `constant`, `cmd/main`, `cmd/scheduler`, serta handler/repository domain yang belum disebut (analytics handler, audit handler, gallery handler, faq handler, package handler, destinationinfo handler, facility handler, tickettype repository, user repository, dan routes masing-masing). Semuanya menyusul pada 8.44 dan seterusnya.
## 8.44 `backend/internal/bootstrap/bootstrap.go` — grafik dependensi dan penyambungan terlambat

```go
bookingService := new(booking.Service)                                  // (1)
bookingUsecase := booking.NewUsecase(bookingService, &ticketPricerAdapter{...})
ticketingService := ticketing.NewService(ticketingRepo, &bookingCheckinAdapter{uc: bookingUsecase}, log, auditLogger)
paymentsService := payments.NewService(..., &bookingGatewayAdapter{uc: bookingUsecase}, ...)
*bookingService = *booking.NewService(bookingRepo, &paymentStarterAdapter{svc: paymentsService}, ...)   // (2)
```

**(1)** Ada siklus dependensi nyata: booking butuh payments, payments butuh booking, ticketing butuh booking, booking butuh ticketing. Go tidak bisa menyelesaikannya dengan konstruktor biasa. Solusinya: buat `booking.Service` kosong lebih dulu, sambungkan pihak lain ke **pointer**-nya, lalu isi nilai pointer itu setelah semuanya siap.

**(2)** `*bookingService = *booking.NewService(...)` menimpa isi struct yang sudah ditunjuk usecase dan adapter. Ini bekerja karena semua pihak memegang pointer yang sama. Konsekuensinya: kalau seseorang mengganti baris ini menjadi `bookingService = booking.NewService(...)` (tanpa `*`), semua adapter tetap menunjuk service kosong dan aplikasi akan panic saat request pertama. Ini titik paling rapuh di seluruh wiring.

```go
bookingHandler := booking.NewHandler(bookingUsecase, nil)      // (1)
...
bookingHandler = booking.NewHandler(bookingUsecase, bookingPaymentReader(paymentsService))
ticketTypeHandler = tickettype.NewHandler(ticketTypeService, &bookingSalesAdapter{lag: bookingRepo})
```

**(1)** Handler juga dibuat dua kali: pertama tanpa pembaca pembayaran, lalu diganti setelah `payments` ada. Variabel lokal ditimpa sebelum dimasukkan ke `App`, jadi tidak ada handler "setengah jadi" yang bocor. Pola ini lebih aman daripada menyuntikkan nil dan berharap diisi belakangan.

**(2)** `tickettype` awalnya dibuat dengan `nil` sales (katalog tanpa angka ketersediaan), lalu dibuat ulang dengan adapter setelah `bookingRepo` tersedia. Efeknya: objek pertama dibuang, dan setiap `NewHandler` membuat objek baru — tidak ada state yang hilang karena handler tidak menyimpan state.

**(3)** `auditLoggerAdapter` dibuat **sebelum** booking/payments/ticketing karena ketiganya membutuhkannya. Urutan di file ini bukan gaya penulisan; ia mengikuti arah dependensi. Menambah domain baru berarti menempatkan konstruksinya setelah dependensinya, atau memakai pola penyambungan terlambat yang sama.

**(4)** `sweeper := scheduler.NewExpiredBookingSweeper(paymentsService, 30*time.Minute, 5*time.Minute, log)` — jendela 30 menit dan interval pemeriksaan 5 menit ditulis di sini, bukan di config. Mengubah kebijakan kedaluwarsa berarti menyentuh kode bootstrap, bukan environment variable. Nilai 30 menit juga harus cocok dengan `payments.PaymentWindow`; keduanya didefinisikan terpisah.

**(5)** `App` menyimpan `FrontendURL` mentah (bisa berisi beberapa origin dipisah koma) untuk CORS, sementara `auth` menerima origin pertama saja untuk tautan email. Dua nilai berbeda dari satu config — perhatikan mana yang dipakai saat mengubah `FRONTEND_URL`.

**(6)** `upload.NewHandler(cfg.App.UploadDir)` dibuat langsung di struct literal, bukan variabel. Artinya tidak ada kesempatan menyuntikkan storage lain (S3, dsb.) tanpa mengubah bootstrap.

## 8.45 `backend/internal/bootstrap/adapters.go` — jembatan antar domain

```go
func (a *ticketPricerAdapter) SoldByTicketOn(ctx context.Context, date string) (map[string]int64, error) {
	return a.sold.SoldByTicketOn(ctx, date)
}
```

**(1)** Adapter ini memberi `booking.Service` akses ke penjualan, tetapi mengambilnya dari **repository booking sendiri** (bukan dari tickettype). Artinya angka yang dipakai pengecekan awal `Create` adalah `RevenueStatuses` (tanpa `PENDING`), sementara `CreateWithCapacity` memakai `CapacityStatuses` (dengan `PENDING`) — inkonsistensi 8.7.3 berakar di sini.

```go
func bookingPaymentReader(svc *payments.Service) booking.PaymentReader {
	return func(ctx context.Context, bookingID string) *booking.PaymentView {
		p, err := svc.FindLatestForBooking(ctx, bookingID)
		if err != nil { return nil }
		return toPaymentView(p)
	}
}
```

**(1)** Setiap baris daftar booking memanggil fungsi ini sekali → satu query per booking. Inilah sumber N+1 yang dikomentari "terbatch" di mapper. Untuk memperbaikinya, `PaymentReader` perlu diubah menjadi fungsi yang menerima daftar ID, atau daftar booking dienrich setelah query utama dengan satu `WHERE booking_id IN (...)`.

**(2)** Error dibuang menjadi `nil`. Booking tetap tampil tanpa info pembayaran — pilihan yang benar untuk daftar, tetapi menyembunyikan masalah DB.

```go
func (a *bookingCheckinAdapter) IsOwner(ctx context.Context, bookingID, userID string) (bool, error) {
	if userID == "" { return false, nil }                    // (1)
	_, err := a.uc.GetSnapshot(ctx, bookingID, userID, false)
	if err == nil { return true, nil }
	if errors.Is(err, booking.ErrNotFound) || errors.Is(err, booking.ErrNotOwner) { return false, nil }
	return false, err
}
```

**(1)** Pengunjung anonim selalu bukan pemilik. Ini yang membuat e-tiket tidak bisa dibuka tanpa login, kecuali lewat jalur petugas/admin yang privileged.

**(2)** Kepemilikan diperiksa dengan **mencoba mengambil snapshot**: berhasil berarti pemilik, `ErrNotOwner`/`ErrNotFound` berarti bukan. Ini bekerja, tetapi memuat seluruh booking + items hanya untuk menjawab "ya/tidak". Query `COUNT(*) WHERE id=? AND user_id=?` akan jauh lebih murah.

**(3)** Error lain (DB mati) diteruskan, sehingga `CanAccess` mengembalikan error dan handler menjawab 500 — bukan "bukan pemilik". Perilaku gagal-tertutup yang benar.

```go
func (a *bookingSalesAdapter) SoldByTicketOn(ctx context.Context, date string) map[string]int64 {
	m, err := a.lag.SoldByTicketOn(ctx, date)
	if err != nil { return nil }                              // (1)
	return m
}
```

**(1)** Error ditelan dan `nil` dikembalikan. `tickettype.withAvailability` memperlakukan map `nil` sebagai "tidak ada penjualan", sehingga semua tiket tampil dengan `available = capacity`. Di katalog publik, gangguan DB kecil berubah menjadi klaim "stok penuh tersedia".

**(2)** Tiga baris terakhir file menegaskan kompilasi:
```go
var _ booking.AuditLogger = (*auditLoggerAdapter)(nil)
var _ payments.AuditLogger = (*auditLoggerAdapter)(nil)
var _ ticketing.AuditLogger = (*auditLoggerAdapter)(nil)
```
Ini pola yang bagus: perubahan signature salah satu antarmuka akan gagal saat build, bukan saat runtime.

## 8.46 `backend/internal/config/config.go` — default, validasi, dan pagar produksi

```go
DemoMode:             getEnvBool("APP_DEMO_MODE", env == EnvLocal),
RequireVerifiedEmail: getEnvBool("REQUIRE_EMAIL_VERIFICATION", env == EnvProduction),
```

**(1)** Demo mode **aktif secara default hanya di `local`**. Di `development` dan `test` default-nya mati, sehingga developer yang ingin mencoba alur pembayaran harus menyalakannya eksplisit. Ini pilihan yang aman, tetapi menjelaskan kenapa `Process` mengembalikan 403 di lingkungan yang tampak "masih dev".

**(2)** Verifikasi email wajib secara default **hanya di produksi**. Di local/development, akun baru bisa langsung login meski `IsVerified=false`. Perilaku ini berubah hanya dengan mengubah `APP_ENV`, dan bisa membuat bug verifikasi tidak terlihat sampai deploy.

```go
func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Asia%%2FJakarta", ...)
}
```

**(1)** Zona waktu koneksi di-hardcode `Asia/Jakarta`. Ini yang membuat `time.Now()` di query dan `DATE()` konsisten dengan WIB, selama server juga berjalan di zona itu. Kalau container di-set UTC, `created_at` tersimpan UTC tetapi dibaca sebagai Jakarta — selisih 7 jam yang muncul di laporan.

**(2)** `parseTime=True` wajib agar GORM memindai `DATETIME` menjadi `time.Time`. Tanpa itu, field waktu menjadi string dan seluruh mapper gagal.

```go
if !c.isLocalLike() {
	if len(c.JWT.AccessSecret) < 32 { return fmt.Errorf(...) }
	if c.JWT.AccessSecret == c.JWT.RefreshSecret { return fmt.Errorf(...) }
} else {
	if c.JWT.AccessSecret == "" { c.JWT.AccessSecret = "dev-only-insecure-access-secret-change-me" }
}
```

**(1)** `isLocalLike` hanya `local`, `development`, `test`. Environment lain (termasuk `staging` atau salah ketik `prod`) diperlakukan sebagai non-lokal dan wajib punya secret ≥ 32 karakter. Ini gagal-tertutup: salah ketik membuat server menolak start, bukan diam-diam memakai secret dev.

**(2)** Di lokal, secret default **diisi otomatis**. Artinya developer tidak perlu `.env` untuk menjalankan server — dan itu juga berarti token dari sesi lama tetap valid setelah restart, karena secret-nya sama.

```go
if c.isProduction() {
	if c.App.DemoMode { return fmt.Errorf("... APP_DEMO_MODE harus false ...") }
	if !c.Midtrans.Enabled() { return fmt.Errorf("... MIDTRANS_SERVER_KEY wajib ...") }
	if strings.Contains(c.JWT.AccessSecret, "dev-only") { ... }
	if c.Database.Driver == DriverSQLite { ... }
	if c.Database.Password == "" { ... }
}
```

**(1)** Lima pagar produksi yang membuat kesalahan konfigurasi berbahaya menjadi **gagal start**, bukan bug yang ditemukan pengguna: pembayaran simulasi, gateway tanpa kunci, secret dev, SQLite, dan database tanpa password.

**(2)** `Midtrans.Enabled()` hanya memeriksa `ServerKey != ""`. Client key tidak wajib, padahal snap.js membutuhkannya bila dipakai di frontend. Untuk alur redirect saat ini, server key cukup.

**(3)** Tidak ada pemeriksaan `SMTP` di produksi. Server bisa start dengan SMTP kosong, lalu email verifikasi/reset gagal terkirim — dan karena `mailer.Send` diabaikan di service, kegagalannya tidak terlihat.

```go
func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" { return v }
	return fallback
}
```

**(1)** Variabel yang di-set menjadi **string kosong** dianggap tidak ada, sehingga fallback dipakai. Ini mencegah `.env` berisi `SMTP_HOST=` menimpa default dengan kosong, tetapi juga berarti tidak ada cara menonaktifkan sebuah nilai default lewat environment kosong.

**(2)** `getEnvInt`/`getEnvBool` mengembalikan fallback saat parsing gagal, tanpa log. Salah ketik `APP_DEMO_MODE=ture` akan diam-diam memakai default — di produksi default-nya `false` (aman), di local `true` (membingungkan saat ingin mematikan demo).

**(3)** `godotenv.Load()` error diabaikan (`_ =`). Di container yang tidak punya `.env`, ini normal. Efek sampingnya, file `.env` rusak juga tidak dilaporkan; server berjalan dengan default dan gejalanya muncul jauh kemudian.
## 8.47 `backend/internal/config/database.go` — koneksi dan kompromi SQLite

```go
switch strings.ToLower(cfg.Driver) {
case DriverMySQL, "":
	dialector = mysql.Open(cfg.DSN())
case DriverSQLite:
	dsn, err := prepareSQLite(cfg.SQLitePath)
	dialector = sqlite.Open(dsn)
}
```

**(1)** Driver kosong berarti MySQL. `config.Load` selalu mengisi driver, jadi cabang `""` hanya relevan untuk pemanggil lain (mis. test) yang membuat `DatabaseConfig` manual.

**(2)** Driver SQLite memakai `github.com/glebarez/sqlite` (pure Go), bukan `gorm.io/driver/sqlite` yang butuh CGO. Ini yang memungkinkan image `CGO_ENABLED=0` (lihat Dockerfile) tetap bisa memakai SQLite di lokal.

```go
if strings.EqualFold(cfg.Driver, DriverSQLite) {
	maxOpen, maxIdle = 1, 1        // (1)
}
sqlDB.SetMaxOpenConns(maxOpen)
sqlDB.SetMaxIdleConns(maxIdle)
if err := sqlDB.Ping(); err != nil { return nil, ... }
```

**(1)** SQLite dibatasi **satu** koneksi. Ini menghilangkan `database is locked` pada penulisan bersamaan, tetapi juga menyerialkan seluruh pembacaan. Untuk dev/test wajar; untuk beban produksi tidak.

**(2)** `Ping()` setelah konfigurasi memastikan server gagal start bila database tidak merespons, bukan gagal pada request pertama. Pesan errornya membungkus penyebab asli (`%w`), sehingga log bootstrap menyebut masalah sebenarnya.

```go
return fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)", ...)
```

**(1)** Tiga pragma: `busy_timeout` membuat penulis menunggu 5 detik sebelum menyerah (bukan langsung error), `WAL` memungkinkan pembaca tidak memblokir penulis, dan `foreign_keys(1)` **mengaktifkan** foreign key.

**(2)** Prag `foreign_keys(1)` bertentangan dengan komentar di `booking.repository.Delete` yang menyatakan FK "tidak diaktifkan" di SQLite. Dalam praktik, penghapusan manual tetap aman (dan tetap diperlukan bila tabel dependen tidak punya constraint), tetapi alasannya tidak lagi akurat: dengan FK aktif, urutan penghapusan menjadi penting dan pelanggaran constraint akan menggagalkan transaksi.

**(3)** Path berawalan `file:` atau `:memory:` dilewatkan apa adanya untuk unit test. Untuk path biasa, direktori dibuat otomatis (`MkdirAll`) sehingga server bisa dijalankan di folder baru tanpa error "unable to open database file".

**(4)** `NewDatabase` hanya alias `Open`, dipertahankan untuk biner scheduler yang mungkin memakai MySQL. Tidak ada perbedaan perilaku; nama lama dipertahankan demi kompatibilitas.

## 8.48 `backend/internal/scheduler/expired_booking.go` — job berkala

```go
func (s *ExpiredBookingSweeper) Run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done(): return
		case <-ticker.C: s.sweepOnce(ctx)
		}
	}
}
```

**(1)** `time.NewTicker` tidak mengirim tick pertama segera; sweep pertama terjadi setelah `interval` (5 menit). Booking yang kedaluwarsa tepat saat server start baru dibersihkan lima menit kemudian — tidak masalah karena frontend juga memanggil `expirePayment` saat countdown habis.

**(2)** `ctx.Done()` membuat shutdown bersih: goroutine berhenti pada pembatalan context, bukan menunggu tick berikutnya. `defer ticker.Stop()` mencegah kebocoran timer.

**(3)** `Run` **memblokir**. Komentar menyatakan "panggil di goroutine sendiri" — di `cmd/main` ia dijalankan dengan `go`. Kalau dipanggil langsung, server tidak akan pernah menerima request.

```go
func (s *ExpiredBookingSweeper) sweepOnce(ctx context.Context) {
	cutoff := time.Now().Add(-s.window)
	swept, err := s.payments.ExpireStalePending(ctx, cutoff, 200)
	if err != nil { s.log.Error(...); return }
	if swept > 0 { s.log.Info("expired-booking sweep", zap.Int("swept", swept)) }
}
```

**(1)** Batas 200 per sweep. Kalau ada 10.000 booking menumpuk, butuh 50 sweep (≈4 jam) untuk membersihkan semuanya. Tidak ada loop "selama masih ada", jadi backlog besar pulih perlahan.

**(2)** Error tidak menghentikan sweeper: tick berikutnya mencoba lagi. Ini benar untuk job berkala, tetapi berarti kegagalan berulang hanya terlihat sebagai baris log berulang.

**(3)** Tidak ada **distributed lock**. Bila backend dijalankan lebih dari satu instance, setiap instance menjalankan sweeper dan memanggil `ExpireStalePending` untuk ID yang sama. Karena fungsi itu memakai `Update` penuh (bukan CAS), risiko menimpa status `PAID` yang baru masuk meningkat sebanding jumlah instance. Untuk deployment multi-instance, jalankan sweeper di satu instance saja atau tambahkan advisory lock.

**(4)** Parameter `window` (30 menit) diberikan dari bootstrap dan harus sejalan dengan `payments.PaymentWindow`. Keduanya tidak saling merujuk; mengubah satu tanpa yang lain membuat sweep terlalu cepat (membatalkan pembayaran yang masih berlaku) atau terlalu lambat (kuota tertahan).

## 8.49 `backend/internal/payment/midtrans/gateway.go` — klien gateway

```go
func (g *Gateway) Configured() bool { return g != nil && g.cfg.ServerKey != "" }
```

**(1)** Nil-check pada receiver membuat `(*Gateway)(nil).Configured()` mengembalikan `false`, bukan panic. Ini yang memungkinkan `payments.Service` menyimpan gateway nil di test tanpa crash saat memeriksa konfigurasi.

**(2)** Hanya `ServerKey` yang diperiksa. `ClientKey` tidak dipakai di backend (hanya untuk snap.js di frontend), jadi alur redirect tetap bekerja tanpanya.

```go
req.SetBasicAuth(g.cfg.ServerKey, "")
```

**(1)** Midtrans memakai HTTP Basic dengan server key sebagai username dan password kosong. Tidak ada header `Authorization` manual — `SetBasicAuth` yang menyusunnya.

**(2)** Server key dikirim pada **setiap** request; tidak ada logging header. Pastikan logger HTTP (bila ada middleware yang mencatat header) tidak menuliskan nilai ini.

```go
var body snapRequest
body.TransactionDetails.OrderID = orderID
body.TransactionDetails.GrossAmount = grossAmount
body.CustomerDetails.FirstName = customerName
body.CustomerDetails.Email = customerEmail
```

**(1)** Request **tidak** mengirim `item_details`. Akibatnya halaman Midtrans hanya menampilkan satu baris "Kawah Putih Booking", bukan rincian tiket. Ini kosmetik, tetapi mengurangi kepercayaan pengunjung yang ingin melihat rincian sebelum membayar.

**(2)** `itemName` diterima parameter tetapi tidak dipakai sama sekali. Sisa parameter yang tidak berfungsi; kandidat pembersihan atau implementasi.

**(3)** `FirstName` diisi nama lengkap. Midtrans memisahkan `first_name`/`last_name`; nama yang sangat panjang atau mengandung karakter khusus bisa ditolak gateway, dan error-nya hanya muncul sebagai `ErrorMessages`.

```go
resp, err := g.client.Do(req)
defer resp.Body.Close()
var snapResp snapResponse
if err := json.NewDecoder(resp.Body).Decode(&snapResp); err != nil { return "", err }
if resp.StatusCode >= 300 { return "", fmt.Errorf("... (%d): %v", resp.StatusCode, snapResp.ErrorMessages) }
return snapResp.RedirectURL, nil
```

**(1)** Body didekode **sebelum** memeriksa status. Ini disengaja agar pesan error dari Midtrans bisa disertakan; kalau respons bukan JSON (mis. halaman HTML 502 dari proxy), dekode gagal dan error yang dilaporkan adalah "invalid character", bukan status HTTP. Saat mendiagnosis kegagalan gateway, periksa status lebih dulu di log.

**(2)** Hanya `RedirectURL` yang dikembalikan; `Token` dibuang. Karena itu backend tidak bisa memakai snap.js/embed; satu-satunya alur adalah redirect ke halaman Midtrans.

**(3)** Timeout klien 15 detik. Untuk create transaction biasanya cukup; bila Midtrans lambat, `StartPayment` akan mencatat error dan pengunjung mendapat halaman tanpa tombol bayar (lihat 7.3.2).

```go
func (g *Gateway) VerifySignature(orderID, statusCode, grossAmount, signatureKey string) bool {
	raw := orderID + statusCode + grossAmount + g.cfg.ServerKey
	sum := sha512.Sum512([]byte(raw))
	expected := hex.EncodeToString(sum[:])
	return hmac.Equal([]byte(expected), []byte(signatureKey))
}
```

**(1)** Rumus sesuai dokumentasi Midtrans. Perhatikan `grossAmount` memakai **string mentah** dari notifikasi (mis. `"150000.00"`), bukan nilai yang diformat ulang. Kalau diformat ulang (`150000`), signature tidak akan pernah cocok.

**(2)** `hmac.Equal` adalah perbandingan constant-time. Karena kedua sisi berupa string hex dengan panjang sama, ini cukup; membandingkan `[]byte` hasil decode hex juga benar, tetapi tidak perlu.

**(3)** Kesalahan konfigurasi yang umum: `ServerKey` sandbox dipakai dengan `IsProduction=true` (atau sebaliknya). Signature tetap dihitung dari kunci yang salah, sehingga semua webhook ditolak 401 dan pembayaran tidak pernah menjadi PAID — meski pengunjung sudah membayar.

**(4)** `GetTransactionStatus` tersedia di antarmuka `MidtransGateway`, tetapi tidak dipanggil oleh alur `Process`/webhook saat ini. Fungsinya untuk rekonsiliasi manual: menanyakan status langsung ke API bila notifikasi hilang.

## 8.50 `backend/internal/upload/handler.go` — unggah gambar

```go
const maxUploadBytes = 5 << 20
if file.Size > maxUploadBytes { response.BadRequest(c, "Ukuran gambar maksimal 5 MB.", nil); return }
```

**(1)** Batas 5 MB diperiksa dari `file.Size` yang berasal dari header multipart. Penyerang bisa memalsukan header, tetapi `io.Copy` tetap membaca seluruh isi. Tidak ada `http.MaxBytesReader`/`io.LimitReader` di jalur ini, sehingga unggahan besar bisa menghabiskan disk/memori sebelum ditolak. Untuk endpoint ber-autentikasi admin risikonya kecil; untuk hardening, batasi body di middleware.

**(2)** `file.Size <= 0` menolak berkas kosong. Berkas 0 byte tetap lolos `DetectContentType` sebagai `text/plain`, jadi pengecekan ini perlu.

```go
head := make([]byte, 512)
n, err := io.ReadFull(src, head)
ext, ok := allowedImageTypes[strings.ToLower(http.DetectContentType(head[:n]))]
```

**(1)** Tipe ditentukan dari **isi** berkas, bukan ekstensi atau header `Content-Type` klien. Ini mencegah `shell.php` yang dinamai `foto.jpg` tersimpan sebagai gambar.

**(2)** `io.ReadFull` mengembalikan `ErrUnexpectedEOF` untuk berkas < 512 byte; error itu diterima dan `n` dipakai apa adanya. Berkas 100 byte tetap bisa dideteksi.

**(3)** Setelah deteksi, `src.Seek(0, io.SeekStart)` mengembalikan posisi agar seluruh isi tersalin. Kalau `Seek` gagal (implementasi multipart tertentu), unggahan ditolak — lebih aman daripada menyimpan berkas terpotong.

```go
name := uuid.NewString() + ext
dst, err := os.Create(filepath.Join(h.dir, name))
if _, err := io.Copy(dst, src); err != nil {
	dst.Close(); _ = os.Remove(filepath.Join(h.dir, name))
}
```

**(1)** Nama berkas dibuat UUID, sehingga nama asli (yang bisa mengandung path atau karakter aneh) tidak pernah dipakai. Ini menghilangkan seluruh kelas serangan path traversal saat menulis.

**(2)** Jika penyalinan gagal, berkas setengah jadi dihapus. Tanpa ini, direktori unggahan akan penuh berkas rusak yang tidak pernah dirujuk.

**(3)** Tidak ada validasi dimensi gambar atau pemindaian malware. Untuk gambar publik, ini dapat diterima; untuk unggahan dari pengguna umum, perlu sanitasi ulang (mis. decode/encode ulang).

```go
func (h *Handler) Serve(c *gin.Context) {
	name := c.Param("name")
	if name == "" || name != filepath.Base(name) || strings.ContainsAny(name, `/\`) { response.NotFound(...); return }
	full := filepath.Join(h.dir, name)
	info, err := os.Stat(full)
	if err != nil || info.IsDir() { response.NotFound(...); return }
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.File(full)
}
```

**(1)** Tiga pemeriksaan path: tidak kosong, sama dengan `filepath.Base`, dan tidak mengandung separator. Kombinasi ini menutup `../`, `..\\`, dan nama absolut.

**(2)** `Cache-Control: immutable` selama satu tahun aman karena nama berkas UUID tidak pernah berubah isinya. Kalau suatu saat gambar bisa ditimpa dengan nama sama, header ini akan membuat pengunjung melihat versi lama.

**(3)** `Serve` bersifat publik tanpa autentikasi — memang diperlukan agar halaman galeri bisa menampilkan gambar. Jangan menyimpan berkas sensitif (mis. e-tiket PDF, KTP) di direktori ini.

**(4)** Tidak ada penghapusan berkas saat item galeri dihapus. Direktori akan menumpuk gambar yatim; pembersihan harus dilakukan manual atau lewat job terpisah.
## 8.51 `backend/internal/middleware/ratelimiter.go` — dua lapis pembatas

```go
type ipLimiterStore struct {
	mu       sync.Mutex
	limiters map[string]*limiterEntry
	rps      rate.Limit
	burst    int
}
```

**(1)** Setiap IP mendapat `rate.Limiter` sendiri (token bucket). `burst` menentukan lonjakan yang boleh terjadi sekaligus; `rps` menentukan pengisian ulang. Untuk `rps = 1` dan `burst = 10`, pengguna boleh mengirim 10 request beruntun, lalu dibatasi 1 per detik.

**(2)** `evictLoop` menghapus entri yang tidak aktif 15 menit setiap 10 menit. Tanpa eviction, map tumbuh seumur proses dan menjadi kebocoran memori pada serangan banyak IP.

**(3)** `get` mengunci mutex saat mengambil/membuat limiter. Ini titik kontensi: setiap request melewati satu mutex global. Untuk trafik tinggi, sharding per prefix IP atau `sync.Map` lebih baik — tetapi untuk skala aplikasi ini memadai.

```go
func RateLimit(rps float64, burst int) gin.HandlerFunc {
	store := newIPLimiterStore(rate.Limit(rps), burst)
	return func(c *gin.Context) { if !store.get(c.ClientIP()).Allow() { ... } }
}
```

**(1)** Store dibuat **saat middleware dipasang**, sehingga setiap rute yang memakai `RateLimit` punya kuota terpisah. Ini yang diinginkan untuk endpoint sensitif (login 5/menit, register 3/jam).

**(2)** `c.ClientIP()` mempercayai `X-Forwarded-For` hanya jika Gin dikonfigurasi dengan trusted proxies. Di belakang proxy yang tidak dipercaya, penyerang bisa memalsukan header dan mendapat kuota baru per request. Periksa `SetTrustedProxies` di `cmd/server`.

```go
func TieredRateLimit(jwtManager *jwtutil.Manager) gin.HandlerFunc {
	guestStore := newIPLimiterStore(rate.Limit(60.0/60.0), 10)
	userStore  := newIPLimiterStore(rate.Limit(120.0/60.0), 20)
	adminStore := newIPLimiterStore(rate.Limit(300.0/60.0), 40)
	header := c.GetHeader("Authorization")
	if strings.HasPrefix(header, "Bearer ") { ... }
	if limiter == nil { limiter = guestStore.get(c.ClientIP()) }
```

**(1)** Tier hanya diklasifikasikan dari header `Authorization`. **Frontend memakai cookie HttpOnly, bukan header** (7.5.2), sehingga seluruh pengguna browser—termasuk admin—masuk tier tamu: 60 request/menit per IP. Dashboard yang memuat banyak endpoint sekaligus bisa menabrak batas ini, dan semua pengguna di balik satu NAT kantor berbagi kuota yang sama.

**(2)** Token tidak valid **tidak ditolak** di sini; ia jatuh ke tier tamu. Penolakan tetap dilakukan `RequireAuth` di rute terproteksi. Untuk rute publik, token sampah hanya memperlambat dirinya sendiri.

**(3)** `isAdminRole` hanya mengenali `ADMIN`/`admin`, bukan `super_admin`. Akun super admin diperlakukan sebagai pengguna biasa (120/menit). Kecil, tetapi tidak konsisten dengan `RequireRole` yang menerima `super_admin`.

**(4)** Angka 60/120/300 adalah **per menit** yang dikonversi ke per detik. Dokumentasi di komentar menyebut per menit, jadi saat mengubah, hitung ulang pembagiannya.

## 8.52 `backend/internal/middleware/audit.go` — identitas untuk audit log

```go
func actorFromHeader(c *gin.Context, jwtManager *jwtutil.Manager) (string, string) {
	header := c.GetHeader("Authorization")
	if !strings.HasPrefix(header, "Bearer ") { return "", "" }        // (1)
	claims, err := jwtManager.ParseAccessToken(strings.TrimPrefix(header, "Bearer "))
	...
}
```

**(1)** Sama seperti rate limiter, middleware ini **hanya membaca header Bearer**. Pengguna browser yang diautentikasi lewat cookie akan memiliki `actorID` dan `actorRole` kosong di context. Akibatnya `audit.ExtractAuditInfo` mengembalikan string kosong, dan audit log mencatat aktor kosong untuk sebagian besar aksi nyata dari UI.

**(2)** Apakah ini terjadi di produksi bergantung pada frontend: `apiClient` memakai `credentials: "include"` dan **tidak** menetapkan header Authorization. Jadi ya — audit dari browser kehilangan identitas, kecuali ada reverse proxy yang menyalin cookie menjadi header (tidak ada).

**(3)** Perbaikan yang tepat: coba header, lalu fallback ke `c.Cookie(AccessCookieName)`, sama seperti `RequireAuth`. Urutan ini harus konsisten agar tier rate limit dan audit melihat identitas yang sama dengan autentikasi.

**(4)** Middleware ini dipasang **global sebelum** `RequireAuth`, jadi ia mem-parse JWT sendiri. Kalau token tidak valid, identitas kosong tetapi request tetap lanjut; `RequireAuth` yang akan menolak di rute terproteksi.

**(5)** `GetAuditActorID`/`GetAuditActorRole` membaca dari context Gin (`CurrentUserID`), bukan dari context audit. Dua sumber identitas ini bisa berbeda: yang satu dari header (audit middleware), yang lain dari `RequireAuth` (header atau cookie). Fungsi ini praktis tidak dipakai; jangan mengandalkannya untuk konsistensi.

## 8.53 `backend/internal/middleware/cors.go` — origin, kredensial, dan preflight

```go
for _, o := range allowedOrigins {
	o = strings.TrimSuffix(strings.TrimSpace(o), "/")
	if o != "" { set[o] = struct{}{} }
}
...
if _, ok := set[origin]; ok {
	c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
	c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
}
```

**(1)** Origin yang diizinkan dicocokkan **persis** setelah trailing slash dibuang. `http://localhost:3000` dan `https://localhost:3000` berbeda; begitu juga `http://127.0.0.1:3000`. Ini sumber umum "CORS error" saat pengembang berganti cara membuka frontend.

**(2)** `Allow-Credentials: true` diperlukan agar cookie HttpOnly ikut terkirim. Karena itu `Allow-Origin` tidak boleh `*`; kode ini sudah benar dengan menggemakan origin yang cocok.

**(3)** Header `Allow-Methods`/`Allow-Headers` dikirim untuk **semua** origin, bahkan yang tidak diizinkan. Tanpa `Allow-Origin`, browser tetap memblokir, jadi ini tidak membuka akses — hanya sedikit informasi.

**(4)** `Vary: Origin` penting agar cache (proxy/CDN) tidak menyajikan respons ber-`Allow-Origin` untuk origin lain.

**(5)** Preflight `OPTIONS` dijawab 204 dan **di-abort sebelum** rate limiter/audit/auth. Artinya preflight tidak pernah kena limit; wajar, tetapi berarti penyerang bisa membanjiri dengan OPTIONS tanpa biaya.

## 8.54 `backend/internal/middleware/observability.go` — log request dan panic

```go
log.Info("request", zap.String("method", ...), zap.String("path", ...), zap.Int("status", ...), zap.Duration("latency", ...), zap.String("ip", ...))
```

**(1)** Setiap request dicatat pada level Info, termasuk `/healthz`. Di produksi dengan trafik tinggi, ini bisa menjadi volume log yang besar dan biaya penyimpanan. Tidak ada sampling atau level Debug untuk health check.

**(2)** Log memuat `path` lengkap. Untuk endpoint yang menaruh token di URL (tidak ada saat ini), token akan bocor ke log. Query string tidak dicatat, jadi parameter seperti `?code=` aman.

**(3)** `Recovery` menangkap panic, mencatatnya, lalu mengirim 500. Kalau handler sudah menulis sebagian respons sebelum panic, `response.InternalError` akan mencoba menulis header lagi dan Gin melaporkan "headers already written" — respons klien bisa terpotong. Ini keterbatasan umum pola recovery.

**(4)** `Recovery` tidak menutup koneksi atau menghentikan goroutine yang panic di luar request (mis. di sweeper). Untuk job latar, panic akan mematikan proses — tidak ada recovery di `scheduler.Run`.

## 8.55 `backend/internal/routes/routes.go` — urutan middleware menentukan perilaku

```go
r.Use(middleware.CORS(...))
r.Use(middleware.Recovery(log))
r.Use(middleware.RequestLogger(log))
r.Use(middleware.RequestID())
r.Use(middleware.TieredRateLimit(app.JWTManager))
r.Use(middleware.AuditMiddleware(app.JWTManager))
```

**(1)** Urutan ini bukan kebetulan:
- `CORS` paling luar agar preflight dijawab sebelum apa pun.
- `Recovery` membungkus logger sehingga panic tetap tercatat.
- `RequestLogger` mencatat semua request, termasuk yang ditolak rate limiter.
- `RequestID` tersedia bagi handler dan log setelahnya.
- `TieredRateLimit` sebelum audit agar request yang dibatasi tidak memicu parsing JWT tambahan.
- `AuditMiddleware` setelahnya, sehingga context audit tersedia di handler.

**(2)** `RequestID` dipasang **setelah** `RequestLogger`. Artinya log request tidak memuat request ID, meski header respons memuatnya. Kalau Anda mencari log berdasarkan `X-Request-ID`, tidak akan menemukannya. Memindahkan `RequestID` ke atas logger akan memperbaikinya.

**(3)** `public.RegisterRoutes(v1, app.PublicHandler)` tidak menerima `jwtManager`, menegaskan bahwa seluruh grup publik tidak memakai autentikasi. Ini pembeda yang jelas saat membaca kode.

**(4)** `auditGroup := v1.Group("/admin/audit", requireAuth, requireAdmin)` memakai `RequireRole("ADMIN")` tanpa `super_admin` — berbeda dari grup admin lain yang menyertakan `super_admin`. Akun super admin tidak bisa membaca audit log. Ketidakkonsistenan peran yang berulang (lihat 8.10, 8.20).

**(5)** Unggah: `GET /uploads/:name` publik, `POST /uploads` butuh `ADMIN`/`super_admin`. Tidak ada `MANAGER`; manager tidak bisa mengunggah gambar meski bisa melihat galeri.

**(6)** `r.GET("/healthz", ...)` tidak memeriksa database. Load balancer akan menganggap server sehat meski DB mati, sehingga trafik tetap dikirim ke instance yang tidak bisa melayani apa pun. Health check yang lebih baik menjalankan `SELECT 1`.

## 8.56 `backend/pkg/*` — utilitas kecil dengan jebakan masing-masing

### 8.56.1 `pkg/mailer`

```go
func New(cfg Config, log *zap.Logger) Mailer {
	if cfg.Host == "" {
		log.Warn("SMTP_HOST not configured — emails will be logged instead of sent")
		return &logMailer{log: log}
	}
	return &smtpMailer{cfg: cfg, log: log}
}
```

**(1)** Tanpa SMTP, email **dicatat ke log**, termasuk isi body. Body verifikasi berisi tautan dengan token mentah; siapa pun yang membaca log bisa memverifikasi email atau mereset password. Ini dapat diterima di lokal, tetapi berbahaya bila `SMTP_HOST` kosong tanpa sengaja di staging yang log-nya dibaca banyak orang.

**(2)** `smtp.PlainAuth` dipakai untuk semua koneksi. Untuk server SMTP yang tidak memakai TLS (port 25 lokal), `SendMail` akan menolak mengirim kredensial melalui koneksi tidak terenkripsi dan mengembalikan error. Konfigurasi yang benar: port 587 dengan STARTTLS.

**(3)** `Subject` tidak di-encode. Subjek dengan karakter non-ASCII bisa tampil rusak di beberapa klien; untuk subjek berbahasa Indonesia tanpa aksen, aman.

**(4)** Tidak ada timeout pengiriman. `smtp.SendMail` bisa menggantung cukup lama bila server SMTP lambat, dan karena dipanggil sinkron dari alur registrasi/reset, request bisa ikut menggantung.

### 8.56.2 `pkg/slugutil`

```go
var nonAlphanumeric = regexp.MustCompile(`[^a-z0-9]+`)
func Generate(title string) string {
	s := strings.ToLower(title)
	s = nonAlphanumeric.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
```

**(1)** Semua karakter non-ASCII (termasuk huruf beraksen dan aksara non-Latin) diganti tanda hubung. Judul seperti "Kawah Putih — Wisata" menjadi `kawah-putih-wisata` (tanda hubung ganda diciutkan oleh `+`). Judul yang seluruhnya non-Latin menghasilkan **string kosong**, yang kemudian dipakai sebagai slug. Dua artikel berjudul berbeda dalam aksara non-Latin akan bertabrakan dan `uniqueSlug` menghasilkan `-2`, `-3`, dst. — atau string kosong pada percobaan pertama.

**(2)** Tidak ada batas panjang. Judul 500 karakter menghasilkan slug 500 karakter, yang bisa melebihi kolom `varchar` dan gagal saat insert.

**(3)** Slug tidak dijamin unik di sini; keunikan ditangani pemanggil (`article`/`package`) dan seharusnya oleh constraint DB.

### 8.56.3 `pkg/logger`

```go
func Init(env string) {
	if env == "local" { cfg = zap.NewDevelopmentConfig() } else { cfg = zap.NewProductionConfig() }
	l, err := cfg.Build(zap.AddCallerSkip(1))
	if err != nil { panic(...) }
	log = l
}
func L() *zap.Logger { if log == nil { log, _ = zap.NewProduction() }; return log }
```

**(1)** Hanya `env == "local"` yang memakai format development berwarna. `development` dan `test` memakai format produksi (JSON), berbeda dari asumsi umum.

**(2)** `AddCallerSkip(1)` menggeser caller agar file yang tercatat adalah pemanggil `logger.L()`, bukan `logger.go`. Tanpa ini, semua log akan menunjuk ke baris yang sama di paket logger.

**(3)** `L()` membuat logger produksi baru bila `Init` belum dipanggil. Ini mencegah panic di test, tetapi juga berarti log bisa tercetak dalam dua format berbeda bila `Init` terlambat dipanggil. Pastikan `Init` dijalankan di `main` sebelum apa pun.

**(4)** `panic` saat build logger gagal adalah keputusan yang wajar: tanpa logger, server produksi tidak layak jalan. Namun pesan panic-nya hanya berisi error zap; konfigurasi yang salah tidak ditampilkan.

**(5)** `Sync()` mengabaikan error. Pada Windows, `Sync` sering mengembalikan error "invalid argument" untuk stderr; mengabaikannya mencegah noise saat shutdown.
## 8.57 `backend/cmd/server` — urutan start, migrasi, dan shutdown

### 8.57.1 `main.go`

```go
cfg, err := config.Load()
if err != nil { panic(err) }
applogger.Init(cfg.App.Env)
log := applogger.L()
defer applogger.Sync()
db := connectInfra(cfg, log)
app := buildApp(cfg, db, log)
runServer(cfg, app, log)
```

**(1)** Konfigurasi dimuat **sebelum** logger. Kalau config gagal (mis. secret produksi kurang dari 32 karakter), `panic` terjadi tanpa logger, dan pesan hanya muncul di stderr. Ini disengaja: tanpa config yang valid, tidak ada gunanya menyiapkan logger.

**(2)** `panic(err)` lebih baik daripada `log.Fatal` di sini karena logger belum ada. Pesan error config sudah lengkap dan menyebut variabel yang salah.

**(3)** Urutan `Init` → `L()` penting. Memanggil `L()` sebelum `Init` akan membuat logger produksi sementara, lalu logger kedua dibuat setelah `Init` — dua instance dengan format berbeda.

**(4)** `defer applogger.Sync()` memastikan buffer log di-flush saat proses berhenti normal. Saat `log.Fatal` dipanggil (ketika DB gagal), `defer` **tidak** dijalankan — perilaku `os.Exit` — sehingga log terakhir bisa hilang.

**(5)** `connectInfra` melakukan koneksi **dan** migrasi/seed. Artinya setiap start server menjalankan `AutoMigrate` dan seed. Untuk satu instance ini praktis, tetapi pada deployment multi-instance, semua instance menjalankan DDL bersamaan saat start.

### 8.57.2 `bootstrap.go` — AutoMigrate dan tabel yang tidak terlihat

```go
gormLogLevel := gormlogger.Warn
if cfg.App.Env == config.EnvLocal { gormLogLevel = gormlogger.Info }
db, err := config.Open(cfg.Database, gormLogLevel)
if err != nil { log.Fatal(...) }
```

**(1)** SQL GORM hanya dicetak pada level Info di `local`. Di `development`, query tidak terlihat — berbeda dari asumsi umum bahwa semua non-produksi menampilkan SQL.

**(2)** `log.Fatal` menghentikan proses bila database tidak bisa dibuka atau migrasi gagal. Untuk server API, gagal cepat lebih baik daripada melayani request dengan skema setengah jadi.

```go
db.AutoMigrate(
	&auth.User{}, &auth.RefreshToken{}, &auth.AuthToken{},
	&role.Role{}, &role.Permission{},
	&tourismpackage.Package{}, &article.Article{}, &gallery.Item{}, &tickettype.TicketType{},
	&destinationinfo.DestinationInfo{}, &faq.FAQ{}, &facility.Facility{}, &visitorrule.VisitorRule{},
	&booking.Booking{}, &booking.BookingItem{}, &payments.Payment{},
	&ticketing.Ticket{}, &ticketing.ScanRecord{}, &audit.AuditLog{},
)
```

**(1)** `AutoMigrate` membuat/menambah kolom dan indeks, tetapi **tidak menghapus** kolom atau mengubah tipe secara destruktif. Perubahan tipe (mis. `varchar(20)` → `varchar(50)`) mungkin diterapkan, tetapi penyempitan bisa gagal atau memotong data tergantung driver.

**(2)** Tabel **`visitors`** dan **`verifications`** tidak ada di daftar ini, padahal domain `visitors` dan `verification` punya repository. Artinya kedua domain itu membaca tabel yang tidak dibuat oleh server — kemungkinan dibuat oleh skrip migrasi SQL terpisah di `database/migrations`, atau endpoint-nya akan gagal pada instalasi baru. Ini ketidakcocokan yang perlu diperiksa saat menyiapkan environment baru.

**(3)** `role.Permission` dimigrasi meski alur peran saat ini hanya memakai `roles` dan `user_roles`. Tabel izin belum dipakai, tetapi dibuat untuk masa depan.

**(4)** Tabel join `user_roles` dibuat dengan SQL mentah:
```go
CREATE TABLE IF NOT EXISTS user_roles (user_id char(36), role_id char(36), PRIMARY KEY (user_id, role_id))
```
Alasannya dikomentari: field relasi di `role` tidak diekspor sehingga `AutoMigrate` tidak melihatnya. Konsekuensinya, `user_roles` tidak punya foreign key dan tidak ikut strategi migrasi GORM — penghapusan user/role harus membersihkannya manual atau akan menyisakan baris yatim.

**(5)** `seed.Run(...)` selalu dipanggil, termasuk di produksi. Apakah seed aman diulang bergantung implementasinya (8.58): biasanya memeriksa apakah data sudah ada. Kalau tidak idempoten, setiap restart bisa menggandakan data.

### 8.57.3 `server.go` — timeout, sweeper, graceful shutdown

```go
srv := &http.Server{
	Addr: ":" + cfg.App.Port, Handler: router,
	ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
}
```

**(1)** `WriteTimeout` 15 detik lebih pendek daripada timeout `apiClient` (30 detik). Untuk endpoint berat (ekspor laporan, unggah), server bisa memutus koneksi lebih dulu dan klien melihat error jaringan, bukan pesan aplikasi. Endpoint seperti itu perlu timeout khusus atau `http.TimeoutHandler`.

**(2)** `ReadTimeout` 15 detik juga membatasi unggahan 5 MB pada koneksi lambat. Di jaringan seluler buruk, unggah bisa gagal meski ukurannya di bawah batas.

**(3)** Tidak ada `ReadHeaderTimeout`. Untuk hardening terhadap slowloris, nilai ini sebaiknya diisi (mis. 5 detik).

```go
schedulerCtx, cancelScheduler := context.WithCancel(context.Background())
go app.Sweeper.Run(schedulerCtx)
```

**(1)** Sweeper berjalan **di dalam** proses API. Ini sederhana untuk satu instance, tetapi berarti setiap replika menjalankan sweeper yang sama (lihat 8.48 soal tidak adanya distributed lock).

**(2)** Context yang dipakai adalah `context.Background()`, bukan context request. Pembatalannya hanya lewat `cancelScheduler()` saat shutdown, sehingga sweep yang sedang berjalan tidak terpotong oleh timeout HTTP.

```go
quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit
cancelScheduler()
ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
defer cancel()
if err := srv.Shutdown(ctx); err != nil { log.Error("forced shutdown", zap.Error(err)) }
```

**(1)** `SIGINT`/`SIGTERM` ditangkap, sweeper dihentikan, lalu server di-shutdown dengan tenggang 15 detik. Request yang sedang berjalan diberi kesempatan selesai.

**(2)** Urutannya benar: hentikan pekerja latar lebih dulu agar tidak ada sweep baru saat koneksi DB mulai ditutup oleh proses exit.

**(3)** Tidak ada penutupan eksplisit `sql.DB`. Saat proses keluar, koneksi ditutup oleh OS; untuk shutdown yang bersih (dan agar pool tidak menggantung di test), `sqlDB.Close()` sebaiknya dipanggil setelah `Shutdown`.

**(4)** Kalau `Shutdown` melebihi 15 detik, error dicatat tetapi proses tetap keluar — request yang tersisa terputus. Ini perilaku yang wajar untuk container yang akan di-`SIGKILL` setelah masa tenggang.

### 8.57.4 `router.go`

**(1)** Hanya meneruskan ke `routes.NewRouter`. Pemisahan file ini membuat `server.go` tidak perlu mengimpor seluruh domain; kalau nanti ada dua router (mis. admin API terpisah), perubahan terpusat di sini.

**(2)** Tidak ada konfigurasi `trusted proxies` di sini. Karena `c.ClientIP()` dipakai rate limiter dan audit, pengaturan proxy yang salah akan membuat semua pengunjung terlihat berasal dari IP proxy — dan berbagi satu kuota rate limit. Periksa `gin.Engine.SetTrustedProxies` di `routes` (tidak ada), yang berarti Gin memakai default: mempercayai semua proxy. Untuk deployment di belakang nginx, ini perlu dikunci.
## 8.58 `backend/internal/seed/seed.go` — data awal dan batas keamanannya

```go
func Run(ctx context.Context, db *gorm.DB, log *zap.Logger, opts SeedOptions) error {
	if err := seedRoles(ctx, db); err != nil { return fmt.Errorf("seed roles: %w", err) }
	if err := seedUsers(ctx, db, log, opts); err != nil { ... }
	if err := seedTicketTypes(ctx, db); err != nil { ... }
	if err := seedPackages(ctx, db); err != nil { ... }
	if err := seedArticles(ctx, db); err != nil { ... }
	if err := seedGallery(ctx, db); err != nil { ... }
	if err := seedDestinationInfo(ctx, db); err != nil { ... }
	if err := seedFAQs(ctx, db); err != nil { ... }
	if err := seedFacilities(ctx, db); err != nil { ... }
	if err := seedVisitorRules(ctx, db); err != nil { ... }
}
```

**(1)** Setiap langkah membungkus error dengan nama langkahnya (`"seed roles: ..."`), sehingga log startup menyebut bagian mana yang gagal. Ini pola yang baik dan konsisten.

**(2)** Urutannya penting: role dulu (karena user butuh role), lalu user, lalu katalog dan konten. Tidak ada transaksi yang membungkus seluruh `Run`; kalau langkah ke-5 gagal, empat langkah pertama sudah tersimpan. Karena setiap langkah idempoten, restart akan melanjutkan tanpa menggandakan data.

**(3)** Hanya `seedUsers` yang menerima `opts.Env`. Semua seed konten (paket, artikel, galeri, FAQ, fasilitas) berjalan **di environment apa pun**, termasuk produksi. Artinya database produksi yang baru dibuat akan berisi artikel contoh, galeri contoh, dan paket wisata contoh. Ini harus disadari sebelum go-live: entah seed konten dibuat kondisional, atau data contoh dibersihkan manual.

```go
func seedRoles(ctx context.Context, db *gorm.DB) error {
	roles := []role.Role{
		{Name: role.RoleAdmin, ...}, {Name: role.RoleManager, ...},
		{Name: role.RolePetugas, ...}, {Name: role.RolePengunjung, ...},
	}
	for _, r := range roles {
		var count int64
		db.Model(&role.Role{}).Where("name = ?", r.Name).Count(&count)
		if count == 0 { db.Create(&r) }
	}
}
```

**(1)** Idempoten lewat pola "hitung lalu buat". Aman untuk start tunggal, tetapi tidak atomik: dua instance yang start bersamaan bisa sama-sama menghitung 0 dan mencoba membuat role yang sama. Kalau kolom `name` ber-indeks unik, yang kalah mendapat error dan `Run` gagal; kalau tidak, akan ada role duplikat.

**(2)** Empat peran kanonik: `ADMIN`, `MANAGER`, `PETUGAS`, `PENGUNJUNG` (konstanta di domain `role`). Tidak ada `super_admin` di seed, meski beberapa rute menerimanya. Akun super admin harus dibuat manual — dan sampai itu terjadi, rute yang hanya menerima `super_admin`/`ADMIN` tetap terlayani oleh admin.

```go
// userRow menyisipkan langsung ke users dan mengembalikan id yang dibuat.
type userRow struct { ID string; CreatedAt, UpdatedAt time.Time; ... PasswordHash string; ... }
```

**(1)** `seedUsers` memakai struct lokal dan `Table("users")`, bukan `auth.User`. Tujuannya agar paket seed tidak mengimpor domain auth (yang akan menyeret konfigurasi JWT/mailer). Konsekuensinya, hook `BeforeCreate` **tidak berjalan**; ID harus dibuat manual (`uuid.NewString()` di dalam fungsi seed).

**(2)** Password staf hanya dibuat bila environment variable tersedia (`SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_PETUGAS_PASSWORD`), dan di-hash dengan bcrypt. Tidak ada password default di source — keputusan keamanan yang benar. Akun yang sudah ada **tidak pernah** diubah password-nya, sehingga mengganti env tidak akan mereset akun lama.

**(3)** `INSERT INTO user_roles` memakai SQL mentah karena tabel itu tidak dimodelkan GORM (8.57.2). Tidak ada `ON CONFLICT`; kalau baris sudah ada dan seed dijalankan ulang, insert bisa gagal karena primary key gabungan. Dalam praktik, akun yang sudah ada dilewati lebih dulu, jadi jalur ini hanya untuk akun baru.

**(4)** Email staf memakai domain `kawahputih.id`. Kalau domain email perusahaan berbeda, akun seed tetap dibuat dengan domain ini dan tidak bisa dikirimi email verifikasi nyata — tetapi `IsVerified` di-set true saat seed, jadi login tetap bisa.

## 8.59 `backend/pkg/validation` — dua sistem validasi yang hidup berdampingan

### 8.59.1 `validation.go`

```go
var validate = validator.New()
func init() {
	validate.RegisterValidation("phone_id", validateIndonesianPhone)
	validate.RegisterValidation("date_future", validateFutureDate)
	...
}
```

**(1)** Paket ini mendaftarkan validator kustom (`phone_id`, `date_future`, `no_sql_injection`, `no_xss`, `secure_string`) pada instance global. Namun **handler domain tidak memakai paket ini**: setiap domain mendefinisikan `var validate = validator.New()` sendiri dan hanya memakai tag bawaan (`required`, `email`, `min`, `max`). Akibatnya validator kustom di sini praktis tidak aktif di jalur API utama.

**(2)** `no_sql_injection` dan `no_xss` adalah pemeriksaan heuristik berbasis pola karakter. Pendekatan ini tidak menggantikan query berparameter (yang sudah dipakai GORM) atau escaping saat render (dilakukan React). Menambahkannya ke DTO tidak akan menambah keamanan nyata, tetapi bisa menolak input sah (mis. nama dengan apostrof).

```go
func translateValidationError(fe validator.FieldError) string {
	case "required": return fe.Field() + " is required"
	...
}
```

**(1)** Semua pesan berbahasa **Inggris** dan memakai nama field Go (`Password must be at least 8 characters`), sementara pesan bisnis lain berbahasa Indonesia. Frontend yang menampilkan `message` langsung akan menampilkan campuran bahasa.

**(2)** Pesan `min`/`max` selalu mengatakan "characters", padahal untuk angka tag yang sama berarti nilai minimum. Untuk field numerik, pesan ini menyesatkan.

```go
func SanitizeInput(input string) string {
	input = strings.ReplaceAll(input, "\x00", "")
	input = strings.TrimSpace(input)
	if len(input) > 10000 { input = input[:10000] }
	return input
}
```

**(1)** Fungsi ini **tidak** menghapus HTML atau karakter `<script>`. Ia hanya membuang null byte, memangkas spasi, dan membatasi panjang. Jadi nama pengguna bisa berisi `<b>`, dan keamanan bergantung pada escaping di frontend. Jangan menganggap `SanitizeInput` sebagai sanitasi XSS.

**(2)** Pemotongan 10.000 byte bisa memotong di tengah karakter UTF-8, menghasilkan string tidak valid. Untuk nama (maks 150) kasus ini tidak terjadi; untuk field panjang seperti isi artikel, bisa.

```go
func IsValidBookingID(id string) bool {
	return regexp.MatchString(`^KP-\d{8}-\d{6}$`, id)
}
func IsValidPaymentID(id string) bool {
	return regexp.MatchString(`^PAY-\d{8}-\d{6}$`, id)
}
```

**(1)** **Kedua validator ini tidak cocok dengan generator yang sebenarnya.** `generateBookingCode` menghasilkan hex **huruf kecil** (`a1b2c3`), sedangkan regex hanya menerima digit — kode nyata akan gagal validasi. `generateReference` menghasilkan `PAY-KP-<14 digit waktu>-<12 hex>`, yang sama sekali tidak cocok dengan pola `PAY-\d{8}-\d{6}`.

**(2)** Karena itu, jika ada kode yang memakai `IsValidBookingID`/`IsValidPaymentID` untuk memvalidasi input pengguna, kode booking yang sah akan ditolak. Saat ini tidak ada pemanggil di jalur API (pencarian memakai `FindByID`/`FindByCode`), jadi ini dead code yang menyesatkan — kandidat penghapusan atau penyelarasan.

```go
func IsValidTicketCode(code string) bool { return regexp.MatchString(`^[A-Z0-9]{3,20}$`, strings.ToUpper(code)) }
```

**(1)** Kode tiket nyata berbentuk `KPT-<18 hex>` (dengan tanda hubung) atau UUID. Regex ini menolak keduanya. Sekali lagi: tidak dipakai di jalur utama, tetapi berbahaya bila dipercaya.

### 8.59.2 `middleware.go` — generik, tetapi tidak dipakai router

```go
func ValidationMiddleware[T any]() gin.HandlerFunc
func QueryValidationMiddleware[T any]() gin.HandlerFunc
func ParamValidationMiddleware[T any]() gin.HandlerFunc
func GetValidatedRequest[T any](c *gin.Context) (T, bool)
func RateLimiterMiddleware(config RateLimitConfig) gin.HandlerFunc
func SecurityHeadersMiddleware() gin.HandlerFunc
func RequestSizeLimiterMiddleware(maxSize int64) gin.HandlerFunc
```

**(1)** Menyediakan validasi generik berbasis tipe, rate limiter berbasis konfigurasi, header keamanan, dan pembatas ukuran request. Tidak satu pun dipakai di `routes.go`; router memakai middleware di `internal/middleware`. Jadi paket ini adalah alternatif yang belum diadopsi.

**(2)** `SecurityHeadersMiddleware` (bila diaktifkan) akan menambahkan header seperti `X-Content-Type-Options`, `X-Frame-Options`, dan CSP. Saat ini header tersebut **tidak dikirim** oleh API. Untuk API JSON murni dampaknya kecil, tetapi browser yang membuka endpoint langsung tidak mendapat perlindungan itu.

**(3)** `RequestSizeLimiterMiddleware` adalah solusi yang tepat untuk masalah unggahan di 8.50 (tidak ada batas body). Mengaktifkannya pada rute unggah akan menutup celah header `Content-Length` palsu.

**(4)** `RateLimiterMiddleware` duplikat fungsi `middleware.RateLimit`, dengan konfigurasi berbeda. Dua implementasi rate limit di satu repo meningkatkan risiko salah pakai; pilih satu dan hapus yang lain saat merapikan.

## 8.60 `backend/cmd` lain dan direktori yang kosong

### 8.60.1 `cmd/scheduler`

**(1)** Biner terpisah untuk menjalankan sweeper tanpa API server. Berguna bila deployment memisahkan worker dari web, atau bila ingin menjalankan sweep di satu instance saja (menghindari masalah multi-instance di 8.48). Binernya memakai config dan koneksi database yang sama, lalu menjalankan loop yang sama.

**(2)** Karena sweeper juga berjalan di dalam API server (8.57.3), menjalankan **keduanya** berarti dua sweeper aktif pada database yang sama. Pilih salah satu: in-process untuk deployment satu container, biner terpisah untuk deployment multi-instance.

### 8.60.2 `cmd/migration`

**(1)** Delapan baris: memuat config, membuka database, menjalankan migrasi. Fungsinya untuk menyiapkan skema tanpa menyalakan server — berguna di pipeline CI/CD sebelum deploy.

**(2)** Tidak ada argumen CLI (up/down/version). Migrasi bersifat "AutoMigrate ke depan" saja; rollback harus manual. Untuk proyek ini wajar, tetapi jangan berharap bisa membatalkan perubahan skema lewat perintah.

### 8.60.3 Direktori `internal` yang kosong

`internal/storage`, `internal/mail`, `internal/notification`, `internal/queue`, dan `internal/security` ada sebagai direktori tetapi **tidak berisi berkas Go**. Ini sisa rencana arsitektur (storage eksternal, antrean email, notifikasi, abstraksi keamanan) yang belum diimplementasikan. Fungsinya saat ini hanya dokumentasi niat.

Implikasi praktisnya: semua email dikirim sinkron lewat `pkg/mailer` (8.56.1), semua unggahan disimpan di disk lokal (`internal/upload`), dan tidak ada abstraksi penyimpanan. Kalau nanti pindah ke S3/queue, direktori-direktori ini adalah tempat yang wajar untuk implementasinya — tetapi belum ada kontrak yang bisa diikuti.
## 8.61 Sisa handler backend — pola yang sama, perbedaan yang perlu dicatat

Berkas handler yang belum dibedah satu per satu (gallery, faq, package, destinationinfo, facility, visitorrule, analytics, audit, user, ticketing routes, tickettype repository, dan repository analytics/audit/public/user) semuanya mengikuti kerangka yang sama. Berikut inti masing-masing, dengan penekanan pada hal yang **berbeda**, karena itulah yang biasanya menjadi sumber bug.

### 8.61.1 `gallery/handler.go`

```go
page, _ := strconv.Atoi(c.Query("page"))
perPage, _ := strconv.Atoi(c.Query("limit"))
result, total, err := h.usecase.List(ctx, page, perPage, c.Query("category"))
response.OKWithMeta(c, "gallery items retrieved", result, response.BuildMeta(page, perPage, total))
```

**(1)** Handler meneruskan `page` (bukan offset) ke usecase; usecase yang mengubahnya menjadi offset. Perhatikan `perPage` bisa 0 jika query tidak dikirim, dan `BuildMeta` mengubahnya menjadi 20 — tetapi **daftar yang dikembalikan** mungkin memakai nilai berbeda bila usecase juga menormalkan. Periksa usecase saat mengubah paginasi.

**(2)** `limit` diteruskan mentah ke `BuildMeta`, isu yang sama dengan 8.21: `meta.limit` bisa tidak sama dengan jumlah baris sebenarnya.

**(3)** Create mengembalikan 201 (`response.Created`), Update/Get/List 200. Delete mengembalikan `data: null`.

### 8.61.2 `faq/handler.go` dan `facility/handler.go`

**(1)** Keduanya punya rute publik (`/faqs`, `/facilities`) dan admin (`/admin/faqs`, `/admin/facilities`). Handler publik memakai service yang sama dengan `publishedOnly=true`; pastikan parameter itu benar-benar dikirim di setiap endpoint publik — satu kelalaian akan menampilkan draf.

**(2)** `facility` memiliki **dua** field kontrol tampil (`Status` dan `IsPublished`), sedangkan `faq` hanya `IsPublished`. Saat membaca endpoint publik, cari filter mana yang dipakai; jangan mengasumsikan keduanya setara.

**(3)** Handler `faq` menerima `category` di endpoint publik tanpa validasi; kategori asing menghasilkan daftar kosong (bukan 400).

### 8.61.3 `package/handler.go`

**(1)** Rute publik `/packages` mengembalikan paket aktif; rute admin memakai `activeOnly=false`. Parameter `activeOnly` adalah boolean yang ditentukan handler, bukan query pengguna — sehingga pengunjung tidak bisa meminta paket nonaktif lewat query.

**(2)** Field `PriceCents` dikirim apa adanya. Pastikan frontend memperlakukannya sebagai rupiah utuh (8.30); kalau tidak, harga tampil 100× lebih kecil.

### 8.61.4 `destinationinfo/handler.go`

**(1)** Memiliki endpoint `GET /destination-info` (publik, satu profil published) dan CRUD admin. Handler publik tidak memakai autentikasi; `GetPublished` mengembalikan satu objek, bukan daftar.

**(2)** Aksi `Publish`/`Archive` adalah endpoint terpisah (bukan PATCH status), sehingga tidak ada risiko `bool` tertimpa seperti di package/facility.

### 8.61.5 `visitorrule/handler.go`

**(1)** Struktur mirip FAQ: publik `GET /visitor-rules`, admin CRUD. `Update` menimpa `IsPublished` dari body — jebakan yang sama (8.34).

### 8.61.6 `analytics/handler.go`

```go
admin := rg.Group("/admin", requireAuth, RequireRole("ADMIN", "super_admin"))
admin.GET("/dashboard", h.AdminDashboard)
manager := rg.Group("/manager", requireAuth, RequireRole("MANAGER", "ADMIN", "super_admin"))
manager.GET("/analytics", h.ManagerAnalytics)
```

**(1)** Dashboard admin **hanya** untuk `ADMIN`/`super_admin`; manager tidak bisa melihat kartu statistik admin, tetapi bisa melihat analitiknya sendiri. Pembagian ini konsisten dengan menu frontend (`role-home.ts`).

**(2)** `ResolveRange` dipanggil di handler dengan empat query string (`range`, `custom`, `from`, `to`). Kesalahan format tanggal tidak menghasilkan 400 dari handler, tetapi dari service (8.25.1) — dan karena `day()` mengabaikan error parse, input rusak bisa menghasilkan rentang aneh alih-alih pesan jelas.

**(3)** Tidak ada cache pada kedua endpoint. Setiap membuka halaman analitik menjalankan belasan query agregat (8.25.3).

### 8.61.7 `audit/handler.go`

```go
var req ListRequest
if err := c.ShouldBindQuery(&req); err != nil { response.BadRequest(c, "invalid query parameters", nil); return }
if errs := ValidateStruct(req); errs != nil { response.ValidationFailed(c, errs); return }
logs, total, err := h.usecase.List(ctx, req)
response.OKWithMeta(c, "audit logs retrieved", logs, response.BuildMeta(req.Page, req.Limit, total))
```

**(1)** Ini satu-satunya handler yang memakai `ValidateStruct` dari paket domain (bukan `Validate` lokal). Pesan error-nya bisa berbeda format dari handler lain.

**(2)** `BuildMeta` memakai `req.Page`/`req.Limit` yang sudah divalidasi tag, tetapi service `audit.List` juga meng-clamp. Kalau `ListRequest` tidak membatasi `limit` maksimal, `meta.limit` bisa lebih besar dari jumlah baris.

**(3)** Rute dipasang pemanggil di bawah `/admin/audit` dengan `RequireRole("ADMIN")` saja — **tanpa** `super_admin` (8.55.4). Manager tidak punya akses ke halaman Aktivitas, sesuai komentar di routes.

**(4)** `StatsByAction`/`StatsByActor` menerima `from`/`to` tanpa validasi format. Rentang kosong berarti "semua waktu" atau "tidak ada", tergantung implementasi repository — periksa sebelum mengandalkan angka di dashboard audit.

### 8.61.8 `user/handler.go`

**(1)** `List` menerima `search` bebas dan meneruskannya ke repository. `SetActive` menerima `IsActive` boolean dari body; tidak ada endpoint untuk mengubah peran di sini (peran lewat domain `role`).

**(2)** `SetActive` tidak mengembalikan data pengguna, hanya `null`. Klien harus memuat ulang daftar untuk melihat status terbaru.

**(3)** Rute `user` dipasang di grup admin; manager bisa melihat daftar pengguna? Periksa `routes.go` domain user: bila grupnya `RequireRole("ADMIN")`, manager tidak bisa. Ini berbeda dari `visitors` yang memberi manager akses baca.

### 8.61.9 Repository yang tersisa

**(1)** `tickettype/repository.go` menyediakan `List`, `ListActive`, `FindByID`, `FindByCode`, `FindByCode` (untuk keunikan), `CountCategories`, `Create`, `Update`, `Delete`. Pola `findBy` mengembalikan `nil, nil` untuk not-found, konsisten dengan ticketing/auth.

**(2)** `analytics/repository.go` berisi query agregat (`TotalBookings`, `TotalTicketsSold`, `TotalRevenue`, `VisitorsCount`, `BookingsCreatedOn`, `TotalRevenueBetweenOn`, `TicketsAvailable`, `PendingPayments`, `ActiveStaffCount`, `BookingsByDateRange`, `VisitorsInRange`, `TicketPerformance`, `PaymentsByStatus`). Karena setiap angka adalah query sendiri, dashboard melakukan banyak round-trip (8.25.3). Saat mengubah definisi pendapatan, cari `RevenueStatuses` dan `StatusPaid` di file ini.

**(3)** `audit/repository.go` menyimpan `Metadata` sebagai teks JSON dan memfilter dengan `LIKE` untuk pencarian. Tidak ada indeks JSON; query berbasis isi metadata akan lambat.

**(4)** `public/repository.go` adalah satu-satunya repository yang melayani banyak tabel sekaligus (destinations, facilities, faqs, reviews, contents). Semua method-nya memaksa filter `active`/`published`, sehingga keamanan konten publik bergantung pada file ini — periksa setiap penambahan method baru.

**(5)** `user/repository.go` mengembalikan `AdminUser` (bukan `auth.User`), memilih kolom secara eksplisit. Ini pola yang benar untuk mencegah hash/password bocor.

## 8.62 Status akhir backend

Dengan 8.61, seluruh **domain** backend sudah dibahas minimal per-fungsi, dan alur transaksi (booking, payments, ticketing, auth) sudah baris-per-baris. Yang belum mendapat perlakuan baris-per-baris adalah beberapa handler CRUD dan repository agregat; strukturnya identik dengan yang sudah dibedah, dan letak perbedaannya sudah ditandai di atas.

Bagian berikutnya beralih ke **frontend**: services, store, lib, hooks, providers, komponen, dan seluruh halaman di `app/`. Urutannya mengikuti lapisan: klien API → service domain → state global → hook → komponen → halaman.

---

# Bagian 9 — Frontend, Berkas per Berkas

## 9.1 Peta frontend dan lapisan yang harus dipahami lebih dulu

```
app/            halaman (Next.js App Router) + layout per route group
features/       komponen & logika per fitur (public, gallery, admin, ...)
components/     komponen UI bersama (panel, form, dsb.)
providers/      provider React (theme, query, toast, ...)
hooks/          hook bersama (use-auth, use-debounce, ...)
services/       pemanggilan API per domain (tipis, di atas apiClient)
lib/            utilitas murni (jwt, permission, currency, api client)
store/          state global Zustand (auth, booking, language, wishlist)
types/          tipe TypeScript bersama
config/         konfigurasi statis (payment methods, menu, dsb.)
```

**(1)** Aturan dependensi yang berlaku di frontend: `app` → `features` → `services`/`hooks`/`store` → `lib`/`types`. `lib` tidak boleh mengimpor `features` atau `store`; `services` tidak boleh mengimpor komponen. Pelanggaran aturan ini (mis. service mengimpor store) membuat kode sulit diuji dan memicu impor melingkar.

**(2)** Hampir semua halaman interaktif memakai `"use client"`. Halaman yang dirender server (RSC) hanya yang tidak butuh state; `apiUrl` di `lib/api/client.ts` menangani perbedaan server/browser (7.5.2).

**(3)** Data mengalir satu arah: komponen memanggil hook/service, service memanggil `apiClient`, `apiClient` memakai cookie HttpOnly. Tidak ada token di `localStorage` — kecuali sisa `kpr-auth` yang dihapus saat sesi berakhir.

**(4)** Tipe dari backend diduplikasi manual di `types/`. Tidak ada code generation, sehingga perubahan DTO backend tidak otomatis terdeteksi TypeScript. Ini sumber utama bug "field undefined" di UI.

## 9.2 `frontend/services` — daftar lengkap dan pola

```
analytics.api.service.ts   article.service.ts        audit.api.service.ts
auth.api.service.ts        booking.api.service.ts    destination-info.service.ts
destination.service.ts     eticket.api.service.ts    facility.service.ts
faq.service.ts             gallery.service.ts        payment.api.service.ts
scanner.api.service.ts     staff.api.service.ts      ticket.api.service.ts
upload.service.ts          visitor-rule.service.ts   visitor.api.service.ts
```

**(1)** Ada dua gaya penamaan: `*.api.service.ts` (domain transaksi/auth) dan `*.service.ts` (konten). Keduanya mengekspor objek literal dengan method async, bukan class. Tidak ada perbedaan perilaku; penamaannya warisan sejarah.

**(2)** **Koreksi:** seluruh 18 service memakai `apiClient` dari `lib/api/client`; tidak ada yang memanggil `fetch` langsung. Karena itu semua mewarisi penanganan 401/refresh/timeout yang sama (7.5.2).

**(3)** Konvensi balikan: method daftar mengembalikan `response.data ?? []` (bukan melempar saat kosong), method detail mengembalikan `response.data` dan membiarkan `null`, method mutasi melempar `BookingError`/`PaymentError` bila `success=false`. Ini tidak seragam di semua file; periksa tiap service sebelum menambah penanganan error di komponen.

**(4)** `scanner.api.service.ts` memanggil `/petugas/scanner/validate` (bukan `/tickets/validate`) dan mengembalikan objek bertipe `ValidateTicketResponse`. Tipe itu salah mengasumsikan `status`/`ticket` berada di level atas, padahal backend membungkusnya dalam `data` — lihat bug lengkap di 9.8.

**(5)** `eticket.api.service.ts` mengambil e-tiket berdasarkan booking dan menandai unduhan. Penandaan unduhan hanya hook audit di backend (tidak menyimpan file), karena PDF dibuat di klien (`lib/eticket-pdf.ts`).

**(6)** `upload.service.ts` memakai `postForm` (multipart). Ini satu-satunya jalur yang menghapus header `Content-Type` agar browser menetapkan boundary (7.5.2).
## 9.3 `frontend/lib` — utilitas yang menentukan angka dan tampilan

### 9.3.1 `business.ts` — perhitungan dan tabel

```ts
export function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}
```

**(1)** `Math.round` membuang pecahan rupiah. Format `id-ID` memakai titik sebagai pemisah ribuan (`Rp 150.000`). Ini formatter yang dipakai hampir semua halaman; `currency.ts` memakai pendekatan berbeda (9.3.2).

```ts
export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}
```

**(1)** Trik `getTime() - offset` membuat `toISOString()` menghasilkan tanggal **lokal**, bukan UTC. Tanpa ini, pengguna di WIB yang membuka halaman pukul 06:00 akan melihat tanggal kemarin (karena UTC masih hari sebelumnya).

**(2)** `addDaysISO` sengaja memakai komponen lokal (`new Date(y, m-1, d)`), bukan `Date.parse` + `toISOString`, dengan alasan yang sama. Komentar di kode menyebut bug nyata: tanggal minimum pemesanan pernah mundur satu hari.

```ts
export function generateBookingId(dateISO: string = todayISO()): string {
  return `KP-${dateISO.replace(/-/g, "")}-${randomSeq(6)}`;
}
export function generatePaymentId(...) { return `PAY-...-${randomSeq(6)}`; }
export function generateTicketId() { ... return `TK-${s}`; }
```

**(1)** Ketiga fungsi membuat ID **palsu di klien** dengan `Math.random`. ID sebenarnya dibuat backend (`generateBookingCode`, `generateReference`, `uniqueQRData`). Fungsi ini sisa mode mock/seed dan **tidak boleh** dipakai untuk data yang dikirim ke API.

**(2)** Formatnya menyerupai ID asli tetapi berbeda: booking asli memakai hex **huruf kecil**, di sini digit; payment asli `PAY-KP-<timestamp>-<12hex>`, di sini `PAY-YYYYMMDD-000123`; tiket asli `KPT-<18hex>`, di sini `TK-XXXXXX`. Kalau ada komponen yang memakainya sebagai tampilan sementara, ID itu tidak akan ditemukan backend.

```ts
export function calculateBookingTotals(items, overrides?): BookingTotals {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const serviceFee = totalTickets > 0 ? (overrides?.serviceFee ?? BOOKING_CONFIG.serviceFee) : 0;
  const discount = Math.round((subtotal * discountPercent) / 100);
  const tax = Math.round(((subtotal - discount) * taxPercent) / 100);
  const total = Math.max(0, subtotal - discount + serviceFee + tax);
}
```

**(1)** **Sudah diperbaiki.** Sebelumnya `BOOKING_CONFIG.serviceFee` adalah nominal tetap (Rp 2.500) sedangkan backend memakai **2% dari subtotal** (`booking.serviceFeeRate`). Sekarang config memakai `serviceFeePercent: 2` dan `calculateBookingTotals` menghitung `Math.round(subtotal * 2 / 100)`, sama dengan `int64(float64(subtotal)*2/100 + 0.5)` di backend.

**(2)** Selama ringkasan di halaman pembayaran memakai data dari API (`booking.service_fee`, `booking.total`), ketidakcocokan ini tidak terlihat. Ia muncul bila komponen memakai `calculateBookingTotals` untuk pratinjau sebelum memesan — dan itu memang terjadi di form pemesanan (9.6). Pratinjau bisa berbeda dengan total akhir.

**(3)** Diskon dan pajak ada di sini tetapi selalu 0 di backend (belum diimplementasikan). Menampilkan keduanya di UI tanpa dukungan backend akan menghasilkan total yang tidak pernah ditagih.

```ts
export function paginate<T>(rows, page, pageSize) { ... }
export function searchIn<T>(rows, needle, keys) { ... }
export function sortData<T>(rows, key, dir) { ... }
```

**(1)** Ini "table engine" yang dipakai tabel admin yang mengambil **seluruh** data lalu memproses di klien. Untuk data kecil cepat, tetapi untuk ribuan booking, semua baris diunduh lebih dulu. Tabel yang memakai ini biasanya juga punya paginasi server — pastikan tidak menggabungkan keduanya (memotong halaman server lalu memotong lagi di klien).

**(2)** `searchIn` membandingkan `String(row[k])`, sehingga angka dan boolean ikut tertelusuri. `sortData` mendeteksi angka vs string; tanggal ISO akan diurutkan sebagai string dan tetap benar karena formatnya terurut.

### 9.3.2 `currency.ts` — pembagian 100 yang hanya cocok untuk paket

```ts
export function formatCurrency(cents: number, currency = "IDR"): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, ... }).format(amount);
}
```

**(1)** Komentar menyebut "nominal dari backend selalu bilangan bulat dalam sen (price_cents/unit_cents)". Itu benar untuk `package.PriceCents`, tetapi **tidak** untuk tiket dan booking yang memakai rupiah utuh. Memakai `formatCurrency` pada `ticket.price` akan menampilkan harga 100× lebih kecil.

**(2)** Dua formatter (`rupiah` dan `formatCurrency`) hidup berdampingan tanpa aturan pemakaian yang jelas. Saat menambah halaman, pilih berdasarkan satuan data: `rupiah` untuk tiket/booking/pembayaran, `formatCurrency` untuk paket.

### 9.3.3 `jwt.ts`

```ts
const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
return Array.isArray(decoded.roles) ? decoded.roles : [];
```

**(1)** Berbeda dari `middleware.ts` yang menambahkan padding sebelum `atob`, fungsi ini **tidak** menambahkan padding. Payload JWT yang panjangnya tidak kelipatan 4 akan membuat `atob` melempar, `catch` mengembalikan `[]`, dan pengguna dianggap tidak punya peran — menu panel bisa kosong meski token valid.

**(2)** Ini hanya untuk tampilan. Backend tetap memverifikasi peran; token palsu hanya menampilkan menu yang salah, bukan memberi akses. Komentar di file menegaskan hal ini dan sebaiknya dipertahankan.

**(3)** `decoded` bertipe `any`; tidak ada validasi bentuk selain `Array.isArray(roles)`. Elemen array bisa bukan string, dan `hasRole` akan membandingkannya dengan string dengan hasil `false`.

### 9.3.4 `permission.ts`

```ts
export function hasRole(userRoles: string[], ...allowed: string[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}
export function isAdmin(userRoles: string[]): boolean {
  return hasRole(userRoles, "ADMIN", "admin");
}
```

**(1)** Perbandingan **case-sensitive**. Backend memakai `EqualFold`/`ToUpper`, jadi `"admin"` dan `"ADMIN"` setara di sana, tetapi di UI tidak. Peran `"Super_Admin"` atau `"SUPER_ADMIN"` tidak dianggap admin oleh `isAdmin`, sehingga tombol admin bisa hilang untuk akun super admin.

**(2)** `isAdmin` hanya menyebut `ADMIN`/`admin`, tidak `super_admin`, meski `role-home.ts` mengenalinya. Ketidakkonsistenan ini membuat super admin diarahkan ke panel admin tetapi tidak melihat tombol yang sama.

**(3)** Semua ini hanya UX. Jangan memakainya untuk menyembunyikan data sensitif; backend tetap mengirim data jika rutenya tidak dilindungi.

### 9.3.5 `role-home.ts`

```ts
if (roles.some(r => ["ADMIN","SUPER_ADMIN","super_admin"].includes(r))) return "/admin/dashboard";
if (roles.includes("MANAGER")) return "/manager/dashboard";
if (roles.includes("PETUGAS")) return "/petugas/dashboard";
return "/dashboard";
```

**(1)** Urutan prioritas: admin menang atas manager, manager menang atas petugas. Pengguna dengan dua peran selalu diarahkan ke panel dengan hak tertinggi.

**(2)** Peran `"super_admin"` dikenali, tetapi `"Super_Admin"` atau `"SUPER ADMIN"` tidak. Karena backend menyimpan nama peran persis dari seed, nilainya biasanya `ADMIN`/`MANAGER`/`PETUGAS`/`PENGUNJUNG`; `super_admin` hanya ada bila dibuat manual.

**(3)** Pengunjung (termasuk tanpa peran) diarahkan ke `/dashboard`, yang merupakan area pengunjung. Pengguna yang belum login tetapi memanggil fungsi ini juga mendapat `/dashboard`, lalu middleware akan mengalihkannya ke login.

### 9.3.6 `redirect.ts` — pertahanan open redirect

```ts
if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
if (value.includes("\\") || value.includes("\u0000")) return fallback;
const url = new URL(value, "https://internal.invalid");
if (url.origin !== base) return fallback;
return `${url.pathname}${url.search}${url.hash}`;
```

**(1)** Empat lapis: wajib path absolut internal, tolak `//` (protocol-relative), tolak backslash (dipakai browser sebagai `/`), dan verifikasi origin setelah `new URL`. Kombinasi ini menutup `https://evil.com`, `//evil.com`, `/\evil.com`, dan `javascript:`.

**(2)** `javascript:alert(1)` tidak diawali `/`, jadi langsung ditolak. Bahkan bila lolos, `new URL` akan menghasilkan origin berbeda.

**(3)** Nilai yang dikembalikan adalah path + query + hash, bukan URL absolut. Ini memastikan `router.push` tetap di origin aplikasi.

### 9.3.7 `utils.ts`

**(1)** `cn(...inputs)` menggabungkan `clsx` dan `tailwind-merge`. Fungsi `twMerge` memastikan kelas Tailwind yang bertabrakan (mis. `p-2` dan `p-4`) diambil yang terakhir, sehingga komponen bisa menimpa kelas default lewat prop `className`.

**(2)** Ini satu-satunya isi `utils.ts`; tidak ada helper tanggal/angka di sini. Pemisahan itu disengaja: `business.ts` untuk logika bisnis, `currency.ts` untuk format uang, `date.ts` untuk tanggal.

## 9.4 `frontend/hooks` — jembatan komponen ke service

### 9.4.1 `use-auth.ts`

```ts
export function useHasRole(): (...roles: AppRole[]) => boolean {
  const role = useAuthStore((s) => s.user?.role ?? null);
  return useCallback((...roles: AppRole[]) => role !== null && roles.includes(role), [role]);
}
```

**(1)** Peran disimpan sebagai **satu** string (`user.role`), bukan array. Pengguna dengan beberapa peran hanya memakai peran utama yang dikirim backend (8.16). Akibatnya `useHasRole("MANAGER")` bernilai false untuk admin yang juga manager, meski backend mengizinkannya.

**(2)** Perbandingan `roles.includes(role)` case-sensitive. Nilai `AppRole` berasal dari `config/auth.config.ts`; kalau backend mengirim `"admin"` sementara konfigurasi memakai `"ADMIN"`, semua pemeriksaan gagal.

```ts
const target = safeRedirectPath(creds.redirectTo ?? redirectTo ?? readRedirectParam(), result.redirectTo);
router.push(target);
```

**(1)** Prioritas redirect: tujuan eksplisit pemanggil → prop hook → `?redirect=` → default dari service (`result.redirectTo`, biasanya halaman per peran). Semua melewati `safeRedirectPath`, sehingga open redirect tertutup.

**(2)** `authService.login` mengembalikan `redirectTo` yang dihitung klien (dari peran di token), bukan dari backend. Kalau token tidak memuat peran, default-nya `/` atau `/dashboard` — pengguna bisa mendarat di halaman yang bukan panelnya, lalu diarahkan `useRouteGuard`.

```ts
export function useLogout() {
  return useCallback(async () => { await authService.logout(); router.push("/login"); }, [router]);
}
```

**(1)** `authService.logout()` dipanggil tanpa `try/catch`. Kalau endpoint gagal (mis. jaringan putus), promise reject dan **redirect tidak terjadi**; pengguna tetap di halaman dengan sesi yang mungkin sudah tidak valid. Sebaiknya redirect tetap dilakukan di `finally`.

**(2)** Logout tidak membersihkan `useAuthStore` secara eksplisit di sini. Pembersihan bergantung pada `authService.logout` atau `auth-provider`; kalau tidak, `user` masih terisi sampai halaman dimuat ulang.

### 9.4.2 `use-route-guard.ts`

```ts
if (!ready) return "checking";
if (!user) return "checking";
if (!allowed.includes(user.role)) return "denied";
return "allowed";
```

**(1)** Tiga status dipakai komponen untuk merender `null` selama `checking`, sehingga panel tidak berkedip menampilkan konten sebelum sesi diketahui. Ini UX yang benar, tetapi berarti halaman kosong sesaat pada koneksi lambat.

**(2)** Efek samping redirect dijalankan di `useEffect`, setelah render. Artinya komponen sempat dirender dengan status `denied` sebelum `router.replace` selesai; pastikan komponen tidak merender data sensitif saat `denied`.

**(3)** `allowed.includes(user.role)` kembali memakai peran tunggal dan case-sensitive (9.4.1). Rute admin yang mengizinkan `["ADMIN","MANAGER"]` tidak akan meloloskan `super_admin`.

**(4)** `eslint-disable react-hooks/exhaustive-deps` menonaktifkan peringatan karena `allowed` adalah array literal yang dibuat ulang setiap render. Kalau `allowed` berubah isinya saat runtime, guard tidak akan bereaksi — array dianggap konstan.

### 9.4.3 Hook data (`use-articles`, `use-analytics`, `use-audit`, `use-destinations`, `use-gallery`, `use-faq`, `use-facility`, `use-visitor-rule`, `use-destination-info`, `use-admin-users`)

**(1)** **Koreksi:** sepuluh dari dua belas hook (semua kecuali `use-auth` dan `use-route-guard`) memakai **React Query** (`useQuery`/`useMutation`), bukan `useState` + `useEffect`. Polanya: `useQuery({ queryKey: [...], queryFn: () => service.list(params) })` untuk baca, dan `useMutation` dengan `qc.invalidateQueries` untuk tulis. Contoh paling lengkap: `use-articles` (43 baris).

**(2)** Mutasi otomatis menginvalidasi query terkait, sehingga tabel memuat ulang setelah create/publish/delete tanpa `refetch` manual. Ini menjelaskan mengapa panel CMS terasa segar; halaman yang **tidak** memakai hook ini (mis. `my-bookings-list`) harus memanggil ulang sendiri.

**(3)** `queryKey` menyertakan objek parameter (`["articles", params]`). Kalau pemanggil membuat objek baru setiap render dengan isi sama, React Query tetap menganggapnya sama karena perbandingan struktural, jadi tidak memicu fetch berulang.

**(4)** `use-admin-users` (19 baris), `use-analytics` (18 baris), dan `use-audit` (22 baris) sangat tipis karena logika ada di service; hook hanya membungkus query. Halaman tinggal membaca `data`, `isLoading`, `isError`.

**(5)** Error muncul sebagai `isError` di komponen, bukan string. Komponen harus menampilkan pesan sendiri (biasanya `EmptyState title="Gagal memuat ..."`), sehingga detail error dari backend (mis. 403) tidak pernah terlihat pengguna — baik untuk keamanan, buruk untuk diagnosis.
## 9.5 `frontend/store/auth.store.ts` — profil di localStorage, token di cookie

```ts
login: (user, remember) => {
  const ttl = remember ? SESSION_DURATION_MS * 7 : SESSION_DURATION_MS;
  set({ user, expiresAt: Date.now() + ttl, remember });
},
```

**(1)** Store hanya menyimpan **profil** (id, nama, email, telepon, peran, gate, shift), bukan token. Komentar di file menegaskan token ada di cookie HttpOnly. Ini pemisahan yang benar: XSS tidak bisa mencuri sesi dari localStorage.

**(2)** `expiresAt` adalah perkiraan UI, bukan masa berlaku token sebenarnya. `remember` menggandakan TTL menjadi 7×. Backend tetap yang menentukan; store hanya memutuskan kapan berhenti menampilkan pengguna sebagai login.

**(3)** `persist` menulis `user`, `expiresAt`, dan `remember` ke localStorage dengan kunci `kpr-auth`. Profil (email, telepon) jadi tersimpan di perangkat — bukan rahasia, tetapi perlu diingat saat menangani perangkat bersama.

**(4)** `checkExpiry` menghapus sesi bila `Date.now() > expiresAt`. Namun fungsi ini harus dipanggil secara berkala oleh provider; kalau tidak, pengguna tetap tampak login di UI meski `expiresAt` lewat.

**(5)** `updateUser` menerima patch `name`/`email`/`phone` saja, bukan `role`. Peran hanya berubah lewat login/`checkSession`, sehingga perubahan peran oleh admin tidak tercermin sampai pengguna login ulang.

## 9.6 `frontend/providers` — lima provider, satu yang benar-benar bekerja

### 9.6.1 `auth-provider.tsx`

```ts
let hydrated = false;
export function AuthProvider({ children }) {
  const [ready, setReady] = useState(hydrated);
  useEffect(() => { authService.checkSession().finally(() => { hydrated = true; setReady(true); }); }, []);
  if (!ready) return <>{children}</>;
  return <>{children}</>;
}
```

**(1)** Kedua cabang mengembalikan `children` yang sama. Artinya `ready` **tidak berpengaruh pada render** — provider ini tidak menahan halaman selama sesi diperiksa. Panel bisa merender dengan `user` dari localStorage sebelum `/auth/me` selesai, lalu berubah setelahnya (kedip).

**(2)** `hydrated` adalah variabel modul, bukan state. Ia bertahan antar navigasi klien tetapi di-reset pada full reload. Ini cukup untuk mencegah `checkSession` berulang saat pindah halaman.

**(3)** `checkSession` selalu dipanggil saat mount, termasuk untuk pengunjung anonim. Request `GET /auth/me` yang gagal 401 akan memicu `logout` di service. Untuk halaman publik, ini menambah satu request yang tidak perlu.

**(4)** Komentar menyebut "rehidrasi dari localStorage", padahal yang sebenarnya terjadi adalah validasi ke backend. localStorage hanya menyediakan profil awal.

### 9.6.2 `useAuthReady`

```ts
const [ready, setReady] = useState(hydrated);
useEffect(() => {
  if (!hydrated) { authService.checkSession().finally(() => { hydrated = true; setReady(true); }); }
  setReady(true);
}, []);
```

**(1)** `setReady(true)` dipanggil di luar `finally`, sehingga status menjadi ready **segera** setelah effect berjalan, bahkan jika `checkSession` masih berlangsung. Guard bisa lolos sebelum sesi terverifikasi — kebalikan dari tujuan komentar "hindari redirect palsu".

**(2)** Kalau `hydrated` sudah true (navigasi berikutnya), `checkSession` tidak dipanggil lagi; sesi tidak diperbarui sampai reload. Perubahan peran di server tidak terlihat.

### 9.6.3 `session-provider.tsx`

**(1)** Komponen ini hanya mengembalikan `children`. Komentarnya menyebut proyek tidak memakai NextAuth, tetapi juga menyatakan frontend "menyimpan sesi di store (dip persist ke localStorage), bukan cookie sesi sisi server" — bertentangan dengan kenyataan bahwa autentikasi memakai cookie HttpOnly. Dokumentasi di file ini menyesatkan dan sebaiknya diperbarui.

**(2)** Keberadaannya hanya untuk struktur folder; tidak ada efek runtime.

### 9.6.4 `query-provider.tsx`, `theme-provider.tsx`, `toast-provider.tsx`

**(1)** `query-provider` membungkus aplikasi dengan `QueryClientProvider` (React Query), tetapi hook data (9.4.3) tidak memakainya. Jadi cache/tanstack tersedia namun tidak dimanfaatkan; menambah `useQuery` di hook baru akan bekerja tanpa perubahan provider.

**(2)** `theme-provider` biasanya membungkus `next-themes` dan menambahkan kelas `dark` pada `<html>`. Karena sebagian besar komponen memakai warna hardcode (`#1768ad`, `#17324d`), mode gelap tidak akan mengubah tampilan kecuali kelas Tailwind `dark:` ditambahkan manual.

**(3)** `toast-provider` memasang `<Toaster />` dari `sonner`. Semua notifikasi di aplikasi memakai `toast.success/error/warning`; tanpa provider ini, panggilan toast tidak menampilkan apa pun.

## 9.7 `frontend/services/auth.api.service.ts` — satu-satunya service yang menulis ke store

```ts
const response = await apiClient.post<LoginResponse>("/auth/login", { email, password });
if (!response.success || !response.data?.user) throw new AuthError(...);
const user = mapBackendUserToSessionUser(response.data.user);
useAuthStore.getState().login(user, remember);
return { user, redirectTo: POST_LOGIN_HOME[user.role as AppRole] ?? "/" };
```

**(1)** Ini satu-satunya service yang memanggil store secara langsung. Konsekuensinya, login/registrasi/refresh profil selalu memperbarui UI tanpa komponen harus melakukannya. Tetapi juga berarti service tidak murni sebagai pemanggil API; sulit diuji tanpa store.

**(2)** `remember` **tidak dikirim ke backend**. Backend selalu menerbitkan cookie akses berumur pendek dan refresh 7 hari; `remember` hanya memperpanjang `expiresAt` di UI. Jadi "ingat saya" tidak benar-benar memperpanjang sesi server — bila refresh token kedaluwarsa, pengguna tetap logout meski UI mengira masih login.

**(3)** `redirectTo` dihitung dari `POST_LOGIN_HOME[user.role]`. Kalau backend mengirim peran yang tidak ada di peta (mis. `super_admin`), hasilnya `"/"`, bukan panel admin. `role-home.ts` punya pemetaan berbeda (mengenal `super_admin`), sehingga dua jalur redirect bisa menghasilkan tujuan berbeda.

**(4)** `mapBackendUserToSessionUser` memakai `user.role` apa adanya. `UserResponse` backend hanya punya satu `role`, jadi tidak ada cara menyimpan multi-peran.

```ts
async updateProfile(patch) {
  const current = useAuthStore.getState().user;
  if (!current) throw new AuthError("Belum login.");
  const response = await apiClient.patch<ApiResponse<User>>("/auth/profile", patch);
  ...
  useAuthStore.getState().updateUser(user);
}
```

**(1)** `updateUser(user)` menerima `SessionUser`, tetapi `updateUser` di store bertipe `Partial<Pick<SessionUser,...>>`. Secara struktural ini valid (objek penuh memenuhi partial), tetapi efeknya **hanya** `name/email/phone` yang diambil; `role` dari respons diabaikan. Kalau backend mengubah peran saat update profil, UI tidak tahu.

**(2)** Jika email diubah, backend menandai `IsVerified=false` dan mengirim verifikasi. UI tetap menampilkan pengguna sebagai login; tidak ada indikator "email belum diverifikasi" kecuali komponen membacanya dari respons.

```ts
async checkSession() {
  try { const response = await apiClient.get<MeResponse>("/auth/me"); ... }
  catch (err) { if (err instanceof ApiError && (err.status === 401 || err.status === 403)) useAuthStore.getState().logout(); }
}
```

**(1)** Hanya 401/403 yang menghapus sesi; kegagalan jaringan membiarkan profil lama. Ini konsisten dengan `apiClient` (7.5.2) dan mencegah logout karena Wi-Fi putus.

**(2)** Saat berhasil, `login(user, true)` dipanggil dengan `remember=true`, sehingga TTL UI diperpanjang 7× setiap kali sesi divalidasi. Efeknya, pengguna yang aktif tidak pernah melihat sesi kedaluwarsa di UI meski tidak mencentang "ingat saya".

## 9.8 `frontend/services/scanner.api.service.ts` — dan satu bug integrasi yang serius

```ts
async validateTicket(payload: ValidateTicketRequest): Promise<ValidateTicketResponse> {
  const response = await apiClient.post<ValidateTicketResponse>("/petugas/scanner/validate", payload);
  return response;
}
```

**(1)** Tipe `ValidateTicketResponse` di `types/api.ts` mendeklarasikan `status` dan `ticket` di **level atas**:
```ts
export interface ValidateTicketResponse {
  success: boolean;
  message?: string;
  status: ScanStatus;
  ticket?: ETicket;
}
```
Padahal backend membalas envelope standar: `{ success, message, data: { success, message, status, ticket } }`. **Sudah diperbaiki:** `scannerService.validateTicket` kini membaca `ApiResponse<{status, message?, ticket?}>`, mengambil `response.data.status`, dan melempar `ScannerError` bila envelope gagal — jadi hasil valid tidak lagi jatuh ke `?? "INVALID"`.

**(2)** Perbaikan yang benar: baca `response.data.status` (dan `response.data.message`, `response.data.ticket`), dengan tipe `ApiResponse<{status; message; ticket}>`. Ini juga menjelaskan kenapa pengujian manual scan terasa "selalu gagal" meski log backend menunjukkan `VALID`.

**(3)** `lookupTicket` memakai parameter `ref` dan endpoint `/petugas/scanner/ticket`, sesuai rute backend. Error ditelan menjadi `null`, sehingga komponen tidak bisa membedakan "tiket tidak ada" dari "server mati".

**(4)** `getHistory` mengirim `gate`, `petugas`, `from`, `to` sebagai string kosong bila tidak diisi. Backend memperlakukan string kosong sebagai "tanpa filter", jadi ini bekerja — tetapi `status` ada di parameter frontend dan **tidak dikirim** ke backend (backend memang tidak memfilternya di endpoint history).

**(5)** `getMonitoring` memeriksa `response.success` secara manual lalu mengembalikan `response.data!`. Ini satu-satunya method di file yang memeriksa envelope; `validateTicket` tidak. Ketidakkonsistenan inilah yang melahirkan bug (1).

**(6)** Semua endpoint scanner berada di grup `PETUGAS` di backend. Admin dan manager **tidak** bisa memanggil `/petugas/scanner/*` meski mereka bisa melihat monitoring lewat `/manager/monitoring`. Halaman scan karena itu hanya untuk petugas, sesuai middleware.
## 9.9 `frontend/components` — 23 file, 2.023 baris

**(1)** Banyak direktori di `components/` **kosong** (booking, cards, charts, dialogs, destination, error, event, faq, forms, gallery, header, hero, maps, modals, notification, payment, review, seo, ticket, weather). Implementasinya pindah ke `features/*/components`. Saat mencari komponen, cek `features` lebih dulu; folder kosong hanya sisa struktur awal.

**(2)** Yang tersisa dan benar-benar dipakai: `layout/panel-layout.tsx` (kerangka semua panel), `panel/*` (UI panel), `navbar`, `footer`, `sidebar`, `inputs/*`, `ui/*`, `pagination`, `tables`, `brand`, `empty`, `loading`.

### 9.9.1 `layout/panel-layout.tsx` — tiga mode tata letak

```ts
function isActive(href: string) {
  if (pathname === href) return true;
  if (href === isDashboardHome) return false;
  return pathname.startsWith(`${href}/`);
}
```

**(1)** Menu dashboard hanya aktif pada kecocokan persis; menu lain aktif juga untuk sub-rute (`/admin/bookings/123` menandai `/admin/bookings` aktif). `isDashboardHome` diambil dari `links[0].href`, jadi **urutan link menentukan** perilaku ini. Kalau link pertama bukan dashboard, aturan "jangan aktifkan untuk sub-rute" salah sasaran.

**(2)** `pathname.startsWith` bisa salah untuk href yang menjadi awalan href lain (mis. `/admin/user` dan `/admin/users`). Saat ini tidak ada kasus seperti itu, tetapi menambah rute serupa akan membuat dua menu menyala bersamaan.

```ts
const sections = links.reduce<NavSection[]>((acc, link) => {
  const last = acc[acc.length - 1];
  if (last && last.section === link.section) last.items.push(link);
  else acc.push({ section: link.section, items: [link] });
  return acc;
}, []);
```

**(1)** Pengelompokan hanya menggabungkan section yang **berurutan**. Kalau daftar link berisi section A, B, lalu A lagi, akan muncul dua grup A. Ini konsekuensi sederhana yang wajar, tetapi berarti urutan array link harus dijaga saat menambah menu.

**(2)** `key={group.section ?? gi}`: grup tanpa section memakai indeks, aman karena urutan stabil. Grup dengan nama section memakai nama, sehingga React bisa mempertahankan DOM saat urutan berubah.

```ts
function signOut() {
  logout();
  toast.success("Logout berhasil");
  router.push("/login");
}
```

**(1)** `logout()` adalah async dan **tidak di-`await`**. `useLogout` sendiri sudah memanggil `router.push("/login")` setelah `authService.logout()` selesai, jadi ada dua navigasi: satu langsung di sini, satu lagi setelah request selesai. Navigasi kedua bisa memicu peringatan atau mengembalikan pengguna ke `/login` saat ia sudah pindah.

**(2)** Toast "Logout berhasil" muncul **sebelum** logout selesai. Jika request gagal, service tetap membersihkan store (finally), jadi secara UX hasilnya benar — tetapi pesan sukses tidak mencerminkan hasil jaringan.

**(3)** Tombol logout ada di tiga tempat (rail, sidebar, drawer) dengan handler yang sama. Tidak ada konfirmasi; satu klik langsung keluar.

**(4)** Drawer: `role="dialog"`, `aria-modal`, scrim `<button>` untuk menutup, `Escape` ditangani, scroll body dikunci, dan drawer ditutup saat rute berubah atau layar melebar. Ini implementasi aksesibilitas yang lengkap dan jarang ditemukan di proyek seukuran ini.

**(5)** Tiga mode: drawer (< 1024px), rail ikon 68px (tablet dengan mouse), sidebar 200px (≥ 1024px). Aturan pointer ada di `globals.css` (`.panel-rail`, `.panel-burger`) supaya tablet sentuh tidak terjebak rail tanpa label. Pemisahan CSS itu penting: media query saja tidak cukup karena perangkat 900px bisa sentuh atau mouse.

**(6)** Header memakai `position: sticky` dan sidebar `sticky top-16` dengan tinggi `calc(100dvh-64px)`. `dvh` (bukan `vh`) menghindari lompatan saat address bar browser seluler muncul/hilang.

### 9.9.2 `panel/panel-ui.tsx` — komponen visual panel

```ts
const STATUS_TONE: Record<string, string> = {
  berhasil: "...", valid: "...", aktif: "...", menunggu: "...", dibatalkan: "...", ...
};
const tone = STATUS_TONE[status.toLowerCase()] ?? "bg-[#e9f3fb] text-[#1768ad]";
```

**(1)** Kunci peta status berbahasa Indonesia dan huruf kecil, sedangkan data backend memakai enum Inggris huruf besar: `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`, `VALID`, `USED`, `ACTIVE`. Hanya `valid`/`aktif` yang match (karena di-lowercase), sedangkan `PAID`/`PENDING` tidak — semuanya jatuh ke warna biru default.

**(2)** Akibatnya tabel booking tidak membedakan status secara visual: lunas dan menunggu pembayaran tampak sama. Ini bukan bug fatal, tetapi menghilangkan manfaat utama status pill. Perbaikan: tambahkan kunci `pending`, `paid`, `expired`, `cancelled`, `used`, `inactive` ke peta.

**(3)** `status` ditampilkan apa adanya (huruf besar). Untuk pengguna Indonesia, `PENDING`/`PAID` belum diterjemahkan; sebagian halaman menerjemahkan sendiri, sebagian tidak.

```ts
export function LineChart({ data, height = 175 }) {
  ...
  const points = data.map((d, i) => { ... });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}
```

**(1)** Grafik SVG tanpa library. `viewBox` 960×175 discaled ke lebar kontainer (`w-full h-auto`), jadi tetap tajam di layar retina.

**(2)** Sumbu Y tidak diberi label angka; hanya lima gridline horizontal. Pembaca tidak bisa mengetahui nilai absolut dari grafik, hanya bentuk tren. Nilai tersedia di tooltip? Tidak ada tooltip — `aria-label="Grafik garis"` hanya untuk pembaca layar, bukan nilai.

**(3)** Label X juga tidak dirender. Untuk data 30 hari, menampilkan semua label akan bertumpuk, jadi keputusan menghilangkannya masuk akal, tetapi tidak ada penanda tanggal sama sekali.

**(4)** `Math.min(...values, 0)` membuat baseline selalu 0 bila semua nilai positif. Range minimal 1 mencegah pembagian nol saat semua nilai sama.

**(5)** `data.length === 1` menempatkan titik di tengah; tanpa cabang ini terjadi pembagian dengan nol (`i / 0`).

```ts
export function BarChart({ data, valueSuffix = "" }) { ... }
```

**(1)** `valueSuffix` dideklarasikan tetapi **tidak dipakai** di JSX. Nilai batang tidak ditampilkan sama sekali; hanya tinggi relatif dan label. Ini parameter mati yang menyesatkan pemanggil.

**(2)** Tinggi minimum 18% memastikan nilai kecil tetap terlihat, tetapi mendistorsi perbandingan: nilai 1 dan nilai 10 bisa tampak mirip.

```ts
export function PieChart({ data, size = 175 }) {
  const total = Math.max(data.reduce((sum, d) => sum + d.value, 0), 1);
  ...
  <circle cx={cx} cy={cy} r="32" fill="white" />
}
```

**(1)** Donat digambar manual dengan arc SVG; lingkaran putih di tengah membuatnya donat. `total` minimal 1 mencegah pembagian nol saat semua nilai 0.

**(2)** Segmen dengan nilai 0 menghasilkan path dengan panjang busur 0 — tidak terlihat, tetapi tetap ada di DOM dan di legenda dengan angka 0.

**(3)** Legenda menampilkan nilai `toLocaleString("id-ID")`. Tidak ada persentase, padahal komposisi biasanya lebih mudah dibaca dalam persen. Pembaca harus menghitung sendiri.

**(4)** Warna default hanya empat; data lebih dari empat akan mengulang warna (`colors[i % colors.length]`), sehingga dua kategori bisa tampak sama.

```ts
export function InfoTile({ title, desc, href, badge }) {
  return <a href={href} ...>{badge ?? "[]"}</a>;
}
```

**(1)** Memakai `<a>` biasa, bukan `next/link`. Klik akan melakukan **full page reload**, kehilangan state dan cache, berbeda dari navigasi lain di panel. Seharusnya `Link`.

**(2)** Placeholder ikon `"[]"` muncul bila `badge` tidak diberikan — terlihat seperti teks rusak, bukan ikon.

**(3)** `ProgressList` menormalkan lebar batang terhadap nilai **tertinggi**, bukan total. Batang terpanjang selalu 100%, jadi tidak bisa dibaca sebagai proporsi keseluruhan.

### 9.9.3 `panel/panel-toolbar.tsx`

```ts
export function DateField({ label = "Pilih tanggal" }) {
  const [date, setDate] = useState("");
  ...
}
```

**(1)** `DateField` menyimpan tanggal di state internal dan **tidak menerima `onChange`**. Nilai yang dipilih tidak pernah sampai ke pemanggil — komponen ini murni dekoratif. Jika dipakai di toolbar sebagai filter, filternya tidak berefek.

**(2)** Label dirender sebagai `<span>` dengan margin negatif `-ml-[6.5rem]` di atas input date. Trik visual ini rapuh: pada lebar/zoom berbeda, label bisa menutupi ikon kalender.

```ts
export function FilterableTable<T extends { id: string }>({ columns, rows, ... }) {
  const [q, setQ] = useState(""); const [status, setStatus] = useState("");
  const filtered = useMemo(() => rows.filter(...), [q, status, rows, searchKeys, statusKey]);
}
```

**(1)** Filter dan pencarian berjalan di **data yang sudah dimuat**, bukan di server. Kalau halaman mengambil 20 baris, pencarian tidak akan menemukan data di halaman lain. Ini sumber keluhan "data tidak ketemu padahal ada".

**(2)** `searchKeys` dan `statusOptions` adalah array literal dari pemanggil; dimasukkan ke dependency `useMemo`, sehingga memo dihitung ulang setiap render. Tidak salah, hanya kehilangan manfaat memo.

**(3)** Baris tanpa `id` unik akan memicu key duplikat. Tipe `T extends { id: string }` mendokumentasikan syarat itu.

### 9.9.4 `panel/date-range-filter.tsx`

**(1)** Preset: hari ini, 7 hari, 30 hari, bulan ini, kustom. Saat memilih "Kustom", `onChange("custom", {from, to})` langsung dipanggil dengan nilai default 7 hari terakhir — data dimuat sebelum pengguna memilih tanggal.

**(2)** Input "mulai" tidak dibatasi `max` hari ini, sedangkan "akhir" dibatasi `max={todayISO()}` dan `min={from}`. Pengguna bisa memilih mulai di masa depan dengan akhir hari ini, menghasilkan rentang terbalik yang diteruskan ke API. Backend analitik mungkin mengembalikan nol, bukan error.

**(3)** Setiap perubahan tanggal langsung memanggil `onChange`, yang biasanya memicu request. Mengetik tanggal dengan keyboard bisa menghasilkan beberapa request; tidak ada debounce.

**(4)** `DateRangePreset` diimpor dari `services/analytics.api.service`, sehingga komponen UI bergantung pada tipe service. Arah dependensi ini terbalik dari yang ideal (service bergantung pada tipe domain), tetapi konsisten dengan praktik proyek.

### 9.9.5 `navbar/navbar.tsx` (196 baris)

**(1)** Navbar publik: logo, tautan (Beranda, Destinasi, Paket, Galeri, Artikel, FAQ), pemilih bahasa, dan tombol masuk/daftar atau menu pengguna. Di layar kecil, tautan dilipat ke menu.

**(2)** Status login dibaca dari `useAuthStore`, jadi navbar berubah setelah hidrasi localStorage. Pada render server, navbar selalu tampil sebagai anonim — bisa terlihat "berkedip" dari tombol Masuk menjadi nama pengguna.

**(3)** Menu peran memakai `roleHome()` atau tautan panel; pengunjung diarahkan ke `/dashboard`. `hasRole` case-sensitive (9.3.4) memengaruhi item mana yang muncul.

### 9.9.6 `footer`, `sidebar`, `inputs`, `ui`

**(1)** `footer/footer.tsx` (55 baris): kolom tautan, kontak, dan copyright. Tautan sosial biasanya `href="#"` — tidak berfungsi, hanya dekorasi.

**(2)** `sidebar/admin-sidebar.tsx` (49 baris) mendefinisikan daftar link admin; `PanelLayout` yang merender. Menambah menu admin berarti mengubah file ini dan memastikan `links[0]` adalah dashboard (lihat 9.9.1).

**(3)** `inputs/phone-input.tsx` (174 baris): input nomor Indonesia dengan prefix `+62`, sanitasi non-digit, dan konversi `08xx` → `8xx`. Nilai yang dikirim ke backend biasanya tanpa `+62`; backend menormalkan lagi (8.17.1), jadi ada dua tempat normalisasi yang harus sepakat.

**(4)** `inputs/date-picker.tsx` (187 baris): kalender kustom dengan navigasi bulan dan pembatasan `min`/`max`. Karena dibuat manual, navigasi keyboard (panah, Home/End) biasanya tidak selengkap input date native — perlu dicek bila aksesibilitas menjadi syarat.

**(5)** `ui/*`: `button` (varian primary/secondary/ghost), `badge`, `card`, `input`, `select`, `textarea`, dan `confirm-dialog` (86 baris, memakai `<dialog>`/overlay dengan tombol batal/konfirmasi). Ini primitif yang dipakai ulang; mengubah `button` berdampak ke seluruh aplikasi.

**(6)** `pagination/pagination.tsx` (31 baris): tombol prev/next dan informasi halaman. Tidak ada pemilih ukuran halaman; ukuran ditentukan per halaman.

**(7)** `tables/data-table.tsx` (35 baris): tabel generik dengan kolom dan baris. `loading/skeleton.tsx` (19 baris): blok abu-abu beranimasi. `empty/empty-state.tsx` (11 baris) dan `coming-soon.tsx` (14 baris): placeholder.

**(8)** `brand/brand.tsx` (16 baris) dan `logo-mark.tsx` (13 baris): teks merek dan SVG logo. Warna merek `#1768ad`/`#14548f` di-hardcode di banyak komponen, bukan token tema; mengganti warna brand berarti menyunting puluhan file.
## 9.10 `frontend/features/authentication` — formulir masuk dan pemulihan akun

### 9.10.1 `login-form.tsx` (246 baris)

```ts
const handleEmailChange = (e) => {
  const value = e.target.value; setEmail(value);
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    setErrors(prev => ({ ...prev, email: "Format email tidak valid" }));
  } else { setErrors(prev => { const next = {...prev}; delete next.email; return next; }); }
};
```

**(1)** Validasi berjalan **saat mengetik**, bukan saat blur. Pengguna yang baru mengetik `a` langsung melihat "Format email tidak valid" — pesan merah muncul sebelum mereka selesai. Ini pola yang sama untuk password (`length < 8`).

**(2)** Regex email sengaja longgar (tidak ada validasi RFC). Fungsi sebenarnya adalah mencegah salah ketik, bukan memastikan email valid; backend tetap memvalidasi.

**(3)** Saat submit, validasi diulang dengan Zod (`loginSchema.safeParse`). Ada dua lapis aturan yang harus dijaga sinkron: regex/`length` di handler dan skema Zod. Mengubah salah satu tanpa yang lain membuat pesan berbeda antara saat mengetik dan saat submit.

```ts
useEffect(() => {
  const saved = localStorage.getItem("kpr-auth");
  const state = JSON.parse(saved)?.state;
  if (state?.user) setEmail(state.user.email ?? "");
}, []);
```

**(1)** Form login **mengisi email dari localStorage** milik sesi sebelumnya. Nyaman untuk perangkat pribadi, tetapi di komputer bersama email terakhir tetap terlihat setelah logout. `authService.logout` menghapus `user` dari store, dan `persist` menulis ulang state kosong — jadi ini hanya berfungsi selama logout berhasil dijalankan di perangkat tersebut.

**(2)** `catch` berisi komentar `// yauguh` (tanpa penjelasan). Bila JSON rusak, form tetap kosong; tidak ada yang perlu diperbaiki secara fungsional, tetapi komentar itu menandakan kode belum dirapikan.

**(3)** Ada komentar menggantung `// CKEditor` di tengah file, sisa dari editor yang tidak dipakai. Tidak berbahaya, tetapi mengindikasikan salin-tempel.

```ts
const redirectTo = safeRedirectPath(new URLSearchParams(window.location.search).get("redirect"), "") || undefined;
const res = await login({ email: sanitizeEmail(email), password, remember, redirectTo });
```

**(1)** `redirect` dibaca dua kali: di sini dan di dalam `useLogin` (`readRedirectParam`). Nilai yang dikirim sebagai `creds.redirectTo` menang, jadi hasilnya sama. Duplikasi ini tidak berbahaya, tetapi menambah jalur yang harus diuji.

**(2)** `safeRedirectPath(..., "")` mengembalikan string kosong untuk URL berbahaya, lalu `|| undefined` membuat hook memakai fallback peran. Dengan begitu `?redirect=https://evil.com` tidak menyebabkan open redirect.

```ts
<Button disabled={!GOOGLE_OAUTH_ENABLED} ... onClick={() => { if (GOOGLE_OAUTH_ENABLED) window.location.href = `${API_BASE_URL}/auth/google`; }}>
```

**(1)** Tombol Google **selalu dirender**, tetapi nonaktif bila env `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` bukan `"true"`, disertai teks penjelasan di bawahnya. Ini pilihan desain yang jujur (fitur terlihat, status jelas) dibanding menyembunyikannya.

**(2)** Alur OAuth memakai navigasi penuh ke backend (`API_BASE_URL/auth/google`), bukan popup. Backend harus mengembalikan redirect ke frontend dengan cookie terpasang; kalau `API_BASE_URL` menunjuk host berbeda, cookie `SameSite` bisa memblokir sesi.

**(3)** `GOOGLE_OAUTH_ENABLED` dibaca dari `process.env.NEXT_PUBLIC_*` saat build. Mengubah env di runtime tidak mengubah nilai yang sudah dibundel; perlu rebuild.

### 9.10.2 Formulir lain di folder yang sama

**(1)** `register-form.tsx` (262 baris) mengirim `name`, `email`, `phone`, `password`, lalu otomatis login (`useRegister` → `authService.register` yang menerima cookie). Nomor telepon dinormalisasi sebelum dikirim; backend menormalkan lagi.

**(2)** `forgot-password-form.tsx` memanggil `authService.forgotPassword`. Pesan sukses selalu sama, sesuai desain backend yang tidak mengungkap apakah email terdaftar (8.16.5). Jangan mengubah UI menjadi "email tidak ditemukan" — itu membocorkan informasi.

**(3)** `reset-password-form.tsx` (146 baris) membaca token dari URL, meminta password baru dua kali, lalu memanggil `resetPassword`. Setelah sukses biasanya diarahkan ke `/login`; token sekali pakai sehingga refresh halaman dengan token yang sama akan gagal.

**(4)** `change-password-form.tsx` memanggil `useChangePassword`, yang setelah sukses **mencabut semua refresh token** dan mengarahkan ke `/login`. Ini konsisten dengan backend, tetapi pengguna di perangkat lain juga ter-logout — perilaku yang benar untuk keamanan, perlu dijelaskan di UI.

**(5)** Semua formulir memakai pola `errors: Record<string,string>` + `role="alert"` pada pesan, dan `aria-invalid` pada input. Ini aksesibilitas dasar yang konsisten.

## 9.11 `frontend/features/booking` — formulir dan riwayat

### 9.11.1 `booking-form.tsx` (318 baris)

```ts
const unit = selectedTicket?.price ?? 0;
const total = unit * quantity;
...
<span className="font-semibold">{formatCurrency(total, "IDR")}</span>
```

**(1)** **Sudah diperbaiki.** Sebelumnya `formatCurrency` (yang membagi 100) dipakai pada `ticket.price` yang sudah rupiah utuh, sehingga Rp 31.000 tampil Rp 310. Sekarang form memakai `rupiah(t.price)` dan `rupiah(total)`; `formatCurrency` hanya untuk paket (`price_cents`).

**(2)** `total` dihitung `unit * quantity` tanpa biaya layanan, diskon, atau pajak. Harga yang ditampilkan bukan harga yang akan ditagih; backend menambahkan 2% biaya layanan (7.2.3). Selisih ini baru terlihat di halaman pembayaran.

```ts
ticketService.getActive().then((ts) => {
  setTickets(ts);
  if (ts.length > 0) setSelectedTicketId(ts[0].id);
});
```

**(1)** Formulir ini milik **paket wisata** (`pkg: TourismPackage`) tetapi memuat **semua tiket aktif**, bukan tiket yang termasuk paket. Tidak ada relasi paket–tiket di backend, jadi komentar kode mengakui "untuk sekarang pakai semua tiket aktif".

**(2)** Akibatnya pengunjung yang membeli "Paket Keluarga" bisa memilih tiket HTM satuan, dan booking yang dibuat tidak mereferensikan paket sama sekali (`items` hanya berisi `ticket_id`). `pkg.id` hanya dipakai untuk URL redirect saat belum login.

**(3)** Jika `getActive()` gagal, `catch` hanya mematikan loading; dropdown kosong tanpa pesan error. Pengguna melihat formulir tanpa pilihan tiket dan tombol submit yang akan gagal validasi.

```ts
if (!user) { toast.error(...); router.push(`/login?redirect=/packages/${pkg.id}`); return; }
```

**(1)** Wajib login sebelum booking. Ini konsisten dengan backend yang mengambil `user_id` dari JWT (7.2.1). Formulir tetap menampilkan nama/email dari `useAuthStore`, tetapi nilainya bisa diedit — dan backend memakai data `visitor` dari request, bukan profil.

**(2)** Setelah booking, `router.push(`/payment?code=${booking.id}`)` mengirim **UUID**, bukan `booking_code`. Halaman `/payment` menerima `code` dan `PaymentPanel` mencarinya; kalau panel menganggapnya kode (`KP-...`), pembayaran gagal ditemukan. Periksa kontrak `bookingService.getByCode` saat mengubah alur ini.

```ts
const formData = { visit_date, visitor: {...}, items: [{ ticket_id: selectedTicketId, quantity }], note: "" };
const result = bookingSchema.safeParse(formData);
```

**(1)** `quantity` dibatasi 1–20 di UI, sedangkan backend membatasi per item (lihat 7.2.3). Angka 20 adalah aturan klien yang tidak berasal dari API; kalau backend menurunkan batas, UI tetap mengizinkan dan baru ditolak saat submit.

**(2)** `note` selalu string kosong; tidak ada field catatan di UI. Backend mendukung catatan, jadi fitur itu tidak terjangkau pengguna.

**(3)** Sanitasi (`sanitizeInput`, `sanitizeEmail`, `sanitizePhone`) berjalan di klien. Ini hanya merapikan input; backend tetap memvalidasi dan menyimpan nilai yang sudah dibersihkan lagi.

**(4)** `validatePhone` **disalin** ke dalam file ini dari skema, dengan komentar yang mengakuinya. Dua salinan aturan nomor telepon (di sini dan di `schemas/booking.schema.ts`) bisa berbeda; perbaiki salah satu dan bug lama kembali.

**(5)** Loading state berupa lima blok `animate-pulse` setinggi 40 px — mendekati bentuk dropdown, tetapi tidak ada teks "memuat tiket". Untuk koneksi lambat, pengguna tidak tahu apa yang sedang terjadi.

### 9.11.2 `my-bookings-list.tsx` (239 baris)

```ts
const upcoming = bookings.filter(b => ["PENDING","PAID","CONFIRMED"].includes(b.status) && b.visit_date >= today);
const past = bookings.filter(b => b.status === "USED" || (["CONFIRMED","PAID"].includes(b.status) && b.visit_date < today));
const cancelled = bookings.filter(b => ["CANCELLED","EXPIRED"].includes(b.status));
```

**(1)** **Booking `PENDING` dengan tanggal kunjungan yang sudah lewat tidak muncul di tab mana pun.** Ia tidak masuk `upcoming` (tanggal < hari ini), tidak masuk `past` (status bukan USED/CONFIRMED/PAID), dan tidak masuk `cancelled`. Secara praktis backend akan mengubahnya menjadi `EXPIRED` lewat scheduler, tetapi sebelum scheduler berjalan (atau bila gagal), booking itu hilang dari riwayat pengguna.

**(2)** `REFUNDED` (bila nanti ditambahkan) juga tidak masuk kategori mana pun. Setiap status baru harus ditambahkan ke ketiga filter ini.

**(3)** Perbandingan tanggal memakai string ISO `YYYY-MM-DD`, yang aman karena formatnya terurut secara leksikografis. `todayISO()` memakai tanggal lokal (9.3.1), jadi konsisten dengan tanggal kunjungan.

```ts
<Row label="Kode Booking" value={detailFor.id} />
```

**(1)** Sama seperti PDF (9.3.10): yang ditampilkan adalah **UUID**, bukan `booking_code`. Di daftar, kartu menampilkan `b.booking_code` dengan benar; hanya dialog detail yang salah. Petugas yang meminta "kode booking" akan menerima UUID yang tidak bisa dicari di UI scan.

```ts
await downloadETicketPDF({ ...t, bookingId: t.booking_id, visitorName: ..., } as any, { ...res.booking, ... } as any);
```

**(1)** Dua objek dirakit manual dari bentuk snake_case backend lalu di-`as any`. Cast ini mematikan pemeriksaan tipe: kalau `downloadETicketPDF` menambah field wajib, kompilasi tetap lolos dan runtime gagal. Sebaiknya buat fungsi pemetaan bertipe.

**(2)** `eTicketService.markDownloaded(b.id)` dipanggil **setelah** PDF berhasil dibuat. Kalau unduhan gagal, status "sudah diunduh" tidak tercatat — perilaku yang benar, tetapi juga berarti mengunduh ulang akan mencatat ulang (backend mungkin menaikkan counter).

**(3)** Pembatalan (`handleCancel`) langsung memanggil API tanpa dialog konfirmasi. Satu salah klik membatalkan booking yang tidak bisa dikembalikan. Backend hanya mengizinkan pembatalan pada status tertentu, jadi error akan muncul sebagai toast generik "Gagal membatalkan booking" — tanpa menjelaskan alasannya.

**(4)** Data dimuat sekali lewat `useEffect(reload, [])`; setelah membatalkan, `reload()` dipanggil. Tidak ada polling status pembayaran, jadi booking yang baru dibayar di tab lain tetap tampil "Menunggu Pembayaran" sampai halaman dimuat ulang.

**(5)** Tombol PDF/E-Tiket hanya muncul untuk `PAID`/`CONFIRMED`/`USED` lewat `hasTicket`. Untuk `PENDING`, pengguna hanya melihat "Bayar Sekarang" dan "Batalkan" — sesuai alur backend yang baru membuat tiket setelah pembayaran lunas.
## 9.12 `frontend/features/public` — alur pemesanan publik

### 9.12.1 `booking-order-form.tsx` (402 baris) — langkah kedua pemesanan

```ts
function parseItems(raw: string | null) {
  if (!raw) return [];
  return raw.split(",").map(part => {
    const [id, q] = part.split(":");
    return { id: (id ?? "").trim(), quantity: Number(q) };
  }).filter(i => i.id.length > 0 && Number.isFinite(i.quantity) && i.quantity > 0);
}
```

**(1)** Pilihan tiket dibawa lewat **query string** `?date=...&items=id:qty,id:qty`, bukan state store. Keuntungan: tautan bisa dibagikan dan refresh tidak kehilangan pilihan. Kerugian: pengguna bisa mengubah `qty` menjadi angka besar (mis. `:9999`) sebelum submit.

**(2)** Filter hanya memastikan `quantity > 0` dan finite. Tidak ada batas atas. Backend tetap memvalidasi kuantitas dan stok (7.2.3), jadi permintaan berlebih ditolak — tetapi pesannya muncul setelah submit, bukan di UI.

**(3)** ID tiket yang tidak lagi aktif dibuang dari `lines`, lalu ditampilkan peringatan "N tiket tidak lagi tersedia" dan tautan "Ubah pilihan". Ini penanganan yang baik: pesanan tidak dibatalkan seluruhnya hanya karena satu tiket hilang.

**(4)** `tickets` dimuat lewat `getActive()` lalu dicocokkan dengan ID di URL. Kalau tiket dinonaktifkan **setelah** halaman dimuat, pengguna masih bisa submit; backend yang menolak.

```ts
const totals = useMemo(
  () => calculateBookingTotals(lines.map(l => ({ price: l.price, quantity: l.quantity }))),
  [lines]
);
```

**(1)** Ringkasan memakai `calculateBookingTotals` dari `lib/business`, yang memakai `BOOKING_CONFIG.serviceFee` **nominal tetap**. Backend memakai **2% dari subtotal**. Untuk subtotal Rp 100.000, pratinjau bisa menampilkan biaya layanan Rp 5.000 sementara tagihan sebenarnya Rp 2.000 (atau sebaliknya).

**(2)** Ini bukan sekadar tampilan: pengguna memutuskan membayar berdasarkan total pratinjau. Selisih kecil masih dapat diterima, tetapi selisih besar (subtotal jutaan) membuat "Total" di halaman ini berbeda jauh dari "Total" di halaman pembayaran.

**(3)** Diskon dan pajak selalu 0 karena backend belum menerapkannya. Baris diskon/pajak hanya dirender bila nilainya > 0, jadi tidak menyesatkan — tetapi keberadaan field-nya di `totals` menunjukkan fitur yang belum ada.

```ts
await bookingService.create({ visit_date: visitDate, items: lines.map(...), visitor: { name, email, phone: composePhone(phoneCode, phone) }, note: note || undefined });
```

**(1)** Nomor telepon dikirim lengkap dengan kode negara (`+62...`) lewat `composePhone`, setelah `PhoneInput` memisahkan kode dan nomor. Backend menormalkan lagi (8.17.1), jadi dua normalisasi harus sepakat tentang format akhir.

**(2)** Setelah booking berhasil, profil pengguna diperbarui (`updateProfile({phone})`) **tanpa menunggu** hasilnya; kegagalan diabaikan dengan komentar eksplisit. Ini keputusan yang benar: kegagalan menyimpan profil tidak boleh membatalkan pesanan yang sudah tercatat.

**(3)** `setDraft(...)` menyimpan ringkasan ke `booking.store` sebelum pindah ke `/payment?code=${booking.id}`. Halaman pembayaran tetap mengambil data dari API, jadi draft hanya berguna untuk tampilan cepat/transisi; kalau kode pembayaran mengandalkan draft, refresh akan kehilangan data.

**(4)** `router.push(`/payment?code=${booking.id}`)` mengirim **UUID**. Sama seperti 9.11.1, ini hanya benar bila `PaymentPanel` mencari berdasarkan ID.

**(5)** `catch (err: any)` memakai `err.message` untuk selain `BookingError`. Ini bisa menampilkan pesan teknis (mis. "Failed to fetch") dalam bahasa Inggris, berbeda dari pesan lain yang sudah diterjemahkan.

**(6)** `visitDate` hanya dicek tidak kosong, tidak divalidasi terhadap `minDaysAhead`/`maxDaysAhead` di sini. Tanggal datang dari halaman pemilihan yang sudah membatasi, tetapi URL bisa dimanipulasi; backend menolak tanggal tidak valid dengan 422.

**(7)** Tombol submit tidak menampilkan total tiket di sisi lain selain ringkasan; teks "Pembayaran diproses via simulasi QRIS" di-hardcode, padahal pengguna bisa memilih metode lain di langkah berikutnya.

### 9.12.2 `faq-accordion.tsx`

**(1)** Akordeon `<details>`/`<summary>` atau state tunggal; hanya satu item terbuka pada satu waktu (accordion) atau banyak (collapsible). Data FAQ berasal dari API, bukan `lib/content.ts`.

**(2)** Karena konten FAQ dari admin bisa berisi HTML, render biasanya memakai `dangerouslySetInnerHTML`. Periksa sanitasi di backend (8.22); jika backend menyimpan HTML mentah, XSS bisa masuk lewat akun admin yang disusupi.

### 9.12.3 `payment-panel.tsx`

Sudah dibedah di 7.5.4: memuat booking berdasarkan `code`, menampilkan ringkasan dan metode, memanggil `paymentService.processPayment` (bukan `paymentsService.create`; `paymentsService` adalah nama variabel service di backend Go), lalu menampilkan instruksi/QR dan melakukan polling status. Catatan penting: `code` diperlakukan sebagai **ID booking** (UUID) di seluruh alur, bukan `booking_code`; jangan mengubah salah satu sisi tanpa yang lain.

## 9.13 `frontend/features` — panel admin CMS

### 9.13.1 Pola umum

**(1)** Semua komponen admin memakai kombinasi: React Hook Form + `zodResolver`, hook React Query (`useX`, `useCreateX`, `useUpdateX`, `useDeleteX`), `DataTable`, `ConfirmDialog`, `EmptyState`, dan `Skeleton`. Ini konsisten dan mudah ditiru untuk entitas baru.

**(2)** Setiap mutasi memanggil `toast.success/error` di callback `onSuccess`/`onError` milik `mutate`, bukan di hook. Akibatnya pesan error selalu generik ("Gagal menghapus"), tanpa alasan dari backend.

**(3)** Form create dan edit berbagi satu formulir; `editingId` menentukan mode. `reset()` dipanggil setelah sukses dan saat batal. Pola ini rawan bug bila field baru ditambahkan dan tidak dimasukkan ke `handleEdit`.

### 9.13.2 `packages-admin.tsx` (158 baris)

```ts
price_cents: Math.round(values.price * 100),
...
{ header: "Harga", cell: (p) => formatCurrency(p.price_cents, p.currency) }
```

**(1)** Untuk **paket**, satuan memang sen: input dalam rupiah dikali 100 saat menyimpan, dan `formatCurrency` membagi 100 saat menampilkan. Konsisten. Ini kebalikan dari tiket/booking yang memakai rupiah utuh — sumber kebingungan utama di seluruh proyek (9.3.2).

**(2)** `Math.round` membuang pecahan rupiah. Harga `150000.4` menjadi `15000040` sen; tidak ada validasi bahwa harga > 0 di sisi UI selain skema Zod.

**(3)** `toggleActive` mengirim **seluruh** field paket (nama, deskripsi, gambar, harga, durasi, kapasitas) dengan `is_active` dibalik. Karena `UpdatePackage` memakai `bool` bukan pointer (8.26), mengirim ulang nilai lama adalah satu-satunya cara aman. Kalau field lain berubah di server sejak data dimuat, perubahan itu tertimpa.

**(4)** Hapus paket **tanpa konfirmasi** (`deletePackage.mutate(p.id)` langsung di onClick). Berbeda dari fasilitas/galeri yang memakai `ConfirmDialog`. Satu klik salah menghapus data permanen.

**(5)** `useUpdatePackage.isPending` dipakai untuk **semua** baris; saat satu baris di-toggle, semua tombol "Aktifkan/Nonaktifkan" menampilkan loading. Tidak salah, hanya UX yang kurang presisi.

**(6)** Tidak ada paginasi: `usePackages({limit:20})`. Paket ke-21 tidak tampil, dan tidak ada tombol "muat lagi". Sama untuk artikel dan galeri (`limit: 24`).

### 9.13.3 `facility-admin.tsx` (277 baris)

```ts
const publishedFacilities = usePublishedFacilityList();
const publishedCount = publishedFacilities.data?.filter(f => f.is_published).length ?? 0;
const totalCount = data?.length ?? 0;
```

**(1)** `publishedFacilities` adalah query **terpisah** untuk endpoint publik yang (menurut namanya) sudah hanya mengembalikan item terbit; `.filter(f => f.is_published)` karena itu redundan. Kalau endpoint mengembalikan semua, filter menyelamatkan; kalau tidak, tidak berpengaruh.

**(2)** `totalCount` dihitung dari `data` yang dibatasi `limit: 50`. Dengan lebih dari 50 fasilitas, "Total" dan "Draft" salah (dan "Draft" bisa negatif bila jumlah terbit melebihi 50). Statistik seharusnya memakai `meta.total` dari API.

**(3)** Preview gambar memakai `next/image` dengan `src` dari input admin. Domain eksternal harus terdaftar di `next.config` (`images.remotePatterns`); URL dari domain baru akan gagal render, dan admin tidak mendapat pesan yang menjelaskan sebabnya.

**(4)** Form memakai `register("is_published")` pada checkbox. Backend `Update` memakai `bool` biasa, jadi mencentang/hilangkan centang selalu mengirim nilai — tidak ada masalah "tak diubah" di sini karena form selalu mengirim seluruh field.

**(5)** `handleCancel` me-reset ke nilai default tetapi **tidak** me-reset `sort_order` dari item yang sedang diedit bila dipanggil setelah edit; nilai default 0 dipakai, yang benar untuk form baru.

**(6)** Hapus memakai `ConfirmDialog` dengan nama item di deskripsi. Ini pola terbaik di antara komponen admin dan seharusnya dipakai juga oleh paket/artikel.

### 9.13.4 `gallery-admin.tsx` (198 baris)

**(1)** Unggah file lewat `uploadService.image(file)`, lalu `setValue("image_url", url)`. Input file di-reset (`event.target.value = ""`) agar memilih file yang sama tetap memicu `onChange` — detail kecil yang sering terlewat.

**(2)** Tombol simpan dinonaktifkan selama unggah **dan** bila `imageUrl` kosong. Ini mencegah item galeri tanpa gambar.

**(3)** Batas 5 MB dan tipe JPG/PNG/WEBP/GIF hanya dinyatakan di teks dan atribut `accept`; tidak ada pemeriksaan ukuran di klien. Backend `upload` yang menolak (8.42), dan pesan errornya ditampilkan lewat `error.message`.

**(4)** Galeri menampilkan grid, bukan tabel, dengan overlay tombol edit/hapus saat hover. Pada perangkat sentuh tidak ada hover — tombol hanya muncul setelah tap pertama (perilaku browser), yang bisa terasa seperti dua kali tap.

**(5)** Hapus memakai `ConfirmDialog`, edit memakai `reset(...)` dengan tiga field. Menambah field (mis. `sort_order`) mengharuskan memperbarui `handleEdit` dan skema.

### 9.13.5 `articles-admin.tsx` (147 baris)

**(1)** Artikel dibuat sebagai **draft** (backend memaksa `StatusDraft`), lalu tombol "Publikasikan" hanya muncul untuk `status === "draft"`. Status backend memakai huruf kecil (`draft`/`published`), jadi perbandingan ini cocok — berbeda dari status booking yang huruf besar.

**(2)** Editor konten berupa `<textarea>` biasa, bukan editor kaya. Konten yang dimasukkan berupa teks/HTML mentah; halaman publik harus merendernya dengan aman.

**(3)** Hapus artikel **tanpa konfirmasi**, sama seperti paket.

**(4)** `cover_image` dikirim `undefined` bila kosong, sehingga backend menyimpan string kosong/null sesuai DTO. Ini menghindari URL `""` yang tidak valid.

### 9.13.6 `faq-admin.tsx` (215 baris), `visitor-rule-admin.tsx` (244), `destination-info-admin.tsx` (245)

**(1)** Ketiganya mengikuti pola yang sama: daftar + form inline + edit/hapus. `faq-admin` mengatur pertanyaan/jawaban dan urutan; `visitor-rule-admin` mengatur aturan kunjungan (judul, isi, kategori, urutan); `destination-info-admin` mengatur informasi destinasi (jam operasional, harga, kontak, dan teks).

**(2)** Ketiganya memakai field `bool` non-pointer di backend (`is_published`, `is_active`). Karena form selalu mengirim nilai lengkap, toggle aman — tetapi API `PATCH` yang hanya mengirim satu field akan mereset field lain ke `false`. Ini jebakan bagi integrasi lain (8.27–8.29).

**(3)** `destination-info-admin` adalah satu-satunya yang mengelola data yang juga tampil di halaman publik "Informasi Destinasi". Perubahan langsung terlihat setelah query invalidated; tidak ada draft/publish terpisah, jadi kesalahan edit langsung tampil.

**(4)** Skema Zod tiap fitur ada di `features/*/schemas/*.schema.ts`. Skema menentukan pesan error yang ditampilkan; validasi backend tetap terpisah dan bisa lebih ketat.

### 9.13.7 `features/destination` — komponen publik paket

**(1)** `packages-list.tsx` menampilkan daftar paket dengan filter/pencarian di klien dan `package-card.tsx` merender satu kartu (gambar, nama, harga via `formatCurrency`, durasi, kapasitas).

**(2)** `home-packages.tsx` menampilkan subset paket di beranda. Karena memakai data API, harga di sini **konsisten** dengan admin — berbeda dari `homeTicketOptions` di `lib/content.ts` yang hardcoded.

**(3)** `package-card` biasanya menautkan ke `/packages/[id]` dan tombol "Pesan" ke `/booking?package=...`. Periksa bahwa parameter yang dibawa cocok dengan yang dibaca `BookingForm` (`pkg.id`) dan `BookingOrderForm` (`date`, `items`).

**(4)** Harga paket dalam sen, sehingga `formatCurrency` benar. Jangan mengganti ke `rupiah` tanpa membagi 100 terlebih dahulu.

## 9.14 Direktori fitur yang kosong

**(1)** `features/analytics`, `dashboard`, `notification`, `payment`, `profile`, `review`, `ticket` tidak berisi file. Implementasinya ada di halaman `app/**` langsung (mis. `app/(dashboard)/dashboard/*`) atau di `components/`.

**(2)** Ketiadaan folder ini bukan bug, tetapi menyulitkan pencarian: logika analitik manager ada di `app/(manager)/manager/revenue/page.tsx`, bukan di `features/analytics`. Saat menambah fitur, ikuti pola yang sudah ada (CMS di `features`, halaman panel di `app`) agar tidak menciptakan dua struktur paralel.
## 9.15 `frontend/app` — kerangka dan route group

### 9.15.1 `app/layout.tsx`

```tsx
<QueryProvider><ThemeProvider><AuthProvider>{children}<ToastProvider /></AuthProvider></ThemeProvider></QueryProvider>
```

**(1)** Urutan provider penting: `QueryProvider` paling luar agar hook React Query bekerja di semua komponen; `AuthProvider` di dalamnya agar bisa memakai query bila perlu; `ToastProvider` dirender sebagai **saudara** `children`, bukan pembungkus, karena ia hanya menempelkan `<Toaster />` ke DOM.

**(2)** `AuthProvider` tidak menahan render (9.6.1), sehingga `children` langsung tampil. Halaman panel yang memakai `useRouteGuard` menampilkan `null` sampai guard lolos, jadi tidak ada konten terproteksi yang bocor.

**(3)** Font dimuat dengan `next/font/google` (`Poppins` untuk heading, `Inter` untuk body) dan diekspos sebagai CSS variable. `display: "swap"` mencegah teks tak terlihat saat font belum siap, dengan konsekuensi layout bergeser (CLS) sedikit.

**(4)** `suppressHydrationWarning` pada `<html>` diperlukan karena `ThemeProvider` menambahkan kelas tema di klien; tanpa itu React melaporkan mismatch hidrasi.

**(5)** Metadata memakai template `%s | Kawah Putih Rancabali`, sehingga setiap halaman cukup menetapkan `title: "Masuk"` dan hasilnya "Masuk | Kawah Putih Rancabali". `robots: index/follow` global; halaman panel tidak menetapkan `noindex`, sehingga halaman admin berpotensi terindeks bila dapat diakses crawler (biasanya terhalang login, tetapi tetap sebaiknya `noindex`).

**(6)** `openGraph` tidak menetapkan `images` maupun `url`; pratinjau saat dibagikan tidak menampilkan gambar. Tidak fatal, tetapi mengurangi kualitas tautan yang dibagikan.

### 9.15.2 Layout per route group

```tsx
export default function AdminLayout({ children }) {
  const guard = useRouteGuard(["ADMIN"]);
  const { data: auditFeed } = useAuditFeed({ limit: 1 });
  const activityCount = auditFeed?.meta?.total ?? 0;
  if (guard !== "allowed") return null;
  ...
}
```

**(1)** Semua layout panel (`admin`, `manager`, `petugas`, `dashboard`) adalah **client component** yang memakai `useRouteGuard`. Selama `checking` dan `denied`, layout mengembalikan `null` — layar kosong, bukan spinner. Redirect baru terjadi di effect, sehingga ada jeda kosong sebelum pengguna melihat `/login` atau `/unauthorized`.

**(2)** `admin/layout.tsx` mengambil badge dari `useAuditFeed({limit:1})` dan memakai `meta.total` sebagai "Aktivitas". Itu adalah **jumlah seluruh entri audit**, bukan jumlah belum dibaca. Angkanya akan terus bertambah dan setelah ribuan entri badge menampilkan `99+` secara permanen. Untuk badge notifikasi, dibutuhkan konsep "belum dibaca" yang tidak dimiliki audit log.

**(3)** `dashboard/layout.tsx` mengizinkan **semua peran** (`PENGUNJUNG`, `ADMIN`, `MANAGER`, `PETUGAS`), sehingga staf bisa membuka panel pengunjung. Ini masuk akal (mereka juga bisa memesan tiket), tetapi berarti `useRouteGuard(["PENGUNJUNG"])` tidak dipakai dan pengunjung murni tidak bisa membuka panel staf — sudah benar.

**(4)** Menu admin berisi 11 item, manager 7, petugas 5, pengunjung 7. `links[0]` selalu dashboard, memenuhi asumsi `isActive` di `PanelLayout` (9.9.1).

**(5)** `(public)/layout.tsx` adalah **server component** tanpa guard: `Navbar`, `<main>`, `Footer`. Halaman publik dapat dirender statis/dinamis sesuai kebutuhan masing-masing.

**(6)** Route group `(auth)` tidak punya layout sendiri; halaman login/register/forgot/reset merender `<main>` penuh masing-masing. Akibatnya tidak ada Navbar/Footer di halaman auth, dan halaman tidak berbagi kerangka — setiap halaman mengulang markup panel logo.

### 9.15.3 `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx`, `unauthorized`

**(1)** `error.tsx` (17 baris) adalah error boundary route-level: menerima `error` dan `reset`, menampilkan pesan dan tombol "Coba lagi" yang memanggil `reset()`. Ini menangkap error render di bawah root, bukan error di layout root.

**(2)** `global-error.tsx` (49 baris) menggantikan root layout saat root sendiri gagal; harus merender `<html>` dan `<body>` sendiri. Karena itu ia tidak memakai provider/font — tampilannya sengaja minimal.

**(3)** `loading.tsx` (9 baris) adalah fallback Suspense untuk navigasi antar rute. Hanya berlaku untuk segmen tempat ia berada (root), bukan otomatis semua halaman; banyak halaman panel memakai skeleton sendiri, sehingga fallback ini jarang terlihat.

**(4)** `not-found.tsx` (22 baris) untuk 404 dan `unauthorized/page.tsx` (35 baris) untuk peran tidak sesuai. `useRouteGuard` mengarahkan ke `/unauthorized` saat `allowed.includes` gagal; halaman itu **tidak** memeriksa ulang peran, jadi bisa diakses siapa saja — sesuai fungsinya sebagai halaman informasi.

## 9.16 Halaman `(auth)`

**(1)** `login/page.tsx` (48 baris): dua kolom — panel logo bergradien dan kartu form. Di layar kecil (`< md`) grid satu kolom, panel logo tetap tampil di atas form. Tidak ada Navbar/Footer.

**(2)** `register/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx` masing-masing hanya 16 baris: metadata + pembungkus + komponen form dari `features/authentication`. Logika sepenuhnya di fitur, halaman hanya komposisi. Ini pola yang benar dan konsisten.

**(3)** `reset-password` membaca token dari query string di dalam form (client), bukan sebagai prop server. Halaman tetap bisa dirender statis; token dibaca saat mount.

**(4)** Tidak ada halaman `verify-email` meski `authService.verifyEmail` ada. Verifikasi email hanya bisa diselesaikan lewat tautan backend yang mengarah ke endpoint API, bukan halaman frontend. Kalau backend mengarahkan ke `/verify-email?token=...`, rute itu **tidak ada** dan pengguna mendapat 404.

## 9.17 Halaman `(public)`

### 9.17.1 `page.tsx` — beranda (217 baris)

```tsx
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const faqs = await faqService.listPublished();
  ...
}
```

**(1)** Beranda adalah **server component** yang memanggil API FAQ langsung. `force-dynamic` memastikan FAQ selalu segar, tetapi juga berarti beranda tidak pernah di-cache dan **gagal total** bila backend mati — tidak ada `try/catch`, sehingga satu error fetch membuat halaman 500. Untuk halaman pemasaran, sebaiknya FAQ gagal secara anggun (tampilkan tanpa FAQ).

**(2)** `faqService.listPublished()` berjalan di server dan memakai `API_BASE_URL`. Kalau URL diisi `http://localhost:8080`, build/deploy di lingkungan lain akan gagal menghubungi backend; variabel harus benar per lingkungan.

**(3)** Konten hero, "Pilih Tiketmu", cerita pengunjung, dan sejarah berasal dari `lib/content.ts` (statis). Harga tiket di kartu (`Rp31.000`) **hardcoded** dan tidak mengikuti perubahan `ticket_types` — lihat 9.3.8.

**(4)** Kartu tiket di beranda tidak bisa diklik; hanya tautan "Lihat semua tiket" menuju `/packages`. Pengguna yang ingin memesan satu tiket harus melewati halaman daftar.

**(5)** Ikon kartu dipilih dari array `[Ticket, MapPin, Leaf]` berdasarkan indeks, bukan makna: kendaraan roda 4 memakai ikon `MapPin`, wahana memakai `Leaf`. Detail kosmetik, tetapi menunjukkan array sejajar dengan `homeTicketOptions` yang bisa meleset bila urutannya berubah.

**(6)** Hero memakai `next/image` dengan `fill`, `priority`, dan `sizes`. File `/images/Kawah-Putih.jpg` harus ada di `public/images`; kalau tidak, gambar 404 dan area hero kosong. `priority` tepat karena ini LCP.

**(7)** Bagian "Kenali Kawah Putih" menampilkan blok gradien sebagai pengganti gambar (tanpa `Image`), sehingga tidak ada biaya unduh tambahan tetapi juga tidak ada visual destinasi.

**(8)** Testimoni memakai `figure`/`blockquote`/`figcaption` dan tanda kutip tipografis. Ini markup semantik yang baik untuk SEO dan pembaca layar.

**(9)** FAQ dirender oleh `FaqAccordion` dari data API; kartu CTA di sebelahnya statis. Jika `listPublished()` mengembalikan array kosong, area akordeon kosong tanpa pesan.

### 9.17.2 `packages/page.tsx` (323 baris)

**(1)** Halaman "Pilih Tiket": memuat tiket aktif dan paket, memungkinkan pemilihan tanggal dan jumlah per tiket, lalu mengarahkan ke `/booking?date=...&items=id:qty`. Ini langkah pertama alur pemesanan (7.5.1).

**(2)** Karena memuat data di klien, halaman menampilkan skeleton saat loading dan pesan error dengan tombol coba lagi. Berbeda dari beranda, kegagalan API di sini tidak menjatuhkan halaman.

**(3)** Total pratinjau dihitung dari harga tiket (rupiah utuh) dengan `rupiah`/perkalian langsung, bukan `formatCurrency`. Ini **benar** untuk tiket — kebalikan dari `booking-form.tsx` yang memakai `formatCurrency` (9.11.1).

**(4)** Tanggal dibatasi `minDaysAhead`/`maxDaysAhead` dari `BOOKING_CONFIG`, sama dengan validasi backend. Kalau konfigurasi berbeda dari backend, pengguna bisa memilih tanggal yang ditolak saat submit.

**(5)** Pemilihan disimpan di query string, bukan store, sehingga refresh dan tombol back bekerja. Namun URL bisa diedit untuk jumlah tak terbatas (9.12.1).

### 9.17.3 `packages/[id]/page.tsx` (64 baris)

**(1)** Halaman detail paket adalah server component yang mengambil paket berdasarkan `id`, lalu merender `BookingForm` (9.11.1) atau tautan pesan. `params` pada Next 15 berbentuk Promise dan harus di-`await`.

**(2)** `BookingForm` memuat **semua tiket aktif**, bukan tiket paket — lihat bug 9.11.1. Halaman detail karena itu menampilkan paket, tetapi formulir di bawahnya memesan tiket satuan.

**(3)** Bila paket tidak ditemukan, halaman memanggil `notFound()` sehingga pengguna melihat `not-found.tsx`. Tidak ada metadata dinamis (judul paket) di file ini; bila ada, perlu `generateMetadata`.

### 9.17.4 `booking/page.tsx` (35 baris), `payment/page.tsx` (24 baris)

**(1)** `/booking` adalah server component yang membungkus `BookingOrderForm` dengan Suspense. `BookingOrderForm` memakai `useSearchParams`, yang di Next 15 mewajibkan boundary Suspense saat prerender — tanpa itu build gagal. Ini alasan file halaman hanya 35 baris.

**(2)** `/payment` menerima `searchParams: Promise<{code?: string}>`, menunggu hasilnya, lalu merender `<PaymentPanel code={code} />`. Tidak ada validasi bahwa `code` ada; bila kosong, panel menampilkan keadaan "booking tidak ditemukan".

**(3)** Kedua halaman berada di grup publik, sehingga tidak memerlukan login untuk **merender**; pengecekan login terjadi saat submit (booking) atau saat memuat data (payment). Ini UX yang baik: pengguna bisa melihat ringkasan sebelum diminta masuk.

### 9.17.5 `e-ticket/page.tsx` (243 baris)

**(1)** Halaman e-tiket menerima `?code=<booking id>`, memuat tiket via `eTicketService.getByBookingId`, menampilkan QR (`react-qr-code`), detail kunjungan, dan tombol unduh PDF (`downloadETicketPDF`).

**(2)** QR di halaman ini dirender dari payload yang sama dengan PDF? Jika halaman memakai `ticket.qr_code` dari backend sedangkan PDF menyusun JSON sendiri (9.3.10), keduanya bisa berbeda. Backend menerima beberapa bentuk payload (`t`, `id`, `b`, `booking_id`), jadi perbedaan ini biasanya masih valid — tetapi tidak identik.

**(3)** Halaman memerlukan login (endpoint `e-tickets` berada di grup `requireAuth`); pengunjung yang membuka tautan tanpa sesi akan mendapat 401 dan halaman menampilkan keadaan kosong/error, bukan redirect ke login. `apiClient` hanya redirect pada 401 untuk request tertentu (7.5.2) — perlu dicek apakah e-ticket termasuk.

**(4)** Tombol unduh memanggil `markDownloaded` setelah PDF dibuat, sama seperti `my-bookings-list`. Status "sudah diunduh" bersifat informatif, bukan pembatas.

### 9.17.6 Halaman publik lain

**(1)** `about/page.tsx` (118 baris): sejarah, fasilitas, informasi, aturan — konten dari `lib/content.ts` dan/atau API `destination-info`. Karena statis, perubahan informasi destinasi oleh admin hanya tampil bila halaman mengambil API; kalau memakai `aboutSections`, perubahan admin tidak terlihat.

**(2)** `facilities/page.tsx` (83 baris): daftar fasilitas terbit dari API, dengan ikon dan gambar. Bagian dari CMS fasilitas (9.13.3).

**(3)** `faq/page.tsx` (54 baris): daftar FAQ terbit dengan akordeon, sama seperti beranda.

**(4)** `gallery/page.tsx` (28 baris): grid foto dari API. Karena `next/image` memerlukan domain terdaftar, gambar yang diunggah ke storage eksternal harus cocok dengan `remotePatterns`.

**(5)** `articles/page.tsx` (35 baris) dan `articles/[id]/page.tsx` (36 baris): daftar dan detail artikel. Artikel hanya yang `published` yang dapat diakses; draft menghasilkan 404.

**(6)** `visitor-rules/page.tsx` (78 baris): aturan kunjungan dari API, dikelompokkan per kategori/urutan.

**(7)** Halaman placeholder 5 baris: `contact`, `destination`, `events`, `promotions`, `weather`, `dashboard/notification`, `dashboard/review`, `dashboard/wishlist`, dan sekitar 15 halaman admin (activity-log, analytics, banner, categories, contacts, destinations, events, permissions, promotion, refunds, roles, voucher). Isinya biasanya `ComingSoon` atau teks "Segera hadir". Menu yang mengarah ke halaman ini akan terasa rusak bagi pengguna; sebaiknya menu disembunyikan sampai fitur siap.
## 9.18 Halaman `(dashboard)` — panel pengunjung

### 9.18.1 `dashboard/page.tsx` (127 baris)

```ts
useEffect(() => { bookingService.listMine().then(setBookings).catch(e => console.error("Failed to load bookings:", e)); }, []);
const list = bookings ?? [];
```

**(1)** Saat loading, `bookings` bernilai `null` dan `list` kosong, sehingga kartu statistik menampilkan **0** dan tabel menampilkan "Belum ada booking". Tidak ada skeleton dan tidak ada pembeda antara "sedang memuat" dan "benar-benar kosong". Pengguna dengan booking bisa melihat angka 0 sesaat.

**(2)** Jika request gagal, error hanya masuk `console.error`; `bookings` tetap `null` dan UI terus menampilkan "Belum ada booking". Kegagalan server disamarkan sebagai data kosong — masalah yang sama seperti pola `useState` manual di halaman lain.

**(3)** Statistik dihitung dari **seluruh** booking yang dikembalikan `listMine()`. Kalau endpoint membatasi jumlah (mis. 20), "Total Booking" bukan total sebenarnya. Backend `ListMine` mengembalikan semua milik pengguna, jadi untuk pengguna normal akurat; untuk akun uji dengan ratusan booking bisa berat.

**(4)** `StatusPill` menerima label Indonesia hasil `STATUS_ID[b.status]`, bukan status mentah. Karena peta `STATUS_TONE` di `panel-ui` memakai kunci Indonesia juga, kali ini warnanya benar (`Menunggu Pembayaran` → kuning, `Dibatalkan` → merah). Ini kebalikan dari tabel admin yang mengirim status mentah (9.9.2).

**(5)** Tabel hanya menampilkan 5 baris pertama (`slice(0,5)`) dengan tautan "Lihat semua" ke `/dashboard/booking`, yang merender `MyBookingsList`. Ringkasan dan daftar penuh memakai komponen berbeda dengan logika filter berbeda — konsistensi status harus dijaga di dua tempat.

**(6)** Tombol aksi bergantung status: `PAID/CONFIRMED/USED` → E-Tiket, `PENDING` → Bayar. Untuk `CANCELLED`/`EXPIRED` tidak ada aksi, hanya baris informasi.

### 9.18.2 `dashboard/booking/page.tsx` (14 baris)

**(1)** Hanya membungkus `MyBookingsList` (9.11.2) dengan `PageHeader`. Logika tab dan pembatalan ada di fitur.

**(2)** Tidak ada metadata halaman; judul dokumen mengikuti template root ("Beranda" tidak ditetapkan), sehingga tab browser menampilkan judul default untuk halaman panel. Kosmetik, tetapi berdampak saat banyak tab dibuka.

### 9.18.3 `dashboard/ticket/page.tsx` (160 baris)

```ts
if (tickets === null) {
  return <PageHeader title="Tiket Saya" subtitle="Memuat e-tiket..." /> ...skeleton...;
}
```

**(1)** **Error tidak pernah tampil.** Saat `listMine()` gagal, `catch` mengisi `error` tetapi `tickets` tetap `null`; render berhenti di cabang skeleton dan pesan `error` (yang dirender setelah cabang itu) tidak pernah tercapai. Pengguna melihat skeleton berdenyut selamanya.

**(2)** Perbaikan minimal: tambahkan state `loading` terpisah, atau set `tickets = []` di `catch` agar cabang error bisa dirender. Pola `tickets === null` sebagai penanda loading memang rawan begitu ada error.

**(3)** QR dirender dari `ticket.qr_data || ticket.id`. `qr_data` dari backend adalah payload yang dikenali scanner (`t`/`b`), jadi ini benar. Fallback ke `ticket.id` (UUID) juga masih dikenali scanner karena lookup mencari UUID tiket.

**(4)** Tab memisahkan `VALID` / `USED` / `EXPIRED|CANCELLED`. Status baru (mis. `REFUNDED`) tidak akan muncul di tab mana pun — sama seperti masalah di `MyBookingsList`.

**(5)** Tombol **"Unduh PDF"** hanya `<Link href={/e-ticket?code=...}>`, bukan memanggil `downloadETicketPDF`. Pengguna yang menekan "Unduh" akan dibawa ke halaman e-tiket, bukan mendapat file. Labelnya menyesatkan; seharusnya "Lihat E-Tiket" atau benar-benar mengunduh.

**(6)** Dua tombol menuju URL yang sama persis (Lihat E-Tiket dan Unduh PDF). Salah satunya mubazir.

**(7)** `ticket.total` ditampilkan sebagai "Total". Untuk tiket yang berasal dari booking multi-item, field ini bisa berarti total booking, bukan harga tiket tersebut; pengguna bisa mengira harga per tiket lebih mahal.

### 9.18.4 `dashboard/payment/page.tsx` (147 baris)

```ts
const pending = bookings.filter(b => b.status === "PENDING");
const history = bookings.filter(b => b.status !== "PENDING");
```

**(1)** "Riwayat Pembayaran" sebenarnya adalah **semua booking non-PENDING**, termasuk yang **dibatalkan** dan **kedaluwarsa** yang tidak pernah dibayar. Kolom "Status Pembayaran" lalu menampilkan "Belum ada" untuk booking tanpa payment, sehingga tabel mencampur status booking dengan status pembayaran.

**(2)** Untuk booking `CANCELLED`, tautan "Detail" mengarah ke `/payment?code=<id>` (karena status tidak termasuk PAID/CONFIRMED/USED). Halaman pembayaran untuk booking yang dibatalkan hanya akan menampilkan error/keadaan tidak valid, bukan detail. Seharusnya tautan ke detail booking.

**(3)** `b.payment` hanya ada bila backend menyertakan snapshot pembayaran pada respons booking. Jika `ListMine` tidak memuat relasi itu, seluruh kolom metode/status menjadi "-", dan halaman kehilangan gunanya. Ini bergantung pada `toBookingResponseList` (8.7) yang memuat `payment` untuk booking terbaru.

**(4)** Data dibatasi `limit: 50` dan tidak ada paginasi; pengguna dengan lebih dari 50 booking tidak melihat sisanya meski UI tidak memberi tahu.

**(5)** Error ditangani lebih baik daripada `ticket/page.tsx`: `catch` mengisi `error` dan `bookings` tetap `null` → skeleton juga tak berujung. Sama-sama bug, hanya pesan error tidak pernah sampai ke layar.

### 9.18.5 `dashboard/history/page.tsx` (128 baris) dan `dashboard/profile/page.tsx` (137 baris)

**(1)** `history` menampilkan riwayat kunjungan (booking `USED`/tanggal lampau) dengan filter status dan tanggal. Datanya berasal dari `listMine()` yang sama; tidak ada endpoint riwayat terpisah, jadi semua penyaringan di klien.

**(2)** `profile` memuat nama, email, telepon, dan (opsional) gate/shift untuk staf. Penyimpanan memanggil `authService.updateProfile`, yang memperbarui store tetapi **tidak** memaksa login ulang saat email berubah. Backend menandai email belum terverifikasi dan mengirim tautan verifikasi; UI tidak menampilkan peringatan itu.

**(3)** Perubahan nomor telepon dari profil memakai normalisasi yang berbeda dari `PhoneInput` di alur booking. Kalau salah satu mengirim `08...` dan yang lain `+62...`, database bisa berisi dua format untuk pengguna yang sama.

**(4)** `dashboard/setting/page.tsx` (22 baris) merender `ChangePasswordForm`. Setelah sukses, semua refresh token dicabut dan pengguna diarahkan ke `/login` — termasuk sesi di perangkat lain.

**(5)** Halaman `dashboard/notification`, `review`, `wishlist` hanya 5 baris (placeholder). Menu "Riwayat" ada, tetapi "Notifikasi", "Ulasan", dan "Wishlist" tidak ada di sidebar meski halamannya dibuat — jadi halaman itu hanya bisa diakses lewat URL langsung.

### 9.18.6 Pola umum panel pengunjung

**(1)** Semua halaman adalah client component yang memanggil service di `useEffect`, tanpa React Query. Akibatnya tidak ada cache bersama: membuka Dashboard lalu Tiket Saya memicu dua request `listMine` terpisah.

**(2)** Tidak ada satu pun halaman pengunjung yang memakai `useRouteGuard` sendiri; proteksi berasal dari `dashboard/layout.tsx`. Halaman yang dibuka langsung tetap aman karena layout merender `null` lebih dulu.

**(3)** Status terjemahan (`STATUS_ID`, `PAYMENT_ID`) **didefinisikan ulang di setiap file** dengan isi yang mirip. Menambah status baru berarti menyunting 4–5 file; satu yang terlewat akan menampilkan kode mentah seperti `REFUNDED` kepada pengguna.

**(4)** Semua tautan pembayaran memakai `?code=${booking.id}` (UUID). Pastikan `PaymentPanel` konsisten; gunakan `booking_code` di tampilan, UUID di URL.
## 9.19 Halaman `(admin)` — panel administrator

### 9.19.1 `admin/bookings/page.tsx` (367 baris)

```ts
const { data, total: serverTotal } = await bookingService.listWithMeta({ limit: 100 });
setBookings(data); setTotal(serverTotal);
```

**(1)** Komentar menyatakan "muat seluruh booking (batas maksimal server 100)". Artinya kalau ada 250 booking, yang dimuat hanya 100. Ringkasan "Total Booking" memakai `serverTotal` (250), tetapi "Berhasil", "Menunggu", "Dibatalkan", "Selesai" dihitung dari 100 baris — angka-angka itu **tidak akan pernah berjumlah sama** dengan total. Ini bukan bug tampilan kecil: laporan di halaman ini terbaca sebagai statistik resmi.

**(2)** `SectionCard` menampilkan `rows.length` sebagai "N data", yaitu jumlah setelah filter pada 100 baris, sedangkan paginasi memakai `rows.length` juga. Pengguna tidak diberi tahu ada data yang tidak dimuat. Untuk dataset nyata, halaman ini butuh paginasi server (`page`/`limit` ke API), bukan pemotongan klien.

**(3)** Filter status dan tanggal serta pencarian berjalan di klien atas 100 baris itu. Booking ke-101 dengan kode yang dicari tidak akan ditemukan.

```ts
// Muat booking saat mount dan setiap kali data berubah (mis. setelah hapus).
useEffect(() => { loadBookings(); }, [loadBookings]);
```

**(1)** `loadBookings` bergantung pada `useCallback([], ...)` sehingga stabil; effect berjalan sekali saat mount dan setiap kali `loadBookings` dipanggil manual setelah mutasi. Komentar "setiap kali data berubah" menyesatkan: effect tidak bereaksi terhadap `bookings`, hanya pada identitas fungsi.

**(2)** Setelah ubah status atau hapus, seluruh 100 baris dimuat ulang. Ini sederhana dan menjamin konsistensi, dengan biaya satu request penuh per aksi.

**(3)** `catch` menampilkan toast dengan `error.message` mentah; jika error bukan dari `ApiError`, pesannya bisa berbahasa Inggris.

```tsx
<select value={b.status} onChange={(e) => changeStatus(b, e.target.value as BookingStatus)}>
```

**(1)** Perubahan status terjadi **segera** saat dropdown diubah, tanpa tombol simpan dan tanpa konfirmasi. Salah pilih berarti status booking langsung berubah di database (mis. `PAID` → `CANCELLED`).

**(2)** Semua transisi tersedia untuk semua status. Backend memvalidasi transisi tertentu, tetapi UI tidak menyembunyikan opsi yang mustahil; pengguna baru tahu setelah mendapat toast error.

**(3)** `StatusPill` menerima label Indonesia (`STATUS_ID[b.status]`), sehingga warna cocok untuk `Menunggu`, `Dibatalkan`, tetapi `Berhasil (Dibayar)` dan `Selesai (Digunakan)` tidak ada di peta warna dan jatuh ke biru default.

```ts
if (REVENUE_STATUSES.includes(delTarget.status)) {
  await bookingService.updateStatus(delTarget.id, "CANCELLED");
  toast.success(`${delTarget.booking_code} dibatalkan`, { description: "Status booking kini DIBATALKAN dan dapat dihapus permanen." });
} else { await bookingService.remove(delTarget.id); }
```

**(1)** Alur dua langkah untuk booking berpendapatan: klik hapus → dibatalkan, lalu klik hapus lagi → baru terhapus. Ini melindungi laporan pendapatan dari penghapusan tak sengaja, dan dialog menjelaskannya dengan baik.

**(2)** Booking `USED` diblokir total (tombol konfirmasi tidak dirender), dengan alasan "agar laporan pendapatan tetap akurat". Konsisten dengan backend yang menolak hapus booking terpakai.

**(3)** Booking `PENDING` langsung dihapus permanen tanpa pembatalan lebih dulu. Karena belum ada pembayaran, ini wajar — tetapi tetap menghapus riwayat bahwa pengguna pernah memesan.

**(4)** `handleDelete` tidak memeriksa ulang status di server sebelum menghapus; dua admin yang membuka halaman bersamaan bisa menghapus booking yang baru saja berubah status.

**(5)** Dialog detail menampilkan `detail.ticket_id` sebagai "Kode E-Tiket", padahal field itu adalah **ID tiket (UUID)**, bukan kode yang dicetak (`KPT-...` atau QR). Petugas yang mencarinya di halaman scan tetap bisa menemukannya lewat UUID, tetapi labelnya menyesatkan.

### 9.19.2 `admin/tickets/page.tsx` (385 baris)

```ts
const loadTickets = useCallback(async () => {
  const data = await ticketService.list({ status: statusFilter || undefined });
  setTickets(data);
}, [statusFilter]);

async function handleStatusFilterChange(status: string) {
  setStatusFilter(status); setPage(1); loadTickets();
}
```

**(1)** **Double fetch saat filter berubah.** `handleStatusFilterChange` memanggil `loadTickets()` yang masih memakai closure `statusFilter` **lama**, lalu `setStatusFilter` memicu render, `loadTickets` dibuat ulang, dan effect memanggilnya lagi dengan filter baru. Request pertama sia-sia dan bisa menyelesaikan lebih lambat, menimpa hasil yang benar dengan data filter lama (race condition).

**(2)** Perbaikan: hapus pemanggilan manual di handler dan biarkan effect bereaksi pada `statusFilter`. Pola ini juga berlaku untuk pencarian (tidak memicu fetch, hanya filter lokal — aman).

```ts
function pageSize(total: number) { return total > 30 ? 10 : 8; }
const paged = useMemo(() => paginate(rows, page, pageSize(rows.length)), [rows, page]);
```

**(1)** Ukuran halaman berubah otomatis pada ambang 30 data (8 atau 10). Ketika jumlah melewati ambang, `page` tidak direset; pengguna yang berada di halaman terakhir bisa melihat halaman kosong karena total halaman berubah.

**(2)** `paginate` menyesuaikan `page` ke rentang valid dan mengembalikan `page` yang sudah dikoreksi, tetapi state `page` tidak ikut diperbarui. Indikator "Hal X / Y" memakai nilai terkoreksi, sementara tombol berikutnya memakai state lama — bisa terasa "nyangkut".

**(3)** Sort hanya tersedia untuk harga; kolom nama dan kapasitas tidak bisa diurutkan meski `sortKey` mendukung `name`/`capacity`. Fitur setengah jadi.

```ts
const code = "TKT-" + form.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
await ticketService.create({ code, ..., category: "ENTRANCE", ... });
```

**(1)** Kode tiket dibuat dari 10 karakter pertama nama. Dua tiket bernama "Tiket Masuk Dewasa" dan "Tiket Masuk Anak" menghasilkan kode sama (`TKTMASUKDE`), dan pembuatan kedua gagal karena duplikat (atau menimpa, tergantung constraint).

**(2)** `category: "ENTRANCE"` **hardcoded** meski `form.category` ada dan bisa diedit di `emptyForm`. Form tidak menyediakan pemilih kategori, jadi semua tiket baru masuk kategori pintu masuk — termasuk wahana atau parkir.

**(3)** Saat edit, `code` dan `category` dikirim ulang dari data lama, sehingga tidak berubah. Backend `Update` mungkin mengizinkan perubahan kode, tetapi UI tidak.

**(4)** `is_active` hanya dikirim saat create (`form.status === "AKTIF"`). Saat update, status dikirim sebagai `"AKTIF"/"NONAKTIF"` dan `is_active` tidak — dua field yang menyatakan hal serupa bisa menjadi tidak sinkron bila backend menyimpan keduanya.

**(5)** Validasi klien mewajibkan `capacity > 0`. Jika backend mengizinkan kapasitas 0 berarti "tak terbatas", UI tidak bisa membuat tiket tak terbatas.

**(6)** Hapus tiket yang sudah dirujuk booking akan gagal di database (foreign key) dan pesannya diteruskan mentah ke toast, kemungkinan berbahasa Inggris dan menyebut nama constraint.

### 9.19.3 `admin/payments/page.tsx` (181 baris)

**(1)** Menampilkan daftar pembayaran dengan filter status/metode dan aksi verifikasi manual. Data berasal dari endpoint admin payments, bukan dari booking, sehingga status di sini adalah status pembayaran (`PENDING`, `PAID`, `FAILED`, `EXPIRED`, `REFUNDED`).

**(2)** Aksi "verifikasi" memanggil backend untuk menandai lunas; ini berguna untuk pembayaran simulasi yang tidak melalui callback Midtrans. Tindakan ini mengubah status booking terkait dan menerbitkan tiket — efeknya besar untuk satu klik, sehingga konfirmasi wajib ada.

**(3)** Karena halaman ini dan `admin/bookings` sama-sama bisa mengubah status, dua admin bisa saling menimpa. Tidak ada optimistic locking; yang terakhir menang.

### 9.19.4 `admin/users/page.tsx` (260 baris), `admin/visitors/page.tsx` (213 baris)

**(1)** `users` mengelola akun staf (admin, manager, petugas): daftar, filter peran, aktif/nonaktif, reset password, dan (mungkin) pembuatan akun. Endpoint pengguna berada di bawah `/admin/users` dengan `RequireRole("ADMIN")`.

**(2)** Menonaktifkan pengguna tidak mencabut token yang sudah terbit sampai refresh berikutnya. Backend memeriksa status aktif saat login/refresh, bukan di setiap request — pengguna nonaktif masih bisa memakai access token sampai kedaluwarsa (biasanya menit).

**(3)** `visitors` menampilkan data pengunjung yang datang (check-in), bukan akun pengunjung. Datanya berasal dari tabel `visitors` yang **tidak** ikut AutoMigrate (8.46), sehingga di instalasi baru halaman ini bisa gagal dengan error "no such table".

**(4)** Kedua halaman memakai pola tabel + filter + paginasi klien yang sama seperti booking; batas server yang lebih kecil dari total akan menghasilkan statistik yang tidak lengkap.

### 9.19.5 `admin/content/page.tsx` (219 baris)

**(1)** Halaman "Kelola Konten" menggabungkan tab untuk artikel, galeri, FAQ, fasilitas, aturan pengunjung, dan informasi destinasi — masing-masing merender komponen dari `features/*`. Ini pintu masuk CMS.

**(2)** Karena semua tab dimuat dalam satu halaman, membuka halaman ini bisa memicu beberapa query sekaligus (artikel, galeri, FAQ, ...). React Query menyimpan cache, tetapi kunjungan pertama membayar semuanya.

**(3)** Tab yang tidak aktif tetap ter-mount atau di-unmount sesuai implementasi; jika di-unmount, setiap perpindahan tab memicu query ulang (kecuali cache masih segar).

### 9.19.6 `admin/reports/page.tsx` (351 baris)

**(1)** Halaman laporan admin menggabungkan ringkasan pendapatan, jumlah booking, tiket terjual, dan grafik tren, dengan filter rentang tanggal (memakai `DateRangeFilter`).

**(2)** Ekspor PDF/Excel memakai `lib/report-export` (9.3.11): seluruh laporan dibuat di browser dari data yang sudah dimuat. Kalau halaman hanya memuat 30 hari, ekspor 90 hari tidak mungkin tanpa memuat ulang.

**(3)** `dailyRows` untuk Excel dirakit dari data harian; tanggal ditulis sebagai string, sehingga Excel memperlakukannya sebagai teks (tidak bisa langsung dibuat pivot waktu).

**(4)** Angka pendapatan memakai `rupiah`, bukan `formatCurrency`, karena data analitik dalam rupiah utuh. Konsisten dengan backend analitik.

### 9.19.7 `admin/audit-log/page.tsx` (205 baris), `admin/notifications/page.tsx` (82 baris)

**(1)** `audit-log` menampilkan entri audit (aktor, aksi, entitas, waktu) dengan filter dan paginasi. Aktor bisa kosong untuk aksi sistem atau pengguna cookie (8.31), sehingga kolom "oleh" kadang "-".

**(2)** `notifications` adalah "Aktivitas": feed audit yang sama dengan tampilan lebih ringkas, dipakai juga untuk badge di sidebar. Karena badge memakai `meta.total` (9.15.2), halaman ini bukan pusat notifikasi dengan status baca.

**(3)** Tidak ada tombol "tandai sudah dibaca" karena model datanya tidak mendukung. Menambahkan fitur itu memerlukan tabel/field baru di backend.

### 9.19.8 `admin/dashboard/page.tsx` (122 baris), `admin/settings/page.tsx` (87 baris)

**(1)** Dashboard admin menampilkan kartu ringkasan (booking hari ini, pendapatan, tiket terjual, pengunjung) dan tautan cepat. Angka diambil dari endpoint analitik; jika endpoint gagal, kartu menampilkan 0 tanpa indikator error.

**(2)** `settings` berisi pengaturan umum (nama situs, kontak, jam operasional) dan/atau keamanan akun. Jika pengaturan disimpan di backend, perubahan langsung tampil di halaman publik yang membacanya; jika hanya di klien, tidak ada efek.

**(3)** Sekitar 15 halaman admin lain hanya 5 baris (placeholder): activity-log, analytics, banner, categories, contacts, destinations, events, permissions, promotion, refunds, roles, voucher. Menu admin **tidak** menautkannya (hanya 11 item di layout), jadi halaman itu hanya bisa diakses lewat URL dan menampilkan "segera hadir".
## 9.20 Halaman `(manager)` — panel manajer

### 9.20.1 `manager/revenue/page.tsx` (146 baris)

```ts
useEffect(() => {
  let alive = true;
  setLoading(true);
  (async () => {
    try { const a = await analyticsService.getManagerAnalytics({ range, custom }); if (alive) setAnalytics(a); }
    catch (error) { toast.error("Gagal memuat analytics", { description: error.message }); }
    finally { if (alive) setLoading(false); }
  })();
  return () => { alive = false; };
}, [range, custom]);
```

**(1)** Flag `alive` mencegah `setState` setelah unmount dan mencegah respons lama menimpa yang baru **hanya bila komponen di-unmount**. Saat pengguna cepat mengganti rentang, komponen tetap ter-mount: dua request berjalan, dan respons yang lebih lambat bisa menimpa hasil rentang terbaru (race). React Query menyelesaikan ini dengan identitas query; di sini tidak.

**(2)** `custom` adalah objek; setiap `onChange` dari `DateRangeFilter` membuat objek baru, sehingga effect berjalan pada setiap perubahan tanggal. Mengubah tanggal mulai lalu tanggal akhir memicu dua request.

**(3)** Saat loading, halaman menampilkan tiga `StatCard` bertuliskan "Loading..." dengan nilai "—", bukan skeleton. Saat `analytics` null (gagal), halaman hanya menampilkan judul "Data tidak tersedia" — tanpa tombol coba lagi dan tanpa pesan error yang persisten (hanya toast yang hilang setelah beberapa detik).

```ts
function buildReport(): ReportData {
  if (!analytics) return {} as ReportData;
  ...
}
```

**(1)** `{} as ReportData` adalah cast paksa yang membuat objek tanpa field. Saat ini tidak berbahaya karena tombol ekspor hanya dirender setelah `analytics` ada, tetapi cast ini menyembunyikan kesalahan bila urutan render berubah.

**(2)** Ringkasan laporan memakai `rupiah` (data analitik dalam rupiah utuh). `LineChart` menerima `Math.round(p.value)`. Kapasitas grafik tidak diberi label nilai, hanya bentuk tren (9.9.2).

**(3)** `ticket_type_performance` dipetakan menjadi `"N tiket"` untuk `ListPanel`, padahal judulnya "Pendapatan per Jenis Tiket". Nilainya jumlah tiket, bukan pendapatan — label salah. Manager bisa menyimpulkan pendapatan per jenis tiket dari angka yang sebenarnya jumlah tiket.

**(4)** Ekspor PDF/Excel memakai `buildReport()` dari data yang sedang tampil. Tombol ada di header dan selalu aktif; jika `analytics` baru saja berubah, ekspor memakai data terbaru yang sudah dirender.

**(5)** `paymentStatus` dikirim ke `ReportData` tetapi tidak dipakai oleh `exportReportPDF` (hanya ringkasan, dua grafik, dan kinerja tiket). Data status pembayaran hilang dari PDF tanpa peringatan.

### 9.20.2 Halaman manager lain

**(1)** `manager/dashboard/page.tsx` (122 baris): ringkasan harian dengan kartu dan grafik, memakai endpoint analitik yang sama (`getManagerAnalytics`) dengan rentang default. Tidak ada filter rentang di dashboard, jadi angkanya selalu "hari ini"/default backend.

**(2)** `manager/sales/page.tsx` (165 baris): statistik penjualan — tren booking, tiket terjual, dan performa jenis tiket. Sama seperti revenue, filter rentang dan ekspor berada di klien.

**(3)** `manager/bookings/page.tsx` (155 baris): daftar booking untuk manager, **hanya baca** (tanpa ubah status/hapus) — berbeda dari admin. Ini pemisahan hak yang benar: manager melihat laporan, admin mengelola data.

**(4)** `manager/visitors/page.tsx` (92 baris): statistik pengunjung (jumlah, per gate, per jam). Datanya dari agregat backend; kalau tabel `visitors` tidak ada (8.46), halaman ini gagal.

**(5)** `manager/monitoring/page.tsx` (120 baris): memantau aktivitas petugas — jumlah scan, valid/invalid, gate, aktivitas terakhir — lewat `scannerService.getMonitoring()` (`/manager/monitoring`). Nama petugas di data ini berasal dari body request petugas, sehingga bisa tidak akurat (9.8).

**(6)** `manager/settings/page.tsx` (17 baris): hanya merender form keamanan akun (ganti password). Tidak ada pengaturan operasional; itu ada di admin.

**(7)** Semua halaman manager adalah client component dengan `useEffect` + `useState`, tanpa React Query. Pola loading/error serupa: toast untuk error, angka 0/— saat gagal.

## 9.21 Halaman `(petugas)` — panel petugas lapangan

### 9.21.1 `petugas/scan/page.tsx` (341 baris)

Sudah dibedah di 7.5.5, termasuk bug envelope `ValidateTicketResponse` yang membuat semua scan tampil INVALID (9.8). Poin tambahan:

**(1)** Input scan menerima hasil ketik manual, kamera (BarcodeDetector bila tersedia), atau unggah gambar QR. Untuk kamera, API `BarcodeDetector` tidak tersedia di semua browser (Firefox/Safari lama); biasanya ada fallback perpustakaan JS, dan tanpa fallback petugas di perangkat tersebut tidak bisa memindai.

**(2)** `gate` dan `petugas` dikirim di body. Backend memakai `req.Petugas` bila ada (8.13), jadi nama yang dikirim klien yang tercatat — bisa dipalsukan atau salah ketik.

**(3)** Setelah validasi sukses, halaman menampilkan hasil dan (mungkin) memutar suara. Tidak ada antrean offline: jika jaringan putus di gerbang, scan gagal dan tiket tidak tercatat. Untuk lokasi wisata dengan sinyal lemah, ini risiko operasional nyata.

### 9.21.2 `petugas/ticket/page.tsx` (467 baris, mayoritas baris kosong)

```ts
const searchCode = code.trim().toUpperCase();
const found = await lookupTicket(searchCode);
```

**(1)** Input selalu di-**uppercase**. Kode booking (`KP-...`), kode tiket, dan QR payload memang uppercase, tetapi **UUID tiket tidak**. Jika petugas menempelkan UUID (mis. dari tautan/detail), pencarian gagal karena backend mencocokkan ID secara persis. Placeholder hanya menyebut `TK-`/`KP-`, jadi kasus ini tidak dijanjikan — namun UI lain menampilkan UUID sebagai "kode tiket" (9.19.1), sehingga petugas wajar mencobanya.

**(2)** `lookupTicket` menelan semua error menjadi `null` (9.8). Saat server mati, halaman menampilkan "Tiket 'X' tidak ditemukan dalam sistem" — kesimpulan yang salah dan berpotensi membuat petugas menolak tiket valid.

```ts
const [scans, setScans] = useState<ScanRecord[]>([]);
...
{scans.length > 0 && (<div>...RIWAYAT SCAN TIKET INI...</div>)}
```

**(1)** `scans` **tidak pernah diisi**. `setScans([])` dipanggil saat pencarian, tetapi tidak ada kode yang mengambil riwayat per tiket. Blok "RIWAYAT SCAN TIKET INI" adalah dead code yang tidak akan pernah tampil.

**(2)** Untuk menampilkannya, perlu endpoint riwayat per tiket (`/petugas/scanner/history?ticket_id=...`) atau filter di klien dari `getHistory()`. Endpoint history backend belum memfilter per tiket (hanya gate/petugas/tanggal).

```tsx
<DetailRow label="Check-in" value={`${new Date(ticket.checked_in_at).toLocaleString("id-ID")} &bull; ${ticket.checked_in_gate ?? "-"}`} />
```

**(1)** `&bull;` berada di dalam **string JavaScript**, bukan JSX, sehingga dirender literal sebagai teks "&bull;" — bukan titik pemisah "•". Bug kosmetik yang terlihat jelas di halaman.

```ts
interface ETicket { ... } interface Booking { ... } interface ScanRecord { ... }
```

**(1)** Tiga interface didefinisikan ulang di file ini, padahal `types/api.ts` sudah punya `ETicket` dan `ScanRecord`. Duplikasi ini membuat perubahan tipe backend tidak terpropagasi; TypeScript hanya memeriksa bentuk yang dideklarasikan lokal.

**(2)** `Booking` lokal dirakit manual dari `found` dengan `items: []`, `phone: ""`, dan `status: found.status` (status **tiket**, bukan status booking). Halaman tidak pernah mengambil booking sebenarnya, sehingga detail seperti item dan total per item tidak tersedia.

**(3)** Untuk status `VALID`, panel menampilkan "Tiket Diterima" tanpa memeriksa apakah tanggal kunjungan hari ini. Tiket untuk minggu depan dinyatakan "siap digunakan pada tanggal kunjungan" — secara teknis benar, tetapi petugas bisa membacanya sebagai izin masuk hari ini. Validasi sebenarnya ada di `scannerService.validateTicket`, bukan di halaman ini; halaman ini hanya lookup read-only.

**(4)** Tombol "Scan Tiket" mengarah ke `/petugas/scan` tanpa membawa kode yang sedang dicari; petugas harus mengetik/memindai ulang.

**(5)** File memiliki ratusan baris kosong di akhir (CRLF), membuat `wc -l` melaporkan 467 padahal kode efektif sekitar 260 baris. Tidak memengaruhi runtime, tetapi mengotori diff.

### 9.21.3 `petugas/dashboard/page.tsx` (128 baris)

**(1)** Ringkasan shift: jumlah scan hari ini, tiket valid, tiket ditolak, dan gate. Data dari `/petugas/scanner/stats` (`getStats`), yang mengembalikan `Record<string, number>` tanpa tipe field yang jelas.

**(2)** Karena statistik dihitung backend dari `scan_records`/`verifications`, angka valid/tidak valid bergantung pada apakah setiap scan **dicatat**. Scan yang gagal karena jaringan tidak tercatat, sehingga dashboard bisa terlihat lebih sepi daripada kenyataan di gerbang.

**(3)** Tidak ada filter tanggal; "hari ini" ditentukan backend (zona waktu server). Jika server UTC dan petugas WIB, pergantian hari terjadi pukul 07.00 WIB.

### 9.21.4 `petugas/history/page.tsx` (137 baris)

**(1)** Daftar riwayat validasi dengan filter gate, petugas, dan rentang tanggal, memakai `scannerService.getHistory`. Parameter `status` ada di tipe frontend tetapi tidak dikirim (9.8), jadi tidak ada filter status di UI yang benar-benar bekerja.

**(2)** Paginasi memakai `page`/`limit` ke server (20 per halaman), berbeda dari tabel admin yang memotong di klien. Ini pendekatan yang lebih benar dan seharusnya dijadikan contoh.

**(3)** Kolom "petugas" menampilkan nama dari body request; untuk scan lama sebelum perubahan handler, nilainya mungkin ID pengguna, bukan nama.

### 9.21.5 `petugas/settings/page.tsx` (17 baris)

**(1)** Hanya `ChangePasswordForm`, sama seperti `manager/settings` dan `dashboard/setting`. Tidak ada pengaturan gate/shift; nilai itu datang dari profil pengguna dan tidak bisa diubah petugas sendiri.

**(2)** Setelah ganti password, semua refresh token dicabut dan pengguna diarahkan ke `/login`; petugas di tengah shift harus masuk ulang. Untuk perangkat scan bersama, ini juga mengeluarkan sesi perangkat lain — perilaku aman tetapi perlu diketahui secara operasional.

## 9.22 `frontend/store` — state global Zustand

**(1)** Empat store: `auth.store.ts`, `booking.store.ts`, `language.store.ts`, `wishlist.store.ts`. Semuanya memakai pola `create<T>()(...)` dengan state + action di satu objek.

**(2)** `auth.store` menyimpan `user`, `roles`, dan status login. Ia **bukan** sumber kebenaran sesi (cookie HttpOnly yang menentukan); store hanya cermin untuk UI. Setelah refresh halaman, store diisi ulang dari `GET /auth/me`.

**(3)** `booking.store` menyimpan keranjang/booking sementara di klien (item, tanggal, total pratinjau). Data ini tidak dikirim apa adanya ke backend; form pemesanan mengirim `ticket_id` + `quantity` dan backend menghitung ulang (7.2.3). Karena itu memanipulasi store tidak bisa mengubah harga.

**(4)** `language.store` menyimpan pilihan bahasa (ID/EN) dan memakai `persist` ke `localStorage`. Ini satu-satunya data yang memang pantas persisten di klien; token tidak.

**(5)** `wishlist.store` menyimpan daftar destinasi favorit di klien. Tidak ada sinkronisasi ke backend, sehingga wishlist hilang saat pengguna berganti perangkat atau membersihkan storage.

**(6)** Semua store dapat diakses dari komponen mana pun, yang membuat ketergantungan antar fitur mudah terjadi. Aturan praktis: jangan memanggil API dari dalam store; lakukan di hook/komponen, lalu simpan hasilnya.

## 9.23 `frontend/types` — duplikasi kontrak backend

**(1)** `types/api.ts` (341 baris) memuat bentuk respons (`ApiResponse`, `ApiMeta`, `Booking`, `Payment`, `Ticket`, dsb.) yang **disalin manual** dari DTO Go. Tidak ada generator; setiap perubahan `booking/dto.go` harus disertai perubahan di sini.

**(2)** `types/domain.ts` (175 baris) memuat tipe domain yang dipakai komponen (mis. `BookingItem`, `PaymentMethod`, `ETicket`). Sebagian tipe ada di kedua file dengan nama berbeda, sehingga komponen mengimpor dari sumber yang tidak seragam.

**(3)** Field opsional di TypeScript sering tidak cocok dengan `omitempty` di Go: backend menghilangkan field kosong, frontend mendeklarasikannya wajib. Akibatnya `booking.payment` bisa `undefined` meski tipenya `Payment`. Gunakan `?.` dan nilai default saat membaca.

**(4)** Tidak ada validasi runtime (zod/valibot) pada respons API. Data yang bentuknya melenceng tetap dikonsumsi dan baru gagal saat render, dengan pesan yang tidak menunjuk ke penyebabnya.

## 9.24 `frontend/config`

**(1)** `app.config.ts` memuat `BOOKING_CONFIG` (serviceFee, discountPercent, taxPercent), batas tanggal, dan konfigurasi tampilan. **Nilai `serviceFee` di sini tidak otomatis sama dengan backend** (9.3.1); jadikan sumber tunggal atau turunkan dari API.

**(2)** `payment.config.ts` memuat `PAYMENT_METHOD_GROUPS`, `findPaymentMethod`, `paymentMethodLabel`. Daftar metode harus sinkron dengan `payments.Methods` di backend (8.9). Menambah metode di UI tanpa backend menghasilkan penolakan 422 saat membayar.

**(3)** Konfigurasi menu panel (bila ada di `config/`) menentukan item yang terlihat per peran. Karena pengecekan peran di klien case-sensitive, jangan menulis nama peran dalam huruf campur.
### 9.3.8 `content.ts` — konten statis pemasaran

**(1)** File ini berisi teks yang **memang statis** (cerita pengunjung, sejarah, section tentang destinasi) dan komentar di atasnya menegaskan bukan mock database. Data operasional tetap dari API; jangan menambahkan data dinamis ke sini.

**(2)** `homeTicketOptions` memuat harga literal (`"Rp31.000"`, `"Rp18.000"`, `"Rp32.000"`) yang mengacu pada seed. Harga ini **tidak** terhubung ke `ticket_types`, sehingga perubahan harga di database tidak mengubah kartu di beranda. Ini sumber ketidakcocokan harga yang paling mungkin terlihat pengunjung.

**(3)** `quantity: 0` pada setiap opsi menunjukkan kartu ini hanya pratinjau; jumlah sebenarnya diisi di halaman paket dari API. Jika komponen beranda memakai `quantity` untuk menghitung total, hasilnya nol.

### 9.3.9 `date.ts`

```ts
try { return format(parseISO(dateStr), pattern, { locale: id }); }
catch { return dateStr; }
```

**(1)** `parseISO` mengharapkan format ISO (`2026-11-12` atau dengan waktu). Untuk nilai yang bukan tanggal (mis. `"-"`), fungsi mengembalikan string aslinya alih-alih melempar — aman untuk tabel yang punya sel kosong.

**(2)** `locale: id` menghasilkan nama bulan Indonesia (`12 November 2026`). Ini konsisten dengan `rupiah` yang memakai `id-ID`, tetapi berbeda dari `Intl` di `currency.ts` yang juga `id-ID` — jadi format tanggal dan uang seragam secara bahasa.

**(3)** `formatDateTime` menambahkan jam `HH:mm` dalam zona waktu **browser**, bukan WIB paksa. Pengunjung di zona lain melihat waktu lokalnya; untuk tiket yang dipakai di gerbang, ini bisa membingungkan bila perangkat tidak di-set WIB.

### 9.3.10 `eticket-pdf.ts` — PDF dibuat di klien

```ts
const qrPayload = JSON.stringify({ t: ticket.id, b: ticket.bookingId, v: ticket.visitDate, n: ticket.quantity, s: ticket.status });
const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 360, margin: 1 });
```

**(1)** Payload QR berupa JSON dengan kunci `t` (ticket id) dan `b` (booking id). Backend `qrPayloadRef` mendukung `t`, `id`, `b`, dan `booking_id` (7.4.2), jadi format ini kompatibel **selama** `ticket.id` adalah UUID tiket. Kalau `ticket.id` berisi kode lain, `t` akan dicari sebagai UUID dan gagal, lalu `b` dipakai sebagai cadangan.

**(2)** QR berisi status tiket saat PDF dibuat (`s`). Statusnya bisa basi: tiket yang sudah `USED` tetap tercetak `VALID` jika diunduh sebelum scan. Backend tetap memeriksa status dari database, jadi QR lama tidak bisa dipakai dua kali — payload hanya informasi.

```ts
["Kode Booking", booking.id],
["Kode Tiket", ticket.id],
...
["Metode Pembayaran", "QRIS"],
```

**(1)** `booking.id` adalah UUID, bukan `booking_code`. PDF menyebutnya "Kode Booking", sehingga pengunjung yang membacakannya ke petugas akan menyebut UUID panjang, bukan `KP-...`. Seharusnya memakai `booking.bookingCode` (bila tersedia di tipe) atau field kode dari tiket.

**(2)** Metode pembayaran di-hardcode `"QRIS"` meski pengunjung bisa memilih metode lain. Ini informasi yang salah di dokumen resmi.

**(3)** Nilai dipotong `String(value).slice(0, 55)` agar muat di kolom. Untuk email panjang atau nama jenis tiket gabungan (multi-item), teks terpotong tanpa elipsis — pembaca tidak tahu ada bagian hilang.

**(4)** `doc.save()` memicu unduhan langsung di browser. Tidak ada fallback bila `QRCode.toDataURL` gagal (mis. canvas tidak tersedia di lingkungan tertentu); promise akan reject dan tombol unduh tampak tidak merespons kecuali komponen menangani error.

### 9.3.11 `report-export.ts` — ekspor laporan di klien

**(1)** `exportReportPDF` menggambar header, ringkasan, dan tiga grafik batang sederhana. Tidak ada sumbu, gridline, atau angka di atas batang — hanya tinggi relatif dan label. Cukup untuk laporan manajerial, tetapi tidak bisa dibaca sebagai nilai absolut tanpa tabel.

**(2)** `drawBarChartPDF` memakai `Math.max(...series.map(...), 1)` sehingga deret kosong tidak membagi nol. Batang minimum 4 pt agar nilai nol tetap terlihat.

**(3)** `exportReportExcel` membuat dua sheet: Ringkasan dan Data Harian. Angka ditulis sebagai angka (bukan string), sehingga bisa dijumlahkan di Excel. Tanggal ditulis sebagai string ISO.

**(4)** Nama file memakai `new Date().toISOString().slice(0,10)` — tanggal **UTC**. Di WIB antara pukul 00:00–07:00, nama file menunjukkan tanggal kemarin. Kecil, tetapi terlihat oleh pengguna.

**(5)** Kedua fungsi berjalan penuh di browser dan tidak memanggil backend. Artinya laporan yang diekspor hanya seakurat data yang sudah dimuat di halaman; kalau halaman memuat 30 hari, PDF tidak bisa memuat 90 hari tanpa memuat ulang data.

## 9.25 Sisa service frontend — satu per satu

### 9.25.1 `booking.api.service.ts` (10 method)

**(1)** `list()` hanya membungkus `listWithMeta()` dan membuang `total`. Halaman yang butuh total harus memanggil `listWithMeta`; halaman yang memakai `list` tidak bisa membedakan "10 dari 10" dan "10 dari 250".

**(2)** Parameter default `limit` adalah **10** untuk admin dan pengguna. Halaman yang lupa mengirim `limit` akan diam-diam hanya menampilkan 10 baris. `listForVisitor` memakai default 100 — tidak konsisten.

**(3)** `getById` menelan error menjadi `null` (try/catch kosong), sehingga "booking tidak ada" dan "server mati" tampak sama. `create` dan `cancel` melempar `BookingError`, jadi perilaku antar-method tidak seragam.

**(4)** `cancel` memakai `DELETE /bookings/:id` meski namanya "cancel" (bukan delete); backend menandai `CANCELLED`, tidak menghapus. Sementara `remove` memakai `DELETE /admin/bookings/:id` yang benar-benar menghapus. Dua kata kerja, dua endpoint, mudah tertukar.

**(5)** `updateStatus` mengirim `PATCH /admin/bookings/:id/status` dengan `{status}`. Backend memvalidasi transisi; UI admin mengirim transisi apa pun yang dipilih (9.19.1).

### 9.25.2 `payment.api.service.ts`

**(1)** `getByBookingId` memanggil `/payments/booking/:id` yang mengembalikan `PaymentDetail` (field payment di level atas + `ticket`/`booking`). Tipe `Payment` yang dipakai hanya mengambil sebagian field; data tiket/booking diabaikan. Ini **bukan** bug, karena `PaymentDTO` di-embed.

**(2)** `processPayment` membaca envelope `data.booking/payment/outcome` dengan benar dan melempar `PaymentError` bila gagal. Ini contoh penanganan envelope yang tepat — bandingkan dengan `scannerService.validateTicket` (9.8).

**(3)** `expirePayment` memakai `POST /payments/expire?booking_id=...` dengan body kosong. Parameter di query, bukan body, sehingga mudah terlewat saat mengubah kontrak.

**(4)** `list` untuk admin memakai default `limit 10`; `updateStatus` mengembalikan `response.data!` tanpa memeriksa null. Jika backend mengembalikan sukses tanpa data, pemanggil menerima `undefined` yang diketik sebagai `Payment`.

### 9.25.3 `ticket.api.service.ts`

**(1)** `getActive()` memanggil endpoint tiket aktif dan dipakai di alur pemesanan; `getByCode()` mencari kode tiket untuk scan/manual.

**(2)** `create` menerima `Omit<Ticket, "id"|"created_at"|"updated_at"|"available">`, sehingga pemanggil **wajib** mengirim `code`, `category`, `status`, dan `is_active`. Admin tickets mengisi semuanya, tetapi `category` selalu `ENTRANCE` (9.19.2).

**(3)** `update` menerima `Partial<Ticket>` — jauh lebih longgar dari backend. Field seperti `id` atau `available` bisa ikut terkirim dan diabaikan/ditolak backend tanpa peringatan di kompilasi.

**(4)** `getCategories()` mengembalikan `string[]`; jika backend mengembalikan objek kategori, UI akan menampilkannya sebagai `[object Object]` bila tidak dipetakan.

### 9.25.4 `article.service.ts`, `destination-info.service.ts`, `facility.service.ts`, `faq.service.ts`, `gallery.service.ts`, `visitor-rule.service.ts`

**(1)** Enam service konten ini hampir identik: `list`, `get`, `create`, `update`, `remove`, dan untuk tiga di antaranya `listPublished` serta `publish`/`archive`. Mereka adalah lapisan tipis di atas `apiClient` tanpa logika tambahan.

**(2)** `article` memakai status huruf kecil (`draft`/`published`) sesuai backend, sedangkan `facility`/`faq`/`visitor-rule` memakai `is_published` boolean. Dua model publikasi berbeda hidup berdampingan; komponen CMS harus tahu mana yang dipakai.

**(3)** `destination-info` hanya punya **satu** dokumen aktif (`getPublished()` mengembalikan objek tunggal, bukan array). Ini berbeda dari konten lain yang berupa daftar; halaman publik informasi destinasi karena itu menampilkan satu set data.

**(4)** `get()` melempar (tidak menangkap) pada sebagian service dan mengembalikan `null` pada yang lain. Halaman detail harus menyesuaikan; `article.get` mengembalikan `null` (dipakai untuk 404), `facility.get` melempar.

**(5)** `gallery.update` menerima `Partial<CreateGalleryItemPayload>` sementara yang lain memakai tipe `Update...Payload` penuh. Perbedaan ini memengaruhi apakah field yang tidak dikirim di-reset atau dibiarkan.

### 9.25.5 `destination.service.ts` (paket wisata)

**(1)** Nama file `destination.service.ts` menyesatkan: isinya CRUD **paket wisata** (`TourismPackage`), bukan destinasi. Destinasi sebagai entitas tidak punya service sendiri; halaman `/destination` masih placeholder.

**(2)** `list` menerima `active_only` dan mengembalikan paket; harga dalam **sen** (`price_cents`), sehingga semua tampilan harus memakai `formatCurrency`, bukan `rupiah` (9.3.2).

### 9.25.6 `analytics.api.service.ts`

**(1)** Tiga method: `getAdminDashboard()` (statistik admin), `getManagerAnalytics(params)` (laporan dengan rentang), `getManagerDashboard()` (ringkasan manager). Semua mengembalikan objek agregat, bukan daftar.

**(2)** `AnalyticsParams` berisi `range` dan `custom {from,to}`; parameter diteruskan ke backend sebagai query. Backend menghitung ulang di server, jadi angka tidak bisa dimanipulasi klien — hanya rentangnya.

**(3)** Tidak ada tipe union untuk `DateRangePreset` di service; tipe itu diimpor dari `types/domain` di halaman dan dari service di `DateRangeFilter`, sehingga ada dua sumber tipe yang harus sama.

### 9.25.7 `audit.api.service.ts`

**(1)** `list(params)` mengembalikan `AuditFeed` (data + meta). `useAuditFeed` membungkusnya untuk badge admin dan halaman audit log.

**(2)** `auditActionLabel(action)` memetakan kode aksi menjadi label Indonesia. Kalau backend menambah aksi baru, label jatuh ke kode mentah (`BOOKING_CREATE`) sampai peta diperbarui.

### 9.25.8 `staff.api.service.ts`, `visitor.api.service.ts`

**(1)** `staffService` mengelola akun staf: `list`, `getById`, `getStats`, `updateStatus("AKTIF"|"NONAKTIF")`. Tidak ada create/delete di service meski halaman admin users mungkin menyediakannya lewat endpoint lain.

**(2)** `visitorService` mengelola data kunjungan: `list`, `getById`, `getStats`. Nama "visitor" di sini berarti **pengunjung yang check-in**, bukan akun pengguna; jangan tertukar dengan `user`.

**(3)** Keduanya mengembalikan `Record<string, number>` untuk statistik, sehingga nama field tidak diketahui saat kompilasi. Salah ketik nama field menghasilkan `undefined` yang tampil sebagai kosong, bukan error kompilasi.

### 9.25.9 `eticket.api.service.ts`

**(1)** `getByBookingId` memakai `/payments/booking/:id`, bukan `/e-tickets/booking/:id`. Ini **disengaja** karena endpoint payments mengembalikan `PaymentDetail` yang sudah memuat `ticket` dan `booking` sekaligus. Endpoint `/e-tickets/booking/:id` juga ada, tetapi hanya mengembalikan tiket.

**(2)** Fungsi menangkap semua error dan mengembalikan `null`, sehingga halaman e-tiket menampilkan "e-tiket belum tersedia" bahkan saat server mati.

**(3)** `markDownloaded` melempar `BookingError` (bukan `ETicketError`) jika gagal. Pemanggil yang menangkap `BookingError` akan salah mengira itu error booking.

### 9.25.10 `upload.service.ts`

**(1)** Satu method: `image(file)` mengirim `FormData` ke `/uploads` dan mengembalikan `data.url`. Jika `success=false` atau URL kosong, ia melempar `Error` biasa (bukan kelas error domain), sehingga pesan error tetap sampai ke toast tetapi tidak bisa dibedakan berdasarkan tipe.

**(2)** Tidak ada validasi ukuran/tipe di klien; backend yang menolak. Komentar "siap disimpan sebagai image_url" menegaskan hasilnya path, bukan URL absolut — `next/image` memerlukan path yang dapat di-resolve atau domain terdaftar.

## 9.26 Status cakupan dan daftar bug frontend

### 9.26.1 Yang sudah dibedah dan kedalamannya

**(1)** **Baris per baris / per fungsi:** `middleware.ts`, `lib/api.ts`, `lib/api/client.ts`, `lib/jwt.ts`, `lib/permission.ts`, `lib/role-home.ts`, `lib/redirect.ts`, `lib/business.ts`, `lib/currency.ts`, `lib/date.ts`, `lib/eticket-pdf.ts`, `lib/report-export.ts`, `store/auth.store.ts`, `providers/auth-provider.tsx`, `services/auth.api.service.ts`, `services/scanner.api.service.ts`, `services/booking.api.service.ts`, `services/payment.api.service.ts`, `components/layout/panel-layout.tsx`, `components/panel/panel-ui.tsx`, `components/panel/panel-toolbar.tsx`, `components/panel/date-range-filter.tsx`, `features/authentication/components/login-form.tsx`, `features/booking/components/booking-form.tsx`, `features/booking/components/my-bookings-list.tsx`, `features/public/components/booking-order-form.tsx`, `app/(dashboard)/dashboard/{page,ticket,payment}.tsx`, `app/(admin)/admin/{bookings,tickets}.tsx`, `app/(manager)/manager/revenue/page.tsx`, `app/(petugas)/petugas/ticket/page.tsx`, seluruh layout route group, `app/(public)/page.tsx`.

**(2)** **Ditambahkan pada putaran ini (9.31–9.45), juga baris per baris/per blok:** `components/layout/navbar.tsx`, `components/ui/inputs/{date-picker,phone-input}.tsx`, empat form auth (`register`, `reset-password`, `change-password`, `forgot-password`), `features/{faq,visitor-rule,destination-info}/components/*-admin.tsx`, `app/(admin)/admin/{users,visitors}.tsx`, `app/(admin)/admin/{reports,audit-log}.tsx`, `app/(admin)/admin/{content,payments}.tsx`, `app/(manager)/manager/{sales,bookings,monitoring,visitors}.tsx`, `app/(manager)/manager/dashboard/page.tsx`, `app/(petugas)/petugas/{dashboard,history}.tsx`, `app/(admin)/admin/{dashboard,notifications,settings}.tsx`, `app/(public)/e-ticket/page.tsx`, `app/(public)/{about,facilities,faq,gallery}.tsx`, `app/(public)/articles/{page,[id]}.tsx`, `features/destination/components/{package-card,packages-list,home-packages}.tsx`, `app/(public)/{booking,payment}/page.tsx`, `features/public/components/{payment-panel,faq-accordion}.tsx`, `components/ui/{confirm-dialog,button,input,select,textarea,card,badge}.tsx`, `store/{booking,language,theme,wishlist}.store.ts`, `providers/theme-provider.tsx`, 12 hook di `hooks/`, `app/(public)/packages/[id]/page.tsx`, `components/empty/coming-soon.tsx`, dan inventaris 20 halaman placeholder.

**(3)** **Masih per-file / struktural (bukan tiap baris):** provider selain `auth-provider` dan `theme-provider` (`query-provider`, `toast-provider`, dsb.), komponen pendukung (`components/loading/skeleton`, `empty-state`, `panel/*` yang belum disebut), `features/{cms,gallery,facility,visitor-rule}/*-admin` (dibahas polanya di 9.35), skema zod di `features/*/schemas`, dan halaman placeholder yang isinya identik 5 baris (sudah diinventaris lengkap di 9.45.3). Backend sudah 100% dibahas di Bagian 8; yang tersisa hanya kedalaman, bukan cakupan.

**(4)** Tidak ada file frontend yang **tidak disebut sama sekali**: 202 file TS/TSX tercakup minimal sebagai bagian dari kelompok (mis. "15 halaman placeholder").

### 9.26.2 Bug frontend yang berdampak nyata (urut prioritas)

| # | Lokasi | Masalah | Dampak | Status |
|---|--------|---------|--------|--------|
| 1 | `services/scanner.api.service.ts` + `types/api.ts` | `ValidateTicketResponse` membaca `status` di root, backend menaruh di `data` | Semua scan tampil INVALID, tiket valid ditolak | ✅ diperbaiki |
| 2 | `features/booking/components/booking-form.tsx` | `formatCurrency` membagi harga tiket dengan 100 | Harga tampil 100× lebih kecil (Rp 310 vs Rp 31.000) | ✅ diperbaiki |
| 3 | `features/public/components/booking-order-form.tsx` + `lib/business.ts` | Biaya layanan pratinjau nominal tetap, backend 2% | Total pratinjau ≠ total tagihan | ✅ diperbaiki |
| 4 | `app/(dashboard)/dashboard/ticket/page.tsx` | Error tidak pernah dirender karena `tickets === null` menahan skeleton | Halaman loading selamanya saat API gagal |
| 5 | `app/(dashboard)/dashboard/payment/page.tsx` | Error sama; riwayat mencampur status booking & pembayaran | Halaman kosong/loading tanpa pesan; label status salah |
| 6 | `app/(admin)/admin/tickets/page.tsx` | Filter memicu dua fetch (closure lama + effect), race | Data filter lama bisa menimpa yang baru |
| 7 | `app/(admin)/admin/bookings/page.tsx` | Memuat 100 baris tetapi ringkasan memakai total server | Statistik tidak konsisten, data >100 tak terlihat |
| 8 | `lib/jwt.ts` | `atob` tanpa padding | Peran gagal dibaca untuk sebagian token, menu panel kosong |
| 9 | `features/booking/components/my-bookings-list.tsx` | PENDING dengan tanggal lewat tidak masuk tab mana pun | Booking "hilang" dari riwayat |
| 10 | `lib/eticket-pdf.ts` | Metode pembayaran hardcoded QRIS; kode booking = UUID | Dokumen resmi berisi informasi salah |
| 11 | `app/(petugas)/petugas/ticket/page.tsx` | `&bull;` dalam string; `scans` tidak pernah diisi; input di-uppercase | Teks rusak, fitur riwayat mati, UUID tak bisa dicari |
| 12 | `components/panel/panel-ui.tsx` | `STATUS_TONE` tidak memuat status Inggris (`PAID`, `PENDING`, `EXPIRED`) | Warna status booking tidak membedakan apa pun |
| 13 | `app/(dashboard)/dashboard/ticket/page.tsx` (tombol) | "Unduh PDF" hanya tautan ke halaman e-tiket | Tombol tidak melakukan apa yang dikatakan |
| 14 | `features/destination/components/packages-admin.tsx` | Hapus paket tanpa konfirmasi; `toggleActive` mengirim seluruh field | Risiko kehilangan data dan menimpa perubahan lain |
| 15 | `app/(admin)/admin/notifications` badge | Badge = total audit, bukan belum dibaca | Angka tidak bermakna, selalu 99+ |
| 16 | `features/cms`/`packages-admin`/`articles-admin` | Tidak ada paginasi (limit 20/24) | Data ke-21 tidak pernah tampil |
| 17 | `middleware.ts` + backend auth | Frontend menganggap cookie HttpOnly ada tanpa bisa memeriksanya | Guard hanya reaktif setelah `/auth/me`; halaman kosong sesaat |
| 18 | `providers/auth-provider.tsx` | `useAuthReady` men-set ready sebelum `checkSession` selesai | Guard bisa lolos sebelum sesi tervalidasi |

### 9.26.3 Ketidakkonsistenan yang bukan bug tetapi menyulitkan

**(1)** Dua formatter uang (`rupiah` vs `formatCurrency`), dua satuan (rupiah utuh vs sen). Aturan: tiket/booking/pembayaran → `rupiah`; paket → `formatCurrency`.

**(2)** Tiga model status: booking (`PENDING/PAID/...`), tiket (`VALID/USED/...`), publikasi konten (`draft/published` vs `is_published`). Setiap halaman menerjemahkan sendiri; tidak ada modul label terpusat.

**(3)** Dua jalur redirect setelah login: `POST_LOGIN_HOME` di `services/auth` dan `roleHome` di `lib`. Keduanya tidak mengenal set peran yang sama.

**(4)** Dua lapis validasi (regex/`length` saat mengetik + Zod saat submit) dengan pesan berbeda untuk aturan yang sama.

**(5)** Dua sumber tipe (`types/api.ts` dan `types/domain.ts`) plus interface lokal di beberapa halaman (mis. `petugas/ticket`), sehingga kontrak backend terduplikasi tiga kali.

**(6)** Komponen di `components/` dan `features/*/components/` bercampur; sebagian folder `components/*` kosong. Sebelum membuat komponen baru, cari di kedua tempat.

**(7)** Placeholder 5 baris untuk fitur yang belum ada (banner, voucher, refund, event, cuaca, kontak) dapat diakses lewat URL langsung. Sembunyikan tautannya atau tampilkan "belum tersedia" yang jelas.

### 9.26.4 Cara memakai Bagian 9

**(1)** Saat mengubah alur uang (harga, biaya layanan, total), baca 9.3.1, 9.3.2, 9.11.1, 9.12.1, dan 7.2.3 bersama-sama. Perubahan di satu tempat tanpa yang lain menghasilkan selisih tampilan versus tagihan.

**(2)** Saat mengubah status (booking, tiket, pembayaran), perbarui peta label di **semua** halaman yang menyebutnya: `admin/bookings`, `admin/payments`, `dashboard`, `dashboard/booking`, `dashboard/payment`, `dashboard/ticket`, `petugas/ticket`, `panel-ui`. Cari dengan `grep -rn "STATUS_ID\|STATUS_PILL\|PAYMENT_ID"`.

**(3)** Saat menambah endpoint, ikuti pola `paymentService.processPayment`: baca envelope `{success, message, data}`, periksa `response.data`, lempar error domain. Jangan mengembalikan objek bertipe yang salah seperti `validateTicket`.

**(4)** Saat menambah halaman panel, gunakan `PageHeader` + `SectionCard` + `DataTable`/`PanelTable`, dan panggil hook React Query yang sudah ada agar invalidasi otomatis bekerja.
## 9.27 Berkas pendukung yang belum masuk bagian sebelumnya

### 9.27.1 `config/app.config.ts`

```ts
export const BOOKING_CONFIG = {
  minDaysAhead: 0,
  maxDaysAhead: 365,
  maxQuantityPerTicket: 20,
  serviceFeePercent: 2,
  discountPercent: 0,
  taxPercent: 0,
  paymentExpiryMinutes: 15,
  paymentSuccessRate: 0.9,
} as const;
```

**(1)** **Sudah diperbaiki:** `serviceFeePercent: 2` menggantikan flat Rp 2.500. Nilai ini harus tetap sama dengan `serviceFeeRate` di backend; pratinjau di `packages/page.tsx`, `booking-order-form.tsx`, dan profil biaya di admin settings kini memakai persentase yang sama dengan tagihan server.

**(2)** `maxQuantityPerTicket: 20` harus cocok dengan validasi backend. Jika backend membatasi 10, UI mengizinkan 20 dan pengguna baru ditolak saat submit.

**(3)** `minDaysAhead: 0` berarti hari ini boleh dipesan. Backend juga mengizinkan tanggal hari ini selama belum lewat; tidak ada pemotongan jam, jadi tiket untuk "hari ini" bisa dibeli pukul 16:30 padahal gerbang tutup 17:00. Tidak ada validasi jam operasional di mana pun.

**(4)** `paymentExpiryMinutes: 15` hanya untuk tampilan countdown di klien. Backend memakai `payments.PaymentWindow` (30 menit) untuk benar-benar mengedaluwarsakan. Timer UI bisa menghabiskan hitungan lebih dulu atau lebih lambat daripada status sebenarnya.

**(5)** `paymentSuccessRate` dan `dailyVisitorCapacity` adalah sisa mode simulasi/demo. Nilainya tidak dikirim ke backend; simulasi keputusan pembayaran terjadi di server (demo mode). Mengubahnya di frontend tidak mengubah hasil.

**(6)** `as const` membuat tipe literal, sehingga `BOOKING_CONFIG` tidak bisa diubah saat runtime. Untuk pengaturan yang bisa diubah admin, nilai harus datang dari API, bukan file ini.

### 9.27.2 `config/auth.config.ts`

**(1)** `APP_ROLES` berisi `PENGUNJUNG`, `ADMIN`, `MANAGER`, `PETUGAS` — sesuai peran backend. `AppRole` diturunkan dari array ini, sehingga menambah peran di sini otomatis memperluas tipe di guard/sidebar.

**(2)** Dua peta tujuan: `ROLE_HOME` (tautan navbar/manual) dan `POST_LOGIN_HOME` (setelah login). Untuk pengunjung keduanya berbeda: navbar → `/dashboard`, setelah login → `/`. Perbedaan ini disengaja dan dikomentari, tetapi mudah dikira bug saat membaca cepat.

**(3)** `SESSION_DURATION_MS` 8 jam hanya memengaruhi `expiresAt` di store (9.5); token backend punya masa berlaku sendiri. `AUTH_STORAGE_KEY = "kpr-auth"` juga dipakai `login-form` untuk mengisi email terakhir (9.10.1) — mengubah nama key akan memutus fitur itu tanpa error kompilasi.

**(4)** `AUTH_COOKIE_NAME` dideklarasikan tetapi cookie HttpOnly **tidak bisa dibaca JavaScript**, sehingga konstanta ini tidak berguna di klien. Ia hanya dokumentasi; jangan mencoba `document.cookie` untuk memeriksa sesi.

**(5)** Tidak ada peran `super_admin` di `APP_ROLES`, meski backend dan `role-home.ts` mengenalinya. Pengguna `super_admin` akan gagal di `useRouteGuard` untuk panel admin (`allowed.includes("super_admin")` false) dan diarahkan ke `/unauthorized`.

### 9.27.3 `config/payment.config.ts`

**(1)** 12 metode dalam 5 grup: QRIS, e-wallet (GoPay, OVO, DANA, ShopeePay), virtual account (BCA, BNI, Mandiri, BRI), kartu, dan retail (Alfamart, Indomaret). Kode harus **persis** sama dengan konstanta backend karena dikirim apa adanya ke `POST /payments/process`.

**(2)** `findPaymentMethod` melakukan lookup linear pada 12 item — tidak masalah untuk ukuran ini, tetapi dipanggil setiap render label. Tidak ada memoization; tidak perlu.

**(3)** `paymentMethodLabel` mengembalikan kode asli bila tidak ditemukan, sehingga metode baru dari backend tampil sebagai `NEW_METHOD` alih-alih gagal. Ini fallback yang baik, tetapi juga menyembunyikan ketidaksinkronan konfigurasi.

**(4)** `kind` menentukan tampilan instruksi pembayaran di `PaymentPanel` (`qris` → QR, `va` → nomor VA, `retail` → kode bayar). Menambah metode dengan `kind` baru tanpa menambah cabang render akan menampilkan panel kosong.

### 9.27.4 `constants/*` — tiga file, dua di antaranya menyesatkan

**(1)** `constants/api.ts` hanya mengekspor ulang `API_BASE_URL` dari `lib/api/client` dan `DEFAULT_PAGE_SIZE = 12`. Ekspor ulang ini menjaga satu sumber kebenaran; `DEFAULT_PAGE_SIZE` dipakai beberapa daftar publik.

**(2)** `constants/roles.ts` memakai peran **huruf kecil** (`admin`, `super_admin`, `owner`, `finance_admin`, `staff_ticketing`, `staff_content`, `visitor`) yang **tidak cocok** dengan peran backend (`ADMIN`, `MANAGER`, `PETUGAS`, `PENGUNJUNG`) maupun `APP_ROLES`. Jika file ini diimpor untuk pengecekan peran, semua perbandingan gagal. Saat ini tampaknya tidak dipakai; sebaiknya dihapus atau diselaraskan.

**(3)** `constants/routes.ts` mendefinisikan path sebagai konstanta. Berguna, tetapi sebagian besar halaman menulis path literal (`/payment?code=...`), sehingga konstanta ini tidak menjadi sumber tunggal. `PACKAGE_DETAIL` memakai `id` sesuai komentar backend yang hanya mendukung `FindByID`.

**(4)** `ARTICLE_DETAIL: (slug) => /articles/${slug}` menggunakan **slug**, sedangkan halaman `articles/[id]` dan service `get(id)` memakai **ID**. Ini ketidakcocokan yang bisa menghasilkan 404 bila konstanta dipakai. Halaman daftar artikel saat ini menautkan dengan ID, jadi bug tersembunyi sampai ada yang memakai `ROUTES.ARTICLE_DETAIL`.

### 9.27.5 `next.config.ts`

```ts
async rewrites() {
  return [{ source: "/api/v1/:path*", destination: `${apiProxyTarget}/api/v1/:path*` }];
}
```

**(1)** Proxy same-origin adalah keputusan penting: browser memanggil `/api/v1` di origin frontend, Next meneruskan ke backend Go. Tujuannya agar cookie HttpOnly `SameSite=Lax` tetap menempel saat frontend diakses lewat IP LAN/HP, bukan hanya `localhost`. Tanpa ini, login dari HP gagal karena cookie lintas situs ditolak.

**(2)** `API_PROXY_TARGET` dibaca **saat build/start server**, bukan oleh browser. Ini variabel server-only; jangan menaruhnya di `NEXT_PUBLIC_*`.

**(3)** `images.remotePatterns` dibangun dari `NEXT_PUBLIC_IMAGE_HOSTS` (default Unsplash/Pexels), untuk http dan https. Host gambar hasil upload (mis. storage eksternal atau IP LAN) harus ditambahkan, atau `next/image` akan menolak URL dan menampilkan gambar rusak.

**(4)** Header keamanan: `X-Frame-Options: DENY` (anti-clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Tidak ada `Content-Security-Policy`; menambahkannya perlu menyesuaikan inline style/script yang dipakai banyak komponen.

**(5)** `reactStrictMode: true` menjalankan effect dua kali di development. Ini menjelaskan mengapa `checkSession`/fetch bisa terlihat berjalan ganda saat `npm run dev`; di production hanya sekali.

### 9.27.6 `tailwind.config.ts`

**(1)** `content` hanya memindai `app`, `components`, `features`. Kelas Tailwind yang ditulis di `providers`, `hooks`, `lib`, atau `services` **tidak akan dihasilkan**. Saat ini file di folder itu hampir tidak memakai kelas, tetapi menambahkan `className` di sana akan menghasilkan style hilang tanpa error.

**(2)** Palet `brand` bernilai teal (`#0F766E`), sedangkan hampir seluruh UI memakai biru hardcode (`#1768ad`, `#14548f`). Akibatnya `bg-brand` (dipakai beberapa tombol lama) berwarna teal, sementara tombol lain biru. Ini inkonsistensi visual nyata, bukan sekadar token tak terpakai.

**(3)** `fontFamily.heading/body` memakai CSS variable dari `next/font` (9.15.1), jadi nama font tidak di-hardcode di sini.

**(4)** `darkMode: "class"` dan beberapa warna `dark` disiapkan, tetapi sebagian besar komponen tidak memakai varian `dark:`. Mode gelap hanya berlaku pada komponen yang secara eksplisit menambahkannya (beberapa form CMS).

**(5)** `borderRadius` kustom (`card`, `btn`, `input`, `dialog`) dipakai di sebagian komponen; banyak lainnya memakai `rounded-md`/`rounded-lg` langsung. Tidak ada aturan tunggal radius.

### 9.27.7 Dua `globals.css`

**(1)** `app/globals.css` (166 baris) adalah file yang **benar-benar diimpor** oleh `app/layout.tsx`. Isinya: variabel warna, style dasar body/heading, focus-visible, `.page-shell`, tabel panel, serta aturan `.panel-rail`/`.panel-burger`/`.panel-scrim`/`.panel-drawer` dengan animasi dan `prefers-reduced-motion`.

**(2)** `styles/globals.css` (101 baris) **tidak diimpor di mana pun** (tidak ada referensi `styles/globals`). Isinya versi lebih lama tanpa aturan rail/drawer. File ini dead code; jika seseorang menyuntingnya, perubahan tidak akan terlihat.

**(3)** Aturan rail memakai media query `(hover: hover) and (pointer: fine)` — keputusan bagus agar tablet sentuh memakai drawer, bukan rail ikon tanpa label. Ini sesuai komentar di `PanelLayout`.

**(4)** `:focus-visible` diberi outline `brand-600` (teal), bukan biru UI. Indikator fokus tetap terlihat, tetapi warnanya tidak konsisten dengan palet tombol.

**(5)** `.panel-table` menetapkan `font-size: 11px` global untuk semua tabel panel. Di layar kecil padding dikurangi, tetapi font tidak diperbesar; teks 11px bisa sulit dibaca di ponsel.

### 9.27.8 `scripts/dev.mjs` dan `scripts/generate-cert.mjs`

**(1)** `dev.mjs` menjalankan `generate-cert.mjs` lebih dulu (membuat sertifikat lokal untuk HTTPS), lalu men-spawn Next dengan `--experimental-https` dan cert dari `./certs`. HTTPS diperlukan agar kamera (`getUserMedia`/`BarcodeDetector`) bekerja saat halaman dibuka dari HP lewat IP LAN — browser memblokir kamera pada http non-localhost.

**(2)** Skrip membaca output Next untuk mengetahui port sebenarnya (jika 3000 dipakai, Next pindah ke 3001) dan mencetak alamat LAN yang benar. Ini menyelesaikan masalah nyata "membuka port 3000 milik server lama".

**(3)** Skrip hanya mencetak alamat setelah string "Ready in" muncul; jika format output Next berubah, alamat tidak dicetak, tetapi server tetap berjalan.

**(4)** `generate-cert.mjs` (98 baris) membuat key/cert self-signed di `certs/`. Sertifikat self-signed memicu peringatan browser yang harus diterima manual sekali per perangkat. File cert tidak boleh di-commit (biasanya masuk `.gitignore`).

**(5)** `README.md` frontend berukuran 0 baris — tidak ada dokumentasi cara menjalankan. Pengetahuan tentang `npm run dev:https`, proxy, dan env hanya ada di komentar kode.

### 9.27.9 `.env.example`, `package.json`, dan konfigurasi lain

**(1)** `.env.example` memuat variabel yang dibutuhkan (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_IMAGE_HOSTS`, `API_PROXY_TARGET`, `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`). Nilai `.env.local` tidak dibaca oleh agen (rahasia), jadi pastikan dokumentasi tidak mengandalkan isinya.

**(2)** `package.json` memuat script `dev` (via `scripts/dev.mjs`), `build`, `start`, `lint`. Dependensi utama: Next 15, React 19, TanStack Query, Zustand, React Hook Form + Zod, Tailwind, jsPDF, xlsx, qrcode/react-qr-code, date-fns, sonner, lucide-react.

**(3)** `tsconfig.json` memakai alias `@/*` ke root frontend. Semua impor `@/...` bergantung pada ini; menambah folder baru otomatis dapat diimpor tanpa konfigurasi tambahan.

**(4)** `tsconfig.tsbuildinfo` dan `next-env.d.ts` adalah artefak build; jangan diedit manual.

**(5)** Folder `utils/` **kosong** — utilitas sebenarnya ada di `lib/`. Ini sisa struktur yang bisa membingungkan; jangan menaruh helper baru di `utils/` kecuali ingin memulai konvensi baru.

**(6)** `certs/` berisi sertifikat lokal (dibuat skrip). `public/images/` berisi lima gambar destinasi, termasuk `Kawah-Putih.jpg` yang dipakai hero beranda. Nama file peka huruf besar-kecil di Linux; `kawah-putih-hero.jpg` dan `Kawah-Putih.jpg` adalah dua file berbeda.

## 9.28 Cakupan akhir frontend

**(1)** Dengan 9.27, seluruh direktori frontend yang berisi kode sudah memiliki bagian: `app`, `components`, `config`, `constants`, `features`, `hooks`, `lib`, `middleware.ts`, `providers`, `services`, `store`, `styles`, `types`, `scripts`, `next.config.ts`, `tailwind.config.ts`, serta `public/` dan `certs/` sebagai aset.

**(2)** Kedalaman yang dilaporkan jujur ada di 9.26.1: sekitar 35 file dibaca baris per baris/per fungsi, sisanya per file/komponen dengan temuan utama. Tidak ada file yang sama sekali tidak disebut, tetapi file yang termasuk "per-file" belum tentu setiap barisnya dijelaskan.

**(3)** Delapan belas bug pada tabel 9.26.2 adalah temuan yang bisa diverifikasi dari kode yang dikutip. Tiga teratas — scan selalu INVALID (1), harga tiket 100× lebih kecil (2), dan total pratinjau berbeda dari tagihan (3) — **sudah diperbaiki** dan lolos `tsc --noEmit` serta ESLint; lima belas sisanya masih terbuka.

**(4)** Untuk backend, status dan daftar temuan ada di 8.62; untuk alur transaksi inti, lihat Bagian 7. Dokumen ini sekarang mencakup: arsitektur (Bagian 1–3), frontend awal (4–5), database/Docker (6), alur transaksi baris-per-baris (7), seluruh domain backend (8), dan seluruh frontend (9).

## 9.29 Indeks lengkap berkas proyek (checklist anti-terlewat)

**(1)** Daftar berikut dihasilkan langsung dari filesystem: **410 berkas** sumber/konfigurasi (tanpa `node_modules`, `.next`, database `.db`, sertifikat, dan artefak build). Gunakan sebagai checklist: setiap path di bawah sudah memiliki pembahasan di Bagian 7, 8, atau 9; kedalaman per berkas dijelaskan jujur di 8.62 dan 9.26.1.

### 9.29.1 `.`

| Berkas | Baris |
|---|---:|
| `./CODEBASE.md` | 7708 |
### 9.29.2 `backend`

| Berkas | Baris |
|---|---:|
| `backend/.env.example` | 59 |
| `backend/cmd/migration/main.go` | 8 |
| `backend/cmd/scheduler/main.go` | 102 |
| `backend/cmd/server/bootstrap.go` | 86 |
| `backend/cmd/server/main.go` | 23 |
| `backend/cmd/server/router.go` | 12 |
| `backend/cmd/server/server.go` | 52 |
| `backend/go.mod` | 61 |
| `backend/go.sum` | 219 |
| `backend/internal/bootstrap/adapters.go` | 190 |
| `backend/internal/bootstrap/bootstrap.go` | 201 |
| `backend/internal/config/config.go` | 229 |
| `backend/internal/config/database.go` | 86 |
| `backend/internal/domain/analytics/dto.go` | 59 |
| `backend/internal/domain/analytics/handler.go` | 50 |
| `backend/internal/domain/analytics/repository.go` | 187 |
| `backend/internal/domain/analytics/service.go` | 283 |
| `backend/internal/domain/article/dto.go` | 27 |
| `backend/internal/domain/article/entity.go` | 45 |
| `backend/internal/domain/article/errors.go` | 5 |
| `backend/internal/domain/article/handler.go` | 98 |
| `backend/internal/domain/article/mapper.go` | 16 |
| `backend/internal/domain/article/repository.go` | 82 |
| `backend/internal/domain/article/routes.go` | 20 |
| `backend/internal/domain/article/service.go` | 131 |
| `backend/internal/domain/article/usecase.go` | 67 |
| `backend/internal/domain/article/validator.go` | 35 |
| `backend/internal/domain/audit/dto.go` | 87 |
| `backend/internal/domain/audit/entity.go` | 79 |
| `backend/internal/domain/audit/handler.go` | 75 |
| `backend/internal/domain/audit/repository.go` | 117 |
| `backend/internal/domain/audit/service.go` | 172 |
| `backend/internal/domain/audit/usecase.go` | 45 |
| `backend/internal/domain/auth/dto.go` | 66 |
| `backend/internal/domain/auth/entity.go` | 69 |
| `backend/internal/domain/auth/errors.go` | 19 |
| `backend/internal/domain/auth/handler.go` | 304 |
| `backend/internal/domain/auth/mapper.go` | 27 |
| `backend/internal/domain/auth/repository.go` | 145 |
| `backend/internal/domain/auth/routes.go` | 30 |
| `backend/internal/domain/auth/service.go` | 443 |
| `backend/internal/domain/auth/usecase.go` | 140 |
| `backend/internal/domain/auth/validator.go` | 61 |
| `backend/internal/domain/booking/dto.go` | 74 |
| `backend/internal/domain/booking/entity.go` | 75 |
| `backend/internal/domain/booking/errors.go` | 25 |
| `backend/internal/domain/booking/handler.go` | 144 |
| `backend/internal/domain/booking/mapper.go` | 56 |
| `backend/internal/domain/booking/repository.go` | 352 |
| `backend/internal/domain/booking/routes.go` | 32 |
| `backend/internal/domain/booking/service.go` | 562 |
| `backend/internal/domain/booking/usecase.go` | 103 |
| `backend/internal/domain/destinationinfo/dto.go` | 70 |
| `backend/internal/domain/destinationinfo/entity.go` | 48 |
| `backend/internal/domain/destinationinfo/errors.go` | 10 |
| `backend/internal/domain/destinationinfo/handler.go` | 111 |
| `backend/internal/domain/destinationinfo/repository.go` | 86 |
| `backend/internal/domain/destinationinfo/routes.go` | 24 |
| `backend/internal/domain/destinationinfo/service.go` | 152 |
| `backend/internal/domain/destinationinfo/usecase.go` | 45 |
| `backend/internal/domain/destinationinfo/validator.go` | 20 |
| `backend/internal/domain/facility/dto.go` | 68 |
| `backend/internal/domain/facility/entity.go` | 46 |
| `backend/internal/domain/facility/errors.go` | 7 |
| `backend/internal/domain/facility/handler.go` | 92 |
| `backend/internal/domain/facility/repository.go` | 70 |
| `backend/internal/domain/facility/routes.go` | 23 |
| `backend/internal/domain/facility/service.go` | 94 |
| `backend/internal/domain/facility/usecase.go` | 37 |
| `backend/internal/domain/facility/validator.go` | 20 |
| `backend/internal/domain/faq/dto.go` | 52 |
| `backend/internal/domain/faq/entity.go` | 36 |
| `backend/internal/domain/faq/errors.go` | 7 |
| `backend/internal/domain/faq/handler.go` | 93 |
| `backend/internal/domain/faq/repository.go` | 74 |
| `backend/internal/domain/faq/routes.go` | 23 |
| `backend/internal/domain/faq/service.go` | 81 |
| `backend/internal/domain/faq/usecase.go` | 35 |
| `backend/internal/domain/faq/validator.go` | 20 |
| `backend/internal/domain/gallery/dto.go` | 46 |
| `backend/internal/domain/gallery/entity.go` | 35 |
| `backend/internal/domain/gallery/errors.go` | 5 |
| `backend/internal/domain/gallery/handler.go` | 82 |
| `backend/internal/domain/gallery/mapper.go` | 13 |
| `backend/internal/domain/gallery/repository.go` | 58 |
| `backend/internal/domain/gallery/routes.go` | 20 |
| `backend/internal/domain/gallery/service.go` | 77 |
| `backend/internal/domain/gallery/usecase.go` | 61 |
| `backend/internal/domain/gallery/validator.go` | 39 |
| `backend/internal/domain/package/dto.go` | 33 |
| `backend/internal/domain/package/entity.go` | 41 |
| `backend/internal/domain/package/errors.go` | 5 |
| `backend/internal/domain/package/handler.go` | 83 |
| `backend/internal/domain/package/mapper.go` | 17 |
| `backend/internal/domain/package/repository.go` | 69 |
| `backend/internal/domain/package/routes.go` | 18 |
| `backend/internal/domain/package/service.go` | 106 |
| `backend/internal/domain/package/usecase.go` | 61 |
| `backend/internal/domain/package/validator.go` | 20 |
| `backend/internal/domain/payments/dto.go` | 56 |
| `backend/internal/domain/payments/entity.go` | 86 |
| `backend/internal/domain/payments/handler.go` | 160 |
| `backend/internal/domain/payments/repository.go` | 139 |
| `backend/internal/domain/payments/service.go` | 597 |
| `backend/internal/domain/payments/usecase.go` | 80 |
| `backend/internal/domain/public/dto.go` | 199 |
| `backend/internal/domain/public/entity.go` | 103 |
| `backend/internal/domain/public/errors.go` | 8 |
| `backend/internal/domain/public/handler.go` | 117 |
| `backend/internal/domain/public/repository.go` | 144 |
| `backend/internal/domain/public/routes.go` | 21 |
| `backend/internal/domain/public/service.go` | 110 |
| `backend/internal/domain/public/validator.go` | 20 |
| `backend/internal/domain/role/dto.go` | 12 |
| `backend/internal/domain/role/entity.go` | 57 |
| `backend/internal/domain/role/errors.go` | 7 |
| `backend/internal/domain/role/handler.go` | 41 |
| `backend/internal/domain/role/mapper.go` | 17 |
| `backend/internal/domain/role/repository.go` | 90 |
| `backend/internal/domain/role/routes.go` | 23 |
| `backend/internal/domain/role/service.go` | 68 |
| `backend/internal/domain/role/usecase.go` | 20 |
| `backend/internal/domain/role/validator.go` | 20 |
| `backend/internal/domain/ticketing/dto.go` | 156 |
| `backend/internal/domain/ticketing/entity.go` | 70 |
| `backend/internal/domain/ticketing/handler.go` | 184 |
| `backend/internal/domain/ticketing/repository.go` | 187 |
| `backend/internal/domain/ticketing/service.go` | 507 |
| `backend/internal/domain/tickettype/dto.go` | 31 |
| `backend/internal/domain/tickettype/entity.go` | 44 |
| `backend/internal/domain/tickettype/errors.go` | 23 |
| `backend/internal/domain/tickettype/handler.go` | 172 |
| `backend/internal/domain/tickettype/mapper.go` | 24 |
| `backend/internal/domain/tickettype/repository.go` | 92 |
| `backend/internal/domain/tickettype/routes.go` | 23 |
| `backend/internal/domain/tickettype/service.go` | 212 |
| `backend/internal/domain/tickettype/validator.go` | 20 |
| `backend/internal/domain/user/dto.go` | 15 |
| `backend/internal/domain/user/entity.go` | 22 |
| `backend/internal/domain/user/errors.go` | 6 |
| `backend/internal/domain/user/handler.go` | 42 |
| `backend/internal/domain/user/mapper.go` | 8 |
| `backend/internal/domain/user/repository.go` | 52 |
| `backend/internal/domain/user/routes.go` | 14 |
| `backend/internal/domain/user/service.go` | 37 |
| `backend/internal/domain/user/usecase.go` | 51 |
| `backend/internal/domain/user/validator.go` | 20 |
| `backend/internal/domain/verification/dto.go` | 73 |
| `backend/internal/domain/verification/entity.go` | 45 |
| `backend/internal/domain/verification/errors.go` | 7 |
| `backend/internal/domain/verification/handler.go` | 83 |
| `backend/internal/domain/verification/repository.go` | 61 |
| `backend/internal/domain/verification/service.go` | 99 |
| `backend/internal/domain/verification/validator.go` | 20 |
| `backend/internal/domain/visitorrule/dto.go` | 56 |
| `backend/internal/domain/visitorrule/entity.go` | 44 |
| `backend/internal/domain/visitorrule/errors.go` | 7 |
| `backend/internal/domain/visitorrule/handler.go` | 93 |
| `backend/internal/domain/visitorrule/repository.go` | 74 |
| `backend/internal/domain/visitorrule/routes.go` | 23 |
| `backend/internal/domain/visitorrule/service.go` | 90 |
| `backend/internal/domain/visitorrule/usecase.go` | 37 |
| `backend/internal/domain/visitorrule/validator.go` | 20 |
| `backend/internal/domain/visitors/entity.go` | 57 |
| `backend/internal/domain/visitors/handler.go` | 136 |
| `backend/internal/domain/visitors/repository.go` | 187 |
| `backend/internal/middleware/audit.go` | 58 |
| `backend/internal/middleware/auth.go` | 110 |
| `backend/internal/middleware/cors.go` | 49 |
| `backend/internal/middleware/observability.go` | 32 |
| `backend/internal/middleware/ratelimiter.go` | 112 |
| `backend/internal/payment/midtrans/gateway.go` | 154 |
| `backend/internal/routes/routes.go` | 79 |
| `backend/internal/scheduler/expired_booking.go` | 48 |
| `backend/internal/seed/seed.go` | 458 |
| `backend/internal/upload/handler.go` | 119 |
| `backend/pkg/apperror/apperror.go` | 62 |
| `backend/pkg/apperror/http.go` | 87 |
| `backend/pkg/jwtutil/jwtutil.go` | 106 |
| `backend/pkg/logger/logger.go` | 38 |
| `backend/pkg/mailer/mailer.go` | 49 |
| `backend/pkg/response/response.go` | 86 |
| `backend/pkg/slugutil/slugutil.go` | 14 |
| `backend/pkg/validation/middleware.go` | 255 |
| `backend/pkg/validation/validation.go` | 486 |
### 9.29.3 `docker`

| Berkas | Baris |
|---|---:|
| `docker/backend-issues.yaml` | 136 |
| `docker/docker-compose.yml` | 51 |
### 9.29.4 `frontend`

| Berkas | Baris |
|---|---:|
| `frontend/.env.example` | 2 |
| `frontend/.eslintrc.json` | 3 |
| `frontend/README.md` | 0 |
| `frontend/app/(admin)/admin/activity-log/page.tsx` | 6 |
| `frontend/app/(admin)/admin/analytics/page.tsx` | 5 |
| `frontend/app/(admin)/admin/articles/page.tsx` | 13 |
| `frontend/app/(admin)/admin/audit-log/page.tsx` | 205 |
| `frontend/app/(admin)/admin/banner/page.tsx` | 5 |
| `frontend/app/(admin)/admin/bookings/page.tsx` | 368 |
| `frontend/app/(admin)/admin/categories/page.tsx` | 5 |
| `frontend/app/(admin)/admin/contacts/page.tsx` | 5 |
| `frontend/app/(admin)/admin/content/page.tsx` | 219 |
| `frontend/app/(admin)/admin/dashboard/page.tsx` | 122 |
| `frontend/app/(admin)/admin/destination-info/page.tsx` | 13 |
| `frontend/app/(admin)/admin/destinations/page.tsx` | 5 |
| `frontend/app/(admin)/admin/events/page.tsx` | 5 |
| `frontend/app/(admin)/admin/facilities/page.tsx` | 13 |
| `frontend/app/(admin)/admin/faq/page.tsx` | 13 |
| `frontend/app/(admin)/admin/gallery/page.tsx` | 13 |
| `frontend/app/(admin)/admin/notifications/page.tsx` | 82 |
| `frontend/app/(admin)/admin/packages/page.tsx` | 13 |
| `frontend/app/(admin)/admin/payments/page.tsx` | 182 |
| `frontend/app/(admin)/admin/permissions/page.tsx` | 5 |
| `frontend/app/(admin)/admin/promotion/page.tsx` | 5 |
| `frontend/app/(admin)/admin/refunds/page.tsx` | 5 |
| `frontend/app/(admin)/admin/reports/page.tsx` | 351 |
| `frontend/app/(admin)/admin/roles/page.tsx` | 5 |
| `frontend/app/(admin)/admin/settings/page.tsx` | 87 |
| `frontend/app/(admin)/admin/tickets/page.tsx` | 386 |
| `frontend/app/(admin)/admin/users/page.tsx` | 260 |
| `frontend/app/(admin)/admin/visitor-rules/page.tsx` | 13 |
| `frontend/app/(admin)/admin/visitors/page.tsx` | 214 |
| `frontend/app/(admin)/admin/voucher/page.tsx` | 5 |
| `frontend/app/(admin)/layout.tsx` | 46 |
| `frontend/app/(auth)/forgot-password/page.tsx` | 16 |
| `frontend/app/(auth)/login/page.tsx` | 48 |
| `frontend/app/(auth)/register/page.tsx` | 16 |
| `frontend/app/(auth)/reset-password/page.tsx` | 16 |
| `frontend/app/(dashboard)/dashboard/booking/page.tsx` | 14 |
| `frontend/app/(dashboard)/dashboard/history/page.tsx` | 128 |
| `frontend/app/(dashboard)/dashboard/notification/page.tsx` | 5 |
| `frontend/app/(dashboard)/dashboard/page.tsx` | 127 |
| `frontend/app/(dashboard)/dashboard/payment/page.tsx` | 147 |
| `frontend/app/(dashboard)/dashboard/profile/page.tsx` | 137 |
| `frontend/app/(dashboard)/dashboard/review/page.tsx` | 5 |
| `frontend/app/(dashboard)/dashboard/setting/page.tsx` | 22 |
| `frontend/app/(dashboard)/dashboard/ticket/page.tsx` | 160 |
| `frontend/app/(dashboard)/dashboard/wishlist/page.tsx` | 5 |
| `frontend/app/(dashboard)/layout.tsx` | 28 |
| `frontend/app/(manager)/layout.tsx` | 29 |
| `frontend/app/(manager)/manager/bookings/page.tsx` | 156 |
| `frontend/app/(manager)/manager/dashboard/page.tsx` | 123 |
| `frontend/app/(manager)/manager/monitoring/page.tsx` | 120 |
| `frontend/app/(manager)/manager/revenue/page.tsx` | 147 |
| `frontend/app/(manager)/manager/sales/page.tsx` | 166 |
| `frontend/app/(manager)/manager/settings/page.tsx` | 17 |
| `frontend/app/(manager)/manager/visitors/page.tsx` | 92 |
| `frontend/app/(petugas)/layout.tsx` | 25 |
| `frontend/app/(petugas)/petugas/dashboard/page.tsx` | 129 |
| `frontend/app/(petugas)/petugas/history/page.tsx` | 138 |
| `frontend/app/(petugas)/petugas/scan/page.tsx` | 341 |
| `frontend/app/(petugas)/petugas/settings/page.tsx` | 17 |
| `frontend/app/(petugas)/petugas/ticket/page.tsx` | 467 |
| `frontend/app/(public)/about/page.tsx` | 119 |
| `frontend/app/(public)/articles/[id]/page.tsx` | 36 |
| `frontend/app/(public)/articles/page.tsx` | 35 |
| `frontend/app/(public)/booking/page.tsx` | 35 |
| `frontend/app/(public)/contact/page.tsx` | 5 |
| `frontend/app/(public)/destination/page.tsx` | 5 |
| `frontend/app/(public)/e-ticket/page.tsx` | 244 |
| `frontend/app/(public)/events/page.tsx` | 5 |
| `frontend/app/(public)/facilities/page.tsx` | 84 |
| `frontend/app/(public)/faq/page.tsx` | 55 |
| `frontend/app/(public)/gallery/page.tsx` | 28 |
| `frontend/app/(public)/layout.tsx` | 12 |
| `frontend/app/(public)/packages/[id]/page.tsx` | 64 |
| `frontend/app/(public)/packages/page.tsx` | 323 |
| `frontend/app/(public)/page.tsx` | 217 |
| `frontend/app/(public)/payment/page.tsx` | 24 |
| `frontend/app/(public)/promotions/page.tsx` | 5 |
| `frontend/app/(public)/visitor-rules/page.tsx` | 79 |
| `frontend/app/(public)/weather/page.tsx` | 5 |
| `frontend/app/error.tsx` | 17 |
| `frontend/app/global-error.tsx` | 49 |
| `frontend/app/globals.css` | 166 |
| `frontend/app/layout.tsx` | 44 |
| `frontend/app/loading.tsx` | 9 |
| `frontend/app/not-found.tsx` | 22 |
| `frontend/app/unauthorized/page.tsx` | 35 |
| `frontend/components/brand/brand.tsx` | 16 |
| `frontend/components/brand/logo-mark.tsx` | 13 |
| `frontend/components/empty/coming-soon.tsx` | 14 |
| `frontend/components/empty/empty-state.tsx` | 11 |
| `frontend/components/footer/footer.tsx` | 55 |
| `frontend/components/inputs/date-picker.tsx` | 187 |
| `frontend/components/inputs/phone-input.tsx` | 174 |
| `frontend/components/layout/panel-layout.tsx` | 368 |
| `frontend/components/loading/skeleton.tsx` | 19 |
| `frontend/components/navbar/navbar.tsx` | 196 |
| `frontend/components/pagination/pagination.tsx` | 31 |
| `frontend/components/panel/date-range-filter.tsx` | 87 |
| `frontend/components/panel/panel-toolbar.tsx` | 183 |
| `frontend/components/panel/panel-ui.tsx` | 344 |
| `frontend/components/sidebar/admin-sidebar.tsx` | 49 |
| `frontend/components/tables/data-table.tsx` | 35 |
| `frontend/components/ui/badge.tsx` | 50 |
| `frontend/components/ui/button.tsx` | 40 |
| `frontend/components/ui/card.tsx` | 14 |
| `frontend/components/ui/confirm-dialog.tsx` | 86 |
| `frontend/components/ui/input.tsx` | 16 |
| `frontend/components/ui/select.tsx` | 19 |
| `frontend/components/ui/textarea.tsx` | 16 |
| `frontend/config/app.config.ts` | 38 |
| `frontend/config/auth.config.ts` | 32 |
| `frontend/config/payment.config.ts` | 95 |
| `frontend/constants/api.ts` | 5 |
| `frontend/constants/roles.ts` | 12 |
| `frontend/constants/routes.ts` | 46 |
| `frontend/features/authentication/components/change-password-form.tsx` | 124 |
| `frontend/features/authentication/components/forgot-password-form.tsx` | 90 |
| `frontend/features/authentication/components/login-form.tsx` | 247 |
| `frontend/features/authentication/components/register-form.tsx` | 263 |
| `frontend/features/authentication/components/reset-password-form.tsx` | 147 |
| `frontend/features/authentication/schemas/auth.schema.ts` | 137 |
| `frontend/features/booking/components/booking-form.tsx` | 319 |
| `frontend/features/booking/components/my-bookings-list.tsx` | 239 |
| `frontend/features/booking/schemas/booking.schema.ts` | 98 |
| `frontend/features/cms/components/articles-admin.tsx` | 129 |
| `frontend/features/cms/schemas/article.schema.ts` | 9 |
| `frontend/features/destination-info/components/destination-info-admin.tsx` | 246 |
| `frontend/features/destination-info/schemas/destination-info.schema.ts` | 14 |
| `frontend/features/destination/components/home-packages.tsx` | 23 |
| `frontend/features/destination/components/package-card.tsx` | 33 |
| `frontend/features/destination/components/packages-admin.tsx` | 158 |
| `frontend/features/destination/components/packages-list.tsx` | 25 |
| `frontend/features/destination/schemas/package.schema.ts` | 35 |
| `frontend/features/facility/components/facility-admin.tsx` | 278 |
| `frontend/features/facility/schemas/facility.schema.ts` | 16 |
| `frontend/features/faq/components/faq-admin.tsx` | 216 |
| `frontend/features/faq/schemas/faq.schema.ts` | 12 |
| `frontend/features/gallery/components/gallery-admin.tsx` | 199 |
| `frontend/features/gallery/schemas/gallery.schema.ts` | 16 |
| `frontend/features/public/components/booking-order-form.tsx` | 402 |
| `frontend/features/public/components/faq-accordion.tsx` | 39 |
| `frontend/features/public/components/payment-panel.tsx` | 368 |
| `frontend/features/visitor-rule/components/visitor-rule-admin.tsx` | 245 |
| `frontend/features/visitor-rule/schemas/visitor-rule.schema.ts` | 13 |
| `frontend/hooks/use-admin-users.ts` | 19 |
| `frontend/hooks/use-analytics.ts` | 18 |
| `frontend/hooks/use-articles.ts` | 43 |
| `frontend/hooks/use-audit.ts` | 22 |
| `frontend/hooks/use-auth.ts` | 106 |
| `frontend/hooks/use-destination-info.ts` | 65 |
| `frontend/hooks/use-destinations.ts` | 43 |
| `frontend/hooks/use-facility.ts` | 49 |
| `frontend/hooks/use-faq.ts` | 49 |
| `frontend/hooks/use-gallery.ts` | 39 |
| `frontend/hooks/use-route-guard.ts` | 31 |
| `frontend/hooks/use-visitor-rule.ts` | 49 |
| `frontend/lib/api.ts` | 17 |
| `frontend/lib/api/client.ts` | 202 |
| `frontend/lib/business.ts` | 137 |
| `frontend/lib/content.ts` | 44 |
| `frontend/lib/currency.ts` | 12 |
| `frontend/lib/date.ts` | 14 |
| `frontend/lib/eticket-pdf.ts` | 100 |
| `frontend/lib/jwt.ts` | 15 |
| `frontend/lib/permission.ts` | 11 |
| `frontend/lib/redirect.ts` | 23 |
| `frontend/lib/report-export.ts` | 137 |
| `frontend/lib/role-home.ts` | 8 |
| `frontend/lib/utils.ts` | 6 |
| `frontend/middleware.ts` | 52 |
| `frontend/next-env.d.ts` | 5 |
| `frontend/next.config.ts` | 48 |
| `frontend/package.json` | 46 |
| `frontend/postcss.config.js` | 6 |
| `frontend/providers/auth-provider.tsx` | 39 |
| `frontend/providers/query-provider.tsx` | 16 |
| `frontend/providers/session-provider.tsx` | 11 |
| `frontend/providers/theme-provider.tsx` | 14 |
| `frontend/providers/toast-provider.tsx` | 7 |
| `frontend/scripts/dev.mjs` | 87 |
| `frontend/scripts/generate-cert.mjs` | 98 |
| `frontend/services/analytics.api.service.ts` | 45 |
| `frontend/services/api/index.ts` | 15 |
| `frontend/services/article.service.ts` | 56 |
| `frontend/services/audit.api.service.ts` | 75 |
| `frontend/services/auth.api.service.ts` | 197 |
| `frontend/services/booking.api.service.ts` | 122 |
| `frontend/services/destination-info.service.ts` | 54 |
| `frontend/services/destination.service.ts` | 46 |
| `frontend/services/eticket.api.service.ts` | 40 |
| `frontend/services/facility.service.ts` | 46 |
| `frontend/services/faq.service.ts` | 46 |
| `frontend/services/gallery.service.ts` | 48 |
| `frontend/services/payment.api.service.ts` | 72 |
| `frontend/services/scanner.api.service.ts` | 77 |
| `frontend/services/staff.api.service.ts` | 36 |
| `frontend/services/ticket.api.service.ts` | 85 |
| `frontend/services/upload.service.ts` | 19 |
| `frontend/services/visitor-rule.service.ts` | 46 |
| `frontend/services/visitor.api.service.ts` | 30 |
| `frontend/store/auth.store.ts` | 59 |
| `frontend/store/booking.store.ts` | 30 |
| `frontend/store/language.store.ts` | 18 |
| `frontend/store/theme.store.ts` | 17 |
| `frontend/store/wishlist.store.ts` | 25 |
| `frontend/styles/globals.css` | 101 |
| `frontend/tailwind.config.ts` | 80 |
| `frontend/tsconfig.json` | 43 |
| `frontend/types/api.ts` | 342 |
| `frontend/types/article.ts` | 18 |
| `frontend/types/auth.ts` | 27 |
| `frontend/types/booking.ts` | 26 |
| `frontend/types/destination-info.ts` | 29 |
| `frontend/types/destination.ts` | 23 |
| `frontend/types/domain.ts` | 175 |
| `frontend/types/facility.ts` | 31 |
| `frontend/types/faq.ts` | 33 |
| `frontend/types/gallery.ts` | 15 |
| `frontend/types/visitor-rule.ts` | 37 |

**(2)** Berkas yang sengaja tidak didaftar: `frontend/package-lock.json` dan `frontend/tsconfig.tsbuildinfo` (artefak generated), `backend/data/*.db*` (data runtime), `frontend/certs/*` (sertifikat lokal), `frontend/public/images/*` (aset biner; dibahas di 9.27.9), serta `frontend/node_modules` dan `frontend/.next`.

**(3)** Dengan indeks ini, klaim "tidak ada berkas yang terlewat" dapat diverifikasi: bandingkan jumlah baris indeks dengan `git ls-files`/`find` pada repo. Jika ada berkas baru, tambahkan pembahasan dan perbarui tabel ini.

## 9.30 Penutup dokumen

**(1)** `CODEBASE.md` kini berisi 9 bagian: arsitektur backend (1–3), frontend tingkat tinggi (4–5), database/Docker/root (6), alur transaksi baris-per-baris (7), seluruh domain backend (8), dan seluruh frontend termasuk config, constants, styles, scripts, serta indeks 410 berkas (9).

**(2)** Angka akhir: 8.143+ baris dokumen, 586 subbagian `###`, 19 domain backend, 202 berkas TS/TSX frontend, dan 410 berkas sumber/konfigurasi terindeks. Tidak ada berkas aplikasi yang tidak disebut; kedalaman tiap berkas dilaporkan di 8.62 (backend) dan 9.26.1 (frontend).

**(3)** Temuan yang paling layak ditindaklanjuti ada di 9.26.2: (a) respons scanner yang salah dibaca sehingga semua scan tampil INVALID, (b) `formatCurrency` membagi harga tiket dengan 100, (c) biaya layanan pratinjau (flat Rp 2.500) berbeda dari backend (2%). Ketiganya bug perilaku, bukan kosmetik.

**(4)** Catatan pemeliharaan: setiap kali endpoint, DTO, status, atau peran berubah, perbarui bagian terkait **dan** indeks 9.29. Dokumen ini adalah dokumentasi hidup, bukan hasil sekali jalan; angka baris pada indeks akan usang lebih cepat daripada penjelasannya.
## 9.31 `components/navbar/navbar.tsx` — baris per baris

```tsx
function roleHomeFor(role: string): string {
  return ROLE_HOME[role as keyof typeof ROLE_HOME] ?? "/dashboard";
}
```

**(1)** `ROLE_HOME` memetakan `PENGUNJUNG → /dashboard`, `ADMIN → /admin/dashboard`, dan seterusnya. Cast `as keyof typeof` hanya untuk TypeScript; saat runtime peran tak dikenal menghasilkan `undefined`, lalu fallback `/dashboard`.

**(2)** Fallback ke `/dashboard` untuk peran tak dikenal berarti `super_admin` (yang tidak ada di `APP_ROLES`/`ROLE_HOME`) diarahkan ke panel pengunjung — bukan ke `/unauthorized`. Ini melanjutkan inkonsistensi peran yang dibahas di 9.27.2.

```tsx
const initial = user.name.trim().charAt(0).toUpperCase() || "?";
```

**(1)** Nama kosong menghasilkan `"?"`, sehingga avatar tidak pernah kosong. `trim()` mencegah spasi menjadi inisial.

**(2)** Karakter pertama bisa berupa emoji/aksara non-Latin; `charAt(0)` memotong setengah pasangan surrogate untuk emoji, menghasilkan karakter rusak. Untuk nama Indonesia normal tidak masalah.

```tsx
<button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Buka menu akun" ...>
```

**(1)** `aria-haspopup="menu"` dan `aria-expanded` sudah benar. Namun menu yang muncul **tidak** menangani `Escape`, tidak memindahkan fokus ke item pertama, dan tidak menjebak fokus. Pengguna keyboard harus menekan Tab melewati halaman di belakang overlay untuk mencapai item.

**(2)** Item memakai `role="menuitem"` tetapi tidak ada `tabIndex={-1}`/navigasi panah. Pola ARIA menu mensyaratkan panah atas/bawah; yang diterapkan di sini lebih dekat ke dropdown biasa. Pembaca layar tetap bisa membacanya, tetapi pengalaman keyboard tidak sesuai janji `role`.

```tsx
<button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
```

**(1)** Overlay transparan menutup menu saat klik di luar. `aria-hidden` + `tabIndex={-1}` mencegahnya masuk urutan tab — praktik yang benar untuk scrim dekoratif.

**(2)** Karena overlay berada di `z-40` dan menu `z-50`, klik pada menu tidak ditangkap overlay. Namun overlay juga menutupi tombol pemicu, jadi klik kedua pada avatar akan menutup lewat overlay, bukan tombol.

```tsx
{user.role === "PENGUNJUNG" && (<Link href={ROUTES.DASHBOARD_PROFILE} ...>Profil</Link>)}
```

**(1)** Tautan "Profil" hanya untuk pengunjung. Staf tidak punya tautan profil di navbar; mereka harus lewat panel masing-masing (`settings` hanya ganti password, bukan profil).

**(2)** Perbandingan peran **case-sensitive**. Backend mengirim `PENGUNJUNG` huruf besar, jadi cocok; peran lain (mis. `pengunjung` dari data lama) tidak akan melihat tautan ini.

```tsx
onClick={() => { setOpen(false); logout(); }}
```

**(1)** `logout()` tidak di-`await`; menu langsung tertutup dan `useLogout` mengarahkan ke `/login` setelah request selesai. Tidak ada toast di sini (berbeda dari `PanelLayout.signOut` yang menampilkan toast sebelum selesai).

```tsx
const NAV_LINKS = [
  { href: ROUTES.HOME, label: "Beranda" },
  { href: ROUTES.PACKAGES, label: "Pilih Tiket" },
  { href: "/about", label: "Tentang" },
  { href: "/facilities", label: "Fasilitas" },
  { href: "/faq", label: "FAQ" },
  { href: ROUTES.GALLERY, label: "Galeri" },
];
```

**(1)** Dua gaya penulisan path: konstanta `ROUTES.*` dan string literal (`/about`, `/facilities`, `/faq`). `ROUTES` sebenarnya sudah punya `ABOUT` dan `FAQ`; hanya `facilities` yang tidak ada. Ini membuat `constants/routes.ts` bukan sumber tunggal (9.27.4).

**(2)** Menu tidak memuat Artikel, Aturan Kunjungan, atau Kontak meski halamannya ada. Halaman itu hanya dapat diakses lewat tautan di footer/beranda atau URL langsung.

```tsx
<div className="hidden items-center gap-7 md:flex">
  {NAV_LINKS.map((link) => (<Link key={link.href} href={link.href} className="text-sm ...">{link.label}</Link>))}
</div>
```

**(1)** Tidak ada penanda halaman aktif (`usePathname` tidak dipakai). Pengunjung tidak bisa melihat di menu mana mereka berada; berbeda dari panel yang menghitung `isActive`.

**(2)** Breakpoint `md` (768px) memisahkan menu desktop dan seluler. Antara 768–900px dengan enam tautan + tombol auth, ruang bisa sempit; tidak ada truncation, sehingga tautan bisa terdesak.

```tsx
<div className="flex items-center gap-3 md:hidden">
  {user && <AvatarMenu />}
  <button onClick={() => setOpen(!open)} aria-label="Buka menu">
```

**(1)** Di seluler, pengguna login melihat avatar **dan** tombol burger. Menu avatar sudah memuat Dasbor/Profil/Logout, sementara menu burger memuat tautan navigasi + Logout lagi. Ada dua jalan logout dan tidak ada pembeda peran yang jelas.

**(2)** `aria-label` selalu "Buka menu" meski saat terbuka ikon berubah menjadi X. Pembaca layar tidak diberi tahu bahwa tombol kini menutup. Seharusnya label dinamis dan `aria-expanded`.

**(3)** Menu seluler tidak menutup saat klik di luar atau `Escape`; hanya tautan/Logout yang menutup. Ini berbeda dari `AvatarMenu` yang punya overlay.

**(4)** Tombol burger tidak memiliki `aria-controls` ke panel menu, sehingga hubungan tombol–panel tidak eksplisit secara aksesibilitas.

```tsx
<div className={cn("border-t border-[#d7e3ed] bg-white md:hidden", open ? "block" : "hidden")}>
```

**(1)** Panel menu tetap ada di DOM saat tertutup (`hidden`), bukan di-unmount. Untuk enam tautan ini tidak masalah; fokus keyboard tidak bisa masuk karena `display:none`.

**(2)** `bg-white/90 backdrop-blur` pada header membuat konten di belakang terlihat samar; panel menu memakai `bg-white` solid agar teks tetap terbaca.

## 9.32 `components/inputs/date-picker.tsx` — baris per baris

```tsx
const selected = value ? parseISO(value) : null;
const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selected ?? new Date()));
```

**(1)** `parseISO` dipanggil pada **setiap render**, bukan di-memo. Untuk satu input ini murah; jika komponen dirender sering (form besar), ini pekerjaan berulang tanpa manfaat.

**(2)** `viewMonth` diinisialisasi sekali dari nilai awal. Jika `value` berubah dari luar (mis. reset form), bulan yang ditampilkan **tidak** ikut berubah sampai kalender dibuka kembali — `openCalendar()` yang menyinkronkan.

**(3)** `parseISO("")` tidak dipanggil karena dijaga `value ?`; nilai tidak valid (mis. `"abc"`) menghasilkan `Invalid Date`, dan `startOfMonth` mengembalikan `Invalid Date`. `format` kemudian melempar `RangeError` saat merender tombol. Tidak ada validasi bentuk di sini; pemanggil harus mengirim ISO.

```tsx
const minDate = min ? startOfDay(parseISO(min)) : null;
const maxDate = max ? startOfDay(parseISO(max)) : null;
```

**(1)** `startOfDay` menormalkan jam ke 00:00 agar perbandingan tanggal tidak terpengaruh waktu. Ini penting karena `parseISO("2026-11-12")` sudah tengah malam, tetapi nilai dengan jam bisa datang dari pemanggil lain.

**(2)** `min`/`max` dihitung ulang setiap render; dua objek `Date` baru setiap kali. `useMemo` tidak dipakai, tetapi biayanya kecil.

```tsx
useEffect(() => {
  if (!open) return;
  function onPointerDown(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); }
  function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
  document.addEventListener("mousedown", onPointerDown);
  document.addEventListener("keydown", onKeyDown);
  return () => { document.removeEventListener("mousedown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
}, [open]);
```

**(1)** Listener hanya dipasang saat terbuka, dan dibersihkan saat menutup/unmount. Ini menghindari listener global permanen.

**(2)** Hanya `mousedown`, bukan `touchstart`. Pada perangkat sentuh, `mousedown` biasanya tetap dipancarkan setelah tap, tetapi beberapa browser/penanganan gesture bisa melewatkannya; `PhoneInput` menambahkan `touchstart`, di sini tidak. Akibatnya di sebagian perangkat, tap di luar kalender tidak menutupnya.

**(3)** `Escape` menutup tanpa mengembalikan fokus ke tombol pemicu. Fokus tetap di elemen yang mungkin sudah tidak ada (jika fokus ada di dalam dialog), sehingga pengguna keyboard kehilangan posisi.

```tsx
function openCalendar() {
  setViewMonth(startOfMonth(selected ?? new Date()));
  setOpen((v) => !v);
}
```

**(1)** Setiap klik tombol menyetel ulang bulan ke bulan nilai terpilih, lalu membalik status. Jika pengguna sedang menjelajah bulan lain lalu menutup dan membuka lagi, tampilan kembali ke bulan semula — bisa terasa "lompat".

**(2)** Memanggil `setOpen((v) => !v)` setelah `setViewMonth` berarti saat menutup, `viewMonth` juga direset (tidak terlihat karena tertutup).

```tsx
const days = useMemo(() => {
  const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}, [viewMonth]);
```

**(1)** `weekStartsOn: 1` membuat minggu dimulai Senin, cocok dengan `WEEKDAYS = ["Sen", ..., "Min"]`. Jika salah satu diubah tanpa yang lain, label hari akan bergeser dari kolomnya.

**(2)** Rentang selalu 5–6 baris (35–42 hari) termasuk hari dari bulan tetangga. Hari tetangga tetap dirender dan **bisa dipilih**; setelah dipilih, kalender menutup dan nilainya bulan lain. Perilaku ini valid, tetapi tidak diberi penanda "bulan lain" selain warna teks lebih terang.

```tsx
const canPrev = !minDate || isAfter(startOfMonth(viewMonth), startOfMonth(minDate));
const canNext = !maxDate || isBefore(startOfMonth(viewMonth), startOfMonth(maxDate));
```

**(1)** Navigasi bulan dibatasi pada bulan `min`/`max`, bukan tanggal. Jika `min` tanggal 20 di bulan ini, pengguna masih bisa membuka bulan ini dan melihat tanggal 1–19 dicoret.

**(2)** `isAfter`/`isBefore` dengan `Invalid Date` mengembalikan `false`, sehingga `canPrev`/`canNext` menjadi `true` dan navigasi tetap terbuka saat `min`/`max` tidak valid.

```tsx
function isDisabled(d: Date) {
  const day = startOfDay(d);
  if (minDate && isBefore(day, minDate)) return true;
  if (maxDate && isAfter(day, maxDate)) return true;
  return false;
}
```

**(1)** Hanya `min`/`max` yang dipertimbangkan. Tidak ada penonaktifan hari Minggu/libur nasional, meski backend mungkin menolak tanggal tertentu; pengguna baru tahu setelah submit.

**(2)** `startOfDay` mencegah tanggal `max` (yang mungkin berjam) dianggap lewat pada hari yang sama.

```tsx
<button type="button" id={id} onClick={openCalendar} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} {...aria} className={cn(..., aria["aria-invalid"] ? "border-[#c53030]" : "", className)}>
```

**(1)** Seluruh kontrol adalah `<button>`, bukan `<input>`. Konsekuensinya: tidak ada input manual, tidak ada `autocomplete`, dan formulir tidak mengirim nilai tanggal secara native — nilai hanya ada di state pemanggil lewat `onChange`. Ini disengaja (kalender kustom).

**(2)** `{...aria}` menyebarkan `aria-invalid`/`aria-describedby` ke tombol. `aria-invalid` pada tombol tidak standar (atribut ini untuk input), tetapi tidak berbahaya; pembaca layar mungkin mengabaikannya.

**(3)** `className` digabung paling akhir lewat `cn`, sehingga pemanggil bisa menimpa lebar/tinggi. Warna border error ditentukan sebelum `className`, jadi `className` yang berisi `border-*` akan menang.

```tsx
<span className={cn("truncate", selected ? "font-medium text-[#17324d]" : "text-[#94A3B8]")}>
  {selected ? format(selected, "d MMMM yyyy", { locale: localeId }) : placeholder}
</span>
```

**(1)** Format tampilan `12 November 2026` (locale Indonesia), sedangkan nilai yang dikirim `yyyy-MM-dd`. Pemisahan format tampil vs nilai ini benar dan konsisten dengan backend yang menerima ISO.

**(2)** `format` pada `Invalid Date` melempar; tidak ada `try/catch` di sini (bandingkan `lib/date.ts` yang menangkap). Satu nilai rusak menjatuhkan seluruh form.

```tsx
<div role="dialog" aria-label="Pilih tanggal" className="absolute left-0 z-30 mt-2 w-[304px] ...">
```

**(1)** `role="dialog"` tanpa `aria-modal` dan tanpa manajemen fokus. Dialog non-modal memang boleh, tetapi fokus tidak dipindahkan ke dalam kalender saat dibuka, sehingga pengguna keyboard harus Tab dari tombol.

**(2)** Posisi `absolute left-0` dan lebar tetap 304px. Di kontainer sempit (mis. kolom form 280px di ponsel), kalender bisa keluar dari viewport kanan karena tidak ada flip/`right-0`. Tidak diportal, jadi `overflow-hidden` pada induk juga bisa memotongnya.

**(3)** `z-30` lebih rendah dari navbar (`z-40`); kalender di dekat header bisa tertutup navbar sticky. Di dalam panel, sidebar `z` lain lagi.

```tsx
<button key={d.toISOString()} type="button" disabled={isDisabled(d)} onClick={() => { onChange(format(d, "yyyy-MM-dd")); setOpen(false); }} aria-current={isSelected ? "date" : undefined} ...>
```

**(1)** `key` memakai ISO lengkap, unik per hari. `aria-current="date"` menandai tanggal terpilih — nilai yang tepat untuk kalender (bukan `aria-selected`).

**(2)** Klik pada hari yang dinonaktifkan tidak mungkin karena `disabled`; tidak perlu pengecekan ulang di handler.

**(3)** Setelah memilih, kalender menutup tetapi fokus tidak dikembalikan ke tombol pemicu. Pengguna keyboard harus menemukan tombol lagi lewat Tab dari awal dokumen.

**(4)** `isToday` memakai `new Date()` per hari (42 kali per render). Kecil, tetapi bisa dibuat sekali di luar loop.

## 9.33 `components/inputs/phone-input.tsx` — baris per baris

```tsx
export const COUNTRY_CODES: CountryCodeOption[] = [
  { code: "+62", label: "Indonesia" }, ... { code: "+1", label: "Amerika Serikat" },
];
```

**(1)** Daftar 13 negara hardcoded, tidak mencakup semua negara. Untuk wisatawan dari negara lain, tidak ada pilihan kode; mereka bisa menulis nomor lengkap di kolom nomor, tetapi `validatePhoneByCode` akan menolak karena kode tidak dikenal/format lokal tidak cocok.

**(2)** `+1` dipakai untuk Amerika Serikat saja (bukan Kanada/Karibia). Tidak ada bendera/emoji, hanya kode dan nama — pilihan yang aman secara aksesibilitas.

```tsx
const onPointerDown = (e: MouseEvent | TouchEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
document.addEventListener("mousedown", onPointerDown);
document.addEventListener("touchstart", onPointerDown);
```

**(1)** Berbeda dari `DatePicker`, listener menyertakan `touchstart`, sehingga tap di luar menutup dropdown di perangkat sentuh. Ini lebih benar.

**(2)** Kedua event bisa terpicu untuk satu interaksi (touch lalu mouse emulation); handler hanya menutup, jadi idempoten.

```tsx
<button type="button" onClick={() => setOpen((v) => !v)} disabled={disabled} aria-label={`Kode negara ${code}`} aria-haspopup="listbox" aria-expanded={open} className="flex h-10 w-[4.25rem] ...">
```

**(1)** Lebar tetap `4.25rem` (68px) cukup untuk `+673`, tetapi tidak untuk kode 4 digit (mis. `+1242`). Daftar saat ini maksimal 3 digit, jadi aman.

**(2)** `aria-label` menyebut kode, bukan negara. Pengguna pembaca layar mendengar "Kode negara +62" tanpa tahu itu Indonesia sampai membuka daftar. Bisa ditingkatkan dengan label negara.

**(3)** Tombol kiri dan input kanan disatukan dengan `rounded-l-md`/`rounded-r-md` dan `border-r-0`. Jika `className` pemanggil mengubah border, sambungan bisa terlihat rangkap.

```tsx
<span role="listbox" className="absolute left-0 top-11 z-40 flex max-h-64 w-56 flex-col overflow-y-auto ...">
  {COUNTRY_CODES.map((c) => (
    <button type="button" role="option" aria-selected={c.code === code} onClick={() => { onCodeChange(c.code); setOpen(false); }} ...>
```

**(1)** `role="listbox"` berisi `<button role="option">`. Secara praktik bekerja, tetapi pola ARIA yang benar adalah `div role="option"` dengan `aria-activedescendant` pada listbox, atau `<select>` native. Tidak ada navigasi panah/Home/End, jadi pengguna keyboard harus Tab melewati 13 opsi.

**(2)** `aria-selected` menandai pilihan aktif; tidak ada `aria-label` pada listbox itu sendiri (mis. "Pilih kode negara"), sehingga konteksnya hilang saat fokus masuk.

**(3)** Daftar bisa lebih tinggi dari layar kecil (`max-h-64` = 256px); `overflow-y-auto` menangani. Posisi `left-0 top-11` bisa terpotong jika input berada di ujung kanan viewport, karena lebar 224px membentang ke kanan.

```tsx
<input id={id} type="tel" inputMode="tel" value={number} onChange={(e) => onNumberChange(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-l-none rounded-r-md ..." {...aria} />
```

**(1)** `type="tel"` + `inputMode="tel"` memunculkan keyboard angka di ponsel. Tidak ada `autoComplete="tel"`, sehingga autofill nomor telepon tidak bekerja.

**(2)** Nilai tidak disaring; huruf dan simbol bisa masuk. Penyaringan diserahkan ke `validatePhoneByCode` saat submit/real-time. Ini pilihan yang baik untuk internasional, tetapi berarti pengguna bisa mengetik `abc` dan baru diberi tahu setelahnya.

**(3)** `disabled` diteruskan ke tombol kode dan input, tetapi tidak ke tombol opsi di dalam dropdown (dropdown tidak bisa dibuka saat disabled, jadi aman).

```tsx
export function parsePhone(value: string): { code: string; number: string } {
  const cleaned = (value ?? "").replace(/[\s-]/g, "");
  if (cleaned.startsWith("+")) {
    const match = [...COUNTRY_CODES].filter((c) => cleaned.startsWith(c.code)).sort((a, b) => b.code.length - a.code.length)[0];
    if (match) return { code: match.code, number: cleaned.slice(match.code.length) };
    return { code: "", number: cleaned };
  }
  return { code: "+62", number: cleaned };
}
```

**(1)** Prefiks terpanjang dicocokkan lebih dulu (`+673` sebelum `+6`), mencegah Malaysia (`+60`) menelan Brunei (`+673`). Pengurutan dilakukan setiap panggilan pada 13 item — murah.

**(2)** Nomor tanpa `+` selalu dianggap Indonesia, termasuk `0812...` yang tetap disimpan dengan `0`. `composePhone("+62", "0812...")` mengembalikan apa adanya, sehingga round-trip profil → form → simpan tidak mengubah nomor.

**(3)** Nomor dengan kode tak dikenal (mis. `+31...`) mengembalikan `code: ""` dan seluruh nomor sebagai `number`. `composePhone("", ...)` mengembalikan nomor apa adanya; validasi `code === ""` memakai aturan Indonesia, sehingga nomor Belanda akan ditolak.

```tsx
export function composePhone(code: string, number: string): string {
  const cleaned = number.replace(/[\s-]/g, "");
  if (code === "+62" || code === "") return cleaned;
  return `${code}${cleaned.replace(/^0+/, "")}`;
}
```

**(1)** Untuk Indonesia, nomor dikembalikan **tanpa** `+62` (mis. `0812...` atau `812...`), dengan komentar bahwa backend menormalkan ke `08...`. Ini berarti format tersimpan ditentukan backend, bukan form.

**(2)** Untuk negara lain, nol di depan dibuang sebelum digabung, sehingga `0123456789` + `+60` menjadi `+60123456789`. Jika nomor lokal memang diawali nol yang bermakna, ini menghilangkannya.

**(3)** Tidak ada validasi bahwa `number` tidak kosong; form yang mengirim kosong akan diterima fungsi ini dan backend yang menolak (kecuali telepon opsional, seperti register).

```tsx
export function validatePhoneByCode(code: string, number: string): string | null {
  const cleaned = number.replace(/[\s-]/g, "");
  if (code === "+62" || code === "") {
    return /^(\+62|62|0)?8[1-9][0-9]{7,10}$/.test(cleaned) ? null : "Nomor HP Indonesia tidak valid (contoh: 081234567890)";
  }
  return /^[1-9][0-9]{6,11}$/.test(cleaned) ? null : `Nomor ${code} tidak valid (contoh: 3123456789)`;
}
```

**(1)** Regex Indonesia menerima `+62`, `62`, `0`, atau tanpa prefiks, lalu `8` dan digit kedua 1–9 (bukan 0), total 9–13 digit. Nomor seperti `0800...` (bukan seluler) ditolak — sesuai label "Nomor HP".

**(2)** Untuk negara lain, 7–12 digit tanpa nol depan. Aturan ini terlalu ketat untuk beberapa negara (nomor lokal bisa diawali 0 atau lebih pendek), tetapi cukup untuk daftar 12 negara non-Indonesia yang tersedia.

**(3)** Fungsi mengembalikan **string pesan atau null**, bukan boolean. Pemanggil harus ingat bahwa `null` = valid; mudah terbalik saat menulis `if (validatePhoneByCode(...))`. Pola ini dipakai konsisten di `booking-order-form` dan `register-form`.

**(4)** Tidak ada pengecekan kode negara valid di sini; `code="+999"` akan memakai aturan non-Indonesia dan bisa lolos jika 7–12 digit. Daftar kode tetap dibatasi oleh dropdown, kecuali state dimanipulasi.

## 9.34 Formulir autentikasi lain — baris per baris

### 9.34.1 `register-form.tsx` (262 baris)

```tsx
const handleNameChange = (e) => {
  const value = sanitizeInput(e.target.value);
  set("name", value);
  if (value && value.length < 3) { ... }
  else if (value.length > 100) { ... }
  else if (/[<>]/.test(value)) { ... }
```

**(1)** `sanitizeInput` dijalankan **sebelum** pengecekan `/[<>]/`. Jika sanitizer membuang `<`/`>`, cabang itu tidak pernah tercapai — dead code. Jika sanitizer hanya trim, cabang itu berfungsi. Perilaku bergantung pada implementasi skema, yang tidak terlihat di file ini.

**(2)** Nama kosong tidak menghasilkan error saat mengetik (`value &&`), tetapi `registerSchema` tetap mewajibkan minimal 3 karakter saat submit. Pengguna yang mengosongkan nama baru melihat error setelah menekan Daftar.

**(3)** Validasi panjang berjalan pada setiap ketikan; `setErrors` membuat objek baru setiap kali, memicu render ulang seluruh form. Untuk form 5 field ini masih ringan.

```tsx
const setPhoneField = (value: string) => {
  set("phone", value);
  const msg = value ? validatePhoneByCode(phoneCode, value) : null;
  ...
};
```

**(1)** Nomor telepon **opsional** (label "opsional"), jadi kosong tidak menghasilkan error. Namun jika diisi, format harus lolos regex Indonesia/negara terpilih.

**(2)** Saat kode negara berubah, validasi dijalankan ulang terhadap nomor yang sudah ada; pesan error bisa muncul/hilang tanpa pengguna menyentuh kolom nomor. Ini UX yang baik.

```tsx
if (value && !/[A-Z]/.test(value)) { setErrors(... "Password harus mengandung huruf besar"); }
else if (value && !/[a-z]/.test(value)) { ... }
else if (value && !/[0-9]/.test(value)) { ... }
```

**(1)** Aturan kompleksitas dicek berurutan; hanya **satu** pesan ditampilkan pada satu waktu. Pengguna yang menambahkan huruf besar lalu melihat pesan "harus ada huruf kecil" bisa merasa aturannya berubah-ubah.

**(2)** Aturan ini hanya di klien. Login tidak memeriksa kompleksitas, dan backend memvalidasi sendiri; jika aturan backend berbeda (mis. hanya panjang 8), UI bisa menolak password yang sebenarnya diterima API.

**(3)** Batas 72 karakter mengisyaratkan bcrypt (yang memotong setelah 72 byte). Untuk karakter multi-byte, 72 karakter bisa melebihi 72 byte; backend tetap yang menentukan.

```tsx
if (value && value !== values.password) { setErrors(... "Konfirmasi password tidak cocok"); }
```

**(1)** Konfirmasi hanya divalidasi saat kolom konfirmasi berubah. Jika pengguna mengubah **password** setelah konfirmasi cocok, error konfirmasi tidak muncul kembali sampai submit. `registerSchema` (biasanya dengan `refine`) menangkapnya di akhir, tetapi umpan balik real-time hilang.

**(2)** `values.password` dibaca dari closure render saat event; karena `set` sudah memperbarui state, nilainya adalah password terbaru pada render itu. Tetap ada satu render delay pada skenario ketik cepat.

```tsx
const parsed = registerSchema.safeParse(sanitizedData);
if (!parsed.success) {
  const fieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof RegisterFormValues;
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  setErrors(fieldErrors);
  return;
}
```

**(1)** Hanya error **pertama** per field yang disimpan (`!fieldErrors[key]`). Jika satu field melanggar dua aturan, pengguna hanya melihat satu; setelah diperbaiki, muncul yang berikutnya.

**(2)** `issue.path[0]` untuk error `refine` tingkat objek bisa `undefined` (mis. "password tidak cocok" yang dipasang di root). Dalam kasus itu error tidak ditampilkan sama sekali karena `if (key ...)` gagal — form tampak tidak merespons. Ini risiko nyata tergantung definisi `registerSchema`.

**(3)** `registerSchema` memakai `confirmPassword` di input, tetapi `register()` hanya mengirim `name/email/phone/password`. Konfirmasi murni validasi klien.

```tsx
<label className={label}>Nama Lengkap</label>
<Input value={values.name} onChange={handleNameChange} autoComplete="name" aria-invalid={...} aria-describedby={...} />
```

**(1)** `<label>` tidak punya `htmlFor` dan `Input` tidak punya `id`. Mengklik label tidak memfokuskan input, dan pembaca layar tidak mengasosiasikan label dengan kontrol. Ini masalah aksesibilitas yang berulang di keempat field.

**(2)** `aria-describedby` menunjuk `name-error` yang hanya ada saat error — benar, karena ID yang tidak ada diabaikan.

**(3)** `Input` adalah komponen proyek (`components/ui/input`), sedangkan `reset-password-form` memakai `<input>` native dengan kelas manual. Dua gaya form hidup berdampingan; `register` lebih konsisten dengan design system.

### 9.34.2 `reset-password-form.tsx` (146 baris)

```tsx
useEffect(() => {
  const t = new URLSearchParams(window.location.search).get("token");
  setToken(t);
  if (t) setValues((v) => ({ ...v, token: t }));
  setTokenChecked(true);
}, []);
```

**(1)** Token dibaca di klien, bukan dari props server. Halaman bisa dirender statis; token baru ada setelah mount. Karena itu ada state `tokenChecked` untuk menampilkan "Memeriksa link reset..." sebelum memutuskan.

**(2)** Token di URL bisa bocor lewat riwayat browser, log proxy, atau header `Referer` saat pengguna mengeklik tautan eksternal dari halaman ini. Praktik yang lebih aman: tukar token sekali di server lalu hapus dari URL (`history.replaceState`).

**(3)** Token **tidak divalidasi** lebih dulu; form tetap ditampilkan dan pengguna mengisi password, baru tahu token kedaluwarsa setelah submit. Validasi awal butuh endpoint tambahan yang tidak ada.

```tsx
if (!tokenChecked) return <p ...>Memeriksa link reset...</p>;
if (!token) return <p className="text-sm text-red-600">Link reset password tidak valid atau sudah kedaluwarsa.</p>;
```

**(1)** Pesan untuk token tidak ada menyiratkan kedaluwarsa, padahal bisa juga karena tautan dipotong/URL salah. Tidak ada tautan "minta ulang" di keadaan ini; pengguna harus kembali manual ke `/forgot-password`.

**(2)** Kedua cabang adalah early return **setelah** hook `useState`/`useEffect`; aturan hooks tetap terpenuhi karena tidak ada hook setelahnya.

```tsx
const parsed = resetPasswordSchema.safeParse(values);
...
await authService.resetPassword(parsed.data.token, parsed.data.password);
toast.success("Password berhasil direset, silakan masuk kembali");
router.push("/login");
```

**(1)** Skema memvalidasi `token`, `password`, dan `confirmPassword`; service hanya menerima token + password. Konfirmasi tidak dikirim.

**(2)** Setelah sukses, semua refresh token pengguna dicabut backend (8.16.6); pengguna diarahkan ke `/login`. Toast dipanggil sebelum navigasi, tetapi bisa hilang saat halaman berpindah — `sonner` global biasanya bertahan, jadi masih terlihat.

**(3)** `catch` memetakan `AuthError` ke pesan backend; error jaringan menjadi "Gagal mereset password." Form tetap terbuka agar pengguna bisa mencoba lagi.

```tsx
<input type="password" value={values.password} onChange={handlePasswordChange} className={`... ${errors.password ? "border-red-500" : "border-slate-300"}`} aria-invalid={...} />
```

**(1)** Tidak ada `autoComplete="new-password"`, sehingga password manager bisa mengisi password lama. Berbeda dari `register` yang menetapkannya.

**(2)** Tidak ada tombol show/hide password, padahal pengguna diminta mengetik password baru dua kali. Salah ketik yang sama di kedua kolom tetap lolos validasi kecocokan.

### 9.34.3 `change-password-form.tsx` (116 baris)

```tsx
const [values, setValues] = useState<Record<Field, string>>(EMPTY);
const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
```

**(1)** Field didefinisikan sebagai union `Field` dan `EMPTY`, lalu form dirender dengan `(Object.keys(EMPTY) as Field[]).map(...)`. Menambah field baru cukup di tiga tempat (union, `EMPTY`, `LABELS`), bukan menggandakan JSX — pola yang rapi.

**(2)** `EMPTY` adalah objek modul yang dipakai sebagai nilai awal. Karena `setValues` selalu membuat objek baru (`{...prev}`), objek `EMPTY` tidak termutasi; aman.

```tsx
function setField(field: Field, value: string) {
  setValues((prev) => ({ ...prev, [field]: value }));
  setErrors((prev) => { if (!prev[field]) return prev; const next = { ...prev }; delete next[field]; return next; });
  setFormError(null);
}
```

**(1)** Error field dihapus begitu pengguna mengetik, bukan divalidasi ulang real-time. Pengguna bisa menghapus error dengan mengetik satu karakter, lalu submit dan mendapat error yang sama. Ini mengurangi kebisingan, dengan trade-off umpan balik tertunda.

**(2)** `if (!prev[field]) return prev` menghindari objek baru saat tidak ada error — optimisasi kecil yang mencegah render tambahan.

```tsx
const result = await changePassword(values.currentPassword, values.newPassword);
setSubmitting(false);
if (!result.ok) { setFormError(result.error); return; }
setValues(EMPTY);
toast.success("Password berhasil diubah. Silakan masuk kembali.");
```

**(1)** `useChangePassword` sudah mengarahkan ke `/login` setelah sukses (9.4.1). Baris `setValues(EMPTY)` dan toast berjalan pada komponen yang mungkin sedang di-unmount; React 18 mengabaikan setState setelah unmount tanpa peringatan, tetapi toast global tetap tampil.

**(2)** Tidak ada `finally`; jika `changePassword` melempar (seharusnya tidak, karena hook menangkap), `submitting` tetap true dan tombol terkunci. Hook mengembalikan `{ok:false}` untuk error, jadi jalur ini normalnya aman.

**(3)** Form tidak mengirim `confirmPassword`; `changePasswordSchema` memvalidasi kecocokan di klien. Backend hanya menerima `current_password` dan `new_password`.

### 9.34.4 `forgot-password-form.tsx` (92 baris)

```tsx
const handleEmailChange = (e) => {
  const value = sanitizeEmail(e.target.value);
  setEmail(value);
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) setError("Format email tidak valid");
  else setError(null);
};
```

**(1)** Satu state `error` dipakai untuk error format maupun error request. Saat pengguna memperbaiki format, error request sebelumnya ikut terhapus — bisa menyembunyikan kegagalan server.

**(2)** Validasi real-time dan Zod saat submit menduplikasi aturan yang sama; pesan bisa berbeda ("Format email tidak valid" vs pesan skema).

```tsx
await authService.forgotPassword(parsed.data.email);
setSent(true);
```

**(1)** `sent` mengganti seluruh form dengan pesan netral "Kalau email kamu terdaftar...". Ini menerapkan anti-enumerasi dengan benar: pengguna tidak bisa membedakan email terdaftar dan tidak.

**(2)** Tidak ada tombol "kirim ulang"; pengguna yang salah ketik email harus memuat ulang halaman (`/forgot-password`) untuk kembali ke form.

**(3)** `catch` menampilkan pesan error dari backend. Jika backend membalas 429 (rate limit), pesannya diteruskan; jika jaringan putus, pesan generik. Form tetap tersedia untuk dicoba lagi.
## 9.35 Tiga komponen CMS tersisa — baris per baris

### 9.35.1 `faq-admin.tsx` (215 baris)

```tsx
import { Plus, Edit, Trash2, Eye, ArrowUp, ArrowDown } from "lucide-react";
```

**(1)** `Eye`, `ArrowUp`, dan `ArrowDown` **tidak dipakai** di file. Ketiganya sisa fitur pratinjau/urut-naik-turun yang tidak jadi diimplementasikan. TypeScript tidak mengeluh karena `noUnusedLocals` tidak diaktifkan; bundler akan menyingkirkannya, tetapi impor mati menyesatkan pembaca.

```tsx
const { data, isLoading, isError } = useFAQList({ limit: 50 });
const publishedFAQs = usePublishedFAQList();
...
const publishedCount = publishedFAQs.data?.filter(f => f.is_published).length ?? 0;
const totalCount = data?.length ?? 0;
```

**(1)** Dua query terpisah: daftar admin (50 item) dan daftar publik. `publishedFAQs` sudah hanya berisi yang terbit, sehingga `.filter(f => f.is_published)` redundan — sama seperti `facility-admin` (9.13.3).

**(2)** **Statistik bisa salah dan negatif.** `totalCount` dibatasi 50, sedangkan `publishedCount` berasal dari endpoint lain yang bisa memuat lebih dari 50. Jika ada 60 FAQ terbit, "Draft" = 50 − 60 = **−10**. Angka ini ditampilkan apa adanya.

**(3)** Tidak ada paginasi. FAQ ke-51 tidak muncul di tabel dan tidak bisa diedit/dihapus dari UI. Untuk CMS yang datanya terus bertambah, ini batas yang harus segera diperbaiki (atau gunakan paginasi server + `meta.total`).

```tsx
const { register, handleSubmit, reset, formState: { errors } } = useForm<FAQFormValues>({
  resolver: zodResolver(faqSchema),
  defaultValues: { category: "Umum", sort_order: 0, is_published: false },
});
```

**(1)** `defaultValues` tidak memuat `question`/`answer`, sehingga keduanya `undefined` sampai pengguna mengetik. Input menjadi uncontrolled lalu controlled; React hanya memperingatkan jika value berubah dari defined ke undefined, bukan sebaliknya, jadi aman.

**(2)** `sort_order` didaftarkan dengan `{ valueAsNumber: true }`. Jika pengguna mengosongkan input angka, RHF menghasilkan `NaN`; skema Zod harus menolaknya. Tanpa `valueAsNumber`, nilainya akan menjadi string dan backend menolak.

```tsx
function onSubmit(values: FAQFormValues) {
  if (editingId) {
    updateItem.mutate({ id: editingId, payload: values }, { onSuccess: ..., onError: ... });
  } else {
    createItem.mutate(values, { ... });
  }
}
```

**(1)** `values` dikirim **apa adanya**, termasuk `is_published`. Backend `Update` memakai `bool` non-pointer (8.22), jadi mengedit FAQ yang sudah terbit dan lupa mencentang "Publikasikan" akan **menurunkan** statusnya menjadi draft. Form selalu menampilkan checkbox sesuai data, sehingga aman selama pengguna tidak mengubahnya.

**(2)** Tidak ada `try/catch`; error ditangani `onError` milik React Query. Pesan error generik, alasan backend (mis. validasi panjang) tidak ditampilkan.

**(3)** `onSuccess` memanggil `reset()` **tanpa argumen**, yang mengembalikan ke `defaultValues` (kategori "Umum", urutan 0, tidak terbit) — bukan mengosongkan pertanyaan/jawaban secara eksplisit, tetapi karena keduanya tidak ada di default, nilainya menjadi kosong.

```tsx
function handleEdit(item: FAQ) {
  ...
  category: item.category as FAQFormValues["category"],
```

**(1)** Cast ini memaksa string kategori backend masuk ke union kategori form. Jika backend berisi kategori di luar `FAQ_CATEGORIES` (mis. dibuat lewat API/seed lama), `<Select>` tidak punya `<option>` yang cocok: browser menampilkan pilihan pertama, dan menyimpan form akan **mengubah kategori** item itu tanpa peringatan.

**(2)** `handleEdit` tidak menyalin field lain di luar lima yang ada; jika tipe `FAQ` bertambah (mis. `updated_at`), form tidak terpengaruh karena hanya field yang relevan di-reset.

```tsx
<Button onClick={() => { handleCancel(); setShowForm(!showForm); }}>
  <Plus ... /> {showForm ? "Tutup Form" : "Tambah FAQ"}
</Button>
```

**(1)** Saat form terbuka, tombol menjalankan `handleCancel()` (menutup + reset) lalu `setShowForm(!true)` = `false`. Saat tertutup, `handleCancel()` (tetap tertutup) lalu `true` → membuka form kosong. Hasil akhirnya benar, tetapi ada dua sumber kebenaran (`handleCancel` dan toggle) yang bekerja berurutan.

**(2)** Jika `handleCancel` di masa depan berubah menjadi tidak menutup form, tombol ini bisa membuka form saat dimaksudkan menutup. Lebih sederhana: satu handler `toggleForm` yang memanggil `reset()` saat membuka.

```tsx
<DataTable<FAQ> rows={data} columns={[...]} />
```

**(1)** `DataTable` merender semua baris yang diberikan (tidak ada paginasi internal). Dengan `limit: 50`, tabel bisa sangat panjang dan mengandalkan scroll horizontal/vertikal halaman.

**(2)** Kolom "Pertanyaan" menampilkan teks penuh tanpa truncation; pertanyaan panjang akan melebarkan kolom dan mendorong kolom aksi. `panel-table` punya `overflow-x`, jadi tabel bisa digeser, tetapi baris menjadi tinggi tidak seragam.

**(3)** Tombol Edit/Hapus selalu tampil untuk setiap baris, tanpa membedakan status. Menghapus FAQ yang sedang tampil di beranda langsung menghilangkannya dari publik (query invalidated), sesuai peringatan di `ConfirmDialog`.

```tsx
<ConfirmDialog open={!!pendingDelete} ... onConfirm={() => pendingDelete && deleteItem.mutate(...)} />
```

**(1)** `pendingDelete &&` memastikan tidak ada pemanggilan saat null. `loading={deleteItem.isPending}` menonaktifkan tombol selama request.

**(2)** Jika delete gagal, `pendingDelete` tetap terisi sehingga dialog tetap terbuka dengan toast error — pengguna bisa mencoba lagi atau batal. Ini perilaku yang benar.

### 9.35.2 `visitor-rule-admin.tsx` (244 baris)

```tsx
const PRIORITY_ICONS = { low: Flag, normal: Shield, high: AlertTriangle, critical: AlertTriangle };
...
function PriorityBadge({ priority }: { priority: VisitorRule["priority"] }) {
  const Icon = PRIORITY_ICONS[priority];
  return <Badge status={priority}><Icon className="mr-1 h-3 w-3" />{priority.charAt(0).toUpperCase() + priority.slice(1)}</Badge>;
}
```

**(1)** `high` dan `critical` memakai ikon yang sama (`AlertTriangle`), sehingga dua tingkat keparahan tidak bisa dibedakan dari ikon. Warna `Badge` bergantung pada pemetaan `status`; nilai `low/normal/high/critical` bukan status yang dikenal komponen badge (yang biasanya memakai `success/warning/danger`), jadi semuanya bisa jatuh ke gaya default. Label teks masih membedakan.

**(2)** `PRIORITY_ICONS[priority]` bertipe longgar; jika backend mengirim prioritas baru di luar union, `Icon` menjadi `undefined` dan render `<Icon />` melempar "Element type is invalid", menjatuhkan seluruh tabel. Cast tipe di `handleEdit` menyembunyikan kemungkinan ini.

**(3)** Komponen `PriorityBadge` didefinisikan **di dalam** `VisitorRuleAdmin`, sehingga identitasnya berubah setiap render. React akan meng-unmount/mount ulang badge di setiap render, kehilangan state internal (tidak ada state di sini, jadi hanya boros).

```tsx
const publishedCount = publishedRules.data?.filter(r => r.is_published).length ?? 0;
const totalCount = data?.length ?? 0;
```

**(1)** Sama seperti FAQ: `totalCount` dibatasi `limit: 50`, `publishedCount` dari query lain, dan "Draft" bisa negatif. Tidak ada `meta.total`.

**(2)** Tidak ada filter kategori/prioritas maupun pencarian. Dengan 50 aturan, admin harus menggulir dan membaca manual untuk menemukan satu aturan.

```tsx
const { register, handleSubmit, reset, formState: { errors } } = useForm<VisitorRuleFormValues>({
  resolver: zodResolver(visitorRuleSchema),
  defaultValues: { priority: "normal", sort_order: 0, is_published: false },
});
```

**(1)** `category` tidak punya default, sehingga `<Select {...register("category")}>` mulai tanpa nilai terpilih. Browser menampilkan opsi pertama, tetapi state RHF kosong sampai pengguna memilih. Jika skema mewajibkan kategori, submit pertama gagal dengan pesan yang benar — tetapi UI tampak sudah memilih opsi pertama.

**(2)** Ini berbeda dari `faq-admin` yang memberi default `"Umum"`. Ketidakkonsistenan kecil yang bisa membingungkan saat membandingkan dua form.

```tsx
<Select {...register("priority")}>
  {VISITOR_RULE_PRIORITIES.map((priority) => (<option key={priority} value={priority}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</option>))}
</Select>
```

**(1)** Label bahasa Inggris (`Low`, `Normal`, `High`, `Critical`) ditampilkan kepada admin Indonesia. Kategori memakai nilai apa adanya dari `VISITOR_RULE_CATEGORIES`, yang bisa juga berbahasa Indonesia — campuran bahasa dalam satu form.

**(2)** Prioritas dikirim sebagai string huruf kecil; backend menyimpannya apa adanya. Jika backend punya enum berbeda (mis. `LOW`), validasi akan menolak.

```tsx
<ConfirmDialog ... description={`"${pendingDelete.title}" akan dihapus permanen...`} />
```

**(1)** Peringatan menyebut "tidak muncul lagi di halaman publik", padahal aturan yang masih `draft` memang belum pernah tampil. Kalimatnya generik dan sedikit menyesatkan, tetapi tidak berbahaya.

**(2)** Seperti FAQ, kegagalan hapus membiarkan dialog terbuka; sukses menutup dan menginvalidasi query.

### 9.35.3 `destination-info-admin.tsx` (245 baris)

```tsx
import { Plus, Edit, Trash2, Eye, Archive, Send } from "lucide-react";
...
const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<...>
```

**(1)** `Eye` dan `setValue` tidak dipakai. `Eye` mungkin dimaksudkan untuk pratinjau; `setValue` untuk mengisi field programatik (mis. dari peta/lokasi). Keduanya impor mati.

**(2)** Form ini punya 9 field teks dan tidak memakai `watch`/preview. Tidak ada pratinjau bagaimana informasi akan tampil di halaman publik, padahal ini konten yang langsung dikonsumsi pengunjung.

```tsx
const { data, isLoading, isError } = useDestinationInfoList({ limit: 20 });
const publishedInfo = usePublishedDestinationInfo();
```

**(1)** Domain `destinationinfo` dirancang sebagai **satu** dokumen aktif (`GetPublished` mengembalikan objek tunggal, 9.25.4), tetapi admin menampilkan daftar hingga 20 dokumen dan mengizinkan banyak dokumen `published`. Jika dua dokumen dipublikasikan, halaman publik hanya menampilkan salah satu (biasanya yang terbaru) — dokumen lain menjadi "terbit tapi tak terlihat".

**(2)** Tidak ada validasi/penjagaan di UI yang mencegah mempublikasikan dokumen kedua. Sebaiknya sembunyikan tombol "Tambah" saat sudah ada dokumen, atau tampilkan peringatan.

```tsx
function handleEdit(item: DestinationInfo) {
  reset({
    title: item.title,
    description: item.description,
    history: item.history || "",
    ...
  });
}
```

**(1)** Semua field opsional dinormalisasi `|| ""`, sehingga input tidak pernah mendapat `undefined`/`null` (mencegah peringatan controlled/uncontrolled). `title`/`description` dianggap wajib dan diteruskan apa adanya.

**(2)** `defaultValues` form **tidak** memuat `title`/`description` (hanya field opsional). Setelah `handleCancel()` yang memanggil `reset()` tanpa argumen, kedua field kembali ke `undefined`; input menjadi kosong. Efeknya benar, tetapi bertumpu pada perilaku RHF terhadap field yang tidak ada di default.

```tsx
function handleCancel() {
  setShowForm(false); setEditingId(null); reset();
}
```

**(1)** Berbeda dari FAQ/visitor-rule yang me-reset ke nilai default eksplisit, di sini `reset()` mengosongkan semua. Karena `defaultValues` berisi string kosong untuk field opsional, hasilnya form kosong.

**(2)** `handleCancel` dipanggil sebelum toggle di tombol "Tambah Informasi": saat form tertutup, ini mereset lalu membuka form kosong — benar. Saat terbuka, menutup dan mereset.

```tsx
{d.status === "draft" && (<Button ... onClick={() => publishItem.mutate(d.id, ...)}>Publikasikan</Button>)}
{d.status === "published" && (<Button ... onClick={() => archiveItem.mutate(d.id, ...)}>Arsipkan</Button>)}
```

**(1)** Hanya `draft` yang bisa dipublikasikan dan hanya `published` yang bisa diarsipkan. Dokumen `archived` **tidak punya tombol untuk kembali ke published**. Satu-satunya jalan adalah memanggil API langsung atau membuat dokumen baru. Ini dead end operasional.

**(2)** Tombol aksi tidak memakai konfirmasi. Mengarsipkan dokumen yang sedang tampil di halaman publik langsung menghilangkannya dari publik setelah query invalidated — satu salah klik berdampak ke pengunjung.

**(3)** Ketiga tombol (publish/archive/edit/delete) dirender berdampingan tanpa pengelompokan; pada layar sempit baris aksi bisa meluber. `DataTable` membungkus dengan scroll horizontal.

```tsx
<Badge status={d.status === "published" ? "success" : d.status === "archived" ? "warning" : "default"}>{d.status}</Badge>
```

**(1)** Label status ditampilkan **mentah** dalam bahasa Inggris (`draft`, `published`, `archived`), berbeda dari FAQ/aturan yang memakai "Dipublikasikan"/"Draft". Untuk admin berbahasa Indonesia, ini tidak konsisten.

**(2)** Warna dipetakan manual: published → success, archived → warning, lainnya default. Jika backend menambah status (mis. `scheduled`), otomatis default tanpa peringatan.

```tsx
{ publishedInfo.data && (
  <Badge status={publishedInfo.data.status === "published" ? "success" : "default"}>
    {publishedInfo.data.status === "published" ? "Sudah Dipublikasikan" : "Belum Dipublikasikan"}
  </Badge>
) }
```

**(1)** Badge ringkasan hanya muncul jika ada dokumen terbit. Saat belum ada, tidak ada indikator "belum ada informasi" — hanya tombol tambah.

**(2)** Endpoint `getPublished` kemungkinan mengembalikan 404/null bila tidak ada; hook menanganinya sebagai `data` undefined, sehingga badge hilang tanpa error. Perilaku ini benar, tetapi tidak menjelaskan status ke admin.

```tsx
<ConfirmDialog ... title="Hapus informasi destinasi ini?" ... />
```

**(1)** Menghapus dokumen yang sedang `published` diperbolehkan dengan konfirmasi yang sama seperti draft. Halaman publik akan kehilangan seluruh informasi destinasi (atau menampilkan kosong) sampai admin membuat dan mempublikasikan dokumen baru.

**(2)** Tidak ada peringatan khusus bahwa dokumen sedang terbit. Untuk data tunggal yang menjadi sumber halaman publik, konfirmasi sebaiknya menyebut status tersebut.
## 9.36 `admin/users` dan `admin/visitors` — baris per baris

### 9.36.1 `admin/users/page.tsx` (260 baris)

```tsx
const SHIFTS = ["PAGI", "SIANG", "MALAM"] as const;
const emptyForm = { id: "", name: "", email: "", phone: "", role: "PETUGAS GERBANG", shift: "PAGI", gate: "Gerbang 1" };
```

**(1)** Shift dan gate adalah konsep operasional yang **tidak ada** di model `User` backend (6.1). Backend hanya menyimpan `name`, `email`, `phone`, `role`, `is_active`. Jadi dua field ini tidak akan pernah tersimpan, bahkan jika endpoint create/update ada.

**(2)** `role: "PETUGAS GERBANG"` bukan peran backend. Peran yang dikenal: `ADMIN`, `MANAGER`, `PETUGAS`, `PENGUNJUNG` (8.15.1). Nilai form ini hanya untuk tampilan.

```tsx
useEffect(() => { loadStaff(); }, []);
async function loadStaff() {
  setLoading(true);
  try { const data = await staffService.list(); setStaffList(data); }
  catch (error: any) { toast.error("Gagal memuat data petugas", { description: error.message }); }
  finally { setLoading(false); }
}
```

**(1)** `loadStaff` dideklarasikan sebagai function declaration di dalam komponen, sehingga identitasnya berubah setiap render. Effect sengaja memakai array kosong dan tidak menyertakan `loadStaff`; ini bekerja (dipanggil sekali) tetapi melanggar aturan exhaustive-deps. Jika logika di dalamnya berubah untuk bergantung pada state, effect tidak akan ikut.

**(2)** Saat gagal, `staffList` tetap `[]` dan loading selesai. Halaman menampilkan "Belum ada data petugas" — kegagalan server tampak seperti data kosong. Hanya toast sesaat yang memberi tahu.

**(3)** `error.message` bisa `undefined` jika error bukan `Error`; toast menampilkan deskripsi kosong.

```tsx
async function save() {
  if (!form) return;
  ...
  setSubmitting(true);
  try {
    if (form.id) {
      // Catatan: backend saat ini hanya mendukung update status, belum update penuh.
      toast.success("Data petugas diperbarui (hanya status yang didukung backend saat ini)");
    } else {
      toast.success("Petugas baru ditambahkan (membutuhkan endpoint create di backend)");
    }
    setForm(null);
    loadStaff();
```

**(1)** **Fungsi ini tidak memanggil API sama sekali.** Tidak ada `staffService.create`/`update` — service memang tidak punya method itu (9.25.8). Semua validasi, state `submitting`, dan `try/catch` tidak ada gunanya.

**(2)** Untuk "tambah", UI menampilkan toast **sukses** padahal tidak ada yang dibuat, lalu menutup form dan memuat ulang daftar yang tidak berubah. Pengguna bisa mengira petugas sudah dibuat. Kata "membutuhkan endpoint create" adalah satu-satunya petunjuk, dan mudah terlewat.

**(3)** Untuk "edit", perubahan nama/email/telepon/role/shift/gate dibuang, lalu toast sukses. Ini lebih berbahaya daripada menonaktifkan tombol: admin mengira data sudah diperbarui.

**(4)** `StaffError` diimpor dan dipakai di `catch`, tetapi tidak ada pemanggilan yang bisa melemparnya di dalam `try` (hanya toast). Impor ini sisa rencana implementasi.

**(5)** Perbaikan minimal yang benar: sembunyikan tombol Tambah/Edit, atau tampilkan banner "belum didukung backend". Jangan berpura-pura sukses.

```tsx
function openEdit(s: Staff) {
  setForm({ id: s.id, name: s.name, email: s.email, phone: s.phone, role: s.role, shift: s.shift as typeof SHIFTS[number], gate: s.gate });
}
```

**(1)** Cast `s.shift as typeof SHIFTS[number]` memaksa nilai apa pun menjadi salah satu shift. Jika `s.shift` kosong/undefined (kemungkinan besar karena backend tidak menyimpannya), `<select value={undefined}>` menampilkan opsi pertama, dan menyimpan akan mengubah shift secara diam-diam (meski tidak tersimpan juga).

**(2)** `s.role` bisa `PETUGAS` (backend) sementara opsi form berisi `PETUGAS GERBANG`, `PETUGAS TIKET`, `SUPERVISOR`, `ADMIN`. Tidak ada yang cocok, sehingga select tampil kosong/opsi pertama.

```tsx
const paged = paginate(rows, page, 8);
...
<button onClick={() => setPage(page - 1)} disabled={page <= 1}>‹</button>
<span>Hal {paged.page} / {paged.totalPages}</span>
<button onClick={() => setPage(page + 1)} disabled={page >= paged.totalPages}>›</button>
```

**(1)** `paginate` mengoreksi `page` ke rentang valid dan mengembalikan `paged.page`, tetapi state `page` tidak disinkronkan. Jika filter mengurangi hasil saat berada di halaman 5, `paged.page` menjadi 1 sementara `page` tetap 5; tombol "sebelumnya" menghitung dari 5, bukan 1.

**(2)** Nomor urut memakai `(paged.page - 1) * 8 + index + 1` — konsisten dengan halaman terkoreksi. Tombol memakai state mentah. Campuran ini bisa membuat navigasi terasa aneh setelah filter.

**(3)** Ukuran halaman 8 tidak dapat diubah dan tidak ditampilkan sebagai pilihan; berbeda dari `admin/bookings` yang punya pemilih baris/halaman.

```tsx
<td><StatusPill status={s.status === "AKTIF" ? "Aktif" : "Nonaktif"} /></td>
```

**(1)** Backend `User` memakai `is_active` boolean, bukan `status` string. Tipe `Staff` di frontend mungkin memetakannya menjadi `"AKTIF"`/`"NONAKTIF"`; jika tidak, semua baris tampil "Nonaktif".

**(2)** `StatusPill` menerima label Indonesia yang cocok dengan peta warna (`aktif`/`nonaktif`), jadi warnanya benar — berbeda dari status booking.

```tsx
<button onClick={() => toggleStatus(s)} ... aria-label={s.status === "AKTIF" ? `Nonaktifkan ${s.name}` : `Aktifkan ${s.name}`}>
```

**(1)** Toggle langsung memanggil API tanpa konfirmasi. Menonaktifkan akun staf di tengah shift langsung berdampak: refresh token berikutnya ditolak, tetapi access token yang ada tetap berlaku sampai kedaluwarsa (backend memeriksa status saat login/refresh, bukan tiap request).

**(2)** Setelah sukses, `loadStaff()` memuat ulang seluruh daftar. Tidak ada optimistic update; tombol tidak menunjukkan loading per baris, sehingga klik ganda bisa mengirim dua request toggle.

```tsx
{form && (
  <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setForm(null)} role="dialog" aria-modal="true">
```

**(1)** Modal tidak menangani `Escape`, tidak mengunci scroll body, dan tidak memindahkan/menjebak fokus. Ini pola modal yang sama di banyak halaman admin (bookings, tickets, visitors) — konsisten tetapi belum aksesibel.

**(2)** Klik pada overlay menutup form tanpa konfirmasi, membuang input yang sudah diketik. Untuk form 6 field, ini bisa menjengkelkan; `ConfirmDialog` tidak dipakai di sini.

**(3)** `role="dialog"` + `aria-modal` tanpa `aria-labelledby`; judul `<h3>` tidak terhubung, sehingga pembaca layar mengumumkan dialog tanpa nama.

### 9.36.2 `admin/visitors/page.tsx` (213 baris)

```tsx
async function loadData() {
  setLoading(true);
  try { const visitorsData = await visitorService.list(); setVisitors(visitorsData); }
  catch (error: any) { console.error("Failed to load visitors:", error); }
  finally { setLoading(false); }
}
```

**(1)** **Error hanya ke console.** Setelah loading selesai, tabel kosong dan halaman menampilkan "Belum ada data pengunjung." Tidak ada toast, tidak ada tombol coba lagi. Kegagalan backend (termasuk tabel `visitors` yang tidak di-AutoMigrate, 8.57.2) tampak seperti tidak ada pengunjung.

**(2)** `visitorService.list()` memuat **semua** pengunjung lalu dipaginasi di klien (8 per halaman). Untuk ribuan pengunjung, payload besar dan render awal lambat. Endpoint mendukung paginasi, tetapi tidak dipakai.

```tsx
const rows = useMemo(() => {
  let list = searchIn(visitors, q, ["name", "email", "phone"]);
  list = sortData(list, "joined_at", "desc");
  return list;
}, [visitors, q]);
```

**(1)** Pencarian di klien hanya pada data yang sudah dimuat (semua, dalam kasus ini). Karena `list()` memuat semua, pencarian konsisten — berbeda dari tabel yang dibatasi limit.

**(2)** Sort `joined_at` sebagai string ISO akan benar secara leksikografis. Jika backend mengirim format lain (mis. `12/11/2026`), urutan salah tanpa error.

**(3)** `VisitorRow = Visitor` adalah alias tanpa nilai tambah; kemungkinan sisa rencana menambah field turunan.

```tsx
useEffect(() => {
  if (!detail) { setVisitorBookings([]); return; }
  let alive = true;
  setBookingLoading(true);
  bookingService.listForVisitor(detail.id, { limit: 100 })
    .then(rows => { if (alive) setVisitorBookings(rows); })
    .catch(() => { if (alive) setVisitorBookings([]); })
    .finally(() => { if (alive) setBookingLoading(false); });
  return () => { alive = false; };
}, [detail]);
```

**(1)** Riwayat dimuat saat detail dibuka, bukan sebelumnya — menghemat request. `alive` mencegah setState setelah detail ditutup.

**(2)** `catch` menelan error menjadi array kosong, sehingga UI menampilkan "Belum ada booking." untuk kegagalan server. Sama seperti pola lain, kegagalan disamarkan sebagai data kosong.

**(3)** `limit: 100` tanpa paginasi. Pengunjung dengan lebih dari 100 booking tidak menampilkan sisanya, dan dialog tidak memberi tahu.

**(4)** Jika pengguna cepat membuka detail A lalu B, dua request berjalan. Cleanup A men-set `alive=false` untuk A, jadi respons A diabaikan — benar. Namun `setBookingLoading(true)` untuk B bisa didahului `finally` A? `alive` A sudah false, jadi tidak menimpa loading B. Aman.

```tsx
const statusLabel: Record<BookingStatus, string> = { CONFIRMED: "Terkonfirmasi", USED: "Selesai", PENDING: "Menunggu", CANCELLED: "Dibatalkan", EXPIRED: "Kadaluarsa", PAID: "Berhasil" };
...
<StatusPill status={statusLabel[b.status] ?? "Berhasil"} />
<StatusPill status={b.payment ? b.payment.status : "Belum Bayar"} />
```

**(1)** `statusLabel` didefinisikan **di dalam** callback `map`, sehingga objek baru dibuat untuk setiap baris. Kecil, tetapi tidak perlu; pindahkan ke level modul.

**(2)** Fallback `?? "Berhasil"` untuk status tak dikenal adalah **salah secara semantik**: status baru seperti `REFUNDED` akan ditampilkan sebagai "Berhasil" (hijau), bukan status aslinya. Fallback yang aman adalah `b.status`.

**(3)** Dua `StatusPill` berdampingan: satu label Indonesia (cocok dengan peta warna), satu status pembayaran **mentah** (`PAID`, `PENDING`). Yang kedua tidak ada di peta warna `panel-ui`, jadi selalu biru default. Untuk "Belum Bayar" juga tidak ada di peta, biru.

**(4)** Jika `b.payment` ada tetapi statusnya `PENDING`, tampil "PENDING" di samping "Menunggu" (booking) — dua status berbeda dengan istilah berbeda, membingungkan.

```tsx
<td className="tabular-nums">{v.joined_at}</td>
```

**(1)** Tanggal ditampilkan mentah (ISO `2026-11-12T...`), bukan `formatDate`/`toLocaleDateString`. Kolom bisa melebar dan sulit dibaca; halaman lain memformat tanggal.

**(2)** Tidak ada kolom total booking/belanja di tabel; informasi itu hanya di dialog detail. Untuk daftar pengunjung, metrik ringkas biasanya lebih berguna daripada tanggal daftar mentah.

```tsx
function Row({ label, value }: { label: string; value: string }) { ... }
```

**(1)** Komponen `Row` di akhir file **tidak dipakai** di halaman ini. Sisa salin-tempel dari halaman detail lain. Tidak berbahaya, tetapi menambah kode mati.

**(2)** Modal detail memakai `<div>` biasa, bukan `Row`, dengan grid tiga kartu dan daftar riwayat. Tidak ada tombol aksi (mis. kirim ulang email, nonaktifkan akun) — halaman ini murni baca.

**(3)** Seperti modal lain, tidak ada `Escape`/scroll lock/focus trap. Untuk dialog dengan riwayat panjang (`max-h-[85vh] overflow-y-auto`), ketiadaan scroll lock berarti body di belakang juga bisa tergulir.
## 9.37 `admin/reports` dan `admin/audit-log` — baris per baris

### 9.37.1 `admin/reports/page.tsx` (351 baris)

```tsx
async function load() {
  setLoading(true); setError(null);
  try {
    const [dashboard, manager, bookingRows, paymentRows, visitorRows] = await Promise.all([
      analyticsService.getAdminDashboard(),
      analyticsService.getManagerAnalytics({ range: "30d" }),
      bookingService.list({ page: 1, limit: ROW_LIMIT }),
      paymentService.list({ page: 1, limit: ROW_LIMIT }),
      visitorService.list(),
    ]);
```

**(1)** `Promise.all` bersifat **all-or-nothing**: satu request gagal (mis. tabel `visitors` belum ada), seluruh laporan gagal meski data booking/pembayaran berhasil diambil. `catch` hanya menyimpan satu pesan error; empat data lain dibuang. Sebaiknya `Promise.allSettled` agar bagian yang berhasil tetap tampil.

**(2)** `visitorService.list()` tanpa limit memuat **seluruh** pengunjung hanya untuk menghitung fallback `visitors.length`. Ini request paling berat di halaman dan nilainya hanya dipakai jika `stats.total_visitors` tidak ada.

**(3)** `ROW_LIMIT = 100` diterapkan ke booking dan pembayaran, bukan ke analitik. Statistik di atas (30 hari) dihitung backend dari **seluruh** data, sedangkan tabel dan rekap harian di bawah dihitung dari 100 baris pertama. Dua bagian halaman menjawab pertanyaan yang sama dengan cakupan berbeda — dan angkanya tidak akan cocok.

**(4)** `getManagerAnalytics({range:"30d"})` adalah endpoint manager yang dipanggil oleh admin. Backend mengizinkan `MANAGER` dan `ADMIN` untuk `/manager/*`? Jika hanya `MANAGER`, request admin akan 403 dan seluruh `Promise.all` gagal. Periksa middleware rute analitik saat mengubah peran.

```tsx
const daily = useMemo(() => {
  const map = new Map<string, ReportRow>();
  for (const b of bookings) {
    if (!["PAID", "CONFIRMED", "USED"].includes(b.status)) continue;
    ...
    row.visitors += b.total_tickets;
```

**(1)** "Rekap Kunjungan Harian" menghitung `visitors` dari `total_tickets`, bukan jumlah pengunjung unik. Satu booking 4 tiket dihitung 4 pengunjung. Kolom `visitors` juga tidak ditampilkan di tabel (hanya Tanggal/Booking/Tiket/Pendapatan), sehingga field itu tidak terpakai.

**(2)** Hanya 100 booking terbaru yang diproses. Untuk laporan 30 hari dengan lebih dari 100 booking, pendapatan harian **under-count** tanpa peringatan di bagian ini (hanya bagian tabel yang memberi banner batas 100).

**(3)** Booking `PENDING`/`CANCELLED`/`EXPIRED` dilewati, sesuai subtitle "Hanya booking berbayar". Namun `PAID` dan `CONFIRMED` bisa merujuk booking yang sama setelah transisi, tidak ada double count karena satu baris satu status.

**(4)** Tanggal dikelompokkan dari `visit_date` (tanggal kunjungan), bukan `created_at` (tanggal transaksi). "Pendapatan harian" karena itu berarti pendapatan menurut hari kunjungan, bukan hari pembayaran — definisi yang harus konsisten dengan laporan manager.

```tsx
function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
```

**(1)** Ini pertahanan **CSV formula injection** yang benar: sel yang dimulai `=`, `+`, `-`, `@`, TAB, atau CR diberi apostrof, lalu seluruh sel dikutip dan tanda kutip di-escape. Tanpa ini, nama pengunjung `=HYPERLINK(...)` bisa dieksekusi Excel.

**(2)** Apostrof terlihat di Excel sebagai bagian teks (kadang hanya di formula bar), dan nilai negatif seperti `-500` akan menjadi `'-500` — untuk kolom total yang selalu positif tidak masalah, tetapi fungsi ini generik dan bisa salah jika dipakai untuk angka negatif.

**(3)** `String(value ?? "")` mengubah `null` menjadi string kosong; `0` tetap `"0"` (bukan dianggap kosong). Benar.

```tsx
const lines = filtered.map((b) => [b.booking_code, ..., String(b.total), b.status, b.payment?.status ?? "-"]);
const csv = [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\n");
const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
```

**(1)** BOM `\uFEFF` membuat Excel mengenali UTF-8 (penting untuk nama dengan diakritik/emoji). Tanpa BOM, Excel lama menampilkan karakter rusak.

**(2)** Pemisah koma, bukan titik koma. Di locale Indonesia, Excel sering memakai `;` sebagai pemisah daftar, sehingga file CSV koma bisa masuk ke satu kolom. Ini keterbatasan format CSV lintas locale.

**(3)** `URL.createObjectURL` + `a.click()` + `revokeObjectURL` langsung setelah klik. Kebanyakan browser sudah memulai unduhan sebelum revoke; Safari lama bisa gagal jika revoke terlalu cepat. Tidak ada penanganan error unduhan.

**(4)** Nama file memakai tanggal UTC (`toISOString()`), sehingga di WIB pukul 00:00–07:00 file bertanggal kemarin — sama seperti `report-export` (9.3.11).

**(5)** Ekspor memakai `filtered` (hasil pencarian/filter di klien), bukan seluruh booking. Ini masuk akal, tetapi tidak dijelaskan di UI; pengguna bisa mengira CSV berisi semua data.

```tsx
<StatCard label="Pengunjung Terdaftar" value={(stats?.total_visitors ?? visitors.length).toLocaleString("id-ID")} />
```

**(1)** Fallback ke `visitors.length` hanya benar jika `visitorService.list()` mengembalikan semua pengunjung (yang memang dilakukannya). Jika kelak endpoint diberi limit default, angka ini menjadi jumlah baris yang dimuat, bukan total.

**(2)** Label "Pengunjung Terdaftar" bisa berbeda makna dari `visitors` di backend (pengunjung yang check-in vs akun pengunjung). Pastikan `total_visitors` di `AdminDashboardStats` didefinisikan sama.

```tsx
<SectionCard title="Ringkasan Pembayaran" subtitle={`${payments.length} transaksi terbaca`}>
  ...
  {Object.entries(PAYMENT_ID).map(([key, label]) => (
    <li key={key} ...><StatusPill status={label} /><span>{(paymentSummary[key] ?? 0)...}</span></li>
  ))}
```

**(1)** Subtitle "transaksi terbaca" jujur menyatakan bahwa hanya 100 yang dihitung. Namun ringkasan tetap ditampilkan seolah total; admin perlu membaca subtitle untuk tahu batasnya.

**(2)** Semua status pembayaran ditampilkan, termasuk yang berjumlah 0. Ini membuat daftar stabil dan mudah dibandingkan, dengan konsekuensi baris "Refund 0" bisa mengesankan fitur refund ada.

**(3)** `StatusPill` menerima label Indonesia (`Menunggu`, `Berhasil`, `Refund`). `Berhasil` **tidak** ada di peta warna (`berhasil` ada, huruf kecil — `toLowerCase` membuatnya cocok). `Refund` tidak ada → biru default. `Diproses`/`Gagal`/`Kadaluarsa` juga tidak ada di peta (kunci peta: berhasil, valid, aktif, selesai, menunggu, dibatalkan, gagal, nonaktif, bermasalah). Hanya `Gagal` yang cocok.

```tsx
<SectionCard className="mt-3" title="Laporan Booking & Pengunjung"
  subtitle={`${filtered.length} booking ditampilkan${bookings.length >= ROW_LIMIT ? ` · data dibatasi ${ROW_LIMIT} booking terbaru` : ""}`}>
```

**(1)** Banner batas 100 muncul hanya jika `bookings.length >= 100`. Jika tepat 100 dan sebenarnya hanya ada 100, banner tetap muncul — peringatan palsu. Tidak ada `meta.total` yang dipakai untuk membedakan "tepat 100" dan "lebih dari 100".

**(2)** Filter status dan pencarian berjalan di klien atas 100 baris. Mencari booking lama yang tidak masuk 100 terbaru tidak akan menemukan apa pun meski datanya ada.

**(3)** Kolom "Pembayaran" menampilkan `PAYMENT_ID[b.payment.status] ?? b.payment.status` atau "Belum Bayar". Status mentah yang tidak dikenal muncul sebagai kode Inggris; `StatusPill` memberinya warna default.

**(4)** Kolom "Booking" memakai `BOOKING_ID[b.status] ?? b.status`, sehingga status baru tampil mentah (lebih baik daripada fallback "Berhasil" di halaman visitors).

### 9.37.2 `admin/audit-log/page.tsx` (205 baris)

```tsx
const { data, isLoading, isError, refetch, isFetching } = useAuditFeed({ page, limit: 20, action, status, from, to });
const logs = data?.items ?? [];
const meta = data?.meta;
const totalPages = meta?.total_pages ?? 1;
```

**(1)** Semua parameter filter masuk ke `queryKey` hook (9.4), sehingga perubahan filter otomatis memicu query baru — tidak ada double fetch manual seperti di `admin/tickets`.

**(2)** `from`/`to` dikirim sebagai string kosong saat belum diisi. Backend audit memperlakukan kosong sebagai tanpa filter (perlu dipastikan); jika tidak, query bisa memfilter tanggal `""` dan mengembalikan nol.

**(3)** `data?.items` mengasumsikan `AuditFeed` memisahkan `items` dan `meta`. Jika service mengembalikan bentuk lain, tabel kosong tanpa error.

```tsx
const ACTIONS = [
  { value: "ticket.validate", label: "Validasi tiket" },
  ...
];
```

**(1)** Daftar aksi **hardcoded**. Jika backend menambah aksi baru (mis. `facility.update`), aksi itu tetap muncul di tabel dengan label dari `auditActionLabel` (atau kode mentah), tetapi **tidak bisa difilter** lewat dropdown.

**(2)** Nilai aksi memakai titik (`ticket.validate`), sedangkan `auditActionLabel` mungkin memetakan konstanta berbeda. Periksa kesesuaiannya; filter yang salah nilai akan selalu kosong.

```tsx
const STATUSES = [
  { value: "", label: "Semua status" },
  { value: "SUCCESS", label: "Berhasil" },
  { value: "FAILED", label: "Gagal" },
  { value: "ERROR", label: "Bermasalah" },
];
```

**(1)** Tiga status ini harus sama dengan yang ditulis backend. Jika backend memakai `OK`/`FAIL`, filter tidak akan pernah cocok dan dropdown tampak rusak.

**(2)** `statusLabel` mengembalikan label atau status mentah. `StatusPill` menerima label (`Berhasil`/`Gagal`/`Bermasalah`); peta warna memuat `berhasil`/`gagal`/`bermasalah` (lowercase), jadi ketiganya berwarna benar. Ini salah satu dari sedikit tempat pemetaan status konsisten.

```tsx
<td>{log.actor_role || "SYSTEM"}</td>
```

**(1)** Aktor ditampilkan sebagai **peran**, bukan nama/ID. Untuk audit, "siapa" biasanya lebih penting daripada "peran apa"; dua admin berbeda tidak bisa dibedakan.

**(2)** Aksi sistem dan aksi pengguna cookie sama-sama bisa memiliki `actor_role` kosong (8.31), sehingga keduanya tampil "SYSTEM" — sulit membedakan aksi otomatis dari aksi pengguna yang tidak terdeteksi.

```tsx
<td className="text-[11px] text-[#698097]">
  {log.target_type}{log.target_id ? ` · ${log.target_id.slice(0, 8)}` : ""}
</td>
```

**(1)** ID target dipotong 8 karakter untuk menghemat ruang. Tidak ada tooltip/copy, sehingga admin tidak bisa mengetahui ID lengkap dari UI — menyulitkan penelusuran ke halaman entitas.

**(2)** `target_type` mentah (mis. `booking`, `ticket`) tidak diterjemahkan; campuran bahasa dengan kolom lain.

```tsx
<td className="max-w-[220px] truncate text-[11px] text-[#698097]">
  {typeof log.metadata?.scan_status === "string" ? `Scan: ...` : typeof log.metadata?.booking_code === "string" ? `Booking ${...}` : "-"}
</td>
```

**(1)** Keterangan hanya mendukung dua bentuk metadata: `scan_status` dan `booking_code`. Metadata lain (mis. alasan pembatalan, perubahan status) tidak ditampilkan; kolom berisi "-" meski datanya ada.

**(2)** `truncate` memotong teks tanpa `title`, sehingga pesan scan yang panjang (mis. alasan penolakan) tidak bisa dibaca lengkap. `metadata.message` bisa berisi informasi diagnostik yang justru dicari admin.

**(3)** `typeof ... === "string"` adalah penjagaan tipe yang baik untuk `metadata` bertipe `Record<string, unknown>`; tidak ada cast `any`.

```tsx
<button onClick={() => refetch()} disabled={isFetching} ...>
```

**(1)** `refetch()` mengabaikan filter dan memakai parameter terakhir dari hook. Tombol nonaktif selama fetch, mencegah spam.

**(2)** Tidak ada auto-refresh/polling. Untuk audit yang perlu dipantau real-time, admin harus menekan "Muat ulang" manual.

```tsx
<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="Dari tanggal" />
<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="Sampai tanggal" />
```

**(1)** Tidak ada batas `max`/`min` yang saling mengikat; pengguna bisa memilih `from` setelah `to`, dan backend kemungkinan mengembalikan nol tanpa pesan "rentang terbalik".

**(2)** Setiap perubahan tanggal langsung memicu query (karena masuk queryKey), tanpa tombol "Terapkan". Ini responsif, tetapi mengetik tanggal dengan keyboard bisa memicu beberapa request saat nilai antara berubah.

**(3)** Paginasi memakai `setPage(p => Math.min(totalPages, p + 1))`, jadi tidak bisa melewati halaman terakhir meski `totalPages` berubah setelah filter. Setelah filter berubah, `page` direset ke 1 — konsisten.
## 9.38 `admin/content` dan `admin/payments` — baris per baris

### 9.38.1 `admin/content/page.tsx` (219 baris)

```tsx
const results = await Promise.allSettled([
  destinationInfoService.list({ limit: 100 }),
  galleryService.list({ limit: 500 }),
  faqService.list({ limit: 500 }),
  facilityService.list({ limit: 500 }),
  visitorRuleService.list({ limit: 500 }),
]);
```

**(1)** `allSettled` adalah pilihan tepat di sini: satu modul gagal tidak menjatuhkan statistik modul lain. Bandingkan `admin/reports` yang memakai `all` (9.37.1).

**(2)** Limit 100/500 arbitrer. Jika ada 600 FAQ, statistik "Total" menampilkan 500 dan draft dihitung dari 500 — bukan total sebenarnya. Tidak ada `meta.total` yang dipakai, padahal endpoint menyediakannya.

**(3)** Lima request besar berjalan paralel pada setiap mount/refresh. Total data bisa mencapai 2.100 baris hanya untuk menampilkan angka ringkas. Ini kandidat kuat untuk endpoint agregat di backend (mis. `/admin/content/stats`).

```tsx
const valueOf = <T,>(result: PromiseSettledResult<T[]>): T[] =>
  result.status === "fulfilled" ? result.value : [];
const destInfo = valueOf(results[0] as PromiseSettledResult<Awaited<ReturnType<typeof destinationInfoService.list>>>);
```

**(1)** Generic `valueOf` bagus, tetapi setiap pemanggilan memaksa cast tipe dari tuple hasil `allSettled`. Cast berlapis ini menandakan TypeScript tidak bisa mempertahankan tipe per indeks untuk `Promise.allSettled` dengan fungsi berbeda. Jika urutan array berubah, cast tetap lolos kompilasi dan statistik tertukar.

**(2)** Hasil `rejected` menjadi array kosong, sehingga modul yang gagal tampil "0 item / 0 draft" — bukan "gagal dimuat". Satu-satunya indikator adalah toast "Sebagian statistik konten gagal dimuat" yang hilang setelah beberapa detik.

```tsx
setStats({
  destinationInfo: { total: destInfo.length, published: destInfo.filter(d => d.status === "published").length, draft: destInfo.filter(d => d.status !== "published").length },
  gallery: { total: galleryItems.length, published: galleryItems.length, draft: 0 },
  ...
});
```

**(1)** **Galeri dianggap selalu terbit.** Model `GalleryItem` tidak punya `is_published`/`status` (9.25.4), jadi semua item memang tampil publik. Menampilkan "X dipublikasikan, 0 draft" secara teknis benar, tetapi mengesankan galeri punya alur draft yang tidak ada.

**(2)** `draft` untuk `destinationInfo` menghitung **semua yang bukan published**, termasuk `archived`. Jadi "draft" bisa berarti "diarsipkan". Untuk modul lain, draft = `!is_published` tepat.

**(3)** Dua `filter` terpisah untuk published dan draft berarti array diiterasi dua kali. Untuk 500 item tidak masalah, tetapi bisa dihitung dalam satu loop.

**(4)** Statistik dihitung dari data klien, bukan dari server. Angka bisa berbeda dari halaman modul masing-masing yang memakai limit berbeda (FAQ 50, galeri 24) — tiga angka "total" untuk entitas yang sama.

```tsx
setLastUpdated(new Date().toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
```

**(1)** Label di UI adalah "Terakhir diperbarui", tetapi nilainya adalah **waktu fetch statistik**, bukan waktu konten terakhir diubah. Setiap klik Refresh mengubah "terakhir diperbarui" meski tidak ada konten yang berubah. Ini informasi yang menyesatkan.

**(2)** Tidak ada zona waktu yang ditampilkan; `toLocaleString` memakai zona browser. Admin di WIB dan server UTC bisa melihat waktu berbeda dari log audit.

```tsx
<Button variant="outline" onClick={fetchStats} loading={loading}>
  {!loading && <Loader2 className="mr-1 h-4 w-4" />}
  Refresh
</Button>
```

**(1)** Ikon `Loader2` dirender saat **tidak** loading (kondisi terbalik). Tidak berputar (`animate-spin` tidak ada), jadi hanya ikon statis yang muncul saat tombol aktif. Jika `Button` sudah menampilkan spinner lewat prop `loading`, ikon ini duplikat.

**(2)** `fetchStats` adalah `useCallback([])` yang stabil; `useEffect([fetchStats])` berjalan sekali. Klik Refresh memanggil ulang tanpa mengubah state filter apa pun (tidak ada filter).

```tsx
<Link href={module.href} className="... bg-brand px-4 py-2 ... hover:bg-brand-dark">
```

**(1)** `bg-brand` adalah teal (`#0F766E`), sedangkan seluruh UI panel memakai biru `#1768ad`. Tombol "Kelola Konten" karena itu berwarna berbeda dari tombol lain di aplikasi — inkonsistensi token yang nyata (9.27.6).

**(2)** Tautan menuju `/admin/gallery`, `/admin/faq`, `/admin/facilities`, `/admin/visitor-rules`, `/admin/destination-info` — lima halaman pembungkus tipis yang merender komponen fitur. Struktur ini konsisten dengan pemisahan `app` (rute) dan `features` (UI).

**(3)** Modul **artikel** dan **paket** tidak ada di daftar meski keduanya punya halaman admin (`/admin/articles`, `/admin/packages`) dan komponen CMS. "Kelola Konten" karena itu tidak mencakup semua konten; artikel dikelola dari halaman terpisah yang tidak tertaut dari sini.

**(4)** Kartu modul memakai warna Tailwind berbeda (blue/green/amber/purple/red) yang tidak ada di palet panel. Secara visual hidup, tetapi menambah satu set warna lagi ke aplikasi yang sudah punya biru hardcode + brand teal.

### 9.38.2 `admin/payments/page.tsx` (181 baris)

```tsx
useEffect(() => {
  let alive = true;
  setLoading(true);
  (async () => {
    try {
      const data = await paymentService.list({ page, limit: 8, status: status || undefined });
      if (alive) setPayments(data);
    } catch (error: any) {
      toast.error("Gagal memuat pembayaran", { description: error.message });
    } finally {
      if (alive) setLoading(false);
    }
  })();
  return () => { alive = false; };
}, [page, status]);
```

**(1)** Paginasi **server** (limit 8 per halaman) digabung dengan paginasi **klien** di bawah. Ini akar bug halaman ini: `payments` hanya berisi maksimal 8 baris, lalu `paginate(rows, page, 8)` memotongnya lagi.

**(2)** `alive` mencegah respons lama menimpa setelah unmount, tetapi tidak mencegah race saat `page`/`status` berubah cepat: dua request berjalan, keduanya `alive` (komponen masih mount), respons yang lebih lambat menang. Tidak ada pembatalan (`AbortController`) atau penanda urutan.

**(3)** Saat `status` berubah, `setPage(1)` dipanggil di handler select, tetapi `status` dan `page` berubah dalam satu batch; effect berjalan sekali dengan keduanya baru — baik. Jika `page` sudah 1, hanya status yang berubah.

**(4)** Gagal memuat: toast, `payments` tetap data lama (jika ada) atau `[]`. Tidak ada state error yang persisten; tabel bisa menampilkan data halaman sebelumnya sambil toast error.

```tsx
const rows = useMemo(() => {
  let list = searchIn(payments, q, ["id", "booking_id"]);
  if (status) list = list.filter((p) => p.status === status);
  return sortData(list, "created_at", sortDir);
}, [payments, q, status, sortDir]);

const paged = paginate(rows, page, 8);
```

**(1)** **Paginasi tidak pernah bisa pindah halaman.** `payments` maksimal 8 baris, `rows` maksimal 8, dan `paginate(rows, page, 8)` menghasilkan `totalPages = 1` untuk semua kondisi. Tombol ‹/› tidak pernah dirender (`paged.totalPages > 1` selalu false), sehingga halaman 2 dan seterusnya **tidak bisa diakses**.

**(2)** Karena `page` state tetap bisa bernilai >1 (tidak ada yang mencegah), jika suatu saat data >8 (mis. batas server berubah), `paginate` akan mengoreksi halaman tampilan sementara state tetap, memunculkan kembali bug navigasi seperti halaman lain.

**(3)** Filter status diterapkan **dua kali**: di server (`status: status || undefined`) dan di klien (`list.filter`). Hasilnya sama, tetapi menunjukkan keraguan apakah server benar-benar memfilter. Jika server mengabaikan parameter, filter klien menyelamatkan; jika server memfilter, filter klien mubazir.

**(4)** Pencarian hanya mencakup 8 baris yang sedang dimuat. Mencari ID pembayaran dari bulan lalu tidak akan menemukannya meski ada di database. Placeholder "Cari ID pembayaran / booking…" menjanjikan pencarian global yang tidak terjadi.

**(5)** `sortData` mengurutkan 8 baris di klien. Tombol "Tanggal ↑/↓" karena itu hanya membalik urutan halaman saat ini, bukan mengurutkan seluruh data. Secara visual terlihat berfungsi, secara data menyesatkan.

```tsx
<td><StatusPill status={STATUS_ID[p.status]} /></td>
```

**(1)** `STATUS_ID` menerjemahkan ke `Menunggu`, `Diproses`, `Berhasil`, `Gagal`, `Kadaluarsa`, `Refund`. Peta warna `panel-ui` hanya memuat `menunggu`, `gagal`, `berhasil` (lowercase), sehingga `Diproses`, `Kadaluarsa`, dan `Refund` jatuh ke biru default. Status pembayaran yang berbeda warna hanya tiga dari enam.

**(2)** `Berhasil` cocok dengan kunci `berhasil` — hijau. `Gagal` merah. `Menunggu` kuning. Sisanya biru, termasuk `Refund` yang seharusnya netral/abu.

```tsx
<td className="font-medium text-[#17324d]">{p.id}</td>
```

**(1)** Kolom "Nomor Transaksi" menampilkan **UUID internal**, bukan nomor yang dikenal pengguna (`PAY-...`). Panjang 36 karakter membuat kolom melebar dan sulit dibaca; tidak ada monospace/truncate.

**(2)** Tidak ada kolom nominal, tanggal, atau kode booking di tabel. Admin harus membuka detail satu per satu untuk mengetahui nilai transaksi — informasi paling penting untuk halaman pembayaran.

```tsx
<Row label="Kode Booking" value={detail.booking_id} />
```

**(1)** Label "Kode Booking" tetapi nilainya `booking_id` (UUID), bukan `booking_code` (`KP-...`). Sama seperti bug label di PDF e-tiket dan dialog booking (9.3.10, 9.11.2). Petugas/admin yang mencari kode di UI lain tidak akan menemukannya.

**(2)** `<Row label="Kadaluarsa" value={new Date(detail.expired_at).toLocaleString("id-ID")} />` tidak dijaga `if`. Jika `expired_at` kosong/null, `new Date(undefined)` menghasilkan Invalid Date dan `toLocaleString` mengembalikan **"Invalid Date"** yang tampil apa adanya.

**(3)** `detail.paid_at` dijaga, tetapi `expired_at` tidak — ketidakkonsistenan kecil yang menunjukkan dua field diperlakukan berbeda tanpa alasan.

**(4)** Dialog hanya menampilkan data; tidak ada aksi `updateStatus` meski `paymentService.updateStatus` tersedia. Admin tidak bisa menandai lunas/gagal dari UI ini, meski halaman bernama "Kelola Pembayaran".

**(5)** Modal tidak menangani Escape/scroll lock/focus trap, sama seperti modal admin lain. Untuk data 8 baris, risiko rendah; untuk dialog detail, tetap sebaiknya konsisten dengan `ConfirmDialog` yang sudah lebih lengkap.

**(6)** `PaymentError` diimpor tetapi tidak dipakai di file (hanya `paymentService`). Impor mati.
## 9.39 Halaman `(manager)` — baris per baris

### 9.39.1 `manager/sales/page.tsx` (165 baris)

```tsx
const ticketSales = analytics?.ticket_type_performance.map((t) => ({ name: t.label, value: t.value })) ?? [];
```

**(1)** `ProgressList` menormalkan batang terhadap nilai tertinggi, bukan total, sehingga "Penjualan per Jenis Tiket" menunjukkan perbandingan relatif, bukan proporsi. Angka asli tetap ditampilkan di kanan.

```tsx
<PieChart data={a.ticket_type_performance.length ? a.ticket_type_performance : a.booking_trend} />
```

**(1)** Fallback ke `booking_trend` saat tidak ada penjualan tiket. `booking_trend` berisi **jumlah booking per tanggal**, bukan komposisi jenis tiket. Jika data kosong (mis. periode tanpa penjualan), pie chart menampilkan potongan berdasarkan tanggal dengan judul "Penjualan Tiket" — interpretasi yang salah.

**(2)** Fallback seharusnya menampilkan keadaan kosong ("Belum ada penjualan"), bukan data dari dimensi lain.

```tsx
{ label: "Conversion Rate", value: `${a.summary.conversion_rate}%` },
```

**(1)** `conversion_rate` berasal dari backend. Jika nilainya pecahan (0–1), menambahkan `%` menghasilkan "0.62%" padahal maksudnya 62%. Periksa kontrak `ManagerAnalytics`; tipe saja tidak menjamin skala.

**(2)** PDF (`exportReportPDF`) memakai `summary` yang sama, jadi kesalahan skala ikut tercetak di laporan resmi.

```tsx
<button onClick={() => { exportReportPDF(buildReport()); toast.success("Laporan PDF diunduh"); }}>
```

**(1)** `exportReportPDF` membuat file secara sinkron di klien dan memanggil `doc.save`. Jika `analytics` null, `buildReport` mengembalikan `{}` dan PDF akan gagal/berisi kosong; tetapi tombol hanya dirender setelah `analytics` ada, jadi jalur ini tidak tercapai.

**(2)** Toast "diunduh" muncul segera setelah `save`, tanpa menunggu konfirmasi browser. Jika pengguna memblokir unduhan, pesan sukses tetap muncul.

**(3)** Tombol ekspor tidak memakai `disabled` saat ada request rentang baru; mengekspor saat data lama masih tampil akan menghasilkan laporan periode lama meski filter sudah berubah.

```tsx
if (!analytics) return <PageHeader title="Statistik Penjualan" subtitle="Data tidak tersedia" />;
```

**(1)** Setelah loading selesai dan request gagal, halaman menjadi **hanya judul** tanpa tombol coba lagi dan tanpa detail error (toast sudah hilang). Ini pengalaman buntu; pengguna harus reload halaman.

**(2)** `setAnalytics` tidak pernah direset ke `null` saat memuat rentang baru, sehingga saat berpindah rentang, data lama tetap tampil sampai data baru tiba (loading state penuh hanya pada mount pertama). Ini sebenarnya UX yang baik (tidak berkedip), tetapi berarti angka bisa sesaat tidak sesuai filter.

### 9.39.2 `manager/bookings/page.tsx` (155 baris)

```tsx
const data = await bookingService.list({ page, limit: 10, status: status || undefined });
...
const paged = paginate(rows, page, 10);
```

**(1)** **Bug paginasi yang sama seperti `admin/payments`.** Server mengembalikan maksimal 10 baris; `paginate` klien membagi 10 baris itu menjadi halaman berukuran 10 → `totalPages` selalu 1. Tombol ‹/› tidak pernah muncul, dan halaman 2+ tidak bisa diakses.

**(2)** `page` tetap masuk ke dependency effect, jadi state `page` yang tidak pernah berubah >1 tidak berbahaya. Namun nilai `page` dikirim ke API; jika pengguna pernah berada di halaman 2 lalu filter diubah, `setPage(1)` memperbaikinya.

**(3)** `summary` menghitung dari `bookings` yang hanya 10 baris. Kartu "Semua / Terkonfirmasi / Menunggu / Selesai / Dibatalkan" karena itu menggambarkan **halaman saat ini**, bukan seluruh data. Ini label yang menyesatkan untuk laporan manager.

```tsx
} catch (error: any) {
  console.error("Failed to load bookings:", error);
}
```

**(1)** Error hanya ke console. Tabel kosong dan ringkasan nol, tanpa pesan di layar. Manager bisa menyimpulkan "tidak ada booking" padahal server sedang gagal.

```tsx
const rows = useMemo(() => {
  let list = searchIn(bookings, q, [...]);
  if (status) list = list.filter((b) => b.status === status);
  return sortData(list, "created_at", "desc");
}, [bookings, q, status]);
```

**(1)** Pencarian dan filter status berjalan pada 10 baris. Filter status juga dikirim ke server, jadi hasilnya konsisten untuk halaman itu, tetapi pencarian tetap lokal.

**(2)** `BookingError` diimpor tetapi tidak dipakai; tidak ada mutasi di halaman ini (read-only), jadi tidak diperlukan.

**(3)** Tidak ada filter tanggal kunjungan atau rentang, padahal laporan booking manager biasanya perlu periode. Data yang tersedia hanya "10 terbaru" (atau 10 pertama sesuai urutan backend).

```tsx
<td><StatusPill status={STATUS_ID[b.status] ?? b.status} /></td>
```

**(1)** `PAID` → "Berhasil", cocok dengan peta warna. `CONFIRMED` → "Terkonfirmasi" tidak ada di peta → biru. `USED` → "Selesai" cocok biru. `EXPIRED` → "Kadaluarsa" tidak ada → biru. Jadi "Terkonfirmasi" dan "Kadaluarsa" tidak bisa dibedakan dari status netral.

**(2)** Fallback `?? b.status` lebih aman daripada fallback "Berhasil" di halaman visitors; status baru tampil apa adanya.

### 9.39.3 `manager/monitoring/page.tsx` (120 baris)

```tsx
const staffQuery = useQuery<Staff[]>({
  queryKey: ["admin", "staff", "monitoring"],
  queryFn: () => staffService.list(),
});
```

**(1)** `staffService.list()` memanggil endpoint staf yang kemungkinan berada di grup **ADMIN**. Manager yang membuka halaman ini bisa mendapat 403; `staffQuery.isError` true, banner error muncul, dan tabel kosong meski `monitorQuery` berhasil. Endpoint monitoring sendiri mengizinkan manager.

**(2)** `queryKey` berawalan `["admin", ...]` meski dipakai di panel manager. Ini hanya penamaan, tetapi menyulitkan invalidasi: mutasi staf yang menginvalidasi `["admin","staff"]` akan ikut menyegarkan query ini, sedangkan mutasi manager tidak.

**(3)** Dua query berjalan paralel; tidak ada `enabled` yang menunggu salah satu. Jika staf gagal, monitoring tetap tampil sebagian (kartu total validasi), yang merupakan perilaku baik.

```tsx
const staffStats = staff.map((s) => {
  const own = perPetugas.find((p) => p.name === s.name);
  return { ..., validated: own?.valid ?? 0, lastActivity: own?.last_activity ?? null };
});
```

**(1)** Penggabungan berdasarkan **nama**, bukan ID. Nama petugas tidak unik (dua "Budi"), dan nama pada `per_petugas` berasal dari body request (8.13), sehingga bisa berbeda ejaan dari nama akun. Akibatnya angka validasi bisa menempel ke orang yang salah atau menjadi 0.

**(2)** Petugas yang tidak ada di `staff` (mis. akun nonaktif/dihapus) tetapi punya data scan tidak akan muncul sama sekali. Sebaliknya, staf tanpa scan tampil dengan 0.

**(3)** `own?.gate` dipakai sebagai fallback gate; jika monitoring tidak mengirim gate, tampil "-". Gate dari body juga bisa dipalsukan.

```tsx
const activeStaff = staff.filter((s) => s.status === "AKTIF").length;
```

**(1)** `status` staf berasal dari pemetaan `is_active`. Jika `Staff` tidak punya field `status` (backend boolean), filter menghasilkan 0 dan kartu "Petugas Aktif" menampilkan `0 / N`. Periksa tipe `Staff` di `types/api.ts`.

**(2)** Angka `staff.length` adalah jumlah staf yang dikembalikan `list()`, yang mungkin hanya petugas (bukan admin/manager). Rasio "aktif / total" karena itu tidak mencakup semua akun.

```tsx
const totalValidated = monitor?.total_valid ?? 0;
const validatedToday = monitor?.valid_today ?? 0;
```

**(1)** `total_valid` adalah jumlah scan **valid**, bukan jumlah tiket unik atau pengunjung. Satu tiket yang tercoba dua kali (scan ulang) bisa menambah angka jika backend mencatat percobaan; tiket `USED` yang dipindai lagi biasanya status `USED`, bukan valid.

**(2)** `valid_today` bergantung zona waktu server. Untuk server UTC dan operasional WIB, "hari ini" bergeser 7 jam — dashboard pagi bisa menampilkan angka kemarin.

```tsx
const perHour = (monitor?.hourly ?? []).map((h) => ({ label: `${String(h.hour).padStart(2, "0")}:00`, value: h.count }));
```

**(1)** `BarChart` tidak menampilkan nilai di atas batang; label jam ada di bawah. Untuk 24 batang, label bisa bertumpuk di layar sempit (tidak ada rotasi/interval).

**(2)** Jika `hourly` hanya berisi jam yang ada aktivitasnya, grafik tidak menunjukkan jam kosong — sumbu waktu menjadi tidak kontinu dan bentuk tren menyesatkan.

```tsx
<SectionCard title="Rekap Kunjungan" className="mt-3">
  <span>Total kunjungan tercatat (semua waktu)</span>
  <span>{totalValidated.toLocaleString("id-ID")}</span>
```

**(1)** Menamai `total_valid` sebagai "kunjungan" mencampur konsep validasi tiket dengan kunjungan. Satu booking 4 tiket yang divalidasi sekali menghasilkan 1 validasi, bukan 4 kunjungan.

**(2)** Angka ini juga tidak difilter tanggal (semua waktu) meski berada di halaman monitoring harian; tidak ada label periode di kartu.

### 9.39.4 `manager/visitors/page.tsx` (92 baris)

```tsx
analyticsService
  .getManagerAnalytics(range === "custom" ? { range: "custom", custom } : { range })
  .then((a) => { if (alive) setAnalytics(a); })
  .catch((e) => console.error("Failed to load analytics:", e))
  .finally(() => { if (alive) setLoading(false); });
```

**(1)** Error hanya ke console. Karena render memakai `if (loading || !analytics)`, kegagalan membuat `analytics` tetap null dan loading false → kondisi `!analytics` true → **skeleton ditampilkan selamanya**. Pengguna tidak pernah melihat pesan error atau data kosong.

**(2)** Ini pola bug yang sama dengan `dashboard/ticket` (9.18.3) dan `dashboard/payment`: state "belum ada data" dijadikan penanda loading. Perbaikan minimal: state error terpisah atau set `analytics` ke nilai kosong di `catch`.

**(3)** `range === "custom"` mengirim `custom` yang bisa `undefined` jika pengguna memilih "Kustom" lalu belum memilih tanggal (DateRangeFilter langsung memanggil onChange dengan default, jadi biasanya terisi). Backend harus menangani `custom` kosong.

```tsx
<SectionCard title="Tren Pengunjung" subtitle={`Periode: ${a.range_label}`}>
  <BarChart data={a.booking_trend.map((p, i) => ({ label: p.label, value: p.value }))} color="#16876a" />
</SectionCard>
```

**(1)** **Data yang digambar adalah `booking_trend`, bukan tren pengunjung.** Jumlah booking tidak sama dengan jumlah pengunjung (satu booking bisa banyak tiket). Judul "Tren Pengunjung" karena itu salah; seharusnya memakai seri pengunjung/tiket jika backend menyediakannya.

**(2)** `map((p, i) => ...)` menerima indeks `i` yang tidak dipakai. Sisa dari kode yang mungkin pernah memakai indeks untuk label.

**(3)** Warna hijau (`#16876a`) berbeda dari biru panel; pada halaman lain tren memakai biru. Tidak ada alasan semantik yang jelas (hijau biasanya untuk status sukses).

```tsx
<p className={`mt-1 text-xs ${a.changes.visitors >= 0 ? "text-blue-100" : "text-red-200"}`}>
  {a.changes.visitors >= 0 ? "▲" : "▼"} {Math.abs(a.changes.visitors)}% dari periode sebelumnya
</p>
```

**(1)** `Math.abs` membuat tanda hanya ditentukan panah, sehingga "-5%" tampil "▼ 5%" — benar. Namun `changes.visitors` bisa `null`/undefined di backend saat periode sebelumnya nol; perbandingan `>= 0` dengan undefined menghasilkan false, dan `Math.abs(undefined)` = NaN → "▼ NaN%".

**(2)** Tidak ada keterangan periode pembanding (7 hari sebelumnya? 30 hari?), hanya "periode sebelumnya". Untuk rentang kustom, pembanding bisa tidak sebanding panjangnya.

**(3)** Kartu total memakai `a.summary.total_visitors`, yang di backend mungkin dihitung dari tiket terjual (bukan pengunjung unik). Definisi ini harus sama dengan halaman laporan admin yang memakai `total_visitors` dari dashboard.
## 9.40 Dashboard manager dan petugas — baris per baris

### 9.40.1 `manager/dashboard/page.tsx` (122 baris)

```tsx
const [monthAnalytics, setMonthAnalytics] = useState<ManagerAnalytics | null>(null);  const [loading, setLoading] = useState(true);
```

**(1)** Dua deklarasi state berada di **satu baris**. Secara sintaks valid, tetapi menyalahi format Prettier dan menyulitkan diff. Indikasi file pernah disunting cepat tanpa dijalankan melalui formatter.

```tsx
const [a, month] = await Promise.all([
  analyticsService.getManagerAnalytics({ range: "7d" }),
  analyticsService.getManagerAnalytics({ range: "month" }),
]);
```

**(1)** Dua request paralel untuk rentang berbeda. Jika salah satu gagal, `Promise.all` menolak dan **keduanya dibuang**; dashboard menampilkan "Data tidak tersedia" meski satu rentang berhasil.

**(2)** Tidak ada cache bersama. Halaman `manager/sales` dengan rentang 7d akan meminta data yang sama lagi; React Query tidak dipakai di sini (padahal halaman monitoring memakainya).

```tsx
<StatCard label="Total Pengunjung" value={month.summary.total_visitors...} delta="dari periode sebelumnya" trend="up" />
<StatCard label="Tiket Terjual" value={a.summary.total_tickets...} ... />
<StatCard label="Total Booking" value={month.summary.total_bookings...} ... />
<StatCard label="Total Pendapatan" value={rupiah(month.summary.total_revenue)} ... />
```

**(1)** **Empat kartu dalam satu baris memakai dua periode berbeda**: pengunjung/booking/pendapatan dari **bulan ini**, tiket terjual dari **7 hari**. Angka tidak bisa dibandingkan satu sama lain, dan tidak ada label periode di kartu.

**(2)** `delta="dari periode sebelumnya"` dan `trend="up"` **hardcoded**. `StatCard` akan selalu menampilkan panah naik dan teks itu, tanpa persentase dan tanpa melihat `changes`. Jika pendapatan turun, kartu tetap hijau dengan "^ dari periode sebelumnya".

**(3)** `month.summary.total_visitors` mungkin berarti tiket terjual (definisi backend), bukan pengunjung unik. Halaman visitors dan laporan admin memakai field yang sama dengan label berbeda.

```tsx
<ChangeBadge pct={a.changes.revenue} />
```

**(1)** Satu-satunya badge perubahan yang memakai data nyata. `pct` bisa `undefined`/`null` dari backend saat pembanding nol; `pct >= 0` menjadi false dan `Math.abs(undefined)` = `NaN`, menampilkan "▼ NaN%".

**(2)** Warna hijau untuk naik, merah untuk turun — semantik yang benar, berbeda dari `StatCard` hardcoded.

```tsx
<LineChart data={trend} />
```

**(1)** `trend` berasal dari `revenue_trend` 7 hari dan dibulatkan. `LineChart` tidak menampilkan label sumbu X/Y maupun nilai titik (9.9.2), jadi hanya bentuk tren yang terlihat.

**(2)** Jika `revenue_trend` kosong, `LineChart` menghitung `Math.max(...[], 1)` = 1 dan `points` kosong; `path` menjadi string kosong. SVG tetap dirender tanpa garis — tidak error, tetapi tidak ada pesan "tidak ada data".

```tsx
if (!a || !month) {
  return <PageHeader title="Dashboard" subtitle="Data tidak tersedia" />;
}
```

**(1)** Tidak ada tombol coba lagi, tidak ada detail error. Sama seperti halaman manager lain. Satu-satunya jalan adalah reload browser.

**(2)** Ada dua baris kosong ekstra sebelum penutup `</div>` di JSX (sisa komponen yang dihapus). Kosmetik, tetapi menandakan bagian bawah dashboard pernah berisi konten lain (mis. tabel/aktivitas).

### 9.40.2 `petugas/dashboard/page.tsx` (128 baris)

```tsx
const [scans, setScans] = useState<ScanRecord[]>([]);
const [eTickets, setETickets] = useState<any[]>([]);
```

**(1)** `eTickets` **tidak pernah dipakai** — tidak diisi, tidak dibaca, dan tipenya `any[]`. Sisa rencana menampilkan tiket yang diterbitkan hari ini.

**(2)** `any[]` mematikan pemeriksaan tipe; jika nanti dipakai, field yang salah tidak akan terdeteksi saat kompilasi.

```tsx
const [history, stats] = await Promise.all([
  scannerService.getHistory({ page: 1, limit: 8 }),
  scannerService.getStats(),
]);
setScans(history);
// stats berisi total, valid, used, invalid, expired, cancelled. Nilainya dipakai untuk KPI.
```

**(1)** `stats` diambil, lalu **dibuang**. Komentar menyatakan "nilainya dipakai untuk KPI", tetapi KPI di bawah dihitung dari `scans`. Ini komentar yang bertentangan dengan kode — sumber kebingungan saat memelihara.

**(2)** Jika `getStats()` gagal, `Promise.all` menolak dan `history` yang berhasil ikut dibuang; dashboard kosong meski riwayat tersedia.

```tsx
const todayScans = scans.filter((s) => s.timestamp.slice(0, 10) === today);
const validToday = todayScans.filter((s) => s.status === "VALID").length;
const usedToday = todayScans.filter((s) => s.status === "USED").length;
const problemToday = todayScans.filter((s) => ["INVALID", "EXPIRED", "CANCELLED"].includes(s.status)).length;
```

**(1)** **KPI dihitung dari maksimal 8 scan terbaru**, bukan seluruh scan hari ini. `validToday` tidak bisa melebihi 8. Petugas yang memvalidasi 100 tiket akan melihat "Scan Valid 8" (atau kurang), angka yang menyesatkan untuk laporan shift.

**(2)** `today` memakai `todayISO()` (tanggal lokal browser), sedangkan `timestamp` dari backend bisa UTC. Membandingkan `slice(0,10)` pada string UTC dengan tanggal lokal menggeser batas hari 7 jam untuk WIB.

**(3)** `problemToday` mencakup `INVALID`, `EXPIRED`, `CANCELLED`, tetapi status lain (mis. `NOT_FOUND`) akan diabaikan. Daftar status harus sama dengan enum backend.

```tsx
{ label: "Total Tiket", sub: "Digunakan Sistem", value: 0 }, // Would need separate eTicket API
```

**(1)** Kartu KPI keempat **selalu 0** dengan komentar bahasa Inggris "Would need separate eTicket API". Menampilkan angka 0 yang terlihat seperti data nyata lebih buruk daripada menyembunyikan kartu atau menampilkan "—".

**(2)** `toLocaleString` pada 0 menghasilkan "0", tanpa indikator bahwa nilainya belum diimplementasikan.

```tsx
<td className="font-medium text-[#17324d]">{s.ticket_id}</td>
```

**(1)** Kolom "Kode Tiket" menampilkan **UUID** tiket, bukan kode yang dicetak/di-QR. Panjang 36 karakter membuat tabel melebar; petugas tidak bisa membacakannya dengan mudah.

**(2)** `scans.slice(0, 8)` dipanggil dua kali (untuk cek kosong dan untuk map) meski `getHistory` sudah meminta `limit: 8`. Redundan, tetapi konsisten.

```tsx
<StatusPill status={s.status === "VALID" ? "Valid" : s.status === "USED" ? "Sudah Digunakan" : s.status === "EXPIRED" ? "Kadaluarsa" : s.status === "CANCELLED" ? "Dibatalkan" : "Bermasalah"} />
```

**(1)** Rantai ternary menutup semua status yang dikenal dengan fallback "Bermasalah". Status tak dikenal tidak pernah tampil mentah, tetapi juga tidak dibedakan dari invalid.

**(2)** Peta warna `panel-ui` hanya memuat `valid` dan `bermasalah`; "Sudah Digunakan", "Kadaluarsa", "Dibatalkan" jatuh ke biru default. Hanya valid (hijau) dan bermasalah (merah) yang terbedakan.

### 9.40.3 `petugas/history/page.tsx` (137 baris)

```tsx
const data = await scannerService.getHistory({ page, limit: 10, status: status || undefined });
...
const paged = useMemo(() => paginate(rows, page, 10), [rows, page]);
```

**(1)** **Bug paginasi yang sama** dengan `admin/payments` dan `manager/bookings`: server mengirim 10 baris, klien membagi 10 baris menjadi halaman 10 → `totalPages = 1`. Tombol halaman tidak pernah muncul dan data ke-11 tidak bisa diakses.

**(2)** `status` dikirim ke `getHistory`, tetapi **service tidak meneruskan `status` ke backend** (9.8). Parameter diabaikan tanpa error; filter hanya terjadi di klien atas 10 baris. Ini contoh parameter yang "ada di tipe" tetapi tidak diimplementasikan.

**(3)** Filter status ganda (server yang tidak terjadi + klien) membuat hasil tampak benar untuk halaman pertama, sehingga bug sulit disadari sampai data lebih dari 10.

```tsx
} catch (error) {
  console.error("Failed to load scans:", error);
}
```

**(1)** Error hanya ke console. `scans` tetap array kosong, dan halaman menampilkan "Belum ada riwayat scan." Petugas bisa mengira belum ada validasi padahal server sedang gagal.

```tsx
const rows = useMemo(() => {
  let list = searchIn(scans, q, ["ticket_id", "booking_id", "visitor_name", "petugas"]);
  if (status) list = list.filter((s) => s.status === status);
  return sortData(list, "timestamp", sortDir);
}, [scans, q, status, sortDir]);
```

**(1)** Pencarian mencakup `booking_id` yang tidak ditampilkan di tabel. Petugas bisa mencari kode booking dan menemukan baris, tetapi tidak melihat mengapa baris itu cocok (kolom booking tidak ada).

**(2)** `sortData` pada 10 baris hanya membalik urutan halaman; tombol "Waktu ↑/↓" tidak mengurutkan seluruh riwayat. Sama seperti `admin/payments`.

**(3)** Tidak ada filter gate, petugas, atau rentang tanggal di UI meski `getHistory` mendukung `gate`, `petugas`, `from`, `to`. Fitur backend tidak terjangkau.

```tsx
<SectionCard action={<span ...>{rows.length} scan</span>}>
```

**(1)** `SectionCard` tanpa `title` hanya merender header jika ada `action`; hasilnya header tipis berisi angka di kanan tanpa konteks. Judul halaman sudah ada di `PageHeader`, jadi ini lebih sebagai badge.

**(2)** `rows.length` adalah jumlah setelah filter pada 10 baris, bukan total scan. Sama seperti tabel lain, angka ini bisa disalahartikan sebagai total.

```tsx
<td className="tabular-nums text-xs">{new Date(s.timestamp).toLocaleString("id-ID")}</td>
```

**(1)** Tanggal+waktu ditampilkan lengkap; di tabel dengan 5 kolom, ini bisa membungkus menjadi dua baris pada layar sempit. `whitespace-nowrap` tidak dipakai (berbeda dari audit log).

**(2)** `new Date(invalid)` menghasilkan "Invalid Date" jika `timestamp` kosong; tidak ada penjagaan.

**(3)** `STATUS_ID` memetakan `INVALID` → "Invalid" (bahasa Inggris bercampur), sedangkan status lain diterjemahkan. Konsistensi label status masih menjadi masalah lintas halaman.
## 9.41 Dashboard admin, aktivitas, dan e-tiket — baris per baris

### 9.41.1 `admin/dashboard/page.tsx` (122 baris)

```tsx
const [dashboardStats, managerAnalytics] = await Promise.all([
  analyticsService.getAdminDashboard(),
  analyticsService.getManagerAnalytics({ range: "7d" }),
]);
```

**(1)** Sama seperti dashboard manager: `Promise.all` membuat satu kegagalan menghapus keduanya. Jika endpoint manager analytics menolak admin (403), seluruh dashboard kehilangan statistik admin yang sebenarnya berhasil.

**(2)** Data manager analytics hanya dipakai untuk `revenue_trend` (grafik 7 hari). Seluruh payload lain (ringkasan, tren booking, performa tiket) diabaikan — request besar untuk satu seri.

```tsx
} catch (error: any) {
  console.error("Failed to load dashboard:", error);
}
```

**(1)** Error tidak ditampilkan ke UI. `stats` tetap null, sehingga semua kartu menampilkan "—" tanpa penjelasan dan tanpa tombol coba lagi. "—" bisa diartikan "tidak ada data", bukan "gagal memuat".

**(2)** `error` bertipe `any` padahal tidak dipakai; cukup `catch {}`.

```tsx
<StatGrid cols={3}>
  {[1, 2, 3, 4, 5, 6].map((i) => (
    <StatCard key={i} label="Loading..." value="—" icon={<Users className="h-4 w-4" />} />
  ))}
</StatGrid>
```

**(1)** Skeleton memakai `StatCard` asli dengan ikon `Users` untuk semua kartu, termasuk booking/pendapatan. Saat loading, ikonnya seragam; setelah data muncul, ikon berubah. Pergeseran visual kecil yang tidak perlu.

**(2)** Enam kartu dalam grid `cols={3}` menghasilkan dua baris; konsisten dengan tampilan akhir (6 kartu). Tidak ada layout shift tinggi.

```tsx
<StatCard label="Total Pengunjung" value={stats?.total_visitors...} ... />
<StatCard label="Pendapatan" value={stats?.revenue ? rupiah(stats.revenue) : "—"} ... />
```

**(1)** `stats?.revenue ? ... : "—"` menampilkan "—" ketika pendapatan **0**, bukan "Rp 0". Nol adalah nilai sah (belum ada penjualan) dan seharusnya ditampilkan sebagai Rp 0. Perbandingan truthy ini menyamakan 0 dengan tidak ada data.

**(2)** Kartu lain memakai `?.toLocaleString() ?? "—"`, yang benar untuk 0 (menampilkan "0"). Inkonsistensi perlakuan nol antar kartu.

**(3)** `total_bookings`, `total_tickets_sold`, `total_visitors`, `revenue` adalah angka **sepanjang waktu**, sedangkan `bookings_today`/`visitors_today` adalah hari ini. Subtitle "ringkasan data hari ini" menyesatkan untuk empat kartu pertama.

```tsx
<StatCard label="Pengunjung Hari Ini" value={...} delta="tiket untuk kunjungan hari ini" trend="up" icon={...} />
```

**(1)** `trend="up"` hardcoded menampilkan panah naik " ^ tiket untuk kunjungan hari ini" — delta ini bukan persentase perubahan, melainkan keterangan. Komponen `StatCard` merender `trend === "up" ? "^" : "v"` + delta, jadi terlihat seperti kenaikan.

**(2)** Tidak ada perbandingan dengan hari sebelumnya, sehingga panah naik tidak bermakna.

```tsx
<SectionCard title="Grafik Penjualan Tiket (7 Hari Terakhir)" ...>
  <LineChart data={sales} />
```

**(1)** Judul menyebut "Penjualan Tiket", tetapi `sales` berasal dari `revenue_trend` — **pendapatan**, bukan jumlah tiket. Sumbu Y tidak berlabel, jadi pembaca tidak tahu satuannya rupiah.

**(2)** `revenue_trend` tidak dibulatkan di sini (berbeda dari dashboard manager yang `Math.round`). Nilai pecahan (jika ada) diteruskan ke `LineChart`; tidak masalah untuk path, tetapi tooltip/legenda tidak ada.

### 9.41.2 `admin/notifications/page.tsx` (82 baris)

```tsx
const { data, isLoading, isError, refetch, isFetching } = useAuditFeed({ limit: 50 });
const logs = data?.items ?? [];
const total = data?.meta?.total ?? logs.length;
```

**(1)** Hanya 50 entri terbaru yang dimuat; `total` menunjukkan jumlah seluruh entri. Tidak ada paginasi atau "muat lebih banyak", sehingga aktivitas ke-51 ke belakang hanya bisa dilihat di halaman Audit Log.

**(2)** Karena memakai hook yang sama dengan audit log, keduanya berbagi cache query (`["audit", ...]`). Membuka Aktivitas lalu Audit Log tidak memicu request kedua untuk parameter yang sama — kecuali limit berbeda (50 vs 20), yang menghasilkan query terpisah.

**(3)** `isError` ditangani dengan pesan yang baik ("Gagal memuat feed aktivitas"), berbeda dari banyak halaman lain yang hanya console. Ini contoh penanganan error yang benar.

```tsx
function statusLabel(status: string): string {
  switch (status) {
    case "SUCCESS": return "Berhasil";
    case "FAILED": return "Gagal";
    case "ERROR": return "Bermasalah";
    default: return status;
  }
}
```

**(1)** Fungsi ini **duplikat** dari `statusLabel` di `admin/audit-log` (yang memakai array `STATUSES`). Dua implementasi untuk pemetaan yang sama; menambah status baru berarti menyunting dua file.

**(2)** `StatusPill` menerima label Indonesia yang cocok dengan peta warna untuk ketiganya. Konsisten.

```tsx
<p className="mt-0.5 text-sm text-[#698097]">
  {log.actor_role || "SYSTEM"} · {log.target_type || "-"}
  {log.target_id ? ` · ${log.target_id.slice(0, 8)}` : ""}
</p>
```

**(1)** Sama seperti audit log: aktor = peran, target = tipe + 8 karakter ID. Tidak ada nama pengguna, sehingga dua admin tidak terbedakan.

**(2)** Metadata (mis. alasan scan gagal) tidak ditampilkan di feed; hanya di audit log. Untuk "Aktivitas" yang ringkas ini mungkin disengaja, tetapi informasi penting bisa hilang.

**(3)** Badge sidebar admin memakai `meta.total` dari query `limit: 1` (9.15.2). Halaman ini memakai `meta.total` yang sama untuk subtitle. Tidak ada konsep "belum dibaca", jadi angka tidak pernah turun.

### 9.41.3 `(public)/e-ticket/page.tsx` (243 baris)

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("code");
  setIsNew(params.get("new") === "1");
  ...
  const res = await eTicketService.getByBookingId(q);
  if (res) setData(res); else setNotFound(true);
  ...
  catch { if (alive) setNotFound(true); }
```

**(1)** `code` dibaca dari query string di klien, sehingga halaman bisa dirender statis. Tidak ada validasi bentuk `code`; nilai apa pun diteruskan ke API.

**(2)** **Kegagalan jaringan/server disamakan dengan "tidak ditemukan".** `getByBookingId` menangkap semua error dan mengembalikan `null` (9.25.9), lalu halaman menampilkan "E-tiket tidak ditemukan — kode tidak valid atau belum diterbitkan". Pengguna dengan tiket sah bisa mengira tiketnya hilang saat backend sedang down.

**(3)** Jika pengguna belum login, endpoint mengembalikan 401 → `null` → "tidak ditemukan", bukan redirect ke login. Pengunjung yang membuka tautan e-tiket dari email di perangkat lain tidak mendapat jalan untuk masuk.

**(4)** `isNew` hanya untuk banner "Pembayaran berhasil" dan di-set oleh `PaymentPanel` (`&new=1`). Refresh halaman mempertahankan banner karena parameter tetap di URL; tidak ada pembersihan URL.

```tsx
const pdfTicket = { ...t, bookingId: t.booking_id, visitorName: t.visitor_name, ... };
const pdfBooking = { ...b, userId: b.user_id ?? null, ..., items: b.items.map(...) };
await downloadETicketPDF(pdfTicket as any, pdfBooking as any);
```

**(1)** Pemetaan snake_case → camelCase dilakukan manual di sini **dan** di `my-bookings-list` (dengan bentuk sedikit berbeda). Dua salinan yang harus diperbarui bersama; `as any` mematikan pemeriksaan sehingga ketidakcocokan baru ketahuan saat runtime.

**(2)** `b.items.map` mengasumsikan `items` selalu ada. Jika respons detail pembayaran tidak menyertakan items (mis. hanya `ticket` dan `booking` ringkas), ini melempar dan tertangkap `catch` → toast "Gagal mengunduh e-tiket" tanpa sebab jelas.

**(3)** `markDownloaded` dipanggil setelah PDF; kegagalan menandai unduhan membuat seluruh operasi dianggap gagal (catch), meski file sudah terunduh. Pengguna melihat toast error padahal PDF ada.

```tsx
const qrPayload = ticket.qr_data || ticket.id;
```

**(1)** QR memakai `qr_data` dari backend (JSON yang dikenali scanner) atau UUID tiket sebagai fallback. Ini konsisten dengan halaman Tiket Saya dan scanner (9.8).

**(2)** Di bawah QR, **payload mentah** dicetak: `{ticket.qr_data || ticket.id}` dalam `font-mono`. Jika `qr_data` berupa JSON `{"t":"...","b":"...","v":"..."}`, pengguna melihat string JSON panjang yang tidak berguna dan bisa membungkus baris. Yang biasanya dicetak adalah kode tiket singkat.

```tsx
<span className={`... ${statusTone[ticket.status] ?? "..."}`}>
  {ticket.status === "VALID" ? "Valid" : ticket.status === "USED" ? "Digunakan" : ticket.status === "EXPIRED" ? "Kadaluarsa" : "Dibatalkan"}
</span>
```

**(1)** Status tak dikenal (mis. `REFUNDED`) jatuh ke **"Dibatalkan"** — label yang salah, bukan sekadar default netral. Pola ternary tanpa fallback status asli berbahaya untuk status baru.

**(2)** `statusTone` memetakan empat status dengan warna yang benar; status di luar peta memakai biru default, tetapi labelnya sudah salah lebih dulu.

```tsx
<ul className="mt-2 space-y-2 text-sm">
  {booking.items.map((v) => (
    <li key={v.ticket_id} ...>{v.ticket_name} × {v.quantity} ... {rupiah(v.price * v.quantity)}</li>
  ))}
</ul>
```

**(1)** Rincian hanya menjumlahkan item; **biaya layanan tidak ditampilkan**, sedangkan "Total Pembayaran" (`booking.total`) sudah termasuk biaya 2%. Pengguna yang menjumlahkan baris akan menemukan selisih dan bisa mengira ditagih lebih.

**(2)** `key={v.ticket_id}` akan duplikat jika backend mengirim dua baris dengan jenis tiket yang sama (mis. penggabungan gagal). React akan memperingatkan dan salah mencocokkan DOM.

**(3)** Harga `${v.price * v.quantity}` memakai `rupiah` (benar untuk tiket), bukan `formatCurrency`. Konsisten dengan perbaikan bug #2.

```tsx
<button onClick={() => window.print()} ...>Cetak E-Tiket</button>
```

**(1)** `window.print()` mencetak **seluruh halaman**, termasuk navbar, footer, tombol, dan panel informasi. Tidak ada CSS `@media print` untuk menyembunyikan elemen non-tiket atau mengatur ukuran kertas, sehingga hasil cetak berantakan.

**(2)** Tombol "Download PDF" di atas adalah jalur cetak yang lebih baik; tombol print adalah alternatif cepat yang belum dipoles.

**(3)** Halaman client component ini tidak mengekspor `metadata`, sehingga judul tab mengikuti template root ("Beranda" default) — pengguna yang menyimpan halaman ke PDF dari browser mendapat judul generik.

**(4)** Layout dua kolom (`lg:grid-cols-[1.6fr_1fr]`) runtuh menjadi satu kolom di layar kecil. QR 160px + padding masih muat di ponsel 320px; teks payload JSON di bawahnya bisa overflow horizontal karena tidak ada `break-all`.
## 9.42 Halaman publik berbasis data — baris per baris

### 9.42.1 `(public)/about/page.tsx` (118 baris)

```tsx
export const dynamic = "force-dynamic";
export default async function AboutPage() {
  const destinationInfo = await destinationInfoService.getPublished();
```

**(1)** `force-dynamic` memastikan konten CMS selalu segar, tetapi setiap kunjungan menunggu backend; tidak ada `revalidate`.

**(2)** Tidak ada `try/catch`. Jika backend mati atau endpoint mengembalikan 500, **seluruh halaman** gagal render (error boundary/500), padahal halaman ini punya teks fallback untuk sejarah. Fallback hanya berguna jika `destinationInfo` null, dan service mengembalikan null hanya untuk 404 — bukan untuk gangguan server.

```tsx
<p className="mt-4 text-sm leading-relaxed text-[#29445e]">
  {destinationInfo?.history || "Kawah Putih merupakan danau kawah vulkanik ..."}
</p>
```

**(1)** Fallback panjang ditulis inline; konten ini juga ada di `lib/content` (dipakai beranda). Dua salinan teks yang bisa berbeda saat salah satu diperbarui.

**(2)** `||` membuat string kosong dari CMS jatuh ke fallback — masuk akal untuk teks sejarah.

```tsx
{destinationInfo ? [
  { key: "fasilitas", ... body: destinationInfo.additional_info || destinationInfo.description },
  { key: "informasi", ... body: destinationInfo.destination_desc || destinationInfo.description },
  { key: "aturan", body: "Jaga kebersihan kawasan, ikuti jalur yang tersedia, dilarang berenang, ..." },
].map((s, i) => { ... }) : ("")}
```

**(1)** Jika `destinationInfo` null, bagian ini merender **heading "Fasilitas & Informasi" + paragraf pengantar + grid kosong**. Pengunjung melihat judul tanpa isi. Fallback `""` hanya mengganti grid, bukan menyembunyikan section.

**(2)** Butir "Aturan Kunjungan" **hardcoded**, padahal backend punya `visitor-rule` yang dikelola admin (9.35.2). Perubahan aturan di CMS tidak muncul di halaman Tentang. Ini sumber kontradiksi konten.

**(3)** `additional_info` (fasilitas) dipetakan ke kartu "Fasilitas" dan `destination_desc` ke "Informasi Destinasi" — dua field dengan makna yang mudah tertukar. Tidak ada validasi panjang; teks panjang memenuhi kartu tanpa `line-clamp`.

**(4)** `SECTION_ICONS[i] ?? Info` aman karena array tetap 3 item; jika nanti butir keempat ditambah tanpa ikon, otomatis `Info`.

```tsx
{destinationInfo.location && (<p ...>{destinationInfo.location}</p>)}
{destinationInfo.contact && (<p ...>{destinationInfo.contact}</p>)}
```

**(1)** Lokasi dan kontak dirender sebagai teks biasa. Tidak ada tautan `tel:`, `mailto:`, atau peta; pengguna ponsel tidak bisa menekan nomor.

**(2)** Ketiga blok grid memakai `md:grid-cols-2`; jika hanya satu field terisi, kartu lain kosong dan tidak ada placeholder.

**(3)** Gambar kiri adalah gradien dekoratif (`bg-gradient-to-br ...`), bukan foto destinasi. Secara visual aman, tetapi tidak informatif.

### 9.42.2 `(public)/facilities/page.tsx` (83 baris)

```tsx
const facilities = await facilityService.listPublished();
```

**(1)** Sama seperti About: tanpa `try/catch`, kegagalan backend = halaman error. Bedanya, di sini tidak ada konten fallback sama sekali.

**(2)** `listPublished` mengembalikan semua fasilitas tanpa batas; jika admin menambah puluhan, satu request memuat semuanya. Untuk halaman statis ini masih wajar, tetapi tidak ada paginasi.

```tsx
const ICON_MAP: Record<string, typeof Car> = { car: Car, coffee: Coffee, ... };
const Icon = ICON_MAP[facility.icon.toLowerCase()] || Info;
```

**(1)** Kunci peta huruf kecil, dan input di-`toLowerCase()` — cocok dengan nilai yang disimpan form admin (`car`, `coffee`, ...). Ikon tak dikenal jatuh ke `Info`.

**(2)** Jika `facility.icon` null/undefined (data lama sebelum kolom ikon diisi), `.toLowerCase()` melempar `TypeError` dan **seluruh halaman gagal** — satu baris buruk menjatuhkan daftar. Seharusnya `(facility.icon ?? "")`.

**(3)** Peta berisi 10 ikon; menambah opsi di form admin tanpa memperbarui peta ini menghasilkan `Info` diam-diam.

```tsx
facilities.length === 0 ? (<p ...>Belum ada fasilitas yang dipublikasikan.</p>) : (...)
```

**(1)** Pesan kosong membedakan "tidak ada data" dari error — bagus, tetapi error tidak pernah sampai ke sini karena sudah melempar di atas.

```tsx
<p ...>{facility.description || "Tidak ada deskripsi"}</p>
```

**(1)** Placeholder "Tidak ada deskripsi" tampil ke publik. Lebih rapi menyembunyikan paragraf jika kosong daripada mengumumkan ketiadaan konten.

**(2)** `image_url` fasilitas tidak ditampilkan sama sekali, padahal backend menyimpannya. Halaman fasilitas hanya teks + ikon.

### 9.42.3 `(public)/faq/page.tsx` (54 baris)

```tsx
const faqs = await faqService.listPublished();
...
<FaqAccordion items={faqs} />
```

**(1)** Tanpa `try/catch`; error backend = halaman 500.

**(2)** Tidak ada penanganan daftar kosong: `FaqAccordion` merender wrapper kosong, sementara sidebar ajakan tetap tampil. Pengunjung melihat halaman tanpa pertanyaan dan tanpa penjelasan.

**(3)** `items` diteruskan apa adanya; `FaqAccordion` (9.35.1) memakai `item.id` sebagai key dan mengandalkan `question`/`answer`. Bila API mengirim field berbeda (mis. `q`/`a`), accordion kosong tanpa error tipe karena tipe `Faq` dipakai bersama.

```tsx
<Link href="/contact" ...>Hubungi Kami</Link>
```

**(1)** Tujuan `/contact` masih placeholder lima baris (dibahas di 9.15). Ajakan bantuan mengarah ke halaman kosong — jalur buntu yang terlihat resmi.

**(2)** Sidebar `lg:sticky lg:top-24`; tinggi aside lebih pendek dari daftar FAQ, jadi menempel saat scroll. Tidak ada `max-h`/scroll internal, aman karena isinya pendek.

### 9.42.4 `(public)/gallery/page.tsx` (28 baris)

```tsx
const items = await galleryService.list({ limit: 30 });
```

**(1)** Batas 30 foto, **tanpa paginasi**. Galeri ke-31 dan seterusnya tidak pernah tampil di publik meski ada di CMS. Tidak ada indikator "30 dari N".

**(2)** Tanpa `try/catch`; backend mati = halaman error.

```tsx
<Image src={item.image_url} alt={item.title} fill className="object-cover transition hover:scale-105" />
```

**(1)** `next/image` dengan `fill` membutuhkan induk `relative` (sudah ada) dan domain yang diizinkan di `next.config`. URL eksternal dari CMS (mis. Supabase/Cloudinary) yang tidak terdaftar membuat gambar gagal dimuat saat runtime.

**(2)** `alt={item.title}` bisa kosong; gambar dekoratif dengan alt kosong sebaiknya `alt=""`, sedangkan foto galeri butuh deskripsi. Judul tidak pernah ditampilkan sebagai caption.

**(3)** `hover:scale-105` tanpa `hover:` pada perangkat sentuh = tidak ada efek; bukan masalah, hanya dekorasi.

**(4)** Tidak ada lightbox/klik untuk memperbesar. Grid `aspect-square` memotong foto lanskap; tidak ada halaman detail.

**(5)** Metadata `title: "Galeri"` sudah benar; ini satu-satunya halaman publik besar yang punya metadata lengkap dan sederhana.

### 9.42.5 `(public)/articles/page.tsx` (35 baris)

```tsx
"use client";
export default function ArticlesPage() {
  const { data, isLoading, isError } = useArticles({ status: "published", limit: 20 });
```

**(1)** Client component dipilih agar perubahan CMS langsung terlihat tanpa build (komentar di berkas). Konsekuensinya: **tidak ada metadata/SEO**, halaman kosong saat JS gagal, dan data artikel tidak bisa di-crawl dengan baik — kerugian besar untuk konten artikel.

**(2)** `limit: 20` tanpa paginasi; artikel ke-21 tidak tampil.

**(3)** Tiga state ditangani: loading, error, kosong — lebih baik daripada Facilities/FAQ yang membiarkan error melempar. Namun pesan error memakai warna netral, bukan merah, sehingga terlihat seperti informasi biasa.

```tsx
{a.published_at && <p ...>{formatDate(new Date(a.published_at * 1000).toISOString())}</p>}
```

**(1)** Backend mengirim `published_at` sebagai **unix detik** (`*int64` di `dto.go`), jadi `* 1000` benar. Jika suatu saat berubah ke RFC3339, `NaN` → `toISOString()` melempar `RangeError` dan seluruh daftar jatuh.

**(2)** `formatDate` menerima string ISO; konversi dua langkah ini bisa diganti `formatDate(new Date(ts * 1000))` bila helper menerima Date.

**(3)** `line-clamp-2` pada excerpt memotong teks tanpa elipsis eksplisit (bergantung plugin Tailwind). Tidak ada gambar sampul, kategori, atau penulis — daftar sangat polos dibanding galeri/beranda.

### 9.42.6 `(public)/articles/[id]/page.tsx` (36 baris)

```tsx
const params = useParams<{ id: string }>();
const id = typeof params?.id === "string" ? params.id : "";
const { data: article, isLoading, isError } = useArticle(id);
```

**(1)** `useParams` mengembalikan `string | string[]`; penjagaan tipe benar. `id` kosong akan memanggil endpoint dengan path kosong — bergantung service, bisa 404 (ditangani) atau error.

**(2)** `useArticle(id)` berjalan bahkan saat `id` kosong. Tidak ada `enabled` (React Query tidak dipakai di sini), jadi tetap ada satu request sia-sia.

```tsx
if (isError || !article || article.status !== "published") {
```

**(1)** Error jaringan dan artikel belum terbit sama-sama menjadi **"Artikel tidak ditemukan"**. Pembaca tidak tahu apakah tautan salah atau server bermasalah.

**(2)** Pemeriksaan `status !== "published"` di klien adalah lapis kedua; backend seharusnya sudah menolak draf. Tetap berguna, tetapi berarti draf bisa terkirim ke publik lewat API.

```tsx
<div className="prose prose-slate dark:prose-invert max-w-none whitespace-pre-line">{article.content}</div>
```

**(1)** Konten dirender sebagai **teks biasa** dengan `whitespace-pre-line`; kelas `prose` tidak berpengaruh pada teks non-HTML. Jika admin menulis Markdown (`**tebal**`, `## judul`, tautan), tanda tersebut tampil literal.

**(2)** Tidak ada sanitasi karena tidak memakai `dangerouslySetInnerHTML` — aman dari XSS, tetapi kehilangan format. Ini trade-off yang harus diputuskan: Markdown parser + sanitizer, atau editor teks kaya.

**(3)** Tanggal terbit dan penulis tidak ditampilkan di detail, padahal ada di daftar. Tidak ada tombol kembali di bagian bawah, hanya di state error.

**(4)** Tidak ada `generateMetadata`; judul tab tidak memakai judul artikel. Untuk halaman konten, ini kerugian SEO yang nyata karena seluruhnya client-side.
## 9.43 Komponen paket dan alur booking/payment — baris per baris

### 9.43.1 `features/destination/components/package-card.tsx` (31 baris)

```tsx
// Ditautkan lewat `id`, bukan `slug`: domain package backend hanya mengekspos FindByID, bukan FindBySlug.
export function PackageCard({ pkg }: { pkg: TourismPackage }) {
  return <Link href={`/packages/${pkg.id}`}>
```

**(1)** Keputusan routing memakai UUID didokumentasikan di komentar. Konsekuensinya: URL tidak ramah SEO (`/packages/9f3c...`), tidak bisa ditebak, dan berubah jika data dimigrasikan. `slug` dikirim API tetapi tidak dipakai — setengah data mati.

**(2)** Seluruh kartu adalah `<Link>`, sehingga tidak ada elemen interaktif lain di dalamnya. Ini benar; menambahkan tombol wishlist di dalamnya nanti akan membuat `<button>` bersarang di `<a>` (HTML tidak valid) dan perlu restrukturisasi.

```tsx
<Image src={pkg.cover_image} alt={pkg.name} fill className="object-cover transition group-hover:scale-105" />
```

**(1)** `fill` memerlukan induk `relative` (ada) dan domain gambar terdaftar di `next.config`. Gambar dari CMS dengan host baru akan gagal tanpa pesan jelas.

**(2)** `sizes` tidak diberikan. Dengan `fill`, Next memakai `100vw` default; di grid tiga kolom browser mengunduh gambar lebih besar dari kebutuhan — pemborosan bandwidth pada halaman beranda.

```tsx
<span ...><Clock ... /> {pkg.duration_hours} jam</span>
<span ...>{formatCurrency(pkg.price_cents, pkg.currency)}</span>
```

**(1)** `formatCurrency` di sini **benar** karena harga paket memang dalam sen (berbeda dari tiket yang memakai rupiah utuh — lihat bug #2). Dua satuan dalam satu aplikasi tetap menjadi sumber kesalahan.

**(2)** `duration_hours` 0 atau null akan tampil "0 jam"/"null jam". Tidak ada penyembunyian untuk nilai kosong.

**(3)** Harga tidak diberi keterangan "per orang". Untuk paket wisata, iniambigu; pengguna bisa mengira harga total rombongan.

### 9.43.2 `features/destination/components/home-packages.tsx` (26 baris) dan `packages-list.tsx` (31 baris)

```tsx
const { data, isLoading, isError } = usePackages({ active_only: true, limit: 6 });
if (isLoading) return <CardGridSkeleton count={3} />;
if (isError) return <EmptyState title="Gagal memuat paket" description="Coba muat ulang halaman." />;
```

**(1)** `HomePackages` meminta 6 paket tetapi skeleton hanya 3 kartu. Saat data datang, grid tumbuh dari satu baris menjadi dua — layout shift yang terlihat.

**(2)** Pesan error menyuruh "coba muat ulang halaman" tanpa tombol muat ulang. React Query sudah melakukan retry default 3 kali; setelah itu pengguna hanya bisa refresh manual.

**(3)** `isError` tidak membedakan 401/500/jaringan. Untuk halaman publik, kegagalan backend berarti seluruh bagian paket hilang, sementara sisa beranda tetap tampil — bisa disalahartikan sebagai "belum ada paket".

**(4)** `packages-list` identik kecuali `limit: 9` dan skeleton 9. Duplikasi ~20 baris; perbedaan satu angka. Keduanya juga tidak menampilkan jumlah total atau paginasi: paket ke-7 (beranda) dan ke-10 (daftar) tidak pernah muncul. `space-y-8` di `packages-list` membungkus satu anak sehingga tidak berpengaruh.

**(5)** Kedua komponen client-side; daftar paket tidak di-SSR. Halaman `/packages` karena itu kosong di HTML awal — buruk untuk SEO katalog.

### 9.43.3 `app/(public)/booking/page.tsx` (38 baris)

```tsx
<Suspense fallback={<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]"> ... </div>}>
  <BookingOrderForm />
</Suspense>
```

**(1)** `Suspense` diperlukan karena `BookingOrderForm` memakai `useSearchParams`; tanpa itu build Next gagal/route menjadi dinamis. Fallback meniru dua kolom dengan tinggi 72 — cukup mirip, tetapi tidak memakai skeleton yang sama dengan form asli.

**(2)** Halaman tidak menampilkan indikator langkah (Pilih tiket → Data → Bayar). Pengguna yang tiba dari `/packages` tidak tahu ada berapa tahap lagi.

**(3)** `metadata` sudah benar (`title`, `description`), tetapi tidak ada `robots: noindex`. Halaman transaksional dengan query `date`/`ticket` sebaiknya tidak diindeks.

**(4)** Tidak ada guard login di level halaman; `BookingOrderForm` yang menangani (mengarahkan ke login atau meminta data tamu). Pembagian tanggung jawab ini tidak terlihat dari halaman.

### 9.43.4 `app/(public)/payment/page.tsx` (24 baris)

```tsx
export default async function PaymentPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (... <PaymentPanel code={code} /> ...);
```

**(1)** Tipe `searchParams` sebagai `Promise` sesuai Next 15; `await` benar. `code` bisa `undefined`, dan `PaymentPanel` menampilkan "Pesanan tidak ditemukan" — state yang wajar, meski pesannya menyiratkan kode salah padahal kode tidak ada.

**(2)** `searchParams` membuat route dinamis; tidak ada `dynamic` eksplisit, tetapi akses `searchParams` sudah memaksa render per-request.

**(3)** Sama seperti booking: metadata ada, `noindex` tidak. Halaman pembayaran dengan kode booking bisa terindeks jika tautannya bocor.

**(4)** Tidak ada `Suspense`; `PaymentPanel` client component dimuat sebagai bagian bundel halaman. Tidak masalah karena tidak memakai hook navigasi yang menuntut Suspense.

### 9.43.5 `features/public/components/payment-panel.tsx` (kira-kira 380 baris)

```tsx
function isSafePaymentUrl(raw: string | undefined): raw is string {
  try { return new URL(raw).protocol === "https:"; } catch { return false; }
}
```

**(1)** Hanya `https:` yang diterima — keputusan keamanan yang benar untuk tautan gateway. `javascript:`/`data:` ditolak. Tautan dibuka `target="_blank"` + `rel="noopener noreferrer"`.

**(2)** URL http (mis. gateway sandbox lokal) akan jatuh ke panel instruksi generik, bukan ditampilkan sebagai tautan. Tidak ada pesan "tautan tidak aman"; pengguna hanya melihat instruksi tanpa tombol.

```tsx
const b = await bookingService.getById(code);
const p = await paymentService.getByBookingId(code);
...
} catch { if (alive) setPhase("NOT_FOUND"); }
```

**(1)** Dua request **berurutan**, padahal tidak saling bergantung; bisa `Promise.all` untuk memotong satu round-trip.

**(2)** Error jaringan, 401, 500, dan kode tidak valid semuanya menjadi **NOT_FOUND** dengan teks "Kode booking tidak valid atau pesanan sudah diproses". Sama seperti e-tiket: gangguan server disalahartikan sebagai kesalahan pengguna.

**(3)** Jika `paymentService.getByBookingId` gagal tetapi booking berhasil, seluruh halaman gagal — pembayaran tidak bisa dilanjutkan meski data booking ada.

```tsx
setPhase(b?.status === "PENDING" ? "WAITING" : b?.status === "PAID" || b?.status === "CONFIRMED" || b?.status === "USED" ? "SUCCESS" : "FAILED");
```

**(1)** Status selain ketiga itu — termasuk `CANCELLED`, `EXPIRED`, dan status baru — jatuh ke **FAILED**. `EXPIRED` seharusnya memetakan ke fase `EXPIRED` agar tombolnya "Buat Pesanan Baru", bukan "Coba Bayar Lagi".

**(2)** `USED` dianggap SUCCESS; secara alur masuk akal (tiket sudah dipakai berarti sudah dibayar), tetapi pesan "Pembayaran Berhasil!" muncul saat pengguna membuka kembali booking lama.

```tsx
useEffect(() => {
  if (!payment || phase !== "WAITING") return;
  const tick = () => {
    const left = Math.max(0, Math.floor((new Date(payment.expired_at).getTime() - Date.now()) / 1000));
    setCountdown(left);
    if (left === 0) { setPhase("EXPIRED"); paymentService.expirePayment(payment.booking_id).catch(() => {}); }
  };
```

**(1)** Jika `expired_at` tidak ada/formatnya tidak dikenali, `getTime()` = `NaN`; `Math.max(0, NaN)` = `NaN`, `left === 0` tidak pernah benar, dan tampilan menjadi **"Bayar dalam NaN:NaN"** selamanya. Tidak ada penjagaan `Number.isFinite`.

**(2)** Kedaluwarsa ditentukan **di klien**, lalu klien memanggil endpoint `expirePayment`. Dua masalah: jam perangkat bisa salah (countdown habis lebih cepat/lambat), dan klien diberi wewenang mengekspire transaksi. Backend tetap harus memvalidasi; kalau tidak, ini celah.

**(3)** Saat `left === 0`, `setPhase("EXPIRED")` menghentikan interval lewat cleanup, tetapi `expirePayment` dipanggil setiap tick terakhir — hanya sekali karena efek berhenti. Aman dari spam.

**(4)** Tidak ada polling status pembayaran. Jika pengguna menyelesaikan pembayaran di tab gateway lalu kembali, status di server mungkin masih `PENDING` sampai webhook masuk; halaman akan menampilkan countdown/habis dan menawarkan bayar lagi, bukan "menunggu konfirmasi".

```tsx
const res = await paymentService.processPayment({ booking_id: booking.id, method });
if (res.outcome === "SUCCESS") { ... setTimeout(() => router.push(`/e-ticket?code=${res.booking.id}&new=1`), 1200); }
```

**(1)** `pay()` tidak mengunci (`if (phase === "PROCESSING") return`), tetapi karena `setPhase("PROCESSING")` sinkron dan tombol hanya dirender pada `WAITING`, klik ganda praktis tidak mungkin. Tetap lebih aman memakai ref/guard eksplisit.

**(2)** `setTimeout` 1,2 detik tidak dibersihkan saat unmount; jika pengguna menekan "Lihat E-Tiket" lebih dulu, `router.push` kedua tetap berjalan ke tujuan yang sama — tidak berbahaya, tetapi timer yatim.

**(3)** `res.outcome === "FAILED"` mengubah fase ke FAILED dan menampilkan "Coba Bayar Lagi". Tombol itu memanggil `pay()` lagi tanpa memilih ulang metode; jika kegagalan disebabkan metode tidak tersedia, percobaan berikutnya gagal sama.

**(4)** `catch` mengembalikan fase ke WAITING tetapi tidak menyegarkan `payment`; `expired_at` yang sudah lewat akan langsung memicu EXPIRED pada tick berikutnya. Perilaku ini benar, meski toast "Pembayaran gagal" langsung disusul "kadaluarsa" membingungkan.

```tsx
{booking.items.map((v) => (<li key={v.ticket_id}> ... {rupiah(v.price * v.quantity)}</li>))}
```

**(1)** Ringkasan menampilkan item, subtotal, biaya layanan, dan total — **lengkap**, berbeda dari e-tiket yang menghilangkan biaya layanan. Konsistensi antar halaman belum seragam.

**(2)** `key={v.ticket_id}` berisiko duplikat seperti di e-tiket.

**(3)** `booking.subtotal`/`service_fee`/`total` dipercaya dari server; tidak dihitung ulang di klien. Untuk halaman pembayaran ini benar — angka tagihan harus berasal dari server, bukan dari state browser.

### 9.43.6 `features/public/components/faq-accordion.tsx` (47 baris)

```tsx
const [open, setOpen] = useState<number | null>(0);
...
items.map((item, i) => { const isOpen = open === i; ... })
```

**(1)** State menyimpan **indeks**, bukan `item.id`. Jika daftar difilter/diurutkan ulang (mis. filter kategori di masa depan), item yang terbuka berpindah ke pertanyaan lain. Menggunakan `item.id` lebih stabil.

**(2)** `0` membuat item pertama selalu terbuka saat mount, termasuk ketika `items` masih kosong lalu terisi — tidak masalah karena state tetap 0.

```tsx
<button onClick={...} aria-expanded={isOpen}>
```

**(1)** `aria-expanded` sudah ada, tetapi tidak ada `aria-controls`/`id` pada panel jawaban, dan tidak ada `role="region"`/heading. Pembaca layar tahu tombol mengembang, tetapi tidak tahu panel mana yang dikendalikan.

**(2)** Tombol tidak memiliki `type="button"`. Di dalam `<form>` (saat ini tidak), ini akan men-submit form.

**(3)** Hanya satu item yang bisa terbuka (`open` tunggal). Accordion FAQ sering mengizinkan beberapa terbuka; ini pilihan desain, bukan bug.

**(4)** Panel jawaban dirender kondisional (`{isOpen && <p>}`), bukan disembunyikan; tidak ada animasi tinggi. Untuk daftar pendek ini baik untuk aksesibilitas (tidak ada konten tersembunyi yang terbaca).

### 9.43.7 `components/ui/confirm-dialog.tsx` (80 baris)

```tsx
useEffect(() => {
  if (!open) return;
  const onKey = (e) => { if (e.key === "Escape" && !loading) onCancel(); };
  document.body.style.overflow = "hidden";
  return () => { ...; document.body.style.overflow = ""; };
}, [open, loading, onCancel]);
```

**(1)** `onCancel` biasanya fungsi inline di pemanggil, sehingga **efek dijalankan ulang setiap render** — listener dilepas/dipasang terus, dan `overflow` di-set ulang. Tidak salah, tetapi boros; `useCallback` di pemanggil atau ref untuk callback akan menghilangkannya.

**(2)** Cleanup mengembalikan `overflow` ke `""`, bukan ke nilai sebelumnya. Jika dialog dibuka saat body sudah `overflow: hidden` (mis. drawer lain), penutupan dialog justru membuka scroll.

```tsx
<div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 ..." onClick={...}>
```

**(1)** Tidak ada **focus trap**: Tab bisa keluar ke elemen di belakang overlay. `aria-modal="true"` menjanjikan modal, tetapi perilaku fokus belum memenuhinya.

**(2)** Fokus awal tidak dipindahkan ke dialog; pengguna keyboard tetap di tombol pemicu di belakang. Setelah dialog ditutup, fokus tidak dikembalikan secara eksplisit (bergantung browser).

**(3)** Tidak memakai portal. `fixed` + `z-50` cukup selama tidak ada leluhur dengan `transform`/`filter`/`overflow: hidden`; di dalam tabel/grid berlebar terbatas, dialog bisa terpotong atau tertutup elemen lain.

**(4)** Klik overlay membatalkan, termasuk saat pengguna menyeret seleksi teks dari dalam kartu ke luar lalu melepas — mouseup di overlay dihitung klik dan dialog tertutup. Perilaku umum, tetapi bisa menjengkelkan.

**(5)** Ikon selalu `Trash2` merah meski `confirmLabel` bukan hapus (mis. "Publikasikan"). Dialog generik dengan ikon khusus hapus.

**(6)** Saat `loading`, tombol batal dan konfirmasi dinonaktifkan, Escape diabaikan, overlay tidak menutup — perilaku yang benar untuk mencegah double-submit.
## 9.44 Store, hook, dan komponen UI dasar — baris per baris

### 9.44.1 `store/booking.store.ts` (32 baris)

```ts
export interface BookingDraft { visitDate: string; items: {...}[]; visitorName: string; email: string; phone: string; note?: string; totals: {...}; }
...
draft: null, lastBookingId: null, setDraft, setLastBookingId, clear
```

**(1)** Komentar menyebut draft "membawa pemesanan melewati alur multi-halaman", tetapi **`draft` tidak pernah dibaca** di mana pun — satu-satunya pemakaian adalah `setDraft` di `booking-order-form.tsx` (baris 47). `lastBookingId` juga tidak dipakai. Store ini menulis state yang tidak dikonsumsi siapa pun.

**(2)** Karena tidak dipersist, refresh di tengah alur menghapus draft. Alur sebenarnya tetap berjalan karena `PaymentPanel` memuat booking dari API berdasarkan `?code=`, bukan dari store. Jadi store ini redundan, bukan penopang alur.

**(3)** Tipe `totals` menduplikasi hasil `calculateBookingTotals` (subtotal, serviceFee, discount, tax, total, totalTickets). Jika bentuk perhitungan berubah, tipe ini harus ikut diperbarui meski tidak dipakai.

**(4)** `clear()` mengosongkan keduanya; tidak dipanggil setelah pembayaran berhasil, sehingga jika nanti draft dipakai, data lama bisa muncul untuk pemesanan berikutnya.

### 9.44.2 `store/language.store.ts` (19 baris)

```ts
language: "id" | "en"; setLanguage; persist(..., { name: "kpr-language" })
```

**(1)** Hanya menyimpan preferensi; **tidak ada satu pun komponen yang membacanya** (grep `useLanguageStore` hanya menemukan definisi). Tidak ada toggle di navbar, tidak ada kamus terjemahan. Fitur multi-bahasa belum ada — store ini adalah placeholder.

**(2)** `persist` memakai localStorage tanpa `version`/`migrate`. Jika nilai lama tidak valid (mis. `"fr"`), tipe TypeScript tidak melindungi saat runtime dan nilai itu diteruskan apa adanya.

**(3)** `setLanguage` tersedia tetapi tak terpakai; tidak ada efek samping `document.documentElement.lang`. Jika nanti dipakai, atribut `lang` halaman tetap `id` sampai diperbarui manual.

### 9.44.3 `store/theme.store.ts` (20 baris) + `providers/theme-provider.tsx` (15 baris)

```ts
theme: "light" | "dark"; toggle; persist(..., { name: "kpr-theme" })
```

```tsx
useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);
return <>{children}</>;
```

**(1)** Kelas `dark` baru diterapkan **setelah mount**. Pengguna bermode gelap melihat kilatan putih (FOUC) setiap memuat halaman. Solusi umum: skrip inline di `<head>` yang membaca localStorage sebelum paint, atau cookie + kelas dari server.

**(2)** `toggle()` membaca `get().theme`; aman. Tidak ada sinkronisasi dengan `prefers-color-scheme`, jadi pengguna yang belum pernah memilih selalu mendapat terang.

**(3)** `persist` menghidrasi secara asinkron; `theme` awal selalu `"light"`, sehingga efek pertama bisa menghapus kelas `dark` yang sempat dipasang skrip lain. Tidak ada `skipHydration`/`onRehydrateStorage`.

**(4)** Tidak ada tombol tema di navbar publik yang saya baca (9.31); jika tidak ada UI pemanggil `toggle`, mode gelap hanya bisa aktif lewat localStorage manual. Perlu dikonfirmasi di panel — tapi store-nya berfungsi jika dipanggil.

### 9.44.4 `store/wishlist.store.ts` (28 baris)

```ts
// Sama seperti notification.store.ts: ... belum ada modul backend.
packageIds: string[]; toggle; isSaved; persist name "kpr-wishlist"
```

**(1)** Komentar merujuk `notification.store.ts` yang **tidak ada** di proyek — komentar usang dari versi sebelumnya.

**(2)** `toggle` membuat array baru (immutable) — benar untuk React. `isSaved` memakai `get()`, sehingga tidak reaktif bila dipanggil di dalam render tanpa berlangganan `packageIds`; pemakaian yang benar adalah `useWishlistStore((s) => s.packageIds.includes(id))`.

**(3)** Tidak ada komponen yang memakai store ini (grep hanya definisi). Tidak ada tombol simpan di `PackageCard`, tidak ada halaman wishlist. Fitur FR-032 belum terlihat di UI.

**(4)** ID paket disimpan sebagai UUID sehingga wishlist bertahan meski paket dihapus; tidak ada pembersihan, dan tidak ada validasi bahwa paket masih aktif saat ditampilkan nanti.

### 9.44.5 Hook data: `use-destinations`, `use-articles`, `use-faq`, `use-facility`, `use-gallery`, `use-visitor-rule`, `use-destination-info`

```ts
useQuery({ queryKey: ["packages", params], queryFn: () => destinationService.list(params) })
useQuery({ queryKey: ["packages", id], queryFn: () => destinationService.get(id), enabled: !!id })
```

**(1)** Pola tujuh berkas hook hampir identik: list dengan key `[domain, params]`, detail `[domain, id]`, lalu create/update/delete yang meng-invalidate `[domain]`. Konsisten dan mudah ditebak — nilai plus.

**(2)** Key list memakai **objek params** sebagai bagian key. React Query mem-hash secara struktural, jadi `{page:1}` dan `{limit:20,page:1}` menghasilkan key berbeda meski semantiknya bisa sama. Ini benar (parameter berbeda = data berbeda), tetapi invalidasi `[domain]` menyapu semua variasi — boros refetch.

**(3)** Detail `[domain, id]` dan daftar `[domain, params]` berada di ruang key yang sama. Tidak bentrok selama `id` string dan `params` objek, tetapi rawan: `usePublishedFAQList` memakai `["faq","published",category]`, dan `useFAQ("published")` secara teori akan bertabrakan. UUID membuat ini mustahil saat ini.

**(4)** Tidak ada `staleTime` di hook konten (FAQ, fasilitas, galeri, paket), jadi setiap mount/refocus memicu fetch ulang. Untuk halaman publik yang jarang berubah, `staleTime` 1–5 menit akan mengurangi beban tanpa risiko data basi berarti. `useManagerAnalytics` satu-satunya yang memakai `staleTime: 5_000` (justru sangat pendek untuk analytics).

**(5)** `usePackages`/`useGallery`/`useFacilityList` meneruskan `params` apa adanya ke service; tidak ada normalisasi. Jika komponen memanggil dengan objek baru setiap render, key berubah hanya bila nilai berubah (hash struktural), jadi aman.

**(6)** `useDestinationInfoList` dan `useDestinationInfo(id)` memakai key `["destination-info", params]` vs `["destination-info", id]`; `usePublishedDestinationInfo` memakai `["destination-info","published"]`. Sama seperti di atas: konvensi "published" sebagai id cadangan.

**(7)** Semua mutation hanya meng-invalidate; tidak ada `setQueryData` optimistis. Akibatnya setelah simpan/hapus, tabel berkedip dan memuat ulang. Untuk panel admin dengan data kecil ini dapat diterima, tetapi terasa lambat pada koneksi jelek.

**(8)** Tidak ada penanganan error terpusat di hook. Setiap komponen harus memeriksa `isError`; praktiknya banyak yang lupa (temuan 9.24–9.42).

### 9.44.6 `hooks/use-analytics.ts` (19 baris)

```ts
export type DateRangePreset = "today" | "7d" | "30d" | "month" | "custom";
useQuery({ queryKey: ["manager","analytics", range, custom?.from, custom?.to], ... staleTime: 5_000 })
```

**(1)** `custom` diteruskan hanya jika `range === "custom"`; jika `range` lain dan `custom` terisi, key tetap memuat from/to sehingga cache terpecah tanpa alasan.

**(2)** Tidak ada validasi bahwa `custom.from <= custom.to` atau format tanggal. Backend yang menolak akan tampil sebagai error generik.

**(3)** `staleTime` 5 detik membuat setiap perpindahan tab memicu refetch; untuk dashboard yang di-refresh manual ini hampir sama dengan tanpa cache. Tidak ada `keepPreviousData`, jadi grafik kosong sekejap saat rentang diganti.

### 9.44.7 `hooks/use-audit.ts` (24 baris)

```ts
queryKey: ["admin","audit", page??1, limit??20, action??"", target_type??"", status??"", from??"", to??""]
```

**(1)** Key diratakan menjadi nilai primitif — bagus, stabil, dan mudah di-invalidate. Berbeda dari hook domain yang memakai objek params.

**(2)** Default `page=1`, `limit=20` di key dan di request; halaman Aktivitas meminta 50 sehingga key berbeda. Konsisten.

**(3)** `staleTime: 10_000` masuk akal untuk feed audit, meski audit biasanya butuh kesegaran; tombol "Muat ulang" memaksa refetch.

### 9.44.8 `hooks/use-admin-users.ts` (19 baris)

```ts
useStaff(): ["admin","staff"] -> staffService.list()
useVisitors(): ["admin","visitors"] -> visitorService.list()
```

**(1)** `staffService.list()`/`visitorService.list()` tanpa parameter: seluruh data dalam satu request. Untuk data pengunjung yang bertambah setiap hari, ini akan menjadi masalah nyata (payload besar, render tabel panjang) tanpa paginasi.

**(2)** Tipe generik `useQuery<Staff[]>` mengasumsikan service mengembalikan array, bukan `{items,meta}`. Jika backend menambahkan envelope paginasi, hook ini perlu diubah di satu tempat — baik.

**(3)** Tidak ada `staleTime`; membuka halaman users lalu visitors lalu kembali memicu fetch ulang setiap kali.

### 9.44.9 `hooks/use-auth.ts` (kira-kira 108 baris)

```ts
export function useLogin(options?: { redirectTo?: string }) {
  ...
  const target = safeRedirectPath(creds.redirectTo ?? redirectTo ?? readRedirectParam(), result.redirectTo);
```

**(1)** Urutan prioritas: tujuan eksplisit pemanggil → opsi hook → `?redirect=` → default role. `safeRedirectPath` menolak URL eksternal. Logikanya benar dan terpusat.

**(2)** `readRedirectParam()` membaca `window.location.search` saat login dijalankan, bukan saat hook dirender. Jika pengguna sudah berada di `/login?redirect=...`, nilainya benar; tetapi jika `useLogin` dipanggil dari halaman lain (mis. modal), query halaman itu yang terbaca, bukan halaman login.

**(3)** `useLogin` mengembalikan `{ok:false,error}` alih-alih melempar; form harus memeriksa hasil. Ini pola yang konsisten di `useRegister`/`useChangePassword`, tetapi berbeda dari service yang melempar — dua gaya penanganan error.

**(4)** `useLogout` tidak menangkap error: `await authService.logout(); router.push("/login")`. Jika logout gagal (mis. jaringan), pengguna tetap di halaman dengan sesi yang mungkin masih aktif dan tanpa pesan. `finally` atau catch dengan toast diperlukan.

**(5)** `useChangePassword` mengarahkan ke `/login` tanpa pesan "password berhasil diubah"; pengguna bisa mengira gagal. Backend mencabut token, jadi redirect memang wajib.

**(6)** `useHasRole` mengembalikan callback yang stabil per role; pemanggil yang menaruhnya di dependency efek akan aman selama role tidak berubah.

**(7)** `useUser`/`useIsAuthenticated` hanya membaca store; tidak memicu `checkSession`. Jika dipakai sebelum `AuthProvider` selesai, nilainya `null` — sumber bug "berkedip" yang sudah dicatat (9.26.2 #17–18).

### 9.44.10 `hooks/use-route-guard.ts` (32 baris)

```tsx
useEffect(() => {
  if (!ready) return;
  if (!user) router.replace(`/login?redirect=...`);
  else if (!allowed.includes(user.role)) router.replace("/unauthorized");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [ready, user, router]);
```

**(1)** `allowed` sengaja dikeluarkan dari dependency dengan disable ESLint. Jika komponen memanggil `useRouteGuard(roleA)` lalu berubah menjadi `useRouteGuard(roleB)` tanpa remount, guard tidak bereaksi — pengguna bisa tetap di halaman yang tidak lagi diizinkan.

**(2)** `allowed` biasanya array literal baru setiap render; memasukkannya ke dependency akan memicu efek terus-menerus. Solusi yang lebih baik: bandingkan string yang sudah di-join, atau `useMemo` di pemanggil.

**(3)** `if (!user) return "checking"` setelah redirect: halaman menampilkan loading sampai navigasi selesai. Ini mencegah kedipan panel, tetapi jika `router.replace` gagal (mis. middleware memblokir), pengguna terjebak di "checking" selamanya tanpa pesan.

**(4)** Redirect menyertakan `pathname + search` tanpa hash. Deep link dengan hash (mis. `#faq`) hilang setelah login.

**(5)** Guard ini **hanya klien**; tidak ada proteksi server. Pengguna bisa melihat kerangka halaman sebelum redirect, meski data sensitif tetap butuh token API. Untuk panel admin, sebaiknya digabung dengan guard server/middleware.

### 9.44.11 `components/ui/button.tsx` (38 baris)

```tsx
const Button = forwardRef(..., ({ loading, children, disabled, ...props }, ref) => (
  <button ref={ref} className={...} disabled={disabled || loading} {...props}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
));
```

**(1)** `disabled={disabled || loading}` benar; tetapi `aria-busy` tidak di-set, sehingga pembaca layar tidak tahu tombol sedang memproses. Tambahan kecil yang berdampak.

**(2)** `...props` disebar **setelah** `disabled`, jadi pemanggil yang mengirim `disabled` sudah ditangani lebih dulu; tidak ada override tak sengaja.

**(3)** `active:scale-[0.98]` memberi umpan balik tekan; `disabled:pointer-events-none` mencegah klik. Kombinasi ini aman.

**(4)** `forwardRef` diperlukan agar `Tooltip`/form bisa memberi ref; `displayName` di-set. Bagus.

**(5)** Varian `destructive` memakai `bg-danger`; tidak ada varian `link`. Beberapa halaman memakai `<button>` mentah dengan kelas panjang alih-alih komponen ini — inkonsistensi yang sudah terlihat di 9.31–9.42.

### 9.44.12 `components/ui/input.tsx`, `select.tsx`, `textarea.tsx`, `card.tsx`, `badge.tsx`

```tsx
// input
className={cn("w-full rounded-input border border-borderc bg-white px-3 py-2 text-sm ... focus:border-brand focus:ring-1 focus:ring-brand ...", className)}
```

**(1)** Ketiga kontrol memakai kelas dasar yang sama (border, rounded, fokus). `Input`/`Select`/`Textarea` adalah uncontrolled wrapper `forwardRef`, cocok dengan `register()` react-hook-form.

**(2)** Tidak ada styling `aria-invalid`/`disabled` (selain opacity bawaan browser). Saat validasi gagal, input tidak berubah warna; pesan error harus disediakan manual oleh form.

**(3)** `Input` tidak meneruskan `type` default; pemanggil harus menentukan. Tidak ada `autoComplete` default, sehingga browser bisa mengisi password di field yang salah.

**(4)** Indentasi kelas pada `input.tsx` berantakan (tiga tingkat) — kosmetik, bukan bug.

```tsx
// badge
const tone = (status && STATUS_COLORS[status]) ?? (variant === "outline" ? "..." : "bg-slate-100 ...");
```

**(1)** `variant` hanya berpengaruh jika `status` tidak dikenal **dan** nilainya `"outline"`. Varian lain (jika ada yang mengirim `"success"`) diabaikan. Prop `variant` praktis tidak berfungsi sebagai sistem varian.

**(2)** `status.replace(/_/g, " ")` menampilkan status mentah berbahasa Inggris (`pending payment`) jika tidak ada `label`. Banyak halaman mengirim label Indonesia sendiri, jadi campuran bahasa mungkin muncul.

**(3)** `STATUS_COLORS` memuat status huruf kecil; halaman yang mengirim `"PAID"` tidak cocok. Ini akar bug #12 di 9.26.2 (panel `STATUS_TONE`), meski `Badge` sendiri punya masalah serupa.

**(4)** `Card` hanya div dengan border/shadow; tidak ada `as` prop, sehingga kartu yang perlu menjadi `<article>`/`<section>` memakai div (aksesibilitas/SEO). Banyak halaman tidak memakai `Card` sama sekali dan menulis kelas sendiri.
## 9.45 Detail paket dan halaman placeholder — baris per baris

### 9.45.1 `(public)/packages/[id]/page.tsx` (64 baris)

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const pkg = await destinationService.get(id);
  if (!pkg) return { title: "Paket tidak ditemukan" };
  return { title: pkg.name, description: pkg.description.slice(0, 160), openGraph: { images: pkg.cover_image ? [pkg.cover_image] : [] } };
}
```

**(1)** `destinationService.get(id)` dipanggil di `generateMetadata` **dan** di komponen halaman — dua request backend untuk data yang sama pada setiap kunjungan. Fetch Next tidak otomatis di-dedupe untuk panggilan `fetch` di service yang sama kecuali memakai `cache()` React. Ini menambah latensi dan beban database.

**(2)** `pkg.description.slice(0, 160)` melempar jika `description` null/undefined (data lama). `generateMetadata` yang gagal membuat halaman error meski komponen utama bisa menangani.

**(3)** `openGraph.images` menerima path relatif (`/uploads/...`) apa adanya. Open Graph membutuhkan URL absolut; crawler sosial akan mengabaikan atau salah resolve. Seharusnya digabung dengan `metadataBase`.

**(4)** `pkg.cover_image` kosong menghasilkan array kosong — valid, tetapi tidak ada gambar fallback untuk pratinjau tautan.

```tsx
export const dynamic = "force-dynamic";
...
const pkg = await destinationService.get(id);
if (!pkg) notFound();
```

**(1)** `force-dynamic` + `generateMetadata` ganda berarti setiap kunjungan melakukan minimal dua query. Untuk halaman produk, `revalidate = 60` akan jauh lebih murah tanpa risiko besar.

**(2)** `get()` mengembalikan `null` untuk 404, sehingga `notFound()` tepat. Namun error 500/ jaringan akan melempar dan menghasilkan halaman error, bukan 404 — pembaca tidak bisa membedakan "paket dihapus" dari "server bermasalah".

```tsx
<img src={pkg.cover_image} alt={pkg.name} className="h-full w-full object-cover" />
```

**(1)** Sengaja memakai `<img>` dengan disable ESLint: komentar menyebut `next/image` butuh `remotePatterns` yang dikonfirmasi saat runtime. Konsekuensinya tidak ada optimasi ukuran/format dan tidak ada `srcset`; gambar besar dari CMS membebani halaman detail.

**(2)** Induk berukuran tetap `h-72` mencegah layout shift, jadi ketiadaan `width`/`height` tidak merusak CLS di sini.

**(3)** Tidak ada galeri, itinerary, fasilitas yang termasuk, atau ulasan — halaman detail hanya cover, judul, durasi, kapasitas, deskripsi, dan form. Untuk paket wisata, informasi "apa yang didapat" biasanya menjadi penentu pembelian.

```tsx
{pkg.max_capacity > 0 && (<span ...><Users ... /> Maks {pkg.max_capacity} orang/hari</span>)}
```

**(1)** Kapasitas 0 disembunyikan, bukan ditampilkan sebagai "tidak terbatas". Perbedaan semantik ini tidak dijelaskan; admin yang mengosongkan kapasitas mungkin bermaksud "tanpa batas".

```tsx
<div className="sticky top-24 rounded-2xl border ...">
  <p ...>{formatCurrency(pkg.price_cents, pkg.currency)}</p>
  <p className="mb-4 text-sm text-slate-500">per orang</p>
  <BookingForm pkg={pkg} />
</div>
```

**(1)** `sticky top-24` pada kartu yang berisi form panjang bisa membuat bagian bawah form tidak terjangkau di layar pendek, karena elemen sticky lebih tinggi dari viewport tidak di-scroll sendiri. Perlu `max-h-[calc(100vh-...)] overflow-auto` atau sticky hanya pada desktop dengan tinggi cukup.

**(2)** Harga memakai `formatCurrency` (sen) — benar untuk paket. Label "per orang" melengkapi konteks yang hilang di `PackageCard`.

**(3)** `BookingForm` menerima `pkg` utuh dari server, lalu menghitung total di klien. Harga akhir tetap divalidasi backend saat booking dibuat; tidak ada masalah kepercayaan di sini, tetapi pratinjau bisa berbeda bila harga berubah antara render dan submit.

### 9.45.2 `components/empty/coming-soon.tsx` (13 baris)

```tsx
<div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center">
  <Construction ... />
  <h1 className="text-lg font-semibold">{feature}</h1>
  <p ...>Fitur ini belum tersedia — menunggu modul backend terkait dibangun. ...</p>
</div>
```

**(1)** Pesan menjelaskan bahwa halaman sengaja belum ada — pendekatan yang jujur dan jauh lebih baik daripada halaman kosong. Namun teksnya menyebut "menunggu modul backend", padahal sebagian fitur (mis. wishlist, kontak) tidak memerlukan backend baru; alasan ini bisa menyesatkan.

**(2)** `feature` adalah string bebas; semua pemanggil mengirim nama berbahasa Indonesia dengan awalan "Halaman ...". Tidak ada metadata per halaman, sehingga judul tab semua placeholder sama (dari template root).

**(3)** Halaman placeholder adalah **server component statis**, jadi murah dan tidak menambah bundel klien. `Construction` dari lucide tetap masuk bundel server-rendered.

### 9.45.3 Dua puluh halaman placeholder (masing-masing 5–6 baris)

Daftar lengkap dari filesystem:

| Route group | Halaman |
|---|---|
| admin | `activity-log`, `analytics`, `banner`, `categories`, `contacts`, `destinations`, `events`, `permissions`, `promotion`, `refunds`, `roles`, `voucher` |
| dashboard | `notification`, `review`, `wishlist` |
| public | `contact`, `destination`, `events`, `promotions`, `weather` |

**(1)** Semua memakai pola identik:

```tsx
import { ComingSoon } from "@/components/empty/coming-soon";
export default function Page() {
  return <ComingSoon feature="Halaman contact" />;
}
```

Tidak ada logika, state, atau fetch. Tidak ada yang bisa salah di tingkat kode; risikonya ada di navigasi: tautan ke halaman ini terlihat aktif dan mengarah ke "belum tersedia".

**(2)** **`contact` adalah tautan buntu yang sudah dipakai di tempat lain** — FAQ (9.42.3) mengarahkan "Hubungi Kami" ke `/contact`, dan footer/navbar kemungkinan juga. Pengunjung yang butuh bantuan diarahkan ke halaman yang mengatakan fitur belum ada. Ini prioritas konten, bukan bug kode.

**(3)** `dashboard/wishlist` placeholder meski `wishlist.store.ts` sudah ada dan berfungsi secara lokal — fitur bisa diaktifkan tanpa backend, tetapi belum ada UI.

**(4)** `admin/analytics` placeholder padahal halaman dashboard admin sudah menampilkan grafik dari endpoint analytics. Duplikasi konsep: data tersedia, halaman khususnya kosong.

**(5)** `dashboard/review` belum ada meski backend punya domain review? (perlu dicek). Jika backend sudah ada, ini fitur yang hanya kurang UI.

**(6)** Halaman placeholder tetap melewati `middleware` dan guard role, jadi admin/pengguna yang mengetik URL akan melihat "belum tersedia" alih-alih 404. Tidak berbahaya, tetapi menambah kesan aplikasi belum selesai — yang memang benar adanya.

**(7)** Tidak ada `metadata` di file placeholder, sehingga setiap halaman mewarisi judul default. Untuk halaman yang tidak diindeks, ini tidak penting; jika nanti diisi, metadata harus ditambahkan.
