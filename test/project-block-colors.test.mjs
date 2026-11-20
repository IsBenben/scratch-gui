import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import getColors, {COLOR_COMMENT_MARKER, DEFAULT_COLORS, readColorComment, colorPalette}
    from '../src/lib/project-block-colors.js';
import Renderer from '../src/lib/project-block-color-renderer.js';

const target = (id, isStage = false) => ({
    id, isStage, isOriginal: true, variables: {}, comments: {},
    blocks: {_blocks: {}, getBlock(id) { return this._blocks[id]; }},
    createComment(id, blockId, text, x, y, width, height, minimized) {
        this.comments[id] = {id, blockId, text, x, y, width, height, minimized};
    }
});
const variable = (target, id, name = 'same name', type = '') => {
    target.variables[id] = {id, name, type};
};
const definition = (target, id, code = 'same procedure') => {
    target.blocks._blocks[id] = {id, opcode: 'procedures_definition', inputs: {custom_block: {block: id+'-proto'}}};
    target.blocks._blocks[id+'-proto'] = {id: id+'-proto', opcode: 'procedures_prototype', mutation: {proccode: code}};
};
const fixture = () => {
    const stage = target('stage-runtime-id', true);
    const sprite = target('sprite-runtime-id');
    const vm = new EventEmitter();
    vm.runtime = {targets: [stage, sprite], getTargetForStage: () => stage,
        getTargetById: id => vm.runtime.targets.find(t => t.id === id),
        emitProjectChanged: () => vm.emit('PROJECT_CHANGED')};
    vm.editingTarget = sprite;
    variable(stage, 'global'); variable(sprite, 'local'); variable(sprite, 'list', 'same name', 'list');
    definition(sprite, 'definition');
    return {vm, stage, sprite};
};

test('stage comment holds every variable/list/definition by stable ID and preserves normal comments', () => {
    const {vm, stage, sprite} = fixture();
    stage.createComment('normal', null, 'user comment', 1, 2, 3, 4, false);
    stage.createComment('twconfig', null, '{} // _twconfig_', 5, 6, 7, 8, false);
    const manager = getColors(vm);
    assert.equal(Object.keys(stage.comments).length, 2);
    manager.set('variables', 'local', '#ABCDEF');
    const {colors, comment} = readColorComment(stage);
    assert.equal(comment.text.split('\n').length, 2);
    assert.equal(comment.text.endsWith(COLOR_COMMENT_MARKER), true);
    assert.equal(colors.variables.local.color, '#abcdef');
    assert.equal(colors.variables.global.color, DEFAULT_COLORS.variables);
    assert.equal(colors.lists.list.color, DEFAULT_COLORS.lists);
    assert.equal(colors.procedures.definition.color, DEFAULT_COLORS.procedures);
    assert.equal(stage.comments.normal.text, 'user comment');
    assert.equal(stage.comments.twconfig.text, '{} // _twconfig_');
    sprite.variables.local.name = 'renamed'; sprite.id = 'new-runtime-id';
    vm.emit('targetsUpdate');
    assert.equal(manager.get('variables', 'local'), '#abcdef');
    assert.equal(Object.keys(stage.comments).length, 3);
});

test('creation, deletion, comment removal, and reopening a project synchronize without resurrecting deleted settings', () => {
    const {vm, stage, sprite} = fixture();
    const manager = getColors(vm);
    manager.set('procedures', 'definition', '#123456');
    const comment = readColorComment(stage).comment;
    Object.assign(comment, {x: 456, y: 123, width: 555, height: 200, minimized: true});
    variable(sprite, 'new', 'new');
    vm.emit('PROJECT_CHANGED');
    assert.equal(manager.get('variables', 'new'), DEFAULT_COLORS.variables);
    delete sprite.variables.list; delete sprite.blocks._blocks.definition;
    vm.emit('PROJECT_CHANGED');
    assert.equal(manager.get('lists', 'list'), undefined);
    assert.equal(manager.get('procedures', 'definition'), undefined);
    assert.equal(readColorComment(stage).comment.width, 555);
    assert.equal(readColorComment(stage).comment.minimized, true);
    delete stage.comments[comment.id]; vm.emit('PROJECT_CHANGED');
    assert.equal(manager.get('variables', 'new'), undefined);
    vm.emit('targetsUpdate'); vm.emit('PROJECT_LOADED');
    assert.equal(readColorComment(stage).comment, undefined);
    manager.set('variables', 'new', '#654321');
    assert.equal(manager.get('variables', 'new'), '#654321');
    const saved = JSON.parse(JSON.stringify(stage.comments));
    stage.comments = {}; vm.emit('PROJECT_LOADED');
    assert.equal(manager.get('variables', 'new'), undefined);
    stage.comments = saved; vm.emit('PROJECT_LOADED');
    assert.equal(manager.get('variables', 'new'), '#654321');
});

