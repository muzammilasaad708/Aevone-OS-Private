"""Start the AEVONE OS static frontend only after localhost listener is ready."""
import functools
import http.server
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'

class SafeHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        # No credentials logged, only the requested local static asset path.
        if not self.path.endswith('config.js'):
            print(fmt % args)

def main():
    if not (WEB/'config.js').exists():
        sys.exit('Public config.js is missing. Run CONFIGURE_AEVONE_OS.bat first.')
    handler = functools.partial(SafeHandler, directory=str(WEB))
    try:
        httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 4173), handler)
    except OSError as exc:
        sys.exit('Local port 4173 unavailable. Close the previous AEVONE OS instance and retry. '+str(exc))
    print('AEVONE OS ready: http://localhost:4173')
    print('Leave this window open while you use the app. Press Ctrl+C to stop.')
    webbrowser.open('http://localhost:4173/')
    try:
        httpd.serve_forever(poll_interval=.25)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__=='__main__': main()
