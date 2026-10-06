// ==UserScript==
// @name         Map Making App — Layout & Smooth Zoom
// @namespace    customMMAScript
// @version      1.2.1
// @description  Layout toggle, smooth zoom, and a configurable shortcut to pin and save the visible panorama.
// @match        https://map-making.app/maps/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';

  const KEY = 'mma-layout-smooth-zoom-v1';
  const defaults = { wide: false, smooth: true, step: 0.1, saveAfterPin: true };
  let settings = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) settings = {
      wide: saved.wide === true,
      smooth: saved.smooth !== false,
      saveAfterPin: saved.saveAfterPin !== false,
      step: [0.05, 0.1, 0.2, 0.35].includes(saved.step) ? saved.step : defaults.step,
    };
  } catch { /* Storage may be unavailable; session preferences still work. */ }

  const page = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
  const HOTKEY_KEY = 'pin-and-save-shortcut';
  function parseHotkey(value) {
    if (typeof value !== 'string') return null;
    const parts = value.trim().toLowerCase().split('+').map(part => part.trim());
    const key = parts.pop();
    if (!/^[a-z0-9]$|^f(?:[2-9]|1[0-2])$/.test(key || '')) return null;
    const aliases = { control: 'ctrl', cmd: 'meta', command: 'meta' };
    const modifiers = parts.map(part => aliases[part] || part);
    if (new Set(modifiers).size !== modifiers.length || modifiers.some(part => !['ctrl', 'alt', 'shift', 'meta'].includes(part))) return null;
    const combo = {
      key, ctrl: modifiers.includes('ctrl'), alt: modifiers.includes('alt'),
      shift: modifiers.includes('shift'), meta: modifiers.includes('meta'),
    };
    combo.label = ['ctrl', 'alt', 'shift', 'meta'].filter(part => combo[part])
      .map(part => ({ ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' })[part])
      .concat(key.toUpperCase()).join('+');
    return combo;
  }
  let hotkey = parseHotkey(typeof GM_getValue === 'function' ? GM_getValue(HOTKEY_KEY, 'P') : 'P') || parseHotkey('P');
  let pinning = false;
  let notice;
  let noticeTimer;

  function showNotice(message) {
    if (!document.body) return;
    if (!notice?.isConnected) {
      notice = document.createElement('div');
      notice.id = 'mma-tools-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      document.body.append(notice);
    }
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
  }

  function updatePinButton() {
    const button = toolbar?.querySelector('[data-action="pin"]');
    if (button) {
      button.textContent = `${settings.saveAfterPin ? 'Pin + Save' : 'Pin'} (${hotkey.label})`;
      button.title = settings.saveAfterPin
        ? 'Pin the visible panorama by ID and save the location. Change the shortcut in the Tampermonkey menu.'
        : 'Pin the visible panorama by ID and keep it open. Save the location manually when ready.';
      button.disabled = pinning;
    }
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Set pin-and-save shortcut…', () => {
      const answer = window.prompt('Pin the visible panorama. The Save after pin toggle controls automatic saving.\nShortcut, e.g. P, J, Alt+P or Ctrl+Shift+P:', hotkey.label);
      if (answer === null) return;
      const next = parseHotkey(answer);
      if (!next) return window.alert('Use a letter, digit or F2–F12, optionally with Ctrl, Alt, Shift or Meta.');
      const appKeys = ['F', 'R', 'N', 'X', '3', '4', 'Ctrl+F', 'Ctrl+V', 'Ctrl+S', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+K', 'Ctrl+H', 'Ctrl+C', 'Ctrl+D', 'Ctrl+Shift+C'];
      if (appKeys.includes(next.label)) return window.alert('That shortcut is already used by Map Making App. Please choose another.');
      hotkey = next;
      GM_setValue(HOTKEY_KEY, hotkey.label);
      updatePinButton();
      showNotice(`Pin shortcut: ${hotkey.label}`);
    });
  }

  const nextPaint = () => new Promise(resolve => requestAnimationFrame(resolve));
  async function pinVisiblePanorama() {
    if (pinning) return;
    const preview = document.querySelector('.location-preview');
    const select = preview?.querySelector('select[name="panoDate"]');
    const view = bindPanorama();
    const panoId = view?.getPano?.();
    if (!preview || !select || select.disabled || !panoId || view.getVisible?.() === false) {
      return showNotice('Open a location and wait for the panorama to finish loading.');
    }
    // Match the actual ID, never the date label: multiple panoramas can share a month.
    if (!Array.from(select.options).some(option => option.value === panoId)) {
      return showNotice('The visible panorama is not in this location’s date selector. Nothing saved.');
    }
    pinning = true;
    updatePinButton();
    stopAnimation();
    try {
      if (select.value !== panoId) {
        const setter = Object.getOwnPropertyDescriptor(page.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, panoId);
        // Modern Chromium uses the app's customizable native select (onInput).
        // Other browsers use its Radix select with a hidden native select (onChange).
        select.dispatchEvent(new page.Event(select.classList.contains('nselect') ? 'input' : 'change', { bubbles: true }));
      }
      await nextPaint();
      await nextPaint();
      if (!preview.isConnected || page.streetView !== view || view.getPano() !== panoId ||
          preview.querySelector('select[name="panoDate"]')?.value !== panoId) {
        return showNotice('The location or panorama changed. Nothing saved.');
      }
      if (!settings.saveAfterPin) {
        return showNotice('Panorama pinned by ID. Kept open; save the location manually when ready.');
      }
      const saveButton = preview.querySelector('button[data-qa="location-save"]');
      if (!saveButton) return showNotice('Panorama pinned, but this location has no Save button.');
      if (saveButton.disabled) return showNotice('Panorama is pinned. No location changes ready to save.');
      saveButton.click();
      showNotice('Panorama pinned by ID and location saved. Save the map with Ctrl+S to commit.');
    } catch (error) {
      console.error('[Map Making Tools] Pin failed:', error);
      showNotice('Could not pin and save. Please check the date selector.');
    } finally {
      pinning = false;
      updatePinButton();
    }
  }

  window.addEventListener('keydown', event => {
    if (event.repeat || event.isComposing || event.defaultPrevented || !(event.target instanceof Element)) return;
    if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="menu"], [role="listbox"]')) return;
    if (event.key.toLowerCase() !== hotkey.key || !!event.ctrlKey !== hotkey.ctrl ||
        !!event.altKey !== hotkey.alt || !!event.shiftKey !== hotkey.shift || !!event.metaKey !== hotkey.meta) return;
    if (!document.querySelector('.location-preview')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void pinVisiblePanorama();
  }, true);
  let toolbar;
  let panorama;
  let listeners = [];
  let frame = 0;
  let targetZoom = null;
  let lastTime = 0;
  let writingZoom = false;
  const clamp = value => Math.max(0, Math.min(4, value));

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Optional. */ }
  }

  function stopAnimation() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    targetZoom = null;
    lastTime = 0;
  }

  function bindPanorama() {
    const next = page.streetView;
    if (!next || typeof next.getZoom !== 'function' || typeof next.setZoom !== 'function') {
      return null;
    }
    if (next !== panorama) {
      stopAnimation();
      listeners.forEach(listener => listener.remove());
      panorama = next;
      listeners = [];
      if (typeof next.addListener === 'function') {
        // App controls, reset, saved locations, and navigation take priority.
        listeners.push(next.addListener('pano_changed', stopAnimation));
        listeners.push(next.addListener('zoom_changed', () => {
          if (!writingZoom) stopAnimation();
        }));
      }
    }
    return panorama;
  }

  function animate(time) {
    frame = 0;
    if (targetZoom === null || !panorama) return;
    const current = Number(panorama.getZoom());
    if (!Number.isFinite(current)) return stopAnimation();
    const elapsed = lastTime ? Math.min(64, time - lastTime) : 16;
    lastTime = time;
    const difference = targetZoom - current;
    const finished = Math.abs(difference) < 0.001;
    const next = finished ? targetZoom : current + difference * (1 - Math.exp(-elapsed / 55));
    writingZoom = true;
    try { panorama.setZoom(clamp(next)); }
    finally { writingZoom = false; }
    if (finished) stopAnimation();
    else if (targetZoom !== null) frame = requestAnimationFrame(animate);
  }

  function zoomBy(amount) {
    const view = bindPanorama();
    if (!view) return false;
    const current = Number(view.getZoom());
    if (!Number.isFinite(current)) return false;
    targetZoom = clamp((targetZoom ?? current) + amount);
    if (!frame) frame = requestAnimationFrame(animate);
    return true;
  }

  function panoramaElement(target) {
    return target instanceof Element ? target.closest('.location-preview__embed') : null;
  }

  // Capture before Google's native wheel handler; don't dispatch synthetic wheel events.
  window.addEventListener('wheel', event => {
    if (!settings.smooth || event.ctrlKey || event.metaKey || !event.cancelable || !event.deltaY) return;
    const embed = panoramaElement(event.target);
    if (!embed || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    // Google may render keyboard-shortcut dialogs inside the embed.
    if (event.target.closest('[role="dialog"]')) return;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? embed.clientHeight : 1);
    // A usual wheel tick (100 pixels) changes zoom by 0.1; trackpads retain tiny deltas.
    const delta = Math.max(-3, Math.min(3, pixels / 100));
    if (!zoomBy(-delta * settings.step)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });

  // Also make the panorama's existing + / − buttons finer. Map buttons are untouched.
  window.addEventListener('click', event => {
    if (!settings.smooth || !panoramaElement(event.target)) return;
    const button = event.target.closest('button[aria-label="Zoom in"], button[aria-label="Zoom out"]');
    if (!button || button.disabled) return;
    if (!zoomBy(button.getAttribute('aria-label') === 'Zoom in' ? settings.step : -settings.step)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  function applyLayout() {
    document.documentElement.classList.toggle('mma-tools-wide', settings.wide);
    // Let the app and Google recalculate their canvas sizes after the grid changes.
    requestAnimationFrame(() => {
      page.dispatchEvent(new page.Event('resize'));
      const maps = page.google?.maps;
      if (maps?.event) {
        if (page.map) maps.event.trigger(page.map, 'resize');
        if (page.streetView) maps.event.trigger(page.streetView, 'resize');
      }
    });
  }

  function mount() {
    if (!document.head || !document.body) return;
    if (!document.getElementById('mma-tools-style')) {
      const style = document.createElement('style');
      style.id = 'mma-tools-style';
      style.textContent = `
        @media (min-width: 801px) {
          .mma-tools-wide .page-map-editor {
            grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) !important;
          }
          .mma-tools-wide .page-map-editor > .map-embed,
          .mma-tools-wide .page-map-editor > .location-preview { min-width: 0; }
        }
        #mma-tools {
          position: fixed; bottom: 8px; right: 16px; z-index: 10000;
          display: flex; align-items: center; gap: 10px;
          padding: 4px 8px; border: 1px solid #707070; border-radius: 6px;
          background: #202124; color: #fff; font: 12px/1.4 system-ui, sans-serif;
          box-shadow: 0 2px 8px #0003;
        }
        #mma-tools label { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
        #mma-tools input { margin: 0; accent-color: #8ab4f8; }
        #mma-tools select { color: #fff; background: #303134; border: 1px solid #707070; border-radius: 3px; }
        #mma-tools button { color: #fff; background: #303134; border: 1px solid #707070; border-radius: 3px; padding: 2px 6px; cursor: pointer; font: inherit; }
        #mma-tools-notice { position: fixed; bottom: 72px; right: 16px; z-index: 10001; max-width: 420px; padding: 10px 14px; border-radius: 6px; background: #202124; color: #fff; font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 2px 12px #0004; }
        #mma-tools-notice[hidden] { display: none; }
        @media (max-width: 800px) {
          #mma-tools { top: auto; bottom: 8px; right: 8px; gap: 6px; flex-wrap: wrap; max-width: calc(100vw - 32px); }
        }
      `;
      document.head.append(style);
    }
    if (!document.querySelector('.page-map-editor')) {
      toolbar?.remove();
      return;
    }
    if (toolbar?.isConnected) return;
    toolbar = document.createElement('div');
    toolbar.id = 'mma-tools';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Map Making extra controls');
    toolbar.innerHTML = `
      <label title="Map on the left: 1/3. Panorama on the right: 2/3. Off: 50:50. Applies at window widths of 801 px and above.">
        <input type="checkbox" data-setting="wide"> ⅓ Map / ⅔ Pano
      </label>
      <label title="Fine, animated zoom using the mouse wheel and panorama zoom buttons.">
        <input type="checkbox" data-setting="smooth"> Fine zoom
      </label>
      <label title="Off: pin only the visible panorama ID and keep the panorama open. On: save the location after pinning.">
        <input type="checkbox" data-setting="saveAfterPin"> Save after pin
      </label>
      <label title="Zoom step per mouse-wheel tick. Smaller means finer.">Speed
        <select aria-label="Panorama zoom speed">
          <option value="0.05">Very fine</option>
          <option value="0.1">Fine</option>
          <option value="0.2">Medium</option>
          <option value="0.35">Fast</option>
        </select>
      </label>
      <button type="button" data-action="pin"></button>`;
    for (const input of toolbar.querySelectorAll('input')) {
      input.checked = settings[input.dataset.setting];
      input.addEventListener('change', () => {
        settings[input.dataset.setting] = input.checked;
        save();
        if (input.dataset.setting === 'wide') applyLayout();
        else if (input.dataset.setting === 'smooth') stopAnimation();
        updatePinButton();
      });
    }
    const speed = toolbar.querySelector('select');
    speed.value = String(settings.step);
    speed.addEventListener('change', () => {
      settings.step = Number(speed.value);
      save();
    });
    document.body.append(toolbar);
    toolbar.querySelector('[data-action="pin"]').addEventListener('click', () => { void pinVisiblePanorama(); });
    updatePinButton();
    applyLayout();
  }

  // The app mounts previews lazily and reuses a single StreetViewPanorama instance.
  // A cheap periodic check also restores the toolbar after SPA navigation.
  setInterval(() => { mount(); bindPanorama(); }, 750);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
