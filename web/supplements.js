/*
 * supplements.js — shared, baked-in knowledge base + pure logic for the two
 * insurance-facing tabs:
 *   • Tab 3  Code / Supplement Lookup   (code-lookup.html)
 *   • Tab 4  Depreciation Request Engine (depreciation.html)
 *
 * Same architecture as roofparse.js: pure logic, no I/O, exposed on
 * window.supplements (and module.exports for node sanity tests). Runs fully
 * in-browser so it works on a jobsite with no connection.
 *
 * DESIGN RULES (from the field):
 *   - "No guessing." Parsing only fills a field when it is CONFIDENTLY matched;
 *     everything else is left blank for the rep to confirm. The real engine
 *     (code items by city, supplement defensibility) is driven by explicit
 *     dropdown choices, never by fragile parsing.
 *   - Code citations are the well-established IRC sections. Missouri has NO
 *     statewide residential code — jurisdictions adopt their own edition of the
 *     IRC + local amendments, so every rule shows a "confirm adopted edition
 *     with the AHJ" reminder rather than asserting a version as fact.
 *   - Carrier "likelihood" is expressed as CODE-DEFENSIBILITY tiers, not
 *     invented per-carrier approval percentages. Per-carrier specifics live in
 *     editable notes that OTT fills from its own approval history.
 *   - This is a tool for finding LEGITIMATE, code-required or actually-performed
 *     scope that carriers left out — with the documentation to justify it. It is
 *     not for padding a claim.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.supplements = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- helpers
  const round1 = (x) => Math.round(x * 10) / 10;
  const round2 = (x) => Math.round(x * 100) / 100;

  // Defensibility tiers — how strong the justification is, independent of carrier.
  const TIER = {
    code:       { key: "code",       label: "Code-required",   rank: 3 },
    standard:   { key: "standard",   label: "Standard practice", rank: 2 },
    negotiable: { key: "negotiable", label: "Negotiable",      rank: 1 },
  };

  // ---------------------------------------------------------------- catalog
  // Master list of code-upgrade / supplement items. `qty(m)` computes a
  // suggested quantity from measurement fields when available (m = a plain
  // object of measurement numbers) — returns null when the inputs aren't known,
  // so the rep enters it rather than the tool guessing.
  //
  // `code` is the commonly-cited IRC section. `price` is an EDITABLE typical
  // market default for the worksheet — not the sensitive OTT customer pricebook.
  const CATALOG = [
    {
      key: "drip_edge",
      name: "Drip edge — eaves & rakes",
      tier: TIER.code,
      code: "IRC R905.2.8.5",
      unit: "LF",
      price: 2.35,
      why: "Drip edge is code-required at eaves and rake edges on asphalt-shingle roofs and cannot be omitted or re-used. Frequently missing from carrier scopes.",
      doc: "Photo of missing/old drip edge + code citation.",
      qty: (m) => (m.eaves != null && m.rakes != null) ? round1(m.eaves + m.rakes)
                : (m.eaves != null ? round1(m.eaves) : null),
    },
    {
      key: "ice_water",
      name: "Ice & water shield — eaves band + valleys",
      tier: TIER.code,
      code: "IRC R905.1.2 (ice barrier)",
      unit: "SQ",
      price: 68.0,
      why: "Ice barrier is required where there is a history of ice forming along the eaves causing backup. Applies from the eave to at least 24\" inside the exterior wall line, plus valleys. Adoption/amendment varies by jurisdiction — confirm with the AHJ.",
      doc: "Code citation for the jurisdiction + eave/valley measurements.",
      // 3' eave band + valleys (6' effective), converted to squares — mirrors the
      // ice & water default already used in the estimator/material tabs.
      qty: (m) => {
        if (m.eaves == null && m.valleys == null) return null;
        const sq = (m.eaves || 0) * 3 / 100 + (m.valleys || 0) * 6 / 100;
        return round1(sq);
      },
    },
    {
      key: "flashing",
      name: "Replace flashings — step / apron / headwall / counter",
      tier: TIER.code,
      code: "IRC R908.6 / R903.2",
      unit: "LF",
      price: 9.5,
      why: "New flashing is required on a re-roof; existing flashing cannot be re-used. Includes step, apron/headwall, and counter-flashing at walls and chimneys.",
      doc: "Photos of existing flashing to be replaced.",
      qty: (m) => {
        const f = (m.step_flashing || 0) + (m.flashing || 0);
        return f > 0 ? round1(f) : null;
      },
    },
    {
      key: "valley_metal",
      name: "Valley metal / valley lining",
      tier: TIER.standard,
      code: "IRC R905.2.8.2",
      unit: "LF",
      price: 6.75,
      why: "Open-valley metal (or code-approved valley lining) at all valleys; commonly omitted when the scope assumes woven/closed valleys.",
      doc: "Valley footage + roof design (open vs. closed).",
      qty: (m) => (m.valleys != null && m.valleys > 0) ? round1(m.valleys) : null,
    },
    {
      key: "decking_renail",
      name: "Re-nail roof decking to current fastening schedule",
      tier: TIER.standard,
      code: "IRC R908.3 / Table R602.3(1)",
      unit: "SQ",
      price: 22.0,
      why: "On a re-roof, sheathing must be re-secured to the current fastening schedule; deteriorated decking replaced. Condition-driven — document at tear-off.",
      doc: "Tear-off photos of fastening / deck condition.",
      qty: (m) => (m.squares != null && m.squares > 0) ? round1(m.squares) : null,
    },
    {
      key: "ventilation",
      name: "Attic ventilation to code minimum",
      tier: TIER.standard,
      code: "IRC R806",
      unit: "LF/EA",
      price: null,
      why: "Net free ventilating area must meet 1/150 (or 1/300 with balanced intake/exhaust) of the attic area. Replace/upgrade ridge or static vents to meet minimum.",
      doc: "Existing vent count/type + attic square footage.",
      qty: () => null,
    },
    {
      key: "underlayment",
      name: "Underlayment — type & full coverage",
      tier: TIER.standard,
      code: "IRC R905.1.1",
      unit: "SQ",
      price: 12.0,
      why: "Underlayment per manufacturer / code; double-layer on low-slope sections. Scopes sometimes short the coverage or spec a non-compliant product.",
      doc: "Product spec + slope breakdown.",
      qty: (m) => (m.squares != null && m.squares > 0) ? round1(m.squares) : null,
    },
    {
      key: "pipe_boots",
      name: "Replace pipe-jack / vent flashings",
      tier: TIER.standard,
      code: "IRC R903.2.1",
      unit: "EA",
      price: 35.0,
      why: "Pipe boots and vent flashings are replaced on a re-roof, not re-used. Count from penetrations.",
      doc: "Penetration count from measurement report.",
      qty: (m) => (m.penetrations != null && m.penetrations > 0) ? m.penetrations : null,
    },
    {
      key: "steep_high",
      name: "Steep-slope / high-roof labor charge",
      tier: TIER.standard,
      code: "—",
      unit: "SQ",
      price: null,
      why: "Additional labor for pitch 8/12 and steeper and/or two-story access; standard line items when the measurement supports them.",
      doc: "Predominant pitch + stories from measurement.",
      qty: () => null,
    },
    {
      key: "op",
      name: "Overhead & profit (O&P)",
      tier: TIER.negotiable,
      code: "—",
      unit: "%",
      price: null,
      why: "General-contractor overhead & profit is typically warranted when the job involves three or more trades. Carrier-dependent.",
      doc: "List of trades involved on the job.",
      qty: () => null,
    },
    {
      key: "detach_reset",
      name: "Detach & reset (gutters, satellite, solar, etc.)",
      tier: TIER.negotiable,
      code: "—",
      unit: "EA",
      price: null,
      why: "Detach and reset of items in the work area required to complete the roof. Itemize what's actually on the roof.",
      doc: "Photos of items to be detached/reset.",
      qty: () => null,
    },
  ];

  const CATALOG_BY_KEY = {};
  CATALOG.forEach((c) => (CATALOG_BY_KEY[c.key] = c));

  // ---------------------------------------------------------------- jurisdictions
  // Which catalog items apply, plus any local note. Missouri municipalities adopt
  // their own IRC edition — `edition` is a best-known starting point that MUST be
  // confirmed with the Authority Having Jurisdiction (shown in the UI).
  const JURISDICTIONS = {
    "kcmo": {
      key: "kcmo",
      name: "Kansas City, MO",
      edition: "IRC-based (confirm adopted edition + KC amendments with the AHJ)",
      items: ["drip_edge", "ice_water", "flashing", "valley_metal", "decking_renail",
              "ventilation", "underlayment", "pipe_boots", "steep_high"],
      notes: "Kansas City adopts and amends the IRC. Ice-barrier applicability and " +
             "decking fastening amendments are the items most worth confirming.",
    },
    "sgfmo": {
      key: "sgfmo",
      name: "Springfield, MO",
      edition: "IRC-based (confirm adopted edition + Springfield amendments with the AHJ)",
      items: ["drip_edge", "ice_water", "flashing", "valley_metal", "decking_renail",
              "ventilation", "underlayment", "pipe_boots", "steep_high"],
      notes: "Springfield adopts and amends the IRC. Confirm the current ice-barrier " +
             "amendment for the eave band requirement.",
    },
    "irc": {
      key: "irc",
      name: "Other / IRC default",
      edition: "Model IRC (confirm the locally adopted edition + amendments)",
      items: ["drip_edge", "ice_water", "flashing", "valley_metal", "decking_renail",
              "ventilation", "underlayment", "pipe_boots", "steep_high"],
      notes: "Generic model-code baseline for jurisdictions not yet profiled.",
    },
  };

  // ---------------------------------------------------------------- carriers
  // Names only + an editable notes framework. We deliberately DO NOT ship
  // fabricated per-carrier approval odds — those come from OTT's own history,
  // recorded here over time. `seedNotes` holds only broadly-accepted guidance.
  const CARRIERS = [
    "State Farm", "Allstate", "American Family", "Farmers", "Liberty Mutual",
    "Shelter", "Progressive", "USAA", "Travelers", "Nationwide", "Auto-Owners",
    "Safeco", "Homesite", "Foremost", "Country Financial", "Erie", "Other / Unknown",
  ];

  // Broadly-defensible starting notes (editable). Keyed by carrier -> item key.
  // Left intentionally sparse: code-required items are defensible with ANY carrier.
  const CARRIER_SEED_NOTES = {
    // e.g. "State Farm": { drip_edge: "Approved with code citation + photo." }
  };

  // ---------------------------------------------------------------- lookups
  // Build the ranked list of code / supplement items for a jurisdiction, with
  // suggested quantities from whatever measurement numbers are known.
  function codeItemsFor(jurisdictionKey, measurement) {
    const j = JURISDICTIONS[jurisdictionKey] || JURISDICTIONS.irc;
    const m = measurement || {};
    const items = j.items.map((k) => {
      const c = CATALOG_BY_KEY[k];
      const q = c.qty ? c.qty(m) : null;
      return {
        key: c.key, name: c.name, tier: c.tier.key, tierLabel: c.tier.label,
        rank: c.tier.rank, code: c.code, unit: c.unit, price: c.price,
        why: c.why, doc: c.doc, qty: q,
        ext: (q != null && c.price != null) ? round2(q * c.price) : null,
      };
    });
    // Code-required first, then standard, then negotiable; stable within tier.
    items.sort((a, b) => b.rank - a.rank);
    return { jurisdiction: j, items };
  }

  function carrierNote(carrier, itemKey) {
    const perCarrier = CARRIER_SEED_NOTES[carrier] || {};
    return perCarrier[itemKey] || "";
  }

  // ---------------------------------------------------------------- DR parsing
  // Best-effort, CONFIDENT-ONLY extraction from a carrier estimate/scope PDF's
  // text layer. Returns only fields it is sure about; leaves the rest null so
  // the rep confirms. `hasText` is false for scanned/image-only PDFs → the UI
  // switches to manual entry instead of guessing.
  const MONEY = "\\$?\\s*([\\d,]+\\.\\d{2})";
  function num(s) { return s == null ? null : parseFloat(String(s).replace(/,/g, "")); }

  function firstMatch(text, patterns) {
    for (const re of patterns) {
      const mm = text.match(re);
      if (mm) return mm[1];
    }
    return null;
  }

  function parseCarrierText(text) {
    const out = {
      has_text: !!(text && text.replace(/\s/g, "").length > 40),
      carrier: null, claim_no: null, policy_no: null, date_of_loss: null,
      insured: null, address: null,
      rcv_total: null, acv_total: null, recoverable_dep: null,
      deductible: null, warnings: [],
    };
    if (!out.has_text) {
      out.warnings.push("No readable text layer — looks like a scanned/photo document. Enter the details manually.");
      return out;
    }
    const T = text.replace(/\r/g, "");

    // Carrier: match against the known list (avoids inventing a name).
    for (const c of CARRIERS) {
      if (c === "Other / Unknown") continue;
      if (new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(T)) { out.carrier = c; break; }
    }

    out.claim_no  = firstMatch(T, [/Claim\s*(?:#|No\.?|Number)\s*[:\-]?\s*([A-Za-z0-9\-]{5,})/i]);
    out.policy_no = firstMatch(T, [/Policy\s*(?:#|No\.?|Number)\s*[:\-]?\s*([A-Za-z0-9\-]{5,})/i]);
    out.date_of_loss = firstMatch(T, [/Date\s*of\s*Loss\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i]);

    // Money fields — only accept clearly-labeled totals.
    out.rcv_total = num(firstMatch(T, [
      new RegExp("Replacement\\s+Cost\\s+Value\\s*[:\\-]?\\s*" + MONEY, "i"),
      new RegExp("Total\\s+RCV\\s*[:\\-]?\\s*" + MONEY, "i"),
      new RegExp("\\bRCV\\b\\s*[:\\-]?\\s*" + MONEY, "i"),
    ]));
    out.acv_total = num(firstMatch(T, [
      new RegExp("Actual\\s+Cash\\s+Value\\s*[:\\-]?\\s*" + MONEY, "i"),
      new RegExp("Total\\s+ACV\\s*[:\\-]?\\s*" + MONEY, "i"),
      new RegExp("\\bACV\\b\\s*[:\\-]?\\s*" + MONEY, "i"),
    ]));
    out.recoverable_dep = num(firstMatch(T, [
      new RegExp("Recoverable\\s+Depreciation\\s*[:\\-]?\\s*" + MONEY, "i"),
      new RegExp("Total\\s+Recoverable\\s+Depreciation\\s*[:\\-]?\\s*" + MONEY, "i"),
    ]));
    out.deductible = num(firstMatch(T, [
      new RegExp("Deductible\\s*[:\\-]?\\s*" + MONEY, "i"),
    ]));

    // Cross-check: RCV - ACV should ~= recoverable depreciation (when all present).
    if (out.rcv_total != null && out.acv_total != null && out.recoverable_dep != null) {
      if (Math.abs((out.rcv_total - out.acv_total) - out.recoverable_dep) > 1.0)
        out.warnings.push("RCV − ACV does not match recoverable depreciation — verify the figures before sending.");
    }
    const found = ["carrier", "claim_no", "rcv_total", "acv_total", "recoverable_dep"]
      .filter((k) => out[k] != null).length;
    if (found === 0)
      out.warnings.push("Couldn't confidently read the standard fields from this PDF — please enter them manually.");
    return out;
  }

  // Money remaining to bill once work is done and the depreciation is released.
  // ONLY recoverable depreciation is released — using (RCV - ACV) would wrongly
  // include any non-recoverable depreciation, overstating the request. The DR
  // states recoverable depreciation directly, so bill that + approved supplements.
  function depreciationDue(recoverableDep, supplementsTotal) {
    return round2((recoverableDep || 0) + (supplementsTotal || 0));
  }

  return {
    TIER, CATALOG, CATALOG_BY_KEY, JURISDICTIONS, CARRIERS, CARRIER_SEED_NOTES,
    codeItemsFor, carrierNote, parseCarrierText, depreciationDue,
    round1, round2,
  };
});
