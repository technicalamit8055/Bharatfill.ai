# Auth email templates

Branded HTML for the three Supabase Auth emails. `supabase/config.toml` wires them up for the
local stack. The hosted project does **not** read this folder — paste each file into
Dashboard → Authentication → Email Templates (and set the subject lines from `config.toml`).

## Sender name ("Supabase Auth")

The sender is not a template setting. Supabase's built-in mailer sends as "Supabase Auth" and is
rate-limited and meant for testing. To send as "Bharatfill <no-reply@your-domain>":

1. Dashboard → Authentication → SMTP Settings → enable custom SMTP.
2. Enter the provider's host, port and credentials, sender email, and sender name `Bharatfill`.
3. Verify the sending domain at the provider (SPF, DKIM, and DMARC DNS records) or mail lands in spam.
