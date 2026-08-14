import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const declarationPattern = /^(problem|premise|evidence|decision|comparison|pending|viewpoint|partition)\s+([A-Za-z][A-Za-z0-9_-]*)(?:\s+based_on\s+([^:]+))?:\s*$/;

function runSealgraph(arguments_, workingDirectory) {
  const result = spawnSync("sealgraph", arguments_, {
    cwd: workingDirectory,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim());
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function parseStatements(source) {
  const lines = source.split(/\r?\n/);
  const declarations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(declarationPattern);
    if (!match) continue;
    declarations.push({
      role: match[1],
      id: match[2],
      dependencies: (match[3] ?? "").split(",").map((value) => value.trim()).filter(Boolean),
      start: index,
    });
  }

  return declarations.map((declaration, index) => ({
    ...declaration,
    content: `${lines.slice(declaration.start, declarations[index + 1]?.start ?? lines.length).join("\n").trimEnd()}\n`,
  }));
}

function projectFile(filePath) {
  const source = readFileSync(filePath, "utf8");
  const statements = parseStatements(source);
  const statementById = new Map(statements.map((statement) => [statement.id, statement]));

  if (statementById.size !== statements.length) {
    throw new Error("duplicate statement IDs cannot be projected");
  }
  if (statements.length === 0) {
    throw new Error("no supported flattened LLMTHINK statements were found");
  }

  for (const statement of statements) {
    for (const dependency of statement.dependencies) {
      if (!statementById.has(dependency)) {
        throw new Error(`${statement.id} refers to missing dependency ${dependency}`);
      }
    }
  }

  const storagePath = mkdtempSync(join(tmpdir(), "kshiai-adr-sealgraph-"));
  try {
    runSealgraph(["init"], storagePath);
    const sealed = new Set();
    const remaining = new Map(
      statements
        .filter((statement) => statement.role !== "pending")
        .map((statement) => [statement.id, statement]),
    );

    while (remaining.size > 0) {
      const ready = [...remaining.values()].filter((statement) =>
        statement.dependencies.every((dependency) => sealed.has(dependency)),
      );
      if (ready.length === 0) {
        throw new Error(`cycle or dependency on an unsealed pending statement: ${[...remaining.keys()].join(", ")}`);
      }

      for (const statement of ready) {
        const addArguments = ["add", statement.id, "--content", statement.content];
        if (statement.dependencies.length === 0) {
          addArguments.push("--root");
        } else {
          for (const dependency of statement.dependencies) {
            addArguments.push("--depend-on", dependency);
          }
        }
        runSealgraph(addArguments, storagePath);
        runSealgraph(["seal", statement.id], storagePath);
        sealed.add(statement.id);
        remaining.delete(statement.id);
      }
    }

    for (const statement of statements.filter((candidate) => candidate.role === "pending")) {
      const addArguments = ["add", statement.id, "--content", statement.content, "--draft"];
      if (statement.dependencies.length === 0) {
        addArguments.push("--root");
      } else {
        for (const dependency of statement.dependencies) {
          if (!sealed.has(dependency)) {
            throw new Error(`pending ${statement.id} depends on unsealed ${dependency}`);
          }
          addArguments.push("--depend-on", dependency);
        }
      }
      runSealgraph(addArguments, storagePath);
    }

    const digest = createHash("sha256").update(source).digest("hex");
    console.log(`[sealgraph advisory] ${basename(filePath)} source_sha256=${digest}`);
    console.log(runSealgraph(["stale", "--frontier"], storagePath));
    console.log(runSealgraph(["graph"], storagePath));
  } finally {
    rmSync(storagePath, { recursive: true, force: true });
  }
}

let requestedFiles = process.argv.slice(2);
if (requestedFiles.length === 0) {
  requestedFiles = readdirSync(join(repositoryRoot, "docs", "adr"))
    .filter((name) => /^\d{4}-.+\.think$/.test(name))
    .filter((name) => Number.parseInt(name.slice(0, 4), 10) >= 15)
    .map((name) => join("docs", "adr", name));
}

try {
  const version = runSealgraph(["--version"], repositoryRoot);
  console.log(`[sealgraph advisory] ${version}`);
  for (const requestedFile of requestedFiles) {
    projectFile(isAbsolute(requestedFile) ? requestedFile : resolve(repositoryRoot, requestedFile));
  }
} catch (error) {
  console.warn(`[sealgraph advisory] unavailable or incompatible: ${error.message}`);
  console.warn("[sealgraph advisory] no canonical ADR was changed; update this disposable projection from the .think source when practical");
}
