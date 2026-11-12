# CODEBASE BACKEND — Kawah Putih

Dokumen ini **khusus backend**. Isinya diambil dan disusun ulang dari `CODEBASE.md` (dokumen gabungan lama, tetap dipertahankan) ditambah peta arsitektur, inventaris berkas, dan ringkasan temuan yang hanya relevan untuk backend.

- **Berkas Go:** 182 (167 di `internal/`, 6 di `cmd/`, 9 di `pkg/`), sekitar 15.550 baris.
- **Bahasa/framework:** Go, Gin, GORM, SQLite, JWT, Midtrans.
- **Titik masuk:** `backend/cmd/server/main.go`.
- **Dokumen pasangan:** `CODEBASE_FRONTEND.md`.

> **Catatan penomoran.** Nomor bagian (`Bagian 1`, `8.x`, `10.x`, `12.x`) **tidak diubah** agar setiap rujukan silang di dalam dokumen ini dan di `CODEBASE.md` tetap menunjuk ke bagian yang sama. Karena itu nomor bagian di dokumen ini tidak berurutan; itu disengaja, bukan kelalaian. Rujukan ke bagian frontend (4, 5, 9, 11) berarti bagian tersebut ada di `CODEBASE_FRONTEND.md`.

---

## B.1 Peta arsitektur backend

Backend adalah satu biner HTTP dengan pembagian lapisan yang konsisten:

```
cmd/server
  └─ internal/bootstrap     menyusun dependency graph (manual, tanpa DI container)
       ├─ internal/config   environment → Config, koneksi SQLite
       ├─ internal/routes   satu tempat pendaftaran seluruh rute
       ├─ internal/middleware  recovery, CORS, rate limit, auth, audit, observability
       └─ internal/domain/<domain>
            handler.go      HTTP: bind, validasi bentuk, panggil usecase/service
            usecase.go      orkestrasi + aturan bisnis tingkat aplikasi
            service.go      aturan bisnis inti (tidak semua domain punya)
            repository.go   GORM/SQL, satu-satunya lapisan yang menyentuh DB
            entity.go       model GORM + konstanta status
            dto.go          kontrak JSON request/response
            validator.go    validasi tag `validate`
            routes.go       pendaftaran rute domain
       └─ pkg/              response envelope, apperror, jwtutil, dsb.
```

### Alur satu request

1. `gin.Engine` → middleware global (recovery, logger, CORS, rate limit).
2. `RequireAuth` membaca **cookie httpOnly** atau header `Authorization: Bearer`.
3. `RequireRole` memeriksa `roles` dari klaim JWT.
4. Handler memanggil `ShouldBindJSON`/`ShouldBindQuery`, lalu validator.
5. Usecase/service memanggil repository.
6. `response.OK` / `response.OKWithMeta` membungkus hasil; `apperror.WriteHTTP` memetakan error.
7. `middleware.Audit` (bila dipasang) menulis `audit_logs` **best-effort** setelah handler.

### Konvensi yang berlaku di hampir semua domain

| Konvensi | Detail | Konsekuensi |
|---|---|---|
| ID | `char(36)` UUID v4, diisi `BeforeCreate` | tidak ada auto-increment |
| Soft delete | `gorm.DeletedAt` pada `Base` | `COUNT`/`Find` otomatis menambah `deleted_at IS NULL` |
| Status | string konstanta huruf besar (`PAID`, `USED`, …) | tidak ada enum DB; nilai salah diterima |
| Uang | `int64` rupiah, tanpa desimal | aman dari floating point |
| Tanggal bisnis | string `YYYY-MM-DD` | perbandingan leksikografis valid, tetapi bukan `time.Time` |
| Envelope | `{ success, message, data, meta? }` | frontend selalu membaca `data` |
| Error | `apperror` dengan kode HTTP | pesan berbahasa Indonesia |
| Validasi | `go-playground/validator` + tag `validate` | pesan generik `"<Field> is invalid"` |

### Inventaris domain

| Domain | Berkas | Baris | Tanggung jawab |
|---|---:|---:|---|
| auth | 10 | 1.304 | login, register, refresh, OAuth, sesi |
| user | 10 | 267 | akun, aktivasi, role user |
| role | 10 | 355 | master role dan penugasan |
| booking | 9 | 1.423 | pesanan, item, status, kapasitas |
| payments | 6 | 1.118 | transaksi Midtrans, webhook, penerbitan tiket |
| ticketing | 5 | 1.104 | tiket, QR, scan, validasi gerbang |
| tickettype | 9 | 641 | katalog jenis tiket dan kapasitas |
| verification | 7 | 388 | rekaman verifikasi (duplikat scan) |
| article | 10 | 526 | artikel editorial |
| gallery | 10 | 436 | aset galeri |
| package | 10 | 453 | paket wisata |
| faq | 9 | 421 | tanya-jawab |
| facility | 9 | 457 | fasilitas |
| destinationinfo | 9 | 566 | profil destinasi |
| visitorrule | 9 | 444 | aturan pengunjung |
| public | 8 | 722 | endpoint baca publik |
| analytics | 4 | 579 | agregasi dashboard |
| audit | 6 | 575 | jejak aktivitas |
| visitors | 3 | 380 | laporan pengunjung/staf |

### Temuan backend yang sudah diverifikasi

Temuan berikut dicek langsung ke kode dan/atau database, bukan dugaan:

1. **`PATCH /admin/users/:id/active` selalu 500** — `repository.SetActive` menulis kolom `updated_by` yang tidak ada di `PRAGMA table_info(users)`.
2. **Seluruh `/api/v1/public/*` 500** — tabel `destinations`, `contents`, `reviews` tidak ada; `facilities`/`faqs` tidak punya `is_active` yang di-query.
3. **`/public/prices` melaporkan `Available = Capacity`** — kode mengambil ulasan lalu membuang hasilnya (`_ = sold`).
4. **`/verifications` merusak tiket valid lalu gagal 500** — tiket sudah ditandai `USED` sebelum insert ke tabel `verifications` yang tidak pernah dimigrasikan.
5. **Scan tiket tidak dikenal menyebabkan panic** — `result.Ticket` nil di-dereference.
6. **Nama petugas dapat dipalsukan** lewat body `petugas` meski `staffID` dari JWT.
7. **Paginasi audit salah** saat `limit` tidak dikirim/berlebihan — offset dihitung sebelum normalisasi.
8. **Metrik analytics tidak konsisten** — "pengunjung" berarti akun/tiket/unik tergantung kartu; "tersedia" = kapasitas total; conversion bisa >100%.
9. **Tren analytics kehilangan hari** pada rentang >31 hari karena `step` dibulatkan ke atas.
10. **Audit best-effort tidak pernah melaporkan kegagalan** (`_ = repo.Create`).

Rincian tiap temuan ada di bagian yang disebut pada daftar di bawah.

## B.2 Isi dokumen ini

| Bagian | Isi | Kedalaman |
|---|---|---|
| 1 | inti aplikasi: `cmd`, bootstrap, config, middleware, pkg | per berkas |
| 2 | domain inti: auth, user, role, booking, payments, ticketing, tickettype, verification | per berkas |
| 3 | domain CMS, publik, analytics, audit, visitors | per berkas |
| 6 | database/migrasi, Docker, berkas root | per berkas |
| 7.1–7.4 | alur pesanan → pembayaran → tiket → scan | baris per baris |
| 7.6–7.8 | catatan bug, peta cakupan, cara membaca | ringkas |
| 8 | bedah lanjutan hampir seluruh backend | baris per baris / per fungsi |
| 10 | tujuh domain konten + user/role/visitors/public/tickettype | per berkas |
| 12.1–12.10 | analytics, audit, verification sampai tingkat token | baris per baris |
| 12.12 | ringkasan temuan terverifikasi | ringkas |
| B.3 | indeks 182 berkas Go: baris, bagian per berkas, pembahasan mendalam | tabel |

Bagian 7.5 (frontend), 9, 11, dan 12.11 (DataTable) **tidak** ada di sini; lihat `CODEBASE_FRONTEND.md`.

### Cara membaca cepat

- Ingin tahu **fungsi sebuah berkas** → Bagian 1–3, lalu Bagian 10.
- Ingin tahu **kenapa satu baris ada** → Bagian 7 dan 8.
- Ingin tahu **angka dashboard** → 8.25 dan 12.2–12.5.
- Ingin tahu **scan tiket** → 7.4, 8.12–8.14, 8.35, 12.9–12.10.
- Ingin tahu **keamanan** → 8.15–8.23, 8.46, 8.50–8.55.

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

> **Catatan penyunting (dokumen backend).** 7.6–7.8 dipertahankan dari dokumen gabungan dan membahas kedua sisi aplikasi. Sub-bagian 7.5 (frontend) serta baris tabel 7.7 yang merujuk frontend ada di `CODEBASE_FRONTEND.md`; rujukan seperti "7.5.3" di 7.8 menunjuk ke dokumen tersebut.

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

Bagian 7 membedah alur transaksi sampai ke baris. Bagian 8 melanjutkan ke **semua file sisa** yang belum dibedah: berkas pendukung domain booking/payments/ticketing, domain lain satu per satu (auth, tickettype, analytics, audit, CMS, visitor, dsb.), infrastruktur (bootstrap, config, middleware, pkg, scheduler, gateway), serta infrastruktur. (Bagian frontend dipindahkan ke `CODEBASE_FRONTEND.md`.) Urutannya mengikuti arah pembacaan kode, bukan abjad.

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

**Pembaruan:** celah tersebut ditutup di **Bagian 10**, yang membedah per berkas tujuh domain konten (package, destinationinfo, facility, faq, gallery, article, visitorrule), tiga domain administrasi (user, role, visitors), serta domain `public` dan `tickettype`. Sisa frontend ditutup di `CODEBASE_FRONTEND.md` (Bagian 11 dan 12.11). **Bagian 12** di dokumen ini membedah `analytics`, `audit`, dan `verification` sampai tingkat token/karakter.

Pembahasan frontend (services, store, lib, hooks, providers, komponen, dan seluruh halaman `app/`) ada di `CODEBASE_FRONTEND.md`, dengan urutan lapisan: klien API → service domain → state global → hook → komponen → halaman.

---


# 10. Bedah backend lanjutan — per berkas

Bagian 8 membahas 19 domain pada tingkat alur dan pola; beberapa domain konten hanya diwakili satu subbagian. Bagian 10 menutup celah itu: setiap berkas Go yang tersisa dibaca dan dibahas, dimulai dari tujuh domain CRUD yang paling banyak dipakai frontend. Temuan yang berulang di beberapa domain dicatat sekali sebagai pola, lalu dirujuk.

## 10.1 `internal/domain/package` — 10 berkas, 453 baris

### 10.1.1 `dto.go`

```go
PriceCents int64 `json:"price_cents" validate:"required,min=0"`
```

**(1)** `required` pada `int64` menolak **0**. Paket gratis (harga 0) tidak bisa dibuat meski `min=0` mengizinkan. Kombinasi tag ini kontradiktif; seharusnya `min=0` saja atau `gte=0`.

**(2)** `CoverImage` memakai `omitempty,url`. Validator `url` hanya menerima URL absolut, sedangkan unggahan mengembalikan path relatif `/api/v1/uploads/...`. Saat ini form paket hanya menerima URL manual, jadi tidak langsung gagal — tetapi begitu admin memakai unggahan (seperti galeri), simpan paket akan ditolak.

**(3)** `CreateRequest` tidak memiliki `IsActive`; service selalu membuat paket aktif. `UpdateRequest` **mewajibkan** `is_active`. Artinya update bersifat penggantian penuh: klien yang hanya ingin mengubah nama harus mengirim harga, durasi, kapasitas, dan status — jika tidak, nilai nol menimpa data. Inilah akar bug frontend #14 (`toggleActive` harus mengirim seluruh field).

**(4)** `Slug` tidak ada di request; dibuat otomatis dari nama. Nama yang seluruhnya non-latin menghasilkan slug kosong (lihat 10.1.7). `Currency` juga tidak bisa diubah, selalu IDR.

**(5)** `Response` memuat `slug`, tetapi tidak ada endpoint `GET /packages/slug/:slug`; frontend memakai `id`. Field itu hanya informatif.

### 10.1.2 `entity.go`

```go
Slug string `gorm:"type:varchar(220);uniqueIndex;not null"`
```

**(1)** `uniqueIndex` berlaku untuk baris yang sudah soft-delete. Karena `SlugExists` memakai scope default GORM (mengabaikan baris terhapus), paket yang dihapus lalu dibuat ulang dengan nama sama akan lolos pengecekan service tetapi ditolak database → 500, bukan pesan "slug sudah dipakai".

**(2)** `Base.BeforeCreate` mengisi UUID jika kosong. Tidak ada hook `BeforeUpdate`; `UpdatedAt` diurus GORM.

**(3)** `MaxCapacity` default 0. Semantik "0 = tanpa batas" tidak dinyatakan di komentar mana pun dan tidak divalidasi terhadap pemesanan (domain booking tidak membaca kapasitas paket).

**(4)** `DeletedBy *string` tidak muncul di JSON (`json:"-"`). Jejak siapa menghapus hanya ada di database.

### 10.1.3 `errors.go`

**(1)** Satu error saja: `ErrPackageNotFound` (404). Tidak ada error konflik slug karena slug dibuat internal.

### 10.1.4 `handler.go`

```go
page, _ := strconv.Atoi(c.Query("page"))
perPage, _ := strconv.Atoi(c.Query("limit"))
```

**(1)** Error parsing diabaikan; nilai tidak valid menjadi 0 dan dinormalisasi di usecase. `response.BuildMeta(page, perPage, total)` menerima 0 lalu memakai default 20 — jadi meta konsisten dengan usecase yang juga default 20. Kebetulan benar karena keduanya memakai aturan default yang sama.

**(2)** `activeOnly := c.Query("active_only") == "true"` hanya menerima string persis `true`; `1`/`TRUE` dianggap false.

**(3)** Handler tidak membedakan `Get` publik dan admin. `GET /packages/:id` mengembalikan paket **nonaktif** juga — lihat routes.

**(4)** `Delete` tidak membaca body; aktor diambil dari middleware, bagus.

### 10.1.5 `mapper.go`

**(1)** `toResponse` menyalin semua field kecuali audit (`CreatedBy`, `UpdatedBy`, `DeletedBy`) dan timestamp. Frontend tidak pernah menerima `created_at` paket, sehingga tidak bisa menampilkan "baru ditambahkan".

**(2)** `toResponseList` memakai indeks (`&packages[i]`) untuk menghindari salinan tiap elemen — benar dan efisien.

### 10.1.6 `repository.go`

```go
func (r *repository) Update(...) error { return r.db.WithContext(ctx).Save(p).Error }
```

**(1)** `Save` menulis **semua** kolom, termasuk yang bernilai nol. Konsisten dengan DTO update penuh, tetapi berbahaya bila suatu saat ada pemanggil internal yang hanya mengisi sebagian field.

**(2)** `FindByID` mengembalikan `(nil, nil)` untuk tidak ditemukan. Pola ini memaksa lapisan atas membedakan `nil` dari error; konsisten di seluruh proyek.

**(3)** `List` menghitung `Count` pada query yang sama sebelum `Offset/Limit`. GORM mengeksekusi `Count` lebih dulu; aman. Namun `Order("created_at DESC")` diterapkan sebelum `Count` — GORM mengabaikan order untuk count, hanya sedikit boros.

**(4)** Tidak ada filter `deleted_at` eksplisit karena model memakai `gorm.DeletedAt`; GORM menambahkannya otomatis.

**(5)** `SlugExists` memakai `Model(&Package{})` sehingga baris terhapus tidak dihitung — sumber konflik unique index di 10.1.2.

### 10.1.7 `service.go`

```go
func (s *Service) uniqueSlug(ctx context.Context, name, excludeID string) (string, error) {
	base := slugutil.Generate(name)
	slug := base
	for i := 2; ; i++ { ... slug = base + "-" + strconv.Itoa(i) }
}
```

**(1)** Loop tidak memiliki batas. Dalam praktik selalu berhenti karena sufiks angka terus berubah, tetapi jika `SlugExists` selalu mengembalikan true (mis. bug query), request menggantung tanpa timeout di level service.

**(2)** `slugutil.Generate` hanya mempertahankan `a-z0-9`. Nama seperti "Paket Wisata Éksklusif" menjadi `paket-wisata-ksklusif`; nama beraksara non-latin menjadi **string kosong**. Paket pertama dengan nama seperti itu mendapat slug `""` (lolos `not null`), yang kedua `"-2"`. URL berbasis slug akan rusak; saat ini tidak dipakai.

