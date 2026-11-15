import { allHandles, handleColorProperty, handleShadowProperty, updatePaintHandles, updateCodeHandles } from "./handle-color.js";
import { paintPickerSelector, configurePaintPicker, configurePaintPickers, onPaintPickerReady } from "../../libraries/common/cs/paint-color-picker.js";
import { configureBlockColorPicker } from "../../libraries/common/cs/blockly-color-picker.js";

export default async ({ addon }) => {
  let frame = null;
  let activeField = null;
  let ScratchBlocks = null;
  const enabled = () => !addon.self.disabled && addon.settings.get("color-handle");
  const scheduleUpdate = () => {
    if (!enabled() || frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      if (enabled()) updatePaintHandles(addon);
    });
  };
  const observer = new MutationObserver(scheduleUpdate);
  const pickerSettings = () => ({ betterColorPicker: !addon.self.disabled });
  onPaintPickerReady(pickerSettings);
  const updateEnabled = () => {
    configurePaintPickers(pickerSettings());
    if (ScratchBlocks) configureBlockColorPicker(ScratchBlocks, {
      ...pickerSettings(),
      inputClass: addon.tab.scratchClass?.("input_input-form", {others: "sa-color-picker-readout"}),
    });
    observer.disconnect();
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
    if (enabled()) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });
      updatePaintHandles(addon);
      if (activeField) updateCodeHandles(activeField);
    } else {
      for (const handle of document.querySelectorAll(allHandles)) {
        handle.style.removeProperty(handleColorProperty);
        handle.style.removeProperty(handleShadowProperty);
      }
    }
  };
  addon.tab.redux.initialize();
  addon.tab.redux.addEventListener("statechanged", scheduleUpdate);
  addon.settings.addEventListener("change", updateEnabled);
  addon.self.addEventListener("disabled", updateEnabled);
  addon.self.addEventListener("reenabled", updateEnabled);
  updateEnabled();

  // Paint may open before Blockly has finished loading.
  const watchPickers = async () => {
    while (true) {
      const element = await addon.tab.waitForElement(paintPickerSelector, { markAsSeen: true });
      configurePaintPicker(element, pickerSettings());
    }
  };
  watchPickers();

  ScratchBlocks = await addon.tab.traps.getBlockly();
  const prototype = ScratchBlocks.FieldColourSlider.prototype;
  updateEnabled();
  const originalUpdate = prototype.updateDom_;
  prototype.updateDom_ = function (...args) {
    const result = originalUpdate.apply(this, args);
    if (enabled()) updateCodeHandles(this);
    return result;
  };
  const originalShow = prototype.showEditor_;
  prototype.showEditor_ = function (...args) {
    const result = originalShow.apply(this, args);
    activeField = this;
    if (enabled()) updateCodeHandles(this);
    return result;
  };
};
