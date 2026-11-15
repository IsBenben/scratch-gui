import { configureBlockColorPicker } from "../../libraries/common/cs/blockly-color-picker.js";

export default async ({ addon, msg }) => {
  const Blockly = await addon.tab.traps.getBlockly();
  const update = () => configureBlockColorPicker(Blockly, {
    twoDimensional: !addon.self.disabled,
    shadeLabel: msg("shade"),
    inputClass: addon.tab.scratchClass("input_input-form", {others: "sa-color-picker-readout"}),
  });
  addon.self.addEventListener("disabled", update);
  addon.self.addEventListener("reenabled", update);
  update();
};
