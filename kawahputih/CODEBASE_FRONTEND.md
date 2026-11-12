# CODEBASE FRONTEND — Kawah Putih

Dokumen ini **khusus frontend**. Isinya diambil dan disusun ulang dari `CODEBASE.md` (dokumen gabungan lama, tetap dipertahankan) ditambah peta rute, alur data, inventaris berkas, dan ringkasan bug frontend.

- **Berkas TS/TSX/CSS:** 210 di dalam `app/`, `components/`, `features/`, `services/`, `lib/`, `hooks/`, `store/`, `types/`, `providers/`, `config/`, `constants/`, `styles/`; sekitar 17.100 baris. Ditambah berkas konfigurasi di root `frontend/`.
- **Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Zustand, TanStack Query, Zod, react-hook-form.
- **Titik masuk:** `frontend/app/layout.tsx` → `frontend/app/(public|auth|dashboard|admin|manager|petugas)/layout.tsx`.
- **Dokumen pasangan:** `CODEBASE_BACKEND.md`.

> **Catatan penomoran.** Nomor bagian (`Bagian 4`, `9.x`, `11.x`, `12.11`) **tidak diubah** agar rujukan silang dengan `CODEBASE.md` tetap valid. Urutannya karena itu melompat; itu disengaja. Rujukan ke Bagian 1–3, 6, 8, 10, dan 12.1–12.10 berarti ada di `CODEBASE_BACKEND.md`.

---

## F.1 Peta arsitektur frontend

```
app/
  layout.tsx                  root: font, provider global, <html lang>
  (public)/                   beranda, destinasi, galeri, artikel, paket, booking, e-tiket
  (auth)/                     login, register, lupa/reset password
  (dashboard)/                panel pengunjung: pesanan, wishlist, profil
  (admin)/                    panel admin: users, content, payments, reports, audit-log, settings
  (manager)/                  dashboard dan laporan manajer
  (petugas)/                  scanner gerbang
components/
  ui/                         primitif (button, input, dialog, badge, …)
  tables/data-table.tsx       tabel generik
  panel/                      kerangka sidebar/topbar untuk panel
  navbar/, inputs/, …         komponen lintas halaman
features/<fitur>/             komponen + skema + logika per domain
services/*.service.ts         satu-satunya lapisan yang memanggil HTTP
lib/                          api client, format uang/tanggal, izin, PDF, JWT
hooks/                        pembungkus TanStack Query per resource
store/                        Zustand: auth, booking, wishlist, language
types/                        duplikasi manual kontrak backend
providers/                    QueryClient, toast, session
```

### Alur data

```
komponen (features/ atau app/)
   └─ hooks/use-*.ts               useQuery / useMutation
        └─ services/*.service.ts   api.get/post/put/delete
             └─ lib/api.ts         fetch + credentials + unwrap envelope
                  └─ backend /api/v1
```

Aturan yang hampir selalu dipatuhi:

1. **Komponen tidak memanggil `fetch` langsung**; selalu lewat `services`.
2. **`lib/api.ts` membuka envelope** `{success,message,data,meta}` dan melempar `ApiError` bila `success=false`.
3. **Token tidak ada di localStorage**; disimpan sebagai cookie httpOnly oleh backend. Store hanya menyimpan profil.
4. **Uang diformat lewat `rupiah()`** di `lib/currency.ts`, bukan template string.
5. **Form memakai zod + react-hook-form**, tetapi tipe payload ditulis manual dan tidak selalu cocok dengan skema.

### Peta route group

| Group | Jumlah halaman | Contoh | Proteksi |
|---|---:|---|---|
| `(public)` | 18 | `/`, `/destinations`, `/booking`, `/e-ticket/[code]` | publik |
| `(auth)` | 4 | `/login`, `/register`, `/forgot-password` | publik, redirect bila sudah login |
| `(dashboard)` | 10 | `/dashboard`, `/dashboard/orders` | PENGUNJUNG |
| `(admin)` | 30 | `/admin/users`, `/admin/payments`, `/admin/audit-log` | ADMIN |
| `(manager)` | 7 | `/manager`, `/manager/reports` | MANAGER |
| `(petugas)` | 5 | `/petugas/scanner` | PETUGAS |

Proteksi rute dilakukan di layout masing-masing group dengan membaca `auth.store`; backend tetap memeriksa ulang setiap request.

### Pola yang berulang (dan masalahnya)

