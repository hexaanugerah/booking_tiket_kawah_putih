# DocuConvert API

Base URL pengembangan: `http://127.0.0.1:8000`

Semua endpoint berada di bawah prefix `/api/v1`. Swagger interaktif tersedia di
`/docs`, dan skema OpenAPI di `/openapi.json`.

---

## Konvensi umum

### Format respons

Respons sukses berupa JSON (kecuali unduhan berkas dan `204 No Content`).
Kesalahan selalu berbentuk:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request data is invalid.",
    "details": [{ "field": "body.email", "message": "value is not a valid email address" }]
  }
}
```

Kode kesalahan yang umum:

| HTTP | `code` | Arti |
|---|---|---|
| 400 | `bad_request` | Permintaan tidak valid secara umum. |
| 401 | `unauthorized` | Belum login atau token tidak valid. |
| 403 | `forbidden` | Hasil belum siap atau akses ditolak. |
| 404 | `not_found` | Pekerjaan/alat tidak ditemukan (termasuk milik pengguna lain). |
| 409 | `conflict` | Email sudah terdaftar. |
| 410 | `expired` | Tautan unduhan sudah kedaluwarsa. |
| 413 | `file_too_large` | Melebihi `MAX_UPLOAD_MB`. |
| 415 | `unsupported_format` | Ekstensi/isi berkas tidak didukung alat. |
| 422 | `validation_error` / `conversion_failed` | Data tidak valid atau konversi gagal. |
| 429 | `rate_limited` | Terlalu banyak permintaan. |
| 500 | `internal_error` | Kesalahan tak terduga (detail tidak dibocorkan). |

### Autentikasi

Dua mekanisme yang didukung bersamaan:

1. **Cookie sesi** — `dc_access` (HttpOnly, SameSite=Lax) di-set saat login/register.
2. **Bearer token** — nilai `access_token` dari respons login/register:

```http
Authorization: Bearer <token>
```

Pengguna anonim mendapat cookie `dc_guest` saat pertama kali membuat pekerjaan.
Pekerjaan anonim hanya dapat diakses oleh cookie tersebut.

### Batas dan kebijakan

Nilai aktual dapat dibaca dari `GET /api/v1/formats` (`capabilities.limits`) dan
`GET /api/v1/conversions/stats` (`usage`).

- Ukuran maksimum per berkas: default 25 MB.
- Maksimum berkas per pekerjaan: default 10 (beberapa alat hanya menerima 1).
- Masa simpan hasil: default 24 jam.
- Rate limit: default 60 permintaan/menit per IP (in-memory per proses).
- Timeout konversi: default 180 detik.

### Status pekerjaan

```text
queued ──▶ processing ──▶ completed
                    └───▶ failed
completed ──(kedaluwarsa)──▶ expired
```

Frontend melakukan polling `GET /conversions/{id}` sampai status terminal. Tidak
ada perhitungan persentase karena backend tidak melaporkan progres per tahap.

### Idempotensi dan format unggahan

Endpoint pembuatan pekerjaan memakai `multipart/form-data`:

- `tool` — ID alat (lihat daftar di bawah).
- `options` — string JSON berisi opsi (opsional, default `{}`).
- `files` — satu atau lebih bagian berkas dengan nama field `files`.

---

## Health

### `GET /api/v1/health`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "database": "ok",
  "capabilities": {
    "libreoffice": { "available": false, "path": null, "used_for": ["..."] },
    "ocr": { "available": true, "engine": "rapidocr", "languages": ["eng", "ind"] },
    "libraries": { "PyMuPDF": "1.28.2", "pdfplumber": "0.11.9" },
    "limits": { "max_upload_mb": 25, "max_files_per_job": 10, "result_ttl_hours": 24 }
  }
}
```

`status` bernilai `degraded` bila koneksi database gagal.

---

## Format dan alat

### `GET /api/v1/formats`

Mengembalikan:

```json
{
  "tools": [
    {
      "id": "pdf-to-word",
      "label": "PDF ke Word",
      "description": "Ekstrak teks, tabel, dan gambar PDF menjadi dokumen DOCX yang dapat diedit.",
      "category": "pdf",
      "inputs": [".pdf"],
      "output": "docx",
      "available": true,
      "unavailable_reason": null,
      "multiple": false,
      "min_files": 1,
      "max_files": 1,
      "processing_note": "Tata letak kompleks ...",
      "options": [
        {
          "name": "ocr",
          "label": "Deteksi hasil pindai (OCR)",
          "type": "select",
          "default": "auto",
          "choices": [
            { "value": "auto", "label": "Otomatis" },
            { "value": "always", "label": "Selalu gunakan OCR" },
            { "value": "never", "label": "Jangan gunakan OCR" }
          ],
          "help": null,
          "placeholder": null,
          "min": null,
          "max": null
        }
      ]
    }
  ],
  "categories": [{ "id": "pdf", "label": "PDF" }],
  "formats": { "input": ["pdf", "docx"], "output": ["docx", "pdf"] },
  "capabilities": { "...": "sama seperti health" }
}
```

