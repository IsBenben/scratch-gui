import tinycolor from "../../thirdparty/cs/tinycolor-min.js";
import { getShadePosition, getSliderPosition, getWheelValue, getWheelDelta, getWheelShadePosition } from "scratch-paint/src/lib/color-picker-position.js";

const integrations = new WeakMap();
const channels = ["hue", "saturation", "brightness"];
const maximum = { hue: 360, saturation: 1, brightness: 255 };
const percent = (field, channel) => field[`${channel}_`] / maximum[channel] * 100;

class BlockColorPicker {
  constructor(field, settings) {
    this.field = field;
    this.settings = settings;
    this.root = field.hueSlider_.getElement().parentElement;
    this.cleanups = [];
    this.inputs = {};
    this.displays = new Map();
    this.listen(window, "blur", () => this.stopDrag());
    this.listen(window, "keydown", (event) => this.modifiers(event));
    this.listen(window, "keyup", (event) => this.modifiers(event));
    for (const channel of channels) {
      const slider = field[`${channel}Slider_`].getElement();
      this.listen(slider, "pointerdown", (event) => this.startDrag(event, channel), true);
      this.listen(slider, "wheel", (event) => this.wheel(event, channel), {capture: true, passive: false});
      // Suppress Closure's click animation after our pointer-driven drag.
      for (const type of ["mousedown", "touchstart", "click"]) {
        this.listen(slider, type, (event) => {
          if (!this.active()) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, true);
      }
    }
    this.observer = new MutationObserver(() => {
      if (!field.hueSlider_.getElement().isConnected) this.dispose();
    });
    this.observer.observe(this.root, {childList: true, subtree: true});
    this.configure(settings);
  }
  listen(element, type, callback, options) {
    element.addEventListener(type, callback, options);
    this.cleanups.push(() => element.removeEventListener(type, callback, options));
  }
  active() {
    return this.settings.betterColorPicker || this.settings.twoDimensional;
  }
  display(element, hidden) {
    if (!this.displays.has(element)) this.displays.set(element, element.style.display);
    element.style.display = hidden ? "none" : this.displays.get(element);
  }
  input(channel) {
    const input = document.createElement("input");
    Object.assign(input, {type: "number", min: "0", max: "100", step: "any",
      className: this.settings.inputClass || "sa-color-picker-readout"});
    input.classList.add("sa-color-picker-readout");
    input.setAttribute("aria-label", this.field[`${channel}Readout_`].parentElement.firstChild.textContent);
    const commit = () => {
      if (input.value.trim() === "" || !Number.isFinite(Number(input.value))) return this.render();
      this.change(channel, Math.max(0, Math.min(100, Number(input.value))));
    };
    this.listen(input, "change", commit);
    this.listen(input, "wheel", (event) => this.wheel(event, channel), {capture: true, passive: false});
    this.listen(input, "blur", () => this.render());
    this.listen(input, "keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); commit(); }
      if (event.key === "Escape") { event.preventDefault(); this.render(); }
    });
    return input;
  }
  createControls() {
    for (const channel of channels) {
      const input = this.inputs[channel] = this.input(channel);
      this.field[`${channel}Readout_`].parentElement.appendChild(input);
    }
    this.shadeRow = document.createElement("div");
    this.shadeLabel = document.createElement("div");
    this.shadeLabel.className = "scratchColourPickerLabel";
    this.shadeTitle = document.createElement("span");
    this.shadeTitle.className = "scratchColourPickerLabelText";
    this.shadeLabel.appendChild(this.shadeTitle);
    this.area = document.createElement("div");
    this.area.className = "sa-2dcolor-picker";
    this.thumb = document.createElement("div");
    this.thumb.className = "sa-code-color-picker-handle";
    this.area.appendChild(this.thumb);
    this.shadeRow.append(this.shadeLabel, this.area);
    const saturationLabel = this.field.saturationReadout_.parentElement;
    saturationLabel.parentElement.insertBefore(this.shadeRow, saturationLabel);
    this.listen(this.area, "pointerdown", (event) => this.startDrag(event, "shade"));
    this.listen(this.area, "wheel", (event) => this.wheel(event, "shade"),
      {capture: true, passive: false});
    this.listen(this.area, "pointermove", (event) => {
      if (!this.drag) this.move(event);
    });
    this.listen(this.area, "pointerleave", () => {
      if (!this.drag) { this.lastPointer = null; this.area.dataset.saColorPickerAxis = "both"; }
    });
  }
  configure(settings) {
    this.settings = settings;
    this.stopDrag();
    this.root.classList.toggle("sa-code-color-picker-active", !!this.active());
    if (this.active() && !this.area) this.createControls();
    if (!this.area) return;
    for (const channel of channels) {
      const readout = this.field[`${channel}Readout_`];
      this.display(readout, this.active());
      const parent = this.settings.twoDimensional && channel !== "hue" ?
        this.shadeLabel : readout.parentElement;
      parent.appendChild(this.inputs[channel]);
      this.inputs[channel].hidden = !this.active();
      if (channel !== "hue") {
        this.display(readout.parentElement, this.settings.twoDimensional);
        this.display(this.field[`${channel}Slider_`].getElement(), this.settings.twoDimensional);
      }
    }
    this.shadeRow.hidden = !this.settings.twoDimensional;
    this.shadeTitle.textContent = settings.shadeLabel || "Shade";
    this.render();
    this.field.updateDom_();
  }
  change(channel, value) {
    // Use the original field callback so validation, undo, and the hex addon run.
    const raw = value / 100 * maximum[channel];
    this.field.sliderCallbackFactory_(channel)({target: {getValue: () => raw}});
  }
  wheel(event, channel) {
    if (!this.active() || (!event.deltaX && !event.deltaY)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (channel === "shade") {
      const position = getWheelShadePosition(event, {saturation: percent(this.field, "saturation"),
        brightness: percent(this.field, "brightness")}, this.settings.betterColorPicker && event.ctrlKey);
      this.field.saturation_ = position.saturation / 100;
      this.change("brightness", position.brightness);
      return;
    }
    const input = this.inputs[channel];
    const current = event.target === input && input.value.trim() && Number.isFinite(Number(input.value)) ?
      Number(input.value) : percent(this.field, channel);
    const value = getWheelValue(current, getWheelDelta(event), this.settings.betterColorPicker && event.ctrlKey);
    this.change(channel, value);
    input.value = Math.round(value * 10) / 10;
  }
  render() {
    if (!this.area) return;
    for (const channel of channels) {
      const input = this.inputs[channel];
      if (document.activeElement !== input) input.value = Math.round(percent(this.field, channel) * 10) / 10;
    }
    this.area.style.backgroundColor = tinycolor({h: this.field.hue_, s: 1, v: 1}).toHexString();
    this.area.style.backgroundImage = "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)";
    this.thumb.style.left = `${percent(this.field, "saturation")}%`;
    this.thumb.style.top = `${100 - percent(this.field, "brightness")}%`;
  }
  startDrag(event, channel) {
    if (!this.active() || event.button !== 0 || this.drag) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const element = channel === "shade" ? this.area : this.field[`${channel}Slider_`].getElement();
    const thumb = channel === "shade" ? this.thumb : element.querySelector(".goog-slider-thumb");
    this.drag = {channel, pointerId: event.pointerId, element,
      origin: {saturation: percent(this.field, "saturation"), brightness: percent(this.field, "brightness")},
      offset: thumb.contains(event.target) ? event.clientX - thumb.getBoundingClientRect().left : 13};
    this.onMove = (next) => { if (next.pointerId === this.drag?.pointerId) this.move(next); };
    this.onUp = (next) => {
      if (next.pointerId !== this.drag?.pointerId) return;
      if (next.type === "pointerup") this.move(next);
      this.stopDrag();
    };
    document.addEventListener("pointermove", this.onMove);
    document.addEventListener("pointerup", this.onUp);
    document.addEventListener("pointercancel", this.onUp);
    this.move(event);
  }
  move(event) {
    this.lastPointer = {clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey};
    const ctrl = event.ctrlKey && this.settings.betterColorPicker;
    if (this.drag?.channel !== "shade" && this.drag) {
      const value = getSliderPosition(event.clientX, this.drag.element.getBoundingClientRect(), this.drag.offset, ctrl);
      this.change(this.drag.channel, value);
      return;
    }
    if (!this.area) return;
    const origin = this.drag?.origin || {saturation: percent(this.field, "saturation"),
      brightness: percent(this.field, "brightness")};
    const position = getShadePosition(event, this.area.getBoundingClientRect(), origin, event.shiftKey, ctrl);
    this.area.dataset.saColorPickerAxis = position.axis;
    if (this.drag) {
      this.field.saturation_ = position.saturation / 100;
      this.change("brightness", position.brightness);
    }
  }
  modifiers(event) {
    if (!this.lastPointer || !this.active()) return;
    if (!this.field.hueSlider_.getElement().isConnected) return this.stopDrag();
    this.move({...this.lastPointer, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey});
  }
  stopDrag() {
    document.removeEventListener("pointermove", this.onMove);
    document.removeEventListener("pointerup", this.onUp);
    document.removeEventListener("pointercancel", this.onUp);
    this.drag = null;
    this.lastPointer = null;
    if (this.area) this.area.dataset.saColorPickerAxis = "both";
  }
  dispose() {
    this.stopDrag();
    this.observer.disconnect();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    for (const [element, display] of this.displays) element.style.display = display;
    for (const input of Object.values(this.inputs)) input.remove();
    this.shadeRow?.remove();
    this.root.classList.remove("sa-code-color-picker-active");
  }
}

export const configureBlockColorPicker = (Blockly, settings) => {
  const prototype = Blockly.FieldColourSlider.prototype;
  let integration = integrations.get(prototype);
  if (!integration) {
    integration = {settings: {betterColorPicker: false, twoDimensional: false}, controller: null};
    integrations.set(prototype, integration);
    const show = prototype.showEditor_;
    prototype.showEditor_ = function(...args) {
      integration.controller?.dispose();
      const result = show.apply(this, args);
      integration.controller = channels.every(channel => this[`${channel}Slider_`]) ?
        new BlockColorPicker(this, integration.settings) : null;
      return result;
    };
    const update = prototype.updateDom_;
    prototype.updateDom_ = function(...args) {
      const result = update.apply(this, args);
      if (integration.controller?.field === this) integration.controller.render();
      return result;
    };
    const dispose = prototype.dispose;
    prototype.dispose = function(...args) {
      if (integration.controller?.field === this) integration.controller.dispose();
      return dispose?.apply(this, args);
    };
  }
  Object.assign(integration.settings, settings);
  integration.controller?.configure(integration.settings);
};
