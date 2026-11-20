# Project block colors

Variable/list creation and editing, and the custom block dialog, share the native Blockly color picker. The primary color also applies to the workspace, flyout, and variable/list monitors. Enabling **Custom secondary colors** reveals Blockly's secondary, tertiary (border/input outline), quaternary (dropdown selection), and text colors. Text defaults to automatic black/white contrast; right-clicking its swatch restores that default. Canceling a dialog preserves the saved palette.

The dialog is 750 px wide, wraps palette controls on narrow screens, and scrolls its lower content on short screens. Clicking outside the picker in the title, preview, or lower content closes the picker.

## Persistence

The stage has one configuration comment. Its first line explains the color configuration; its final line is JSON followed by ` // _twcolors_`:

```json
{
  "variables": {
    "variable-id": {"color": "#123456", "colors": {"tertiary": "#abcdef"}}
  },
  "lists": {
    "list-id": {"color": "#654321"}
  },
  "procedures": {
    "definition-block-id": {
      "color": "#456789",
      "colors": {
        "secondary": "#345678",
        "tertiary": "#56789a",
        "quaternary": "#789abc",
        "text": "#aabbcc"
      }
    }
  },
  "parameters": {
    "reporter-block-id": {
      "color": "#456789",
      "colors": {
        "secondary": "#345678",
        "tertiary": "#56789a",
        "quaternary": "#789abc",
        "text": "#aabbcc"
      },
      "definitionId": "definition-block-id"
    }
  }
}
```

Variable/list IDs and definition block IDs form separate namespaces. Project saving attaches color data before running the VM's native optimizer, which replaces block/comment IDs with short IDs. The optimizer's block object identities provide the exact ID mapping; both color metadata and color comments use these saved IDs, including each parameter's `definitionId`. Live editor IDs remain unchanged. Variable/list IDs are preserved by the optimizer. Explicitly disabling optimization and exporting individual sprites retain matching original IDs. Long comments follow the native 8000-character `text` limit and store their remainder in `extraText`; both parts are read and remapped together. Runtime sprite IDs are regenerated on project load, so the format does not depend on them or on sprite names. Missing optional channels use the calculated defaults. Deleting the configuration comment restores default colors; a later color edit or creation regenerates it.

Parameters recursively inherit their enclosing definition. Their resolved palettes are cached by reporter ID. Ordinary dragging freezes that cache before unplugging and retains it throughout the drag; dropping recomputes it from the final connections. A dropped orphan uses the default palette. XML duplication snapshots the source cache and maps input connections to new block IDs before dragging. This includes the first native **Duplicate** menu item, clipboard paste, and dragging a prototype parameter.

## Sprite and backpack transfer

Sprite and backpack exports carry `scratchGuiColors` metadata and a transport comment ending in ` // _twcolors_transfer_`. The comment supports applications that discard custom metadata. Valid metadata takes precedence over its comment fallback. Imports remap variable, list, definition, and parameter IDs. When the destination already has a matching global variable/list or procedure signature, its existing palette takes precedence over the imported palette.

## Verification

Run `pnpm run test:unit`, then `pnpm run build` and `pnpm run test:pickers:browser`. The browser checks use installed Chrome and real mouse/wheel events, including flyout variable/list menu edits and native duplicate-and-drag. Set `PICKER_SCREENSHOT_DIR` to retain screenshots outside the repository. Full GUI lint also checks pre-existing files; report unrelated failures separately.

Verified on November 20, 2026 with Node.js 24.22.3 and pnpm 10.33.0: all 67 GUI unit tests, the GUI build, and the complete Chrome regression passed. Serialization checks inspect `project.json` inside a real `.sb3` archive, load it through the native VM, verify metadata precedence and comment-only recovery, and ensure saving never changes runtime IDs. Repeated backpack imports and workspace rebuilds preserve the destination palette; matching global variable/list IDs or names retain their existing colors. Full GUI lint retains 39 existing errors.