| Pola | Di mana | Catatan |
|---|---|---|
| `useQuery` + `placeholderData` | hampir semua daftar | paginasi sering dihitung dua kali (client + server) |
| `STATUS_TONE` | halaman admin/manager | kunci status berbahasa Inggris, data backend berbahasa Indonesia |
| `ConfirmDialog` | CMS | artikel tidak memakainya |
| `EmptyState` | daftar | tidak punya tombol "coba lagi" |
| Skeleton | dashboard | `manager/visitors` tetap skeleton saat error |
| `&bull;` di JSX | beberapa halaman | tampil literal karena bukan HTML |
| Tombol "Unduh PDF" | e-tiket | hanya `<a>` ke halaman, bukan generate PDF |

### Bug frontend yang sudah diperbaiki

1. **Scanner envelope** — `scanner.api.service.ts` kini membuka `data` dan melempar `ScannerError` (sebelumnya membaca field tingkat atas sehingga selalu gagal).
2. **Harga tiket** — `booking-form.tsx` memakai `rupiah()` (sebelumnya mencetak angka mentah).
3. **Biaya layanan** — `serviceFeePercent: 2` dan `lib/business.ts` menghitung persentase (sebelumnya nominal tetap).

### Bug frontend yang masih terbuka

1. **Simpan user palsu** — `admin/users` menampilkan toast sukses tanpa memanggil API.
2. **Paginasi ganda** — beberapa daftar mengirim `page` yang sudah dipotong di client.
3. **Status berbahasa Inggris** — `STATUS_TONE` tidak cocok dengan nilai backend, badge jatuh ke default.
4. **`&bull;` literal** pada beberapa halaman.
5. **"Unduh PDF"** hanya tautan, tidak menghasilkan berkas.
6. **`manager/visitors` skeleton selamanya** bila request gagal.
7. **Skema paket mewajibkan field yang tidak dirender** — submit paket selalu gagal tanpa pesan.
8. **Role typo mengosongkan semua role tanpa error**; `priority DESC` menaruh `critical` paling akhir.

Rincian dan bukti ada di 9.26, 11.8, 11.9, dan 12.11.

## F.2 Isi dokumen ini

| Bagian | Isi | Kedalaman |
|---|---|---|
| 4 | konfigurasi, seluruh halaman `app/`, komponen UI, provider | per berkas |
| 5 | features, services, hooks, lib, store, types, styles, scripts | per berkas |
| 7.5 | bagaimana logika backend menjadi tampilan | baris per baris |
| 7.6, 7.8 | catatan bug dan cara membaca | ringkas |
| 9 | frontend berkas per berkas, halaman per halaman | baris per baris |
| 11 | komponen admin fitur, provider, skema zod | per komponen |
| 12.11 | `DataTable` sampai tingkat token | baris per baris |

Bagian 1–3, 6, 8, 10, 12.1–12.10, dan 12.12 **tidak** ada di sini; lihat `CODEBASE_BACKEND.md`.

### Cara membaca cepat

- Ingin tahu **fungsi sebuah halaman** → Bagian 4, lalu 9.15–9.21.
- Ingin tahu **satu komponen baris per baris** → 9.31–9.45 dan Bagian 11.
- Ingin tahu **cara service memanggil API** → 9.2, 9.7, 9.8, 9.25.
- Ingin tahu **format uang/tanggal/izin** → 9.3.
- Ingin tahu **alur booking dari UI** → 7.5, 9.11–9.12, 9.43.
- Ingin tahu **bug yang belum diperbaiki** → 9.26, 11.8, 11.9.

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

> **Catatan penyunting (dokumen frontend).** 7.6–7.8 dipertahankan dari dokumen gabungan dan membahas kedua sisi aplikasi. Tabel 7.7 bagian backend serta rujukan 7.2/7.3/7.4 di 7.8 ada di `CODEBASE_BACKEND.md`.

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


# Bagian 9 — Frontend, Berkas per Berkas

> **Catatan penyunting.** Bagian ini dipertahankan apa adanya dari dokumen gabungan. Rujukan ke "Bagian 1–3/6/8" di dalamnya menunjuk ke `CODEBASE_BACKEND.md`.

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

