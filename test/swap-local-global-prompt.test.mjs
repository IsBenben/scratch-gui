import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import loadAddon from '../src/addons/addons/swap-local-global/userscript.js';

const {JSDOM} = createRequire(import.meta.url)('jsdom');

const fixture = async (t, type, nested = false, synchronous = false) => {
    const dom = new JSDOM('<body><div class="gui_blocks-wrapper_test"></div></body>');
    const previous = globalThis.document;
    globalThis.document = dom.window.document;
    t.after(() => {globalThis.document = previous; dom.window.close();});
    document.querySelector('.gui_blocks-wrapper_test').fiber = {stateNode: {props: {canUseCloud: true}}};
    let callback;
    let hidden = 0;
    const variable = {type, isLocal: false, isCloud: false, getId: () => 'variable-id'};
    const Blockly = {
        Variables: {
            renameVariable (workspace, model, onComplete) {
                const modal = document.createElement('div');
                const controls = '<div data-project-color-controls><div data-project-color-input></div></div>';
                modal.innerHTML = '<h2 class="modal_header-item_test">Rename</h2>' +
                    '<div class="prompt_body_test"><input>' +
                    (nested ? `<section>${controls}</section>` : controls) +
                    '<div data-buttons></div></div>';
                document.body.appendChild(modal);
                callback = onComplete;
                if (synchronous) onComplete('renamed');
                return 'opened';
            }
        },
        hideChaff () { hidden++; }
    };
    await loadAddon({
        addon: {
            self: {disabled: false},
            tab: {
                traps: {getBlockly: async () => Blockly, vm: {editingTarget: {isStage: false},
                    runtime: {canAddCloudVariable: () => true}}, getInternalKey: () => 'fiber'},
                scratchClass: (...names) => names.filter(name => typeof name === 'string')
                    .map(name => `${name}_test`).join(' '),
                scratchMessage: key => key,
                displayNoneWhileDisabled () {},
                createBlockContextMenu () {}
            }
        },
        msg: key => key,
        console
    });
    return {Blockly, variable, complete: name => callback(name), hidden: () => hidden};
};

for (const type of ['', 'list']) {
    test(`editing ${type || 'variable'} inserts scope before nested color controls and confirms`, async t => {
        const {Blockly, variable, complete, hidden} = await fixture(t, type, true);
        let result;
        assert.equal(Blockly.Variables.renameVariable({}, variable, value => {result = value;}), 'opened');
        assert.equal(hidden(), 1, 'close the context menu before opening the modal');
        const body = document.querySelector('.prompt_body_test');
        const controls = body.querySelector('[data-project-color-controls]').parentElement;
        assert.ok(controls.previousElementSibling.querySelector('[value="local"]'));
        assert.ok(body.querySelector('[data-project-color-input]'));
        assert.equal(body.lastElementChild.hasAttribute('data-buttons'), true);
        complete('renamed');
        assert.equal(result, 'renamed');
    });
}

test('a synchronous rename callback never accesses an uninitialized prompt', async t => {
    const {Blockly, variable} = await fixture(t, 'list', false, true);
    let result;
    Blockly.Variables.renameVariable({}, variable, value => {result = value;});
    assert.equal(result, 'renamed');
});

