import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const versionFile = new URL("../src/version.ts", import.meta.url);
const installFile = new URL("../src/cli/engine-install.ts", import.meta.url);

const pinned = readFileSync(versionFile, "utf8").match(/III_PINNED_VERSION = "([^"]+)"/)?.[1];
const version = process.argv[2] ?? pinned;
if (!version) {
  console.error("usage: npm run engine:hashes [version]");
  process.exit(1);
}

const assets = [
  "iii-aarch64-apple-darwin.tar.gz",
  "iii-x86_64-apple-darwin.tar.gz",
  "iii-x86_64-unknown-linux-gnu.tar.gz",
  "iii-aarch64-unknown-linux-gnu.tar.gz",
  "iii-armv7-unknown-linux-gnueabihf.tar.gz",
  "iii-x86_64-pc-windows-msvc.zip",
  "iii-aarch64-pc-windows-msvc.zip",
];

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

const base = `https://github.com/iii-hq/iii/releases/download/iii/v${version}`;
const lines = [];
for (const asset of assets) {
  const archive = Buffer.from(await (await fetchOk(`${base}/${asset}`)).arrayBuffer());
  const actual = createHash("sha256").update(archive).digest("hex");
  const published = (await (await fetchOk(`${base}/${asset.replace(/\.(tar\.gz|zip)$/, "")}.sha256`)).text()).trim().split(/\s+/)[0];
  if (published !== actual) {
    console.error(`${asset}: archive hashes to ${actual} but the release lists ${published}`);
    process.exit(1);
  }
  console.log(`${asset} ${actual}`);
  lines.push(`    "${asset}": "${actual}",`);
}

const source = readFileSync(installFile, "utf8");
const table = /export const III_RELEASE_SHA256: ChecksumTable = \{\n[\s\S]*?\n\};\n/;
if (!table.test(source)) {
  console.error("III_RELEASE_SHA256 table not found in src/cli/engine-install.ts");
  process.exit(1);
}
const block = `export const III_RELEASE_SHA256: ChecksumTable = {\n  "${version}": {\n${lines.join("\n")}\n  },\n};\n`;
writeFileSync(installFile, source.replace(table, block));
console.log(`wrote hashes for iii v${version} to src/cli/engine-install.ts`);