**(3)** Slug hanya diperbarui jika `p.Name != req.Name`. Mengubah kapitalisasi nama ("paket A" → "Paket A") memicu regenerasi slug, meski secara SEO tidak perlu.

**(4)** `Update` **tidak** memvalidasi `IsActive` terhadap pemesanan yang sedang berjalan. Menonaktifkan paket tidak mencegah booking baru pada level repository booking (domain booking tidak membaca status paket).

**(5)** `Delete` melakukan `Update` (untuk `DeletedBy`) lalu `Delete`. Dua query, tanpa transaksi. Jika `Delete` gagal, baris tetap hidup dengan `DeletedBy` terisi — jejak "gagal hapus" yang menyesatkan.

**(6)** `Get` tidak memfilter `IsActive`. Endpoint publik dapat menampilkan paket nonaktif jika ID diketahui.

### 10.1.8 `usecase.go`

**(1)** `normalizePaging` membatasi 1–100 dan default 20. Ini satu-satunya domain konten yang menormalisasi paginasi di usecase; domain lain menyerahkan nilai mentah ke repository (lihat 10.2.7, 10.3.7, 10.4.7).

**(2)** Usecase mengembalikan `Response`, bukan entity — berbeda dari destinationinfo/facility/faq yang mengembalikan entity ke handler. Lapisan tidak seragam.

### 10.1.9 `routes.go`

```go
rg.GET("/packages", h.List)
rg.GET("/packages/:id", h.Get)
...
admin := rg.Group("/packages", requireAuth, middleware.RequireRole("ADMIN", "super_admin"))
```

**(1)** Rute publik dan admin berbagi path dasar `/packages`; grup admin menambahkan method POST/PUT/DELETE pada path yang sama. Tidak ada bentrok karena method berbeda.

**(2)** `GET /packages/:id` publik tidak dibatasi `active_only`. Ini kebocoran konten: paket draft/nonaktif dapat dibaca siapa pun yang tahu ID.

**(3)** Peran yang diizinkan hanya `ADMIN` dan `super_admin`; `MANAGER` tidak bisa mengelola paket meski dashboard manager menampilkan penjualan paket.

### 10.1.10 `validator.go`

**(1)** Semua pesan error menjadi `"Field is invalid"`, tanpa membedakan required/min/url. Frontend hanya bisa menampilkan pesan generik per field.

**(2)** `err.(validator.ValidationErrors)` adalah type assertion tanpa `ok`; aman karena validator selalu mengembalikan tipe itu untuk `Struct`, tetapi akan panic jika suatu saat `InvalidValidationError` (mis. input non-struct).

## 10.2 `internal/domain/destinationinfo` — 9 berkas, 566 baris

### 10.2.1 `dto.go`

**(1)** `History`, `DestinationDesc`, `AdditionalInfo` tanpa batas panjang; hanya `Description` wajib min 10. Konten sangat panjang bisa masuk dan dikirim utuh ke halaman publik.

**(2)** `Status`, `PublishedAt`, `AuthorID` ada di response, tetapi `Status` tidak bisa diubah lewat Create/Update — hanya lewat endpoint publish/archive. Bagus: transisi status tidak bisa dipalsukan lewat update.

**(3)** `ToResponse` mengembalikan pointer dan memformat waktu dengan layout `2006-01-02T15:04:05Z07:00`. Menggunakan `Format` pada waktu lokal menghasilkan offset (`+07:00`), bukan `Z`; frontend mem-parse dengan `new Date()` sehingga aman.

**(4)** `Create` mengembalikan entity (`*DestinationInfo`) lalu handler memanggil `ToResponse`, sedangkan `Get` mengembalikan entity dan `List` mengembalikan slice entity. Usecase di sini benar-benar pass-through, berbeda dari package.

### 10.2.2 `entity.go`

**(1)** `Title` memiliki `uniqueIndex`. Sama seperti slug paket: baris soft-delete tetap menempati indeks, sementara `FindByTitle` mengabaikan baris terhapus → membuat ulang judul setelah hapus menghasilkan error database 500.

**(2)** `Status` default `draft`, `AuthorID` not null. `PublishedAt *int64` menyimpan unix detik, konsisten dengan frontend.

**(3)** Tiga konstanta status ada, tetapi tidak ada validasi transisi. `Archive` lalu `Publish` mengembalikan konten ke published; `Publish` pada konten yang sudah published hanya memperbarui `published_at`.

### 10.2.3 `errors.go`

**(1)** `ErrInvalidStatus` dan `ErrCannotPublish` didefinisikan, tetapi `ErrInvalidStatus` **tidak pernah dipakai** — tidak ada pemeriksaan transisi status. `ErrCannotPublish` hanya dipakai untuk cek judul/deskripsi kosong yang sebenarnya sudah dijamin validator DTO.

**(2)** `ErrTitleExists` berpesan "Data sudah terdaftar." tanpa menyebut judul — pengguna tidak tahu field mana yang bentrok.

### 10.2.4 `handler.go`

**(1)** `GetPublished` mengembalikan 404 jika tidak ada konten published. Frontend `destinationInfoService.getPublished()` memperlakukan 404 sebagai `null` dan halaman Tentang memakai fallback. Alur ini sengaja, tetapi membedakan "belum pernah publish" dari "server error" hanya lewat kode status.

**(2)** `List` meneruskan `status` query apa adanya ke repository. Nilai arbitrer (`"published; DROP..."`) aman karena parameterized, tetapi `status=foo` menghasilkan daftar kosong, bukan error validasi.

**(3)** `Create` membalas `"created as draft"` dan mengembalikan entity yang sudah dipetakan; pesan jelas.

**(4)** Handler publik `Get` (lewat rute `GET /destination-info/:id`) memanggil usecase yang sama dengan admin, tanpa filter status — konten draft dapat dibaca publik.

### 10.2.5 `repository.go`

**(1)** `FindByTitle` memakai `Where("title = ?").First` — case-sensitive pada SQLite? SQLite `=` untuk TEXT bersifat case-sensitive secara default (kecuali COLLATE NOCASE). "Sejarah" dan "sejarah" dianggap beda, sementara unique index juga case-sensitive. Konsisten, tetapi admin bisa membuat dua judul yang tampak sama.

**(2)** `GetPublished` memilih **satu** baris terbaru berdasarkan `published_at DESC`. Tidak ada endpoint daftar konten publik; halaman Tentang hanya pernah menampilkan satu profil destinasi.

**(3)** `List` menerapkan `Order` sebelum `Count`; sama seperti package, aman tetapi urutan tidak diperlukan untuk count.

**(4)** `Delete` soft-delete; `FindByID` tidak memfilter status.

### 10.2.6 `routes.go`

**(1)** `public.GET("/:id", h.Get)` membuka semua status. Ini temuan keamanan konten yang berulang di package/facility/faq.

**(2)** Grup admin `/admin/destination-info` memakai `RequireRole("ADMIN","super_admin")`; manager tidak bisa mengelola profil destinasi.

### 10.2.7 `service.go`

```go
func (s *Service) List(ctx, offset, limit int, status string) (...) {
	return s.repo.List(ctx, offset, limit, status)
}
```

**(1)** Tidak ada normalisasi paginasi. Handler mengirim `page=0, limit=0` jika query kosong; `BuildMeta` menampilkan `limit: 20`, tetapi repository menerima `Limit(0)`. Di GORM, `Limit(0)` menghasilkan `LIMIT 0` (tidak ada baris) — meta dan isi tidak cocok. Frontend selalu mengirim limit, jadi bug tersembunyi.

**(2)** `Publish` hanya memeriksa `Title == "" || Description == ""`; field wajib lain tidak diperiksa karena DTO sudah mewajibkannya saat create/update. Namun data lama yang dibuat sebelum validasi bisa lolos.

**(3)** `Delete` menyimpan `DeletedBy` lewat `Update` lalu soft-delete, tanpa transaksi — pola sama dengan package.

**(4)** `Create` memeriksa judul duplikat, tetapi `Update` hanya memeriksa jika judul berubah. Jika dua request create bersamaan, keduanya lolos cek lalu satu gagal di unique index → 500, bukan 409.

### 10.2.8 `usecase.go`

**(1)** Sepenuhnya pass-through: 8 method hanya memanggil service. Tidak ada logika tambahan, tidak ada pemetaan. Lapisan ini bisa dihapus tanpa mengubah perilaku — biaya indireksi tanpa manfaat.

### 10.2.9 `validator.go`

**(1)** Sama seperti package: pesan generik, assertion tanpa `ok`.

## 10.3 `internal/domain/facility` — 9 berkas, 457 baris

### 10.3.1 `dto.go`

**(1)** `Status` memakai `oneof=active maintenance inactive`, tetapi `omitempty`. String kosong dianggap valid dan service mengubahnya menjadi `active`. Artinya klien tidak bisa menyimpan status kosong — bagus, tetapi perilaku "default aktif" tidak terlihat dari DTO.

**(2)** `ImageURL` memakai `omitempty,url` — **tidak menerima path unggahan relatif**, berbeda dari galeri yang punya validator `imageurl`. Form fasilitas hanya menyediakan input URL manual (bukan unggah), jadi konsisten dengan UI saat ini; tetapi unggahan tidak bisa dipakai untuk fasilitas tanpa mengubah validator.

**(3)** `IsPublished` dan `SortOrder` tidak punya validasi; `SortOrder` negatif diterima dan akan mengurutkan sebelum yang lain.

### 10.3.2 `entity.go`

**(1)** `Status` default `active`, `IsPublished` default false. Fasilitas baru aktif tetapi belum tampil di publik sampai dipublikasikan — dua konsep status yang mudah tertukar.

**(2)** `CreatedBy`/`UpdatedBy`/`DeletedBy` ada, tetapi service tidak pernah mengisinya dan handler tidak mengirim aktor. Kolom audit selalu kosong.

**(3)** Tidak ada unique index pada nama; dua fasilitas "Toilet" boleh ada.

### 10.3.3 `errors.go`

**(1)** Hanya `ErrNotFound`; tidak ada validasi status/duplikat.

### 10.3.4 `handler.go`

**(1)** `List` menerima `status` dan `published_only`, lalu meneruskan page/limit mentah. Meta memakai default 20, query memakai 0 — sama seperti destinationinfo.

**(2)** `ListPublished` mengembalikan array langsung tanpa meta. Frontend mengharapkan array; konsisten.

**(3)** `GET /facilities/:id` publik dan admin memakai handler yang sama, tanpa filter `is_published`/status.

### 10.3.5 `repository.go`

```go
q := r.db.Model(&Facility{}).Order("status ASC, sort_order ASC, created_at DESC")
```

**(1)** Urutan `status ASC` mengurutkan alfabetis: `active`, `inactive`, `maintenance`. Fasilitas nonaktif muncul sebelum yang maintenance — bukan prioritas yang jelas.

**(2)** `ListPublished` hanya memfilter `is_published = true`, **tidak** memfilter `status`. Fasilitas `inactive` yang ditandai published tetap tampil di halaman publik. Ini kontradiksi data yang nyata.

**(3)** `FindByID` tidak memfilter status/published; endpoint publik membocorkan fasilitas yang belum terbit.

### 10.3.6 `routes.go`

**(1)** Pola sama: `GET /facilities/:id` publik terbuka untuk semua status.

**(2)** Admin `GET /facilities/:id` didaftarkan ulang di grup admin meski rute publik sudah ada; tidak berbahaya, hanya duplikasi permukaan.

### 10.3.7 `service.go`

**(1)** `Create` dan `Update` tidak menerima `actorID`; audit tidak mungkin diisi tanpa mengubah signature.

**(2)** `Update` mengganti seluruh field termasuk `Status == ""` → `active`. Jika klien mengirim status kosong untuk mempertahankan nilai lama, hasilnya berubah menjadi aktif — bukan patch.

**(3)** `List`/`ListPublished` pass-through; `List` tidak menormalisasi limit.

**(4)** `Delete` hanya memanggil `mustFind` lalu hard/soft delete; `DeletedBy` tidak diisi meski field tersedia.

### 10.3.8 `usecase.go`

**(1)** Pass-through seluruhnya, 6 method. Tidak ada pemetaan response; handler memanggil `ToResponse` sendiri.

### 10.3.9 `validator.go`

**(1)** Sama: pesan generik.

## 10.4 `internal/domain/faq` — 9 berkas, 421 baris

### 10.4.1 `dto.go`

```go
Category string `validate:"required,oneof=Tiket Jam Operasional Lokasi Fasilitas Aturan Kunjungan Parkir Pembayaran Umum"`
```

**(1)** Daftar kategori hardcoded dan mengandung **spasi** ("Jam Operasional", "Aturan Kunjungan"). Frontend harus mengirim string persis; salah kapitalisasi/spasi = 400. Menambah kategori berarti mengubah backend dan redeploy.

**(2)** Urutan kategori di repository alfabetis, sehingga "Aturan Kunjungan" tampil sebelum "Fasilitas" — bukan urutan yang diinginkan pengunjung.

**(3)** `Answer` wajib min 10; FAQ dengan jawaban singkat ("Ya.") ditolak.

### 10.4.2 `entity.go`

**(1)** `IsPublished` default false; `CreatedBy`/`UpdatedBy`/`DeletedBy` ada tetapi tidak pernah diisi.

**(2)** Tidak ada unique index pada `Question`; pertanyaan duplikat bisa masuk.

### 10.4.3 `errors.go`

**(1)** Hanya `ErrNotFound`.

### 10.4.4 `handler.go`

**(1)** `List` meneruskan page/limit mentah dan `category` apa adanya. Kategori tidak dikenal menghasilkan daftar kosong, bukan error.

**(2)** `ListPublished` menerima kategori query; frontend `faqService.listPublished(category)` meneruskannya. Halaman FAQ memanggil tanpa kategori.

**(3)** `GET /faq/:id` publik membuka FAQ yang belum dipublikasikan.

### 10.4.5 `repository.go`

**(1)** `ListPublished` memfilter `is_published = true` tanpa batas jumlah. Jika FAQ bertambah banyak, satu request memuat semuanya — halaman FAQ tidak berpaginasi.

**(2)** `List` mengurutkan `category ASC, sort_order ASC, created_at DESC`; sort_order hanya berlaku di dalam kategori, bukan global.

**(3)** Tidak ada pencarian teks; admin tidak bisa mencari pertanyaan.

### 10.4.6 `routes.go`

**(1)** Pola kebocoran sama: `public.GET("/:id", h.Get)`.

**(2)** Grup admin `/admin/faq` hanya ADMIN/super_admin.

### 10.4.7 `service.go`

**(1)** Tanpa normalisasi paginasi; `List` meneruskan offset/limit mentah.

**(2)** `Create`/`Update` tidak menerima aktor; audit kosong.

**(3)** `Delete` tidak mengisi `DeletedBy`.

**(4)** `Update` mengganti seluruh field — status publish bisa berubah tanpa sengaja jika klien mengirim `is_published` default false.

### 10.4.8 `usecase.go`

**(1)** Pass-through 6 method.

### 10.4.9 `validator.go`

**(1)** Sama seperti domain lain.

## 10.5 Pola lintas domain yang terkonfirmasi

**(1)** **Kebocoran konten belum terbit.** Package, destinationinfo, facility, dan FAQ semuanya mendaftarkan `GET /:id` publik yang memanggil `mustFind` tanpa filter status. Siapa pun yang mengetahui/menebak UUID dapat membaca draft, arsip, atau data nonaktif. Untuk destinationinfo bahkan ada dua status (draft/archived) yang seharusnya tidak pernah terlihat.

**(2)** **Update = penggantian penuh.** Tidak ada domain yang memakai patch parsial. Frontend harus mengirim semua field; bug toggle di packages-admin adalah gejala langsung. Solusi jangka panjang: DTO update dengan pointer field (`*string`, `*bool`) atau PATCH terpisah.

**(3)** **Audit aktor tidak konsisten.** Package mengisi `CreatedBy/UpdatedBy/DeletedBy`; destinationinfo mengisi ketiganya; facility dan FAQ tidak mengisi sama sekali meski kolomnya ada. Audit log middleware mencatat aksi, tetapi kolom per-baris tidak dapat diandalkan.

