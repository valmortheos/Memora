#!/usr/bin/env python3
"""Static server untuk Memora — melarang cache total (dev mode)."""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{self.address_string()} — {fmt % args}\n")

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f'Memora dev server (no-cache) → http://127.0.0.1:{port}/')
    print('Tekan Ctrl+C untuk stop.\n')
    HTTPServer(('', port), NoCacheHandler).serve_forever()
