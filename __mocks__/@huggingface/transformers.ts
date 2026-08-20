const transitiveMissingPackage =
  process.env.AGENTMEMORY_TEST_TRANSFORMERS_TRANSITIVE_MISSING_PACKAGE;
const injectedErrorKey = Symbol.for(
  "agentmemory.test.transformersImportError",
);
const injectedError = (globalThis as Record<PropertyKey, unknown>)[
  injectedErrorKey
];

throw (
  injectedError instanceof Error
    ? injectedError
    : Object.assign(
        new Error(
          transitiveMissingPackage
            ? `Cannot find package '${transitiveMissingPackage}' imported from @huggingface/transformers`
            : "Cannot find package '@huggingface/transformers'",
        ),
        { code: "ERR_MODULE_NOT_FOUND" },
      )
);