**(3)** **Ditutup di Bagian 11 dan 12:** provider `query`/`toast`/`session`, `skeleton`, `empty-state`, komponen admin `facility`, `faq`, `articles`, `gallery`, `visitor-rule`, `destination-info`, skema zod, `DataTable`, serta domain backend `analytics`, `audit`, dan `verification` (sampai tingkat token/karakter). Halaman placeholder diinventaris di 9.45.3. **Belum tiap baris:** `components/panel/panel-ui.tsx` (sudah dibahas fungsi dan sebagian baris di 9.3.1), `panel-toolbar.tsx`, `date-range-filter.tsx`, dan komponen sidebar.

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

**(4)** Untuk backend, status dan daftar temuan ada di `CODEBASE_BACKEND.md` (8.62); untuk alur transaksi inti, lihat Bagian 7 di dokumen yang sama. Dokumen **ini** mencakup frontend awal (Bagian 4–5), alur frontend baris-per-baris (7.5), seluruh frontend (9), komponen lanjutan (11), dan `DataTable` (12.11); bagian backend dipisah ke dokumen pasangan.

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
---


# 11. Bedah frontend lanjutan — per komponen

Bagian 9 sudah membahas halaman dan komponen utama baris per baris. Bagian 11 menutup sisa yang sebelumnya hanya struktural: provider, skeleton/empty-state, komponen admin fitur, dan skema zod.

## 11.1 Provider dan komponen pendukung

### 11.1.1 `providers/query-provider.tsx`

```tsx
const [client] = useState(() => new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
}));
```

**(1)** QueryClient dibuat sekali per mount lewat `useState` — pola yang benar untuk App Router agar cache tidak dibuat ulang tiap render.

**(2)** `retry: 1` berarti satu kali ulang setelah gagal. Untuk endpoint yang sering 401/404, retry hanya menambah latensi; React Query sebenarnya tidak mengulang error 4xx, hanya error jaringan/5xx.

**(3)** `refetchOnWindowFocus: false` membuat data tidak pernah disegarkan saat pengguna kembali ke tab. Untuk panel admin yang menampilkan stok/booking, ini bisa menampilkan data lama sampai refetch manual atau invalidasi mutasi.

**(4)** `staleTime` global 30 detik, tetapi beberapa hook menimpanya (`useAuditFeed` 10 detik, `useManagerAnalytics` 5 detik). Tidak ada `gcTime` khusus.

**(5)** Tidak ada `onError` global/toast, sehingga kegagalan query hanya terlihat jika komponen memeriksa `isError` — banyak yang tidak.

### 11.1.2 `providers/toast-provider.tsx`

**(1)** `Toaster` Sonner dengan `position="top-center"`, `richColors`, `closeButton`. Tidak ada `duration`/`expand`; default Sonner (4 detik) berlaku.

**(2)** Hanya dirender sekali di root layout; tidak ada konfigurasi tema, sehingga toast terang di halaman gelap (Sonner mengikuti `theme` prop yang tidak di-set).

### 11.1.3 `providers/session-provider.tsx`

**(1)** Komponen ini hanya mengembalikan `children`; komentar menjelaskan bahwa sesi memakai Zustand + localStorage, bukan cookie NextAuth.

**(2)** Namanya menyesatkan: tidak ada sesi yang disediakan. Jika tetap dipasang di root, ia menambah satu komponen client tanpa fungsi. Lebih jujur dihapus atau diganti nama menjadi `PassThroughProvider`.

**(3)** Komentar menyebut "tempat rehidrasi sesi nyata bila nanti ditambahkan" — rehidrasi saat ini dilakukan `persist` Zustand di `auth.store`, bukan di sini.

### 11.1.4 `components/loading/skeleton.tsx`

**(1)** `Skeleton` adalah div `animate-pulse` dengan `rounded-xl`. Tidak menerima `aria-hidden`; pembaca layar akan mengumumkan div kosong. Sebaiknya `aria-hidden="true"`.

**(2)** `CardGridSkeleton` selalu memakai grid 3 kolom di `lg`, sedangkan `HomePackages` hanya meminta 3 kartu dan `PackagesList` 9. Jumlah skeleton tidak selalu sama dengan jumlah item nyata (9.43.2).

**(3)** Tidak ada skeleton untuk tabel; halaman admin memakai satu blok `Skeleton className="h-64 w-full"` yang tidak menyerupai tabel, sehingga layout bergeser saat data muncul.

### 11.1.5 `components/empty/empty-state.tsx`

**(1)** Hanya menerima `title` dan `description`; **tidak ada aksi/retry**. Semua pemakaian untuk error ("Gagal memuat ...") menjadi jalan buntu: pengguna tidak bisa mencoba lagi tanpa refresh.

