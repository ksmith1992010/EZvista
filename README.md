# Vista Field Tool

Full copy of the Measure2Estimate field tool, rebranded for Vista Exterior
Construction. Static site in `web/` — no build step; Netlify publishes `web`
(see `netlify.toml`) on every push to the default branch.

Tabs: Estimate Creator (m2e), Material Order Generator (m2mo), Depreciation
Request (m2dr), Production (AR & income tracker).

Differences from the source site:

- **Logo swapped** everywhere (`web/logo.png`, white background) and company
  branding set to Vista Exterior Construction. `COMPANY.address`/`phone` and
  the rep contact block are blank — fill them in (`const COMPANY` / `const REP`
  near the top of each page's script) so estimates and PDFs print your info.
- **All data removed** — the Production sheet and customer picker start empty
  (`web/production.json` and `web/customers.json` are `[]`), and the tracker's
  bank / overhead / pipeline defaults are 0 with generic goal rows.
- **Password gate** (`web/gate.js`, included by every page): default password
  `Vista.123`, changeable via the link on the lock screen. The custom password
  is stored per-browser; unlocking lasts for the tab session. Clearing the
  site's browser data resets the password to the default and erases saved
  sheets — export CSV backups first. It's a lightweight client-side gate, not
  real security.

Everything else — layouts, math, PDF generation, CSV import/export,
localStorage autosave — is identical to the source site.
