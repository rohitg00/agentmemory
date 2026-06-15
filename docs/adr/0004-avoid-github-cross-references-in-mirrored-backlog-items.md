# 4. Avoid GitHub cross references in mirrored backlog items

Date: 2026-06-15

## Status

Accepted

## Context

The fork mirrors upstream issues and pull requests into `wbugitlab1/agentmemory` so fork work can be triaged independently from `rohitg00/agentmemory`.

GitHub automatically creates timeline cross-reference events when a public issue body or comment links to another issue or pull request with a naked GitHub URL or `owner/repo#N` reference. Existing mirror content created public timeline entries in the upstream repository attributed to the account that created the fork mirror issues.

Editing one fork issue to remove the active reference did not remove the already-created upstream timeline event. GitHub also rejected making the public fork private with `HTTP 422` because public forks cannot be made private.

## Decision

Mirrored backlog items must not write active GitHub cross-reference syntax for source repository issues or pull requests.

Generated mirror content will use neutral metadata such as source repository name and source item number. It will omit direct source URLs from public issue bodies/comments and will not use `rohitg00/agentmemory#N` markers.

Mirror tools must still parse old marker formats for migration and verification. Repair tooling will edit existing fork issue bodies and comments in place to remove active source-repo autolinks. The repair does not attempt to delete upstream timeline events, because GitHub does not document a supported delete operation for timeline cross-reference events.

## Consequences

Future mirror runs should not create new upstream cross-reference timeline events.

Fork issue bodies and comments become less convenient because they no longer contain clickable source URLs. Operators must reconstruct source URLs manually from the source repository and source number fields when needed.

Existing upstream timeline events may remain visible even after active references are removed from the fork. If those historical events need removal, GitHub Support or repository-level intervention may be required.