**(2)** Ikon `Inbox` untuk semua keadaan, termasuk error dan "belum ada data". Tidak ada pembeda visual antara kosong dan gagal.

**(3)** Tidak ada `role="status"`/`aria-live`; perubahan dari loading ke kosong tidak diumumkan.

## 11.2 `features/facility/components/facility-admin.tsx`

**(1)** Memuat `limit: 50` tanpa paginasi. `totalCount` adalah `data.length`, jadi bila ada 60 fasilitas, statistik "Total: 50" dan "Draft: 50 - published" salah.

**(2)** `publishedCount` diambil dari `usePublishedFacilityList()` lalu difilter `is_published` — filter ganda karena endpoint sudah `published_only`. Ini juga request kedua yang memuat semua fasilitas terbit hanya untuk menghitung.

**(3)** Tombol tambah memanggil `handleCancel()` lalu `setShowForm(!showForm)`. Karena `handleCancel` men-set `false` dan `showForm` masih nilai render lama, hasilnya benar tetapi membingungkan; dua sumber state untuk hal yang sama.

**(4)** `handleEdit` mengisi form dari item, tetapi `reset()` setelah simpan tidak mengisi default `name`; input menjadi kosong (uncontrolled) dan pesan error lama bisa tertinggal.

**(5)** `image_url` memakai `z.string().url()` — hanya URL absolut. Sementara `uploadService` mengembalikan path relatif, dan form ini tidak punya tombol unggah. Konsisten dengan UI saat ini, tetapi menghalangi penggunaan unggahan.

**(6)** Pratinjau `<Image src={watchedImageUrl}>` akan mencoba memuat URL apa pun yang diketik, termasuk URL yang tidak valid secara domain; `next/image` dapat melempar error runtime untuk host yang tidak terdaftar.

**(7)** `Badge variant="outline"` dengan children `f.status` menampilkan `active`/`maintenance`/`inactive` dalam bahasa Inggris, bercampur dengan label Indonesia di kolom lain.

**(8)** Dialog hapus menyebut "dihapus permanen", padahal backend melakukan soft-delete. Pesan menyesatkan; data masih ada di database dan bisa dipulihkan manual.

**(9)** `onError` semua mutasi memakai pesan generik tanpa membaca `error.message` dari backend. Validasi server (mis. URL tidak valid) tidak pernah terlihat.

## 11.3 `features/faq/components/faq-admin.tsx`

**(1)** Struktur hampir identik dengan facility-admin: limit 50, hitungan dari panjang data, filter published ganda, dialog hapus "permanen".

**(2)** Import `Eye`, `ArrowUp`, `ArrowDown` tidak dipakai. Rencana fitur pratinjau dan pengurutan naik/turun tidak diselesaikan; `sort_order` hanya bisa diisi angka manual.

**(3)** Kategori memakai `z.enum(FAQ_CATEGORIES)`. Jika daftar di `types/faq.ts` berbeda satu spasi dari `oneof` backend, simpan gagal 400 dengan pesan generik. Kedua daftar harus disunting bersamaan.

**(4)** `publishedCount` difilter lagi dari `usePublishedFAQList()`; sama seperti facility, ini request tambahan untuk data yang sudah terfilter.

**(5)** Tidak ada pencarian, filter kategori, atau paginasi. Dengan 50+ FAQ, admin hanya melihat 50 terbaru (urut backend: kategori, sort_order, created_at).

**(6)** `handleCancel` mereset `category`, `sort_order`, `is_published`, tetapi bukan `question`/`answer`; setelah batal, isian lama bisa tetap terlihat sampai form ditutup.

## 11.4 `features/cms/components/articles-admin.tsx`

**(1)** Hanya mendukung **create** dan **publish/hapus**; tidak ada edit meski hook `useUpdateArticle` tersedia. Artikel yang salah tulis harus dihapus dan dibuat ulang.

**(2)** Hapus **tanpa konfirmasi** dan tanpa `ConfirmDialog`, berbeda dari facility/FAQ/galeri/destination-info. Satu klik langsung menghapus (soft-delete) artikel.

**(3)** `useArticles({ limit: 20 })` tanpa filter status; backend mengembalikan semua status, jadi tabel mencampur draft/published/archived. Tidak ada paginasi, artikel ke-21 tidak tampil.