Alat dengan `available: false` **tidak boleh** ditampilkan sebagai alat yang bisa
dipakai. Alasannya ada di `unavailable_reason`.

### ID alat

PDF: `pdf-to-word`, `pdf-to-excel`, `pdf-to-pptx`, `pdf-to-images`, `merge-pdf`,
`split-pdf`, `rotate-pdf`, `compress-pdf`, `extract-text`, `extract-tables`,
`add-page-numbers`, `add-watermark`, `remove-pages`, `reorder-pdf`.

Word: `docx-to-pdf`, `docx-to-txt`, `docx-to-html`, `docx-to-markdown`,
`txt-to-docx`, `markdown-to-docx`, `merge-docx`, `clean-docx`.

Excel: `xlsx-to-pdf`, `xlsx-to-csv`, `csv-to-xlsx`, `xlsx-to-html`.

PowerPoint: `pptx-to-pdf`, `pptx-to-images` (memerlukan LibreOffice).

Gambar & OCR: `image-to-pdf`, `convert-image`, `image-ocr`, `pdf-ocr-to-word`.

Teks & Web: `html-to-pdf`, `txt-to-pdf`, `markdown-to-pdf`.

Opsi yang tidak dideklarasikan alat akan diabaikan. Nilai select di luar pilihan
jatuh ke default; angka di-clamp ke `min`/`max`.

---

## Autentikasi

### `POST /api/v1/auth/register`

```json
{ "name": "Ani", "email": "ani@example.com", "password": "Password123" }
```

Respons `201`:

```json
{
  "user": { "id": "uuid", "name": "Ani", "email": "ani@example.com", "created_at": "..." },
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

Pekerjaan tamu pada peramban yang sama otomatis dipindahkan ke akun baru.

Aturan kata sandi: 8–128 karakter, mengandung huruf dan angka, tanpa spasi di awal/akhir.

### `POST /api/v1/auth/login`

```json
{ "email": "ani@example.com", "password": "Password123" }
```

Respons `200` sama seperti register. Kredensial salah menghasilkan `401 unauthorized`.

### `POST /api/v1/auth/logout`

`204 No Content`; menghapus cookie `dc_access`.

### `GET /api/v1/auth/me`

Memerlukan autentikasi. Mengembalikan objek `user`.

### `PATCH /api/v1/auth/me`

```json
{ "name": "Ani Baru", "email": "ani.baru@example.com" }
```

Kedua field opsional. Email duplikat → `409`.

### `POST /api/v1/auth/change-password`

```json
{ "current_password": "Password123", "new_password": "Password456" }
```

`204 No Content`. Kata sandi saat ini salah → `401`.

### `GET /api/v1/auth/session`

Endpoint publik untuk hidrasi frontend:

```json
{ "authenticated": true, "user": { "...": "..." }, "anonymous_allowed": true }
```

---

## Pekerjaan konversi

### `POST /api/v1/conversions`

Membuat pekerjaan. Rate-limited.

```bash
curl -X POST http://127.0.0.1:8000/api/v1/conversions \
  -F "tool=pdf-to-word" \
  -F 'options={"ocr":"auto","language":"eng"}' \
  -F "files=@report.pdf"
