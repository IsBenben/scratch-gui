import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {colorPalette} from '../../lib/project-block-colors';
import ProjectColorInput from './project-color-input.jsx';
import styles from './project-color-controls.css';

const messages = defineMessages({
    secondary: {defaultMessage: 'Secondary color',
        description: 'Blockly secondary color',
        id: 'gui.customProcedures.secondaryColor'},
    tertiary: {defaultMessage: 'Border color',
        description: 'Blockly tertiary border and input color',
        id: 'gui.customProcedures.tertiaryColor'},
    quaternary: {defaultMessage: 'Dropdown selection color',
        description: 'Blockly quaternary selection color',
        id: 'gui.customProcedures.quaternaryColor'},
    text: {defaultMessage: 'Text color',
        description: 'Block label and parameter text color',
        id: 'gui.customProcedures.textColor'},
    autoText: {defaultMessage: 'Right-click to restore automatic contrast',
        description: 'Text color swatch reset hint',
        id: 'gui.customProcedures.autoTextColorHint'}
});

const ProjectColorControls = props => {
    const palette = colorPalette(props.color, props.customColors ? props.colors : {});
    return (
        <div data-project-color-controls>
            <ProjectColorInput
                color={props.color}
                label={props.label}
                onChange={props.onColorChange}
            >
                <label className={styles.option}>
                    <input
                        checked={props.customColors}
                        data-project-color-custom
                        type="checkbox"
                        onChange={props.onToggleColors}
                    />
                    <FormattedMessage
                        defaultMessage="Custom secondary colors"
                        description="Choose secondary, border, dropdown and text colors"
                        id="gui.customProcedures.customSecondaryColor"
                    />
                </label>
            </ProjectColorInput>
            {props.customColors && (
                <div
                    className={styles.palette}
                    data-project-color-palette
                >
                    {['secondary', 'tertiary', 'quaternary', 'text'].map(name => (
                        <ProjectColorInput
                            color={palette[name]}
                            key={name}
                            label={props.intl.formatMessage(messages[name])}
                            title={name === 'text' ? props.intl.formatMessage(messages.autoText) : null}
                            onChange={props.onPaletteChange[name]}
                            onReset={name === 'text' ? props.onResetTextColor : null}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
ProjectColorControls.propTypes = {
    color: PropTypes.string.isRequired,
    colors: PropTypes.objectOf(PropTypes.string).isRequired,
    customColors: PropTypes.bool.isRequired,
    intl: intlShape,
    label: PropTypes.string.isRequired,
    onColorChange: PropTypes.func.isRequired,
    onPaletteChange: PropTypes.objectOf(PropTypes.func).isRequired,
    onResetTextColor: PropTypes.func.isRequired,
    onToggleColors: PropTypes.func.isRequired
};
export default injectIntl(ProjectColorControls);
