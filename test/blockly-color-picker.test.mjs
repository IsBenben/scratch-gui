import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {configureBlockColorPicker} from '../src/addons/libraries/common/cs/blockly-color-picker.js';
import betterPicker from '../src/addons/addons/better-color-picker/userscript.js';
import hexPicker from '../src/addons/addons/color-picker/code-editor.js';
import tinycolor from '../src/addons/libraries/thirdparty/cs/tinycolor-min.js';
import {updateCodeHandles, handleColorProperty, handleShadowProperty}
    from '../src/addons/addons/better-color-picker/handle-color.js';

const require = createRequire(import.meta.url);
const {JSDOM} = require('jsdom');
const maxima = {hue: 360, saturation: 1, brightness: 255};

for (const hexFirst of [true, false]) {
    test(`block parameters support 2D, decimals, Ctrl, toggles and hex sync (hex first=${hexFirst})`, async t => {
        const dom = new JSDOM('<div class="blocklyDropDownDiv"><div id="popup"></div></div>');
        const globals = {window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver};
        const previous = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
        Object.assign(globalThis, globals);
        t.after(() => {
            dom.window.close();
            for (const [key, value] of Object.entries(previous)) {
                if (value === undefined) delete globalThis[key];
                else globalThis[key] = value;
            }
        });
        const root = document.getElementById('popup');
        class Field {
            constructor() {
                this.hue_ = 180;
                this.saturation_ = 0.5;
                this.brightness_ = 127.5;
                this.commits = 0;
                this.colour_ = '#408080';
            }
            getValue() { return this.colour_; }
            setValue(value) { this.colour_ = value; this.updateDom_(); }
            showEditor_() {
                root.replaceChildren();
                for (const channel of Object.keys(maxima)) {
                    const label = document.createElement('div');
                    label.className = 'scratchColourPickerLabel';
                    const title = document.createElement('span');
                    title.textContent = channel;
                    const readout = this[`${channel}Readout_`] = document.createElement('span');
                    readout.className = 'scratchColourPickerReadout';
                    label.append(title, readout);
                    const slider = document.createElement('div');
                    slider.className = 'goog-slider-horizontal';
                    slider.innerHTML = '<div class="goog-slider-thumb"></div>';
                    slider.getBoundingClientRect = () => ({left: 100, width: 150});
                    this[`${channel}Slider_`] = {getElement: () => slider};
                    root.append(label, slider);
                }
                const eyedropper = document.createElement('button');
                eyedropper.className = 'scratchEyedropper';
                root.appendChild(eyedropper);
                this.updateDom_();
                return 'shown';
            }
            updateDom_() {
                if (!this.hueReadout_) return;
                for (const [channel, maximum] of Object.entries(maxima)) {
                    this[`${channel}Readout_`].textContent = Math.floor(this[`${channel}_`] / maximum * 100);
                }
            }
            sliderCallbackFactory_(channel) {
                return event => {
                    this[`${channel}_`] = event.target.getValue();
                    this.commits++;
                    this.setValue(tinycolor({h: this.hue_, s: this.saturation_, v: this.brightness_ / 255}).toHexString());
                };
            }
            dispose() { root.replaceChildren(); }
        }
        const Blockly = {FieldColourSlider: Field, DropDownDiv: {getContentDiv: () => root}};
        const addon = {
            tab: {
                traps: {getBlockly: async () => Blockly},
                redux: Object.assign(new dom.window.EventTarget(), {state: {scratchPaint: {}}, initialize() {}}),
                waitForElement: () => new Promise(() => {}),
                scratchClass: (_, {others}) => `input_input-form_test ${others}`,
                displayNoneWhileDisabled() {}
            }
        };
        addon.self = Object.assign(new dom.window.EventTarget(), {disabled: false});
        addon.settings = Object.assign(new dom.window.EventTarget(), {get: () => true});
        window.requestAnimationFrame = () => 1;
        window.cancelAnimationFrame = () => {};
        const settings = {betterColorPicker: false, twoDimensional: true, shadeLabel: 'Shade',
            inputClass: 'input_input-form_test sa-color-picker-readout'};
        if (hexFirst) await hexPicker({addon, console, msg: () => 'Hex'});
        configureBlockColorPicker(Blockly, settings);
        await betterPicker({addon});
        if (!hexFirst) await hexPicker({addon, console, msg: () => 'Hex'});
        const field = new Field();
        assert.equal(field.showEditor_(), 'shown');
        const area = root.querySelector('.sa-2dcolor-picker');
        area.getBoundingClientRect = () => ({left: 100, top: 200, width: 150, height: 150});
        const inputs = root.querySelectorAll('.sa-color-picker-readout');
        assert.equal(inputs.length, 3);
        assert.equal(inputs[1].parentElement, inputs[2].parentElement);
        assert.equal(field.saturationSlider_.getElement().style.display, 'none');
        assert.equal(field.brightnessSlider_.getElement().style.display, 'none');
        assert.equal(inputs[1].step, 'any');
        const fire = (element, type, x, y, modifiers = {}) => {
            const event = new window.MouseEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y,
                ...modifiers});
            Object.defineProperty(event, 'pointerId', {value: 1});
            element.dispatchEvent(event);
        };
        fire(field.hueSlider_.getElement(), 'pointerdown', 192, 0, {ctrlKey: true});
        assert.equal(field.hue_ / 3.6, 65);
        fire(document, 'pointermove', 205, 0, {ctrlKey: true});
        assert.equal(field.hue_ / 3.6, 75);
        fire(document, 'pointerup', 205, 0, {ctrlKey: true});
        fire(area, 'pointerdown', 219, 276, {ctrlKey: true, shiftKey: true});
        assert.equal(field.saturation_, 0.8);
        assert.equal(field.brightness_, 127.5);
        assert.equal(area.dataset.saColorPickerAxis, 'x');
        fire(document, 'pointermove', 219, 350, {ctrlKey: true});
        assert.equal(field.getValue(), '#000000');
        assert.equal(field.hue_ / 3.6, 75);
        assert.equal(field.saturation_, 0.8);
        fire(document, 'pointerup', 219, 350, {ctrlKey: true});
        inputs[1].value = '63.275';
        inputs[1].dispatchEvent(new window.Event('change', {bubbles: true}));
        assert.equal(field.saturation_, 0.63275);
        inputs[2].value = '80.5';
        inputs[2].dispatchEvent(new window.Event('change', {bubbles: true}));
        assert.ok(Math.abs(field.brightness_ / 255 * 100 - 80.5) < 1e-10);
        assert.equal(root.querySelector('.sa-color-picker-code-text').value, field.getValue());
        assert.equal(root.querySelector('.sa-color-picker-code-color').value, field.getValue());
        updateCodeHandles(field);
        const thumb = area.querySelector('.sa-code-color-picker-handle');
        assert.ok(thumb.style.getPropertyValue(handleColorProperty));
        assert.ok(thumb.style.getPropertyValue(handleShadowProperty));
        const wheel = (element, options = {}) => {
            const event = new window.WheelEvent('wheel', {bubbles: true, cancelable: true,
                deltaY: -100, ...options});
            element.dispatchEvent(event);
            assert.equal(event.defaultPrevented, true);
        };
        wheel(area, {ctrlKey: true, shiftKey: true});
        assert.ok(Math.abs(field.saturation_ * 100 - 65) < 1e-10);
        assert.ok(Math.abs(field.brightness_ / 255 * 100 - 80.5) < 1e-10);
        wheel(area, {ctrlKey: true, deltaY: 100});
        assert.ok(Math.abs(field.brightness_ / 255 * 100 - 80) < 1e-10);
        wheel(field.hueSlider_.getElement(), {ctrlKey: true});
        assert.equal(field.hue_ / 3.6, 80);
        wheel(field.hueSlider_.getElement(), {ctrlKey: true, deltaX: -100, deltaY: 0});
        assert.equal(field.hue_ / 3.6, 85);
        wheel(area, {ctrlKey: true, deltaX: 100, deltaY: -100});
        assert.ok(Math.abs(field.saturation_ * 100 - 70) < 1e-10);
        assert.ok(Math.abs(field.brightness_ / 255 * 100 - 85) < 1e-10);
        inputs[1].value = '63.275';
        wheel(inputs[1], {ctrlKey: true});
        assert.equal(Number(inputs[1].value), 65);
        configureBlockColorPicker(Blockly, {betterColorPicker: false});
        wheel(area, {ctrlKey: true, shiftKey: true});
        assert.ok(Math.abs(field.saturation_ * 100 - 66) < 1e-10);
        fire(area, 'pointerdown', 219, 276, {ctrlKey: true});
        assert.ok(Math.abs(field.saturation_ * 100 - 100 * 119 / 150) < 1e-10);
        fire(document, 'pointerup', 219, 276, {ctrlKey: true});
        configureBlockColorPicker(Blockly, {twoDimensional: false, betterColorPicker: true});
        assert.equal(field.saturationSlider_.getElement().style.display, '');
        assert.equal(area.parentElement.hidden, true);
        configureBlockColorPicker(Blockly, {betterColorPicker: false});
        assert.ok([...inputs].every(input => input.hidden));
        assert.equal(field.saturationReadout_.style.display, '');
        configureBlockColorPicker(Blockly, {twoDimensional: true, betterColorPicker: true});
        fire(area, 'pointerdown', 219, 276, {ctrlKey: true});
        const commits = field.commits;
        field.dispose();
        fire(document, 'pointermove', 100, 200, {ctrlKey: true});
        assert.equal(field.commits, commits);
    });
}
