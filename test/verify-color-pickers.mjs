import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import verifyProjectBlockColors from './verify-project-block-colors.mjs';

// Run after pnpm run build. Uses an installed Chrome, with no browser download.
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'scratch-picker-verification-'));
const chromeBinary = process.env.CHROME_BINARY || (process.platform === 'win32' ?
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome');
assert.ok(fs.existsSync(chromeBinary), 'Install Chrome or set CHROME_BINARY to its executable path');
const build = path.join(workspace, 'scratch-gui', 'build');
const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2'};
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = path.resolve(build, `.${decodeURIComponent(url.pathname === '/' ? '/editor.html' : url.pathname)}`);
  if (!file.startsWith(build + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(chromeBinary, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--remote-debugging-port=0', `--user-data-dir=${path.join(temporary, 'chrome')}`, 'about:blank'
], {windowsHide: true, stdio: 'ignore'});
let socket;
let commands;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const port=fs.readFileSync(path.join(temporary,'chrome','DevToolsActivePort'),'utf8').split('\n')[0];
      page=(await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)})).json())
        .find(tab=>tab.type==='page');
    }
    catch {}
    if (page) break;
    await pause(200);
  }
  assert.ok(page, 'Chrome started');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  const dialogs = [];
  socket.onmessage = event => {
    const result = JSON.parse(event.data);
    if (!result.id) {
      if (result.method === 'Page.javascriptDialogOpening') {
        dialogs.push(result.params.message);
        commands('Page.handleJavaScriptDialog', {accept: false}).catch(() => {});
      }
      if (result.method === 'Runtime.exceptionThrown') console.log('Browser exception:', result.params.exceptionDetails.exception?.description?.split('\n')[0]);
      if (result.method === 'Runtime.consoleAPICalled' && result.params.type === 'error') {
        console.log('Browser error:', result.params.args.map(arg => String(arg.value ?? arg.description).split('\n')[0]));
      }
      return;
    }
    const callbacks = pending.get(result.id);
    pending.delete(result.id);
    if (!callbacks) return;
    if (result.error) callbacks.reject(new Error(JSON.stringify(result.error)));
    else callbacks.resolve(result.result);
  };
  commands = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Browser command timed out: ${method}`));
    }, 30000);
    pending.set(id, {
      resolve: result => {clearTimeout(timeout); resolve(result);},
      reject: error => {clearTimeout(timeout); reject(error);}
    });
    socket.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const result = await commands('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression, label) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(expression)) return;
      await pause(250);
    }
    throw new Error(`Timed out: ${label}`);
  };
  await commands('Page.enable');
  await commands('Runtime.enable');
  await commands('Emulation.setDeviceMetricsOverride', {width: 1100, height: 900, deviceScaleFactor: 1, mobile: false});
  await commands('Page.addScriptToEvaluateOnNewDocument', {source:
    `localStorage.setItem('tw:addons', JSON.stringify({_:5,'2d-color-picker':{enabled:true},'better-color-picker':{enabled:true},'color-picker':{enabled:true},'swap-local-global':{enabled:true}}));`});
  await commands('Page.navigate', {url: `${origin}/editor.html`});
  await until('!!window.GUI && !!window.webpackJsonpGUI', 'webpack runtime');
  await evaluate(`window.webpackJsonpGUI.push([['sa-verification'], {'sa-verification': function(module,exports,require){window.saVerifyRequire=require;}}, [['sa-verification']]]);
    window.saVerifyHooks=saVerifyRequire('./src/addons/hooks.js').default; true;`);
  await until('!!saVerifyHooks.blocklyWorkspace', 'Blockly workspace');
  await pause(1000);
  await evaluate(`window.saVerifyBlockly=saVerifyHooks.blockly;
    const xml=saVerifyBlockly.Xml.textToDom('<xml><block type="sensing_touchingcolor" x="100" y="100"><value name="COLOR"><shadow type="colour_picker"><field name="COLOUR">#408080</field></shadow></value></block></xml>');
    saVerifyBlockly.Xml.domToWorkspace(xml,saVerifyHooks.blocklyWorkspace);
    window.saVerifyField=saVerifyHooks.blocklyWorkspace.getAllBlocks().find(block=>block.type==='colour_picker').getField('COLOUR');
    saVerifyField.showEditor_(); true;`);
  await until('!!document.querySelector(".blocklyDropDownDiv .sa-2dcolor-picker")', 'block 2D picker');
  await pause(400); // Wait for Blockly's popup entrance animation.
  const dimensions = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()`);
  const radius = selector => evaluate(`(()=>{const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return [s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius];})()`);
  let pressed = false;
  const mouse = (type, x, y, modifiers = 0) => {
    if (type === 'mousePressed') pressed = true;
    if (type === 'mouseReleased') pressed = false;
    return commands('Input.dispatchMouseEvent', {
    type, x, y, modifiers, button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: pressed ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1
  }); }; 
  const capture = async name => {
    const {data} = await commands('Page.captureScreenshot', {format: 'png'});
    fs.writeFileSync(path.join(temporary, `${name}.png`), Buffer.from(data, 'base64'));
    if (process.env.PICKER_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.PICKER_SCREENSHOT_DIR,{recursive:true});
      fs.writeFileSync(path.join(process.env.PICKER_SCREENSHOT_DIR,`${name}.png`),Buffer.from(data,'base64'));
    }
  };
  assert.deepEqual(await radius('.blocklyDropDownDiv .sa-2dcolor-picker'), ['0px','0px','0px','0px']);
  assert.equal(await evaluate('document.querySelectorAll(".blocklyDropDownDiv .sa-color-picker-readout").length'), 3);
  const track = await dimensions('.blocklyDropDownDiv .goog-slider-horizontal');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".blocklyDropDownDiv .goog-slider-horizontal")).cursor'), 'ew-resize');
  await mouse('mousePressed', track.left + 13 + .637 * (track.width - 26), track.top + 10, 2);
  assert.equal(await evaluate('saVerifyField.hue_/3.6'), 65);
  await mouse('mouseMoved', track.left + 13 + .74 * (track.width - 26), track.top + 10, 2);
  assert.equal(await evaluate('saVerifyField.hue_/3.6'), 75);
  await mouse('mouseReleased', track.left + 13 + .74 * (track.width - 26), track.top + 10, 2);
  const shade = await dimensions('.blocklyDropDownDiv .sa-2dcolor-picker');
  await mouse('mousePressed', shade.left + .793 * shade.width, shade.top + .493 * shade.height, 2);
  assert.deepEqual(await evaluate('[saVerifyField.saturation_*100,saVerifyField.brightness_/255*100]'), [80,50]);
  await mouse('mouseMoved', shade.left + .9 * shade.width, shade.top + shade.height, 2);
  await mouse('mouseReleased', shade.left + .9 * shade.width, shade.top + shade.height, 2);
  assert.deepEqual(await evaluate('[saVerifyField.getValue(),saVerifyField.hue_/3.6,saVerifyField.saturation_*100]'), ['#000000',75,90]);
  await mouse('mouseMoved', shade.left + .99 * shade.width, shade.top + .99 * shade.height, 8);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".blocklyDropDownDiv .sa-2dcolor-picker")).cursor'), 'ew-resize');
  await mouse('mouseMoved', shade.left + .9 * shade.width, shade.top + .5 * shade.height, 8);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".blocklyDropDownDiv .sa-2dcolor-picker")).cursor'), 'ns-resize');
  await evaluate(`const inputs=document.querySelectorAll('.blocklyDropDownDiv .sa-color-picker-readout');
    inputs[1].value='63.275'; inputs[1].dispatchEvent(new Event('change',{bubbles:true}));
    inputs[2].value='80.5'; inputs[2].dispatchEvent(new Event('change',{bubbles:true})); true;`);
  assert.ok(Math.abs(await evaluate('saVerifyField.saturation_*100') - 63.275) < 1e-8);
  assert.equal(await evaluate('document.querySelector(".sa-color-picker-code-text").value'), await evaluate('saVerifyField.getValue()'));
  assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".sa-code-color-picker-handle")).backgroundColor'), 'rgb(255, 255, 255)');
  const blockLayout = await evaluate(`(()=>{
    const input=document.querySelector('.blocklyDropDownDiv .sa-color-picker-readout');
    const label=input.parentElement.querySelector('.scratchColourPickerLabelText');
    const r=input.getBoundingClientRect(), l=label.getBoundingClientRect();
    const a=document.querySelector('.blocklyDropDownDiv .sa-2dcolor-picker').getBoundingClientRect();
    const p=document.querySelector('.blocklyDropDownDiv').getBoundingClientRect();
    return {width:r.width,height:r.height,gap:r.left-l.right,left:a.left-p.left,right:p.right-a.right};
  })()`);
  assert.equal(blockLayout.width,40); assert.equal(blockLayout.height,20);
  assert.ok(blockLayout.gap>=5 && blockLayout.gap<=8,JSON.stringify(blockLayout));
  assert.ok(blockLayout.left>=17 && blockLayout.right>=17,JSON.stringify(blockLayout));
  const wheel=async (bounds, deltaX, deltaY, modifiers=0)=>{
    bounds=await dimensions(bounds===track ? '.blocklyDropDownDiv .goog-slider-horizontal' :
      bounds===shade ? '.blocklyDropDownDiv .sa-2dcolor-picker' :
      bounds===paintTrack ? '.Popover-body [class*=slider_container_]' : '.Popover-body .sa-2dcolor-picker');
    await commands('Input.dispatchMouseEvent',{type:'mouseWheel',x:bounds.left+bounds.width/2,
      y:bounds.top+10,deltaX,deltaY,modifiers});
    await pause(150);
  };
  await wheel(track,-100,0,2);
  assert.equal(await evaluate('saVerifyField.hue_/3.6'),80);
  await wheel(track,0,-100,2);
  assert.equal(await evaluate('saVerifyField.hue_/3.6'),85);
  await wheel(shade,100,-100,2);
  assert.deepEqual(await evaluate('[saVerifyField.saturation_*100,saVerifyField.brightness_/255*100]'),[65,85]);
  await evaluate(`window.saVerifySettings=saVerifyRequire('./src/addons/settings-store-singleton.js').default;
    window.saVerifySet=(key,value)=>{const next=JSON.parse(JSON.stringify(saVerifySettings.store));
      next['better-color-picker'][key]=value; saVerifySettings.setStore(next);};
    saVerifySet('color-handle',false); true;`);
  assert.equal(await evaluate('document.querySelector(".sa-code-color-picker-handle").style.getPropertyValue("--sa-better-color-picker-handle-color")'),'');
  await evaluate(`saVerifySet('color-handle',true); true;`);
  assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".sa-code-color-picker-handle")).backgroundColor'),'rgb(255, 255, 255)');
  await evaluate(`saVerifySet('enabled',false); true;`);
  const toggleTrack=await dimensions('.blocklyDropDownDiv .goog-slider-horizontal');
  await mouse('mousePressed',toggleTrack.left+13+.637*(toggleTrack.width-26),toggleTrack.top+10,2);
  assert.ok(Math.abs(await evaluate('saVerifyField.hue_/3.6')-63.7)<.01);
  await mouse('mouseReleased',toggleTrack.left+13+.637*(toggleTrack.width-26),toggleTrack.top+10,2);
  await evaluate(`saVerifySet('enabled',true); true;`);
  await mouse('mousePressed',toggleTrack.left+13+.24*(toggleTrack.width-26),toggleTrack.top+10,2);
  assert.equal(await evaluate('saVerifyField.hue_/3.6'),25);
  await mouse('mouseReleased',toggleTrack.left+13+.24*(toggleTrack.width-26),toggleTrack.top+10,2);
  await capture('block-picker');
  console.log('Chrome: block inputs/layout, Ctrl, both wheel axes, Shift, black HSV, hex sync, and dynamic handle colors passed.');
  await evaluate(`saVerifyBlockly.DropDownDiv.hideWithoutAnimation(); document.querySelectorAll('[role="tab"]')[1].click(); true;`);
  await until('!!document.querySelector("[class*=color-button_color-button]")', 'paint color button');
  await evaluate(`document.querySelector('[class*=color-button_color-button]').click(); true;`);
  await until('!!document.querySelector(".Popover-body [data-sa-color-picker] .sa-2dcolor-picker")', 'paint picker');
  await pause(400);
  await evaluate(`const root=document.querySelector('.Popover-body [data-sa-color-picker]');
    let fiber=root[Object.keys(root).find(key=>key.startsWith('__reactInternalInstance$'))];
    while(fiber && !fiber.stateNode?.handleShadeChange)fiber=fiber.return;
    window.saVerifyPaint=fiber.stateNode; true;`);
  assert.equal(await evaluate('saVerifyPaint.state.betterColorPicker'), true);
  assert.deepEqual(await radius('.Popover-body .sa-2dcolor-picker'), ['0px','0px','0px','0px']);
  await evaluate('saVerifyPaint.handleHueChange(25); true;');
  const paintTrack = await dimensions('.Popover-body [class*=slider_container_]');
  await mouse('mousePressed', paintTrack.left + 13 + .637 * (paintTrack.width - 26), paintTrack.top + 10, 2);
  assert.equal(await evaluate('saVerifyPaint.state.hue'), 65);
  await mouse('mouseReleased', paintTrack.left + 13 + .637 * (paintTrack.width - 26), paintTrack.top + 10, 2);
  const paintShade = await dimensions('.Popover-body .sa-2dcolor-picker');
  await mouse('mousePressed', paintShade.left + .793 * paintShade.width, paintShade.top + .493 * paintShade.height, 2);
  assert.deepEqual(await evaluate('[saVerifyPaint.state.saturation,saVerifyPaint.state.brightness]'), [80,50]);
  await mouse('mouseReleased', paintShade.left + .793 * paintShade.width, paintShade.top + .493 * paintShade.height, 2);
  await wheel(paintTrack,-100,0,2);
  assert.equal(await evaluate('saVerifyPaint.state.hue'),70);
  await wheel(paintTrack,0,-100,2);
  assert.equal(await evaluate('saVerifyPaint.state.hue'),75);
  await wheel(paintShade,100,-100,2);
  assert.deepEqual(await evaluate('[saVerifyPaint.state.saturation,saVerifyPaint.state.brightness]'),[85,55]);
  const paintLayout=await evaluate(`(()=>{
    const input=document.querySelector('.Popover-body .sa-2dcolor-label input');
    const r=input.getBoundingClientRect();
    const a=document.querySelector('.Popover-body .sa-2dcolor-picker').getBoundingClientRect();
    const p=document.querySelector('.Popover-body').getBoundingClientRect();
    return {width:r.width,height:r.height,left:a.left-p.left,right:p.right-a.right};
  })()`);
  assert.equal(paintLayout.width,40); assert.equal(paintLayout.height,20);
  assert.ok(paintLayout.left>=17 && paintLayout.right>=17,JSON.stringify(paintLayout));
  await capture('paint-picker');
  console.log('Chrome: paint inputs/layout, native config, Ctrl, and both wheel axes passed.');
  await verifyProjectBlockColors({evaluate, commands, until, pause, dimensions, mouse, capture});
  assert.deepEqual(dialogs, [], 'editor actions do not open unexpected JavaScript alerts');
} finally {
  if (commands) { try { await commands('Browser.close'); } catch {} }
  socket?.close();
  if (chrome.exitCode === null) {
    const stopped=new Promise(resolve=>chrome.once('exit',resolve));
    chrome.kill();
    await Promise.race([stopped,pause(3000)]);
  }
  server.close();
  fs.rmSync(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
