#!/usr/bin/env node
/**
 * The image build's gate (docs/PLAN-catalog.md §8): the catalog in the given directory is present, undamaged,
 * not empty, and built from EXACTLY the pins in content-pins.json. `--fixture` skips the pin comparison, for the
 * labelled test image that carries the small fixture catalog.
 */
import { readFileSync } from "node:fs";
import { loadCatalog } from "../server/catalog.mjs";

const [dir = "catalog", flag] = process.argv.slice(2);
try {
  const pins = flag === "--fixture" ? null : JSON.parse(readFileSync(new URL("../content-pins.json", import.meta.url), "utf8")).content;
  const c = loadCatalog(dir, { pins });
  console.log(`catalog ok: ${c.size} entries${pins ? ", pins match" : " (fixture)"}`);
} catch (err) { console.error(`catalog check failed: ${err.message}`); process.exit(1); }
