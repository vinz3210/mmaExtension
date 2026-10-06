const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '..', 'map-making-tools.user.js'), 'utf8');

function setup({ native = true, shortcut = 'P', selected = 'default', available = true, saveAfterPin = true } = {}) {
  const events = {};
  const frames = new Map();
  let frameId = 0;
  let panoId = 'visible-id';
  let stored = shortcut;
  let promptAnswer = null;
  let menu;
  let pinned = selected !== 'default';
  let saves = 0;
  let signal;
  class Element {
    constructor(editable = false) { this.editable = editable; }
    closest() { return this.editable ? this : null; }
  }
  class Select extends Element {
    constructor() {
      super(); this._value = selected;
      this.options = [{ value: 'default' }, { value: 'other-id' }, ...(available ? [{ value: 'visible-id' }] : [])];
      this.classList = { contains: () => native };
    }
    get value() { return this._value; }
    set value(value) { this._value = value; }
    dispatchEvent(event) {
      signal = event.type;
      if (event.type === (native ? 'input' : 'change')) pinned = this.value === 'visible-id';
    }
  }
  const select = new Select();
  const saveButton = { disabled: false, click() { assert.equal(pinned, true); saves++; } };
  const preview = {
    isConnected: true,
    querySelector(selector) { return selector.startsWith('select') ? select : saveButton; },
  };
  const view = { getPano: () => panoId, getZoom: () => 1, setZoom() {}, getVisible: () => true };
  const context = {
    Element, window: {
      streetView: view, HTMLSelectElement: Select,
      Event: class { constructor(type) { this.type = type; } },
      addEventListener(name, callback) { events[name] = callback; },
      prompt: () => promptAnswer, alert() {},
    },
    document: {
      readyState: 'loading', addEventListener() {},
      querySelector: () => preview,
      body: { append() {} },
      createElement: () => ({ setAttribute() {}, isConnected: true }),
    },
    localStorage: { getItem: () => JSON.stringify({ saveAfterPin }) }, setInterval() {},
    setTimeout() {}, clearTimeout() {},
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    GM_getValue: () => stored, GM_setValue: (key, value) => { stored = value; },
    GM_registerMenuCommand(label, callback) { menu = callback; },
    console,
  };
  vm.runInNewContext(script, context);
  return {
    select, get saves() { return saves; }, get signal() { return signal; }, get stored() { return stored; },
    changePano() { panoId = 'other-id'; },
    configure(answer) { promptAnswer = answer; menu(); },
    press(key = 'p', editable = false, modifiers = {}) {
      const event = { target: new Element(editable), key, ...modifiers,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
      events.keydown(event); return event;
    },
    async flush() {
      for (let i = 0; i < 5; i++) {
        const pending = [...frames.values()]; frames.clear();
        pending.forEach(callback => callback(i * 16));
        await Promise.resolve();
      }
    },
  };
}

test('P pins the visible ID using native input then saves without selecting other dates', async () => {
  const app = setup();
  assert.equal(app.press().prevented, true);
  assert.equal(app.select.value, 'visible-id');
  assert.equal(app.saves, 0);
  await app.flush();
  assert.equal(app.signal, 'input'); assert.equal(app.saves, 1);
});

test('Radix fallback dispatches change and saves the selected ID', async () => {
  const app = setup({ native: false });
  app.press(); await app.flush();
  assert.equal(app.signal, 'change'); assert.equal(app.saves, 1);
});

test('pin-only preference selects the visible date and leaves the location open without saving', async () => {
  const app = setup({ saveAfterPin: false });
  app.press(); await app.flush();
  assert.equal(app.select.value, 'visible-id');
  assert.equal(app.signal, 'input');
  assert.equal(app.saves, 0);
});

test('pin-only also supports the Radix selector without saving', async () => {
  const app = setup({ saveAfterPin: false, native: false });
  app.press(); await app.flush();
  assert.equal(app.select.value, 'visible-id');
  assert.equal(app.signal, 'change');
  assert.equal(app.saves, 0);
});

test('no save occurs if panorama changes during selection', async () => {
  const app = setup();
  app.press(); app.changePano(); await app.flush(); assert.equal(app.saves, 0);
});

test('unknown panorama ID never falls back to Default or another date', async () => {
  const app = setup({ available: false });
  app.press(); await app.flush(); assert.equal(app.saves, 0); assert.equal(app.select.value, 'default');
});

test('typing and modified P leave the editor alone', async () => {
  const app = setup();
  assert.equal(app.press('p', true).prevented, undefined);
  assert.equal(app.press('p', false, { ctrlKey: true }).prevented, undefined);
  await app.flush(); assert.equal(app.saves, 0);
});

test('Tampermonkey menu updates and persists the shortcut immediately', async () => {
  const app = setup();
  app.configure('Alt+J'); assert.equal(app.stored, 'Alt+J');
  assert.equal(app.press().prevented, undefined);
  app.press('j', false, { altKey: true }); await app.flush(); assert.equal(app.saves, 1);
});

test('menu rejects existing app shortcuts and malformed combinations', () => {
  const app = setup();
  app.configure('Ctrl+S'); assert.equal(app.stored, 'P');
  app.configure('Ctrl+Ctrl+J'); assert.equal(app.stored, 'P');
});
