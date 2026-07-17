# Vista Field Tool

Full copy of the Measure2Estimate field tool, rebranded for Vista Exterior
Construction. Static site in `web/` — no build step; Netlify publishes `web`
(see `netlify.toml`) on every push to the default branch.

Tabs: Estimate Creator (m2e), Material Order Generator (m2mo), Depreciation
Request (m2dr), Production (AR/AP & income tracker). The estimator and
material order both auto-detect GAF QuickMeasure vs insurance scope (damage
report) PDFs, and accept photos or scanned image-only PDFs via in-browser OCR
(Tesseract vendored under `web/tess/`, lazy-loaded on first photo).

Differences from the source site:

- **Logo + colors**: `web/logo.png` is the Vista logo (white background) and
  it prints on estimates, material orders, and letters; the red accent scheme
  is swapped for the logo's greens (dark `#2e4b44`, sage `#7fa173`).
- **Company/rep info via settings**: after unlocking, the gear button
  (bottom-right of every page) opens Site settings — company name, address,
  phone, and rep name/phone/email. Saved per browser and applied to every
  estimate, order, and letter header. Ships blank except the company name.
- **All data removed** — the Production sheet and customer picker start empty
  (`web/production.json` and `web/customers.json` are `[]`), and the tracker's
  bank / overhead / pipeline defaults are 0 with generic goal rows.
- **Password gate** (`web/gate.js`, included by every page): default password
  `Vista.123`, changeable from the lock screen or from the settings panel
  after login. The custom password is stored per-browser; unlocking lasts for
  the tab session. Clearing the site's browser data resets the password to the
  default and erases saved sheets/settings — export CSV backups first. It's a
  lightweight client-side gate, not real security.

Everything else — layouts, math, PDF generation, CSV import/export,
localStorage autosave — is identical to the source site.
