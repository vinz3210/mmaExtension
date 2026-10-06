const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '..', 'map-making-tools.user.js'), 'utf8');

function setup() {
  const events = {};
  const frames = [];
  let observer;
  class Element {
    constructor(tagName = 'DIV', children = []) {
      this.tagName = tagName; this.children = children; this.isConnected = true;
      children.forEach(child => { child.parentElement = this; });
      const classes = new Set();
      this.classList = {
        add: value => classes.add(value), remove: value => classes.delete(value),
        contains: value => classes.has(value),
        toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); },
      };
    }
    closest() { return this.editable ? this : null; }
    querySelectorAll() {
      return this.children.flatMap(child => [child, ...child.querySelectorAll()])
        .filter(child => child.classList.contains('mma-pano-overlay'));
    }
  }
  const image = new Element('CANVAS');
  const arrows = new Element('CANVAS');
  const scene = new Element('DIV', [image, arrows]);
  const navigation = new Element();
  const renderBranch = new Element('DIV', [scene, navigation]);
  const crosshair = new Element('CANVAS');
  const copyright = new Element();
  const google = new Element('DIV', [renderBranch, crosshair, copyright]);
  const controls = new Element('DIV', [new Element('BUTTON')]);
  const embed = new Element('DIV', [google, controls]);
  const locationMetadata = new Element();
  const map = new Element();
  embed.querySelector = () => image;
  const document = {
    readyState: 'loading', addEventListener() {},
    querySelector: selector => selector.endsWith('.widget-scene') ? scene : selector === '.location-preview__embed' ? embed : null,
  };
  vm.runInNewContext(script, {
    Element, document, localStorage: { getItem: () => null },
    window: { addEventListener(name, callback) { events[name] = callback; } },
    setInterval() {}, requestAnimationFrame(callback) { frames.push(callback); return frames.length; }, cancelAnimationFrame() {},
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {} disconnect() { this.disconnected = true; }
    },
  });
  return {
    image, arrows, scene, navigation, crosshair, copyright, google, controls, embed, locationMetadata, map,
    press(props = {}) {
      const target = new Element(); target.editable = props.editable;
      const event = { target, key: 'v', ...props, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
      events.keydown(event); return event;
    },
    addOverlay() {
      const overlay = new Element(); overlay.parentElement = scene; scene.children.push(overlay);
      observer.callback(); frames.splice(0).forEach(callback => callback()); return overlay;
    },
  };
}

test('V hides overlays while preserving the panorama image and external editor', () => {
  const app = setup();
  assert.equal(app.press().prevented, true);
  assert.equal(app.embed.classList.contains('mma-pano-ui-hidden'), true);
  for (const name of ['arrows', 'navigation', 'crosshair', 'copyright', 'controls']) {
    assert.equal(app[name].classList.contains('mma-pano-overlay'), true, name);
  }
  for (const name of ['image', 'scene', 'google', 'map', 'locationMetadata']) {
    assert.equal(app[name].classList.contains('mma-pano-overlay'), false, name);
  }
  assert.equal(app.addOverlay().classList.contains('mma-pano-overlay'), true);
  app.press();
  assert.equal(app.embed.classList.contains('mma-pano-ui-hidden'), false);
  assert.equal(app.embed.querySelectorAll().length, 0, 'restores all overlays');
});

test('typing, Ctrl+V and key repeat never toggle panorama UI', () => {
  const app = setup();
  for (const props of [{ editable: true }, { ctrlKey: true }, { repeat: true }]) {
    assert.equal(app.press(props).prevented, undefined);
  }
  assert.equal(app.embed.classList.contains('mma-pano-ui-hidden'), false);
});
