/* Site password gate — default password Vista.123, changeable per browser.
 * Custom password lives in localStorage; unlocking lasts for the tab session
 * (sessionStorage), so all pages open freely after one unlock. This is a
 * lightweight client-side gate, not real security. */
(function () {
  "use strict";
  var PW_KEY = "vista_site_pw";
  var SS_KEY = "vista_site_unlocked";
  var DEFAULT_PW = "Vista.123";

  function currentPw() {
    try { return localStorage.getItem(PW_KEY) || DEFAULT_PW; }
    catch (e) { return DEFAULT_PW; }
  }
  try { if (sessionStorage.getItem(SS_KEY) === "1") return; } catch (e) {}

  var gate = document.createElement("div");
  gate.id = "sitegate";
  gate.innerHTML =
    '<style>' +
    '#sitegate{position:fixed;inset:0;background:#eceef1;display:flex;align-items:center;justify-content:center;z-index:99999}' +
    '#sitegate .card{background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.12);padding:30px 36px 34px;border-radius:8px;text-align:center;width:340px;font:13px/1.5 Arial,Helvetica,sans-serif}' +
    '#sitegate img{width:200px;height:auto}' +
    '#sitegate h1{font-size:16px;margin:10px 0 16px;letter-spacing:.02em;color:#000}' +
    '#sitegate input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #d9dce0;border-radius:5px;font:inherit;text-align:center}' +
    '#sitegate button{margin-top:10px;width:100%;padding:10px;border:0;border-radius:5px;background:#2e4b44;color:#fff;font:700 13px Arial;cursor:pointer}' +
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

  function mount() {
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
      } else {
        err.textContent = "Wrong password";
        inp.value = "";
        inp.focus();
      }
    });
    gate.querySelector(".chg").addEventListener("click", function () {
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
    });
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