test('malformed comments and invalid colors never execute or pollute the configuration', () => {
    const {stage, vm} = fixture();
    stage.createComment('invalid', null, `warning\nalert(1)${COLOR_COMMENT_MARKER}`, 1, 2, 3, 4, false);
    assert.deepEqual(Object.keys(readColorComment(stage).colors.variables), []);
    const manager = getColors(vm);
    manager.set('variables', 'local', 'url(https://example.com)');
    assert.equal(manager.get('variables', 'local'), DEFAULT_COLORS.variables);
    manager.set('__proto__', 'local', '#112233');
    manager.set('variables', 'nonexistent', '#112233');
    assert.equal(manager.get('variables', 'nonexistent'), undefined);
    assert.equal(colorPalette('#ffffff').text, '#000000');
    assert.equal(colorPalette('#000000').text, '#ffffff');
});

test('sharing definitions and duplicating sprites inherit colors under the new IDs', async () => {
    const {vm, sprite} = fixture();
    const destination = target('destination'); vm.runtime.targets.push(destination);
    variable(destination, 'existing', 'same name');
    vm.shareBlocksToTarget = async (_blocks, targetId) => {
        definition(vm.runtime.getTargetById(targetId), 'copied-definition');
    };
    vm.duplicateSprite = async () => {
        const copy = target('duplicate'); variable(copy, 'copied-variable'); definition(copy, 'duplicate-definition');
        vm.runtime.targets.push(copy); vm.editingTarget = copy;
    };
    const manager = getColors(vm);
    manager.set('variables', 'local', '#abcdef');
    manager.set('procedures', 'definition', '#123456');
    manager.set('variables', 'existing', '#876543');
    await vm.shareBlocksToTarget([], destination.id, sprite.id);
    assert.equal(manager.get('procedures', 'copied-definition'), '#123456');
    assert.equal(manager.get('variables', 'existing'), '#876543');
    await vm.duplicateSprite(sprite.id);
    assert.equal(manager.get('procedures', 'duplicate-definition'), '#123456');
    assert.equal(manager.get('variables', 'copied-variable'), '#abcdef');
    manager.set('procedures', 'copied-definition', '#aabbcc');
    assert.equal(manager.get('procedures', 'definition'), '#123456');
});

test('workspace and flyout blocks update through native color APIs and restore their own default palettes', () => {
    const {vm, sprite} = fixture();
    const manager = getColors(vm);
    const mockBlock = (type, id, field) => ({
        id, type, palette: ['#ff8c1a', '#ff8000', '#db6e00', '#db6e00'],
        getField: name => name === 'VARIABLE' && field ? {getValue: () => field} : null,
        getProcCode: () => 'same procedure',
        getColour() {return this.palette[0];}, getColourSecondary() {return this.palette[1];},
        getColourTertiary() {return this.palette[2];}, getColourQuaternary() {return this.palette[3];},
        setColour(...palette) {this.palette = palette;}
    });
    const a = mockBlock('data_variable', 'reporter', 'local');
    const b = mockBlock('data_setvariableto', 'setter', 'local');
    const call = mockBlock('procedures_call', 'call');
    const flyout = {getAllBlocks: () => [b, call], addChangeListener(){}, removeChangeListener(){}};
    const workspace = {getAllBlocks: () => [a], getFlyout: () => ({getWorkspace: () => flyout}),
        addChangeListener(){}, removeChangeListener(){}};
    const renderer = new Renderer(manager, {}, workspace);
    manager.set('variables', 'local', '#abcdef'); manager.set('procedures', 'definition', '#123456');
    assert.equal(a.palette[0], '#abcdef'); assert.equal(b.palette[0], '#abcdef');
    assert.equal(call.palette[0], '#123456');
    delete vm.runtime.getTargetForStage().comments[readColorComment(vm.runtime.getTargetForStage()).comment.id];
    vm.emit('PROJECT_CHANGED');
    assert.deepEqual(a.palette, ['#ff8c1a', '#ff8000', '#db6e00', '#db6e00']);
    renderer.resetInventory(); renderer.onChange({type: 'create'});
    assert.equal(readColorComment(vm.runtime.getTargetForStage()).comment, undefined);
    variable(sprite, 'created'); renderer.onChange({type: 'var_create'});
    assert.ok(readColorComment(vm.runtime.getTargetForStage()).comment);
    renderer.dispose();
});

