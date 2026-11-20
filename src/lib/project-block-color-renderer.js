import {colorPalette, readColorComment, isProcedureParameter} from './project-block-colors';

const textDefaults = new WeakMap();
const appliedPalettes = new WeakMap();
const dropdowns = new WeakSet();
const renderers = new WeakMap();
const dragHooks = new WeakSet();
const copiedXml = new WeakMap();
const updateOpenMenu = (block, Blockly) => {
    const palette = appliedPalettes.get(block);
    if (!palette) return;
    const parent = block.isShadow() && block.getParent();
    Blockly.DropDownDiv.setColour(parent ? parent.getColour() : block.getColour(), block.getColourTertiary());
    for (const item of Blockly.DropDownDiv.getContentDiv().querySelectorAll('.goog-menuitem')) {
        item.style.color = palette.text;
    }
};
const updateTextColour = (block, color) => {
    for (const input of block.inputList || []) {
        for (const field of input.fieldRow) {
            const text = field.textElement_;
            if (!text) continue;
            if (color) {
                if (!textDefaults.has(text)) {
                    textDefaults.set(text, [text.style.getPropertyValue('fill'),
                        text.style.getPropertyPriority('fill')]);
                }
                text.style.setProperty('fill', color, 'important');
            } else if (textDefaults.has(text)) {
                text.style.setProperty('fill', ...textDefaults.get(text));
                textDefaults.delete(text);
            }
        }
    }
};

// Blockly's updateColour leaves existing field rectangles and child shadows unchanged.
// Refresh them explicitly, preserving the native white fill of numeric/text shadows.
export const refreshBlockColour = (block, Blockly) => {
    if (block.rendered) block.updateColour();
    for (const input of block.inputList || []) {
        for (const field of input.fieldRow) {
            const dropdown = Blockly.FieldDropdown && field instanceof Blockly.FieldDropdown;
            if (dropdown && !dropdowns.has(field)) {
                const showEditor = field.showEditor_;
                field.showEditor_ = function (...args) {
                    const result = showEditor.apply(this, args);
                    if (Blockly.DropDownDiv.owner_ === this) updateOpenMenu(block, Blockly);
                    return result;
                };
                dropdowns.add(field);
            }
            if (field.box_) {
                if (dropdown) {
                    field.box_.setAttribute('fill', field.dropDownOpen_ ?
                        block.getColourQuaternary() : block.getColour());
                    field.box_.setAttribute('stroke', block.getColourTertiary());
                } else if (Blockly.FieldTextInput && field instanceof Blockly.FieldTextInput) {
                    field.box_.setAttribute('fill', block.getColourTertiary());
                }
            }
            if (dropdown && Blockly.DropDownDiv.owner_ === field) {
                const parent = block.isShadow() && block.getParent();
                Blockly.DropDownDiv.setColour(parent ? parent.getColour() : block.getColour(),
                    block.getColourTertiary());
                updateOpenMenu(block, Blockly);
            }
        }
        const child = input.connection && input.connection.targetBlock();
        if (child && child.isShadow() && child.rendered) child.updateColour();
    }
};

const applyPalette = (block, palette, Blockly) => {
    appliedPalettes.set(block, palette);
    const values = [palette.primary, palette.secondary, palette.tertiary, palette.quaternary];
    const current = [block.getColour(), block.getColourSecondary(), block.getColourTertiary(),
        block.getColourQuaternary()];
    if (values.some((value, i) => value !== current[i])) block.setColour(...values);
    refreshBlockColour(block, Blockly);
    updateTextColour(block, palette.text);
};

export const applyBlockPalette = (block, entry, Blockly) => {
    applyPalette(block, colorPalette(entry.color, entry.colors), Blockly);
};

const enclosingDefinition = block => {
    const visited = new Set();
    while (block && !visited.has(block)) {
        if (block.type === 'procedures_definition') return block;
        visited.add(block);
        block = block.getParent && block.getParent();
    }
    return null;
};

