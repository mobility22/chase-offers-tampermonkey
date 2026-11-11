// ==UserScript==
// @name         Chase Offers Auto-Add
// @namespace    https://github.com/mobility22
// @version      1.3
// @description  Clicks visible Chase offer "Add"/"Activate" buttons once per page load, with a delay and a max-clicks limit.
// @match        *://*.chase.com/*
// @match        *://chase.com/*
// @include      /^https?:\/\/([a-z0-9-]+\.)*chase\.com\/.*$/
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/mobility22/chase-offers-tampermonkey/main/chase-offers.user.js
// @downloadURL  https://raw.githubusercontent.com/mobility22/chase-offers-tampermonkey/main/chase-offers.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings ----
  const CLICK_DELAY_MS = 1500;   // pause between clicks
  const MAX_CLICKS     = 100;    // hard limit per page load
  const START_WAIT_MS  = 4000;   // give the offers page time to render
  const REPEAT         = false;  // true = rescan after each pass (still capped by MAX_CLICKS)
  const RESCAN_MS      = 5000;

  // Words that mean "add this offer" (case-insensitive)
  const ACTION_RE = /^(\+|add( to card| offer)?|activate( offer)?|claim( offer)?|enroll)$/i;
  // Words to never click
  const SKIP_RE = /(remove|added|activated|enrolled|cancel|sign ?(in|out|on)|log ?(in|on|out)|password|username|pay|transfer|delete)/i;

  console.log('[Chase Offers Auto-Add] v1.3 loaded on', location.hostname);

  // ---- Never touch login pages: only run when already signed in ----
  function onLoginPage() {
    if (/(logon|login|signin|sign-in|auth\/logon)/i.test(location.pathname + location.hash)) return true;
    if (document.querySelector('input[type="password"], #userId, #userId-text-input-field, #password-text-input-field, form[name*="logon" i], form[action*="logon" i]')) return true;
    return false;
  }
  function showNote(msg) {
    const n = document.createElement('div');
    n.textContent = msg;
    n.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#555;color:#fff;' +
      'font:12px sans-serif;padding:6px 9px;border-radius:5px;opacity:.85';
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 4000);
  }
  if (onLoginPage()) {
    showNote('Chase Offers: sign-in page, script not running');
    return;
  }

  let clicks = 0;
  let running = true;
  const done = new WeakSet();

  // ---- Small on-page panel ----
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;' +
    'background:#117aca;color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:6px;' +
    'box-shadow:0 2px 6px rgba(0,0,0,.3)';
  const label = document.createElement('span');
  const btn = document.createElement('button');
  btn.style.cssText = 'margin-left:8px;cursor:pointer';
  panel.append(label, btn);
  const refresh = (msg) => {
    label.textContent = `Offers: ${clicks} clicked${msg ? ' · ' + msg : ''}`;
    btn.textContent = running ? 'Stop' : 'Start';
  };
  btn.onclick = () => { running = !running; refresh(); if (running) run(); };
  document.body.appendChild(panel);
  refresh('waiting…');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' &&
      !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  }

  function textOf(el) {
    return (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim();
  }

  function findOfferButtons() {
    const els = document.querySelectorAll('button, a, [role="button"]');
    return [...els].filter((el) => {
      if (done.has(el) || panel.contains(el) || !isVisible(el)) return false;
      const t = textOf(el);
      if (!t || SKIP_RE.test(t)) return false;
      // match the short label, or an aria-label like "Add offer ... to card"
      return ACTION_RE.test(t) || /^add .*offer|^activate .*offer/i.test(t);
    });
  }

  async function run() {
    if (onLoginPage()) { running = false; refresh('sign-in page, stopped'); return; }
    const buttons = findOfferButtons();
    if (!buttons.length) { refresh('none found'); }
    for (const el of buttons) {
      if (!running || clicks >= MAX_CLICKS) break;
      if (onLoginPage()) { running = false; refresh('sign-in page, stopped'); return; }
      done.add(el);
      el.scrollIntoView({ block: 'center' });
      await sleep(300);
      el.click();
      clicks++;
      refresh();
      await sleep(CLICK_DELAY_MS);
    }
    if (clicks >= MAX_CLICKS) { running = false; refresh('limit reached'); return; }
    if (REPEAT && running) { setTimeout(run, RESCAN_MS); }
    else { refresh('done'); }
  }

  setTimeout(run, START_WAIT_MS);
})();
