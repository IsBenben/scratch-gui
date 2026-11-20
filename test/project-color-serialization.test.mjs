import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import getColors, {COLOR_COMMENT_MARKER, readColorComment} from '../src/lib/project-block-colors.js';
import {COLOR_METADATA_KEY, COLOR_TRANSFER_MARKER, readTransferColors, attachTransferColors,
    compressProjectColors} from '../src/lib/project-color-transfer.js';

const require = createRequire(import.meta.url);
const sb3 = require('scratch-vm/src/serialization/sb3.js');
const MonitorState = require('scratch-vm/src/engine/tw-monitor-state.js');
const target = (id, isStage = false) => ({
    id, isOriginal: true, isStage, name: id, variables: {}, comments: {}, extensionStorage: {},
    blocks: {_blocks: {}, getBlock (blockId) { return this._blocks[blockId]; }},
    getLayerOrder: () => 0,
    createComment (commentId, blockId, text, x, y, width, height, minimized) {
        this.comments[commentId] = {id: commentId, blockId, text, x, y, width, height, minimized};
    },
    toJSON () {
        return {isStage: this.isStage, name: this.name, variables: this.variables, blocks: this.blocks._blocks,
            comments: this.comments, extensionStorage: {}, currentCostume: 0,
            costumes: [{name: 'costume', assetId: 'asset', dataFormat: 'svg', md5: 'asset.svg'}], sounds: []};
    }
});
const fixture = () => {
    const stage = target('stage-runtime', true);
    stage.variables.a = {id: 'a', name: 'v', type: '', value: 0};
    stage.variables.b = {id: 'b', name: 'l', type: 'list', value: []};
    stage.variables.of = {id: 'of', name: 'message', type: 'broadcast_msg', value: 'message'};
    const sprites = ['first-runtime', 'second-runtime'].map(name => {
        const sprite = target(name);
        const definition = `${name}-long-definition-id`;
        const prototype = `${name}-long-prototype-id`;
        const parameter = `${name}-long-parameter-id`;
        sprite.blocks._blocks = {
            [definition]: {id: definition, opcode: 'procedures_definition', parent: null, next: null,
                inputs: {custom_block: {block: prototype, shadow: prototype}}, fields: {}, topLevel: true, shadow: false},
            [prototype]: {id: prototype, opcode: 'procedures_prototype', parent: definition, next: null,
                inputs: {argument: {block: parameter, shadow: parameter}}, fields: {}, shadow: true,
                mutation: {proccode: 'same signature %s', argumentids: '["argument"]', argumentnames: '["value"]'}},
            [parameter]: {id: parameter, opcode: 'argument_reporter_string_number', parent: prototype, next: null,
                inputs: {}, fields: {VALUE: {name: 'VALUE', value: name}}, shadow: true}
        };
        return sprite;
    });
    const vm = new EventEmitter();
    vm.runtime = {targets: [stage, ...sprites], extensionStorage: {}, platform: {}, stageWidth: 480, stageHeight: 360,
        fontManager: {serializeJSON: () => null}, getMonitorState: () => new MonitorState(),
        getTargetForStage: () => stage,
        getTargetById: id => vm.runtime.targets.find(item => item.id === id),
        emitProjectChanged: () => vm.emit('PROJECT_CHANGED')};
    vm.toJSON = (targetId, options) => JSON.stringify(sb3.serialize(vm.runtime, targetId, options));
    const manager = getColors(vm);
    sprites.forEach((sprite, index) => {
        const definition = Object.keys(sprite.blocks._blocks)[0];
        manager.set('procedures', definition, index ? '#abcdef' : '#123456',
            {secondary: '#345678', tertiary: '#456789', quaternary: '#56789a', text: '#ffffff'});
    });
    return {vm, manager, stage, sprites};
};

