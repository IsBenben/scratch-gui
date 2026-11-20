// Variable/list IDs survive saving; block IDs are shortened in exported projects.
// Keep live IDs in separate namespaces and remap only the serialized color references.
import {attachTransferColors, readTransferColors, sanitizeColors, hasColors, rekeySpriteColors, compressProjectColors}
    from './project-color-transfer';
export const COLOR_COMMENT_MARKER = ' // _twcolors_';
export const COLOR_COMMENT_HEADER = 'Colors for variables, lists, and custom blocks. ' +
    'You can move, resize, or minimize this comment. ' +
    'Delete it to restore the default colors; do not edit it by hand.';
export const DEFAULT_COLORS = {variables: '#ff8c1a', lists: '#ff661a', procedures: '#ff6680'};
const managers = new WeakMap();
const emptyColors = () => ({
    variables: Object.create(null),
    lists: Object.create(null),
    procedures: Object.create(null),
    parameters: Object.create(null)
});
export const normalizeColor = color => (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color) ?
    color.toLowerCase() : null);

export const readColorComment = stage => {
    const comment = Object.values(stage ? stage.comments : {}).find(item =>
        !item.blockId && item.text.endsWith(COLOR_COMMENT_MARKER));
    const colors = emptyColors();
    if (comment) {
        try {
            const line = comment.text.trim().split('\n')
                .pop();
            const data = JSON.parse(line.slice(0, -COLOR_COMMENT_MARKER.length));
            const sanitized = sanitizeColors(data);
            for (const kind of Object.keys(colors)) {
                for (const [id, entry] of Object.entries(sanitized[kind])) {
                    colors[kind][id] = entry;
                }
            }
        } catch (e) { /* Invalid configuration is treated as absent, never executed. */ }
    }
    return {comment, colors};
};

export const getDefinitions = target => Object.values(target.blocks._blocks).filter(block =>
    block.opcode === 'procedures_definition')
    .map(block => {
        const input = block.inputs.custom_block;
        const prototype = input && target.blocks.getBlock(input.block || input.shadow);
        return {id: block.id, code: prototype && prototype.mutation && prototype.mutation.proccode};
    });