**(4)** **Paginasi tidak seragam.** Hanya package yang menormalkan page/limit di usecase. Tiga domain lain meneruskan 0 ke `Limit(0)` sementara meta melaporkan 20. Frontend selalu mengirim limit sehingga bug ini tidak terlihat di UI, tetapi API publik tidak aman untuk pemanggil baru.

**(5)** **Soft delete vs unique index.** Judul/slug unik tidak memperhitungkan baris terhapus. Membuat ulang setelah menghapus gagal di level database dengan 500, bukan 409 yang bisa ditindaklanjuti.

**(6)** **Lapisan usecase nyaris kosong.** Di destinationinfo/facility/faq, usecase hanya meneruskan panggilan; di package ia memetakan response dan menormalkan paginasi. Tidak ada aturan konsisten kapan logika berada di service vs usecase.
## 10.6 `internal/domain/gallery` — 9 berkas, 436 baris

### 10.6.1 `dto.go` + `validator.go`

```go
ImageURL string `json:"image_url" validate:"required,imageurl"`
```

**(1)** Galeri adalah satu-satunya domain yang validator-nya menerima **path relatif** hasil unggahan (`/api/v1/uploads/...`) selain URL http/https. Implementasinya ada di `validator.go` (`RegisterValidation("imageurl")`). Ini yang seharusnya dipakai juga oleh cover paket/artikel dan gambar fasilitas.

**(2)** `init()` mendaftarkan validator pada variabel package-level. Jika `Validate` dipanggil sebelum `init` (tidak mungkin di Go), validasi gagal; tidak ada risiko nyata.

**(3)** `Category` opsional tanpa daftar nilai; kategori galeri bebas, berbeda dari FAQ/visitor-rule yang `oneof`. Frontend menampilkan kategori sebagai teks.

**(4)** `SortOrder` tidak divalidasi; negatif diterima.

### 10.6.2 `entity.go`

**(1)** `UploadedBy` bukan `CreatedBy` — nama kolom berbeda dari domain lain, meski maknanya sama. Query audit lintas tabel harus memperhitungkan ini.

**(2)** Tidak ada flag publish/aktif. Semua item galeri yang tidak terhapus langsung tampil di publik; tidak ada draf.

**(3)** `Title` not null tetapi tidak unik; dua foto dengan judul sama diperbolehkan.

### 10.6.3 `errors.go`

**(1)** Hanya `ErrItemNotFound`.

### 10.6.4 `handler.go`

**(1)** `Create`/`Update`/`Delete` mengambil aktor dari middleware — konsisten dan lebih baik daripada facility/FAQ.

**(2)** `List` meneruskan page/limit mentah ke usecase yang menormalkan; meta memakai nilai mentah tetapi `BuildMeta` menormalkan juga. Aman.

**(3)** Tidak ada handler khusus admin untuk list; admin memakai `GET /gallery` publik yang sama. Tidak ada perbedaan data karena galeri tidak punya status.

### 10.6.5 `mapper.go` vs `dto.go`

**(1)** Ada **dua** fungsi pemetaan: `ToResponse` (dipakai handler Create/Update/Get) dan `toResponse` di mapper (dipakai usecase). Keduanya menghasilkan field yang sama dengan tipe berbeda (pointer vs value). Duplikasi yang bisa menyimpang jika field ditambah.

### 10.6.6 `repository.go`

**(1)** `List` menerapkan `Order` setelah `Count`; aman.

**(2)** Tidak ada filter kategori pada `FindByID`; tidak relevan.

**(3)** `Delete` soft-delete; `FindByID` tetap bisa menemukan item yang sudah dihapus? Tidak — scope GORM mengecualikan `deleted_at`, jadi 404.

### 10.6.7 `routes.go`

```go
content := rg.Group("", requireAuth, middleware.RequireRole("ADMIN", "super_admin"))
content.POST("/gallery", h.Create)
```

**(1)** Grup admin memakai prefix kosong lalu path lengkap. Bekerja, tetapi berbeda dari domain lain yang mengelompokkan `/admin/gallery`. Akibatnya rute admin galeri berada di `/gallery` (method POST/PUT/DELETE) — tidak ada pemisahan path admin vs publik, hanya method.

**(2)** `GET /gallery/:id` publik; tidak ada data sensitif, jadi kebocoran status tidak berlaku di sini.

### 10.6.8 `service.go`

**(1)** `Create` mengisi `UploadedBy` dari aktor — satu-satunya domain konten yang melakukannya dengan benar.

**(2)** `Update` mengisi `UpdatedBy`.

**(3)** `Delete` mengisi `DeletedBy` lalu update+delete tanpa transaksi (pola sama).

**(4)** Tidak ada validasi bahwa `ImageURL` benar-benar ada di disk; path arbitrer yang diawali `/` diterima.

### 10.6.9 `usecase.go`

**(1)** Memetakan response dan menormalkan paginasi seperti package. Dua domain (package, gallery) konsisten; lima lainnya tidak.

## 10.7 `internal/domain/article` — 9 berkas, 526 baris

### 10.7.1 `dto.go`

**(1)** `CoverImage` memakai `omitempty,url` — **tidak menerima path unggahan**. Form artikel hanya input URL, jadi konsisten dengan UI, tetapi tidak bisa memakai hasil unggahan tanpa mengganti validator.

**(2)** `Content` wajib min 20 dan dikirim sebagai teks biasa. Tidak ada flag format (Markdown/HTML); frontend merendernya dengan `whitespace-pre-line` (9.42.6).

**(3)** `Excerpt` tidak wajib; daftar artikel menampilkan `line-clamp-2` dari excerpt yang bisa kosong.

### 10.7.2 `entity.go`

**(1)** `Slug` unik dan dibuat otomatis; sama seperti paket, baris soft-delete menempati unique index sementara `SlugExists` mengabaikannya.

**(2)** `Status` draft/published/archived, `PublishedAt *int64`. Tidak ada validasi transisi: arsip bisa langsung dipublish lagi.

**(3)** `AuthorID` wajib, tetapi hanya UUID; tidak ada relasi/join ke nama penulis di response.

### 10.7.3 `errors.go`

**(1)** Hanya `ErrArticleNotFound`; tidak ada error untuk slug/status.

### 10.7.4 `handler.go`

**(1)** `Create` selalu draft; `Publish`/`Archive` terpisah. Pola yang baik.

**(2)** `List` meneruskan `status` query mentah. **Jika `status` kosong, repository tidak memfilter apa pun** — endpoint publik `GET /articles` mengembalikan draft dan arsip. Frontend selalu mengirim `status=published`, tetapi API terbuka.

**(3)** `Get` publik memakai usecase yang sama tanpa cek status — draf dapat dibaca lewat ID.

### 10.7.5 `mapper.go`

**(1)** `toResponse` menyertakan `Content` penuh di **list**. Daftar artikel 20 item mengirim seluruh isi artikel, bukan hanya excerpt. Pemborosan bandwidth yang nyata dan memperbesar payload halaman `/articles`.

**(2)** Tidak ada `CreatedAt`/`UpdatedAt` di response meski entity punya; frontend memakai `published_at`.

### 10.7.6 `repository.go`

```go
func (r *repository) FindPublishedBySlug(ctx, slug string) (*Article, error) { ... }
```

**(1)** Method ini **tidak dipanggil di mana pun** dan tidak ada rute `GET /articles/slug/:slug`. Sisa rencana routing berbasis slug yang tidak diselesaikan; frontend memakai UUID.

**(2)** `List` tanpa status mengembalikan semua; lihat 10.7.4.

**(3)** `SlugExists` mengabaikan baris soft-delete — sumber konflik unique index.

### 10.7.7 `routes.go`

**(1)** `rg.GET("/articles", h.List)` dan `GET /articles/:id` publik tanpa pembatasan status.

**(2)** Rute admin berada di prefix kosong dengan path `/articles/...`, bukan `/admin/articles`. Sama seperti galeri; metode yang membedakan.

### 10.7.8 `service.go`

**(1)** `Create` membuat slug dan draft; `AuthorID`, `CreatedBy`, `UpdatedBy` diisi.

**(2)** `Update` hanya membuat slug baru jika judul berubah; mengubah kapitalisasi memicu slug baru.

**(3)** `Publish` tidak memeriksa apakah konten cukup (content sudah wajib min 20) dan tidak menolak publish dari status archived.

**(4)** `uniqueSlug` memiliki loop tanpa batas seperti paket; nama non-latin menghasilkan slug kosong.

**(5)** `Delete` mengisi `DeletedBy` sebelum soft-delete dengan komentar yang menjelaskan alasannya — dokumentasi inline terbaik di antara domain konten.

### 10.7.9 `usecase.go`

**(1)** Memetakan response dan menormalkan paginasi. Total tiga domain (package, gallery, article) konsisten.

## 10.8 `internal/domain/visitorrule` — 9 berkas, 444 baris

### 10.8.1 `dto.go`

**(1)** `Category` `oneof=Keselamatan Lingkungan Kebersihan Kendaraan Aktivitas Pengunjung Larangan Informasi Umum`. Perhatikan "Aktivitas Pengunjung" mengandung spasi; nilai harus persis.

**(2)** `Priority` `oneof=low normal high critical`, opsional; service mengubah kosong menjadi `normal`.

**(3)** Tidak ada field aktif/nonaktif selain `is_published`; aturan yang sudah tidak berlaku harus dihapus atau dibiarkan draf.

### 10.8.2 `entity.go`

**(1)** `Priority` default `normal`, `IsPublished` default false. `CreatedBy`/`UpdatedBy`/`DeletedBy` ada tetapi tidak diisi.

**(2)** Tidak ada unique index; aturan duplikat diperbolehkan.

### 10.8.3 `errors.go`

**(1)** Hanya `ErrNotFound`.

### 10.8.4 `handler.go`

**(1)** `List` meneruskan page/limit mentah; `ListPublished` tanpa batas.

**(2)** `GET /visitor-rules/:id` publik membuka aturan yang belum dipublikasikan.

### 10.8.5 `repository.go`

```go
q := r.db.Model(&VisitorRule{}).Order("category ASC, priority DESC, sort_order ASC, created_at DESC")
```

**(1)** `priority DESC` mengurutkan **secara alfabetis terbalik**: `normal`, `low`, `high`, `critical`. Aturan `critical` justru muncul paling akhir dalam kategorinya, kebalikan dari yang diharapkan. Perlu `CASE` eksplisit atau kolom numerik.

**(2)** `ListPublished` memfilter `is_published` saja; tidak ada filter kategori wajib.

**(3)** Tidak ada pencarian teks.

### 10.8.6 `routes.go`

**(1)** Pola kebocoran sama: `public.GET("/:id", h.Get)`.

**(2)** Admin `/admin/visitor-rules` hanya ADMIN/super_admin.

### 10.8.7 `service.go`

**(1)** `Create`/`Update` tidak menerima aktor; audit kosong.

**(2)** `Update` mengganti seluruh field; `Priority == ""` diubah ke `normal`, bukan mempertahankan nilai lama.

**(3)** `Delete` tidak mengisi `DeletedBy`.

**(4)** `List` tanpa normalisasi paginasi.

### 10.8.8 `usecase.go`

**(1)** Pass-through 6 method.

### 10.8.9 `validator.go`

**(1)** Sama: pesan generik.

## 10.9 Pola tambahan setelah tujuh domain

**(1)** **Kebocoran status artikel lebih luas daripada domain lain.** `GET /articles` tanpa `status` mengembalikan semua status, dan `GET /articles/:id` membuka draf. Ini bukan hanya "ID yang ditebak": daftar publik bisa memuat draf secara langsung jika parameter dihilangkan.

**(2)** **Slug tidak pernah dipakai untuk routing.** Paket dan artikel menyimpan slug unik, tetapi rute hanya `/:id`. `FindPublishedBySlug` di artikel adalah kode mati. Frontend memakai UUID, sehingga manfaat SEO slug hilang.

**(3)** **Urutan prioritas salah di visitor-rule.** `priority DESC` alfabetis menempatkan `critical` paling bawah. Ini bug perilaku yang terlihat di UI admin (jika diurutkan) dan publik.

**(4)** **Audit aktor bergantung pada domain.** Galeri, artikel, dan paket mengisi kolom audit; destinationinfo mengisi; facility, FAQ, dan visitor-rule tidak. Tidak ada aturan middleware yang mengisinya otomatis.

**(5)** **Validasi URL tidak seragam.** Galeri punya validator `imageurl` yang menerima path unggahan; package/article/facility memakai `url` bawaan yang menolaknya. Selama UI hanya meminta URL manual, tidak terlihat; begitu unggahan dipakai, tiga domain gagal menyimpan.

**(6)** **Dua gaya response.** Tiga domain (package, gallery, article) mengembalikan DTO dari usecase; empat lainnya mengembalikan entity dan memetakan di handler. Tidak ada dampak fungsional, tetapi menyulitkan perubahan kontrak global.

**(7)** **Tidak ada transaksi pada operasi dua langkah.** Semua `Delete` yang mengisi `DeletedBy` melakukan UPDATE lalu DELETE terpisah. Kegagalan di langkah kedua meninggalkan baris hidup dengan penanda hapus.
## 10.10 `internal/domain/user` — 9 berkas, 267 baris

### 10.10.1 `dto.go`

**(1)** Hanya ada `SetActiveRequest` dan `AdminUserResponse`. Tidak ada endpoint create/update/delete user di domain ini; pembuatan akun sepenuhnya milik auth/register.

**(2)** `Roles []string` diisi usecase lewat `RoleLister`, bukan preload GORM. Desainnya menghindari impor silang, dengan biaya satu query per user (lihat 10.10.8).

### 10.10.2 `entity.go`

**(1)** `AdminUser` memetakan tabel `users` yang sama dengan `auth.User`, tetapi hanya field yang dibutuhkan. Komentar menjelaskan trade-off ini dengan baik.

**(2)** **Tidak ada field `UpdatedBy`.** Ini penting karena repository menulis kolom `updated_by` (10.10.5), kolom yang juga tidak ada di `auth.User`. AutoMigrate tidak akan pernah membuatnya.

**(3)** `DeletedAt` ada agar GORM menyaring baris terhapus — benar dan disengaja.

### 10.10.3 `errors.go`

**(1)** Satu error `USER_001`, komentar menjelaskan duplikasi dengan `auth.ErrUserNotFound` (kode berbeda untuk kondisi sama).

**(2)** Kode error `USER_001` tidak dipakai frontend; UI hanya menampilkan pesan.

### 10.10.4 `handler.go`

**(1)** `List` meneruskan `search` apa adanya ke usecase; tidak ada batas panjang. String LIKE yang sangat panjang bisa membebani query, meski parameterized.

**(2)** `SetActive` tidak memvalidasi bahwa target bukan diri sendiri atau admin terakhir. Admin dapat menonaktifkan akunnya sendiri dan terkunci (jika endpoint bekerja — lihat 10.10.5).

**(3)** `middleware.CurrentUserID(c)` dikirim sebagai aktor, tetapi aktor tidak pernah tersimpan karena kolomnya tidak ada.

### 10.10.5 `repository.go`

```go
func (r *repository) SetActive(ctx context.Context, id string, active bool, actorID string) error {
	return r.db.WithContext(ctx).Model(&AdminUser{}).Where("id = ?", id).
		Updates(map[string]interface{}{"is_active": active, "updated_by": actorID}).Error
}
```

**(1)** **Terkonfirmasi gagal di database nyata.** `PRAGMA table_info(users)` pada `backend/data/kawahputih.db` menghasilkan kolom: `id, created_at, updated_at, deleted_at, name, email, phone, password_hash, google_id, avatar_url, is_active, is_verified, gate, shift, last_login_at` — **tidak ada `updated_by`**. SQLite akan menolak UPDATE dengan "no such column: updated_by", sehingga `PATCH /admin/users/:id/active` selalu 500.

**(2)** Karena `Updates` menerima map dengan dua kunci, seluruh statement gagal; `is_active` pun tidak berubah. Tidak ada fallback.

**(3)** `List` memakai `name LIKE ? OR email LIKE ?` tanpa `LOWER()`. SQLite LIKE case-insensitive untuk ASCII secara default, jadi "Budi" cocok dengan "budi" — beruntung, tetapi bergantung pada perilaku SQLite, bukan SQL portabel.

**(4)** `List` menghitung `Count` lalu `Find` pada query yang sama; aman.

### 10.10.6 `routes.go`

**(1)** `RequireRole("ADMIN")` saja. Role `super_admin` yang disebut di domain lain **tidak** diizinkan di sini. Jika ada akun dengan role tersebut, ia tidak bisa mengelola user, tidak konsisten dengan routes lain yang menerima `"ADMIN","super_admin"`.