test('real SB3 serialization uses native short IDs in metadata and stage comments without changing the VM', () => {
    const {vm, manager, stage, sprites} = fixture();
    const runtimeColors = JSON.parse(JSON.stringify(manager.colors));
    const runtimeComment = readColorComment(stage).comment.text;
    const native = JSON.parse(JSON.stringify(sb3.serialize(vm.runtime)));
    const saved = JSON.parse(vm.toJSON());
    assert.deepEqual(saved.targets.map(item => item.blocks), native.targets.map(item => item.blocks),
        'reuse the native optimizer, including its variable/list/broadcast collision exclusions');
    const savedColors = readTransferColors(saved);
    const fallback = JSON.parse(JSON.stringify(saved));
    delete fallback[COLOR_METADATA_KEY];
    assert.deepEqual(readTransferColors(fallback), savedColors, 'comment fallback has the same saved IDs');
    for (const [index, sprite] of sprites.entries()) {
        const savedTarget = saved.targets[index + 1];
        const definition = Object.keys(sprite.blocks._blocks)[0];
        const savedDefinition = Object.keys(savedTarget.blocks).find(id =>
            savedTarget.blocks[id].opcode === 'procedures_definition');
        const savedParameter = Object.keys(savedTarget.blocks).find(id =>
            savedTarget.blocks[id].opcode === 'argument_reporter_string_number');
        assert.notEqual(savedDefinition, definition);
        assert.deepEqual(savedColors.procedures[savedDefinition], runtimeColors.procedures[definition]);
        assert.equal(savedColors.parameters[savedParameter].definitionId, savedDefinition);
        assert.deepEqual(savedColors.parameters[savedParameter].colors, runtimeColors.parameters[
            `${sprite.id}-long-parameter-id`].colors);
        assert.equal(savedColors.procedures[definition], undefined);
    }
    assert.deepEqual(saved.targets[0].variables, {a: ['v', 0]});
    assert.deepEqual(saved.targets[0].lists, {b: ['l', []]});
    assert.deepEqual(JSON.parse(JSON.stringify(manager.colors)), runtimeColors);
    assert.equal(readColorComment(stage).comment.text, runtimeComment);
    assert.deepEqual(JSON.parse(vm.toJSON()), saved, 'repeated saves do not remap live IDs');
});

test('unoptimized project and single-sprite serialization keep matching runtime IDs in both representations', () => {
    const {vm, manager, sprites} = fixture();
    const saved = JSON.parse(vm.toJSON(undefined, {allowOptimization: false}));
    assert.deepEqual(readTransferColors(saved), JSON.parse(JSON.stringify(manager.colors)));
    const single = JSON.parse(vm.toJSON(sprites[0].id));
    const definition = Object.keys(sprites[0].blocks._blocks)[0];
    assert.ok(single.blocks[definition]);
    assert.deepEqual(single[COLOR_METADATA_KEY].procedures[definition],
        {...manager.getEntry('procedures', definition), code: 'same signature %s'});
    const commentOnly = JSON.parse(JSON.stringify(single));
    delete commentOnly[COLOR_METADATA_KEY];
    assert.deepEqual(readTransferColors(commentOnly), readTransferColors(single));
});

test('long serialized color comments remap text plus extraText and retain metadata precedence', () => {
    const {vm, manager} = fixture();
    const saved = JSON.parse(vm.toJSON(undefined, {allowOptimization: false}));
    const comment = Object.values(saved.targets[0].comments).find(item => item.text.endsWith(COLOR_COMMENT_MARKER));
    const fullText = `${'Header '.repeat(1300)}\n${JSON.stringify(manager.colors)}${COLOR_COMMENT_MARKER}`;
    comment.text = fullText.slice(0, 8000);
    comment.extraText = fullText.slice(8000);
    const optimized = compressProjectColors(saved);
    const exported = readTransferColors(optimized);
    delete optimized[COLOR_METADATA_KEY];
    assert.deepEqual(readTransferColors(optimized), exported);
    const savedComment = Object.values(optimized.targets[0].comments)[0];
    assert.equal(savedComment.text.length, 8000);
    assert.ok(savedComment.extraText.endsWith(COLOR_COMMENT_MARKER));
    assert.ok((savedComment.text + savedComment.extraText).startsWith('Header '.repeat(1300)));
    const large = {variables: Object.fromEntries(Array.from({length: 200}, (_, i) =>
        [`variable-${i}`, {color: '#123456', name: 'a'.repeat(30)}])), lists: {}, procedures: {}, parameters: {}};
    const sprite = attachTransferColors({blocks: {}, comments: {}}, large);
    const transport = Object.values(sprite.comments)[0];
    assert.equal(transport.text.length, 8000);
    assert.ok(transport.extraText.endsWith(COLOR_TRANSFER_MARKER));
    delete sprite[COLOR_METADATA_KEY];
    assert.deepEqual(readTransferColors(sprite), large);
});
