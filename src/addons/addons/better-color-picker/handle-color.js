import tinycolor from "../../libraries/thirdparty/cs/tinycolor-min.js";

export const handleColorProperty = "--sa-better-color-picker-handle-color";
export const handleShadowProperty = "--sa-better-color-picker-handle-shadow";
export const paintHandles = '.Popover-body [class*="slider_container_"] > [class*="slider_handle_"]';
export const twoDimensionalHandles = '.sa-2dcolor-picker > [class*="slider_handle"], .sa-2dcolor-picker > .sa-code-color-picker-handle';
export const allHandles = `${paintHandles}, ${twoDimensionalHandles}, .blocklyDropDownDiv .goog-slider-thumb`;

const setHandleColor = (handle, color) => {
  if (!handle) return;
  const parsed = tinycolor(color);
  const value = color === null ? "transparent" : parsed.isValid() ? parsed.toRgbString() : "";
  const shadow = value ? (parsed.isLight() ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.25)") : "";
  for (const [property, next] of [[handleColorProperty, value], [handleShadowProperty, shadow]]) {
    if (handle.style.getPropertyValue(property) === next) continue;
    if (next) handle.style.setProperty(property, next);
    else handle.style.removeProperty(property);
  }
};

export const updatePaintHandles = (addon, root = document) => {
  const paint = addon.tab.redux.state?.scratchPaint;
  // The paint reducer is injected only after the costume editor loads.
  if (!paint?.modals || !paint.fillMode || !paint.color) return;
  const kind = paint.modals.fillColor ? "fillColor" : paint.modals.strokeColor ? "strokeColor" : null;
  if (!kind) return;
  const index = paint.fillMode.colorIndex === 1 ? "secondary" : "primary";
  const color = paint.color[kind][index];
  for (const handle of root.querySelectorAll(paintHandles)) setHandleColor(handle, color);
  for (const handle of root.querySelectorAll(twoDimensionalHandles)) {
    if (!handle.closest?.(".blocklyDropDownDiv")) setHandleColor(handle, color);
  }
};

export const updateCodeHandles = (field) => {
  const color = field.getValue();
  for (const slider of [field.hueSlider_, field.saturationSlider_, field.brightnessSlider_]) {
    if (slider) setHandleColor(slider.getElement().querySelector(".goog-slider-thumb"), color);
  }
  const root = field.hueSlider_?.getElement().parentElement;
  setHandleColor(root?.querySelector(".sa-code-color-picker-handle"), color);
};