**(2)** Hanya dua rute: list dan set active. Tidak ada detail user, reset password, atau ubah role (role punya endpoint sendiri).

### 10.10.7 `service.go`

**(1)** `SetActive` memanggil `FindByID` untuk memastikan user ada, lalu update. Dua query; bisa diganti `RowsAffected`.

**(2)** Tidak ada pencatatan audit eksplisit; mengandalkan middleware audit global yang mencatat aksi, bukan perubahan kolom.

### 10.10.8 `usecase.go`

```go
for _, usr := range users {
	roleNames, err := u.roles.GetRoleNames(ctx, usr.ID)
	...
}
```

**(1)** **N+1 query**: satu query daftar user, lalu satu query role per user. Halaman 20 user = 21 query. Untuk 100 user = 101 query.

**(2)** Jika pengambilan role gagal untuk satu user, seluruh daftar gagal (return error), bukan menampilkan user tanpa role.

**(3)** `normalizePaging` membatasi 1–100. Konsisten dengan package/gallery/article.

### 10.10.9 `validator.go`

**(1)** Tidak dipakai di handler mana pun (`Validate` tidak dipanggil untuk `SetActiveRequest`, yang hanya berisi bool). File ini praktis mati.

## 10.11 `internal/domain/role` — 9 berkas, 355 baris

### 10.11.1 `dto.go`

**(1)** `AssignRolesRequest` mewajibkan minimal satu role, tetapi **tidak membatasi nilai** ke empat role kanonik. String apa pun diterima; role tak dikenal dibuang diam-diam.

**(2)** `RoleResponse.Permissions` `omitempty`; role tanpa permission tidak menampilkan field, bukan array kosong.

### 10.11.2 `entity.go`

**(1)** Empat role kanonik: ADMIN, MANAGER, PETUGAS, PENGUNJUNG. Tidak ada `super_admin` meski beberapa routes menyebutnya — role itu tidak pernah dibuat oleh seed.

**(2)** `userRole` adalah struct join tanpa primary key komposit; `AssignRole` memakai `OnConflict DoNothing`, yang hanya efektif jika ada unique index pada `(user_id, role_id)`. Perlu dipastikan migrasi membuatnya; jika tidak, duplikat bisa masuk.

**(3)** `Role.Permissions` many2many `role_permissions`; permission tidak dipakai di middleware mana pun (RequireRole hanya nama role).

### 10.11.3 `errors.go`

**(1)** Hanya `ErrRoleNotFound`, dipakai saat role default PENGUNJUNG tidak ada di database.

### 10.11.4 `handler.go`

**(1)** `AssignToUser` memvalidasi body, lalu memanggil usecase. Tidak ada pengecekan user target ada/tidak.

**(2)** Tidak ada endpoint untuk melihat role satu user; frontend hanya bisa melihat daftar role dan (lewat user list) role masing-masing.

### 10.11.5 `repository.go`

**(1)** `ListRoles` mem-preload permissions; empat role saja, murah.

**(2)** `GetRoleNamesForUser` memakai join mentah, menghindari impor auth — konsisten dengan komentar arsitektur.

**(3)** `ReplaceRoles` memakai transaksi hapus-lalu-tambah. Komentar menyebut risiko "akun tanpa role" jika tanpa transaksi; implementasinya sudah transaksi, jadi komentar menjelaskan alasan, bukan bug.

**(4)** `AssignRole` `OnConflict DoNothing` tanpa target kolom; SQLite memakai conflict pada constraint apa pun. Jika tidak ada unique index, tidak ada konflik yang terdeteksi dan duplikat masuk.

### 10.11.6 `routes.go`

**(1)** Alias `/super-admin/roles` dan `/super-admin/users/:userId/roles` dipertahankan untuk kompatibilitas, tetapi otorisasinya ADMIN. Nama path menyesatkan; tidak ada peran super-admin.

**(2)** Semua rute role hanya ADMIN, bukan super_admin — konsisten dengan kenyataan bahwa role itu tidak ada.

### 10.11.7 `service.go`

```go
roles, err := s.repo.FindRolesByNames(ctx, roleNames)
...
if err := s.repo.ReplaceRoles(ctx, userID, roleIDs); err != nil { ... }
```

**(1)** **Role tak dikenal dibuang tanpa error.** Jika admin mengirim `["ADMNN"]`, `FindRolesByNames` mengembalikan kosong, `ReplaceRoles` menghapus semua role user, dan API membalas sukses. Pengguna kehilangan seluruh aksesnya karena salah ketik. Seharusnya bandingkan jumlah nama yang diminta dengan yang ditemukan dan kembalikan 400.

**(2)** Tidak ada pengecekan user target. Role bisa ditetapkan ke UUID yang tidak ada (jika foreign key SQLite tidak aktif), menghasilkan baris yatim.

**(3)** Tidak ada perlindungan terhadap penghapusan role ADMIN terakhir atau role diri sendiri. Admin bisa menurunkan dirinya menjadi PENGUNJUNG dan tidak ada admin tersisa.

**(4)** Perubahan role **tidak mencabut token**. JWT membawa role saat login; pengguna yang dicabut ADMIN-nya tetap memiliki akses sampai access token kedaluwarsa (dan refresh token masih berlaku). Ini eskalasi hak yang tertunda.

**(5)** `AssignDefaultRole` idempoten dan aman; jika role default hilang, mengembalikan 404 yang jelas.

### 10.11.8 `usecase.go`

**(1)** Sepenuhnya pass-through; komentar menjelaskan bahwa pemisahan hanya demi konsistensi struktur.

### 10.11.9 `validator.go`

**(1)** Sama: pesan generik, dipakai hanya untuk `AssignRolesRequest`.

## 10.12 `internal/domain/visitors` — 4 berkas, 380 baris

Domain ini tidak mengikuti struktur service/usecase: `handler.go` memuat `Service` dan `RegisterRoutes`, sementara `repository.go` memuat seluruh query. Tidak ada `dto.go`, `errors.go`, `routes.go`, `service.go`, `usecase.go`, atau `validator.go` terpisah.

### 10.12.1 `entity.go`

**(1)** `Visitor.JoinedAt` memakai `gorm:"->"` (read-only) dan dipetakan dari `users.created_at`. `IsActive` `json:"-"` sehingga status tidak dikirim untuk pengunjung.

**(2)** `StatsRow` menambahkan agregat booking: total booking, total belanja, kunjungan terakhir. `TotalSpent` hanya menghitung status PAID/CONFIRMED/USED.

**(3)** `Staff.Role` dan `Staff.Status` memakai `gorm:"-"` karena diisi manual dari hasil join; `Status` adalah string "AKTIF"/"NONAKTIF" turunan, bukan kolom.

**(4)** `StaffStats.ByRole` adalah map; urutan JSON tidak stabil, tidak masalah untuk UI yang membaca per key.

### 10.12.2 `handler.go`

```go
func (h *Handler) ListVisitors(c *gin.Context) {
	rows, err := h.service.repo.ListVisitors(c.Request.Context())
```

**(1)** Handler memanggil **repository langsung**, melewati service. `Service` hanya pembungkus repo tanpa method; lapisan ini tidak menambah apa pun.

**(2)** `ListVisitors`/`ListStaff` tidak menerima page/limit meski ada helper `pageParams` di file yang sama. **`pageParams` tidak pernah dipanggil** — sisa fitur paginasi yang tidak diselesaikan. Semua pengunjung/staf dimuat sekaligus.

**(3)** `SetStaffStatus` memvalidasi hanya nilai `AKTIF`/`NONAKTIF`. Tidak ada pengecekan bahwa target adalah staf; endpoint dapat menonaktifkan **pengunjung** mana pun lewat `/admin/staff/:id/status`.

**(4)** `SetStaffStatus` tidak mengirim aktor; perubahan status staf tidak tercatat siapa pelakunya.

**(5)** `GetVisitor`/`GetStaff` mengembalikan 404 eksplisit jika nil, berbeda dari domain lain yang memakai error domain. Konsisten secara perilaku.

**(6)** `RegisterRoutes` didefinisikan di handler.go, bukan routes.go — satu-satunya domain yang begitu.

### 10.12.3 `repository.go`

```go
const visitorJoin = `JOIN user_roles ON user_roles.user_id = users.id
	JOIN roles ON roles.id = user_roles.role_id`
```

**(1)** Join ke `user_roles` bersifat **inner**: pengguna tanpa role tidak pernah muncul di daftar pengunjung maupun staf. Akun lama/yatim menjadi tidak terlihat.

**(2)** Pengguna dengan lebih dari satu role yang cocok akan muncul **duplikat**. Untuk pengunjung filter `roles.name = 'PENGUNJUNG'` hanya satu baris per assignment; jika assignment duplikat ada (lihat 10.11.2), baris berulang. Untuk staf, filter `IN ('ADMIN','MANAGER','PETUGAS')` menggandakan staf yang punya dua role, dan `StaffStats` menghitungnya dua kali.

**(3)** `FindVisitorByID` memuat **seluruh** daftar pengunjung lalu melakukan pencarian linear di Go. Satu permintaan detail = full table scan + agregat semua booking. Ini akan menjadi lambat seiring data.

**(4)** `VisitorStats` juga memuat semua baris lalu menghitung di Go, termasuk perbandingan tanggal sebagai string (`JoinedAt.Format(...) >= firstOfMonth`). Bekerja, tetapi tidak memanfaatkan SQL dan bergantung pada zona waktu server.

**(5)** Subquery `booking_stats` mengagregasi **seluruh** tabel bookings setiap kali daftar pengunjung diminta, meski hanya butuh 20 baris. Tidak ada filter tanggal atau indeks yang dibuktikan.

**(6)** `SetStaffActive` mengembalikan `errors.New("staff not found")` polos. Handler membungkusnya dengan `apperror.Internal`, jadi user tidak ditemukan menjadi **500**, bukan 404.

**(7)** `SetStaffActive` hanya memperbarui `is_active`; tidak ada `updated_by` (kolom tidak ada) dan tidak ada pencabutan sesi. Staf yang dinonaktifkan tetap bisa memakai access token sampai kedaluwarsa.

**(8)** `StaffStats` menghitung `ByRole` dari baris hasil join; role ganda menggembungkan total.

### 10.12.4 Ketiadaan berkas lain

**(1)** Tidak ada `service.go`/`usecase.go`: aturan bisnis (filter role, agregat) bercampur di SQL dan handler. Tidak ada tempat untuk validasi "tidak boleh menonaktifkan diri sendiri" atau pencatatan audit.

**(2)** Tidak ada `routes.go`: sulit melihat peta rute domain ini tanpa membuka handler.

**(3)** Tidak ada `errors.go`: error domain tidak ada, sehingga status HTTP ditentukan ad hoc (404 manual atau 500 dari error polos).

## 10.13 Ringkasan temuan administrasi

**(1)** **Endpoint ubah status user selalu gagal** karena menulis kolom `updated_by` yang tidak ada di tabel `users` (diverifikasi lewat `PRAGMA table_info`). Ini bug fungsional, bukan sekadar inkonsistensi.

**(2)** **Penetapan role dapat mengosongkan akses tanpa error.** Nama role yang salah ketik dibuang diam-diam, semua role lama dihapus, API membalas sukses.

**(3)** **Tidak ada perlindungan admin terakhir/diri sendiri.** Baik `SetActive` maupun `ReplaceRoles` mengizinkan akun admin menonaktifkan atau menurunkan dirinya, berpotensi mengunci sistem.

**(4)** **Perubahan role dan status tidak mencabut token.** JWT membawa role; pencabutan baru berlaku setelah token kedaluwarsa.

**(5)** **Data pengunjung/staf dimuat tanpa paginasi dan diagregasi ulang setiap request.** Detail pengunjung memuat seluruh tabel. Helper `pageParams` ada tetapi tidak dipakai.

**(6)** **Join role menggandakan baris.** Staf dengan dua role muncul dua kali dan dihitung dua kali di statistik; pengguna tanpa role hilang sama sekali.

**(7)** **Konsistensi peran tidak terjaga.** `user` hanya ADMIN, `role` hanya ADMIN, sementara package/facility/faq menerima ADMIN dan `super_admin` yang tidak pernah ada. Tidak ada satu sumber kebenaran untuk daftar peran yang berwenang.
## 10.14 `internal/domain/public` — 8 berkas, 722 baris

### 10.14.1 `entity.go` — tabel yang tidak pernah dimigrasikan

**(1)** Domain ini memetakan lima tabel: `destinations`, `facilities`, `faqs`, `reviews`, dan `contents`. `AutoMigrate` di `cmd/server/bootstrap.go` **tidak** mendaftarkan `Destination`, `Review`, maupun `Content`; hanya `facility.Facility` dan `faq.FAQ` yang membuat tabel `facilities`/`faqs`.

**(2)** Verifikasi langsung pada `backend/data/kawahputih.db`: tabel `destinations`, `contents`, dan `reviews` **tidak ada** (PRAGMA mengembalikan daftar kosong). Tabel `facilities` dan `faqs` ada, tetapi tanpa kolom `is_active`/`category` yang diharapkan domain ini.

**(3)** Akibatnya seluruh endpoint `/api/v1/public/*` yang menyentuh tabel tersebut menghasilkan error SQL (500): destinasi, konten, ulasan, fasilitas, dan FAQ. Rute tetap terdaftar di `routes.go`, jadi kegagalan baru terlihat saat dipanggil.

**(4)** Ini duplikasi model yang tidak terpelihara: `facility.Facility` (status, is_published, image_url) dan `public.Facility` (is_active, category) memetakan tabel yang sama dengan skema berbeda. Tidak ada migrasi yang menyatukan keduanya.

**(5)** `Content` memiliki tipe article/event/promotion/page dan status draft/published/archived — konsep yang tumpang tindih dengan domain `article`. Tidak ada admin CRUD untuk `contents`; tabelnya pun tidak dibuat.

### 10.14.2 `dto.go`

**(1)** Semua response memakai `time.RFC3339` (bukan layout manual seperti domain konten lain), konsisten di dalam domain ini tetapi berbeda dari bagian lain aplikasi.

**(2)** `ToDestinationResponse` tidak memeriksa nil; handler memanggilnya setelah service memastikan item ada.

**(3)** `PriceInfoResponse` tidak memiliki tanggal. `Available` diisi dari kapasitas (lihat 10.14.6).

**(4)** `ContentResponse` menyertakan `Body` penuh di daftar — sama seperti artikel, payload besar tanpa kebutuhan.

### 10.14.3 `errors.go`

**(1)** `ErrNotFound` dan `ErrInvalidCategory`. `ErrInvalidCategory` **tidak dipakai** karena tidak ada validasi kategori di service; parameter kategori diteruskan mentah ke query.

### 10.14.4 `handler.go`

**(1)** Semua handler langsung memanggil service; tidak ada usecase — konsisten dengan "public adalah lapisan baca".

**(2)** `GetReviews` memaksa limit default 10 tetapi tidak membatasi maksimum. `limit=100000` diteruskan ke query; tidak ada clamp.

**(3)** `GetContents` mengirim `page, limit` mentah ke `BuildMeta`, sementara service menormalkan page/limit sendiri. Jika `limit=500`, service mengubahnya menjadi 20, tetapi meta melaporkan 500 — meta dan isi tidak cocok.

**(4)** `GetContentByID`/`GetContentBySlug` hanya memanggil service, yang tidak memfilter status — draf bisa dibaca publik (lihat 10.14.6).

### 10.14.5 `repository.go`

**(1)** `FindDestinationBySlug` memakai slug; ini satu-satunya domain yang benar-benar memakai slug untuk lookup. Namun tabelnya tidak ada, jadi belum pernah berfungsi.

**(2)** `ListContents` memfilter published **hanya jika status kosong**; service selalu mengirim published, jadi aman dari sisi service. Pemanggil langsung repository bisa melewatinya.

**(3)** `FindContentBySlug` dan `FindContentByID` **tidak** memfilter status. Return `(nil, nil)` untuk tidak ditemukan, dan service mengubahnya menjadi 404 — tetapi draf juga ditemukan.

**(4)** `ListReviews` dengan `approvedOnly=false` dipakai `GetPrices` (lihat 10.14.6), bukan untuk ulasan.

### 10.14.6 `service.go`

```go
sold, err := s.repo.ListReviews(ctx, "", false, 0)
_ = sold
```

