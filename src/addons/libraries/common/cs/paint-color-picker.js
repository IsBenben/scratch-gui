export const paintPickerSelector = '.Popover-body [data-sa-color-picker]';

// Paint owns HSV while the popup is open. Configure its native controls rather
// than converting through RGB or pretending to activate the eyedropper.
export const configurePaintPicker = (element, settings) => {
  element.dispatchEvent(new CustomEvent("sa-color-picker-config", { bubbles: true, detail: settings }));
};

export const configurePaintPickers = (settings) => {
  for (const element of document.querySelectorAll(paintPickerSelector)) configurePaintPicker(element, settings);
};

// React can attach the native listener again without creating a new DOM node.
// Reapply current addon settings whenever the native picker announces readiness.
export const onPaintPickerReady = (settings) => {
  document.addEventListener("sa-color-picker-ready", (event) => {
    if (event.target.matches?.(paintPickerSelector)) configurePaintPicker(event.target, settings());
  });
};
