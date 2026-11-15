import paintEditorHandler from "./paint-editor.js";
import codeEditorHandler from "./code-editor.js";

export default async (api) => {
  paintEditorHandler(api);
  codeEditorHandler(api);
};