**(1)** `GetPrices` mengambil daftar **ulasan** lalu membuang hasilnya. Jelas sisa implementasi lain; error dari query ini juga diabaikan total (tidak dicek).

**(2)** `Available` selalu sama dengan `Capacity`. Tidak ada pengurangan tiket terjual, padahal `tickettype` punya `SalesCounter` yang menghitung penjualan hari ini. Endpoint `/public/prices` karena itu menampilkan stok penuh meski tiket habis.

**(3)** `GetContents` menormalkan page/limit (default 20, maks 50) dan selalu memaksa `published`. Ini benar, tetapi handler memakai nilai mentah untuk meta.

**(4)** `GetContentBySlug`/`GetContentByID` tidak memeriksa `Status == published`; konten draf/arsip dapat diakses lewat slug/ID.

**(5)** Tidak ada penanganan kategori tidak valid; `ErrInvalidCategory` mati.

### 10.14.7 `routes.go`

**(1)** Dua belas rute publik terdaftar, termasuk alias `/ticket-types` dan `/prices` yang menunjuk handler sama.

**(2)** Rute `/public/content/:id` didaftarkan **sebelum** `/public/content/slug/:slug`; Gin mencocokkan segmen, dan `slug` bukan nilai `:id` yang valid? Keduanya berbeda jumlah segmen (`/content/:id` vs `/content/slug/:slug`), jadi tidak bentrok.

**(3)** Tidak ada rute untuk event/promotion secara khusus; semuanya lewat `/content?type=`.

### 10.14.8 `validator.go`

**(1)** Tidak dipakai; tidak ada request body di domain ini.

## 10.15 `internal/domain/tickettype` — 8 berkas, 641 baris

### 10.15.1 `dto.go`

**(1)** `Price` wajib `min=1`; tiket gratis tidak mungkin. `Capacity` juga wajib min 1 — tidak ada tiket tanpa batas.

**(2)** `Code` opsional; jika kosong dibuat otomatis. Saat update, `Code` diabaikan sepenuhnya (service tidak menyalinnya), jadi kode tidak bisa diubah setelah dibuat.

**(3)** `Status` hanya divalidasi di service (`AKTIF`/`NONAKTIF`), bukan di tag validator. Nilai salah menjadi error domain, bukan validation error per field.

### 10.15.2 `entity.go`

**(1)** `Code` unik; `Category` default ENTRANCE; `IsActive` tanpa default di tag (boolean false default). Service selalu mengisi dari status.

**(2)** `CreatedBy`/`UpdatedBy` diisi service — salah satu domain yang audit-nya benar.

**(3)** `Categories` mendefinisikan enam kategori, tetapi `validCategory` hanya dipakai saat create/update; `List` menerima kategori apa pun dan mengembalikan kosong.

### 10.15.3 `handler.go`

**(1)** `withAvailability` menghitung `Available` hanya untuk **hari ini** (`time.Now()`), bukan tanggal kunjungan. Endpoint katalog tidak menerima parameter tanggal, sehingga angka "tersedia" tidak berlaku untuk pemesanan tanggal lain.

**(2)** Jika `sales == nil`, `Available` dibiarkan sama dengan `Capacity` dari mapper — bukan error, tetapi diam-diam menampilkan stok penuh.

**(3)** `List` menerima `limit` dan `per_page` (kompatibilitas frontend). `clampPage` default 20, maks 100.

**(4)** `Get` dan `GetByCode` membungkus item menjadi slice agar bisa memakai `withAvailability`, lalu mengambil `[0]`. Jika sales mengembalikan map kosong, tetap aman karena slice berisi satu item.

**(5)** `SetStatus` tidak memvalidasi body dengan `Validate`; status divalidasi di service. Konsisten secara perilaku.

### 10.15.4 `mapper.go`

**(1)** `Available` diisi `Capacity` sebagai nilai awal; handler menimpanya jika ada data penjualan.

**(2)** `Status` diturunkan dari `IsActive`, bukan kolom tersimpan — tidak ada risiko nilai status tidak sinkron.

### 10.15.5 `repository.go`

**(1)** `List` hanya memfilter status jika persis `AKTIF`/`NONAKTIF`; nilai lain tidak memfilter apa pun, tetapi service sudah menolak nilai lain lebih dulu.

**(2)** `ListActive` mengembalikan semua tiket aktif tanpa paginasi; jumlah jenis tiket kecil, aman.

**(3)** `CountCategories` mengembalikan kategori yang benar-benar ada di database, bukan daftar `Categories`. Frontend bisa melihat kategori kustom yang tidak bisa dibuat lewat API.

**(4)** `FindByCode` case-sensitive pada SQLite; kode disimpan uppercase oleh service, jadi pencarian dengan huruf kecil gagal. Route `GET /tickets/code/:code` meneruskan apa adanya.

### 10.15.6 `service.go`

**(1)** `Create` memvalidasi harga, kapasitas, kategori, status, lalu membuat kode. Jika kode bentrok, mengembalikan `ErrCodeExists` (409) tanpa mencoba sufiks.

**(2)** `generateCode` deterministik: nama "Tiket Dewasa" selalu menghasilkan kode yang sama; dua tiket dengan huruf dan panjang sama (mis. "Dewasa" dan "Awedas") bisa bentrok dan gagal dibuat. Tidak ada loop unik seperti slug.

**(3)** `generateCode` memotong `base` pada 14 karakter **sebelum** menambahkan `-NNNN`; jika nama panjang, sufiks tetap ada, tetapi bagian nama terpotong di tengah kata.

**(4)** `GetMany` melakukan query per ID (N+1) dan dipakai booking untuk menghitung harga. Untuk 5 jenis tiket = 5 query; bisa diganti `WHERE id IN (...)`.

**(5)** `Update` tidak mengubah `Code` dan tidak memeriksa duplikasi nama; `UpdatedBy` diisi.

**(6)** `SetStatus` memakai `Get` (yang mengembalikan 404 jika tidak ada) lalu `Save` seluruh baris. Dua query.

**(7)** `Delete` soft-delete; booking lama tetap merujuk tiket yang sudah tidak aktif. Tidak ada pengecekan apakah tiket sedang dipakai booking PENDING.

**(8)** `parseStatus` menerima string kosong sebagai AKTIF. Pada `Update`, klien yang tidak mengirim status akan **mengaktifkan** tiket yang sebelumnya nonaktif — penggantian penuh lagi.

### 10.15.7 `routes.go`

**(1)** Urutan rute benar: `/tickets/active`, `/tickets/categories`, dan `/tickets/code/:code` didaftarkan sebelum `/tickets/:id`, sehingga tidak tertelan parameter.

**(2)** `GET /tickets` publik menerima `status=NONAKTIF` dan mengembalikan tiket nonaktif. Tidak ada pembatasan; katalog publik bisa menampilkan tiket yang sudah dinonaktifkan.

**(3)** `GET /tickets/:id` publik membuka tiket nonaktif lewat ID. Sama seperti domain konten.

**(4)** Semua mutasi hanya ADMIN/super_admin; manager tidak bisa mengelola tiket.

## 10.16 Dua temuan backend yang terverifikasi langsung

**(1)** **Domain `public` praktis mati.** Tiga tabel yang dibaca tidak pernah dimigrasikan, dan dua tabel yang ada memakai nama kolom berbeda (`is_active` vs `is_published`/`status`). Semua endpoint `/public/destinations`, `/public/content`, `/public/reviews`, `/public/facilities`, dan `/public/faq` akan gagal 500 saat dipanggil. Ini bukan sekadar "belum dipakai frontend" — rutenya terdaftar dan mengklaim berfungsi.

**(2)** **`/public/prices` menampilkan stok palsu.** `Available` selalu = `Capacity`; kode mengambil ulasan lalu membuangnya. Tiket yang habis tetap tampil tersedia.

**(3)** **`Available` di `/tickets` hanya untuk hari ini.** Katalog tidak menerima tanggal, sehingga angka ketersediaan tidak relevan untuk pemesanan di tanggal lain, tetapi UI dapat menampilkannya sebagai stok umum.

**(4)** **Tiket nonaktif tetap dapat dibaca publik** lewat `/tickets`, `/tickets/:id`, dan `/tickets/code/:code`, meski tidak bisa dipesan (booking memvalidasi aktif).
---


# 12. Bedah mendalam: analytics, audit, dan verification

Bagian ini membahas berkas yang tersisa dengan resolusi lebih tinggi: setiap baris yang menentukan perilaku dikutip, lalu dijelaskan sampai tingkat token — tipe, operator, tag struct, dan efek runtime. Untuk ekspresi yang rawan, urutan evaluasi diuraikan karakter demi karakter.

## 12.1 `internal/domain/analytics/dto.go`

```go
TotalBookings int64 `json:"total_bookings"`
```

**(1)** `int64` dipilih agar jumlah besar tidak meluap di 32-bit. JSON mengirimnya sebagai angka; JavaScript aman sampai `2^53-1`, jauh di atas jumlah booking realistis.

**(2)** Tag `json:"total_bookings"` adalah raw string literal (backtick). Isinya `json:` + `"` + nama + `"`. Tanpa `omitempty`, nilai 0 tetap dikirim — penting agar frontend bisa membedakan "0" dari "field tidak ada".

```go
ConversionRate float64 `json:"conversion_rate"`
```

**(3)** Satu-satunya field pecahan. JSON bisa mengirim `12.3`; frontend menampilkannya dengan `toFixed(1)` atau sejenisnya. Pembulatan dilakukan di service, bukan di sini.

```go
Metadata map[string]interface{} `json:"metadata,omitempty"`
```

**(4)** Ini ada di audit, bukan analytics, tetapi polanya sama: `map[string]interface{}` membuat nilai apa pun bisa masuk. `omitempty` menghilangkan map kosong **dan** nil, sehingga frontend harus memperlakukan `undefined` sebagai "tidak ada metadata".

## 12.2 `analytics/service.go` — `ResolveRange`, baris demi baris

```go
func ResolveRange(rangePreset, customJSON, fromQ, toQ string) (*Range, error) {
```

**(1)** Empat parameter string semuanya `string`; tidak ada tipe `time.Time` di batas API. Seluruh tanggal diperlakukan sebagai teks `YYYY-MM-DD`. Perbandingan tanggal karena itu bisa memakai `>=`/`<=` string, yang benar hanya karena format ISO selalu panjang tetap dan nol-di-depan.

```go
today := time.Now().Format("2006-01-02")
```

**(2)** Layout `"2006-01-02"` bukan pola bebas: angka-angka itu adalah tanggal referensi Go (2 Jan 2006, 15:04:05). Karakter `-` dipertahankan literal. `Format` memakai zona waktu lokal server — bukan zona pengunjung. Booking yang dibuat 23:30 UTC akan dihitung "besok" di server UTC+7.

```go
day := func(iso string) time.Time {
	d, _ := time.Parse("2006-01-02", iso)
	return d
}
```

**(3)** `:=` mendeklarasikan variabel fungsi lokal bertipe `func(string) time.Time`. Di dalamnya, `d, _ :=` membuang **error**. Jika `iso` adalah `"2026-13-99"` atau string kosong, `time.Parse` mengembalikan `time.Time{}` (tahun 1, Januari 1, 00:00 UTC) dan error yang dibuang. Semua perhitungan berikutnya memakai tanggal tahun 1 tanpa peringatan.

```go
before := func(iso string, n int) string {
	return day(iso).AddDate(0, 0, -n).Format("2006-01-02")
}
```

**(4)** `AddDate(years, months, days)` menormalkan tanggal (31 Jan + 1 bulan = 3 Mar). Di sini bulan/tahun 0, hanya `-n` hari. `-n` adalah negasi unary pada `n`; jika `n` negatif, hasilnya menambah hari.

**(5)** Rantai evaluasi: `day(iso)` → `AddDate` → `Format`. Tidak ada pengecekan error di mana pun.

```go
case "today":
	return &Range{From: today, To: today, Label: "Hari ini", PrevFrom: before(today, 1), PrevTo: before(today, 1)}, nil
```

**(6)** Struct literal dengan field bernama; `&Range{...}` mengembalikan pointer. Untuk "hari ini", periode sebelumnya adalah kemarin (from=to=kemarin), sehingga perubahan persen membandingkan hari ini dengan kemarin.

```go
case "30d":
	return &Range{From: before(today, 29), To: today, ..., PrevFrom: before(today, 59), PrevTo: before(today, 30)}, nil
```

**(7)** 30 hari inklusif: hari ini + 29 hari ke belakang. Periode sebelumnya 30 hari tepat sebelum itu: dari hari ke-59 sampai hari ke-30. Tidak ada tumpang tindih.

```go
d := day(today)
first := time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, time.Local)
prevFirst := first.AddDate(0, -1, 0)
prevLast := first.AddDate(0, 0, -1)
```

**(8)** `time.Date` menerima tahun, bulan, hari, jam, menit, detik, nanodetik, lokasi. `d.Month()` bertipe `time.Month` (integer dengan `String()`), bukan string. `AddDate(0, -1, 0)` memberi tanggal 1 bulan sebelumnya; `AddDate(0, 0, -1)` memberi hari terakhir bulan sebelumnya. Benar untuk Maret (1 Mar - 1 hari = 28/29 Feb).

```go
case "custom":
	from, to := fromQ, toQ
	if from == "" || to == "" {
		var c struct { From string `json:"from"`; To string `json:"to"` }
		if err := json.Unmarshal([]byte(customJSON), &c); err == nil {
			from, to = c.From, c.To
		}
	}
```

**(9)** `from, to := fromQ, toQ` adalah multiple assignment; kedua variabel string baru. Prioritas: query `from`/`to`, lalu JSON `custom`.

**(10)** `json.Unmarshal([]byte(customJSON), &c)` mengubah string menjadi `[]byte` (salinan), lalu mengisi struct anonim. Error diabaikan lewat `err == nil`; JSON rusak berarti `from`/`to` tetap kosong dan berujung pada error validasi di bawah — perilaku yang wajar, meski pesannya tidak menyebut JSON rusak.

```go
n := int(day(to).Sub(day(from)).Hours()/24) + 1
```

**(11)** Urutan: `Sub` menghasilkan `time.Duration` (int64 nanodetik); `.Hours()` membagi dengan 3.6e12 → `float64`; `/24` → jumlah hari pecahan; `int(...)` **memotong** ke bawah menuju nol (bukan membulatkan); `+1` membuat inklusif. Untuk 1–31 Jan: 30 + 1 = 31.

**(12)** Karena `day()` membuang error, `from` tidak valid menghasilkan `Sub` sekitar -1.7e16 jam; `int` bisa meluap pada 32-bit, tetapi Go di server 64-bit. `n < 1` menangkap banyak kasus, tetapi bukan format salah yang kebetulan menghasilkan n positif.

```go
if n < 1 {
	return nil, apperror.Validation("Tanggal selesai tidak boleh sebelum tanggal mulai.")
}
return &Range{..., PrevFrom: before(from, n), PrevTo: before(from, 1)}, nil
```

**(13)** Periode sebelumnya dihitung mundur dari `from`, bukan dari `to`. `before(from, n)` = `from - n` hari; karena periode saat ini panjangnya `n` hari inklusif, awal periode sebelumnya seharusnya `from - n` — benar. `PrevTo = from - 1` — benar.

```go
default: // "7d"
	return &Range{From: before(today, 6), To: today, ...}
```

**(14)** **Semua nilai tak dikenal jatuh ke 7 hari**, termasuk `"90d"`, `"HARI"`, atau string kosong. Tidak ada error untuk preset tidak valid. Frontend hanya mengirim preset yang dikenal, tetapi API publik menerima apa pun.

**(15)** `month` memakai `time.Local`; jika server berjalan UTC sementara pengguna di WIB, awal bulan bisa bergeser 7 jam, tetapi karena hanya tanggal yang dipakai, efeknya kecil kecuali pada pergantian bulan.

## 12.3 `analytics/service.go` — `AdminDashboard`

```go
totalBookings, err := s.repo.TotalBookings(ctx)
if err != nil { return nil, apperror.Internal(err) }
```

**(1)** Pola 10 blok identik: query → cek error → bungkus. Tidak ada `errgroup`/paralel, jadi dashboard melakukan **10 query berurutan**. Latensi = jumlah latensi tiap query.

**(2)** Karena tidak ada transaksi atau snapshot, angka bisa tidak konsisten: `TotalBookings` dihitung sebelum `PendingPayments`, dan booking baru di antaranya membuat total tidak cocok dengan kartu lain.

