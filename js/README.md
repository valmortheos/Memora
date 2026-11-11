# 📘 Memora

Catatan pribadi dengan **commit history immutable**, dukungan media, format `.memento`, tanpa backend.

## Cara Hosting (GitHub Pages)
1. Push semua file ke repo GitHub.
2. Settings → Pages → Source: `main` branch / root.
3. Buka `https://<username>.github.io/<repo>/`.

## Cara Pakai
1. **Set Passphrase** (min 6 karakter) di tombol header.
2. Tulis catatan, tambah media via 📎.
3. Klik **💾 Commit** (atau `Ctrl/Cmd + Enter`).
4. Klik **⬇️ Unduh .memento** untuk menyimpan file.
5. Klik **⬆️ Impor .memento** untuk membuka catatan lama — passphrase + verifikasi hash chain akan dijalankan otomatis.

## Shortcut
- `Ctrl/Cmd + Enter` — Commit
- `Ctrl/Cmd + S` — Unduh `.memento`

## Keamanan
- Semua proses di browser (Web Crypto API).
- Passphrase **tidak pernah** disimpan.
- Setiap commit ditandatangani HMAC-SHA256, chain-nya immutable.
- File `.memento` di-obfuscate (XOR + Base64), bukan enkripsi — gunakan passphrase kuat.