**(4)** Form memakai `<textarea>` mentah, bukan komponen `Textarea`, sehingga gaya berbeda dari form lain. Tidak ada pratinjau Markdown/HTML; konten dirender sebagai teks di publik.

**(5)** `Badge status={a.status}` menampilkan `draft`/`published`/`archived` huruf kecil; `STATUS_COLORS` memuat ketiganya, jadi warna benar, teks Inggris.

**(6)** `onSubmit` mengirim `cover_image: values.cover_image || undefined`. Backend memakai `omitempty,url`; string kosong dihilangkan, tetapi URL relatif tetap ditolak.

**(7)** Tidak ada `isError` detail; `EmptyState` "Gagal memuat artikel" tanpa retry.

## 11.5 `features/gallery/components/gallery-admin.tsx`

**(1)** `limit: 24` tanpa paginasi. Galeri ke-25 tidak bisa dikelola dari UI meski halaman publik juga dibatasi 30 (9.42.4).

**(2)** Unggahan memakai `uploadService.image(file)` dan menyimpan path relatif — satu-satunya alur unggah yang berfungsi end-to-end, karena validator backend galeri menerima path.

**(3)** Tidak ada validasi ukuran/tipe di klien; input `accept` hanya petunjuk. Berkas 6 MB baru ditolak backend, dan pesan error hanya `error.message`.

**(4)** `event.target.value = ""` memungkinkan memilih berkas sama dua kali — detail yang benar.

**(5)** Tombol simpan `disabled={uploading || !imageUrl}`; jika edit item lama yang `image_url` kosong (data lama), tombol nonaktif sampai foto diunggah ulang.

**(6)** `handleEdit` menerima `GalleryItemFormValues & {id}` dari item API; `category` bisa `undefined`, sedangkan schema punya default `""`. `reset` dengan `category: undefined` dapat memunculkan uncontrolled warning.

**(7)** Overlay aksi hanya muncul saat hover (`group-hover:opacity-100`). Di perangkat sentuh tidak ada hover, sehingga tombol edit/hapus tidak dapat dijangkau — masalah aksesibilitas nyata pada tablet admin.

**(8)** Dialog hapus menyebut "permanen" padahal soft-delete, sama seperti komponen lain.

**(9)** Pratinjau `next/image` dengan `fill` membutuhkan induk relative (ada) dan domain/path yang diizinkan. Path `/api/v1/uploads/...` perlu `remotePatterns`/rewrite yang benar; jika tidak, gambar 404 di UI meski unggahan berhasil.

## 11.6 `features/visitor-rule/components/visitor-rule-admin.tsx`

**(1)** `PRIORITY_ICONS` memetakan `high` dan `critical` ke ikon yang sama (`AlertTriangle`), sehingga dua tingkat keparahan tidak terbedakan secara visual. `low` memakai `Flag`, `normal` `Shield`.

**(2)** `Badge status={priority}` memakai `STATUS_COLORS` yang memang memuat low/normal/high/critical — satu-satunya tempat pemetaan itu bekerja sesuai maksud.

**(3)** Hitungan published memakai `usePublishedVisitorRuleList()` lalu filter ganda; total dibatasi 50.

**(4)** Urutan prioritas di backend salah (10.8.5), tetapi UI tidak mengurutkan ulang; tabel mengikuti urutan API, sehingga `critical` tampil paling bawah dalam kategori.

**(5)** Form tidak memiliki input untuk mengubah `priority` selain select; nilai default `normal`. Setelah edit item `critical`, `reset` mempertahankan nilainya karena diisi dari item.

**(6)** Import `Shield`, `AlertTriangle`, `Flag` semuanya dipakai; tidak ada import mati di file ini.

## 11.7 `features/destination-info/components/destination-info-admin.tsx`

**(1)** `limit: 20` tanpa paginasi; `usePublishedDestinationInfo()` request tambahan hanya untuk badge "Sudah Dipublikasikan". Karena endpoint publik mengembalikan satu konten terbaru, badge tidak menunjukkan apakah **item yang diedit** sudah terbit.

**(2)** Tombol publish hanya muncul untuk status `draft`; item `archived` tidak punya tombol publish, sehingga konten yang diarsipkan tidak bisa diterbitkan kembali dari UI meski backend mengizinkannya.

**(3)** Form tidak memiliki field status; status hanya berubah lewat tombol. Ini desain yang baik — mencegah publish tak sengaja.

