const manifest = {
  "editorOnly": true,
  "name": "Better color picker",
  "description": "Improves color picker cursors and colors their handles to match the selected color. Supports the 2D color picker and its Shift axis lock.",
  "tags": [],
  "enabledByDefault": true,
  "dynamicDisable": true,
  "settings": [
    {
      "id": "change-cursor",
      "name": "Change cursor style",
      "type": "boolean",
      "default": true,
      "dynamic": true
    },
    {
      "id": "color-handle",
      "name": "Use selected color for handle background",
      "type": "boolean",
      "default": true,
      "dynamic": true
    }
  ],
  "userscripts": [
    {
      "url": "userscript.js"
    }
  ],
  "userstyles": [
    {
      "url": "code-picker.css"
    },
    {
      "url": "style.css",
      "if": {
        "settings": {
          "change-cursor": true
        }
      }
    },
    {
      "url": "handle-color.css",
      "if": {
        "settings": {
          "color-handle": true
        }
      }
    }
  ]
};
export default manifest;
