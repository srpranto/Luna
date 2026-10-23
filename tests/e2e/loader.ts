import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

// Self-register if loaded via --import
try {
  register(import.meta.url, import.meta.url);
} catch {}

const rootDir = process.cwd();

function tryExtensions(filePath: string): string | null {
  const extensions = [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".json",
    "/index.ts",
    "/index.tsx",
    "/index.js",
  ];
  for (const ext of extensions) {
    const candidate = filePath + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export interface ResolveContext {
  conditions: string[];
  parentURL?: string;
}

export interface ResolveResult {
  url: string;
  format?: string | null;
  shortCircuit?: boolean;
}

export type NextResolveFn = (
  specifier: string,
  context: ResolveContext,
) => Promise<ResolveResult>;

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolveFn,
): Promise<ResolveResult> {
  let candidate = specifier;

  if (candidate === "next/server") {
    candidate = "next/server.js";
  } else if (candidate.startsWith("@/")) {
    const fullPath = path.resolve(rootDir, "src", candidate.slice(2));
    const resolved = tryExtensions(fullPath);
    if (resolved) {
      return {
        url: pathToFileURL(resolved).href,
        shortCircuit: true,
      };
    }
  }

  // Handle relative imports from parent files
  if (candidate.startsWith("./") || candidate.startsWith("../")) {
    if (context.parentURL && context.parentURL.startsWith("file://")) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const fullPath = path.resolve(parentDir, candidate);
      const resolved = tryExtensions(fullPath);
      if (resolved) {
        return {
          url: pathToFileURL(resolved).href,
          shortCircuit: true,
        };
      }
    }
  }

  return nextResolve(candidate, context);
}
