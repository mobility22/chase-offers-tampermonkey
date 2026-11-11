// ==UserScript==
// @name         Chase Offers Auto-Add
// @namespace    https://github.com/mobility22
// @version      1.5
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

  console.log('[Chase Offers Auto-Add] v1.5 loaded on', location.hostname);

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
  let retries = 0;
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

  // Collect elements, including inside shadow DOM (Chase uses web components)
  function deepQueryAll(sel, root = document, out = []) {
    root.querySelectorAll(sel).forEach((e) => out.push(e));
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepQueryAll(sel, e.shadowRoot, out); });
    return out;
  }

  function textOf(el) {
    const parts = [el.getAttribute('aria-label'), el.getAttribute('title'),
      el.getAttribute('data-testid'), el.innerText || el.textContent];
    el.querySelectorAll('[aria-label],[title]').forEach((c) =>
      parts.push(c.getAttribute('aria-label') || c.getAttribute('title')));
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function isAddIcon(el) {
    // icon-only "+" button: no visible text, contains an svg/icon whose name hints "add"/"plus"
    if ((el.innerText || '').trim()) return false;
    const icon = el.querySelector('svg, mds-icon, i, [class*="icon" i]');
    if (!icon) return false;
    const hint = [icon.getAttribute('type'), icon.getAttribute('name'), icon.getAttribute('class'),
      icon.getAttribute('data-icon'), icon.getAttribute('aria-label'), el.getAttribute('class')].join(' ');
    return /(add|plus)/i.test(hint);
  }

  function findOfferButtons() {
    const els = deepQueryAll('button, a, [role="button"], mds-button');
    return els.filter((el) => {
      if (done.has(el) || panel.contains(el) || !isVisible(el)) return false;
      const t = textOf(el);
      if (t && SKIP_RE.test(t)) return false;
      if (ACTION_RE.test(t)) return true;
      if (/\badd\b.*\b(offer|card)\b|\b(offer|card)\b.*\badd\b|add-?offer|addoffer/i.test(t)) return true;
      return isAddIcon(el);
    });
  }

  // Read the "N results" count shown above the offer grid (e.g. with the "Not added" filter)
  function readCount() {
    const m = (document.body.innerText || '').match(/\b(\d{1,3})\s+results?\b/i);
    return m ? parseInt(m[1], 10) : null;
  }

  // The first (top-left) offer "+" button: after each add, the next offer takes its place
  function firstOfferButton() {
    const btns = findOfferButtons();
    btns.sort((x, y) => {
      const a = x.getBoundingClientRect(), b = y.getBoundingClientRect();
      return (a.top - b.top) || (a.left - b.left);
    });
    return btns[0] || null;
  }

  async function waitFor(fn, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); }
    return null;
  }

  let target = null;       // how many to click, from the page count
  let listUrl = null;

  async function run() {
    if (onLoginPage()) { running = false; refresh('sign-in page, stopped'); return; }
    if (listUrl === null) listUrl = location.href;
    if (target === null) {
      const c = readCount();
      target = Math.min(c === null ? MAX_CLICKS : c, MAX_CLICKS);
      console.log('[Chase Offers Auto-Add] page count:', c, 'target:', target);
    }
    while (running && clicks < target && clicks < MAX_CLICKS) {
      if (onLoginPage()) { running = false; refresh('sign-in page, stopped'); return; }
      const left = readCount();
      if (left === 0) break;
      refresh(`${left === null ? '?' : left} left`);
      const el = await waitFor(firstOfferButton, 6000);
      if (!el) { refresh('no + button found'); break; }
      el.scrollIntoView({ block: 'center' });
      await sleep(300);
      el.click();
      clicks++;
      refresh(`${readCount() ?? '?'} left`);
      await sleep(CLICK_DELAY_MS);
      // If the click opened another view, go back to the offer list
      if (location.href !== listUrl) {
        history.back();
        await waitFor(() => location.href === listUrl, 5000);
        await sleep(CLICK_DELAY_MS);
      }
    }
    running = false;
    const left = readCount();
    refresh(clicks >= MAX_CLICKS ? 'limit reached' : `done, ${left === null ? '?' : left} left`);
  }

  setTimeout(run, START_WAIT_MS);
})();
