import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import SettingsStore from '../src/addons/settings-store.js';
import paintEditor from '../src/addons/addons/2d-color-picker/paint-editor.js';
import {paintPickerSelector, configurePaintPickers, onPaintPickerReady}
    from '../src/addons/libraries/common/cs/paint-color-picker.js';

const require = createRequire(import.meta.url);
const {parseDOM} = require('htmlparser2');
const {is, selectOne} = require('css-select');
const postcss = require('postcss');

test('cursor CSS matches paint sliders inside the actual Popover structure and preserves 2D cursors', () => {
    const dom = parseDOM(`
        <div class="Popover-body">
            <div dir="ltr">
                <div></div>
                <div>
                    <div class="color-picker_row-header_1F-KU"></div>
                    <div>
                        <div id="track" class="slider_container_1b8Ni">
                            <div id="paint-handle" class="slider_handle_QuW1g"></div>
                        </div>
                    </div>
                </div>
                <div class="slider_container_1b8Ni slider_last_abc">
                    <div id="last-handle" class="slider_handle_QuW1g"></div>
                </div>
                <div id="area" class="sa-2dcolor-picker">
                    <img id="image" class="sa-2dcolor-picker-image">
                    <div id="2d-handle" class="slider_handle_QuW1g" style="pointer-events: none"></div>
                </div>
            </div>
        </div>
        <div class="blocklyDropDownDiv">
            <div class="goog-slider-horizontal">
                <div id="code-handle" class="goog-slider-thumb"></div>
            </div>
        </div>
        <div class="slider_container_1b8Ni">
            <div id="other-handle" class="slider_handle_QuW1g"></div>
        </div>
    `);
    const css = postcss.parse(readFileSync(
        new URL('../src/addons/addons/better-color-picker/style.css', import.meta.url), 'utf8'
    ));
    const cursor = id => {
        const node = selectOne(`[id="${id}"]`, dom);
        let value = null;
        css.walkRules(rule => {
            if (is(node, rule.selector)) {
                rule.walkDecls('cursor', declaration => { value = declaration.value; });
            }
        });
        return value;
    };
    assert.equal(cursor('paint-handle'), 'ew-resize');
    assert.equal(cursor('last-handle'), 'ew-resize');
    assert.equal(cursor('code-handle'), 'ew-resize');
    assert.equal(cursor('track'), 'ew-resize');
    assert.equal(cursor('other-handle'), null);
    for (const [axis, expected] of [['both', 'move'], ['x', 'ew-resize'], ['y', 'ns-resize']]) {
        selectOne('#area', dom).attribs['data-sa-color-picker-axis'] = axis;
        for (const id of ['area', 'image', '2d-handle']) assert.equal(cursor(id), expected);
    }
});

test('better color picker defaults and cursor toggle work independently of the 2D addon', () => {
    const store = new SettingsStore();
    const condition = store.getAddonManifest('better-color-picker').userstyles.find(style => style.url === 'style.css').if;
    assert.equal(store.getAddonEnabled('better-color-picker'), true);
    assert.equal(store.getAddonSetting('better-color-picker', 'change-cursor'), true);
    assert.equal(store.evaluateCondition('better-color-picker', condition), true);
    store.setAddonEnabled('2d-color-picker', true);
    store.setAddonSetting('better-color-picker', 'change-cursor', false);
    assert.equal(store.evaluateCondition('better-color-picker', condition), false);
    assert.equal(store.getAddonEnabled('2d-color-picker'), true);
    store.setAddonSetting('better-color-picker', 'change-cursor', true);
    assert.equal(store.evaluateCondition('better-color-picker', condition), true);
});

test('every 2D shade surface radius is zero across native paint and addon styles', () => {
    const cssFiles = [
        '../../scratch-paint/src/components/color-picker/shade-picker.css',
        '../src/addons/addons/2d-color-picker/style.css'
    ];
    let checked = 0;
    for (const file of cssFiles) {
        const css = postcss.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
        css.walkDecls('border-radius', declaration => {
            assert.equal(declaration.value, '0', `${file}: ${declaration.parent.selector}`);
            checked++;
        });
    }
    assert.equal(checked, 3);
});

test('native readiness reapplies both addon configurations and keeps dynamic Ctrl enablement', t => {
    const previous = globalThis.document;
    const native = Object.assign(new EventTarget(), {matches: selector => selector === paintPickerSelector});
    const document = Object.assign(new EventTarget(), {querySelectorAll: () => [native]});
    globalThis.document = document;
    t.after(() => {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    });
    const config = {};
    native.addEventListener('sa-color-picker-config', event => Object.assign(config, event.detail));
    let better = true;
    let twoDimensional = true;
    onPaintPickerReady(() => ({betterColorPicker: better}));
    onPaintPickerReady(() => ({twoDimensional, shadeLabel: '阴影'}));
    const ready = () => {
        const event = new Event('sa-color-picker-ready');
        Object.defineProperty(event, 'target', {value: native});
        document.dispatchEvent(event);
    };
    ready();
    assert.deepEqual(config, {betterColorPicker: true, twoDimensional: true, shadeLabel: '阴影'});
    better = false;
    configurePaintPickers({betterColorPicker: better});
    ready();
    assert.equal(config.betterColorPicker, false);
    assert.equal(config.twoDimensional, true);
    better = true;
    twoDimensional = false;
    ready();
    assert.equal(config.betterColorPicker, true);
    assert.equal(config.twoDimensional, false);
});

test('2D configuration updates existing and newly opened native popups when toggled', async t => {
    const swatch = new EventTarget();
    const configs = [];
    swatch.addEventListener('sa-color-picker-config', event => configs.push(event.detail));
    const previous = globalThis.document;
    globalThis.document = Object.assign(new EventTarget(), {querySelectorAll: () => [swatch]});
    t.after(() => {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    });
    const ready = Promise.withResolvers();
    let requests = 0;
    const addon = {
        self: Object.assign(new EventTarget(), {disabled: false}),
        tab: {waitForElement: () => {
            if (requests++ === 0) return Promise.resolve(swatch);
            ready.resolve();
            return new Promise(() => {});
        }}
    };
    paintEditor({addon, msg: () => '阴影'}).catch(ready.reject);
    await ready.promise;
    assert.deepEqual(configs.at(-1), {twoDimensional: true, shadeLabel: '阴影'});
    addon.self.disabled = true;
    addon.self.dispatchEvent(new Event('disabled'));
    assert.equal(configs.at(-1).twoDimensional, false);
    addon.self.disabled = false;
    addon.self.dispatchEvent(new Event('reenabled'));
    assert.equal(configs.at(-1).twoDimensional, true);
});
