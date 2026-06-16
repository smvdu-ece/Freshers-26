/**
 * privacy.js — Freshers-26 (smvdu-ece)
 * ─────────────────────────────────────
 * Drop this file in your project root and add ONE line to every HTML file:
 *   <script src="privacy.js"></script>   ← just before </body>
 *
 * Also add this CSS block inside your existing <style> or .css file:
 *   * { -webkit-user-select:none!important; user-select:none!important; }
 *   img { -webkit-user-drag:none; pointer-events:none; }
 *
 * What this does:
 *   ✅ Disables right-click / context menu
 *   ✅ Disables Ctrl+C, Ctrl+X, Ctrl+A, Ctrl+S, Ctrl+U, Ctrl+P
 *   ✅ Disables F12, Ctrl+Shift+I / J / C (DevTools shortcuts)
 *   ✅ Detects when DevTools is opened → blurs page + shows overlay
 *   ✅ Disables image drag
 *   ✅ Blocks copy / cut / paste events
 *
 * ⚠️  Honest note: These are strong deterrents against casual users.
 *     A determined developer can always bypass browser-side JS.
 *     For real sensitive data, protect it server-side, not client-side.
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     1.  RIGHT-CLICK  (context menu)
  ══════════════════════════════════════════════════════════════ */
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  });

  /* ══════════════════════════════════════════════════════════════
     2.  TEXT SELECTION  (selectstart)
  ══════════════════════════════════════════════════════════════ */
  document.addEventListener('selectstart', function (e) {
    e.preventDefault();
    return false;
  });

  /* ══════════════════════════════════════════════════════════════
     3.  COPY / CUT / PASTE  events
  ══════════════════════════════════════════════════════════════ */
  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || el.isContentEditable;
  }
  ['copy', 'cut', 'paste'].forEach(function (eventName) {
    document.addEventListener(eventName, function (e) {
      // Allow copy/cut/paste inside form fields (UTR, phone, name, etc.)
      if (isEditable(e.target)) return;
      e.preventDefault();
      return false;
    });
  });

  /* ══════════════════════════════════════════════════════════════
     4.  KEYBOARD SHORTCUTS
  ══════════════════════════════════════════════════════════════ */
  document.addEventListener('keydown', function (e) {
    const ctrl = e.ctrlKey || e.metaKey; // metaKey = ⌘ on Mac
    const shift = e.shiftKey;
    const k = e.key;

    const inField = isEditable(e.target);

    const blocked =
      // DevTools / Inspector  (always blocked)
      k === 'F12' ||
      (ctrl && shift && ['i', 'I', 'j', 'J', 'c', 'C', 'k', 'K'].includes(k)) ||
      // View Source
      (ctrl && ['u', 'U'].includes(k)) ||
      // Save page
      (ctrl && ['s', 'S'].includes(k)) ||
      // Print (can screenshot page)
      (ctrl && ['p', 'P'].includes(k)) ||
      // Select All / Copy / Cut — blocked ONLY outside form fields
      (!inField && ctrl && ['a', 'A', 'c', 'C', 'x', 'X'].includes(k));

    if (blocked) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true); // capturing phase → fires before any other handler

  /* ══════════════════════════════════════════════════════════════
     5.  IMAGE DRAG
  ══════════════════════════════════════════════════════════════ */
  document.addEventListener('dragstart', function (e) {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'A') {
      e.preventDefault();
      return false;
    }
  });

  /* ══════════════════════════════════════════════════════════════
     6.  DEVTOOLS DETECTION  (window-size difference method)
         Works when DevTools is docked (left/right/bottom).
         Undocked / browser zoom edge-cases can miss it — that's
         a known browser limitation.
  ══════════════════════════════════════════════════════════════ */
  const DEVTOOLS_THRESHOLD = 160; // px

  function devToolsOpen() {
    return (
      window.outerWidth  - window.innerWidth  > DEVTOOLS_THRESHOLD ||
      window.outerHeight - window.innerHeight > DEVTOOLS_THRESHOLD
    );
  }

  /* Build the blocking overlay once */
  const overlay = document.createElement('div');
  overlay.id = '__privacy_overlay__';
  overlay.innerHTML = `
    <div style="
      position:fixed;inset:0;
      background:rgba(10,10,20,0.95);
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      z-index:2147483647;
      font-family:'Segoe UI',system-ui,sans-serif;
      text-align:center;padding:2rem;
      transition:opacity .3s;
    ">
      <div style="font-size:4rem;line-height:1;">🔒</div>
      <h2 style="color:#fff;margin:1.2rem 0 .6rem;font-size:1.6rem;font-weight:700;letter-spacing:.5px;">
        Developer Tools Detected
      </h2>
      <p style="color:#aaa;max-width:360px;font-size:1rem;line-height:1.6;">
        This site is protected.<br>
        Please close Developer Tools to continue.
      </p>
    </div>
  `;
  overlay.style.cssText = 'display:none;';

  /* Append after DOM is ready */
  function appendOverlay() {
    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(overlay);
      });
    }
  }
  appendOverlay();

  let wasOpen = false;

  setInterval(function () {
    const open = devToolsOpen();

    if (open && !wasOpen) {
      wasOpen = true;
      /* Blur page content */
      document.documentElement.style.filter      = 'blur(12px)';
      document.documentElement.style.pointerEvents = 'none';
      overlay.style.display = 'block';
    } else if (!open && wasOpen) {
      wasOpen = false;
      document.documentElement.style.filter      = '';
      document.documentElement.style.pointerEvents = '';
      overlay.style.display = 'none';
    }
  }, 400); // check every 400 ms

  /* ══════════════════════════════════════════════════════════════
     7.  CONSOLE TRAP
         Makes the console unusable by constantly clearing it and
         flooding it with a warning — deters casual console hacking.
  ══════════════════════════════════════════════════════════════ */
  setInterval(function () {
    console.clear();
    console.log(
      '%c🚫 Stop!',
      'color:#e53935;font-size:2.5rem;font-weight:bold;'
    );
    console.log(
      '%cThis site is protected. Unauthorized inspection is not allowed.',
      'color:#555;font-size:1rem;'
    );
  }, 1500);

})();