import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = createRequire(require.resolve('scratch-vm/src/virtual-machine.js'))('@turbowarp/jszip');

export default async ({evaluate}, definition) => {
    const before = await evaluate(`JSON.stringify(colorManager.colors)`);
    const saved = await evaluate(`JSON.parse(colorVM.toJSON())`);
    const blocks = Object.assign({}, ...saved.targets.map(target => target.blocks));
    const colors = saved.scratchGuiColors;
    const savedDefinition = Object.keys(colors.procedures).find(id => colors.procedures[id].color === '#456789');
    assert.ok(savedDefinition);
    assert.notEqual(savedDefinition, definition, 'saved custom block uses a native short ID');
    for (const id of Object.keys(colors.procedures)) assert.equal(blocks[id].opcode, 'procedures_definition');
    for (const [id, parameter] of Object.entries(colors.parameters)) {
        assert.ok(blocks[id].opcode.startsWith('argument_reporter'));
        assert.equal(blocks[parameter.definitionId].opcode, 'procedures_definition');
    }
    assert.equal(await evaluate(`JSON.stringify(colorManager.colors)`), before, 'saving preserves runtime cache IDs');
    assert.deepEqual(await evaluate(`saVerifyRequire('./src/lib/project-color-transfer.js').readTransferColors(
        {targets:JSON.parse(colorVM.toJSON()).targets})`),
    Object.fromEntries(Object.entries(colors).filter(([key]) => key !== 'version')),
    'saved comment fallback matches metadata short IDs');
    const bytes = await evaluate(`(async()=>{
        const blob=await colorVM.saveProjectSb3();
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
    })()`);
    const archive = await JSZip.loadAsync(Uint8Array.from(bytes));
    const archived = JSON.parse(await archive.file('project.json').async('string'));
    assert.deepEqual(archived, saved, 'the real sb3 archive writes the corrected project.json');

    await evaluate(`(async()=>{window.serializationVM=new colorVM.constructor();
        serializationVM.attachStorage(colorVM.runtime.storage);
        window.serializationColors=saVerifyRequire('./src/lib/project-block-colors.js').default(serializationVM);
        await serializationVM.loadProject(${JSON.stringify(JSON.stringify(saved))});return true;})()`);
    assert.deepEqual(await evaluate(`serializationColors.getEntry('procedures',${JSON.stringify(savedDefinition)})`),
        colors.procedures[savedDefinition], 'native project load finds the saved definition palette');
    assert.ok(await evaluate(`Object.values(serializationColors.colors.parameters).every(entry=>
        !!serializationColors.colors.procedures[entry.definitionId])`));
    const conflicting = structuredClone(saved);
    conflicting.scratchGuiColors.procedures[savedDefinition].color = '#102030';
    await evaluate(`(async()=>{await serializationVM.loadProject(${JSON.stringify(JSON.stringify(conflicting))});return true;})()`);
    assert.equal(await evaluate(`serializationColors.get('procedures',${JSON.stringify(savedDefinition)})`), '#102030');
    delete conflicting.scratchGuiColors;
    await evaluate(`(async()=>{await serializationVM.loadProject(${JSON.stringify(JSON.stringify(conflicting))});return true;})()`);
    assert.equal(await evaluate(`serializationColors.get('procedures',${JSON.stringify(savedDefinition)})`), '#456789',
        'comment-only project round trip retains the palette');
    await evaluate(`serializationVM.quit();true;`);
    console.log('Chrome: project.json and actual sb3 archive short IDs, native reload, metadata priority, comment fallback and unchanged runtime IDs passed.');
};
