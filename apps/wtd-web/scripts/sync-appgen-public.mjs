#!/usr/bin/env node
/**
 * Copy monolith static assets into public/appgen for Next dev/build.
 * Source of truth: repo appgen/assets (same as Application_Generator.html).
 */
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "../..");
const srcAssets = path.join(repoRoot, "appgen", "assets");
const destRoot = path.join(appRoot, "public", "appgen");
const destAssets = path.join(destRoot, "assets");

await mkdir(destRoot, { recursive: true });
await rm(destAssets, { recursive: true, force: true });
await cp(srcAssets, destAssets, { recursive: true });
console.log("[wtd-web] synced appgen/assets → public/appgen/assets");