// Keep native palettes and shadow behavior, including restoration of orphan parameters.
export default class ProjectBlockColorRenderer {
    constructor (manager, Blockly, workspace) {
        this.manager = manager;
        this.Blockly = Blockly;
        this.workspace = workspace;
        this.defaults = new WeakMap();
        this.copiedParameters = new Map();
        renderers.set(workspace, this);
        this.installDragHooks();
        this.resetInventory();
        this.update = this.update.bind(this);
        this.unsubscribe = manager.subscribe(this.update);
        this.onChange = event => {
            const inventory = manager.inventory();
            const added = Object.keys(inventory).some(kind =>
                [...inventory[kind]].some(id => !this.known[kind].has(id)));
            if (added && (event.type === 'var_create' || event.type === 'create')) manager.refresh(true);
            else manager.refresh();
            this.known = inventory;
            this.update();
        };
        workspace.addChangeListener(this.onChange);
        workspace.getFlyout().getWorkspace()
            .addChangeListener(this.update);
        this.update();
    }
    resetInventory () {
        this.known = this.manager.inventory();
    }
    installDragHooks () {
        const Blockly = this.Blockly;
        if (!Blockly.BlockDragger) return;
        if (!dragHooks.has(Blockly)) {
            const start = Blockly.BlockDragger.prototype.startBlockDrag;
            const end = Blockly.BlockDragger.prototype.endBlockDrag;
            const blockToDom = Blockly.Xml.blockToDom;
            const domToBlock = Blockly.Xml.domToBlock;
            // Native right-click duplication and argument duplication bypass pasteBlock_.
            // Snapshot XML nodes before IDs change, then map them through input connections.
            Blockly.Xml.blockToDom = function (block, ...args) {
                const xml = blockToDom.call(this, block, ...args);
                const renderer = renderers.get(block.workspace);
                if (renderer) copiedXml.set(xml, renderer.captureCopiedParameters(xml));
                return xml;
            };
            Blockly.Xml.domToBlock = function (xml, workspace, ...args) {
                const renderer = renderers.get(workspace);
                const entries = renderer && (copiedXml.get(xml) || renderer.captureCopiedParameters(xml));
                const block = domToBlock.call(this, xml, workspace, ...args);
                if (renderer) renderer.inheritCopiedParameters(xml, block, entries);
                return block;
            };
            Blockly.BlockDragger.prototype.startBlockDrag = function (...args) {
                const renderer = renderers.get(this.workspace_);
                if (renderer) {
                    const entries = new Map();
                    for (const block of this.draggingBlock_.getDescendants()) {
                        const entry = renderer.copiedParameters.get(block.id) ||
                            renderer.manager.getEntry('parameters', block.id);
                        if (entry) entries.set(block.id, entry);
                    }
                    renderer.manager.beginParameterDrag(entries);
                }
                return start.apply(this, args);
            };
            Blockly.BlockDragger.prototype.endBlockDrag = function (...args) {
                const renderer = renderers.get(this.workspace_);
                try {
                    return end.apply(this, args);
                } finally {
                    if (renderer) {
                        Blockly.Events.fireNow_();
                        renderer.copiedParameters.clear();
                        renderer.manager.endParameterDrag();
                        renderer.update();
                    }
                }
            };
            dragHooks.add(Blockly);
        }
    }
    captureCopiedParameters (xml) {
        const entries = new Map();
        for (const node of [xml, ...xml.querySelectorAll('block, shadow')]) {
            const id = node.getAttribute('id');
            const entry = this.copiedParameters.get(id) || this.manager.getEntry('parameters', id);
            if (entry) entries.set(node, {id, entry: JSON.parse(JSON.stringify(entry))});
        }
        return entries;
    }
    inheritCopiedParameters (xml, root, entries) {
        const copiedIds = [];
        const visit = (node, block) => {
            if (!block) return;
            const source = entries.get(node);
            if (source && source.id !== block.id) {
                this.copiedParameters.set(block.id, source.entry);
                copiedIds.push(block.id);
                this.defaults.set(block, [block.getColour(), block.getColourSecondary(),
                    block.getColourTertiary(), block.getColourQuaternary()]);
                applyPalette(block, {primary: source.entry.color, ...source.entry.colors}, this.Blockly);
            }
            for (const input of node.children) {
                const children = Array.from(input.children);
                const child = children.find(item => item.tagName.toLowerCase() === 'block') ||
                    children.find(item => item.tagName.toLowerCase() === 'shadow');
                if (!child) continue;
                const connected = input.tagName.toLowerCase() === 'next' ? block.getNextBlock() :
                    block.getInputTargetBlock(input.getAttribute('name'));
                visit(child, connected);
            }
        };
        visit(xml, root);
        if (!copiedIds.length) return;
        // A plain paste has no drag. Let its create event settle before restoring
        // orphan defaults; native duplicate-and-drag freezes the cache synchronously.
        setTimeout(() => {
            if (!this.manager.parameterDrag) {
                for (const id of copiedIds) this.copiedParameters.delete(id);
                this.update();
            }
        });
    }
    update () {
        const target = this.manager.vm.editingTarget;
        const workspaces = [this.workspace, this.workspace.getFlyout().getWorkspace()];
        for (const workspace of workspaces) {
            for (const block of workspace.getAllBlocks()) {
                let entry;
                const variable = block.getField('VARIABLE');
                const list = block.getField('LIST');
                if (variable && block.type.startsWith('data_')) {
                    entry = this.manager.getEntry('variables', variable.getValue());
                }
                if (list && block.type.startsWith('data_')) entry = this.manager.getEntry('lists', list.getValue());
                if (block.type === 'procedures_definition') entry = this.manager.getEntry('procedures', block.id);
                if (block.type === 'procedures_prototype' || block.type === 'procedures_call') {
                    entry = this.manager.getEntry('procedures', this.manager.definitionId(target, block.getProcCode()));
                }
                if (isProcedureParameter(block.type)) {
                    // Connection changes during dragging must not change either the
                    // rendered palette or its cache. endBlockDrag flushes and refreshes once.
                    if (this.manager.parameterDrag || this.copiedParameters.has(block.id)) continue;
                    const definition = enclosingDefinition(block);
                    entry = definition && this.manager.getEntry('procedures', definition.id);
                }
                const original = this.defaults.get(block);
                if (entry) {
                    if (!original) {
                        this.defaults.set(block, [block.getColour(), block.getColourSecondary(),
                            block.getColourTertiary(), block.getColourQuaternary()]);
                    }
                    applyBlockPalette(block, entry, this.Blockly);
                } else if (original) {
                    appliedPalettes.delete(block);
                    block.setColour(...original);
                    refreshBlockColour(block, this.Blockly);
                    updateTextColour(block, null);
                    this.defaults.delete(block);
                }
            }
        }
        // Keep a visible stage comment in sync without rebuilding the workspace or its undo stack.
        const stage = this.manager.vm.runtime.getTargetForStage();
        if (target !== stage) return;
        const {comment} = readColorComment(stage);
        if (!comment) return;
        const Blockly = this.Blockly;
        Blockly.Events.disable();
        try {
            let rendered = this.workspace.getCommentById(comment.id);
            if (!rendered) {
                rendered = new Blockly.WorkspaceCommentSvg(this.workspace, comment.text,
                    comment.height, comment.width, comment.minimized, comment.id);
                rendered.initSvg();
                rendered.render();
                rendered.moveBy(comment.x, comment.y);
            } else if (rendered.getText() !== comment.text) rendered.setText(comment.text);
        } finally {
            Blockly.Events.enable();
        }
    }
    dispose () {
        renderers.delete(this.workspace);
        this.unsubscribe();
        this.workspace.removeChangeListener(this.onChange);
        this.workspace.getFlyout().getWorkspace()
            .removeChangeListener(this.update);
    }
}