**(4)** `handleEdit` memetakan semua field opsional ke `""`; aman untuk zod.

**(5)** Setelah create/update sukses, `reset()` mengosongkan form tetapi tidak mengisi default; tombol "Tambah" memanggil `handleCancel` yang juga reset, jadi form selalu kosong saat dibuka.

**(6)** Dialog hapus "permanen" kembali menyesatkan (soft-delete).

**(7)** Tabel menampilkan `updated_at` yang diformat `toLocaleDateString`; jika `updated_at` kosong/invalid, tampil "Invalid Date" tanpa penjagaan.

## 11.8 Skema zod vs kontrak backend

### 11.8.1 `features/destination/schemas/package.schema.ts` — skema yang tidak cocok dengan form

```ts
code: z.string().min(3)...regex(...),
category: z.enum(["ENTRANCE", ...]),
capacity: z.coerce.number().int().min(1).max(10000),
status: z.enum(["AKTIF","NONAKTIF"]),
notes: z.string().max(500).optional(),
```

**(1)** Skema mewajibkan `code`, `category`, `capacity`, dan `status`, tetapi **form `packages-admin` tidak merender input untuk keempat field itu**. `useForm` tidak memberi `defaultValues`, sehingga nilai-nilainya `undefined` saat submit.

**(2)** Akibatnya `zodResolver` menolak submit karena `code`/`category`/`capacity`/`status` tidak valid. Pesan error hanya dirender untuk `name` dan `price`; pengguna menekan "Simpan" dan **tidak terjadi apa pun, tanpa pesan**. Pembuatan paket dari UI tidak bisa berhasil.

**(3)** `capacity` dan `max_capacity` adalah dua field berbeda; backend hanya punya `max_capacity`. `capacity` sepertinya sisa model paket lama.

**(4)** `price` dikonversi `Math.round(values.price * 100)` menjadi `price_cents`; benar untuk satuan sen, tetapi label input "Harga (Rp)" dan `formatCurrency` membagi 100 — konsisten.

**(5)** UI menulis "0 = tidak terbatas" untuk `max_capacity`, tetapi skema mewajibkan `min(1)`. Backend mengizinkan 0. Petunjuk UI dan validasi bertentangan; nilai 0 ditolak sebelum sampai ke server.

**(6)** `code` dan `category` tidak dikirim ke backend (payload hanya name, description, cover_image, price_cents, duration_hours, max_capacity), jadi bahkan jika validasi lolos, data itu dibuang.

**(7)** `status` juga tidak dikirim saat create (backend selalu aktif) dan tidak dipakai `toggleActive` (yang mengirim `is_active`). Field ini murni beban validasi.

### 11.8.2 `features/destination/schemas/package.schema.ts` vs `CreatePackagePayload`

**(1)** Tipe payload hanya memuat enam field yang dikirim; skema memuat sebelas. Tidak ada type-level check yang menghubungkan keduanya, sehingga selisih ini tidak terdeteksi compiler.

**(2)** `UpdatePackagePayload` mewajibkan `is_active`, dan `toggleActive` mengirim seluruh field — sesuai kontrak backend yang full-replace, tetapi rawan jika backend menambah field baru (frontend akan mengirim nilai lama yang mungkin sudah basi).

### 11.8.3 `features/facility/schemas/facility.schema.ts`

**(1)** `image_url` hanya URL absolut; `description`, `icon`, `location`, `operating_hours` memakai `.optional().default("")`. Form mengirim string kosong, backend `omitempty` menerimanya.

**(2)** `sort_order` `min(0)`, tetapi input `type="number"` dengan `valueAsNumber` bisa menghasilkan `NaN` saat kosong; zod akan menolak dengan pesan generik yang tidak dirender (tidak ada `errors.sort_order`).

**(3)** `status` default `"active"`; jika `reset()` dipanggil tanpa argumen setelah edit, status kembali ke default saat form dibuka lagi.

### 11.8.4 `features/cms/schemas/article.schema.ts`

**(1)** `cover_image` URL absolut, konsisten dengan backend `url`. Tidak ada field status; publish terpisah. Baik.

**(2)** `excerpt` default `""`, tetapi form tidak menampilkan error untuk excerpt; max 500 bisa terlewati tanpa umpan balik (input tidak memiliki `maxLength`).

### 11.8.5 `features/faq/schemas/faq.schema.ts` dan `visitor-rule.schema.ts`

