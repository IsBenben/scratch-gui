import bindAll from 'lodash.bindall';
import defaultsDeep from 'lodash.defaultsdeep';
import PropTypes from 'prop-types';
import React from 'react';
import CustomProceduresComponent from '../components/custom-procedures/custom-procedures.jsx';
import LazyScratchBlocks from '../lib/tw-lazy-scratch-blocks';
import {connect} from 'react-redux';
import {colorPalette} from '../lib/project-block-colors';
import {applyBlockPalette} from '../lib/project-block-color-renderer';

class CustomProcedures extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAddLabel',
            'handleAddBoolean',
            'handleAddTextNumber',
            'handleToggleWarp',
            'handleColorChange',
            'handleSecondaryColorChange',
            'handleResetTextColor',
            'handleToggleSecondaryColor',
            'handleCancel',
            'handleOk',
            'setBlocks'
        ]);
        this.state = {
            color: props.color,
            colors: props.colors || {},
            customSecondaryColor: Boolean(props.colors),
            rtlOffset: 0,
            warp: false
        };
        this.handlePaletteChange = Object.fromEntries(['secondary', 'tertiary', 'quaternary', 'text']
            .map(name => [name, color => this.handleSecondaryColorChange(name, color)]));
    }
    componentWillUnmount () {
        if (this.workspace) {
            this.workspace.dispose();
        }
    }
    setBlocks (blocksRef) {
        if (!blocksRef) return;
        this.blocks = blocksRef;
        const workspaceConfig = defaultsDeep({},
            CustomProcedures.defaultOptions,
            this.props.options,
            {rtl: this.props.isRtl}
        );

        const ScratchBlocks = LazyScratchBlocks.get();
        // @todo This is a hack to make there be no toolbox.
        const oldDefaultToolbox = ScratchBlocks.Blocks.defaultToolbox;
        ScratchBlocks.Blocks.defaultToolbox = null;
        this.workspace = ScratchBlocks.inject(this.blocks, workspaceConfig);
        ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;

        // Create the procedure declaration block for editing the mutation.
        this.mutationRoot = this.workspace.newBlock('procedures_declaration');
        // Make the declaration immovable, undeletable and have no context menu
        this.mutationRoot.setMovable(false);
        this.mutationRoot.setDeletable(false);
        this.mutationRoot.contextMenu = false;

        this.workspace.addChangeListener(() => {
            this.mutationRoot.onChangeFn();
            this.updatePreview();
            // Keep the block centered on the workspace
            const metrics = this.workspace.getMetrics();
            const {x, y} = this.mutationRoot.getRelativeToSurfaceXY();
            const dy = (metrics.viewHeight / 2) - (this.mutationRoot.height / 2) - y;
            let dx;
            if (this.props.isRtl) {
                // // TODO: https://github.com/LLK/scratch-gui/issues/2838
                // This is temporary until we can figure out what's going on width
                // block positioning on the workspace for RTL.
                // Workspace is always origin top-left, with x increasing to the right
                // Calculate initial starting offset and save it, every other move
                // has to take the original offset into account.
                // Calculate a new left postion based on new width
                // Convert current x position into LTR (mirror) x position (uses original offset)
                // Use the difference between ltrX and mirrorX as the amount to move
                const ltrX = ((metrics.viewWidth / 2) - (this.mutationRoot.width / 2) + 25);
                const mirrorX = x - ((x - this.state.rtlOffset) * 2);
                if (mirrorX === ltrX) {
                    return;
                }
                dx = mirrorX - ltrX;
                const midPoint = metrics.viewWidth / 2;
                if (x === 0) {
                    // if it's the first time positioning, it should always move right
                    if (this.mutationRoot.width < midPoint) {
                        dx = ltrX;
                    } else if (this.mutationRoot.width < metrics.viewWidth) {
                        dx = midPoint - ((metrics.viewWidth - this.mutationRoot.width) / 2);
                    } else {
                        dx = midPoint + (this.mutationRoot.width - metrics.viewWidth);
                    }
                    this.mutationRoot.moveBy(dx, dy);
                    this.setState({rtlOffset: this.mutationRoot.getRelativeToSurfaceXY().x});
                    return;
                }
                if (this.mutationRoot.width > metrics.viewWidth) {
                    dx = dx + this.mutationRoot.width - metrics.viewWidth;
                }
            } else {
                dx = (metrics.viewWidth / 2) - (this.mutationRoot.width / 2) - x;
                // If the procedure declaration is wider than the view width,
                // keep the right-hand side of the procedure in view.
                if (this.mutationRoot.width > metrics.viewWidth) {
                    dx = metrics.viewWidth - this.mutationRoot.width - x;
                }
            }
            this.mutationRoot.moveBy(dx, dy);
        });
        this.mutationRoot.domToMutation(this.props.mutator);
        this.mutationRoot.initSvg();
        this.mutationRoot.render();
        this.updatePreview();
        this.setState({warp: this.mutationRoot.getWarp()});
        // Allow the initial events to run to position this block, then focus.
        setTimeout(() => {
            this.mutationRoot.focusLastEditor_();
        });
    }
    handleCancel () {
        this.props.onRequestClose();
    }
    handleColorChange (color) {
        this.setState({color}, () => this.updatePreview());
    }
    handleToggleSecondaryColor () {
        this.setState(state => {
            const {secondary, tertiary, quaternary} = colorPalette(state.color, state.colors);
            return {customSecondaryColor: !state.customSecondaryColor,
                colors: {...state.colors, secondary, tertiary, quaternary}};
        }, () => this.updatePreview());
    }
    handleSecondaryColorChange (name, color) {
        this.setState(state => ({colors: {...state.colors, [name]: color}}), () => this.updatePreview());
    }
    handleResetTextColor () {
        this.setState(state => {
            const colors = {...state.colors};
            delete colors.text;
            return {colors};
        }, () => this.updatePreview());
    }
    updatePreview () {
        if (!this.mutationRoot) return;
        const Blockly = LazyScratchBlocks.get();
        const entry = {color: this.state.color,
            colors: this.state.customSecondaryColor ? this.state.colors : {}};
        applyBlockPalette(this.mutationRoot, entry, Blockly);
        for (const block of this.mutationRoot.getDescendants()) {
            if (block.type.startsWith('argument_')) applyBlockPalette(block, entry, Blockly);
        }
    }
    handleOk () {
        const newMutation = this.mutationRoot ? this.mutationRoot.mutationToDom(true) : null;
        this.props.onRequestClose(newMutation, this.state.color,
            this.state.customSecondaryColor ? this.state.colors : null);
    }
    handleAddLabel () {
        if (this.mutationRoot) {
            this.mutationRoot.addLabelExternal();
        }
    }
    handleAddBoolean () {
        if (this.mutationRoot) {
            this.mutationRoot.addBooleanExternal();
        }
    }
    handleAddTextNumber () {
        if (this.mutationRoot) {
            this.mutationRoot.addStringNumberExternal();
        }
    }
    handleToggleWarp () {
        if (this.mutationRoot) {
            const newWarp = !this.mutationRoot.getWarp();
            this.mutationRoot.setWarp(newWarp);
            this.setState({warp: newWarp});
        }
    }
    render () {
        return (
            <CustomProceduresComponent
                color={this.state.color}
                customSecondaryColor={this.state.customSecondaryColor}
                colors={this.state.colors}
                onResetTextColor={this.handleResetTextColor}
                onPaletteChange={this.handlePaletteChange}
                onToggleSecondaryColor={this.handleToggleSecondaryColor}
                onColorChange={this.handleColorChange}
                componentRef={this.setBlocks}
                warp={this.state.warp}
                onAddBoolean={this.handleAddBoolean}
                onAddLabel={this.handleAddLabel}
                onAddTextNumber={this.handleAddTextNumber}
                onCancel={this.handleCancel}
                onOk={this.handleOk}
                onToggleWarp={this.handleToggleWarp}
            />
        );
    }
}

CustomProcedures.propTypes = {
    color: PropTypes.string.isRequired,
    colors: PropTypes.objectOf(PropTypes.string),
    isRtl: PropTypes.bool,
    mutator: PropTypes.instanceOf(Element),
    onRequestClose: PropTypes.func.isRequired,
    options: PropTypes.shape({
        media: PropTypes.string,
        zoom: PropTypes.shape({
            controls: PropTypes.bool,
            wheel: PropTypes.bool,
            startScale: PropTypes.number
        }),
        comments: PropTypes.bool,
        collapse: PropTypes.bool
    })
};

CustomProcedures.defaultOptions = {
    zoom: {
        controls: false,
        wheel: false,
        startScale: 0.9
    },
    comments: false,
    collapse: false,
    scrollbars: true
};

CustomProcedures.defaultProps = {
    options: CustomProcedures.defaultOptions
};

const mapStateToProps = state => ({
    isRtl: state.locales.isRtl,
    mutator: state.scratchGui.customProcedures.mutator
});

export default connect(
    mapStateToProps
)(CustomProcedures);
