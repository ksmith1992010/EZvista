/*
 * roofparse.js — browser/Node port of the pure-logic layers of
 * roofparse/parsers/gaf.py (parse_text), roofparse/estimate.py
 * (build_estimate) + the OTT pricebook, and roofparse/materialorder.py
 * (build_material_order, the m2mo supplier-order engine).
 *
 * Golden-validated against the Python implementation: `node web/golden.test.mjs`
 * compares this port's output to roofparse's, field by field and to the cent.
 * If you change roofparse/pricebook.py, gaf.py, takeoff.py or
 * materialorder.py, mirror it here and re-run.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.roofparse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------------ //
  // number helpers — match Python semantics
  // ------------------------------------------------------------------ //
  function num(s) { return parseFloat(String(s).replace(/,/g, "").trim()); }

  // Python round(): half-to-even on the shortest decimal representation.
  function pyRound(x, nd) {
    nd = nd || 0;
    const m = Math.pow(10, nd);
    const y = x * m;
    const f = Math.floor(y);
    const diff = y - f;
    const eps = 1e-9 * Math.max(1, Math.abs(y));
    let r;
    if (Math.abs(diff - 0.5) < eps) r = (f % 2 === 0) ? f : f + 1; // ties -> even
    else r = Math.round(y);
    const out = r / m;
    return out === 0 ? 0 : out; // normalize -0
  }
  const round2 = (x) => pyRound(x, 2);

  function find(re, text) {
    const m = text.match(re);
    if (!m) return null;
    const v = num(m[1]);
    return Number.isFinite(v) ? v : null;
  }

  // ------------------------------------------------------------------ //
  // GAF QuickMeasure text parser (port of gaf.parse_text)
  // ------------------------------------------------------------------ //
  const SCALAR = {
    roof_area_sqft: /Roof Area\s+([\d,]+)\s*sq ?ft/m,
    facets:         /Roof Facets\s+(\d+)/m,
    valleys:        /\bValleys\s+([\d,]+)\s*ft/m,
    rakes:          /\bRakes\s+([\d,]+)\s*ft/m,
    eaves:          /\bEaves\s+([\d,]+)\s*ft/m,
    bends:          /\bBends?\s+([\d,]+)\s*ft/m,
    ridges:         /\bRidges\s+([\d,]+)\s*ft/m,
    hips:           /(?<!\/)\bHips\b\s+([\d,]+)\s*ft/m,
    flashing:       /\bFlash\s+([\d,]+)\s*ft/m,
    step_flashing:  /\bStep\s+([\d,]+)\s*ft/m,
    drip_edge:      /Drip Edge\s+([\d,]+)\s*ft/m,
    leak_barrier:   /Leak Barrier\s+([\d,]+)\s*ft/m,
    ridge_cap:      /Ridge Cap\s+([\d,]+)\s*ft/m,
    starter:        /Starter\s+([\d,]+)\s*ft/m,
    _ridges_hips:   /Ridges\/Hips\s+([\d,]+)\s*ft/m,
    pen_count:      /Penetrations\s+(\d+)/m,
    pen_area:       /Pen\. Area\s+([\d,]+)\s*sq ?ft/m,
    pen_perimeter:  /Pen\. Perimeter\s+([\d,]+)\s*ft/m,
  };

  function pitchToRatio(pitch) {
    try {
      const [rise, run] = pitch.replace(/ /g, "").split("/");
      const r = parseFloat(rise) / parseFloat(run);
      return Number.isFinite(r) ? pyRound(r, 4) : null;
    } catch (e) { return null; }
  }

  function parseSummaryTables(text) {
    const lines = text.split("\n").map((l) => l.trim());

    function rowAfter(label, start) {
      for (let i = start || 0; i < lines.length; i++) {
        const ln = lines[i];
        if (ln.startsWith(label + " ")) {
          const toks = ln.slice(label.length).split(/\s+/).filter(Boolean);
          const nums = toks.filter((t) => /^[\d,]+%?$/.test(t));
          if (nums.length >= 2) return [i, nums];
        }
      }
      return [null, null];
    }

    const pitchBreakdown = [];
    const [iPitch, pitchToks] = rowAfter("Pitch");
    if (pitchToks) {
      const [, areaToks] = rowAfter("Area", iPitch + 1);
      const [, pctToks] = rowAfter("Percent", iPitch + 1);
      pitchToks.forEach((p, j) => {
        const area = areaToks && j < areaToks.length ? num(areaToks[j]) : null;
        const pct = pctToks && j < pctToks.length ? parseFloat(pctToks[j].replace(/%$/, "")) : null;
        if (area !== null && Number.isFinite(area)) {
          pitchBreakdown.push({ pitch: `${Math.trunc(num(p))}/12`, area_sqft: area, percent: pct });
        }
      });
    }

    const wasteTable = [];
    const [iWaste, wasteToks] = rowAfter("Waste");
    if (wasteToks) {
      const [, areaToks] = rowAfter("Area", iWaste + 1);
      const [, sqToks] = rowAfter("Squares", iWaste + 1);
      wasteToks.forEach((w, j) => {
        wasteTable.push({
          waste_pct: parseFloat(w.replace(/%$/, "")),
          area_sqft: areaToks && j < areaToks.length ? num(areaToks[j]) : null,
          squares: sqToks && j < sqToks.length ? num(sqToks[j]) : null,
          suggested: false,
        });
      });
    }
    return [pitchBreakdown, wasteTable];
  }

  function validate(rm) {
    const w = [];
    const t = rm.totals;
    if (t.roof_area_sqft == null) w.push("totals.roof_area_sqft missing");
    else if (!(t.roof_area_sqft >= 50 && t.roof_area_sqft <= 500000))
      w.push(`roof_area_sqft=${t.roof_area_sqft} outside sane range`);
    if (t.squares == null && t.roof_area_sqft) t.squares = round2(t.roof_area_sqft / 100);
    if (t.predominant_pitch && !t.predominant_pitch.includes("/"))
      w.push(`predominant_pitch malformed: '${t.predominant_pitch}'`);
    const L = rm.lengths_ft;
    if (L.ridges != null && L.hips != null && L.ridge_cap != null) {
      if (Math.abs(L.ridges + L.hips - L.ridge_cap) > 2)
        w.push("ridge_cap != ridges + hips (>2ft delta)");
    }
    return w;
  }

  function parseText(text) {
    const rm = {
      schema_version: "1.0",
      source: { provider: "gaf_quickmeasure", parser: "report_parser",
                report_date: null, address: null, confidence: 0.0 },
      totals: { roof_area_sqft: null, squares: null, facets: null,
                predominant_pitch: null, predominant_pitch_ratio: null },
      pitch_breakdown: [],
      lengths_ft: { ridges: null, hips: null, valleys: null, rakes: null,
                    eaves: null, bends: null, flashing: null, step_flashing: null,
                    drip_edge: null, ridge_cap: null, starter: null, leak_barrier: null },
      penetrations: { count: null, area_sqft: null, perimeter_ft: null },
      waste_table: [],
      suggested_waste_pct: null,
      facet_geometry: [], warnings: [], raw: {},
    };

    const dm = text.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
    if (dm) rm.source.report_date = dm[1];

    const vals = {};
    for (const k in SCALAR) vals[k] = find(SCALAR[k], text);

    rm.totals.roof_area_sqft = vals.roof_area_sqft;
    rm.totals.facets = vals.facets != null ? Math.trunc(vals.facets) : null;
    if (rm.totals.roof_area_sqft) rm.totals.squares = round2(rm.totals.roof_area_sqft / 100);

    const pm = text.match(/Predominant Pitch\s+(\d+)\s*\/\s*(\d+)/) ||
               text.match(/\bPitch\s+(\d+)\s*\/\s*(\d+)/);
    if (pm) {
      rm.totals.predominant_pitch = `${pm[1]}/${pm[2]}`;
      rm.totals.predominant_pitch_ratio = pitchToRatio(rm.totals.predominant_pitch);
    }

    Object.assign(rm.lengths_ft, {
      ridges: vals.ridges, hips: vals.hips, valleys: vals.valleys,
      rakes: vals.rakes, eaves: vals.eaves, bends: vals.bends,
      flashing: vals.flashing, step_flashing: vals.step_flashing,
      drip_edge: vals.drip_edge, ridge_cap: vals.ridge_cap,
      starter: vals.starter, leak_barrier: vals.leak_barrier,
    });
    if (rm.lengths_ft.ridge_cap == null && vals._ridges_hips != null)
      rm.lengths_ft.ridge_cap = vals._ridges_hips;

    rm.penetrations = {
      count: vals.pen_count != null ? Math.trunc(vals.pen_count) : null,
      area_sqft: vals.pen_area, perimeter_ft: vals.pen_perimeter,
    };

    const [pb, wt] = parseSummaryTables(text);
    rm.pitch_breakdown = pb;
    rm.waste_table = wt;

    const core = [rm.totals.roof_area_sqft, rm.totals.facets, rm.totals.predominant_pitch,
                  rm.lengths_ft.eaves, rm.lengths_ft.valleys, rm.lengths_ft.ridges];
    rm.source.confidence = round2(core.filter((v) => v != null).length / core.length);
    rm.warnings = validate(rm);
    return rm;
  }

  // ------------------------------------------------------------------ //
  // OTT pricebook (port of roofparse/pricebook.py — SENSITIVE)
  // ------------------------------------------------------------------ //
  const OTT_PRICEBOOK = {
    shingle_field: { desc: "Owens Corning TruDefinition Duration AR (3 BD/SQ)",
      unit: "BD", unit_price: 72.8554, group: "Materials",
      qty: (c) => c.squares_order * 3 },
    starter: { desc: "Owens Corning Starter Strip Plus - 7 3/4\" (105')",
      unit: "BD", unit_price: 108.2024, group: "Materials",
      qty: (c) => (c.eaves + c.rakes) / 105 },
    hip_ridge: { desc: "Owens Corning ProEdge AR (33') - Standard Colors",
      unit: "BD", unit_price: 175.3633, group: "Materials",
      qty: (c) => c.ridge_cap / 33 },
    underlayment: { desc: "Owens Corning RhinoRoof U20 Synthetic Underlayment (10 sq)",
      unit: "RL", unit_price: 221.0396, group: "Materials",
      qty: (c) => c.squares_order / 10 },
    ice_water: { desc: "Owens Corning RhinoRoof Granulated Ice & Water Shield (2 Sq)",
      unit: "RL", unit_price: 155.0053, group: "Materials",
      qty: (c) => c.ice_water_sq / 2 },
    drip_edge: { desc: "ACM Aluminum Drip Edge - .019 - F5 - 1 1/2\" (10')",
      unit: "PC", unit_price: 16.6881, group: "Materials",
      qty: (c) => (c.eaves + c.rakes) / 10 },
    static_vent: { desc: "Lomanco 750-G Galvanized Steel Slant Back Static Roof Vent",
      unit: "EA", unit_price: 43.6183, group: "Materials",
      qty: (c) => c.scope.static_vents },
    exhaust_vent: { desc: "Broan 636 Exhaust Vent - 4\"",
      unit: "EA", unit_price: 57.44, group: "Materials",
      qty: (c) => c.scope.exhaust_vents },
    pipe_flashing: { desc: "IPS Aluminum Base Pipe Flashing - 1\"-4\"",
      unit: "EA", unit_price: 24.3467, group: "Materials",
      qty: (c) => c.penetrations },
    step_flashing: { desc: "ACM Aluminum Prebent Step Flashing - 8\"x8\" (100 PC/BD)",
      unit: "BD", unit_price: 145.45, group: "Materials",
      qty: (c) => c.scope.step_flashing_bd },
    coil_nails: { desc: "ABC Electro Galvanized Coil Nails - 1 1/4\" (7200 Cnt)",
      unit: "BX", unit_price: 135.2574, group: "Materials",
      qty: (c) => c.squares_order / 15 },
    cap_nails: { desc: "ABC Plastic Cap Nails - 1\" (3000 Cnt)",
      unit: "BX", unit_price: 78.0169, group: "Materials",
      qty: (c) => c.squares_order / 17 },
    sealant: { desc: "Geocel 2300 Construction TriPolymer Sealant (10.3 oz)",
      unit: "EA", unit_price: 19.98, group: "Materials",
      qty: (c) => c.scope.sealant },
    labor_install: { desc: "Tear off and Install Laminated Shingles",
      unit: "SQ", unit_price: 145.4544, group: "Labor",
      qty: (c) => c.squares_order },
    gutters: { desc: "Install 5\" Aluminum Seamless Gutters",
      unit: "LF", unit_price: 10.00, group: "Gutters",
      qty: (c) => c.scope.gutter_lf },
    downspouts: { desc: "Install 3\" x 4\" Downspouts",
      unit: "LF", unit_price: 10.00, group: "Gutters",
      qty: (c) => c.scope.downspout_lf },
  };

  const DEFAULT_SCOPE = {
    waste_pct: null,
    static_vents: 6, exhaust_vents: 1, step_flashing_bd: 1, sealant: 2,
    ice_water_sq: 0.0,
    gutter_lf: 0.0, downspout_lf: 0.0,
    include_gutters: true,
  };

  const ROOFING_SCOPE_BULLETS = [
    "Remove existing shingles down to deck.",
    "Re-nail any loose wood.  If bad or rotten wood is discovered, it will be replaced at a price of $100 per sheet.",
    "Install 3' of Owens Corning WeatherLock ice and water shield at all gutter lines and valleys.",
    "Install Owens Corning ProArmor Synthetic underlayment to keep roof dry.",
    "Install Owens Corning Starter Strip Shingles along all gutter lines, rake edges, and valleys.",
    "Install Owens Corning TruDefinition Duration Limited Lifetime Dimensional Shingles per specifications using 1 ¼\" roofing nails.",
    "Install Owens Corning ProEdge Hip & Ridge Shingles",
    "Install new ridge vent.",
    "Install new pipe and chimney flashings.",
    "Clean up all job related debris",
    "Provide 1 yr workmanship warranty",
  ];
  const GUTTER_SCOPE_BULLETS = [
    "We will remove and dispose of the existing gutters and downspouts.",
    "New 5\" aluminum seamless gutters will be installed.  Color selection to be picked out by homeowner.",
    "Install new downspouts.",
  ];
  const DISCLAIMER =
    "THIS ESTIMATE IS FOR COMPLETING THE JOB AS DESCRIBED BELOW IT IS BASED ON OUR " +
    "EVALUATION AND DOES NOT INCLUDE MATERIAL PRICE INCREASES OR ADDITIONAL LABOR AND " +
    "MATERIALS WHICH MAY BE REQUIRED SHOULD UNFORESEEN PROBLEMS ARISE AFTER THE WORK " +
    "HAS STARTED";

  // ------------------------------------------------------------------ //
  // estimate engine (port of estimate.build_estimate)
  // ------------------------------------------------------------------ //
  function context(m, scope) {
    const L = m.lengths_ft || {};
    const area = (m.totals && m.totals.roof_area_sqft) || 0.0;
    let waste = scope.waste_pct;
    if (waste == null) waste = m.suggested_waste_pct != null ? m.suggested_waste_pct : 15;
    const squaresOrder = (area / 100) * (1 + waste / 100);
    return {
      squares_base: area / 100,
      squares_order: squaresOrder,
      // Insurance scopes carry only the full edge (perimeter = eaves+rakes);
      // route drip_edge through `eaves` so "eaves + rakes" rules still price
      // (mirrors takeoff.build_context).
      eaves: (L.eaves != null ? L.eaves
              : (L.rakes == null && L.drip_edge ? L.drip_edge : 0.0)) || 0.0,
      rakes: L.rakes || 0.0,
      ridge_cap: L.ridge_cap != null ? L.ridge_cap : (L.ridges || 0) + (L.hips || 0),
      valleys: L.valleys || 0.0,
      penetrations: ((m.penetrations && m.penetrations.count) || 0) +
                    (scope.extra_pipe_flashing || 0),
      ice_water_sq: scope.ice_water_sq || 0.0,
      scope: scope,
    };
  }

  function sectionSubtotal(sec) {
    return round2(sec.items.reduce((a, i) => a + i.total, 0));
  }

  function buildEstimate(m, meta, scope, pricebook) {
    scope = Object.assign({}, DEFAULT_SCOPE, scope || {});
    pricebook = pricebook || OTT_PRICEBOOK;
    const ctx = context(m, scope);

    const roofing = { name: "Roofing Section", bullets: ROOFING_SCOPE_BULLETS.slice(),
                      disclaimer: DISCLAIMER, items: [] };
    const gutters = { name: "Gutters Section", bullets: GUTTER_SCOPE_BULLETS.slice(),
                      disclaimer: "", items: [] };

    for (const key in pricebook) {
      const spec = pricebook[key];
      const qty = round2(spec.qty(ctx));
      if (!(qty > 0)) continue;
      const item = {
        key: key, description: spec.desc, qty: qty, unit: spec.unit,
        unit_price: spec.unit_price, total: round2(qty * spec.unit_price),
        group: spec.group,
      };
      (spec.group === "Gutters" ? gutters : roofing).items.push(item);
    }

    const est = {
      title: (meta && meta.title) || "Roofing Estimate",
      date: (meta && meta.date) || "",
      company: (meta && meta.company) || {},
      rep: (meta && meta.rep) || {},
      customer: (meta && meta.customer) || {},
      sections: [roofing].concat(scope.include_gutters && gutters.items.length ? [gutters] : []),
      financing_monthly: null,
      financing_partner: "Acorn Finance",
    };
    est.total = () => round2(est.sections.reduce((a, s) => a + sectionSubtotal(s), 0));
    est.subtotals = () => est.sections.map(sectionSubtotal);

    const apr = (meta && meta.apr) || 0.0999;
    const months = (meta && meta.term_months) || 120;
    const P = est.total();
    if (P > 0 && apr && months) {
      const r = apr / 12;
      est.financing_monthly = pyRound(P * r / (1 - Math.pow(1 + r, -months)), 0);
    }
    return est;
  }

  // ------------------------------------------------------------------ //
  // material-order engine (port of takeoff.py + materialorder.py)
  // ------------------------------------------------------------------ //
  // Neutral needs in natural units; catalogs convert them to orderable
  // lines (coverage is per-SKU data, never hardcoded in the rules).
  const NEED_RULES = {
    shingle_field: { desc: "Laminated field shingles", unit: "SQ", kind: "auto",
      need: (c) => c.squares_order,
      basis: (c) => `${c.squares_base.toFixed(2)} sq × ${c.waste_factor.toFixed(2)} waste` },
    starter: { desc: "Starter strip", unit: "LF", kind: "auto",
      need: (c) => c.eaves + c.rakes,
      basis: (c) => `${c.eaves.toFixed(0)} LF eaves + ${c.rakes.toFixed(0)} LF rakes` },
    hip_ridge: { desc: "Hip & ridge cap", unit: "LF", kind: "auto",
      need: (c) => c.ridge_cap,
      basis: (c) => `${c.ridge_cap.toFixed(0)} LF ridge cap` },
    underlayment: { desc: "Synthetic underlayment", unit: "SQ", kind: "auto",
      need: (c) => c.squares_order,
      basis: (c) => `${c.squares_base.toFixed(2)} sq × ${c.waste_factor.toFixed(2)} waste` },
    ice_water: { desc: "Ice & water shield", unit: "SQ", kind: "auto",
      need: (c) => c.ice_water_sq,
      basis: (c) => `${c.ice_water_sq.toFixed(1)} sq eave band + valleys` },
    drip_edge: { desc: "Drip edge", unit: "LF", kind: "auto",
      need: (c) => c.eaves + c.rakes,
      basis: (c) => `${c.eaves.toFixed(0)} LF eaves + ${c.rakes.toFixed(0)} LF rakes` },
    pipe_flashing: { desc: "Pipe flashing", unit: "EA", kind: "auto",
      need: (c) => c.penetrations,
      basis: (c) => `${c.penetrations.toFixed(0)} penetrations` },
    coil_nails: { desc: "Roofing coil nails", unit: "SQ", kind: "auto",
      need: (c) => c.squares_order,
      basis: (c) => `${c.squares_base.toFixed(2)} sq × ${c.waste_factor.toFixed(2)} waste` },
    cap_nails: { desc: "Plastic cap nails", unit: "SQ", kind: "auto",
      need: (c) => c.squares_order,
      basis: (c) => `${c.squares_base.toFixed(2)} sq × ${c.waste_factor.toFixed(2)} waste` },
    static_vent: { desc: "Static roof vent", unit: "EA", kind: "scope",
      need: (c) => c.scope.static_vents, basis: () => "scope: static vents" },
    exhaust_vent: { desc: "Exhaust vent", unit: "EA", kind: "scope",
      need: (c) => c.scope.exhaust_vents, basis: () => "scope: exhaust vents" },
    step_flashing: { desc: "Prebent step flashing", unit: "BD", kind: "scope",
      need: (c) => c.scope.step_flashing_bd, basis: () => "scope: step flashing" },
    sealant: { desc: "Construction sealant", unit: "EA", kind: "scope",
      need: (c) => c.scope.sealant, basis: () => "scope: sealant" },
  };

  const GENERIC_CATALOG = {
    shingle_field: { item_no: null, desc: "Laminated architectural shingles",
      uom: "BD", coverage: 1 / 3, color_attr: "shingle",
      bundles_per_square: 3, bundles_per_pallet: 42, unit_price: null },
    starter: { item_no: null, desc: "Starter strip shingles",
      uom: "BD", coverage: 105, color_attr: null, unit_price: null },
    hip_ridge: { item_no: null, desc: "Hip & ridge cap shingles",
      uom: "BD", coverage: 33, color_attr: "shingle", unit_price: null },
    underlayment: { item_no: null, desc: "Synthetic underlayment",
      uom: "RL", coverage: 10, color_attr: null, unit_price: null },
    ice_water: { item_no: null, desc: "Ice & water shield",
      uom: "RL", coverage: 2, color_attr: null, unit_price: null },
    drip_edge: { item_no: null, desc: "Aluminum drip edge (10')",
      uom: "PC", coverage: 10, color_attr: "drip", unit_price: null },
    pipe_flashing: { item_no: null, desc: "Pipe flashing",
      uom: "EA", coverage: 1, color_attr: "metals", unit_price: null },
    coil_nails: { item_no: null, desc: "Roofing coil nails (7200 ct)",
      uom: "BX", coverage: 15, color_attr: null, unit_price: null },
    cap_nails: { item_no: null, desc: "Plastic cap nails (3000 ct)",
      uom: "BX", coverage: 17, color_attr: null, unit_price: null },
    static_vent: { item_no: null, desc: "Slant back static roof vent",
      uom: "EA", coverage: 1, color_attr: "metals", unit_price: null },
    exhaust_vent: { item_no: null, desc: "Exhaust vent - 4\"",
      uom: "EA", coverage: 1, color_attr: "metals", unit_price: null },
    step_flashing: { item_no: null, desc: "Prebent step flashing (100 PC/BD)",
      uom: "BD", coverage: 1, color_attr: "metals", unit_price: null },
    sealant: { item_no: null, desc: "TriPolymer sealant (10.3 oz)",
      uom: "TB", coverage: 1, color_attr: null, unit_price: null },
  };

  const DEFAULT_ORDER_SCOPE = {
    waste_pct: null,
    static_vents: 6, exhaust_vents: 1, step_flashing_bd: 1, sealant: 2,
    ice_water_sq: 0.0, extra_pipe_flashing: 0,
  };

  const DEFAULT_ORDER_OPTIONS = {
    overage_pct: 0.0,
    round_up_to: "uom",      // "uom" | "square" | "pallet" (shingle field only)
    tax_pct: 0.0,
    freight: 0.0,
    other_charges: 0.0,
    shingle_color: "",
    metals_color: "",        // ONE pick for all metal accessories
    drip_color: "",
  };

  function buildTakeoff(m, scope) {
    const ctx = context(m, scope);
    let waste = scope.waste_pct;
    if (waste == null) waste = m.suggested_waste_pct != null ? m.suggested_waste_pct : 15;
    ctx.waste_pct = waste;
    ctx.waste_factor = 1 + waste / 100;
    const needs = [];
    for (const key in NEED_RULES) {
      const spec = NEED_RULES[key];
      const need = spec.need(ctx);
      if (need == null || !(need > 0)) continue;
      needs.push({ key: key, description: spec.desc, need: pyRound(need, 4),
                   need_unit: spec.unit, kind: spec.kind, basis: spec.basis(ctx) });
    }
    return needs;
  }

  function orderQty(need, cat, options, kind) {
    if (kind === "auto") need = need * (1 + (options.overage_pct || 0) / 100);
    let qty = Math.ceil(pyRound(need / cat.coverage, 6)); // guard float dust at unit edges
    if (cat.bundles_per_square) {
      const mode = options.round_up_to || "uom";
      if (mode === "square") {
        qty = Math.ceil(qty / cat.bundles_per_square) * cat.bundles_per_square;
      } else if (mode === "pallet" && cat.bundles_per_pallet) {
        qty = Math.ceil(qty / cat.bundles_per_pallet) * cat.bundles_per_pallet;
      }
    }
    return qty;
  }

  function decorate(desc, cat, options) {
    const color = { shingle: options.shingle_color, metals: options.metals_color,
                    drip: options.drip_color }[cat.color_attr || ""] || "";
    return color ? `${desc} - ${color}` : desc;
  }

  function buildMaterialOrder(m, orderMeta, scope, options, catalog) {
    scope = Object.assign({}, DEFAULT_ORDER_SCOPE, scope || {});
    options = Object.assign({}, DEFAULT_ORDER_OPTIONS, options || {});
    catalog = catalog || GENERIC_CATALOG;
    const meta = orderMeta || {};

    const order = {
      account_no: meta.account_no || "", order_no: meta.order_no || "",
      po_no: meta.po_no || "", order_date: meta.order_date || "",
      branch: meta.branch || "", ship_via: meta.ship_via || "Deliver",
      job_site: (meta.job_site || []).slice(), requested: meta.requested || "",
      lines: [], options: options, warnings: [],
    };

    for (const need of buildTakeoff(m, scope)) {
      const cat = catalog[need.key];
      if (!cat) { order.warnings.push(`no catalog entry for '${need.key}'; line skipped`); continue; }
      const qty = orderQty(need.need, cat, options, need.kind);
      if (!(qty > 0)) continue;
      const price = cat.unit_price != null ? cat.unit_price : null;
      order.lines.push({
        key: need.key, item_no: cat.item_no != null ? cat.item_no : null,
        description: decorate(cat.desc, cat, options),
        qty: qty, uom: cat.uom, kind: need.kind, calc: need.basis,
        unit_price: price,
        ext_price: price != null ? round2(qty * price) : null,
      });
    }

    order.subtotal = () => {
      const priced = order.lines.filter((l) => l.ext_price != null).map((l) => l.ext_price);
      if (!priced.length) return null;
      return round2(priced.reduce((a, x) => a + x, 0));
    };
    order.tax = () => {
      const sub = order.subtotal();
      if (sub == null) return null;
      return round2((sub + (options.other_charges || 0) + (options.freight || 0)) *
                    (options.tax_pct || 0) / 100);
    };
    order.total = () => {
      const sub = order.subtotal();
      if (sub == null) return null;
      return round2(sub + (options.other_charges || 0) + (options.freight || 0) + order.tax());
    };
    return order;
  }

  // ------------------------------------------------------------------ //
  // Insurance scope (Xactimate DR) parser — port of parsers/scope.py.
  // Value-before-label pairs ("246.00 Total Perimeter Length") with a
  // label-first fallback. A scope carries only the full edge (perimeter
  // = eaves + rakes) — it lands in drip_edge and the quantity engines
  // fall back to it (see buildContext).
  // ------------------------------------------------------------------ //
  const SCOPE_MEASURES = {
    surface_area: "(?:Total\\s+)?Surface Area",
    squares:      "Number of Squares",
    perimeter:    "Total Perimeter Length",
    ridges:       "Total Ridge Length",
    hips:         "Total Hip Length",
    valleys:      "Total Valley Length",
    eaves:        "Total Eaves? Length",
    rakes:        "Total Rakes? Length",
  };
  const SCOPE_MONEY = {
    rcv:        "Replacement Cost Value",
    acv:        "Actual Cash Value",
    deductible: "(?:Less\\s+)?Deductible",
    net_claim:  "Net Claim(?:\\s+if Depreciation is Recovered)?",
  };

  function scopeFindMeasure(label, text) {
    let m = text.match(new RegExp("([\\d,]+(?:\\.\\d+)?)\\s*" + label, "i"));
    if (!m) m = text.match(new RegExp(label + "\\s*[:=]?\\s*([\\d,]+(?:\\.\\d+)?)", "i"));
    if (!m) return null;
    const v = num(m[1]);
    return Number.isFinite(v) ? v : null;
  }

  function looksLikeScope(text) {
    const markers = [
      /Xactimate/i, /Summary for Coverage/i, /Replacement Cost Value/i,
      /\bRCV\b/, /\bACV\b/, /Deductible/i, /Line Item Total/i,
      /Number of Squares/i, /Date of Loss/i, /Claim\s*#/i,
    ];
    let hits = 0;
    for (const p of markers) if (p.test(text)) hits++;
    return hits >= 2;
  }

  function parseScopeText(text) {
    const rm = {
      schema_version: "1.0",
      source: { provider: "insurance_scope", parser: "scope_parser",
                report_date: null, address: null, confidence: 0.0 },
      totals: { roof_area_sqft: null, squares: null, facets: null,
                predominant_pitch: null, predominant_pitch_ratio: null },
      pitch_breakdown: [],
      lengths_ft: { ridges: null, hips: null, valleys: null, rakes: null,
                    eaves: null, bends: null, flashing: null, step_flashing: null,
                    drip_edge: null, ridge_cap: null, starter: null, leak_barrier: null },
      penetrations: { count: null, area_sqft: null, perimeter_ft: null },
      waste_table: [],
      suggested_waste_pct: null,
      facet_geometry: [], warnings: [], raw: {},
    };
    const dm = text.match(/Date of Loss:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (dm) rm.source.report_date = dm[1];

    const vals = {};
    for (const k in SCOPE_MEASURES) vals[k] = scopeFindMeasure(SCOPE_MEASURES[k], text);

    let area = vals.surface_area;
    const squares = vals.squares;
    if (area == null && squares != null) area = pyRound(squares * 100, 2);
    rm.totals.roof_area_sqft = area;
    if (squares != null) rm.totals.squares = pyRound(squares, 2);
    else if (area) rm.totals.squares = round2(area / 100);

    const pm = text.match(/Predominant Pitch[^\d]*(\d+)\s*\/\s*(\d+)/i) ||
               text.match(/(\d{1,2})\s*\/\s*12\s*(?:slope|pitch)/i);
    if (pm) {
      const run = pm[2] != null ? pm[2] : "12";
      rm.totals.predominant_pitch = pm[1] + "/" + run;
      rm.totals.predominant_pitch_ratio = pitchToRatio(rm.totals.predominant_pitch);
    }

    Object.assign(rm.lengths_ft, {
      ridges: vals.ridges, hips: vals.hips, valleys: vals.valleys,
      eaves: vals.eaves, rakes: vals.rakes, drip_edge: vals.perimeter,
      ridge_cap: (vals.ridges != null || vals.hips != null)
        ? (vals.ridges || 0) + (vals.hips || 0) : null,
    });

    for (const key in SCOPE_MONEY) {
      const mm = text.match(new RegExp(SCOPE_MONEY[key] + "[^$\\d-]*\\(?\\$?([\\d,]+\\.\\d{2})\\)?", "i"));
      if (mm) {
        const v = num(mm[1]);
        if (Number.isFinite(v)) rm.raw[key] = v;
      }
    }

    const edge = rm.lengths_ft.drip_edge != null ? rm.lengths_ft.drip_edge
      : (rm.lengths_ft.eaves != null ? rm.lengths_ft.eaves : null);
    const core = [rm.totals.roof_area_sqft, rm.totals.squares,
                  rm.totals.predominant_pitch, edge, rm.lengths_ft.ridge_cap];
    let got = 0;
    core.forEach((v) => { if (v != null) got++; });
    rm.source.confidence = round2(got / core.length);
    rm.warnings = validate(rm);
    return rm;
  }

  return {
    parseText: parseText,
    parseScopeText: parseScopeText,
    looksLikeScope: looksLikeScope,
    buildEstimate: buildEstimate,
    sectionSubtotal: sectionSubtotal,
    OTT_PRICEBOOK: OTT_PRICEBOOK,
    DEFAULT_SCOPE: DEFAULT_SCOPE,
    buildTakeoff: buildTakeoff,
    buildMaterialOrder: buildMaterialOrder,
    GENERIC_CATALOG: GENERIC_CATALOG,
    DEFAULT_ORDER_SCOPE: DEFAULT_ORDER_SCOPE,
    DEFAULT_ORDER_OPTIONS: DEFAULT_ORDER_OPTIONS,
    pyRound: pyRound,
  };
});
