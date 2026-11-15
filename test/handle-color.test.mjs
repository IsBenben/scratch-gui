import {test} from 'node:test';
import assert from 'node:assert/strict';
import SettingsStore from '../src/addons/settings-store.js';
import userscript from '../src/addons/addons/better-color-picker/userscript.js';
import {
    allHandles, handleColorProperty, handleShadowProperty, paintHandles, twoDimensionalHandles,
    updatePaintHandles, updateCodeHandles
} from '../src/addons/addons/better-color-picker/handle-color.js';

const handle = () => ({style: {
    writes: 0,
    getPropertyValue (name) { return this[name] || ''; },
    setProperty (name, value) { this[name] = value; this.writes++; },
    removeProperty (name) { delete this[name]; }
}});

const fixture = () => {
    const sliders = [handle(), handle(), handle()];
    const square = handle();
    square.parentElement = {style: {background: '#ff0000'}};
    Object.assign(square.style, {left: '67px', top: '67px'});
    const paint = {
        modals: {fillColor: true, strokeColor: false},
        fillMode: {colorIndex: 0},
        color: {
            fillColor: {primary: '#804040', secondary: '#00ff0080'},
            strokeColor: {primary: '#0000ff'}
        }
    };
    const addon = {tab: {redux: Object.assign(new EventTarget(), {
        state: {scratchPaint: paint}, initialize: () => {}
    })}};
    const root = Object.assign(new EventTarget(), {body: {}, querySelectorAll: selector => {
        if (selector === paintHandles) return sliders;
        if (selector === twoDimensionalHandles) return [square];
        if (selector === allHandles) return [...sliders, square];
        if (selector.includes('data-sa-color-picker')) return [];
        throw new Error(`Unexpected selector: ${selector}`);
    }});
    return {addon, root, paint, sliders, square};
};

test('colored handles are enabled by default and independent of cursor styles', () => {
    const store = new SettingsStore();
    const manifest = store.getAddonManifest('better-color-picker');
    const condition = manifest.userstyles.find(style => style.url === 'handle-color.css').if;
    assert.equal(store.getAddonSetting('better-color-picker', 'color-handle'), true);
    store.setAddonSetting('better-color-picker', 'change-cursor', false);
    assert.equal(store.evaluateCondition('better-color-picker', condition), true);
    store.setAddonSetting('better-color-picker', 'color-handle', false);
    assert.equal(store.evaluateCondition('better-color-picker', condition), false);
});

test('paint handles follow the selected fill or stroke, gradient color index, and transparency', () => {
    const {addon, root, paint, sliders} = fixture();
    updatePaintHandles(addon, root);
    for (const slider of sliders) assert.equal(slider.style[handleColorProperty], 'rgb(128, 64, 64)');
    updatePaintHandles(addon, root);
    assert.equal(sliders[0].style.writes, 2, 'unchanged colors do not generate more style mutations');
    paint.fillMode.colorIndex = 1;
    updatePaintHandles(addon, root);
    assert.equal(sliders[0].style[handleColorProperty], 'rgba(0, 255, 0, 0.5)');
    paint.fillMode.colorIndex = 0;
    Object.assign(paint.modals, {fillColor: false, strokeColor: true});
    updatePaintHandles(addon, root);
    assert.equal(sliders[0].style[handleColorProperty], 'rgb(0, 0, 255)');
    paint.color.strokeColor.primary = null;
    updatePaintHandles(addon, root);
    assert.equal(sliders[0].style[handleColorProperty], 'transparent');
    paint.color.strokeColor.primary = 'scratch-paint/style-path/mixed';
    updatePaintHandles(addon, root);
    assert.equal(sliders[0].style.getPropertyValue(handleColorProperty), '');
});

test('2D handles track native Redux commits and use contrast shadows', () => {
    const {addon, root, square, paint} = fixture();
    updatePaintHandles(addon, root);
    assert.equal(square.style[handleColorProperty], 'rgb(128, 64, 64)');
    assert.equal(square.style[handleShadowProperty], 'rgba(255, 255, 255, 0.25)');
    paint.color.fillColor.primary = '#ffffff';
    updatePaintHandles(addon, root);
    assert.equal(square.style[handleColorProperty], 'rgb(255, 255, 255)');
    assert.equal(square.style[handleShadowProperty], 'rgba(0, 0, 0, 0.25)');
});

