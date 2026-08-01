# Deploy Guide — MasterPay

Quick reference for deploying to the production server.

## Server

- **Host**: `ubuntu-s-2vcpu-4gb-nyc1-01` (DigitalOcean)
- **Repo path**: `/root/MasterPay`
- **Backend process**: PM2, name `masterpay-backend`
- **Frontend serving**: Nginx, web root `/var/www/html/`
- **Database**: PostgreSQL (`masterpay`), runs in Docker container `masterpay-postgres`

## One-time setup: switch to SSH (do this once, never deal with tokens again)

On the server:

```bash
ssh-keygen -t ed25519 -C "rdpay-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy the printed line, paste at https://github.com/settings/keys → **New SSH key**. Then:

```bash
cd /root/MasterPay
git remote set-url origin git@github.com:sarbdeol/MasterPay.git
ssh -T git@github.com   # should say "Hi sarbdeol!"
```

After this, every future deploy is just `git pull` — no token prompts.

## Standard deploy

SSH into the server, then run from `/root/MasterPay`:

```bash
# 1. Pull
git pull origin hosted-checkout

# 2. Backend
cd Backend
npm install --omit=dev
pm2 restart masterpay-backend

# 3. Frontend
cd ../Frontend
npm install
npm run build
sudo cp -r dist/* /var/www/html/
```

**One-liner version** (run from `/root/MasterPay`):

```bash
git pull && cd Backend && npm i --omit=dev && pm2 restart masterpay-backend && cd ../Frontend && npm i && npm run build && sudo cp -r dist/* /var/www/html/ && cd ..
```

## Verify after deploy

```bash
pm2 logs masterpay-backend --lines 100
```

Look for:
- `Tables created successfully` — confirms schema auto-migration ran
- No errors on boot
- Periodic sweep messages (only when stalled txns exist):
  - `Expired checkout transactions: N`
  - `Failed verification transactions: N`

Check process health:

```bash
pm2 status                 # masterpay-backend should be "online"
pm2 monit                  # live CPU/memory
```

## Database commands

Connect to the DB:

```bash
docker exec -it masterpay-postgres psql -U postgres -d masterpay
```

Useful one-shots:

```bash
# Inspect transactions table
docker exec -it masterpay-postgres psql -U postgres -d masterpay -c "\d transactions"

# Force a verification timeout (testing the dispute flow)
docker exec -it masterpay-postgres psql -U postgres -d masterpay -c \
  "UPDATE transactions SET verification_expires_at = NOW() - INTERVAL '1 minute' WHERE transaction_id = '<REF>';"

# Get a merchant API key for testing
docker exec -it masterpay-postgres psql -U postgres -d masterpay -c \
  "SELECT id, name, api_key FROM merchants WHERE is_active = true LIMIT 5;"
```

## Schema migrations

Use a brand-new PostgreSQL database named `masterpay`; do not restore an old TrustPay/RDpay dump.

1. Set `DB_*`, `JWT_SECRET`, `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_EMAIL`,
   `SUPER_ADMIN_PASSWORD`, `DEFAULT_ADMIN_USERNAME`, and
   `DEFAULT_ADMIN_PASSWORD` in `Backend/.env`.
2. Start the backend once. `initializeDatabase()` creates the clean MasterPay
   schema and idempotently bootstraps the Super Admin and singleton Admin.
3. Apply the role constraint migration:

```bash
docker exec -i masterpay-postgres psql -v ON_ERROR_STOP=1 -U postgres -d masterpay \
  < Backend/migrations/001_masterpay_simplified_roles.sql
```

The migration deliberately aborts if legacy standalone role tables are present.
Restarting the backend is safe; seed inserts and schema initialization are
idempotent.

## Rollback

If a deploy breaks something:

```bash
cd /root/MasterPay
git log --oneline -10                 # find the last good commit
git checkout <commit-sha>             # detached HEAD on the good commit
cd Backend && npm i --omit=dev && pm2 restart masterpay-backend
cd ../Frontend && npm i && npm run build && sudo cp -r dist/* /var/www/html/
```

To return to the branch tip later: `git checkout hosted-checkout`.

## Common issues

**`fatal: Authentication failed`** — GitHub blocks password auth. Either use SSH (see one-time setup above) or generate a fine-grained PAT with **Contents: Read** on the MasterPay repo.

**`Write access to repository not granted` (403)** — Fine-grained PAT doesn't have the repo selected, or wrong scope. Easier: switch to SSH.

**`EADDRINUSE :::5000`** (or whatever your port is) — Old process didn't die. `pm2 delete masterpay-backend && pm2 start server.js --name masterpay-backend` from the Backend dir.

**Frontend changes don't show** — Browser cache. Hard-refresh (Ctrl+Shift+R). If still stale, check that `sudo cp -r dist/* /var/www/html/` actually ran and overwrote the files (`ls -la /var/www/html/assets/ | head`).

**Backend can't connect to DB** — Check the Postgres container is up: `docker ps | grep masterpay-postgres`. If not: `cd Backend && docker compose up -d`.

## Testing the hosted-checkout dispute flow end-to-end

See the walkthrough in chat history, but the short version:

1. `POST /api/payin/checkout/create` with `X-API-Key` → get `checkout_url`
2. Open the URL, submit a wrong UTR → `UTR Submitted` state
3. Force timeout via SQL (see above) + refresh → `Failed` state with dispute form
4. Submit a corrected UTR → `Disputed` state
5. In agent dashboard → Payin Transactions → filter `Disputed` → View All → Approve/Reject