```go
visitorsToday, err := s.repo.VisitorsOnVisitDate(ctx, today)
```

**(3)** `VisitorsOnVisitDate` menjumlahkan **tiket** (`total_tickets`), bukan orang. `TotalVisitors` menghitung jumlah akun ber-role PENGUNJUNG. Dua kartu "pengunjung" memakai definisi berbeda; "Pengunjung Hari Ini" bisa lebih besar dari total pengunjung terdaftar karena satu akun membeli banyak tiket.

```go
TicketsAvailable: available
```

**(4)** `TicketsAvailable` = `SUM(capacity)` tiket aktif, **tanpa mengurangi yang terjual**. Sama seperti `/public/prices`, ini stok teoretis, bukan sisa.

```go
PendingPayments: pending
```

**(5)** `PendingPayments` menghitung baris `payments` berstatus PENDING/PROCESSING, bukan booking yang menunggu. Satu booking bisa punya beberapa percobaan pembayaran; angkanya bisa lebih besar dari booking pending.

## 12.4 `analytics/service.go` — `ManagerAnalytics`

```go
byDate := make(map[string]dailyRow, len(rows))
for _, row := range rows {
	byDate[row.VisitDate] = row
	totalRevenue += row.Revenue
	...
}
```

**(1)** `make(map[string]dailyRow, len(rows))` memberikan kapasitas awal; bukan batas. `for _, row := range` menyalin struct `dailyRow` (tiga field) setiap iterasi — murah.

**(2)** Kunci map adalah `VisitDate` persis seperti yang dikembalikan SQLite. Jika kolom `visit_date` berisi `"2026-1-5"` (tanpa nol), kunci tidak akan cocok dengan `bucketDate` yang selalu `"2026-01-05"`; nilai hilang dari tren tanpa error.

```go
revenueToday, err := s.repo.TotalRevenueBetweenOn(ctx, today2(), today2())
```

**(3)** `today2()` dipanggil dua kali; bisa berbeda jika tengah malam lewat di antara pemanggilan (sangat kecil). Fungsi terpisah hanya karena `today` sudah dideklarasikan di `AdminDashboard`, bukan karena kebutuhan.

```go
days := int(dayOf(r.To).Sub(dayOf(r.From)).Hours()/24) + 1
buckets := days
if buckets > 31 { buckets = 31 }
step := int(math.Ceil(float64(days) / float64(buckets)))
```

**(4)** `math.Ceil` membulatkan ke atas. Untuk `days=60`, `buckets=31`, `step=ceil(1.935)=2`. Loop `for i := 0; i < days; i += step` berjalan i=0,2,...,58 → **30 titik**, bukan 31, dan **hari ke-60 tidak pernah masuk**. Bucket terakhir tidak dijamin mencapai `To`.

**(5)** Untuk `days=32`, `buckets=31`, `step=ceil(1.032)=2` → 16 titik, melewatkan separuh hari. Grafik tetap tampil, tetapi tidak mewakili seluruh rentang.

```go
label := bucketDate[5:]
```

**(6)** `bucketDate` adalah string ASCII `YYYY-MM-DD`; indeks 5 adalah karakter setelah `-` pertama, sehingga label menjadi `MM-DD`. Slice string memakai **byte**, bukan rune; aman karena semua karakter ASCII. Jika format tanggal berubah, ini akan memotong di tengah karakter multibyte.

```go
PaymentStatus: ternary(row.Bookings > 0, "PAID", "-"),
```

**(7)** `ternary` buatan sendiri mengembalikan `"PAID"` untuk setiap tanggal yang punya booking. Query sudah memfilter status revenue, jadi secara tidak langsung benar, tetapi bukan status pembayaran sebenarnya — tidak ada join ke `payments`. Tanggal tanpa booking diberi `"-"`.

```go
for d, row := range byDate {
	wd := dayOf(d).Weekday()
	if wd == time.Saturday || wd == time.Sunday { weekend += row.Tickets } else { weekday += row.Tickets }
}
```

**(8)** Iterasi map **tidak berurutan**; hasil akhir tidak terpengaruh karena hanya penjumlahan. `Weekday()` mengembalikan `time.Weekday` (0=Minggu). Jika `d` tidak valid, `dayOf` mengembalikan tahun 1 yang kebetulan Senin, sehingga tiketnya masuk weekday.

```go
summary.AvgBookingValue = totalRevenue / totalBookings
```

**(9)** Pembagian **integer**: sisa dibuang. Rata-rata Rp 99.999 menjadi Rp 99.999 (bukan 99.999,5); untuk nilai kecil, pembulatan ke bawah bisa terlihat.

```go
summary.ConversionRate = math.Round(float64(totalBookings)/float64(allVisitors)*1000) / 10
```

**(10)** Urutan operasi: `float64(...)` keduanya → bagi → kali 1000 → `Round` → bagi 10. Hasil satu angka desimal persen. Jika `allVisitors=0`, blok `if` mencegah pembagian nol.

**(11)** Rumus membandingkan **jumlah booking** dengan **jumlah akun PENGUNJUNG**, bukan jumlah pengunjung unik yang booking. Booking berulang membuat angka bisa melebihi 100%; label "conversion rate" menyesatkan.

```go
func pct(current, previous int64) float64 {
	if previous == 0 {
		if current > 0 { return 100 }
		return 0
	}
	return math.Round(float64(current-previous)/float64(previous)*1000) / 10
}
```

**(12)** `previous == 0 && current > 0` menghasilkan **100%**, bukan "tak terhingga". UI menampilkan kenaikan 100% meski sebelumnya nol; konvensi yang harus didokumentasikan di UI.

**(13)** `math.Round` membulatkan setengah menjauhi nol. `-0.05` → `-0.1`; tanda negatif dipertahankan.

## 12.5 `analytics/repository.go` — SQL dan pemetaan

```go
var revenueStatuses = []string{"PAID", "CONFIRMED", "USED"}
```

**(1)** Slice package-level yang bisa dimutasi siapa pun di package. Tidak ada `const` untuk slice di Go; jika suatu fungsi menambah elemen, query lain ikut berubah.

```go
Where("visit_date >= ? AND visit_date <= ? AND status IN ?", from, to, revenueStatuses)
```

**(2)** Tiga placeholder: dua `?` skalar dan satu `IN ?` yang diekspansi GORM menjadi `IN (?,?,?)`. Parameterisasi mencegah injeksi; `from`/`to` tidak pernah masuk string SQL.

**(3)** `visit_date` adalah teks; perbandingan leksikografis valid untuk format ISO. Jika ada nilai kosong, `"" >= "2026-01-01"` false — aman.

```go
Select("visit_date, COUNT(*) as bookings, COALESCE(SUM(total_tickets),0) as tickets, COALESCE(SUM(total),0) as revenue")
```

**(4)** `COUNT(*)` menghitung baris booking, bukan tiket. `SUM(total_tickets)` menjumlahkan kolom denormalisasi di booking. Jika `total_tickets` tidak sinkron dengan `booking_items`, angka berbeda.

**(5)** `COALESCE(...,0)` mencegah `NULL` saat tidak ada baris; `SUM` atas nol baris mengembalikan NULL, dan scan ke `int64` akan error tanpa COALESCE.

```go
Group("visit_date").Order("visit_date ASC")
```

**(6)** `GROUP BY` menghasilkan satu baris per tanggal kunjungan. Tanggal tanpa booking **tidak muncul**; service mengisi kekosongan dengan zero-value dari map, jadi grafik tetap punya titik nol.

```go
Table("booking_items").Select("booking_items.ticket_name as name, SUM(booking_items.quantity) as quant")
```

**(7)** Nama tiket dipakai sebagai kunci performa, bukan `ticket_type_id`. Jika nama tiket diubah, riwayat terpecah menjadi dua baris. `LIMIT 6` di service memotong jenis tiket ke-7.

```go
Where("DATE(created_at) >= ? AND DATE(created_at) <= ?", from, to)
```

**(8)** `DATE()` adalah fungsi SQLite; pada MySQL/Postgres perilakunya berbeda. Ini mengikat repository ke SQLite, konsisten dengan database proyek tetapi menghalangi portabilitas.

```go
Select("COUNT(DISTINCT user_id)").Where("... AND user_id IS NOT NULL AND user_id <> ''", ...)
```

**(9)** `COUNT(DISTINCT user_id)` menghitung akun unik; booking tamu (`user_id` kosong) dikecualikan. "Pengunjung" di laporan karena itu hanya pengguna terdaftar, bukan semua tamu.

```go
Joins("JOIN user_roles ...").Joins("JOIN roles ...").Where("roles.name = ?", "PENGUNJUNG")
```

**(10)** Join ganda menggandakan baris jika satu user punya dua role PENGUNJUNG (data ganda). `Count` menghitung baris join, bukan `DISTINCT users.id`. Sama untuk `ActiveStaffCount` dengan tiga role.

```go
Select("COALESCE(SUM(capacity),0)").Where("is_active = ?", true)
```

**(11)** Total kapasitas, bukan sisa. Tidak ada pengurangan tiket terjual maupun kapasitas per tanggal.

```go
Where("status IN ?", []string{"PENDING", "PROCESSING"})
```

**(12)** Daftar status pembayaran yang dianggap "pending". Tidak ada status `WAITING`/`CREATED`; jika gateway menambah status baru, angka tidak menghitungnya.

## 12.6 `audit/dto.go` dan `audit/entity.go`

```go
if log.Metadata != "" {
	_ = json.Unmarshal([]byte(log.Metadata), &meta)
}
```

**(1)** Metadata disimpan sebagai string JSON di kolom `type:json`. `Unmarshal` ke `map[string]interface{}`; error dibuang, sehingga JSON rusak menjadi `nil` tanpa peringatan. Frontend menerima `metadata` hilang, bukan error.

**(2)** `[]byte(...)` menyalin string; untuk metadata besar ini alokasi tambahan per baris audit.

```go
CreatedAt time.Time `json:"created_at"`
```

**(3)** Berbeda dari domain lain yang memformat `string`, di sini `time.Time` diserialisasi RFC3339Nano oleh `encoding/json`. Frontend menerima format yang sama secara umum, tetapi presisi/format bisa berbeda (mis. `Z` vs `+07:00`).

```go
Metadata string `gorm:"type:json" json:"metadata,omitempty"`
```

**(4)** SQLite tidak punya tipe JSON asli; `type:json` hanya memengaruhi DDL (SQLite menyimpannya sebagai TEXT/NUMERIC). Validitas JSON tidak dijaga database.

```go
DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
```

**(5)** Audit log seharusnya **immutable**, tetapi mewarisi `DeletedAt`, sehingga secara teori bisa di-soft-delete. Tidak ada endpoint delete, jadi hanya operasi manual yang bisa melakukannya.

```go
err == gorm.ErrRecordNotFound
```

**(6)** Perbandingan error dengan `==`, bukan `errors.Is`. GORM saat ini mengembalikan sentinel langsung, tetapi jika suatu saat dibungkus (`fmt.Errorf("%w")`), pengecekan gagal dan 404 berubah menjadi 500. Domain lain memakai `errors.Is`.

## 12.7 `audit/service.go` — pencatatan best-effort

```go
func (s *Service) Log(...) {
	log := &AuditLog{...}
	if len(metadata) > 0 {
		if b, err := json.Marshal(metadata); err == nil {
			log.Metadata = string(b)
		}
	}
	_ = s.repo.Create(ctx, log)
}
```

**(1)** `_ =` secara eksplisit membuang error. Komentar menyebut alasan: audit tidak boleh menggagalkan operasi bisnis. Konsekuensinya, kegagalan database saat audit juga tidak terlihat di log aplikasi — tidak ada `logger.Error`.

**(2)** `json.Marshal` gagal untuk nilai yang tidak bisa diserialisasi (channel, func, `math.Inf`). Metadata menjadi string kosong, dan audit tetap ditulis tanpa konteks.

**(3)** `ctx` adalah context request. Jika pemanggil memakai `context.WithTimeout` yang sudah dekat batas, `Create` bisa dibatalkan; audit hilang tanpa jejak. Untuk keandalan, audit sebaiknya memakai context terpisah/queue.

```go
func BuildMetadata(keyValues ...interface{}) map[string]interface{} {
	if len(keyValues)%2 != 0 { return nil }
	...
	key, ok := keyValues[i].(string)
	if !ok { continue }
	m[key] = keyValues[i+1]
}
```

**(4)** `...interface{}` menerima pasangan key/value. Jika jumlah argumen ganjil, seluruh metadata dibuang (bukan error). Jika key bukan string, pasangan dilewati tetapi indeks tetap maju 2 — value tidak bergeser.

**(5)** Tipe `interface{}` (alias `any`) membuat kesalahan tipe baru ketahuan saat runtime. Pemanggil `BookingMetadata` selalu mengirim string yang benar.

```go
const (
	CtxAuditActorID = "audit_actor_id"
	...
)
func WithAuditInfo(ctx context.Context, ...) context.Context {
	ctx = context.WithValue(ctx, CtxAuditActorID, actorID)
	...
}
```

**(6)** Kunci context bertipe `string` yang diekspor. Praktik Go menyarankan tipe kunci privat untuk menghindari tabrakan antar-package; di sini semua pemakai mengimpor konstanta yang sama, jadi konsisten tetapi tidak idiomatis.

**(7)** Empat `WithValue` berurutan membuat empat lapis context; setiap lookup menelusuri rantai. Untuk request pendek, tidak signifikan.

## 12.8 `audit/service.go` — bug paginasi

```go
func (s *Service) List(ctx context.Context, page, limit int, ...) {
	offset := (page - 1) * limit
	if page < 1 { offset = 0 }
	if limit < 1 || limit > 100 { limit = 20 }
	return s.repo.List(ctx, offset, limit, ...)
}
```

**(1)** `offset` dihitung **sebelum** `limit` dinormalkan.

**(2)** Kasus `page=2, limit=0` (query `?page=2`): offset = `(2-1)*0 = 0`, lalu limit menjadi 20. Hasilnya halaman 1, bukan halaman 2. Pengguna yang mengklik "halaman 2" melihat data yang sama.

**(3)** Kasus `page=3, limit=500`: offset = `2*500 = 1000`, lalu limit menjadi 20. Query melompati 1000 baris dan mengambil 20 — halaman kosong meski data ada.

**(4)** Kasus `page=0, limit=20`: offset = `-20`, lalu page<1 mengubahnya menjadi 0. Benar secara kebetulan.

**(5)** Perbaikan: normalkan `page` dan `limit` lebih dulu, baru hitung `(page-1)*limit`.

**(6)** Handler memakai `response.BuildMeta(req.Page, req.Limit, total)` dengan nilai mentah; meta menormalkan sendiri, sehingga meta bisa menyebut limit 20 sementara query memakai offset dari limit lama. Ketidakcocokan ini tidak terlihat pada pemakaian normal (page dan limit selalu dikirim bersama).

**(7)** `ListRequest` tidak punya tag `validate`, jadi `ValidateStruct(req)` selalu mengembalikan nil. Filter `status` menerima string apa pun; hasil kosong, bukan 400. `ShouldBindQuery` tetap memvalidasi tipe int: `page=abc` menghasilkan error bind → 400.

## 12.9 `verification/service.go` — dua bug fatal

```go
result, err := s.ticketService.Validate(ctx, req.TicketID, req.Gate, staffID, staffName)
if err != nil { return nil, err }
scannedAt := time.Now()
if result.Ticket.CheckedInAt != nil {
	scannedAt = *result.Ticket.CheckedInAt
}
```

**(1)** `result.Ticket` adalah `*ticketing.TicketResponse`. Untuk tiket yang **tidak ditemukan**, `ticketing.Validate` mengembalikan `&ValidateResult{Status: ScanInvalid, ...}` **tanpa** field `Ticket` (lihat 8.12). Akses `result.Ticket.CheckedInAt` pada pointer nil **panic**: `invalid memory address or nil pointer dereference`.

**(2)** Panic terjadi sebelum `repo.Create`, sehingga tidak ada record; handler recovery mengembalikan 500. Pemindaian tiket asing (QR rusak) membuat endpoint verifikasi crash, bukan menampilkan "tiket tidak ditemukan".

**(3)** `*result.Ticket.CheckedInAt` melakukan dereference pointer `*time.Time`. Untuk tiket yang baru dipakai, `CheckedInAt` diisi `&now`; untuk tiket yang sudah digunakan sebelumnya, berisi waktu scan pertama. `scannedAt` karena itu waktu check-in asli, bukan waktu pemindaian ulang — masuk akal untuk audit, tetapi tidak untuk "riwayat scan".