test('visible stage configuration uses native comment text APIs without replacing the comment', () => {
    const {vm,stage} = fixture();
    vm.editingTarget = stage;
    const manager = getColors(vm);
    manager.set('variables','global','#123456');
    const comment = readColorComment(stage).comment;
    const rendered = {text:'outdated',x:99,y:101,getText(){return this.text;},setText(text){this.text=text;}};
    const flyout = {getAllBlocks:()=>[],addChangeListener(){},removeChangeListener(){}};
    const workspace = {getAllBlocks:()=>[],getFlyout:()=>({getWorkspace:()=>flyout}),
        addChangeListener(){},removeChangeListener(){},getCommentById(id){assert.equal(id,comment.id);return rendered;}};
    let eventDepth=0;
    const renderer = new Renderer(manager,{Events:{disable(){eventDepth++;},enable(){eventDepth--;}}},workspace);
    assert.equal(rendered.getText(),comment.text);
    manager.set('variables','global','#abcdef');
    assert.equal(rendered.getText(),readColorComment(stage).comment.text);
    assert.equal(rendered.x,99);assert.equal(rendered.y,101);
    assert.equal(eventDepth,0);
    renderer.dispose();
});

test('parameter cache follows deeply nested connections, edits, moves and definition deletion', () => {
    const {vm, sprite} = fixture();
    const blocks = sprite.blocks._blocks;
    blocks.definition.next = 'control';
    blocks.control = {id:'control',opcode:'control_if',next:null,inputs:{
        CONDITION:{block:'boolean'},SUBSTACK:{block:'setter'}}};
    blocks.boolean = {id:'boolean',opcode:'argument_reporter_boolean',inputs:{}};
    blocks.setter = {id:'setter',opcode:'data_setvariableto',inputs:{VALUE:{block:'operator'}}};
    blocks.operator = {id:'operator',opcode:'operator_add',inputs:{NUM1:{block:'parameter'}}};
    blocks.parameter = {id:'parameter',opcode:'argument_reporter_string_number',fields:{VALUE:{value:'x'}}};
    blocks['definition-proto'].inputs = {argument:{block:'prototype-param',shadow:'prototype-param'}};
    blocks['prototype-param'] = {id:'prototype-param',opcode:'argument_reporter_string_number',inputs:{}};
    blocks.orphan = {id:'orphan',opcode:'argument_reporter_boolean',inputs:{}};
    const manager = getColors(vm);
    const palette = {secondary:'#234567',tertiary:'#345678',quaternary:'#456789',text:'#56789a'};
    manager.set('procedures','definition','#abcdef',palette);
    for (const id of ['boolean','parameter','prototype-param']) {
        assert.deepEqual(manager.colors.parameters[id], {color:'#abcdef',colors:palette,definitionId:'definition'});
    }
    assert.equal(manager.colors.parameters.setter,undefined);
    assert.equal(manager.colors.parameters.orphan,undefined);
    blocks.parameter.fields.VALUE.value = 'renamed'; vm.emit('PROJECT_CHANGED');
    assert.equal(manager.colors.parameters.parameter.color,'#abcdef');
    delete blocks.operator.inputs.NUM1; vm.emit('PROJECT_CHANGED');
    assert.equal(manager.colors.parameters.parameter,undefined);
    definition(sprite,'second'); blocks.second.next = 'parameter';
    manager.set('procedures','second','#123456',{text:'#987654'});
    const {primary: _primary, ...parameterPalette} = colorPalette('#123456',{text:'#987654'});
    assert.deepEqual(manager.colors.parameters.parameter,
        {color:'#123456',colors:parameterPalette,definitionId:'second'});
    delete blocks.boolean; delete blocks.control.inputs.CONDITION; vm.emit('PROJECT_CHANGED');
    assert.equal(manager.colors.parameters.boolean,undefined);
    delete blocks.second; vm.emit('PROJECT_CHANGED');
    assert.equal(manager.colors.parameters.parameter,undefined);
});

test('all native palette channels and text remain independent, with automatic contrast fallback', () => {
    const {vm,stage} = fixture();
    const manager = getColors(vm);
    const palette = {secondary:'#111111',tertiary:'#222222',quaternary:'#333333',text:'#444444'};
    manager.set('procedures','definition','#abcdef',palette);
    assert.deepEqual(readColorComment(stage).colors.procedures.definition, {color:'#abcdef',colors:palette});
    assert.deepEqual(colorPalette('#abcdef',palette), {primary:'#abcdef',...palette});
    assert.equal(colorPalette('#ffffff',{secondary:'#111111'}).tertiary,'#b3b3b3');
    assert.equal(colorPalette('#ffffff').text,'#000000');
    assert.equal(colorPalette('#000000').text,'#ffffff');
    manager.set('procedures','definition','#ffffff');
    assert.equal(manager.getEntry('procedures','definition').colors,undefined);
});

