import React from 'react';
import PropTypes from 'prop-types';
import LazyScratchBlocks from '../../lib/tw-lazy-scratch-blocks';
import createProjectColorField from '../../lib/project-color-field';
import styles from './project-color-input.css';

// A real Blockly colour field shares the popup and all installed picker integrations.
// The isolated headless workspace never adds swatch blocks to the project or its undo history.
class ProjectColorInput extends React.Component {
    constructor (props) {
        super(props);
        this.handleOpen = this.handleOpen.bind(this);
        this.handleOutsidePress = this.handleOutsidePress.bind(this);
        this.handleReset = this.handleReset.bind(this);
    }
    componentDidMount () {
        this.listenForOutsidePress();
    }
    componentWillUnmount () {
        window.removeEventListener('mousedown', this.handleOutsidePress, true);
        window.removeEventListener('touchstart', this.handleOutsidePress, true);
        if (!this.workspace) return;
        const Blockly = LazyScratchBlocks.get();
        Blockly.DropDownDiv.hideWithoutAnimation();
        Blockly.DropDownDiv.clearContent();
        document.body.appendChild(Blockly.DropDownDiv.DIV_);
        Blockly.Events.disable();
        try {
            this.workspace.dispose();
        } finally {
            Blockly.Events.enable();
        }
    }
    listenForOutsidePress () {
        window.addEventListener('mousedown', this.handleOutsidePress, true);
        window.addEventListener('touchstart', this.handleOutsidePress, true);
    }
    handleOutsidePress (event) {
        if (event.type === 'mousedown' && event.button !== 0) return;
        const Blockly = LazyScratchBlocks.get();
        const popup = Blockly.DropDownDiv.DIV_;
        const modal = this.button.closest('[role="dialog"]');
        if (!modal || !modal.contains(popup) || !Blockly.DropDownDiv.isVisible()) return;
        if (popup.contains(event.target) || this.button.contains(event.target)) return;
        Blockly.DropDownDiv.hideWithoutAnimation();
    }
    handleReset (event) {
        if (!this.props.onReset) return;
        event.preventDefault();
        const Blockly = LazyScratchBlocks.get();
        if (Blockly.DropDownDiv.owner_ === this.field) Blockly.DropDownDiv.hideWithoutAnimation();
        this.props.onReset();
    }
    handleOpen () {
        // Also register here so an already mounted swatch receives updated handlers after hot reload.
        this.listenForOutsidePress();
        const Blockly = LazyScratchBlocks.get();
        if (this.field && Blockly.DropDownDiv.owner_ === this.field) {
            Blockly.DropDownDiv.hideWithoutAnimation();
            return;
        }
        if (!this.workspace) {
            // TurboWarp's connection events require a rendered procedure workspace.
            // Swatch construction is private UI state, so it must not fire those events.
            const {workspace, field} = createProjectColorField(Blockly, this.button);
            this.workspace = workspace;
            this.field = field;
            // The hex addon also calls setValue directly, bypassing Blockly validation.
            const setValue = this.field.setValue;
            this.field.setValue = (...args) => {
                const result = setValue.apply(this.field, args);
                if (!this.initializing) this.props.onChange(this.field.getValue());
                return result;
            };
        }
        this.initializing = true;
        try {
            this.field.setValue(this.props.color);
            this.field.showEditor_();
        } finally {
            this.initializing = false;
        }
        // Blockly's popup is outside ReactModal; make it part of the modal's focus boundary.
        const modal = this.button.closest('[role="dialog"]');
        if (modal) modal.appendChild(Blockly.DropDownDiv.DIV_);
        Blockly.DropDownDiv.setBoundsElement(document.body);
    }
    render () {
        return (
            <div
                className={styles.row}
                data-project-color-input
            >
                <span>{this.props.label}</span>
                <button
                    aria-label={this.props.label}
                    className={styles.swatch}
                    ref={element => {
                        this.button = element;
                    }}
                    style={{backgroundColor: this.props.color}}
                    type="button"
                    title={this.props.title}
                    onClick={this.handleOpen}
                    onContextMenu={this.handleReset}
                />
                {this.props.children}
            </div>
        );
    }
}

ProjectColorInput.propTypes = {
    children: PropTypes.node,
    color: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    onReset: PropTypes.func,
    title: PropTypes.string
};

export default ProjectColorInput;
