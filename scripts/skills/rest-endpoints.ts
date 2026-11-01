import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const field = object.properties.find((item): item is ts.PropertyAssignment =>
    ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteralLike(item.name)) && item.name.text === name);
  return field?.initializer;
}

function literal(value: ts.Node | undefined): string | undefined {
  return value && ts.isStringLiteralLike(value) ? value.text : undefined;
}

export function collectRestEndpoints(...texts: string[]): { path: string; method: string }[] {
  const rows = new Map<string, { path: string; method: string }>();
  const sources = texts.map((text, index) => ts.createSourceFile(`source-${index}.ts`, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS));
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "registerTrigger") {
      const registration = node.arguments[0];
      if (registration && ts.isObjectLiteralExpression(registration) && literal(property(registration, "type")) === "http") {
        const config = property(registration, "config");
        if (config && ts.isObjectLiteralExpression(config)) {
          const path = literal(property(config, "api_path"));
          const method = literal(property(config, "http_method")) ?? "POST";
          if (path) rows.set(`${method} ${path}`, { path, method });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  for (const source of sources) visit(source);
  return [...rows.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export function collectRestEndpointsInDirectory(directory: string): { path: string; method: string }[] {
  return collectRestEndpoints(...readdirSync(directory)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(join(directory, file), "utf8")));
}
