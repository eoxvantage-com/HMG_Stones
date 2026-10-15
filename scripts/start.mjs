#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const IMAGE = "repo.eoxvantage.com/hackathon/environment";

// 1. Copy .env.example to .env if .env doesn't exist
const envExample = join(ROOT, ".env.example");
const envLocal = join(ROOT, ".env");

if (!existsSync(envLocal) && existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
  console.log("=== Copied .env.example to .env ===\n");
  console.log("  Please edit .env with your values before continuing.\n");
} else if (!existsSync(envLocal)) {
  console.log("WARNING: No .env or .env.example found.\n");
}

// 2. Pull latest image
console.log("=== Pulling latest Docker image ===\n");
try {
  execSync(`docker pull ${IMAGE}`, { stdio: "inherit", cwd: ROOT });
} catch {
  console.log("\nWARNING: Could not pull latest image, using local cache.\n");
}

// 3. Run container
console.log("\n=== Starting environment via Docker ===\n");
console.log(`  Image  : ${IMAGE}`);
console.log(`  Project: ${ROOT}`);
console.log(`  Dev URL: http://localhost:5173\n`);

const result = spawnSync("docker", [
  "run",
  "--rm",
  "-it",
  "-v", `.:/app`,
  "-p", "5173:5173",
  IMAGE,
], {
  stdio: "inherit",
  cwd: ROOT,
});

process.exit(result.status ?? 1);
