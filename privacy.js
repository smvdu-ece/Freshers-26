(function () {
  'use strict';

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || el.isContentEditable;
  }

  const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  document.addEventListener('contextmenu', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
    return false;
  });

  document.addEventListener('selectstart', function (e) {
    e.preventDefault();
    return false;
  });

  ['copy', 'cut', 'paste'].forEach(function (eventName) {
    document.addEventListener(eventName, function (e) {
      if (isEditable(e.target)) return;
      e.preventDefault();
      return false;
    });
  });

  document.addEventListener('keydown', function (e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const k = e.key;

    const inField = isEditable(e.target);

    const blocked =
      k === 'F12' ||
      (ctrl && shift && ['i', 'I', 'j', 'J', 'c', 'C', 'k', 'K'].includes(k)) ||
      (ctrl && ['u', 'U'].includes(k)) ||
      (ctrl && ['s', 'S'].includes(k)) ||
      (ctrl && ['p', 'P'].includes(k)) ||
      (!inField && ctrl && ['a', 'A', 'c', 'C', 'x', 'X'].includes(k));

    if (blocked) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  document.addEventListener('dragstart', function (e) {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'A') {
      e.preventDefault();
      return false;
    }
  });

  const DEVTOOLS_THRESHOLD = 160;

  function devToolsOpen() {
    return (
      window.outerWidth  - window.innerWidth  > DEVTOOLS_THRESHOLD ||
      window.outerHeight - window.innerHeight > DEVTOOLS_THRESHOLD
    );
  }

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

  if (!IS_TOUCH) {
    setInterval(function () {
      const open = devToolsOpen();

      if (open && !wasOpen) {
        wasOpen = true;
        document.documentElement.style.filter      = 'blur(12px)';
        document.documentElement.style.pointerEvents = 'none';
        overlay.style.display = 'block';
      } else if (!open && wasOpen) {
        wasOpen = false;
        document.documentElement.style.filter      = '';
        document.documentElement.style.pointerEvents = '';
        overlay.style.display = 'none';
      }
    }, 400);
  }

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