**(1)** Keduanya memakai `z.enum` dari konstanta di `types/`, sehingga nilai yang dikirim dijamin salah satu dari daftar frontend. Kecocokan dengan `oneof` backend bergantung pada duplikasi daftar yang sama.

**(2)** `priority` default `normal`; `sort_order` default 0. `is_published` default false.

**(3)** Tidak ada `.strict()`; field ekstra dari form (jika ada) akan dibuang oleh zod, bukan error.

## 11.9 Ringkasan frontend lanjutan

**(1)** **Form paket tidak dapat disubmit.** Skema mewajibkan empat field yang tidak ada di form, dan error-nya tidak dirender. Ini bug fungsional paling serius yang ditemukan di bagian frontend ini.

**(2)** **Hitungan "Total/Draft/Dipublikasikan" salah saat data > limit.** Semua komponen admin menghitung dari `data.length` yang dibatasi 20/24/50, bukan dari `meta.total`.

**(3)** **Tidak ada paginasi di seluruh komponen admin fitur.** Artikel 21+, galeri 25+, FAQ/fasilitas/aturan 51+, informasi destinasi 21+ tidak dapat dikelola.

**(4)** **Dialog hapus konsisten, kecuali artikel.** Artikel langsung terhapus tanpa konfirmasi; komponen lain memakai `ConfirmDialog` tetapi menyebut "permanen" untuk soft-delete.

**(5)** **Request ganda untuk hitungan publikasi.** Empat komponen memanggil endpoint `published` terpisah hanya untuk menghitung, padahal daftar utama sudah memuat `is_published`.

**(6)** **Aksi berbasis hover tidak dapat diakses di perangkat sentuh** (galeri), dan `EmptyState` tidak menyediakan retry untuk error.

**(7)** **Skema dan payload tidak terhubung ke tipe.** Perbedaan field antara zod, form, dan `Create*Payload` tidak terdeteksi compiler; package adalah contoh yang sudah menyebabkan kegagalan.
---


# 12. DataTable (frontend)

Sub-bagian backend 12.1–12.10 dan ringkasan 12.12 ada di `CODEBASE_BACKEND.md`. Yang tersisa untuk frontend adalah tabel generik yang dipakai hampir semua panel.

## 12.11 `frontend/components/tables/data-table.tsx` — 35 baris

```tsx
export function DataTable<T extends { id: string }>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
```

**(1)** Generic `T` dibatasi `{ id: string }`, sehingga setiap baris wajib punya `id` string. Tipe `Column<T>` mendefinisikan `header: string` dan `cell: (row: T) => ReactNode`.

**(2)** Destructuring `{ columns, rows }` langsung di parameter; tipe objek ditulis inline. Tidak ada `className`/`emptyMessage`/`loading`, sehingga tabel tidak bisa dikustomisasi dari pemanggil.

```tsx
{columns.map((col) => (
  <th key={col.header} ...>{col.header}</th>
))}
```

**(3)** `key={col.header}` memakai teks header sebagai key. Jika dua kolom punya header sama (mis. dua kolom "Aksi" di masa depan), React memperingatkan duplicate key dan bisa salah mencocokkan sel.

**(4)** `columns.map` di dalam `thead` menghasilkan array `<th>`; tidak ada `<caption>`, `scope="col"`, atau `aria-sort`. Aksesibilitas tabel minimal.

```tsx
{rows.map((row) => (
  <tr key={row.id} ...>
    {columns.map((col) => <td key={col.header}>{col.cell(row)}</td>)}
  </tr>
))}
```

**(5)** `col.cell(row)` dipanggil setiap render; tidak ada memoization. Untuk tabel besar dengan cell kompleks, ini bisa mahal, tetapi data dibatasi 20–50 baris.

**(6)** Tidak ada state kosong: `rows=[]` menghasilkan `<tbody>` kosong tanpa pesan. Semua pemanggil menanganinya di luar (`EmptyState`), sehingga tabel tidak pernah dipakai untuk data kosong.

**(7)** Tidak ada paginasi/sortir/filter; semuanya diserahkan ke pemanggil. Ini menjelaskan mengapa setiap halaman admin mengulang logika paginasi (dan sering salah).

**(8)** `overflow-x-auto` pada wrapper memungkinkan scroll horizontal di layar kecil; tabel `w-full` memaksa kolom menyusut, dan `whitespace-nowrap` tidak dipakai, sehingga teks panjang membungkus dan tinggi baris tidak seragam.


