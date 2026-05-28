# Asana Integration Guide

> Connect Tabatha clock sessions to Asana time entries via the Flux Widget Server.

## Prerequisites

| Requirement | Details |
|---|---|
| **Flux Asana Widget Server** | Local Express/HTTPS server (`tabatha-asana-widget` repo) |
| **Asana Personal Access Token** | Generate at [Asana Developer Console](https://app.asana.com/0/developer-console) |
| **Asana Workspace GID** | Find in Asana URL or API |
| **Node.js ≥18** | Required for the widget server |

## Setup Steps

### 1. Clone and Configure the Widget Server

```bash
cd your-projects-dir
git clone <flux-asana-widget-repo-url>
cd tabatha-asana-widget
npm install
```

Create `.env`:
```env
ASANA_PAT=your_personal_access_token
ASANA_WORKSPACE_GID=your_workspace_gid
PORT=8443
```

### 2. Generate SSL Certificates

The widget server runs over HTTPS (required for Chrome extension communication):

```bash
mkdir certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
```

### 3. Start the Widget Server

```bash
npm start
# or: node server.js
```

Verify it's running:
```bash
curl -k https://localhost:8443/health
# Expected: {"status":"ok"}
```

### 4. Configure Tabatha

1. Open Tabatha Settings → **🔌 Integrations**
2. Set **Widget Server URL** to `https://localhost:8443`
3. Enable **Asana sync** toggle

### 5. Verify Connection

After clocking in and completing a focus session:

1. Check the Developer panel logs for `[asana]` entries
2. Verify time entries appear in your Asana workspace

## How It Works

```
┌─────────────┐    CLOCK_OUT    ┌──────────────┐    POST /time    ┌─────────────┐
│   Tabatha    │ ─────────────→ │  syncService  │ ──────────────→ │ Widget Srv  │
│  Extension   │                │  (background) │                 │ (localhost)  │
└─────────────┘                └──────────────┘                 └──────┬──────┘
                                                                       │
                                                                       ▼
                                                                 ┌─────────────┐
                                                                 │  Asana API   │
                                                                 │ (time entry) │
                                                                 └─────────────┘
```

**Data pushed on clock-out:**
- Focus label → Asana task description
- Elapsed time → duration_minutes
- Clock-in/out timestamps → started_at / completed_at
- Client/project tags → mapped to Asana project (if configured)

## Troubleshooting

| Issue | Fix |
|---|---|
| `ERR_CERT_AUTHORITY_INVALID` | Visit `https://localhost:8443` in Chrome, click "Advanced → Proceed" to trust the self-signed cert |
| `ECONNREFUSED` | Widget server not running — `npm start` |
| No time entries appearing | Check Asana PAT permissions — needs `default` scope |
| Stale data | Force sync via Settings → Sync & Account → "Sync now" |

## Database Table

Time entries are also stored locally in Supabase migration `004_flux_time_entries`:

```sql
CREATE TABLE tabatha.flux_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id UUID NOT NULL,
  focus_label TEXT,
  duration_minutes INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  asana_task_gid TEXT,
  synced_to_asana BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