export const colorPalette = (color, colors = {}) => {
    const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
    const darken = factor => `#${rgb.map(value => Math.round(value * factor).toString(16)
        .padStart(2, '0')).join('')}`;
    const linear = rgb.map(value => {
        value /= 255;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    const luminance = (linear[0] * 0.2126) + (linear[1] * 0.7152) + (linear[2] * 0.0722);
    return {
        primary: color,
        secondary: normalizeColor(colors.secondary) || darken(0.85),
        tertiary: normalizeColor(colors.tertiary) || darken(0.7),
        quaternary: normalizeColor(colors.quaternary) || normalizeColor(colors.tertiary) ||
            darken(0.7),
        text: normalizeColor(colors.text) || (luminance > 0.179 ? '#000000' : '#ffffff')
    };
};

const copyEntry = entry => entry && JSON.parse(JSON.stringify(entry));
export const isProcedureParameter = type => type === 'argument_reporter_string_number' ||
    type === 'argument_reporter_boolean';

// Derived data is rebuilt from connections, never trusted after imports or block moves.
export const parameterColors = (targets, procedures) => {
    const result = Object.create(null);
    for (const target of targets) {
        for (const definition of getDefinitions(target)) {
            const entry = procedures[definition.id];
            if (!entry) continue;
            const {secondary, tertiary, quaternary, text} = colorPalette(entry.color, entry.colors);
            const visited = new Set();
            const visit = id => {
                if (!id || visited.has(id)) return;
                visited.add(id);
                const block = target.blocks.getBlock(id);
                if (!block) return;
                if (isProcedureParameter(block.opcode)) {
                    result[id] = {color: entry.color,
                        colors: {secondary, tertiary, quaternary, text},
                        definitionId: definition.id};
                }
                for (const input of Object.values(block.inputs || {})) {
                    visit(input.block);
                    visit(input.shadow);
                }
                visit(block.next);
            };
            visit(definition.id);
        }
    }
    return result;
};

export class ProjectBlockColors {
    constructor (vm) {
        this.vm = vm;
        this.listeners = new Set();
        this.colors = emptyColors();
        this.updating = false;
        this.parameterDrag = false;
        vm.on('PROJECT_CHANGED', () => this.refresh());
        vm.on('PROJECT_LOADED', () => this.refresh());
        vm.on('targetsUpdate', () => this.refresh());
        this.installCopyHooks();
        this.installTransferHooks();
        this.refresh();
    }
    subscribe (listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    inventory () {
        const ids = {variables: new Set(), lists: new Set(), procedures: new Set()};
        for (const target of this.vm.runtime.targets.filter(item => item.isOriginal)) {
            for (const variable of Object.values(target.variables)) {
                if (variable.type === '') ids.variables.add(variable.id);
                if (variable.type === 'list') ids.lists.add(variable.id);
            }
            for (const definition of getDefinitions(target)) ids.procedures.add(definition.id);
        }
        return ids;
    }
    refresh (create = false) {
        if (this.updating) return;
        const stage = this.vm.runtime.getTargetForStage();
        const {comment, colors} = readColorComment(stage);
        if (comment || create) {
            const ids = this.inventory();
            for (const kind of Object.keys(DEFAULT_COLORS)) {
                for (const id of Object.keys(colors[kind])) {
                    if (!ids[kind].has(id)) delete colors[kind][id];
                }
                for (const id of ids[kind]) {
                    if (!colors[kind][id]) colors[kind][id] = {color: DEFAULT_COLORS[kind]};
                }
            }
            colors.parameters = this.parameterDrag ? copyEntry(this.colors.parameters) :
                parameterColors(this.vm.runtime.targets.filter(item => item.isOriginal), colors.procedures);
        }
        const changed = JSON.stringify(this.colors) !== JSON.stringify(colors);
        this.colors = colors;
        if (stage && (comment || create)) this.write(stage, comment);
        if (changed) for (const listener of this.listeners) listener();
    }
    write (stage, comment) {
        const text = `${COLOR_COMMENT_HEADER}\n${JSON.stringify(this.colors)}${COLOR_COMMENT_MARKER}`;
        if (comment && comment.text === text) return;
        this.updating = true;
        try {
            if (comment) comment.text = text;
            else {
                const id = `colors-${this.vm.runtime.generateUid ? this.vm.runtime.generateUid() :
                    Math.random().toString(36)
                        .slice(2)}`;
                stage.createComment(id, null, text, 50, 50, 400, 180, false);
            }
            this.vm.runtime.emitProjectChanged();
        } finally {
            this.updating = false;
        }
    }
    set (kind, id, color, colors) {
        color = normalizeColor(color);
        if (!color || !Object.prototype.hasOwnProperty.call(DEFAULT_COLORS, kind) || !id) return;
        this.refresh(true);
        if (!this.inventory()[kind].has(id)) return;
        this.colors[kind][id] = sanitizeColors({[kind]: {[id]: {color, colors}}})[kind][id];
        this.colors.parameters = parameterColors(this.vm.runtime.targets.filter(item => item.isOriginal),
            this.colors.procedures);
        const stage = this.vm.runtime.getTargetForStage();
        this.write(stage, readColorComment(stage).comment);
        for (const listener of this.listeners) listener();
    }
    get (kind, id) {
        return this.colors[kind][id] && this.colors[kind][id].color;
    }
    getEntry (kind, id) {
        return this.colors[kind][id];
    }
    beginParameterDrag (entries) {
        this.parameterDrag = true;
        for (const [id, entry] of entries) this.colors.parameters[id] = copyEntry(entry);
    }
    endParameterDrag () {
        this.parameterDrag = false;
        this.refresh();
    }
    definitionId (target, code) {
        const definition = target && getDefinitions(target).find(item => item.code === code);
        return definition && definition.id;
    }
    portableColors (target, blocks) {
        const result = emptyColors();
        const source = blocks || Object.values(target.blocks._blocks);
        const ids = new Set(Object.keys(target.variables));
        for (const block of source) {
            for (const name of ['VARIABLE', 'LIST']) {
                if (block.fields && block.fields[name]) ids.add(block.fields[name].id);
            }
        }
        for (const id of ids) {
            const variable = target.lookupVariableById ? target.lookupVariableById(id) : target.variables[id];
            if (!variable || variable.type === 'broadcast_msg') continue;
            const kind = variable.type === 'list' ? 'lists' : 'variables';
            const color = this.get(kind, id);
            if (color) result[kind][id] = {...copyEntry(this.getEntry(kind, id)), name: variable.name};
        }
        // EndBlockDrag strips IDs before the VM adapter allocates new ones. Resolve the
        // exported prototype's signature back to its definition, then key by the exported ID.
        const exportedTarget = {blocks: {_blocks: Object.fromEntries(source.map(block => [block.id, block])),
            getBlock (id) {
                return this._blocks[id];
            }}};
        for (const definition of getDefinitions(exportedTarget)) {
            const originalId = this.get('procedures', definition.id) ? definition.id :
                this.definitionId(target, definition.code);
            const entry = this.getEntry('procedures', originalId);
            if (entry) {
                result.procedures[definition.id] = {...copyEntry(entry),
                    code: definition.code};
            }
        }
        result.parameters = parameterColors([exportedTarget], result.procedures);
        return result;
    }
    applyTransfer (incoming, target, existing = new Set()) {
        const colors = sanitizeColors(incoming);
        if (!hasColors(colors)) return;
        this.refresh(true);
        const inventory = this.inventory();
        for (const kind of Object.keys(DEFAULT_COLORS)) {
            for (const [id, entry] of Object.entries(colors[kind])) {
                let actualId = id;
                let actualEntry = entry;
                if (target && kind === 'procedures') {
                    const definitions = getDefinitions(target);
                    const definition = definitions.find(item => !existing.has(item.id) && item.id === id) ||
                        definitions.find(item => !existing.has(item.id) && item.code === entry.code);
                    actualId = definition ? definition.id : id;
                    const prior = definitions.find(item => existing.has(item.id) && item.code === entry.code);
                    if (prior) actualEntry = this.getEntry(kind, prior.id) || {color: DEFAULT_COLORS.procedures};
                } else if (target && !inventory[kind].has(id)) {
                    const variable = target.lookupVariableByNameAndType &&
                        target.lookupVariableByNameAndType(entry.name, kind === 'lists' ? 'list' : '');
                    if (variable) actualId = variable.id;
                }
                if (inventory[kind].has(actualId) && !existing.has(actualId)) {
                    this.colors[kind][actualId] = {color: actualEntry.color,
                        ...(actualEntry.colors ? {colors: copyEntry(actualEntry.colors)} : {})};
                }
            }
        }
        this.colors.parameters = parameterColors(this.vm.runtime.targets.filter(item => item.isOriginal),
            this.colors.procedures);
        const stage = this.vm.runtime.getTargetForStage();
        this.write(stage, readColorComment(stage).comment);
        for (const listener of this.listeners) listener();
    }
    installTransferHooks () {
        const manager = this;
        const serialize = this.vm.toJSON;
        if (serialize) {
            this.vm.toJSON = function (targetId, options) {
                manager.refresh();
                const optimize = !targetId && (!options || options.allowOptimization !== false);
                const json = JSON.parse(serialize.call(this, targetId,
                    optimize ? {...options, allowOptimization: false} : options));
                const colors = targetId ? manager.portableColors(manager.vm.runtime.getTargetById(targetId)) :
                    manager.colors;
                const payload = attachTransferColors(json, colors);
                return JSON.stringify(optimize ? compressProjectColors(payload) : payload);
            };
        }
        const exportBlocks = this.vm.exportStandaloneBlocks;
        if (exportBlocks) {
            this.vm.exportStandaloneBlocks = function (blocks) {
                const payload = exportBlocks.call(this, blocks);
                return attachTransferColors(payload, manager.portableColors(manager.vm.editingTarget, blocks));
            };
        }
        const importSprite = this.vm._addSprite3;
        if (importSprite) {
            this.vm._addSprite3 = function (sprite, zip) {
                const prepared = rekeySpriteColors(sprite);
                const targets = new Set(manager.vm.runtime.targets);
                const existing = new Set([...manager.inventory().variables, ...manager.inventory().lists]);
                return importSprite.call(this, prepared.sprite, zip).then(result => {
                    const target = manager.vm.runtime.targets.find(item => item.isOriginal && !targets.has(item));
                    manager.applyTransfer(prepared.colors, target, existing);
                    return result;
                });
            };
        }
        const loadProject = this.vm.deserializeProject;
        if (loadProject) {
            this.vm.deserializeProject = function (project, zip) {
                const colors = readTransferColors(project);
                return loadProject.call(this, project, zip).then(result => {
                    manager.applyTransfer(colors);
                    return result;
                });
            };
        }
    }
    copyToTarget (snapshot, target, existing) {
        this.refresh(true);
        for (const definition of getDefinitions(target)) {
            if (existing.has(definition.id)) continue;
            const entry = snapshot.procedures.get(definition.code);
            if (entry) this.colors.procedures[definition.id] = copyEntry(entry);
        }
        for (const variable of Object.values(target.variables)) {
            const kind = variable.type === 'list' ? 'lists' : 'variables';
            const entry = snapshot[kind].get(variable.name);
            if (entry && !existing.has(variable.id)) this.colors[kind][variable.id] = copyEntry(entry);
        }
        this.colors.parameters = parameterColors(this.vm.runtime.targets.filter(item => item.isOriginal),
            this.colors.procedures);
        const stage = this.vm.runtime.getTargetForStage();
        this.write(stage, readColorComment(stage).comment);
        for (const listener of this.listeners) listener();
    }
    snapshot (target) {
        const colors = {variables: new Map(), lists: new Map(), procedures: new Map()};
        if (!target) return colors;
        for (const definition of getDefinitions(target)) {
            colors.procedures.set(definition.code, copyEntry(this.getEntry('procedures', definition.id)));
        }
        for (const variable of Object.values(target.variables)) {
            const kind = variable.type === 'list' ? 'lists' : 'variables';
            colors[kind].set(variable.name, copyEntry(this.getEntry(kind, variable.id)));
        }
        return colors;
    }
    installCopyHooks () {
        const manager = this;
        const share = this.vm.shareBlocksToTarget;
        if (share) {
            this.vm.shareBlocksToTarget = function (blocks, targetId, fromId) {
                const source = fromId ? manager.vm.runtime.getTargetById(fromId) : null;
                const snapshot = manager.snapshot(source);
                const transfer = readTransferColors(blocks);
                const target = manager.vm.runtime.getTargetById(targetId);
                const stage = manager.vm.runtime.getTargetForStage();
                const existing = new Set([...Object.keys(target.blocks._blocks), ...Object.keys(target.variables),
                    ...Object.keys(stage ? stage.variables : {})]);
                return share.call(this, blocks, targetId, fromId).then(result => {
                    manager.copyToTarget(snapshot, target, existing);
                    manager.applyTransfer(transfer, target, existing);
                    return result;
                });
            };
        }
        const duplicate = this.vm.duplicateSprite;
        if (duplicate) {
            this.vm.duplicateSprite = function (id) {
                const snapshot = manager.snapshot(manager.vm.runtime.getTargetById(id));
                const targets = new Set(manager.vm.runtime.targets);
                return duplicate.call(this, id).then(result => {
                    const target = manager.vm.runtime.targets.find(item => item.isOriginal && !targets.has(item));
                    if (target) manager.copyToTarget(snapshot, target, new Set());
                    return result;
                });
            };
        }
    }
}

export default vm => {
    if (!managers.has(vm)) managers.set(vm, new ProjectBlockColors(vm));
    return managers.get(vm);
};
