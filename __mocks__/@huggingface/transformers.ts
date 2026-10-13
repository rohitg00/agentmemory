import { getTransformersImportError } from "../../test/fixtures/transformers-import-error.js";

throw (
  getTransformersImportError() ??
  Object.assign(new Error("Cannot find package '@huggingface/transformers'"), {
    code: "ERR_MODULE_NOT_FOUND",
  })
);