test('code picker handles track the field color', () => {
    const sliders = [handle(), handle(), handle()];
    const field = {
        getValue: () => '#123456',
        hueSlider_: {getElement: () => ({querySelector: () => sliders[0]})},
        saturationSlider_: {getElement: () => ({querySelector: () => sliders[1]})},
        brightnessSlider_: {getElement: () => ({querySelector: () => sliders[2]})}
    };
    updateCodeHandles(field);
    for (const slider of sliders) assert.equal(slider.style[handleColorProperty], 'rgb(18, 52, 86)');
});

test('handle colors update after DOM changes and restore immediately when the option or addon is disabled', async t => {
    const {addon, root, sliders, paint} = fixture();
    let useColor = true;
    addon.settings = Object.assign(new EventTarget(), {get: () => useColor});
    addon.self = Object.assign(new EventTarget(), {disabled: false});
    class Field {
        getValue () { return '#ff00ff'; }
        updateDom_ () { return 'updated'; }
        showEditor_ () { this.updateDom_(); return 'shown'; }
    }
    addon.tab.traps = {getBlockly: async () => ({FieldColourSlider: Field})};
    const ready = Promise.withResolvers();
    addon.tab.waitForElement = () => { ready.resolve(); return new Promise(() => {}); };
    let observer;
    class Observer {
        constructor (callback) { this.callback = callback; observer = this; }
        observe () { this.observing = true; }
        disconnect () { this.observing = false; }
    }
    let pendingFrame = null;
    const globals = {document: root, MutationObserver: Observer, window: Object.assign(new EventTarget(), {
        requestAnimationFrame: callback => { pendingFrame = callback; return 1; },
        cancelAnimationFrame: () => { pendingFrame = null; }
    })};
    const previous = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
    Object.assign(globalThis, globals);
    t.after(() => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    });
    await userscript({addon});
    await ready.promise;
    assert.equal(observer.observing, true);
    paint.color.fillColor.primary = '#00ff00';
    observer.callback();
    pendingFrame();
    assert.equal(sliders[0].style[handleColorProperty], 'rgb(0, 255, 0)');

    const codeHandle = handle();
    const field = new Field();
    field.hueSlider_ = {getElement: () => ({querySelector: () => codeHandle})};
    const originalQuery = root.querySelectorAll;
    root.querySelectorAll = selector => selector === allHandles ?
        [...originalQuery(selector), codeHandle] : originalQuery(selector);
    assert.equal(field.showEditor_(), 'shown');
    assert.equal(codeHandle.style[handleColorProperty], 'rgb(255, 0, 255)');
    useColor = false;
    addon.settings.dispatchEvent(new Event('change'));
    assert.equal(observer.observing, false);
    assert.equal(sliders[0].style.getPropertyValue(handleColorProperty), '');
    assert.equal(codeHandle.style.getPropertyValue(handleColorProperty), '');
    assert.equal(codeHandle.style.getPropertyValue(handleShadowProperty), '');
    useColor = true;
    addon.settings.dispatchEvent(new Event('change'));
    assert.equal(codeHandle.style[handleColorProperty], 'rgb(255, 0, 255)');
    addon.self.disabled = true;
    addon.self.dispatchEvent(new Event('disabled'));
    assert.equal(codeHandle.style.getPropertyValue(handleColorProperty), '');
    assert.equal(codeHandle.style.getPropertyValue(handleShadowProperty), '');
    assert.equal(field.updateDom_(), 'updated');
    assert.equal(codeHandle.style.getPropertyValue(handleColorProperty), '');
    assert.equal(codeHandle.style.getPropertyValue(handleShadowProperty), '');
    addon.self.disabled = false;
    addon.self.dispatchEvent(new Event('reenabled'));
    assert.equal(codeHandle.style[handleColorProperty], 'rgb(255, 0, 255)');
});


test('paint handle updates tolerate an uninjected or absent paint reducer', () => {
    for (const scratchPaint of [undefined, {}, {modals: {}}, {modals: {}, fillMode: {}}]) {
        assert.doesNotThrow(() => updatePaintHandles({tab: {redux: {state: {scratchPaint}}}}, {
            querySelectorAll() { throw new Error('No paint popup yet'); }
        }));
    }
});
