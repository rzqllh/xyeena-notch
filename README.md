# Xyeena Notch

Xyeena Notch menempatkan kontrol media, clipboard opsional, chat AI, dan ringkasan pekerjaan dalam panel kecil di bagian atas layar Windows. Xyn, karakter singa pada panel, merespons aktivitas dan interaksi pengguna.

Nama aplikasi pada installer adalah **Xyeena Island**. Rilis saat ini merupakan [alpha 1.0.0-alpha.1](https://github.com/rzqllh/xyeena-notch/releases/tag/v1.0.0-alpha.1), untuk pengguna yang bersedia mencoba fitur eksperimental dan melaporkan masalah.

## Unduh untuk Windows

Buka [halaman rilis alpha](https://github.com/rzqllh/xyeena-notch/releases/tag/v1.0.0-alpha.1). Unduh `Xyeena.Island_1.0.0-alpha.1_x64-setup.exe` dan `SHA256SUMS.txt` dari rilis yang sama.

Installer belum ditandatangani secara digital. Periksa sumber unduhan dan cocokkan SHA-256 sebelum memasang. Windows dapat menampilkan peringatan SmartScreen; jika asal atau checksum tidak sesuai, jangan lanjutkan instalasi.

Aplikasi menargetkan Windows 10/11 64-bit dan membutuhkan WebView2. Linux dan macOS belum menjadi target rilis. Panduan [pengujian Windows](docs/SMOKE-TEST-WINDOWS.md) mencatat pemeriksaan perangkat yang masih diperlukan.

## Yang tersedia

| Kebutuhan | Fitur |
| --- | --- |
| Mengontrol musik/video | Kontrol sesi media Windows dan volume |
| Menyimpan salinan sementara | Clipboard history yang kamu aktifkan sendiri |
| Menggunakan chat AI | Provider dengan API key milikmu, atau model lokal yang kompatibel |
| Melihat pekerjaan Xyeena | Membaca ringkasan run dari folder yang kamu pilih |
| Melihat ringkasan mingguan | Rekap lokal dan ekspor gambar SVG |
| Menyesuaikan tampilan | Tema terang, gelap, mengikuti sistem, dan reduced motion |

Lihat [status fitur](docs/FEATURE_STATUS.md) untuk dukungan dan batas tiap komponen. Deteksi panggilan Teams otomatis dan global shortcut masih ditunda. Xyn tetap berada di panel, bukan jendela pet terpisah.

## Privasi dan biaya

Clipboard dinonaktifkan secara default. Saat diaktifkan, salinan berada dalam memori sesi dan dapat dibersihkan. Jangan menggunakannya sebagai penyimpanan permanen.

API key chat dirancang untuk memori sesi, bukan penyimpanan disk. Menggunakan provider cloud mengirim permintaan ke provider pilihanmu dan dapat menimbulkan biaya. Model lokal dibatasi ke alamat loopback. Aplikasi membaca ringkasan proyek yang dipilih; aplikasi tidak diberi wewenang menjalankan script atau mengubah hook agent.

Baca [security policy](SECURITY.md) untuk batas transport, data, dan pelaporan kerentanan. Alpha ini belum memiliki sertifikasi enterprise atau jaminan seluruh perilaku Windows telah diuji pada perangkatmu.

## Untuk developer

Siapkan Node.js 22.14+, Rust, Microsoft C++ Build Tools, Windows SDK, dan WebView2 untuk membangun aplikasi desktop.

```sh
npm ci
npm run check
npm run desktop
```

`npm run check` menjalankan pemeriksaan workspace, test JavaScript, build web, dan audit paket. Pemeriksaan Rust serta penerimaan manual Windows memiliki langkah tersendiri di [persyaratan rilis](docs/RELEASE_GATES.md).

## Panduan

| Tujuan | Bacaan |
| --- | --- |
| Memahami fitur dan keterbatasan | [Status fitur](docs/FEATURE_STATUS.md) |
| Memahami komponen sistem | [Arsitektur](docs/ARCHITECTURE.md) |
| Memeriksa kesiapan distribusi | [Persyaratan rilis](docs/RELEASE_GATES.md) |
| Memeriksa perilaku perangkat | [Pengujian Windows](docs/SMOKE-TEST-WINDOWS.md) |
| Menyiapkan GitHub prerelease | [Panduan rilis](docs/GITHUB_RELEASE.md) |
| Berkontribusi | [Contributing](CONTRIBUTING.md) |

[Indeks dokumentasi](docs/README.md) menyediakan jalur baca untuk pengguna dan developer.

## Lisensi dan penghargaan

Kode menggunakan [MIT](LICENSE). Adaptasi spring dan timing dari Coucou memiliki kewajiban atribusi yang dicatat dalam [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Karakter dan aset Xyeena tidak memberi hak atas aset atau merek proyek referensi. Lihat juga [UPSTREAM.md](UPSTREAM.md).
