"""Safely configure public Supabase project credentials. Never requests secret keys."""
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web'/'config.js'

def valid_url(value):
    u=urlparse(value)
    return u.scheme=='https' and bool(u.hostname) and u.hostname.endswith('.supabase.co') and not u.username and not u.password

def main():
    print('\nAEVONE OS | PUBLIC Supabase setup\n')
    print('Paste ONLY Supabase Project URL and sb_publishable_... key.')
    print('NEVER paste a service_role, sb_secret, OpenAI, Apollo or other private key here.\n')
    url=input('Supabase Project URL [https://fjlxxiqkyzesgywyxxgk.supabase.co]: ').strip() or 'https://fjlxxiqkyzesgywyxxgk.supabase.co'
    if not valid_url(url): raise SystemExit('Invalid Supabase Project URL. Must be https://...supabase.co')
    key=input('Supabase publishable key (sb_publishable_...): ').strip()
    if not key.startswith('sb_publishable_') or len(key)<30:
        raise SystemExit('Only a Supabase publishable key starting with sb_publishable_ is allowed.')
    data={'url':url.rstrip('/'),'publishableKey':key}
    OUT.write_text('// Public-only client configuration; never add secret keys.\nwindow.AEVONE_CONFIG = '+json.dumps(data)+';\n',encoding='utf-8')
    print('\nSaved local config.js. Do not push your personal setup file to GitHub.')
    print('You can launch the app with START_AEVONE_OS.bat.\n')

if __name__=='__main__':main()
