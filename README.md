# Vista Production Tracker

Single-file job money tracker for Vista Exterior Construction. Everything lives
in `index.html` — no build step, no dependencies; it also works by just
double-clicking the file in a browser.

- **Password gate** — default `Vista.123`, changeable in the app via
  "Change password…". The password is stored per-browser (a new device starts
  back at the default). Clearing the site's browser data resets the password
  **and erases the table**, so keep CSV backups. It's a lightweight client-side
  gate, not bank-grade security.
- **Editable grid** — customers, reps, claim/PO numbers, ACV / RCV (Dep),
  materials, labor, status, notes; sortable columns, rep/unpaid/not-installed
  filters.
- **Paid tracking** — check ACV ✓ / RCV ✓ when a payment lands; the amount
  moves from "to collect" into "collected" without deleting the number. Both
  checked auto-marks PIF.
- **Dashboard + goals ladder** — live totals, months of overhead, pipeline
  projections, editable goal names/amounts with jobs-left and contracts-per-week
  to an editable deadline.
- **Autosave** — data saves to this browser's localStorage automatically.
  Use Export CSV for backups or to move devices; Import CSV restores them.

## Deploy

Netlify publishes the repo root (`netlify.toml` → `publish = "."`). Connect
this repo as a new Netlify project and every push to the default branch
deploys automatically.