```

Respons `202 Accepted` (status awal `queued`; pemrosesan berjalan setelah respons):

```json
{
  "id": "4e87...",
  "tool": "pdf-to-word",
  "original_filename": "report.pdf",
  "input_format": "pdf",
  "output_format": "docx",
  "status": "queued",
  "file_size": 2382,
  "output_filename": null,
  "output_size": null,
  "error_message": null,
  "warnings": [],
  "options": { "ocr": "auto", "language": "eng", "page_breaks": false, "tables": true },
  "created_at": "2026-10-22T12:59:55",
  "started_at": null,
  "completed_at": null,
  "expires_at": "2026-10-23T12:59:55",
  "download_url": null
}
```

Kemungkinan error: `413`, `415`, `422` (opsi/JSON atau jumlah berkas), `429`.

### `GET /api/v1/conversions`

Riwayat milik identitas saat ini.

Query:

| Parameter | Default | Keterangan |
|---|---|---|
| `page` | 1 | Halaman (≥ 1). |
| `page_size` | 20 | 1–100. |
| `status` | — | `queued`, `processing`, `completed`, `failed`, `expired`. |
| `tool` | — | ID alat. |
| `q` | — | Pencarian nama berkas/alat (case-insensitive). |

Respons:

```json
{ "items": [{ "...": "..." }], "total": 12, "page": 1, "page_size": 20 }
```

### `GET /api/v1/conversions/stats`

```json
{
  "total": 12,
  "completed": 9,
  "failed": 1,
  "processing": 2,
  "success_rate": 90.0,
  "processed_bytes": 412000,
  "recent": [{ "...": "5 pekerjaan terakhir" }],
  "usage": {
    "max_upload_mb": 25,
    "max_files_per_job": 10,
    "result_ttl_hours": 24,
    "allow_anonymous": true
  }
}
```

### `GET /api/v1/conversions/{job_id}`

Detail status terkini. `404` bila tidak ada atau bukan milik pemanggil.

### `GET /api/v1/conversions/{job_id}/download`

Mengunduh hasil sebagai lampiran (`Content-Disposition`).

- `200` — hasil tersedia.
- `404` — tidak ditemukan/bukan milik Anda.
- `410` — kedaluwarsa (berkas dihapus).
- `422` — pekerjaan gagal (berisi pesan kegagalan).
- `403` — hasil belum siap.

### `DELETE /api/v1/conversions/{job_id}`

`204 No Content`. Menghapus pekerjaan, log terkait, berkas masukan, dan hasil.

### `DELETE /api/v1/conversions`

Menghapus seluruh riwayat milik identitas saat ini.

```json
{ "deleted": 12 }
```

---

## Endpoint PDF khusus

Endpoint berikut adalah pembungkus tipis di atas pipeline pekerjaan yang sama.
Semuanya mengembalikan `202` dengan objek pekerjaan dan menerima
`multipart/form-data`.

### `POST /api/v1/pdf/merge`

Field: `files` (2–10 PDF).

### `POST /api/v1/pdf/split`

Field: `files` (1 PDF), `options` (JSON):

```json
{ "mode": "each" }
{ "mode": "ranges", "ranges": "1-3,4-6" }
```

Hasil berupa ZIP.

### `POST /api/v1/pdf/compress`

Field: `files` (1 PDF). Hasil PDF yang dioptimalkan; bila sudah padat, respons
berisi peringatan bahwa ukuran tidak mengecil.

---

## OCR

### `POST /api/v1/ocr`

Field:

- `files` — tepat satu gambar atau PDF.
- `output_format` — `txt` (default) atau `docx`.
- `language` — `eng`, `ind`, atau `eng+ind` (default `eng`).

Untuk gambar alatnya `image-ocr` (hasil TXT). Untuk PDF:
- `txt` → `extract-text` (OCR hanya pada halaman tanpa lapisan teks),
- `docx` → `pdf-ocr-to-word` (OCR semua halaman).

Bila tidak ada mesin OCR, endpoint mengembalikan `415 unsupported_format` dengan
alasan bahwa OCR tidak tersedia.

---

## Contoh alur klien

```ts
// 1. Buat pekerjaan
const form = new FormData();
form.append("tool", "pdf-to-word");
form.append("options", JSON.stringify({ ocr: "auto", language: "eng" }));
form.append("files", file);
const job = await fetch(`${API}/api/v1/conversions`, {
  method: "POST",
  body: form,
  credentials: "include",
}).then((r) => r.json());

// 2. Polling sampai status terminal
let current = job;
while (current.status === "queued" || current.status === "processing") {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  current = await fetch(`${API}/api/v1/conversions/${job.id}`, {
    credentials: "include",
  }).then((r) => r.json());
}

// 3. Unduh hasil
if (current.status === "completed") {
  const blob = await fetch(`${API}${current.download_url}`, { credentials: "include" }).then((r) => r.blob());
}
```

---

## CORS

Origin yang diizinkan diambil dari `CORS_ORIGINS` (dipisah koma). Default
mengizinkan `http://localhost:3000`, `http://127.0.0.1:3000`,
`http://localhost:3001`, dan `http://127.0.0.1:3001`. Kredensial diizinkan
(`Access-Control-Allow-Credentials: true`), sehingga wildcard origin tidak dapat
dipakai.