```go
verification := &Verification{...}
if err := s.repo.Create(ctx, verification); err != nil {
	return nil, apperror.Internal(err)
}
```

**(4)** **Tabel `verifications` tidak pernah dimigrasikan.** `AutoMigrate` hanya mendaftarkan `ticketing.Ticket` dan `ticketing.ScanRecord`, bukan `verification.Verification`. Verifikasi `PRAGMA table_info(verifications)` pada database menghasilkan daftar kosong.

**(5)** Akibatnya, untuk tiket **valid**, alur berjalan: `ticketing.Validate` menandai tiket USED (membakar tiket), lalu `repo.Create` gagal "no such table: verifications", service mengembalikan 500. Pengunjung kehilangan tiketnya dan petugas melihat error — kerusakan data yang nyata.

**(6)** Domain `ticketing` sudah mencatat `ScanRecord` untuk setiap scan. `verification` membuat catatan kedua untuk kejadian yang sama; bahkan jika tabelnya ada, akan ada dua sumber riwayat yang bisa berbeda (waktu, status).

**(7)** `result.Status` bisa `INVALID`/`USED`/`EXPIRED`; semuanya tetap ditulis sebagai `Verification` jika tabel ada. Tidak ada unique constraint pada `ticket_id`, sehingga scan berulang menumpuk baris.

```go
Success: result.Status == ticketing.ScanValid,
```

**(8)** Perbandingan string; `ScanValid` adalah konstanta string. Frontend menerima `success` dan `status` terpisah — informasi ganda yang bisa tidak konsisten jika salah satu diubah.

## 12.10 `verification/handler.go`

```go
staffID := middleware.CurrentUserID(c)
staffName := req.Petugas
if staffName == "" { staffName = staffID }
```

**(1)** `staffID` berasal dari JWT (tepercaya). `staffName` berasal dari **body request** (`req.Petugas`), yang dapat diisi siapa pun. Petugas dapat mengirim nama orang lain, dan nama itu masuk ke `ScanRecord`/`Verification` serta audit. Seharusnya nama diambil dari database berdasarkan `staffID`.

**(2)** Fallback ke `staffID` berarti jika nama tidak dikirim, kolom `petugas_name` berisi UUID — bukan nama yang bisa dibaca.

```go
verifications := rg.Group("/verifications", requireAuth, petugas)
tickets := rg.Group("/tickets", requireAuth, petugas)
tickets.POST("/verify", h.Verify)
```

**(3)** `petugas := middleware.RequireRole("PETUGAS")` — hanya PETUGAS, bukan ADMIN. Admin tidak bisa memverifikasi tiket; konsisten dengan ticketing, tetapi berbeda dari anggapan umum bahwa admin bisa melakukan semua.

**(4)** Alias `POST /tickets/verify` berada di grup yang sama; tidak bentrok dengan `GET /tickets/:id` karena method berbeda.

```go
if from != "" { q = q.Where("scanned_at >= ?", from) }
if to != "" { q = q.Where("scanned_at <= ?", to) }
```

**(5)** `scanned_at` adalah timestamp; `from`/`to` adalah `YYYY-MM-DD`. `scanned_at <= "2026-11-12"` hanya mencakup hingga **00:00:00** tanggal itu — seluruh scan pada hari `to` hilang. Berbeda dari audit yang menambahkan `" 23:59:59"`. Filter tanggal verifikasi karena itu kehilangan satu hari di batas atas.


## 12.12 Ringkasan temuan terverifikasi bagian ini

**(1)** **`/verifications` menghancurkan tiket valid lalu gagal 500.** Tabel `verifications` tidak ada; tiket sudah ditandai USED sebelum insert gagal. Diverifikasi lewat `PRAGMA table_info`.

**(2)** **Scan tiket tidak dikenal menyebabkan panic** karena `result.Ticket` nil di-dereference tanpa pengecekan.

**(3)** **Nama petugas dapat dipalsukan** lewat body `petugas`, meski `staffID` berasal dari JWT.

**(4)** **Filter tanggal verifikasi kehilangan hari terakhir** karena membandingkan timestamp dengan tanggal tanpa `23:59:59`.

**(5)** **Paginasi audit salah saat `limit` tidak dikirim/berlebihan** karena offset dihitung sebelum normalisasi.

**(6)** **Metrik analytics tidak konsisten definisinya:** "pengunjung" bisa berarti akun, tiket, atau pengunjung unik; "tersedia" adalah kapasitas total; "conversion" bisa >100%; "pending payments" menghitung percobaan pembayaran.

**(7)** **Tren analytics kehilangan hari** saat rentang >31 hari karena `step` dibulatkan ke atas dan loop berhenti sebelum `To`.

**(8)** **Audit best-effort tidak pernah melaporkan kegagalan**, sehingga audit yang hilang tidak terdeteksi.

## B.3 Indeks berkas Go
Indeks ini dihasilkan dari filesystem pada 12 November 2026, bukan disusun manual. Untuk setiap berkas: jumlah baris aktual, bagian per-berkas (heading `### <path>` di Bagian 1–3), dan maksimal dua sub-bagian bernomor yang membahasnya lebih dalam. Tanda `—` berarti berkas hanya memiliki ringkasan per-berkas; tidak ada pembahasan mendalam terpisah.
**Cara pembacaan:** baris dihitung dengan `wc -l` (termasuk baris kosong dan komentar). Kolom "Pembahasan mendalam" dipilih dari sub-bagian bernomor yang menyebut path penuh, akhiran path (`domain/x/file.go`), atau nama berkas di dalam domain yang sama; urutannya berdasarkan kepadatan sebutan, lalu sub-bagian paling spesifik. Jika satu berkas dibahas di lebih dari dua tempat, dua yang terpadat yang ditampilkan.
**Total: 182 berkas, 15.550 baris.**
| Kelompok | Berkas | Baris |
|---|---:|---:|
| `backend/cmd/` | 6 | 283 |
| `backend/internal/bootstrap/` | 2 | 391 |
| `backend/internal/config/` | 2 | 315 |
| `backend/internal/domain/` | 153 | 12159 |
| `backend/internal/middleware/` | 5 | 361 |
| `backend/internal/payment/` | 1 | 154 |
| `backend/internal/routes/` | 1 | 79 |
| `backend/internal/scheduler/` | 1 | 48 |
| `backend/internal/seed/` | 1 | 458 |
| `backend/internal/upload/` | 1 | 119 |
| `backend/pkg/` | 9 | 1183 |

