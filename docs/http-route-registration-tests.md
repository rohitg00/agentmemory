# HTTP registration safety tests

`test/http-route-registration.test.ts` records the five HTTP registration entry points used at boot, including delegated graph, compression, viewer and MCP bridge routes. The checked-in fixture contains all 153 registrations in their original order: 147 REST routes and six MCP bridges. Both configured-secret and unset-secret profiles must retain every registration field and resolve every target to a registered function.

With a secret configured, the test dispatches a wrong bearer through each route's registered middleware and, if permitted, its registered handler. The expected outcomes are 152 unauthorized responses and one public liveness response. Auth requirements are recorded from behavior: some handlers check authorization themselves without middleware metadata. Separate bounded checks cover missing and valid tokens, an untrusted Origin, unset-secret behavior, and denial before graph-status fanout.

The collector keeps complete trigger configuration. It can also record complete HTTP observer source arguments, target and options, including webhook flags, observer IDs and concurrency limits. Empty inventories and duplicate method/path pairs fail rather than being silently accepted or deduplicated. Observer capture tests cover that data contract; the boot snapshot targets the current trigger-based runtime and does not establish compatibility with an unmerged runtime migration.

These tests call real registration functions and auth handlers with SDK dispatch and in-memory KV doubles. They do not start an engine HTTP worker or exercise every authorized handler body. No-secret handler execution is limited to the safe checks described above.

Run the focused checks with:

```sh
npx vitest run test/http-route-registration.test.ts test/http-registration-recorder.test.ts
```

For an intentional route, order, configuration or auth-policy change, review the fixture against the changed registrations and actual auth behavior before updating it. Do not regenerate the expected fixture from a candidate during a test run. This is the route-safety prerequisite for #1740; route extraction, the MCP tool table and the CLI split remain separate work.
