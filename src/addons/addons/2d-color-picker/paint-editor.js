import { paintPickerSelector, configurePaintPicker, configurePaintPickers, onPaintPickerReady } from "../../libraries/common/cs/paint-color-picker.js";

export default async ({ addon, msg }) => {
  const settings = () => ({ twoDimensional: !addon.self.disabled, shadeLabel: msg("shade") });
  onPaintPickerReady(settings);
  const update = () => configurePaintPickers(settings());
  addon.self.addEventListener("disabled", update);
  addon.self.addEventListener("reenabled", update);
  update();
  while (true) {
    const element = await addon.tab.waitForElement(paintPickerSelector, { markAsSeen: true });
    configurePaintPicker(element, settings());
  }
};
