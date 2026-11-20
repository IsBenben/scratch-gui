import twTranslations from './generated-translations.json';

const addAdditionalTranslations = editorMessages => {
    const colorLabels = {
        'zh-cn': ['变量颜色', '列表颜色', '积木颜色', '自定义次要颜色', '次要颜色',
            '边框颜色', '下拉菜单选中色', '文本颜色', '自动对比度'],
        'zh-tw': ['變數顏色', '清單顏色', '積木顏色', '自訂次要顏色', '次要顏色',
            '邊框顏色', '下拉選單選取色', '文字顏色', '自動對比度']
    };
    for (const locale of Object.keys(editorMessages)) {
        const toMixIn = twTranslations[locale.toLowerCase()];
        if (toMixIn) {
            Object.assign(editorMessages[locale], toMixIn);
        }
        const labels = colorLabels[locale.toLowerCase()];
        if (labels) {
            Object.assign(editorMessages[locale], {
                'gui.prompt.variableColor': labels[0],
                'gui.prompt.listColor': labels[1],
                'gui.customProcedures.blockColor': labels[2],
                'gui.customProcedures.customSecondaryColor': labels[3],
                'gui.customProcedures.secondaryColor': labels[4],
                'gui.customProcedures.tertiaryColor': labels[5],
                'gui.customProcedures.quaternaryColor': labels[6],
                'gui.customProcedures.textColor': labels[7],
                'gui.customProcedures.autoTextColorHint': locale.toLowerCase() === 'zh-cn' ?
                    '右键点击可恢复自动对比度' : '按右鍵可恢復自動對比度'
            });
        }
    }

    // We reuse our `es` translations for `es-419` instead of maintaining separate translations.
    Object.assign(editorMessages['es-419'], twTranslations.es);
};

export default addAdditionalTranslations;
