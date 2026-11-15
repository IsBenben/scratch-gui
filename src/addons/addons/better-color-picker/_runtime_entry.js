import _css from "!css-loader!./style.css";
import _colorCss from "!css-loader!./handle-color.css";
import _codeCss from "!css-loader!../../libraries/common/cs/blockly-color-picker.css";
import _js from "./userscript.js";
export const resources = {
  "style.css": _css,
  "handle-color.css": _colorCss,
  "code-picker.css": _codeCss,
  "userscript.js": _js,
};
