This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


Absolutely! Here's a full `README.md` that documents a complete local → production development pipeline for the frog-labeler project using:

* **Next.js + Prisma** (Dev & Prod)
* **Caddy** (HTTPS with DuckDNS)
* **Systemd** (Next.js service)
* **SMB audio file share**
* **Git-based deploy flow**

---

### 🐸 frog-labeler — Dev to Production Guide

This document explains how to:

* Set up and run the app locally for development
* Push changes to a remote server
* Pull updates on the production server
* Rebuild, restart, and verify everything works in production

---

## 🚧 Development Workflow

### 1. Clone and install

```bash
git clone https://github.com/YOURORG/frog-labeler.git
cd frog-labeler
pnpm install
```

### 2. Set up your `.env`

Create `.env.local` in the project root:

```ini
# OAuth & secrets
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=devsecret123

GITHUB_ID=...
GITHUB_SECRET=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Local audio path
AUDIO_DIR=/Volumes/frog/Data
AUDIO_ROOT=/Volumes/frog/Data

# Dev DB (or use remote shared one)
DATABASE_URL="postgresql://myuser:supersecret@192.168.1.193:5432/mydb"
```

### 3. Dev server

```bash
pnpm dev
```

Visit: [http://localhost:3000](http://localhost:3000)

---

## 🚀 Production Setup (Ubuntu Server)

### 1. Directory Structure

```bash
/opt/apps/frog-labeler/
├── frog-labeler/         # actual code repo
├── .env.production       # production env file (not checked in)
└── frogshare/            # mount point for SMB share
```

### 2. Environment File

Create `/opt/apps/frog-labeler/.env.production`:

```ini
NEXTAUTH_URL=https://frogsng.duckdns.org
NEXTAUTH_SECRET=adeekdigiemgiekbeobpqdngs
NEXTAUTH_TRUST_HOST=true

GITHUB_ID=...
GITHUB_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

DATABASE_URL=postgresql://myuser:supersecret@192.168.1.193:5432/mydb

AUDIO_DIR=/mnt/frogshare/Data
AUDIO_ROOT=/mnt/frogshare/Data

NODE_ENV=production
PORT=3000
```

Make it readable:

```bash
sudo chmod 600 /opt/apps/frog-labeler/.env.production
```

---

### 3. Systemd Service

Create `/etc/systemd/system/frog-labeler.service`:

```ini
[Unit]
Description=Frog Labeler (Next.js - next start)
After=network.target

[Service]
User=ladew222
WorkingDirectory=/opt/apps/frog-labeler/frog-labeler
EnvironmentFile=/opt/apps/frog-labeler/.env.production
ExecStart=/usr/bin/pnpm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now frog-labeler
```

---

### 4. Caddy HTTPS Proxy

Install Caddy and create `/etc/caddy/Caddyfile`:

```caddy
frogsng.duckdns.org {
  reverse_proxy 127.0.0.1:3000
}
```

Then:

```bash
sudo systemctl enable --now caddy
```

Verify HTTPS is live:

```bash
curl -I https://frogsng.duckdns.org
```

---

### 5. Mount Audio Share (SMB)

Create mount credentials:

```bash
sudo nano /etc/frogshare.cred
# Add:
username=ladew222
password=YourSambaPass
domain=WORKGROUP
```

Mount the SMB share:

```bash
sudo mount -t cifs //192.168.1.221/frog /mnt/frogshare \
  -o credentials=/etc/frogshare.cred,vers=3.0,uid=$(id -u),gid=$(id -g),file_mode=0644,dir_mode=0755
```

Make it permanent via `/etc/fstab`:

```fstab
//192.168.1.221/frog  /mnt/frogshare  cifs  credentials=/etc/frogshare.cred,vers=3.0,uid=1000,gid=1000,file_mode=0644,dir_mode=0755  0 0
```

---

## 🔁 Deploying Updates (Dev → Prod)

### On your dev machine:

1. Make changes
2. Commit and push

```bash
git add .
git commit -m "Fix bug"
git push
```

---

### On the server:

1. SSH into the server:

```bash
ssh ladew222@192.168.1.24
```

2. Stop the app:

```bash
sudo systemctl stop frog-labeler
```

3. Pull latest code:

```bash
cd /opt/apps/frog-labeler/frog-labeler
git stash # if needed
git pull
or  to keep config:
git update-index --skip-worktree next.config.ts

```

4. Load env vars:

```bash
set -a
. /opt/apps/frog-labeler/.env.production
set +a
```

5. Rebuild:

```bash
pnpm install --frozen-lockfile
pnpm dlx prisma generate
pnpm build
```

6. Restart the service:

```bash




```

7. Check logs:

```bash
journalctl -u frog-labeler -f
```

---

## 🛠 Troubleshooting

### ❌ `ENOENT` on audio file?

You're likely referencing a macOS path:

```bash
/Volumes/frog/Data/...
```

Make sure you're using the mounted Linux path in `.env.production`:

```ini
AUDIO_ROOT=/mnt/frogshare/Data
```

And restart the service after updating:

```bash
sudo systemctl restart frog-labeler
```

---

### ❌ `GET /auth/signin` Loop?

* Check `NEXTAUTH_URL` matches Caddy domain and uses HTTPS.
* Add this to `.env.production`:

```ini
NEXTAUTH_TRUST_HOST=true
```

Then restart:

```bash
sudo systemctl restart frog-labeler
```

---

Let me know if you'd like this exported to a file or if you're using a different service (e.g., nginx, Docker).
