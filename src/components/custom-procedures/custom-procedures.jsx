import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import {defineMessages, injectIntl, intlShape, FormattedMessage} from 'react-intl';

import booleanInputIcon from './icon--boolean-input.svg';
import textInputIcon from './icon--text-input.svg';
import labelIcon from './icon--label.svg';

import styles from './custom-procedures.css';
import ProjectColorControls from '../project-color-input/project-color-controls.jsx';

const messages = defineMessages({
    myblockModalTitle: {
        defaultMessage: 'Make a Block',
        description: 'Title for the modal where you create a custom block.',
        id: 'gui.customProcedures.myblockModalTitle'
    },
    blockColor: {
        defaultMessage: 'Block color',
        description: 'Color of the definition and calls of this custom block',
        id: 'gui.customProcedures.blockColor'
    }
});

const CustomProcedures = props => (
    <Modal
        className={styles.modalContent}
        contentLabel={props.intl.formatMessage(messages.myblockModalTitle)}
        onRequestClose={props.onCancel}
        id="customProceduresModal"
    >
        <Box
            className={styles.workspace}
            componentRef={props.componentRef}
        />
        <Box className={styles.body}>
            <div className={styles.optionsRow}>
                <div
                    className={styles.optionCard}
                    role="button"
                    tabIndex="0"
                    onClick={props.onAddTextNumber}
                >
                    <img
                        className={styles.optionIcon}
                        src={textInputIcon}
                        draggable={false}
                    />
                    <div className={styles.optionTitle}>
                        <FormattedMessage
                            defaultMessage="Add an input"
                            description="Label for button to add a number/text input"
                            id="gui.customProcedures.addAnInputNumberText"
                        />
                    </div>
                    <div className={styles.optionDescription}>
                        <FormattedMessage
                            defaultMessage="number or text"
                            description="Description of the number/text input type"
                            id="gui.customProcedures.numberTextType"
                        />
                    </div>
                </div>
                <div
                    className={styles.optionCard}
                    role="button"
                    tabIndex="0"
                    onClick={props.onAddBoolean}
                >
                    <img
                        className={styles.optionIcon}
                        src={booleanInputIcon}
                        draggable={false}
                    />
                    <div className={styles.optionTitle}>
                        <FormattedMessage
                            defaultMessage="Add an input"
                            description="Label for button to add a boolean input"
                            id="gui.customProcedures.addAnInputBoolean"
                        />
                    </div>
                    <div className={styles.optionDescription}>
                        <FormattedMessage
                            defaultMessage="boolean"
                            description="Description of the boolean input type"
                            id="gui.customProcedures.booleanType"
                        />
                    </div>
                </div>
                <div
                    className={styles.optionCard}
                    role="button"
                    tabIndex="0"
                    onClick={props.onAddLabel}
                >
                    <img
                        className={styles.optionIcon}
                        src={labelIcon}
                        draggable={false}
                    />
                    <div className={styles.optionTitle}>
                        <FormattedMessage
                            defaultMessage="Add a label"
                            description="Label for button to add a label"
                            id="gui.customProcedures.addALabel"
                        />
                    </div>
                </div>
            </div>
            <ProjectColorControls
                color={props.color}
                colors={props.colors}
                customColors={props.customSecondaryColor}
                label={props.intl.formatMessage(messages.blockColor)}
                onColorChange={props.onColorChange}
                onPaletteChange={props.onPaletteChange}
                onResetTextColor={props.onResetTextColor}
                onToggleColors={props.onToggleSecondaryColor}
            />
            <div className={styles.checkboxRow}>
                <label>
                    <input
                        checked={props.warp}
                        type="checkbox"
                        onChange={props.onToggleWarp}
                    />
                    <FormattedMessage
                        defaultMessage="Run without screen refresh"
                        description="Label for checkbox to run without screen refresh"
                        id="gui.customProcedures.runWithoutScreenRefresh"
                    />
                </label>
            </div>
            <Box className={styles.buttonRow}>
                <button
                    className={styles.cancelButton}
                    onClick={props.onCancel}
                >
                    <FormattedMessage
                        defaultMessage="Cancel"
                        description="Label for button to cancel custom procedure edits"
                        id="gui.customProcedures.cancel"
                    />
                </button>
                <button
                    className={styles.okButton}
                    onClick={props.onOk}
                >
                    <FormattedMessage
                        defaultMessage="OK"
                        description="Label for button to save new custom procedure"
                        id="gui.customProcedures.ok"
                    />
                </button>
            </Box>
        </Box>
    </Modal>
);

CustomProcedures.propTypes = {
    color: PropTypes.string.isRequired,
    customSecondaryColor: PropTypes.bool.isRequired,
    colors: PropTypes.objectOf(PropTypes.string).isRequired,
    onResetTextColor: PropTypes.func.isRequired,
    onPaletteChange: PropTypes.objectOf(PropTypes.func).isRequired,
    onToggleSecondaryColor: PropTypes.func.isRequired,
    onColorChange: PropTypes.func.isRequired,
    componentRef: PropTypes.func.isRequired,
    intl: intlShape,
    onAddBoolean: PropTypes.func.isRequired,
    onAddLabel: PropTypes.func.isRequired,
    onAddTextNumber: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    onToggleWarp: PropTypes.func.isRequired,
    warp: PropTypes.bool.isRequired
};

export default injectIntl(CustomProcedures);
