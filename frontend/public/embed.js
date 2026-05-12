/*!
 * RefBoost embed script — étape 4 of the partner-registration forms
 * feature. Served at https://refboost.io/embed.js as a static asset
 * (cache 1h, CORS *). Public, no SDK install required by the partner.
 *
 * Usage on the partner's site:
 *
 *   <div id="refboost-form-<FORM_ID>"></div>
 *   <script src="https://refboost.io/embed.js"
 *           data-form-id="<FORM_ID>"
 *           data-partner-token="<PRT_TOKEN>"
 *           async></script>
 *
 * What this script does:
 *   1. Reads data-form-id + data-partner-token from its own <script>.
 *   2. Finds (or creates as a fallback) the placeholder <div>.
 *   3. Injects an iframe pointing at /f/<id>?p=<token>&embed=1.
 *   4. Listens for postMessage({ type: 'refboost-resize', height })
 *      from the iframe and adjusts its height so the form never
 *      shows an internal scrollbar on a partner page.
 *
 * Hardening:
 *   - Origin check on postMessage: only accept messages from the
 *     iframe.src origin so a malicious page can't impersonate RefBoost.
 *   - All user-controlled values (form id, token) are URI-encoded
 *     before being inserted into the iframe src.
 *   - No innerHTML / template-string DOM injection on raw values —
 *     attributes set via setAttribute only.
 *   - Self-IIFE'd, no globals leaked.
 */
(function () {
  'use strict';

  // The <script> tag that loaded us. Async + module loaders both
  // populate document.currentScript inside the synchronous body of
  // the script, which is the only thing we run.
  var self = document.currentScript;
  if (!self) {
    // Older browsers (none we care about) — silently bail.
    return;
  }

  var formId = self.getAttribute('data-form-id') || '';
  var token  = self.getAttribute('data-partner-token') || '';
  if (!formId) {
    if (window && window.console) console.warn('[refboost-embed] missing data-form-id');
    return;
  }

  // The origin of the embed script is the origin of our form host —
  // this script always lives next to the SPA on refboost.io (or the
  // staging host). Don't trust window.location; the partner's page
  // is on a different origin.
  var ORIGIN = new URL(self.src, window.location.href).origin;

  // Build the iframe URL. encodeURIComponent on both values prevents
  // attribute-context injection.
  var iframeSrc = ORIGIN + '/f/' + encodeURIComponent(formId)
    + (token ? '?p=' + encodeURIComponent(token) + '&embed=1' : '?embed=1');

  // Find the placeholder. Convention: <div id="refboost-form-<id>">.
  // If the partner didn't add one, we drop one right above the script
  // tag as a graceful fallback so the form still appears in place.
  var slotId = 'refboost-form-' + formId;
  var slot = document.getElementById(slotId);
  if (!slot) {
    slot = document.createElement('div');
    slot.id = slotId;
    if (self.parentNode) self.parentNode.insertBefore(slot, self);
  }

  // Build the iframe via DOM APIs (no innerHTML) so attribute values
  // never get interpolated as markup.
  var iframe = document.createElement('iframe');
  iframe.setAttribute('src', iframeSrc);
  iframe.setAttribute('title', 'RefBoost form');
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.width = '100%';
  iframe.style.height = '600px';      // initial — overridden by resize messages
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.style.maxWidth = '100%';

  // Empty the slot (idempotent — second-load shouldn't stack iframes)
  // and inject.
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  slot.appendChild(iframe);

  // Resize listener. Only react to messages from our own origin so
  // a third-party page can't push fake heights. The iframe sends
  // { type: 'refboost-resize', height: <px> } on every render.
  window.addEventListener('message', function (ev) {
    if (ev.origin !== ORIGIN) return;
    var data = ev.data;
    if (!data || data.type !== 'refboost-resize') return;
    var h = Number(data.height);
    if (!isFinite(h) || h <= 0) return;
    // Cap at 4000px to defeat a runaway resize loop.
    iframe.style.height = Math.min(4000, Math.ceil(h)) + 'px';
  }, false);
})();
