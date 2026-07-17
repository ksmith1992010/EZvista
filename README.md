# Vista Production Tracker

Single-file job money tracker for Vista Exterior Construction. Everything lives
in `index.html` — no build step, no dependencies; it also works by just
double-clicking the file in a browser.

- **Password gate** — default `Vista.123`, changeable in the app via
  "Change password…". The password is stored per-browser (a new device starts
  back at the default). Clearing the site's browser data resets the password
  **and erases the sheet**, so keep CSV backups. It's a lightweight client-side
  gate, not bank-grade security.
- **Active / PIF sub-tabs** — checking PIF moves a job to the PIF tab while its
  numbers stay in every total and equation. Amber rows = installed but not
  paid in full (the collections list).
- **Editable grid** — customers, reps, claim/PO numbers, dates, ACV,
  depreciation, materials, labor, notes, installed/PIF checkboxes; sortable
  columns, live search filter, and an "approve $ change" confirmation before
  any money cell hard-changes.
- **Income overlook** — money in the book, accounts receivable, overhead
  runway, two pipeline projections, and an editable goals ladder (names,
  amounts, avg profit per job, deadline) with jobs-needed and contracts-per-week.
- **Payables** — Materials (total prefills from the Mats column, owed = total −
  paid), plus Subs and Rep-pay lists with owed/paid/balance per person.
- **Autosave** — everything saves to this browser's localStorage automatically.
  Use Export CSV for backups or to move devices; Import CSV restores them.

## Deploy

Netlify publishes the repo root (`netlify.toml` → `publish = "."`). Connect
this repo as a new Netlify project and every push to the default branch
deploys automatically.
