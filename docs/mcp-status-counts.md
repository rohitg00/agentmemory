# MCP status counts

The `agentmemory://status` resource reports global session and memory counts, including all projects and stored memory versions. When key listing is supported, these are counts of stored keys. Status does not fetch record values on that path.

A listed key counts even if its value is null or missing. This intentionally replaces the previous memory count that fetched and filtered out null values. If a record is deleted after its keys were listed, it remains in that read's count. The next request lists keys again: there is no count cache or atomic snapshot across scopes.

`healthStatus` is `available` when at least one health key exists and `no-data` otherwise. This indicates stored health data, not a health assessment.

If key listing fails, `StateKV.count` falls back to the number of rows returned by value listing. Legacy adapters without `count`, including the standalone in-memory adapter, also use value listing. This fallback loads records, includes returned null rows, and cannot count orphan keys absent from the returned values. It does not promise the same snapshot as successful key listing.

If both count routes fail for sessions or memories, the resource returns its existing internal-error response. Health read failures remain `no-data`. Authentication, URI validation and the resource's URI, MIME type and JSON fields are unchanged.

This addresses the MCP status resource in [#1735](https://github.com/rohitg00/agentmemory/issues/1735). Other count endpoints and list pagination remain separate work.
