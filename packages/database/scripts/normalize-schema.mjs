import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../prisma/schema.prisma", import.meta.url);
let source = await readFile(path, "utf8");

source = source.replace(
  /enum\s+(\w+)\s*\{\s*([^{}\n]+?)\s*\}/g,
  (_, name, members) => {
    const values = members.trim().split(/\s+/).filter(Boolean);
    return `enum ${name} {\n${values.map((value) => `  ${value}`).join("\n")}\n}`;
  },
);

await writeFile(path, source);
