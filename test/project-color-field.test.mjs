import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import createField from '../src/lib/project-color-field.js';
const require = createRequire(import.meta.url);

test('modal swatch creates a real color field with headless TurboWarp connections and opens repeatedly', t => {
    const {JSDOM} = require('jsdom');
    const dom = new JSDOM('<body><button id="color"></button></body>', {url: 'http://localhost'});
    const previous = {window: globalThis.window, document: globalThis.document, DOMParser: globalThis.DOMParser};
    Object.assign(globalThis, {window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser});
    t.after(() => {Object.assign(globalThis, previous); dom.window.close();});
    const Blockly = require('scratch-blocks');
    Blockly.DropDownDiv.createDom();
    const {workspace, field} = createField(Blockly, document.getElementById('color'));
    assert.equal(typeof field.setValue, 'function');
    assert.equal(Blockly.Events.isEnabled(), true);
    field.setValue('#123456');
    field.showEditor_();
    assert.equal(document.querySelectorAll('.goog-slider-horizontal').length, 3);
    field.showEditor_();
    assert.equal(document.querySelectorAll('.goog-slider-horizontal').length, 3);
    assert.equal(field.getValue(), '#123456');
    assert.equal(workspace.undoStack_.length, 0);
    Blockly.Events.disable();
    workspace.dispose();
    Blockly.Events.enable();
});
