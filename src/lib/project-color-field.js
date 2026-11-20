// Build the modal's swatch as an actual Blockly field in an isolated workspace.
export default (Blockly, button) => {
    const workspace = new Blockly.Workspace();
    workspace.scale = 1;
    workspace.getParentSvg = () => ({parentNode: document.body});
    let block;
    Blockly.Events.disable();
    try {
        const parent = workspace.newBlock('sensing_touchingcolor');
        block = workspace.newBlock('colour_picker');
        parent.getInput('COLOR').connection.connect(block.outputConnection);
    } catch (error) {
        workspace.dispose();
        throw error;
    } finally {
        Blockly.Events.enable();
    }
    block.width = button.offsetWidth;
    block.height = button.offsetHeight;
    block.getSvgRoot = () => button;
    const field = block.getField('COLOUR');
    return {workspace, field};
};
