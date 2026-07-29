/**
 * spec.mjs — parser for the harness task specs.
 *
 * The specs are a deliberately small YAML subset (see tasks/*.yaml), so this
 * avoids a YAML dependency — matching the intent of the original scaffold's
 * "minimal front-of-file parser". It handles exactly the shapes the 8 committed
 * specs use, and THROWS on anything it does not understand rather than silently
 * dropping a field. A silently-dropped `success_assertions` would score every
 * run as vacuously passing.
 *
 * Supported:
 *   key: scalar
 *   key: |            (block scalar)
 *   key: []  / key: {} (empty collections)
 *   key:              (block list)
 *     - item
 *   key:              (block map)
 *     name: value
 *   key: { a: b, c: d } (inline map)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const SCALAR_KEYS = new Set(['id', 'title', 'maps_to_template', 'network']);
const LIST_KEYS = new Set(['preconditions', 'success_assertions']);
const MAP_KEYS = new Set(['inputs', 'scoring']);
const BLOCK_KEYS = new Set(['prompt_to_agent']);

function stripQuotes(v) {
  const s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function coerce(v) {
  const s = stripQuotes(v);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

function parseInlineMap(text) {
  const inner = text.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
  if (!inner) return {};
  const out = {};
  for (const pair of inner.split(',')) {
    const i = pair.indexOf(':');
    if (i < 0) continue;
    out[pair.slice(0, i).trim()] = coerce(pair.slice(i + 1));
  }
  return out;
}

export function parseSpec(text, file = '<inline>') {
  const lines = text.split(/\r?\n/);
  const spec = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!m) {
      throw new Error(`${file}:${i + 1}: unrecognized line "${line}"`);
    }
    const [, key, restRaw] = m;
    const rest = restRaw.trim();
    i++;

    if (BLOCK_KEYS.has(key)) {
      if (rest !== '|' && rest !== '|-') throw new Error(`${file}: expected block scalar for ${key}`);
      const buf = [];
      while (i < lines.length && (lines[i].startsWith('  ') || !lines[i].trim())) {
        buf.push(lines[i].replace(/^ {2}/, ''));
        i++;
      }
      spec[key] = buf.join('\n').trim();
      continue;
    }

    if (rest === '[]') { spec[key] = []; continue; }
    if (rest === '{}') { spec[key] = {}; continue; }
    if (rest.startsWith('{')) { spec[key] = parseInlineMap(rest); continue; }

    if (rest !== '') {
      spec[key] = SCALAR_KEYS.has(key) ? stripQuotes(rest) : coerce(rest);
      continue;
    }

    // Block collection: peek at the first indented child to decide list vs map.
    const items = [];
    const map = {};
    let sawList = false;
    let sawMap = false;
    while (i < lines.length && /^\s+\S/.test(lines[i])) {
      const child = lines[i].trim();
      if (child.startsWith('- ')) {
        sawList = true;
        items.push(stripQuotes(child.slice(2)));
      } else {
        const km = child.match(/^([a-z_]+):\s*(.*)$/i);
        if (!km) throw new Error(`${file}:${i + 1}: unrecognized child "${child}"`);
        sawMap = true;
        map[km[1]] = coerce(km[2]);
      }
      i++;
    }
    if (sawList && sawMap) throw new Error(`${file}: ${key} mixes list and map entries`);
    spec[key] = sawList ? items : map;
  }

  // Fail loudly on shapes we expected but did not get.
  for (const k of LIST_KEYS) {
    if (k in spec && !Array.isArray(spec[k])) throw new Error(`${file}: ${k} must be a list`);
  }
  for (const k of MAP_KEYS) {
    if (k in spec && (typeof spec[k] !== 'object' || Array.isArray(spec[k])))
      throw new Error(`${file}: ${k} must be a map`);
  }

  return spec;
}

export function loadTask(tasksDir, file) {
  const raw = readFileSync(join(tasksDir, file), 'utf-8');
  const spec = parseSpec(raw, file);
  return {
    file,
    // `template` retains the scaffold's original field name for compatibility.
    template: spec.maps_to_template,
    ...spec,
    /** Invalidates cross-run comparison when a spec is edited. */
    specHash: createHash('sha256').update(raw).digest('hex').slice(0, 12),
  };
}

export function loadAllTasks(tasksDir) {
  return readdirSync(tasksDir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => loadTask(tasksDir, f));
}
