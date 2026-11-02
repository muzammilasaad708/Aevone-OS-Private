import base64, secrets
print('AEVONE_VAULT_KEY_B64='+base64.b64encode(secrets.token_bytes(32)).decode('ascii'))
print('Store this value only in Supabase Edge Function Secrets; do NOT upload or commit it.')
