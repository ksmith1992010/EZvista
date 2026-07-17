/* Site password gate + settings — included by every page.
 *
 * Password: default Vista.123, changeable from the lock screen or from the
 * post-login settings panel (gear button, bottom-right). The custom password
 * lives in localStorage; unlocking lasts for the tab session (sessionStorage),
 * so all pages open freely after one unlock. Lightweight client-side gate,
 * not real security.
 *
 * Company info: the pages ship with blank COMPANY address/phone and REP
 * contact. The settings panel stores the real values in localStorage and this
 * script writes them onto the page's COMPANY/REP objects after the page
 * script defines them, so estimates, material orders, and letters print the
 * user's own info. */
(function () {
  "use strict";
  var PW_KEY = "vista_site_pw";
  var SS_KEY = "vista_site_unlocked";
  var INFO_KEY = "vista_company_info";
  var DEFAULT_PW = "Vista.123";

  function currentPw() {
    try { return localStorage.getItem(PW_KEY) || DEFAULT_PW; }
    catch (e) { return DEFAULT_PW; }
  }

  function changePwFlow() {
    var cur = prompt("Current password:");
    if (cur == null) return;
    if (cur !== currentPw()) { alert("Wrong current password."); return; }
    var nw = prompt("New password (at least 4 characters):");
    if (nw == null) return;
    if (nw.length < 4) { alert("Password too short — not changed."); return; }
    var again = prompt("Repeat new password:");
    if (again !== nw) { alert("Passwords didn't match — not changed."); return; }
    try { localStorage.setItem(PW_KEY, nw); } catch (e) { alert("Could not save password."); return; }
    alert("Password changed on this device/browser. Other devices keep their own password. " +
          "If you forget it, clearing this site's browser data resets it to the default — " +
          "but that also erases saved sheets, so export CSV backups first.");
  }

  // ---- company info -----------------------------------------------------
  function readInfo() {
    try { return JSON.parse(localStorage.getItem(INFO_KEY) || "null") || {}; }
    catch (e) { return {}; }
  }

  function applyInfo() {
    var s = readInfo();
    try {
      if (typeof COMPANY === "object" && COMPANY) {
        if (s.name) COMPANY.name = s.name;
        COMPANY.address = [s.addr1 || "", s.addr2 || ""].filter(Boolean);
        COMPANY.phone = s.phone || "";
      }
    } catch (e) {}
    try {
      if (typeof REP === "object" && REP) {
        REP.name = s.repName || "";
        REP.phone = s.repPhone || "";
        REP.email = s.repEmail || "";
      }
    } catch (e) {}
  }

  var FIELDS = [
    ["name", "Company name", "Vista Exterior Construction"],
    ["addr1", "Address line 1", "Street address"],
    ["addr2", "Address line 2", "City, State ZIP"],
    ["phone", "Company phone", "(000) 000-0000"],
    ["repName", "Rep name", ""],
    ["repPhone", "Rep phone", ""],
    ["repEmail", "Rep email", ""],
  ];

  function openSettings() {
    if (document.getElementById("sitesettings")) return;
    var s = readInfo();
    var ov = document.createElement("div");
    ov.id = "sitesettings";
    ov.innerHTML =
      '<style>' +
      '#sitesettings{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:99998}' +
      '#sitesettings .card{background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.25);padding:22px 26px 24px;border-radius:8px;width:360px;max-height:90vh;overflow:auto;font:13px/1.5 Arial,Helvetica,sans-serif;color:#000}' +
      '#sitesettings h1{font-size:15px;margin:0 0 4px}' +
      '#sitesettings .sub{font-size:11px;color:#81888e;margin-bottom:12px}' +
      '#sitesettings label{display:block;font-size:11px;color:#81888e;margin-top:9px}' +
      '#sitesettings input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #d9dce0;border-radius:4px;font:inherit}' +
      '#sitesettings .row{display:flex;gap:8px;margin-top:16px}' +
      '#sitesettings .row button{flex:1;padding:9px;border:0;border-radius:5px;font:700 12.5px Arial;cursor:pointer}' +
      '#sitesettings .save{background:#2e4b44;color:#fff}' +
      '#sitesettings .cancel{background:#eff0f2;color:#000}' +
      '#sitesettings .pw{margin-top:12px;width:100%;padding:8px;border:1px solid #d9dce0;background:#fff;border-radius:5px;color:#81888e;cursor:pointer;font:inherit}' +
      '#sitesettings .pw:hover{color:#000;border-color:#81888e}' +
      '</style>' +
      '<div class="card">' +
      '<h1>Site settings</h1>' +
      '<div class="sub">Company &amp; rep info prints on estimates, material orders, and letters. Saved on this device.</div>' +
      FIELDS.map(function (f) {
        return '<label>' + f[1] + '<input data-k="' + f[0] + '" type="text" placeholder="' + f[2] + '"></label>';
      }).join("") +
      '<button type="button" class="pw">Change password…</button>' +
      '<div class="row"><button type="button" class="cancel">Cancel</button><button type="button" class="save">Save</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    FIELDS.forEach(function (f) {
      ov.querySelector('input[data-k="' + f[0] + '"]').value = s[f[0]] || "";
    });
    ov.querySelector("input").focus();
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector(".cancel").addEventListener("click", function () { ov.remove(); });
    ov.querySelector(".pw").addEventListener("click", changePwFlow);
    ov.querySelector(".save").addEventListener("click", function () {
      var out = {};
      FIELDS.forEach(function (f) {
        out[f[0]] = ov.querySelector('input[data-k="' + f[0] + '"]').value.trim();
      });
      try { localStorage.setItem(INFO_KEY, JSON.stringify(out)); }
      catch (e) { alert("Could not save settings."); return; }
      location.reload();   // re-render every header/preview with the new info
    });
  }

  function addGearButton() {
    if (document.getElementById("sitegear")) return;
    var b = document.createElement("button");
    b.id = "sitegear";
    b.title = "Site settings (company info, password)";
    b.textContent = "⚙";
    b.setAttribute("style",
      "position:fixed;right:14px;bottom:14px;z-index:99997;width:34px;height:34px;border-radius:50%;" +
      "border:1px solid #d9dce0;background:#fff;color:#81888e;font-size:16px;cursor:pointer;" +
      "box-shadow:0 1px 6px rgba(0,0,0,.15)");
    b.addEventListener("click", openSettings);
    document.body.appendChild(b);
  }

  // ---- gate -------------------------------------------------------------
  function showGate() {
    var gate = document.createElement("div");
    gate.id = "sitegate";
    gate.innerHTML =
      '<style>' +
      '#sitegate{position:fixed;inset:0;background:#eceef1;display:flex;align-items:center;justify-content:center;z-index:99999}' +
      '#sitegate .card{background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.12);padding:30px 36px 34px;border-radius:8px;text-align:center;width:340px;font:13px/1.5 Arial,Helvetica,sans-serif}' +
      '#sitegate img{width:200px;height:auto}' +
      '#sitegate h1{font-size:16px;margin:10px 0 16px;letter-spacing:.02em;color:#000}' +
      '#sitegate input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #d9dce0;border-radius:5px;font:inherit;text-align:center}' +
      '#sitegate button[type=submit]{margin-top:10px;width:100%;padding:10px;border:0;border-radius:5px;background:#2e4b44;color:#fff;font:700 13px Arial;cursor:pointer}' +
      '#sitegate .err{color:#b3261e;font-size:12px;margin-top:8px;min-height:15px}' +
      '#sitegate .chg{display:inline-block;margin-top:12px;font-size:11px;color:#81888e;cursor:pointer;text-decoration:underline;background:none;border:0;width:auto;padding:0}' +
      '</style>' +
      '<form class="card">' +
      '<img src="logo.png" alt="Vista Exterior Construction">' +
      '<h1>Vista Exterior Construction</h1>' +
      '<input type="password" placeholder="Password" autocomplete="current-password">' +
      '<button type="submit">Unlock</button>' +
      '<div class="err"></div>' +
      '<button type="button" class="chg">Change password…</button>' +
      '</form>';
    document.body.appendChild(gate);
    var form = gate.querySelector("form");
    var inp = gate.querySelector("input");
    var err = gate.querySelector(".err");
    inp.focus();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (inp.value === currentPw()) {
        try { sessionStorage.setItem(SS_KEY, "1"); } catch (er) {}
        gate.remove();
        addGearButton();
      } else {
        err.textContent = "Wrong password";
        inp.value = "";
        inp.focus();
      }
    });
    gate.querySelector(".chg").addEventListener("click", changePwFlow);
  }

  function boot() {
    var unlocked = false;
    try { unlocked = sessionStorage.getItem(SS_KEY) === "1"; } catch (e) {}
    if (unlocked) addGearButton();
    else showGate();
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
  // page scripts (which declare COMPANY/REP) run after this file — apply the
  // saved info once the document is fully parsed
  document.addEventListener("DOMContentLoaded", applyInfo);
})();
