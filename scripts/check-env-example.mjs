#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUNTIME_ONLY = new Set([
  "HOME", "PATH", "USERPROFILE", "NODE_ENV", "AGENTMEMORY_SDK_CHILD",
  "APPDATA", "CI", "COMSPEC", "EDITOR", "NO_COLOR", "PWD", "SYSTEMROOT",
  "VISUAL", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  // Private worker protocol and release-gate fault injection are not user settings.
  "AGENTMEMORY_CAPTURE_DRAIN_CHILD", "AGENTMEMORY_SESSION_END_WORKER",
  "AGENTMEMORY_MCP_STDIO__", "AGENTMEMORY_RELEASE_GATE_FAIL_OBSERVE__",
  "AM_HOOK_INPUT_FILE", "AM_HOOK_WORKER", "III_COMPOSE_FILE",
  // The host agent injects these workspace and session markers.
  "COPILOT_AGENT_SESSION_ID", "COPILOT_CLI", "COPILOT_PLUGIN_ROOT",
  "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "CURSOR_WORKSPACE_FOLDER",
  "CURSOR_WORKSPACE_ROOT", "CURSOR_WORKSPACE_LABEL", "DEVIN_PROJECT_DIR",
  "DROID_PLUGIN_ROOT", "FACTORY_PROJECT_DIR", "VSCODE_CWD",
]);
// The pinned iii SDK consumes this supported setting outside src/.
const EXTERNAL_SETTINGS = new Set(["III_TELEMETRY_ENABLED"]);
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() && /\.(?:ts|mts|mjs|js)$/.test(entry.name) && !/\.d\.(?:ts|mts)$/.test(entry.name) ? [path] : [];
  });
}
const paths = files(join(ROOT, "src"));
// Compiler bindings distinguish scoped names and reader aliases without executing source.
const program = ts.createProgram(paths, { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noResolve: true, noLib: true, types: [], allowJs: true, noEmit: true });
const checker = program.getTypeChecker();
const sources = paths.map((path) => program.getSourceFile(path));
const functions = [], calls = [];
function visit(node, fn) { fn(node); ts.forEachChild(node, (child) => visit(child, fn)); }
function bodyNodes(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => { if (!ts.isFunctionLike(child)) bodyNodes(child, fn); });
}
for (const source of sources) visit(source, (node) => {
  if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.body) functions.push(node);
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) calls.push(node);
});
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}
function symbol(node) {
  const value = node && checker.getSymbolAtLocation(node);
  return value?.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(value) : value;
}
function target(node, seen = new Set()) {
  node = unwrap(node);
  if (!node) return undefined;
  if (ts.isFunctionLike(node) && node.body) return node;
  const value = symbol(node);
  if (!value || seen.has(value)) return undefined;
  seen.add(value);
  for (const declaration of value.declarations ?? []) {
    if (ts.isFunctionLike(declaration) && declaration.body) return declaration;
    if ((ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration)) && declaration.initializer) {
      const fn = target(declaration.initializer, seen);
      if (fn) return fn;
    }
  }
}
function constant(node, seen = new Set()) {
  node = unwrap(node);
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  const value = symbol(node);
  if (!value || seen.has(value)) return undefined;
  seen.add(value);
  for (const declaration of value.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && (declaration.parent.flags & ts.NodeFlags.Const)) return constant(declaration.initializer, seen);
  }
}
function builtinImport(node, kind) {
  if (!ts.isIdentifier(node)) return false;
  const value = checker.getSymbolAtLocation(node);
  return value?.declarations?.some((declaration) => {
    let current = declaration;
    while (current && !ts.isImportDeclaration(current)) current = current.parent;
    if (!current || !["node:process", "process"].includes(current.moduleSpecifier.text)) return false;
    if (kind === "process") return ts.isImportClause(declaration) || ts.isNamespaceImport(declaration) || (ts.isImportSpecifier(declaration) && (declaration.propertyName ?? declaration.name).text === "default");
    return ts.isImportSpecifier(declaration) && (declaration.propertyName ?? declaration.name).text === "env";
  }) ?? false;
}
function processObject(node, seen = new Set()) {
  node = unwrap(node);
  if (!node || !ts.isIdentifier(node)) return false;
  if (builtinImport(node, "process")) return true;
  const value = checker.getSymbolAtLocation(node);
  if (!value?.declarations?.length) return node.text === "process";
  if (seen.has(value)) return false;
  seen.add(value);
  return value.declarations.some((declaration) => {
    return ts.isVariableDeclaration(declaration) && (declaration.parent.flags & ts.NodeFlags.Const) && processObject(declaration.initializer, seen);
  });
}
const environmentParameters = new Set(), environmentReturns = new Set();
function environment(node, seen = new Set()) {
  node = unwrap(node);
  if (!node) return false;
  if (builtinImport(node, "env")) return true;
  if (ts.isPropertyAccessExpression(node) && node.name.text === "env" && processObject(node.expression)) return true;
  if (ts.isCallExpression(node) && environmentReturns.has(target(node.expression))) return true;
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) return environment(node.left, new Set(seen)) || environment(node.right, new Set(seen));
  if (ts.isObjectLiteralExpression(node)) return node.properties.some((property) => ts.isSpreadAssignment(property) && environment(property.expression, new Set(seen)));
  const value = symbol(node);
  if (!value || seen.has(value)) return false;
  if (environmentParameters.has(value)) return true;
  seen.add(value);
  for (const declaration of value.declarations ?? []) {
    if (declaration.type?.getText().replace(/\s/g, "") === "NodeJS.ProcessEnv") return true;
    if (declaration.initializer && environment(declaration.initializer, new Set(seen))) return true;
  }
  return false;
}
let changed;
do {
  changed = false;
  for (const call of calls) {
    const fn = target(call.expression);
    if (!fn) continue;
    for (let i = 0; i < fn.parameters.length; i++) {
      const parameter = symbol(fn.parameters[i].name);
      if (parameter && !environmentParameters.has(parameter) && environment(call.arguments?.[i])) { environmentParameters.add(parameter); changed = true; }
    }
  }
  for (const fn of functions) if (!environmentReturns.has(fn)) {
    let returnsEnvironment = !ts.isBlock(fn.body) && environment(fn.body);
    bodyNodes(fn.body, (node) => { if (ts.isReturnStatement(node) && environment(node.expression)) returnsEnvironment = true; });
    if (returnsEnvironment) { environmentReturns.add(fn); changed = true; }
  }
} while (changed);
function readKey(node) {
  if (!(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) || !environment(node.expression)) return undefined;
  if (ts.isDeleteExpression(node.parent)) return undefined;
  if (ts.isBinaryExpression(node.parent) && node.parent.left === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return undefined;
  return ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression;
}
const readers = new Map();
function positions(expression) {
  const fn = target(expression);
  if (fn) return readers.get(fn) ?? [];
  return ts.isIdentifier(expression) && expression.text === "getEnvVar" && !symbol(expression)?.declarations?.length ? [0] : [];
}
do {
  changed = false;
  for (const fn of functions) {
    const result = readers.get(fn) ?? new Set();
    const prior = result.size;
    bodyNodes(fn.body, (node) => {
      const keys = [readKey(node)];
      if (ts.isCallExpression(node)) for (const index of positions(node.expression)) keys.push(node.arguments[index]);
      for (const key of keys) if (key && ts.isIdentifier(key)) {
        const value = symbol(key);
        const index = fn.parameters.findIndex((parameter) => symbol(parameter.name) === value);
        if (index >= 0) result.add(index);
      }
    });
    if (result.size > prior) { readers.set(fn, result); changed = true; }
  }
} while (changed);
const used = new Map();
function record(key, node) {
  if (!key || !/^[A-Z][A-Z0-9_]*$/.test(key) || RUNTIME_ONLY.has(key)) return;
  const source = node.getSourceFile(), { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  if (!used.has(key)) used.set(key, new Set());
  used.get(key).add(`${relative(ROOT, source.fileName)}:${line + 1}`);
}
for (const source of sources) visit(source, (node) => {
  const key = readKey(node);
  if (key) record(ts.isPropertyAccessExpression(node) ? node.name.text : constant(key), node);
  if (ts.isCallExpression(node)) for (const index of positions(node.expression)) record(constant(node.arguments[index]), node);
  if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && environment(node.initializer)) for (const binding of node.name.elements) {
    if (!binding.dotDotDotToken) record((binding.propertyName ?? binding.name).text, binding);
  }
});
const documented = new Set();
for (const line of readFileSync(join(ROOT, ".env.example"), "utf8").split("\n")) {
  const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
  if (match) documented.add(match[1]);
}
const missing = [...used.keys()].filter((name) => !documented.has(name)).sort();
const orphan = [...documented].filter((name) => !used.has(name) && !EXTERNAL_SETTINGS.has(name)).sort();
if (process.argv.includes("--json")) console.log(JSON.stringify({ missing, orphan, readers: Object.fromEntries([...used].sort().map(([name, locations]) => [name, [...locations]])), runtimeOnly: [...RUNTIME_ONLY], externalSettings: [...EXTERNAL_SETTINGS] }, null, 2));
else if (missing.length || orphan.length) {
  for (const name of missing) console.error(`env-example: MISSING ${name} (${[...used.get(name)].join(", ")})`);
  for (const name of orphan) console.error(`env-example: ORPHAN ${name}`);
} else console.log(`env-example: in sync (${used.size} source settings documented)`);
process.exitCode = missing.length || orphan.length ? 1 : 0;