test('backpack export resolves regenerated definition IDs; same-name destination palettes take priority', async () => {
    const {vm,sprite} = fixture();
    vm.exportStandaloneBlocks = blocks => blocks;
    const manager = getColors(vm);
    const palette = {secondary:'#123456',tertiary:'#234567',quaternary:'#345678',text:'#456789'};
    manager.set('procedures','definition','#abcdef',palette);
    const dragged = [
        {id:'new-export-id',opcode:'procedures_definition',inputs:{custom_block:{block:'new-proto'}}},
        {id:'new-proto',opcode:'procedures_prototype',inputs:{},mutation:{proccode:'same procedure'}}
    ];
    const payload = vm.exportStandaloneBlocks(dragged);
    const incoming = payload.scratchGuiColors;
    assert.deepEqual(incoming.procedures['new-export-id'], {color:'#abcdef',colors:palette,code:'same procedure'});
    const destination = target('destination'); vm.runtime.targets.push(destination);
    definition(destination,'imported-id');
    manager.applyTransfer(incoming,destination,new Set());
    assert.deepEqual(manager.getEntry('procedures','imported-id'), {color:'#abcdef',colors:palette});
    manager.set('procedures','imported-id','#987654',{text:'#101010'});
    definition(destination,'second-import-id');
    manager.applyTransfer(incoming,destination,new Set(['imported-id','imported-id-proto']));
    assert.deepEqual(manager.getEntry('procedures','second-import-id'),
        {color:'#987654',colors:{text:'#101010'}});
    assert.deepEqual(manager.getEntry('procedures','imported-id'),
        {color:'#987654',colors:{text:'#101010'}});
    assert.equal(manager.get('procedures','definition'),'#abcdef');
    assert.equal(sprite.blocks.getBlock('definition').id,'definition');
});

test('normal dragging freezes parameter metadata until release; copied IDs inherit the source cache', () => {
    const {vm,sprite} = fixture();
    sprite.blocks._blocks.definition.next='parameter';
    sprite.blocks._blocks.parameter={id:'parameter',opcode:'argument_reporter_string_number',inputs:{}};
    const manager=getColors(vm);
    manager.set('procedures','definition','#123456',{tertiary:'#abcdef',text:'#654321'});
    const cached=JSON.parse(JSON.stringify(manager.getEntry('parameters','parameter')));
    manager.beginParameterDrag(new Map([['parameter',cached],['copied-id',cached]]));
    delete sprite.blocks._blocks.definition.next;
    sprite.blocks._blocks['copied-id']={id:'copied-id',opcode:'argument_reporter_string_number',inputs:{}};
    vm.emit('PROJECT_CHANGED');vm.emit('targetsUpdate');
    assert.deepEqual(manager.getEntry('parameters','parameter'),cached);
    assert.deepEqual(manager.getEntry('parameters','copied-id'),cached);
    manager.endParameterDrag();
    assert.equal(manager.getEntry('parameters','parameter'),undefined);
    assert.equal(manager.getEntry('parameters','copied-id'),undefined);
});

test('backpack imports retain existing global variable and list palettes for matching IDs or names', async () => {
    const {vm,stage} = fixture();
    variable(stage,'global-list','same list','list');
    const destination=target('backpack-destination');vm.runtime.targets.push(destination);
    destination.lookupVariableByNameAndType=(name,type)=>Object.values(stage.variables)
        .find(item=>item.name===name&&item.type===type);
    vm.shareBlocksToTarget=async()=>{};
    const manager=getColors(vm);
    const palette={secondary:'#123456',tertiary:'#234567',quaternary:'#345678',text:'#456789'};
    manager.set('variables','global','#abcdef',palette);
    manager.set('lists','global-list','#fedcba',palette);
    for (const originalIds of [true,false]) {
        await vm.shareBlocksToTarget({scratchGuiColors:{
            variables:{[originalIds?'global':'foreign-variable']:{color:'#111111',name:'same name'}},
            lists:{[originalIds?'global-list':'foreign-list']:{color:'#222222',name:'same list'}}
        }},destination.id);
        assert.deepEqual(manager.getEntry('variables','global'),{color:'#abcdef',colors:palette});
        assert.deepEqual(manager.getEntry('lists','global-list'),{color:'#fedcba',colors:palette});
    }
});
