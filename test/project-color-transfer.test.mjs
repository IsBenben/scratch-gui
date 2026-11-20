import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COLOR_METADATA_KEY, COLOR_TRANSFER_MARKER, attachTransferColors, readTransferColors, rekeySpriteColors}
    from '../src/lib/project-color-transfer.js';
import getColors from '../src/lib/project-block-colors.js';
import {EventEmitter} from 'node:events';

const colors = {variables: {variable: {color:'#123456',name:'v'}},lists:{list:{color:'#654321',name:'l'}},
    procedures:{definition:{color:'#abcdef',colors:{secondary:'#123abc',tertiary:'#234abc',
        quaternary:'#345abc',text:'#456abc'},code:'custom %s'}},
    parameters:{}};
const sprite = {
    name:'Sprite',isStage:false,variables:{variable:['v',0]},lists:{list:['l',[]]},comments:{
        normal:{blockId:'definition',text:'keep me',x:1,y:2,width:200,height:100,minimized:false}
    },
    blocks:{
        definition:{opcode:'procedures_definition',parent:null,next:'set',topLevel:true,
            inputs:{custom_block:[1,'proto']},fields:{},comment:'normal'},
        proto:{opcode:'procedures_prototype',parent:'definition',inputs:{},fields:{},mutation:{proccode:'custom %s'}},
        set:{opcode:'data_setvariableto',parent:'definition',next:null,
            inputs:{VALUE:[3,[12,'v','variable'],[4,'0']]},fields:{VARIABLE:['v','variable']}},
        reporter:[13,'l','list',10,20]
    }
};

test('sprite and backpack payloads carry metadata plus a real comment; valid metadata wins per entry', () => {
    const exported = attachTransferColors(sprite, colors);
    assert.ok(Object.values(exported.comments).some(c=>c.text.endsWith(COLOR_TRANSFER_MARKER)));
    assert.equal(exported.comments.normal.text,'keep me');
    exported[COLOR_METADATA_KEY].variables.variable.color='#aabbcc';
    exported[COLOR_METADATA_KEY].lists.list.color='invalid';
    const resolved = readTransferColors(exported);
    assert.equal(resolved.variables.variable.color,'#aabbcc');
    assert.deepEqual(resolved.procedures.definition.colors,colors.procedures.definition.colors);
    assert.equal(resolved.lists.list.color,'#654321');
    delete exported[COLOR_METADATA_KEY];
    assert.deepEqual(readTransferColors(exported),colors);
    const backpack=attachTransferColors([{id:'definition',topLevel:true,inputs:{},fields:{}}],colors);
    assert.deepEqual(backpack.extensionURLs,{});
    assert.equal(backpack.blocks[0].id,'definition');
    delete backpack[COLOR_METADATA_KEY];
    assert.deepEqual(readTransferColors(backpack),colors);
    assert.equal(sprite.comments.normal.text,'keep me');
    assert.equal(Object.keys(sprite.comments).length,1);
});

test('sprite import remaps block/variable/list references, preserves user comments, and removes only transport comments', () => {
    const exported=attachTransferColors(sprite,colors);
    const {sprite: imported,colors: remapped}=rekeySpriteColors(exported);
    assert.equal(imported.comments.normal.text,'keep me');
    assert.equal(Object.values(imported.comments).some(c=>c.text.endsWith(COLOR_TRANSFER_MARKER)),false);
    const definitionId=Object.keys(remapped.procedures)[0];
    const variableId=Object.keys(remapped.variables)[0];
    const listId=Object.keys(remapped.lists)[0];
    assert.notEqual(definitionId,'definition'); assert.notEqual(variableId,'variable');assert.notEqual(listId,'list');
    assert.equal(imported.variables[variableId][0],'v');
    assert.equal(imported.lists[listId][0],'l');
    assert.equal(imported.comments.normal.blockId,definitionId);
    const definitionBlock=imported.blocks[definitionId];
    assert.equal(imported.blocks[definitionBlock.inputs.custom_block[1]].parent,definitionId);
    const set=imported.blocks[definitionBlock.next];
    assert.equal(set.fields.VARIABLE[1],variableId);
    assert.equal(set.inputs.VALUE[1][2],variableId);
    assert.ok(Object.values(imported.blocks).some(b=>Array.isArray(b)&&b[2]===listId));
    assert.equal(Object.keys(exported.blocks).includes('definition'),true);
});

test('full project imports honor metadata over the stage comment while retaining global destination colors on sprite import', async () => {
    const vm=new EventEmitter();
    const stage={isOriginal:true,isStage:true,id:'stage',variables:{global:{id:'global',name:'v',type:''}},comments:{},
        blocks:{_blocks:{},getBlock(){}}};
    stage.createComment=(id,blockId,text,x,y,width,height,minimized)=>{
        stage.comments[id]={id,blockId,text,x,y,width,height,minimized};
    };
    vm.runtime={targets:[stage],getTargetForStage:()=>stage,getTargetById:()=>stage,
        emitProjectChanged:()=>vm.emit('PROJECT_CHANGED')};
    vm.deserializeProject=async()=>{};
    const manager=getColors(vm);
    manager.set('variables','global','#222222');
    const incoming={variables:{global:{color:'#333333'}},lists:{},procedures:{}};
    manager.applyTransfer(incoming,stage,new Set(['global']));
    assert.equal(manager.get('variables','global'),'#222222');
    const project={targets:[{isStage:true,comments:JSON.parse(JSON.stringify(stage.comments))}],
        [COLOR_METADATA_KEY]:{version:1,...incoming}};
    await vm.deserializeProject(project);
    assert.equal(manager.get('variables','global'),'#333333');
});
