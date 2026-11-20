import assert from 'node:assert/strict';
import verifyProcedurePalette from './verify-procedure-palette.mjs';

export default async ({evaluate, commands, until, pause, dimensions, mouse, capture}) => {
  await evaluate(`document.querySelectorAll('[role="tab"]')[0].click();
    window.colorVM=saVerifyHooks.appStateStore.getState().scratchGui.vm;
    window.colorWS=saVerifyHooks.blocklyWorkspace;
    window.colorB=saVerifyBlockly;
    window.colorManager=saVerifyRequire('./src/lib/project-block-colors.js').default(colorVM);
    window.colorComponent=(selector,method)=>{
      const element=document.querySelector(selector);
      let fiber=element[Object.keys(element).find(key=>key.startsWith('__reactInternalInstance$'))];
      while(fiber && !fiber.stateNode?.[method]) fiber=fiber.return;
      return fiber?.stateNode;
    }; true;`);
  const prompt='[class*=prompt_body_]';
  const swatch='[data-project-color-input] button';
  const savePrompt=async()=>{
    await evaluate(`document.querySelector('[class*=prompt_ok-button_]').click(); true;`);
    await until(`!document.querySelector(${JSON.stringify(prompt)})`, 'prompt closed');
    await pause(200);
  };
  const setHex=async(color)=>{
    await evaluate(`{const input=document.querySelector('.sa-color-picker-code-text');
      input.value=${JSON.stringify(color)};input.dispatchEvent(new Event('change',{bubbles:true}));} true;`);
    await until(`colorComponent('${swatch}','handleOpen').props.color===${JSON.stringify(color)}`, 'swatch hex updated');
  };
  const openPicker=async()=>{
    await evaluate(`document.querySelector('${swatch}').click();true;`);
    await until(`!!document.querySelector('[role="dialog"] .sa-2dcolor-picker')`, 'modal native 2D picker');
    assert.equal(await evaluate(`document.querySelectorAll('[role="dialog"] .sa-color-picker-readout').length`),3);
    assert.ok(await evaluate(`!!document.querySelector('[role="dialog"] .sa-color-picker-code-text')`));
    await pause(350);
  };
  const create=async(type,name,color)=>{
    await evaluate(`colorB.Variables.createVariable(colorWS,null,${JSON.stringify(type)});true;`);
    await until(`!!document.querySelector('${swatch}')`, 'create color row');
    const scopeGap=await evaluate(`(()=>{const labels=document.querySelectorAll('[class*=prompt_options-row_] > label');
      return labels.length===2?labels[1].getBoundingClientRect().left-labels[0].getBoundingClientRect().right:null;})()`);
    if (scopeGap!==null) assert.ok(scopeGap>=40&&scopeGap<=50,'scope options have a 40–50 px gap');
    await evaluate(`document.querySelector('[class*=prompt_variable-name-text-input_]').focus();true;`);
    await commands('Input.insertText',{text:name});
    await openPicker();
    await setHex(color);
    await savePrompt();
    const id=await evaluate(`colorWS.getVariable(${JSON.stringify(name)},${JSON.stringify(type)}).getId()`);
    assert.equal(await evaluate(`colorManager.get(${JSON.stringify(type?'lists':'variables')},${JSON.stringify(id)})`),color);
    return id;
  };
  const variable=await create('', 'colored variable', '#345678');
  console.log('Chrome: variable modal native popup, 2D, numeric/hex inputs, and persistence passed.');
  // Each native variable block, including the left-hand palette and stage monitor, follows the ID.
  await evaluate(`colorWS.toolbox_.setSelectedCategoryById('variables');
    const dom=colorB.Xml.textToDom('<xml><block type="data_setvariableto"><field name="VARIABLE" id="${variable}">colored variable</field></block></xml>');
    colorB.Xml.domToWorkspace(dom,colorWS); colorB.Events.fireNow_();true;`);
  await until(`colorWS.getAllBlocks().find(b=>b.type==='data_setvariableto'&&b.getField('VARIABLE').getValue()===${JSON.stringify(variable)})?.getColour()==='#345678'`, 'workspace variable color');
  await until(`colorWS.getFlyout().getWorkspace().getAllBlocks().some(b=>b.getField('VARIABLE')?.getValue()===${JSON.stringify(variable)}&&b.getColour()==='#345678')`, 'flyout variable color');
  await until(`!!document.querySelector('[data-id="${variable}"] [class*=monitor_value_]')`, 'variable monitor');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-id="${variable}"] [class*=monitor_value_]')).backgroundColor`),'rgb(52, 86, 120)');
  await evaluate(`colorB.Variables.renameVariable(colorWS,colorWS.getVariableById(${JSON.stringify(variable)}));true;`);
  await openPicker();
  await evaluate(`const hue=document.querySelector('[role="dialog"] .sa-color-picker-readout');
    hue.value='25';hue.dispatchEvent(new Event('change',{bubbles:true}));true;`);
  const track=await dimensions('[role="dialog"] .goog-slider-horizontal');
  await mouse('mousePressed',track.left+13+.637*(track.width-26),track.top+10,2);
  await mouse('mouseReleased',track.left+13+.637*(track.width-26),track.top+10,2);
  assert.equal(await evaluate(`colorComponent('${swatch}','handleOpen').field.hue_/3.6`),65);
  await setHex('#abcdef');
  await capture('variable-color-modal');
  await savePrompt();
  assert.equal(await evaluate(`colorManager.get('variables',${JSON.stringify(variable)})`),'#abcdef');
  await until(`getComputedStyle(document.querySelector('[data-id="${variable}"] [class*=monitor_value_]')).backgroundColor==='rgb(171, 205, 239)'`, 'monitor recolored');
  assert.ok(await evaluate(`document.querySelector('.blocklyDropDownDiv').parentElement===document.body`));
  const list=await create('list', 'colored list', '#876543');
  await evaluate(`colorVM.runtime.getTargetForStage().variables[${JSON.stringify(list)}].value=['one','two'];true;`);
  await until(`!!document.querySelector('[data-id="${list}"] [class*=monitor_list-value_]')`, 'list monitor row');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-id="${list}"] [class*=monitor_list-value_]')).backgroundColor`),'rgb(135, 101, 67)');
  await evaluate(`colorB.Variables.renameVariable(colorWS,colorWS.getVariableById(${JSON.stringify(list)}));true;`);
  await openPicker(); await setHex('#fedcba'); await savePrompt();
  await until(`getComputedStyle(document.querySelector('[data-id="${list}"] [class*=monitor_list-value_]')).backgroundColor==='rgb(254, 220, 186)'`, 'list monitor row recolored');
  const variablePalette={secondary:'#234567',tertiary:'#345678',quaternary:'#456789',text:'#abcdef'};
  for (const [id,kind] of [[variable,'variables'],[list,'lists']]) {
    await evaluate(`colorB.Variables.renameVariable(colorWS,colorWS.getVariableById(${JSON.stringify(id)}));true;`);
    await until(`!!document.querySelector('[data-project-color-custom]')`,'variable/list palette checkbox');
    await evaluate(`document.querySelector('[data-project-color-custom]').click();true;`);
    await until(`document.querySelectorAll('[data-project-color-palette] button[class*=swatch_]').length===4`,'variable/list palette controls');
    for (const [index,name] of Object.keys(variablePalette).entries()) {
      await evaluate(`document.querySelectorAll('[data-project-color-palette] button[class*=swatch_]')[${index}].click();true;`);
      await evaluate(`{const input=document.querySelector('.sa-color-picker-code-text');input.value='${variablePalette[name]}';
        input.dispatchEvent(new Event('change',{bubbles:true}));}true;`);
      await until(`colorComponent('${prompt}','handleToggleColors').state.colors.${name}==='${variablePalette[name]}'`,'palette value applied');
      await evaluate(`colorB.DropDownDiv.hideWithoutAnimation();true;`);
    }
    await savePrompt();
    assert.deepEqual(await evaluate(`colorManager.getEntry('${kind}',${JSON.stringify(id)}).colors`),variablePalette);
  }
  assert.equal(await evaluate(`colorWS.getAllBlocks().find(b=>b.type==='data_setvariableto'&&b.getField('VARIABLE').getValue()===${JSON.stringify(variable)}).getColourTertiary()`),'#345678');
  await evaluate(`{const block=colorWS.newBlock('data_addtolist');block.setFieldValue(${JSON.stringify(list)},'LIST');
    block.initSvg();block.render();colorB.Events.fireNow_();}true;`);
  await until(`colorWS.getAllBlocks().some(b=>b.type==='data_addtolist'&&b.getColourTertiary()==='#345678')`,'list operation palette');
  // Open the exact flyout reporter menu used to edit variables/lists with swap-local-global enabled.
  for (const [id,kind] of [[variable,'variables'],[list,'lists']]) {
    const renamed=kind==='variables'?'edited colored variable':'edited colored list';
    await evaluate(`window.colorEditSource=colorWS.getFlyout().getWorkspace().getAllBlocks().find(b=>
      b.getField('${kind==='variables'?'VARIABLE':'LIST'}')?.getValue()===${JSON.stringify(id)});true;`);
    const source=await evaluate(`{const r=colorEditSource.svgPath_.getBoundingClientRect();({x:r.left+20,y:r.top+10});}`);
    await commands('Input.dispatchMouseEvent',{type:'mousePressed',x:source.x,y:source.y,button:'right',buttons:2,clickCount:1});
    await commands('Input.dispatchMouseEvent',{type:'mouseReleased',x:source.x,y:source.y,button:'right',buttons:0,clickCount:1});
    await until(`!!document.querySelector('.blocklyWidgetDiv .goog-menuitem')`,'real flyout context menu');
    await evaluate(`document.querySelector('.blocklyWidgetDiv .goog-menuitem').setAttribute('data-color-native-edit','');true;`);
    const menuItem=await dimensions('[data-color-native-edit]');
    await mouse('mousePressed',menuItem.left+20,menuItem.top+menuItem.height/2);
    await mouse('mouseReleased',menuItem.left+20,menuItem.top+menuItem.height/2);
    await until(`!!document.querySelector('${prompt}')`,'native menu opens edit modal');
    assert.equal(await evaluate(`colorB.WidgetDiv.isVisible()`),false,'edit modal closes the original menu');
    assert.ok(await evaluate(`!!document.querySelector('${prompt} [value="local"]')`),'scope addon inserts before palette');
    await evaluate(`document.querySelector('[class*=prompt_variable-name-text-input_]').focus();true;`);
    await commands('Input.insertText',{text:renamed});
    const ok=await dimensions('[class*=prompt_ok-button_]');
    await mouse('mousePressed',ok.left+ok.width/2,ok.top+ok.height/2);
    await mouse('mouseReleased',ok.left+ok.width/2,ok.top+ok.height/2);
    await until(`!document.querySelector('${prompt}')`,'native edit confirm closes modal');
    assert.equal(await evaluate(`colorWS.getVariableById(${JSON.stringify(id)}).name`),renamed);
    assert.deepEqual(await evaluate(`colorManager.getEntry('${kind}',${JSON.stringify(id)}).colors`),variablePalette);
  }
  console.log('Chrome: native variable/list context-menu edit closes menus, saves on real OK clicks, and preserves all palette channels.');
  // A cancelled edit must not change the comment or block colors.
  await evaluate(`colorB.Variables.renameVariable(colorWS,colorWS.getVariableById(${JSON.stringify(variable)}));true;`);
  await openPicker(); await setHex('#000000');
  await evaluate(`colorComponent('${prompt}','handleCancel').handleCancel();true;`);
  assert.equal(await evaluate(`colorManager.get('variables',${JSON.stringify(variable)})`),'#abcdef');
  console.log('Chrome: variable/list palettes, operation blocks, flyout/monitors, edit/save/cancel, scope spacing, Ctrl and popup cleanup passed.');
  await evaluate(`colorB.Procedures.createProcedureDefCallback_(colorWS);true;`);
  await until(`!!document.querySelector('[class*=custom-procedures_body_] ${swatch}')`, 'procedure color row');
  await evaluate(`colorComponent('[class*=custom-procedures_body_]','handleAddTextNumber').handleAddTextNumber();
    colorComponent('[class*=custom-procedures_body_]','handleAddBoolean').handleAddBoolean();true;`);
  await openPicker(); await setHex('#123456');
  await capture('procedure-color-modal');
  await evaluate(`document.querySelector('[class*=custom-procedures_ok-button_]').click();true;`);
  await until(`colorWS.getAllBlocks().some(b=>b.type==='procedures_definition'&&b.getColour()==='#123456')`, 'definition color');
  const definition=await evaluate(`colorWS.getAllBlocks().find(b=>b.type==='procedures_definition'&&b.getColour()==='#123456').id`);
  assert.equal(await evaluate(`colorManager.get('procedures',${JSON.stringify(definition)})`),'#123456');
  await until(`colorWS.getFlyout().getWorkspace().getAllBlocks().some(b=>b.type==='procedures_call'&&b.getColour()==='#123456')`, 'procedure flyout color');
  await evaluate(`colorB.Procedures.editProcedureCallback_(colorWS.getBlockById(${JSON.stringify(definition)}));true;`);
  await openPicker(); await setHex('#456789');
  await evaluate(`document.querySelector('[class*=custom-procedures_ok-button_]').click();true;`);
  await until(`colorWS.getBlockById(${JSON.stringify(definition)}).getColour()==='#456789'`, 'edited definition color');
  await verifyProcedurePalette({evaluate,until,pause,capture,commands,dimensions,mouse},definition,variable);
  // Duplicate a sprite: VM remaps IDs; the color follows the copied definition and local variables.
  await evaluate(`(async()=>{window.originalColorTarget=colorVM.editingTarget.id;
    await colorVM.duplicateSprite(originalColorTarget);return true;})()`);
  await until(`colorVM.editingTarget.id!==originalColorTarget`, 'duplicated sprite');
  assert.ok(await evaluate(`Object.values(colorManager.colors.procedures).filter(e=>e.color==='#456789').length>=2`));
  // Round trip the actual VM project rather than only serializing the config object.
  await evaluate(`(async()=>{window.savedColorProject=colorVM.toJSON();
    await colorVM.loadProject(savedColorProject);colorVM.refreshWorkspace();return true;})()`);
  await until(`Object.values(colorManager.colors.variables).some(e=>e.color==='#abcdef')`, 'colors after project reload');
  assert.ok(await evaluate(`Object.values(colorManager.colors.procedures).some(e=>e.color==='#456789')`));
  await evaluate(`colorVM.setEditingTarget(colorVM.runtime.getTargetForStage().id);true;`);
  await until(`colorWS.getTopComments().some(c=>c.getText().endsWith(' // _twcolors_'))`, 'visible stage color comment');
  await evaluate(`colorWS.getTopComments().find(c=>c.getText().endsWith(' // _twcolors_')).dispose();colorB.Events.fireNow_();true;`);
  assert.equal(await evaluate(`Object.keys(colorManager.colors.variables).length`),0);
  await evaluate(`colorVM.refreshWorkspace();true;`);
  await pause(300);
  assert.equal(await evaluate(`Object.keys(colorManager.colors.variables).length`),0);
  await evaluate(`colorWS.deleteVariableById(${JSON.stringify(variable)});colorB.Events.fireNow_();true;`);
  assert.equal(await evaluate(`colorManager.get('variables',${JSON.stringify(variable)})`),undefined);
  await create('', 'recreated config', '#334455');
  console.log('Chrome: procedure creation/edit/duplication, .sb3 data round trip, stage comment deletion, and config regeneration passed.');
};
