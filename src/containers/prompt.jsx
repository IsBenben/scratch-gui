import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import PromptComponent from '../components/prompt/prompt.jsx';
import VM from 'scratch-vm';
import {SCRATCH_MAX_CLOUD_VARIABLES} from '../lib/tw-cloud-limits.js';
import {colorPalette} from '../lib/project-block-colors';

class Prompt extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleOk',
            'handleScopeOptionSelection',
            'handleCancel',
            'handleChange',
            'handleKeyPress',
            'handleCloudVariableOptionChange',
            'handleColorChange',
            'handleToggleColors',
            'handleResetTextColor'
        ]);
        this.state = {
            isAddingCloudVariableScratchSafe: (
                props.vm &&
                props.vm.runtime.getNumberOfCloudVariables() < SCRATCH_MAX_CLOUD_VARIABLES
            ) || false,
            inputValue: '',
            color: props.color,
            colors: props.colors || {},
            customColors: Boolean(props.colors),
            globalSelected: true,
            cloudSelected: false,
            canAddCloudVariable: (props.vm && props.vm.runtime.canAddCloudVariable()) || false
        };
        this.handlePaletteChange = Object.fromEntries(['secondary', 'tertiary', 'quaternary', 'text']
            .map(name => [name, color => this.setState(state => ({colors: {...state.colors, [name]: color}}))]));
    }
    handleKeyPress (event) {
        if (event.key === 'Enter') this.handleOk();
    }
    handleFocus (event) {
        event.target.select();
    }
    handleOk () {
        this.props.onOk(this.state.inputValue, {
            scope: this.state.globalSelected ? 'global' : 'local',
            isCloud: this.state.cloudSelected,
            color: this.state.color,
            colors: this.state.customColors ? this.state.colors : null
        });
    }
    handleCancel () {
        this.props.onCancel();
    }
    handleChange (e) {
        this.setState({inputValue: e.target.value});
    }
    handleColorChange (color) {
        this.setState({color});
    }
    handleToggleColors () {
        this.setState(state => {
            const {secondary, tertiary, quaternary} = colorPalette(state.color, state.colors);
            return {customColors: !state.customColors, colors: {...state.colors, secondary, tertiary, quaternary}};
        });
    }
    handleResetTextColor () {
        this.setState(state => {
            const colors = {...state.colors};
            delete colors.text;
            return {colors};
        });
    }
    handleScopeOptionSelection (e) {
        this.setState({globalSelected: (e.target.value === 'global')});
    }
    handleCloudVariableOptionChange (e) {
        if (!this.props.showCloudOption) return;

        const checked = e.target.checked;
        this.setState({cloudSelected: checked});
        if (checked) {
            this.setState({globalSelected: true});
        }
    }
    render () {
        return (
            <PromptComponent
                color={this.state.color}
                colors={this.state.colors}
                customColors={this.state.customColors}
                onPaletteChange={this.handlePaletteChange}
                onResetTextColor={this.handleResetTextColor}
                onToggleColors={this.handleToggleColors}
                showColor={this.props.showColor}
                onColorChange={this.handleColorChange}
                isAddingCloudVariableScratchSafe={this.state.isAddingCloudVariableScratchSafe}
                canAddCloudVariable={this.state.canAddCloudVariable}
                cloudSelected={this.state.cloudSelected}
                defaultValue={this.props.defaultValue}
                globalSelected={this.state.globalSelected}
                isStage={this.props.isStage}
                showListMessage={this.props.showListMessage}
                label={this.props.label}
                showCloudOption={this.props.showCloudOption}
                showVariableOptions={this.props.showVariableOptions}
                title={this.props.title}
                onCancel={this.handleCancel}
                onChange={this.handleChange}
                onCloudVarOptionChange={this.handleCloudVariableOptionChange}
                onFocus={this.handleFocus}
                onKeyPress={this.handleKeyPress}
                onOk={this.handleOk}
                onScopeOptionSelection={this.handleScopeOptionSelection}
            />
        );
    }
}

Prompt.propTypes = {
    color: PropTypes.string,
    colors: PropTypes.objectOf(PropTypes.string),
    showColor: PropTypes.bool,
    defaultValue: PropTypes.string,
    isStage: PropTypes.bool.isRequired,
    showListMessage: PropTypes.bool.isRequired,
    label: PropTypes.string.isRequired,
    onCancel: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    showCloudOption: PropTypes.bool.isRequired,
    showVariableOptions: PropTypes.bool.isRequired,
    title: PropTypes.string.isRequired,
    vm: PropTypes.instanceOf(VM)
};

export default Prompt;
