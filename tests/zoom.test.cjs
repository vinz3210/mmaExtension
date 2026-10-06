const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '..', 'map-making-tools.user.js'), 'utf8');

function setup(preferences = {}) {
  const events = {};
  const callbacks = {};
  const frames = new Map();
  let frameId = 0;
  let time = 0;
  let zoom = 1;
  class Element {
    constructor(kind = 'panorama') { this.kind = kind; this.clientHeight = 700; }
    closest(selector) {
      if (selector === '.location-preview__embed') return this.kind === 'map' ? null : this;
      if (selector.startsWith('input')) return this.kind === 'input' ? this : null;
      if (selector === '[role="dialog"]') return this.kind === 'dialog' ? this : null;
      if (selector.startsWith('button[')) return this.kind === 'plus' || this.kind === 'minus' ? this : null;
      return null;
    }
    getAttribute() { return this.kind === 'plus' ? 'Zoom in' : 'Zoom out'; }
  }
  const view = {
    getZoom: () => zoom,
    setZoom(value) { zoom = value; callbacks.zoom_changed?.(); },
    addListener(name, callback) { callbacks[name] = callback; return { remove() { delete callbacks[name]; } }; },
  };
  const context = {
    Element,
    window: { streetView: view, addEventListener(name, callback) { events[name] = callback; } },
    document: { readyState: 'loading', addEventListener() {} },
    localStorage: { getItem: () => JSON.stringify(preferences) },
    setInterval() {},
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  vm.runInNewContext(script, context);
  return {
    get zoom() { return zoom; },
    event(name, kind = 'panorama', props = {}) {
      const event = { target: new Element(kind), deltaY: -100, deltaMode: 0, cancelable: true,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...props };
      events[name](event);
      return event;
    },
    externalZoom(value) { view.setZoom(value); },
    navigate() { callbacks.pano_changed(); },
    flush() {
      for (let i = 0; frames.size && i < 200; i++) {
        const pending = [...frames.values()]; frames.clear(); time += 16;
        pending.forEach(callback => callback(time));
      }
      assert.equal(frames.size, 0, 'animation must finish');
    },
  };
}

test('wheel animates a small fractional zoom change', () => {
  const app = setup();
  const event = app.event('wheel');
  assert.equal(event.prevented, true);
  assert.equal(app.zoom, 1, 'change waits for animation');
  app.flush();
  assert.ok(Math.abs(app.zoom - 1.1) < 0.00001);
});

test('rapid wheel ticks accumulate and respect zoom bounds', () => {
  const app = setup();
  for (let i = 0; i < 100; i++) app.event('wheel');
  app.flush(); assert.equal(app.zoom, 4);
  for (let i = 0; i < 100; i++) app.event('wheel', 'panorama', { deltaY: 100 });
  app.flush(); assert.equal(app.zoom, 0);
});

test('trackpad deltas and speed preference remain proportional', () => {
  const app = setup({ step: 0.2 });
  app.event('wheel', 'panorama', { deltaY: -5 });
  app.flush(); assert.ok(Math.abs(app.zoom - 1.01) < 0.00001);
});

test('map, editable controls, dialogs and browser zoom pass through', () => {
  const app = setup();
  for (const kind of ['map', 'input', 'dialog']) assert.equal(app.event('wheel', kind).prevented, undefined);
  assert.equal(app.event('wheel', 'panorama', { ctrlKey: true }).prevented, undefined);
  app.flush(); assert.equal(app.zoom, 1);
});

test('disabled fine zoom preserves native handling', () => {
  const app = setup({ smooth: false });
  assert.equal(app.event('wheel').prevented, undefined);
  assert.equal(app.event('click', 'plus').prevented, undefined);
  app.flush(); assert.equal(app.zoom, 1);
});

test('external zoom and panorama navigation cancel pending animation', () => {
  const app = setup();
  app.event('wheel'); app.externalZoom(2); app.flush(); assert.equal(app.zoom, 2);
  app.event('wheel'); app.navigate(); app.flush(); assert.equal(app.zoom, 2);
});

test('panorama buttons use fine steps while map buttons pass through', () => {
  const app = setup({ step: 0.05 });
  assert.equal(app.event('click', 'map').prevented, undefined);
  assert.equal(app.event('click', 'plus').prevented, true);
  app.flush(); assert.ok(Math.abs(app.zoom - 1.05) < 0.00001);
  app.event('click', 'minus'); app.flush(); assert.ok(Math.abs(app.zoom - 1) < 0.00001);
});