| Berkas | Baris | Bagian per berkas | Pembahasan mendalam |
|---|---:|---|---|
| `backend/cmd/migration/main.go` | 8 | Bagian 1 › cmd | — |
| `backend/cmd/scheduler/main.go` | 102 | Bagian 1 › cmd | — |
| `backend/cmd/server/bootstrap.go` | 86 | Bagian 1 › cmd | 8.57.2 `bootstrap.go` — AutoMigrate dan tabel yang tidak terlihat |
| `backend/cmd/server/main.go` | 23 | Bagian 1 › cmd | 8.57.1 `main.go` |
| `backend/cmd/server/router.go` | 12 | Bagian 1 › cmd | 8.57.4 `router.go` |
| `backend/cmd/server/server.go` | 52 | Bagian 1 › cmd | 8.57.3 `server.go` — timeout, sweeper, graceful shutdown |
| `backend/internal/bootstrap/adapters.go` | 190 | Bagian 1 › internal/bootstrap | 8.45 `backend/internal/bootstrap/adapters.go` — jembatan antar domain |
| `backend/internal/bootstrap/bootstrap.go` | 201 | Bagian 1 › internal/bootstrap | 8.44 `backend/internal/bootstrap/bootstrap.go` — grafik dependensi dan penyambungan terlambat |
| `backend/internal/config/config.go` | 229 | Bagian 1 › internal/config | 8.46 `backend/internal/config/config.go` — default, validasi, dan pagar produksi |
| `backend/internal/config/database.go` | 86 | Bagian 1 › internal/config | 8.47 `backend/internal/config/database.go` — koneksi dan kompromi SQLite |
| `backend/internal/domain/analytics/dto.go` | 59 | Bagian 3 › domain/analytics | 12.1 `internal/domain/analytics/dto.go` |
| `backend/internal/domain/analytics/handler.go` | 50 | Bagian 3 › domain/analytics | 8.61.6 `analytics/handler.go` |
| `backend/internal/domain/analytics/repository.go` | 187 | Bagian 3 › domain/analytics | 12.5 `analytics/repository.go` — SQL dan pemetaan |
| `backend/internal/domain/analytics/service.go` | 283 | Bagian 3 › domain/analytics | 12.2 `analytics/service.go` — `ResolveRange`, baris demi baris; 12.3 `analytics/service.go` — `AdminDashboard` |
| `backend/internal/domain/article/dto.go` | 27 | Bagian 3 › domain/article | 10.7.1 `dto.go` |
| `backend/internal/domain/article/entity.go` | 45 | Bagian 3 › domain/article | 10.7.2 `entity.go` |
| `backend/internal/domain/article/errors.go` | 5 | Bagian 3 › domain/article | 10.7.3 `errors.go` |
| `backend/internal/domain/article/handler.go` | 98 | Bagian 3 › domain/article | 10.7.4 `handler.go` |
| `backend/internal/domain/article/mapper.go` | 16 | Bagian 3 › domain/article | 10.7.5 `mapper.go` |
| `backend/internal/domain/article/repository.go` | 82 | Bagian 3 › domain/article | 10.7.6 `repository.go` |
| `backend/internal/domain/article/routes.go` | 20 | Bagian 3 › domain/article | 10.7.7 `routes.go` |
| `backend/internal/domain/article/service.go` | 131 | Bagian 3 › domain/article | 10.7.8 `service.go` |
| `backend/internal/domain/article/usecase.go` | 67 | Bagian 3 › domain/article | 10.7.9 `usecase.go` |
| `backend/internal/domain/article/validator.go` | 35 | Bagian 3 › domain/article | — |
| `backend/internal/domain/audit/dto.go` | 87 | Bagian 3 › domain/audit | 12.6 `audit/dto.go` dan `audit/entity.go` |
| `backend/internal/domain/audit/entity.go` | 79 | Bagian 3 › domain/audit | 12.6 `audit/dto.go` dan `audit/entity.go` |
| `backend/internal/domain/audit/handler.go` | 75 | Bagian 3 › domain/audit | 8.61.7 `audit/handler.go` |
| `backend/internal/domain/audit/repository.go` | 117 | Bagian 3 › domain/audit | — |
| `backend/internal/domain/audit/service.go` | 172 | Bagian 3 › domain/audit | 12.7 `audit/service.go` — pencatatan best-effort; 12.8 `audit/service.go` — bug paginasi |
| `backend/internal/domain/audit/usecase.go` | 45 | Bagian 3 › domain/audit | — |
| `backend/internal/domain/auth/dto.go` | 66 | Bagian 2 › domain/auth | 8.16 `backend/internal/domain/auth/dto.go` — bentuk request dan response |
| `backend/internal/domain/auth/entity.go` | 69 | Bagian 2 › domain/auth | 8.17 `backend/internal/domain/auth/entity.go` — tiga tabel |
| `backend/internal/domain/auth/errors.go` | 19 | Bagian 2 › domain/auth | — |
| `backend/internal/domain/auth/handler.go` | 304 | Bagian 2 › domain/auth | 8.18 `backend/internal/domain/auth/handler.go` — cookie, OAuth state, dan respons seragam |
| `backend/internal/domain/auth/mapper.go` | 27 | Bagian 2 › domain/auth | — |
| `backend/internal/domain/auth/repository.go` | 145 | Bagian 2 › domain/auth | 8.19 `backend/internal/domain/auth/repository.go` — CAS untuk sesi dan token |
| `backend/internal/domain/auth/routes.go` | 30 | Bagian 2 › domain/auth | — |
| `backend/internal/domain/auth/service.go` | 443 | Bagian 2 › domain/auth | 8.15 `backend/internal/domain/auth/service.go` — kredensial, token, dan OAuth |
| `backend/internal/domain/auth/usecase.go` | 140 | Bagian 2 › domain/auth | — |
| `backend/internal/domain/auth/validator.go` | 61 | Bagian 2 › domain/auth | — |
| `backend/internal/domain/booking/dto.go` | 74 | Bagian 2 › domain/booking | 8.1 `backend/internal/domain/booking/dto.go` — kontrak HTTP dan validasinya |
| `backend/internal/domain/booking/entity.go` | 75 | Bagian 2 › domain/booking | 8.2 `backend/internal/domain/booking/entity.go` — model dan invariant yang ditulis di komentar |
| `backend/internal/domain/booking/errors.go` | 25 | Bagian 2 › domain/booking | — |
| `backend/internal/domain/booking/handler.go` | 144 | Bagian 2 › domain/booking | 8.5 `backend/internal/domain/booking/handler.go` — per handler |
| `backend/internal/domain/booking/mapper.go` | 56 | Bagian 2 › domain/booking | 8.3 `backend/internal/domain/booking/mapper.go` — konversi dan satu komentar yang menyesatkan; 7.2 `backend/internal/domain/booking/service.go` — inti aturan pesanan |
| `backend/internal/domain/booking/repository.go` | 352 | Bagian 2 › domain/booking | 8.7 `backend/internal/domain/booking/repository.go` — tempat invariant benar-benar ditegakkan |
| `backend/internal/domain/booking/routes.go` | 32 | Bagian 2 › domain/booking | 8.6 `backend/internal/domain/booking/routes.go` — peta rute dan satu jebakan |
| `backend/internal/domain/booking/service.go` | 562 | Bagian 2 › domain/booking | 7.2 `backend/internal/domain/booking/service.go` — inti aturan pesanan |
| `backend/internal/domain/booking/usecase.go` | 103 | Bagian 2 › domain/booking | 8.4 `backend/internal/domain/booking/usecase.go` — lapisan yang hampir seluruhnya pass-through |
| `backend/internal/domain/destinationinfo/dto.go` | 70 | Bagian 3 › domain/destinationinfo | 10.2.1 `dto.go` |
| `backend/internal/domain/destinationinfo/entity.go` | 48 | Bagian 3 › domain/destinationinfo | 10.2.2 `entity.go` |
| `backend/internal/domain/destinationinfo/errors.go` | 10 | Bagian 3 › domain/destinationinfo | 10.2.3 `errors.go` |
| `backend/internal/domain/destinationinfo/handler.go` | 111 | Bagian 3 › domain/destinationinfo | 8.61.4 `destinationinfo/handler.go`; 10.2.4 `handler.go` |
| `backend/internal/domain/destinationinfo/repository.go` | 86 | Bagian 3 › domain/destinationinfo | 10.2.5 `repository.go` |
| `backend/internal/domain/destinationinfo/routes.go` | 24 | Bagian 3 › domain/destinationinfo | 10.2.6 `routes.go` |
| `backend/internal/domain/destinationinfo/service.go` | 152 | Bagian 3 › domain/destinationinfo | 10.2.7 `service.go` |
| `backend/internal/domain/destinationinfo/usecase.go` | 45 | Bagian 3 › domain/destinationinfo | 10.2.8 `usecase.go` |
| `backend/internal/domain/destinationinfo/validator.go` | 20 | Bagian 3 › domain/destinationinfo | 10.2.9 `validator.go` |
| `backend/internal/domain/facility/dto.go` | 68 | Bagian 3 › domain/facility | 10.3.1 `dto.go` |
| `backend/internal/domain/facility/entity.go` | 46 | Bagian 3 › domain/facility | 10.3.2 `entity.go` |
| `backend/internal/domain/facility/errors.go` | 7 | Bagian 3 › domain/facility | 10.3.3 `errors.go` |
| `backend/internal/domain/facility/handler.go` | 92 | Bagian 3 › domain/facility | 8.61.2 `faq/handler.go` dan `facility/handler.go`; 10.3.4 `handler.go` |
| `backend/internal/domain/facility/repository.go` | 70 | Bagian 3 › domain/facility | 10.3.5 `repository.go` |
| `backend/internal/domain/facility/routes.go` | 23 | Bagian 3 › domain/facility | 10.3.6 `routes.go` |
| `backend/internal/domain/facility/service.go` | 94 | Bagian 3 › domain/facility | 10.3.7 `service.go` |
| `backend/internal/domain/facility/usecase.go` | 37 | Bagian 3 › domain/facility | 10.3.8 `usecase.go` |
| `backend/internal/domain/facility/validator.go` | 20 | Bagian 3 › domain/facility | 10.3.9 `validator.go` |
| `backend/internal/domain/faq/dto.go` | 52 | Bagian 3 › domain/faq | 10.4.1 `dto.go` |
| `backend/internal/domain/faq/entity.go` | 36 | Bagian 3 › domain/faq | 10.4.2 `entity.go` |
| `backend/internal/domain/faq/errors.go` | 7 | Bagian 3 › domain/faq | 10.4.3 `errors.go` |
| `backend/internal/domain/faq/handler.go` | 93 | Bagian 3 › domain/faq | 8.61.2 `faq/handler.go` dan `facility/handler.go`; 10.4.4 `handler.go` |
| `backend/internal/domain/faq/repository.go` | 74 | Bagian 3 › domain/faq | 10.4.5 `repository.go` |
| `backend/internal/domain/faq/routes.go` | 23 | Bagian 3 › domain/faq | 10.4.6 `routes.go` |
| `backend/internal/domain/faq/service.go` | 81 | Bagian 3 › domain/faq | 10.4.7 `service.go` |
| `backend/internal/domain/faq/usecase.go` | 35 | Bagian 3 › domain/faq | 10.4.8 `usecase.go` |
| `backend/internal/domain/faq/validator.go` | 20 | Bagian 3 › domain/faq | 10.4.9 `validator.go` |
| `backend/internal/domain/gallery/dto.go` | 46 | Bagian 3 › domain/gallery | 10.6.1 `dto.go` + `validator.go`; 10.6.5 `mapper.go` vs `dto.go` |
| `backend/internal/domain/gallery/entity.go` | 35 | Bagian 3 › domain/gallery | 10.6.2 `entity.go` |
| `backend/internal/domain/gallery/errors.go` | 5 | Bagian 3 › domain/gallery | 10.6.3 `errors.go` |
| `backend/internal/domain/gallery/handler.go` | 82 | Bagian 3 › domain/gallery | 8.61.1 `gallery/handler.go`; 10.6.4 `handler.go` |
| `backend/internal/domain/gallery/mapper.go` | 13 | Bagian 3 › domain/gallery | 10.6.5 `mapper.go` vs `dto.go` |
| `backend/internal/domain/gallery/repository.go` | 58 | Bagian 3 › domain/gallery | 10.6.6 `repository.go` |
| `backend/internal/domain/gallery/routes.go` | 20 | Bagian 3 › domain/gallery | 10.6.7 `routes.go` |
| `backend/internal/domain/gallery/service.go` | 77 | Bagian 3 › domain/gallery | 10.6.8 `service.go` |
| `backend/internal/domain/gallery/usecase.go` | 61 | Bagian 3 › domain/gallery | 10.6.9 `usecase.go` |
| `backend/internal/domain/gallery/validator.go` | 39 | Bagian 3 › domain/gallery | 10.6.1 `dto.go` + `validator.go` |
| `backend/internal/domain/package/dto.go` | 33 | Bagian 3 › domain/package | 10.1.1 `dto.go` |
| `backend/internal/domain/package/entity.go` | 41 | Bagian 3 › domain/package | 10.1.2 `entity.go` |
| `backend/internal/domain/package/errors.go` | 5 | Bagian 3 › domain/package | 10.1.3 `errors.go` |
| `backend/internal/domain/package/handler.go` | 83 | Bagian 3 › domain/package | 8.61.3 `package/handler.go`; 10.1.4 `handler.go` |
| `backend/internal/domain/package/mapper.go` | 17 | Bagian 3 › domain/package | 10.1.5 `mapper.go` |
| `backend/internal/domain/package/repository.go` | 69 | Bagian 3 › domain/package | 10.1.6 `repository.go` |
| `backend/internal/domain/package/routes.go` | 18 | Bagian 3 › domain/package | 10.1.9 `routes.go` |
| `backend/internal/domain/package/service.go` | 106 | Bagian 3 › domain/package | 10.1.7 `service.go` |
| `backend/internal/domain/package/usecase.go` | 61 | Bagian 3 › domain/package | 10.1.8 `usecase.go` |
| `backend/internal/domain/package/validator.go` | 20 | Bagian 3 › domain/package | 10.1.10 `validator.go` |
| `backend/internal/domain/payments/dto.go` | 56 | Bagian 2 › domain/payments | 8.8 `backend/internal/domain/payments/dto.go` — bentuk data yang dilihat frontend |
| `backend/internal/domain/payments/entity.go` | 86 | Bagian 2 › domain/payments | 7.3 `backend/internal/domain/payments` — uang masuk dan tiket terbit |
| `backend/internal/domain/payments/handler.go` | 160 | Bagian 2 › domain/payments | 8.10 `backend/internal/domain/payments/handler.go` — peran dibedakan lebih ketat daripada booking |
| `backend/internal/domain/payments/repository.go` | 139 | Bagian 2 › domain/payments | 8.11 `backend/internal/domain/payments/repository.go` — query yang menopang seluruh status |
| `backend/internal/domain/payments/service.go` | 597 | Bagian 2 › domain/payments | 7.3 `backend/internal/domain/payments` — uang masuk dan tiket terbit |
| `backend/internal/domain/payments/usecase.go` | 80 | Bagian 2 › domain/payments | 8.9 `backend/internal/domain/payments/usecase.go` — validasi request dan pembungkusan hasil |
| `backend/internal/domain/public/dto.go` | 199 | Bagian 3 › domain/public | 10.14.2 `dto.go` |
| `backend/internal/domain/public/entity.go` | 103 | Bagian 3 › domain/public | 10.14.1 `entity.go` — tabel yang tidak pernah dimigrasikan |
| `backend/internal/domain/public/errors.go` | 8 | Bagian 3 › domain/public | 10.14.3 `errors.go` |
| `backend/internal/domain/public/handler.go` | 117 | Bagian 3 › domain/public | 10.14.4 `handler.go` |
| `backend/internal/domain/public/repository.go` | 144 | Bagian 3 › domain/public | 10.14.5 `repository.go` |
| `backend/internal/domain/public/routes.go` | 21 | Bagian 3 › domain/public | 10.14.7 `routes.go` |
| `backend/internal/domain/public/service.go` | 110 | Bagian 3 › domain/public | 10.14.6 `service.go` |
| `backend/internal/domain/public/validator.go` | 20 | Bagian 3 › domain/public | 10.14.8 `validator.go` |
| `backend/internal/domain/role/dto.go` | 12 | Bagian 2 › domain/role | 10.11.1 `dto.go` |
| `backend/internal/domain/role/entity.go` | 57 | Bagian 2 › domain/role | 10.11.2 `entity.go` |
| `backend/internal/domain/role/errors.go` | 7 | Bagian 2 › domain/role | 10.11.3 `errors.go` |
| `backend/internal/domain/role/handler.go` | 41 | Bagian 2 › domain/role | 10.11.4 `handler.go` |
| `backend/internal/domain/role/mapper.go` | 17 | Bagian 2 › domain/role | — |
| `backend/internal/domain/role/repository.go` | 90 | Bagian 2 › domain/role | 10.11.5 `repository.go` |
| `backend/internal/domain/role/routes.go` | 23 | Bagian 2 › domain/role | 10.11.6 `routes.go` |
| `backend/internal/domain/role/service.go` | 68 | Bagian 2 › domain/role | 10.11.7 `service.go` |
| `backend/internal/domain/role/usecase.go` | 20 | Bagian 2 › domain/role | 10.11.8 `usecase.go` |
| `backend/internal/domain/role/validator.go` | 20 | Bagian 2 › domain/role | 10.11.9 `validator.go` |
| `backend/internal/domain/ticketing/dto.go` | 156 | Bagian 2 › domain/ticketing | 8.14 `backend/internal/domain/ticketing/dto.go` — kontrak scanner |
| `backend/internal/domain/ticketing/entity.go` | 70 | Bagian 2 › domain/ticketing | — |
| `backend/internal/domain/ticketing/handler.go` | 184 | Bagian 2 › domain/ticketing | 8.13 `backend/internal/domain/ticketing/handler.go` — per rute |
| `backend/internal/domain/ticketing/repository.go` | 187 | Bagian 2 › domain/ticketing | 8.12 `backend/internal/domain/ticketing/repository.go` — query scanner |
| `backend/internal/domain/ticketing/service.go` | 507 | Bagian 2 › domain/ticketing | — |
| `backend/internal/domain/tickettype/dto.go` | 31 | Bagian 2 › domain/tickettype | 10.15.1 `dto.go` |
| `backend/internal/domain/tickettype/entity.go` | 44 | Bagian 2 › domain/tickettype | 10.15.2 `entity.go` |
| `backend/internal/domain/tickettype/errors.go` | 23 | Bagian 2 › domain/tickettype | — |
| `backend/internal/domain/tickettype/handler.go` | 172 | Bagian 2 › domain/tickettype | 10.15.3 `handler.go` |
| `backend/internal/domain/tickettype/mapper.go` | 24 | Bagian 2 › domain/tickettype | 10.15.4 `mapper.go` |
| `backend/internal/domain/tickettype/repository.go` | 92 | Bagian 2 › domain/tickettype | 10.15.5 `repository.go` |
| `backend/internal/domain/tickettype/routes.go` | 23 | Bagian 2 › domain/tickettype | 10.15.7 `routes.go` |
| `backend/internal/domain/tickettype/service.go` | 212 | Bagian 2 › domain/tickettype | 10.15.6 `service.go` |
| `backend/internal/domain/tickettype/validator.go` | 20 | Bagian 2 › domain/tickettype | — |
| `backend/internal/domain/user/dto.go` | 15 | Bagian 2 › domain/user | 10.10.1 `dto.go` |
| `backend/internal/domain/user/entity.go` | 22 | Bagian 2 › domain/user | 10.10.2 `entity.go` |
| `backend/internal/domain/user/errors.go` | 6 | Bagian 2 › domain/user | 10.10.3 `errors.go` |
| `backend/internal/domain/user/handler.go` | 42 | Bagian 2 › domain/user | 8.61.8 `user/handler.go`; 10.10.4 `handler.go` |
| `backend/internal/domain/user/mapper.go` | 8 | Bagian 2 › domain/user | — |
| `backend/internal/domain/user/repository.go` | 52 | Bagian 2 › domain/user | 10.10.5 `repository.go` |
| `backend/internal/domain/user/routes.go` | 14 | Bagian 2 › domain/user | 10.10.6 `routes.go` |
| `backend/internal/domain/user/service.go` | 37 | Bagian 2 › domain/user | 10.10.7 `service.go` |
| `backend/internal/domain/user/usecase.go` | 51 | Bagian 2 › domain/user | 10.10.8 `usecase.go` |
| `backend/internal/domain/user/validator.go` | 20 | Bagian 2 › domain/user | 10.10.9 `validator.go` |
| `backend/internal/domain/verification/dto.go` | 73 | Bagian 2 › domain/verification | — |
| `backend/internal/domain/verification/entity.go` | 45 | Bagian 2 › domain/verification | — |
| `backend/internal/domain/verification/errors.go` | 7 | Bagian 2 › domain/verification | — |
| `backend/internal/domain/verification/handler.go` | 83 | Bagian 2 › domain/verification | 12.10 `verification/handler.go` |
| `backend/internal/domain/verification/repository.go` | 61 | Bagian 2 › domain/verification | — |
| `backend/internal/domain/verification/service.go` | 99 | Bagian 2 › domain/verification | 12.9 `verification/service.go` — dua bug fatal |
| `backend/internal/domain/verification/validator.go` | 20 | Bagian 2 › domain/verification | — |
| `backend/internal/domain/visitorrule/dto.go` | 56 | Bagian 3 › domain/visitorrule | 10.8.1 `dto.go` |
| `backend/internal/domain/visitorrule/entity.go` | 44 | Bagian 3 › domain/visitorrule | 10.8.2 `entity.go` |
| `backend/internal/domain/visitorrule/errors.go` | 7 | Bagian 3 › domain/visitorrule | 10.8.3 `errors.go` |
| `backend/internal/domain/visitorrule/handler.go` | 93 | Bagian 3 › domain/visitorrule | 8.61.5 `visitorrule/handler.go`; 10.8.4 `handler.go` |
| `backend/internal/domain/visitorrule/repository.go` | 74 | Bagian 3 › domain/visitorrule | 10.8.5 `repository.go` |
| `backend/internal/domain/visitorrule/routes.go` | 23 | Bagian 3 › domain/visitorrule | 10.8.6 `routes.go` |
| `backend/internal/domain/visitorrule/service.go` | 90 | Bagian 3 › domain/visitorrule | 10.8.7 `service.go` |
| `backend/internal/domain/visitorrule/usecase.go` | 37 | Bagian 3 › domain/visitorrule | 10.8.8 `usecase.go` |
| `backend/internal/domain/visitorrule/validator.go` | 20 | Bagian 3 › domain/visitorrule | 10.8.9 `validator.go` |
| `backend/internal/domain/visitors/entity.go` | 57 | Bagian 3 › domain/visitors | 10.12.1 `entity.go` |
| `backend/internal/domain/visitors/handler.go` | 136 | Bagian 3 › domain/visitors | 10.12.2 `handler.go` |
| `backend/internal/domain/visitors/repository.go` | 187 | Bagian 3 › domain/visitors | 10.12.3 `repository.go` |
| `backend/internal/middleware/audit.go` | 58 | Bagian 1 › internal/middleware | 8.52 `backend/internal/middleware/audit.go` — identitas untuk audit log |
| `backend/internal/middleware/auth.go` | 110 | Bagian 1 › internal/middleware | 8.20 `backend/internal/middleware/auth.go` — autentikasi ganda dan CSRF |
| `backend/internal/middleware/cors.go` | 49 | Bagian 1 › internal/middleware | 8.53 `backend/internal/middleware/cors.go` — origin, kredensial, dan preflight |
| `backend/internal/middleware/observability.go` | 32 | Bagian 1 › internal/middleware | 8.54 `backend/internal/middleware/observability.go` — log request dan panic |
| `backend/internal/middleware/ratelimiter.go` | 112 | Bagian 1 › internal/middleware | 8.51 `backend/internal/middleware/ratelimiter.go` — dua lapis pembatas |
| `backend/internal/payment/midtrans/gateway.go` | 154 | Bagian 1 › internal/payment/midtrans | 8.49 `backend/internal/payment/midtrans/gateway.go` — klien gateway |
| `backend/internal/routes/routes.go` | 79 | Bagian 1 › internal/routes | 8.55 `backend/internal/routes/routes.go` — urutan middleware menentukan perilaku |
| `backend/internal/scheduler/expired_booking.go` | 48 | Bagian 1 › internal/scheduler | 8.48 `backend/internal/scheduler/expired_booking.go` — job berkala |
| `backend/internal/seed/seed.go` | 458 | Bagian 1 › internal/seed | 8.58 `backend/internal/seed/seed.go` — data awal dan batas keamanannya |
| `backend/internal/upload/handler.go` | 119 | Bagian 1 › internal/upload | 8.50 `backend/internal/upload/handler.go` — unggah gambar |
| `backend/pkg/apperror/apperror.go` | 62 | Bagian 1 › pkg | — |
| `backend/pkg/apperror/http.go` | 87 | Bagian 1 › pkg | 8.22 `backend/pkg/apperror/http.go` — satu tempat memetakan error ke HTTP |
| `backend/pkg/jwtutil/jwtutil.go` | 106 | Bagian 1 › pkg | 8.23 `backend/pkg/jwtutil/jwtutil.go` — token, klaim, dan pengamanan algoritma |
| `backend/pkg/logger/logger.go` | 38 | Bagian 1 › pkg | 8.56.3 `pkg/logger` |
| `backend/pkg/mailer/mailer.go` | 49 | Bagian 1 › pkg | — |
| `backend/pkg/response/response.go` | 86 | Bagian 1 › pkg | 8.21 `backend/pkg/response/response.go` — satu envelope untuk semua endpoint |
| `backend/pkg/slugutil/slugutil.go` | 14 | Bagian 1 › pkg | — |
| `backend/pkg/validation/middleware.go` | 255 | Bagian 1 › pkg | 8.59.2 `middleware.go` — generik, tetapi tidak dipakai router |
| `backend/pkg/validation/validation.go` | 486 | Bagian 1 › pkg | 8.59.1 `validation.go` |
