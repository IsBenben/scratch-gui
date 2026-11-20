import assert from 'node:assert/strict';
import verifyProjectColorSerialization from './verify-project-color-serialization.mjs';

export default async ({evaluate,until,pause,capture,commands,dimensions,mouse}, definition, variable) => {
  const palette={secondary:'#345678',tertiary:'#56789a',quaternary:'#789abc',text:'#aabbcc'};
  const modal='[class*=custom-procedures_body_]';
  const swatches='[data-project-color-palette] button[class*=swatch_]';
  const edit=async()=>{
    await evaluate(`colorB.Procedures.editProcedureCallback_(colorWS.getBlockById(${JSON.stringify(definition)}));true;`);
    await until(`!!document.querySelector('${modal}')`,'procedure edit modal');
  };
  const save=async()=>{
    await evaluate(`document.querySelector('[class*=custom-procedures_ok-button_]').click();true;`);
    await until(`!document.querySelector('${modal}')`,'procedure palette saved');
  };
  await edit();
  assert.equal(await evaluate(`document.querySelectorAll('${swatches}').length`),0);
  await evaluate(`document.querySelector('[data-project-color-custom]').click();true;`);
  await until(`document.querySelectorAll('${swatches}').length===4`,'independent Blockly palette controls');
  for (const [index,name] of Object.keys(palette).entries()) {
    await evaluate(`document.querySelectorAll('${swatches}')[${index}].click();true;`);
    await until(`!!document.querySelector('[role="dialog"] .sa-color-picker-code-text')`,'palette native popup');
    await evaluate(`{const input=document.querySelector('[role="dialog"] .sa-color-picker-code-text');
      input.value='${palette[name]}';input.dispatchEvent(new Event('change',{bubbles:true}));}true;`);
    await until(`colorComponent('${modal}','handleSecondaryColorChange').state.colors.${name}==='${palette[name]}'`,
      `${name} input updates preview`);
    await evaluate(`colorB.DropDownDiv.hideWithoutAnimation();true;`);
  }
  assert.equal(await evaluate(`colorComponent('${modal}','updatePreview').workspace.getAllBlocks().every(b=>
    b.getColour()==='#456789'&&b.getColourTertiary()==='#56789a')`),true);
  await capture('custom-procedure-palette');
  const rows=await evaluate(`Array.from(document.querySelectorAll('${swatches}'),e=>e.getBoundingClientRect().top)`);
  assert.ok(rows.every(top=>Math.abs(top-rows[0])<2),'all palette controls on one desktop row');
  // A modal click outside the picker closes it even when the title/body stops bubbling.
  for (const selector of ['[class*=modal_header-item-title_]','[class*=custom-procedures_workspace_]','[class*=custom-procedures_body_]']) {
    await evaluate(`document.querySelector('${modal} [class*=swatch_]').click();true;`);
    await until(`!!colorB.DropDownDiv.owner_`,'picker opened for outside click');
    const area=await dimensions(selector);
    await mouse('mousePressed',area.left+area.width-8,area.top+8);
    await mouse('mouseReleased',area.left+area.width-8,area.top+8);
    assert.equal(await evaluate(`!!colorB.DropDownDiv.owner_`),false,'outside click closes popup');
  }
  await commands('Emulation.setDeviceMetricsOverride',{width:1100,height:420,deviceScaleFactor:1,mobile:false});
  await pause(100);
  assert.ok(await evaluate(`{const body=document.querySelector('${modal}');
    body.scrollHeight>body.clientHeight&&getComputedStyle(body).overflowY==='auto';}`),'low-height body scrolls');
  const scrollArea=await dimensions(modal);
  await commands('Input.dispatchMouseEvent',{type:'mouseWheel',x:scrollArea.left+scrollArea.width-10,
    y:scrollArea.top+20,deltaY:400,deltaX:0});
  await until(`document.querySelector('${modal}').scrollTop>0`,'real wheel scrolls lower modal');
  await evaluate(`document.querySelector('${modal}').scrollTop=10000;true;`);
  assert.ok(await evaluate(`document.querySelector('[class*=custom-procedures_ok-button_]').getBoundingClientRect().bottom<=420`),
    'save button remains reachable');
  await capture('procedure-low-height-scroll');
  await commands('Emulation.setDeviceMetricsOverride',{width:480,height:650,deviceScaleFactor:1,mobile:false});
  await pause(100);
  assert.ok(await evaluate(`{const dialog=document.querySelector('[role="dialog"]');dialog.scrollWidth<=dialog.clientWidth;}`),
    'narrow dialog has no horizontal overflow');
  const narrowRows=await evaluate(`Array.from(document.querySelectorAll('${swatches}'),e=>e.getBoundingClientRect().top)`);
  assert.ok(new Set(narrowRows).size>1,'narrow palette wraps');
  await capture('procedure-narrow-layout');
  await commands('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});
  await pause(100);
  await save();
  assert.deepEqual(await evaluate(`colorManager.getEntry('procedures',${JSON.stringify(definition)}).colors`),palette);
  await edit();
  assert.equal(await evaluate(`document.querySelector('[data-project-color-custom]').checked`),true);
  // Automatic text and disabling custom colors must work in the preview, and cancel must preserve all stored channels.
  await evaluate(`document.querySelectorAll('${swatches}')[3].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}));true;`);
  assert.equal(await evaluate(`colorComponent('${modal}','updatePreview').state.colors.text`),undefined);
  await evaluate(`document.querySelector('[data-project-color-custom]').click();true;`);
  assert.equal(await evaluate(`document.querySelectorAll('${swatches}').length`),0);
  await evaluate(`colorComponent('${modal}','handleCancel').handleCancel();true;`);
  assert.deepEqual(await evaluate(`colorManager.getEntry('procedures',${JSON.stringify(definition)}).colors`),palette);

  // Real SVG fields, white input shadows, and deeply nested procedure reporters.
  await evaluate(`window.paletteDefinition=colorWS.getBlockById(${JSON.stringify(definition)});
    window.paletteMake=(type,shadow=false)=>{const b=colorWS.newBlock(type);b.setShadow(shadow);b.initSvg();b.render();return b;};
    window.paletteControl=paletteMake('control_if');
    window.paletteBoolean=paletteMake('argument_reporter_boolean');paletteBoolean.setFieldValue('boolean','VALUE');
    window.paletteSetter=paletteMake('data_setvariableto');paletteSetter.setFieldValue(${JSON.stringify(variable)},'VARIABLE');
    window.paletteOperator=paletteMake('operator_add');
    window.paletteParameter=paletteMake('argument_reporter_string_number');paletteParameter.setFieldValue('number or text','VALUE');
    window.paletteOrphan=paletteMake('argument_reporter_string_number');paletteOrphan.setFieldValue('orphan','VALUE');
    paletteDefinition.nextConnection.connect(paletteControl.previousConnection);
    paletteControl.getInput('CONDITION').connection.connect(paletteBoolean.outputConnection);
    paletteControl.getInput('SUBSTACK').connection.connect(paletteSetter.previousConnection);
    paletteSetter.getInput('VALUE').connection.connect(paletteOperator.outputConnection);
    paletteOperator.getInput('NUM1').connection.connect(paletteParameter.outputConnection);
    window.paletteCall=paletteMake('procedures_call');
    paletteCall.domToMutation(paletteDefinition.getInputTargetBlock('custom_block').mutationToDom());
    window.paletteSlot=paletteMake('math_number',true);
    paletteCall.inputList.find(i=>i.connection).connection.connect(paletteSlot.outputConnection);
    colorB.Events.fireNow_();true;`);
  await until(`paletteParameter.getColour()==='#456789'&&paletteBoolean.getColour()==='#456789'`,'nested reporters inherit');
  assert.equal(await evaluate(`paletteOrphan.getColour().toLowerCase()`),'#ff6680');
  assert.equal(await evaluate(`paletteSlot.svgPath_.getAttribute('stroke')`),palette.tertiary);
  assert.equal(await evaluate(`paletteParameter.getField('VALUE').textElement_.style.fill`),'rgb(170, 187, 204)');
  assert.equal(await evaluate(`Object.values(colorManager.colors.parameters).filter(p=>p.definitionId===paletteDefinition.id).length`),4);
  assert.equal(await evaluate(`paletteSetter.getColour()`),'#abcdef');
  // Update an existing dropdown without opening it; also refresh a menu that is already open.
  await evaluate(`colorManager.set('variables',${JSON.stringify(variable)},'#cccccc');true;`);
  assert.equal(await evaluate(`paletteSetter.getField('VARIABLE').box_.getAttribute('fill')`),'#cccccc');
  assert.equal(await evaluate(`paletteSetter.getField('VARIABLE').box_.getAttribute('stroke')`),'#8f8f8f');
  await evaluate(`paletteSetter.getField('VARIABLE').showEditor_();colorManager.set('variables',${JSON.stringify(variable)},'#abcdef');true;`);
  assert.equal(await evaluate(`paletteSetter.getField('VARIABLE').box_.getAttribute('stroke')`),'#7890a7');
  assert.equal(await evaluate(`colorB.DropDownDiv.DIV_.style.backgroundColor`),'rgb(171, 205, 239)');
  await evaluate(`colorB.DropDownDiv.hideWithoutAnimation();true;`);
  // Moving a reporter out and back updates both SVG and the derived metadata immediately.
  await verifyProjectColorSerialization({evaluate}, definition);
  await evaluate(`paletteParameter.unplug();colorB.Events.fireNow_();true;`);
  await until(`paletteParameter.getColour().toLowerCase()==='#ff6680'&&!colorManager.colors.parameters[paletteParameter.id]`,'orphan restores defaults');
  await evaluate(`paletteOperator.getInput('NUM1').connection.connect(paletteParameter.outputConnection);colorB.Events.fireNow_();true;`);
  await until(`colorManager.colors.parameters[paletteParameter.id]?.color==='#456789'`,'reattached reporter cached');
  // Native copy/paste changes IDs; inherited cached colors must survive the complete drag.
  await evaluate(`window.paletteOriginalCache=JSON.parse(JSON.stringify(colorManager.colors.parameters[paletteParameter.id]));
    colorB.duplicate_(paletteControl);window.paletteCopied=colorB.selected;
    window.paletteCopiedParameter=paletteCopied.getDescendants().find(b=>b.type==='argument_reporter_string_number');
    window.paletteNativeDrag=new colorB.BlockDragger(paletteCopied,colorWS);
    paletteNativeDrag.startBlockDrag({x:0,y:0});colorB.Events.fireNow_();true;`);
  assert.equal(await evaluate(`paletteCopiedParameter.getColour()`),'#456789');
  assert.deepEqual(await evaluate(`colorManager.colors.parameters[paletteCopiedParameter.id]`),
    await evaluate(`paletteOriginalCache`));
  await evaluate(`colorVM.runtime.emitProjectChanged();true;`);
  assert.equal(await evaluate(`paletteCopiedParameter.getColour()`),'#456789');
  await evaluate(`{const bounds=colorWS.getParentSvg().getBoundingClientRect();
    const event={clientX:bounds.right-80,clientY:bounds.top+250};
    if(colorWS.isDeleteArea(event))throw new Error('Drop point must be outside the toolbox/trash');
    paletteNativeDrag.dragBlock(event,{x:200,y:160});
    paletteNativeDrag.endBlockDrag(event,{x:200,y:160});
    paletteNativeDrag.dispose();}colorB.Events.fireNow_();true;`);
  assert.equal(await evaluate(`colorWS.getBlockById(paletteCopiedParameter.id)===paletteCopiedParameter`),true,
    'the orphan copy remains in the workspace after dropping');
  await until(`paletteCopiedParameter.getColour().toLowerCase()==='#ff6680'&&!colorManager.colors.parameters[paletteCopiedParameter.id]`,
    'dropped orphan copy resets after drag');
  await evaluate(`paletteCopied.dispose(false);colorB.Events.fireNow_();true;`);
  // Click the first native context-menu item, which clones directly and starts a fake mouse drag.
  await evaluate(`colorWS.centerOnBlock(paletteControl.id);
    paletteDefinition.moveBy((350-paletteControl.svgPath_.getBoundingClientRect().left)/colorWS.scale,0);
    colorB.Events.fireNow_();true;`);
  const source=await evaluate(`{const r=paletteControl.svgPath_.getBoundingClientRect();({x:r.left+20,y:r.top+10});}`);
  await commands('Input.dispatchMouseEvent',{type:'mousePressed',x:source.x,y:source.y,button:'right',buttons:2,clickCount:1});
  await commands('Input.dispatchMouseEvent',{type:'mouseReleased',x:source.x,y:source.y,button:'right',buttons:0,clickCount:1});
  await until(`!!document.querySelector('.blocklyWidgetDiv .goog-menuitem')`,'real native duplicate context menu');
  await evaluate(`document.querySelector('.blocklyWidgetDiv .goog-menuitem').setAttribute('data-native-color-duplicate','');true;`);
  assert.equal(await evaluate(`document.querySelector('[data-native-color-duplicate]').textContent`),
    await evaluate(`colorB.Msg.DUPLICATE`));
  const duplicateItem=await dimensions('[data-native-color-duplicate]');
  await mouse('mousePressed',duplicateItem.left+20,duplicateItem.top+duplicateItem.height/2);
  await mouse('mouseReleased',duplicateItem.left+20,duplicateItem.top+duplicateItem.height/2);
  await until(`colorManager.parameterDrag&&colorB.selected!==paletteControl`,'native menu duplicate begins drag');
  await evaluate(`window.paletteMenuCopy=colorB.selected;
    window.paletteMenuParameter=paletteMenuCopy.getDescendants().find(b=>b.type==='argument_reporter_string_number');true;`);
  assert.notEqual(await evaluate(`paletteMenuParameter.id`),await evaluate(`paletteParameter.id`));
  assert.equal(await evaluate(`paletteMenuParameter.getColour()`),'#456789');
  assert.equal(await evaluate(`paletteMenuParameter.getColourTertiary()`),palette.tertiary);
  assert.deepEqual(await evaluate(`colorManager.colors.parameters[paletteMenuParameter.id]`),await evaluate(`paletteOriginalCache`));
  const drop=await evaluate(`{const r=colorWS.getParentSvg().getBoundingClientRect();({x:r.right-80,y:r.top+250});}`);
  await mouse('mouseMoved',drop.x,drop.y);
  await evaluate(`colorVM.runtime.emitProjectChanged();colorB.Events.fireNow_();true;`);
  assert.equal(await evaluate(`paletteMenuParameter.getColour()`),'#456789');
  assert.deepEqual(await evaluate(`colorManager.colors.parameters[paletteMenuParameter.id]`),await evaluate(`paletteOriginalCache`));
  await capture('native-menu-duplicate-drag-colors');
  await mouse('mousePressed',drop.x,drop.y);
  await mouse('mouseReleased',drop.x,drop.y);
  await until(`!colorManager.parameterDrag&&paletteMenuParameter.getColour().toLowerCase()==='#ff6680'&&
    !colorManager.colors.parameters[paletteMenuParameter.id]`,'native menu duplicate orphan resets only after drop');
  await evaluate(`paletteMenuCopy.dispose(false);colorB.Events.fireNow_();true;`);
  console.log('Chrome: first native Duplicate menu item inherits new-ID parameter palettes throughout real dragging and updates after drop.');
  await capture('procedure-parameters');

  // Exercise exactly the ID-stripping EndBlockDrag -> VM adapter -> backpack Base64 path.
  await evaluate(`window.paletteSourceTarget=colorVM.editingTarget.id;
    colorVM.once('BLOCK_DRAG_END',blocks=>{window.paletteExport=colorVM.exportStandaloneBlocks(blocks);});
    colorVM.blockListener(new colorB.Events.EndBlockDrag(paletteDefinition,true).toJson());true;`);
  const exportId=await evaluate(`Object.keys(paletteExport.scratchGuiColors.procedures)[0]`);
  console.log('Backpack export definition:',exportId);
  assert.notEqual(exportId,definition);
  assert.deepEqual(await evaluate(`paletteExport.scratchGuiColors.procedures[${JSON.stringify(exportId)}].colors`),palette);
  await evaluate(`(async()=>{window.paletteBackpack=await saVerifyRequire('./src/lib/backpack/code-payload.js').default({
    blockObjects:paletteExport,topBlockId:paletteDefinition.id});
    window.palettePayload=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(paletteBackpack.body),c=>c.charCodeAt(0))));
    palettePayload.scratchGuiColors.procedures[${JSON.stringify(exportId)}].color='#112233';
    window.paletteGlobalBefore=JSON.parse(JSON.stringify(colorManager.getEntry('variables',${JSON.stringify(variable)})));
    palettePayload.scratchGuiColors.variables[${JSON.stringify(variable)}].color='#101010';
    await colorVM.addSprite(JSON.stringify({name:'Backpack color destination',isStage:false,variables:{},lists:{},
      blocks:{},comments:{},costumes:[],sounds:[],currentCostume:0,x:0,y:0,size:100,direction:90,visible:true,
      draggable:false,rotationStyle:'all around'}));return true;})()`);
  await until(`colorVM.editingTarget.id!==paletteSourceTarget`,'empty backpack destination sprite');
  await evaluate(`window.paletteDestination=colorVM.editingTarget.id;
    window.paletteBodyUrl=URL.createObjectURL(new Blob([JSON.stringify(palettePayload)],{type:'application/json'}));
    colorComponent('[class*=blocks_blocks_]','handleDrop').handleDrop({payload:{bodyUrl:paletteBodyUrl},currentOffset:{x:400,y:200}});true;`);
  await until(`colorWS.getAllBlocks().some(b=>b.type==='procedures_definition'&&b.getColour()==='#112233')`,
    'backpack drop rendered with metadata color');
  await evaluate(`window.paletteImported=colorWS.getAllBlocks().find(b=>b.type==='procedures_definition');true;`);
  assert.deepEqual(await evaluate(`colorManager.getEntry('procedures',paletteImported.id).colors`),palette);
  assert.deepEqual(await evaluate(`colorManager.getEntry('variables',${JSON.stringify(variable)})`),
    await evaluate(`paletteGlobalBefore`),'backpack metadata preserves the existing global palette');
  assert.ok(await evaluate(`paletteImported.getDescendants().filter(b=>b.type.startsWith('argument_reporter')).every(b=>b.getColour()==='#112233')`),
    'backpack imported reporters inherit the metadata primary color');
  // A same-signature second drop must keep the destination's complete palette, even with valid conflicting metadata.
  await evaluate(`colorManager.set('procedures',paletteImported.id,'#998877',{secondary:'#223344',tertiary:'#334455',
    quaternary:'#445566',text:'#556677'});
    colorComponent('[class*=blocks_blocks_]','handleDrop').handleDrop({payload:{bodyUrl:paletteBodyUrl},currentOffset:{x:500,y:300}});true;`);
  await until(`colorWS.getAllBlocks().filter(b=>b.type==='procedures_definition').length===2`,'second same-name backpack drop');
  assert.ok(await evaluate(`colorWS.getAllBlocks().filter(b=>b.type==='procedures_definition').every(b=>
    b.getColour()==='#998877'&&b.getColourTertiary()==='#334455'&&
    colorManager.getEntry('procedures',b.id).colors.text==='#556677')`),
    'second same-signature backpack import retains destination palettes');
  assert.deepEqual(await evaluate(`colorManager.getEntry('variables',${JSON.stringify(variable)})`),
    await evaluate(`paletteGlobalBefore`),'repeated backpack imports preserve the existing global palette');
  const beforeRefresh=await evaluate(`JSON.stringify(colorManager.colors)`);
  await evaluate(`colorVM.refreshWorkspace();colorVM.refreshWorkspace();colorB.Events.fireNow_();true;`);
  await pause(100);
  assert.equal(await evaluate(`JSON.stringify(colorManager.colors)`),beforeRefresh,
    'rebuilding the same workspace preserves all ID-keyed palettes');
  // Comment-only transfer still works; valid metadata continues to override the exported comment above.
  await evaluate(`(async()=>{delete palettePayload.scratchGuiColors;
    await colorVM.addSprite(JSON.stringify({name:'Comment fallback destination',isStage:false,variables:{},lists:{},
      blocks:{},comments:{},costumes:[],sounds:[],currentCostume:0,x:0,y:0,size:100,direction:90,visible:true,
      draggable:false,rotationStyle:'all around'}));
    await colorVM.shareBlocksToTarget(palettePayload,colorVM.editingTarget.id);colorVM.refreshWorkspace();return true;})()`);
  await until(`colorWS.getAllBlocks().some(b=>b.type==='procedures_definition'&&b.getColour()==='#456789')`,'backpack comment fallback');
  await capture('backpack-procedure-colors');
  // .sprite3 carries all channels and remaps block IDs on repeated import.
  await evaluate(`(async()=>{window.paletteSprite=colorVM.toJSON(colorVM.editingTarget.id);
    await colorVM.addSprite(paletteSprite);colorVM.refreshWorkspace();return true;})()`);
  await until(`colorWS.getAllBlocks().some(b=>b.type==='procedures_definition'&&b.getColour()==='#456789')`,'sprite3 palette imported');
  assert.ok(await evaluate(`colorWS.getAllBlocks().filter(b=>b.type==='procedures_definition').every(b=>
    colorManager.getEntry('procedures',b.id).colors.text==='#aabbcc')`),
    'sprite import retains text color');
  await evaluate(`URL.revokeObjectURL(paletteBodyUrl);colorVM.setEditingTarget(paletteSourceTarget);true;`);
  await until(`!!colorWS.getBlockById(${JSON.stringify(definition)})`,'return to original definition');
  await pause(150);
  console.log('Chrome: native palette/text controls, preview/cancel, recursive reporters/orphans, live dropdowns and input borders passed.');
  console.log('Chrome: real backpack drag/drop ID remapping, metadata precedence, same-name destination priority, comment fallback and sprite3 palettes passed.');
};
