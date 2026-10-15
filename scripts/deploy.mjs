#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync, createWriteStream, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";

const ROOT = resolve(import.meta.dirname, "..");

// ── Helpers ──────────────────────────────────────────────────

function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) {
    console.error("ERROR: .env file not found.");
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function zipDir(sourceDir, outPath) {
  const output = createWriteStream(outPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
  });

  archive.pipe(output);
  archive.directory(sourceDir, false);
  await archive.finalize();
  await done;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  process.chdir(ROOT);

  // 1. Load env
  const env = loadEnv();
  const apiKey = env.TARUVI_API_KEY;
  const appSlug = env.TARUVI_APP_SLUG;

  if (!apiKey) {
    console.error("ERROR: TARUVI_API_KEY not found in .env");
    process.exit(1);
  }

  // 2. Prompt for site name
  const siteName = await ask("Enter the site name (e.g., appbuild, mysite): ");
  if (!siteName) {
    console.error("ERROR: Site name is required.");
    process.exit(1);
  }

  // 3. Resolve app name
  let appName = appSlug;
  if (!appName) {
    appName = await ask("Enter the app name: ");
  }
  if (!appName) {
    console.error("ERROR: App name is required.");
    process.exit(1);
  }

  // 4. Build
  console.log("\n=== Step 1: Building project ===");
  try {
    execSync("npm run build", { stdio: "inherit", cwd: ROOT });
  } catch {
    console.error("ERROR: Build failed.");
    process.exit(1);
  }

  // 5. Zip dist folder
  console.log("\n=== Step 2: Zipping dist folder ===");
  const distDir = join(ROOT, "dist");
  const zipPath = join(ROOT, "dist.zip");

  if (!existsSync(distDir)) {
    console.error("ERROR: dist/ folder not found. Build may have failed.");
    process.exit(1);
  }
  if (existsSync(zipPath)) unlinkSync(zipPath);

  await zipDir(distDir, zipPath);
  console.log("Created dist.zip");

  // 6. Upload
  console.log("\n=== Step 3: Uploading to Taruvi ===");
  const uploadUrl = `https://api.taruvi.cloud/sites/${siteName}/api/cloud/frontend_workers/`;
  console.log(`  Site Name: ${siteName}`);
  console.log(`  App Name : ${appName}`);
  console.log(`  Endpoint : ${uploadUrl}`);

  const zipBuffer = readFileSync(zipPath);
  const blob = new Blob([zipBuffer], { type: "application/zip" });

  const formData = new FormData();
  formData.append("name", appName);
  formData.append("is_internal", "true");
  formData.append("file", blob, `${appName}.zip`);

  try {
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Api-Key ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`\nERROR: Upload failed (${response.status}): ${text}`);
      process.exit(1);
    }

    const result = await response.json().catch(() => null);
    console.log("\nUpload response:", result || "OK");
  } catch (err) {
    console.error(`\nERROR: Upload failed: ${err.message}`);
    process.exit(1);
  }

  // 7. Cleanup
  console.log("\n=== Step 4: Cleanup ===");
  unlinkSync(zipPath);
  console.log("Removed dist.zip");

  console.log(`\n=== Deployment Complete ===`);
  console.log(`App '${appName}' deployed to site '${siteName}' successfully.`);
}

main();
