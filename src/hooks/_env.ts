import dotenv from "dotenv";
import { homedir } from "node:os";
import { join } from "node:path";

// Load ~/.agentmemory/.env into process.env before any hook reads env vars.
// Keys already set in the environment (e.g. via Claude Code settings.json or
// the shell) take priority — dotenv.config() does not override by default.
dotenv.config({ path: join(homedir(), ".agentmemory", ".env"), quiet: true });
