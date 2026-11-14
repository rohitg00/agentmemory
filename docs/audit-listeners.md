# Audit listeners

Audit consumers can subscribe independently with `addAuditListener(listener)` and
unsubscribe with `removeAuditListener(listener)`, exported from
`src/functions/audit.ts`. Keep the same function reference for removal. Registering
the same function twice or removing it more than once is harmless.

`setAuditRecordedListener(listener)` remains a separate, replaceable legacy slot
used by the viewer. Setting that slot to `null` does not remove independent
subscribers. Removing an independent subscription does not clear the legacy slot,
even when both contain the same function. A function registered through both
mechanisms is called once for each recorded entry.

`recordAudit()` invokes listeners after its monthly entry write and month-index
update complete. It calls the legacy listener first, followed by independent
listeners in registration order. Removing and registering a listener again moves
it to the end of that order.

Dispatch uses a snapshot taken after persistence completes. A callback added
during dispatch starts with the next entry; a callback removed during dispatch
still receives the current entry. Legacy replacement or cleanup during dispatch
also takes effect on the next entry.

The callback type keeps TypeScript's `void` convention, so existing value-returning
handlers such as `(entry) => rows.push(entry)` remain accepted. Return values are
not used, and returned promises have rejection handlers attached. A synchronous
exception or rejected promise in one callback does not prevent the other callbacks
from running or make an already written audit entry fail. Promise completion is
not awaited, so async work can overlap across entries. Callbacks should avoid
blocking synchronous work. Failure of a required entry or month-index operation
still rejects `recordAudit()` before listener delivery; `safeAudit()` keeps its
existing logging boundary.

Delivery is best effort within the current process. There is no retry queue,
cursor, or durable delivery guarantee. This listener API does not add file/stdout
sinks, backfill exports, or an export payload/deletion policy.
