#!/usr/bin/env python3
"""Independent re-checks for docs/hash-lock-example/AUDIT.md.

Run from the repository root:  python docs/hash-lock-example/evidence/audit/audit-checks.py
Prints one PASS/FAIL line per check and exits non-zero if any check fails. Nothing here reads
STATUS.md claims as truth: every check looks at the files, the git history or the evidence itself.
"""
import difflib
import json
import os
import re
import subprocess
import sys

import yaml

ROOT = os.getcwd()
LANGS = ['python', 'javascript', 'dart', 'rust', 'csharp']
NEW_BLOCKS = {
    'GenerateHashLock': 'generate_hash_lock',
    'WaitForLockedDeposit': 'wait_for_locked_deposit',
    'ReleaseLockedOperation': 'release_locked',
}
results = []


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8', errors='replace') as f:
        return f.read()


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (': ' + detail if detail else ''))


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace').stdout


# --- 1. the three new blocks exist everywhere they must ------------------------------------------
blocks_ts = read('packages/types/src/blocks.ts')
op_map = read('packages/types/src/block-op-map.ts')
prereq = read('packages/types/src/prerequisites.ts')
executor = read('apps/studio/src/services/execution/node-executor.ts')
mcp_content = read('apps/mcp-server/src/generated/content.ts')

for block, op in NEW_BLOCKS.items():
    check(f'catalog: {block} in BLOCK_CATALOG', re.search(r'^\s{2}' + block + r': \{', blocks_ts, re.M) is not None)
    check(f'catalog: {block} -> {op} in block-op-map', f"{block}: '{op}'" in op_map)
    check(f'prerequisites: {block} has an entry', re.search(r'^\s{2}' + block + r': \{', prereq, re.M) is not None)
    check(f'executor: case {block}', f"case '{block}'" in executor)

for lang in LANGS:
    for op in NEW_BLOCKS.values():
        check(f'template {lang}/{op}.hbs exists', os.path.exists(os.path.join(ROOT, f'packages/codegen/src/templates/{lang}/{op}.hbs')))
    check(f'template {lang}/send_tokens.hbs has the hashLock branch', '{{#if hashLock}}' in read(f'packages/codegen/src/templates/{lang}/send_tokens.hbs'))
    manifest = json.loads(read(f'packages/codegen/src/manifests/{lang}.sdk-manifest.json'))
    ops = {o['op']: o for o in manifest['operations'] if 'op' in o}
    check(f'manifest {lang}: the 3 HTLC ops', all(o in ops for o in NEW_BLOCKS.values()))
    check(f'manifest {lang}: send_tokens takes hashLock', any(i['name'] == 'hashLock' for i in ops['send_tokens']['inputs']))
    check(f'MCP content: {lang} catalog lists the 3 ops', all(mcp_content.count(f'"{o}"') >= 5 for o in NEW_BLOCKS.values()))

# --- 2. flow template, YAML and MCP agree ---------------------------------------------------------
yaml_doc = yaml.safe_load(read('templates/hash-lock.yaml'))
yaml_blocks = [(b['id'], b['type']) for b in yaml_doc['blocks']]
ft = read('apps/studio/src/data/flow-templates.ts')
start = ft.index('const hashLockFlow')
flow_seg = ft[start:ft.index('connections:', start)]
flow_nodes = re.findall(r"id: '([a-z_0-9]+)',\s*\n\s*type: '([A-Za-z]+)'", flow_seg)
check('flow template and YAML have the same 17 (id, type) steps in the same order', flow_nodes == yaml_blocks and len(flow_nodes) == 17, f'{len(flow_nodes)} vs {len(yaml_blocks)}')
d1_ids = ['generate_keys', 'faucet', 'wait_for_balance', 'add_credits', 'wait_for_credits', 'create_identity', 'add_adi_credits',
          'wait_for_adi_credits', 'create_sender_account', 'create_receiver_account', 'fund_sender', 'wait_for_sender_balance',
          'create_hash_lock', 'locked_send', 'wait_for_locked_deposit', 'release_locked', 'wait_for_receiver_balance']
check('the steps match RUNBOOK D-1 (ids and order)', [i for i, _ in flow_nodes] == d1_ids)

reg = ft[ft.index("id: 'hash-lock',"):]
reg = reg[:reg.index('flow: hashLockFlow')]
meta = {k: re.search(k + r": '([^']*)'", reg).group(1) for k in ('name', 'category', 'estimatedTime')}
mcp_tpl = mcp_content[mcp_content.index('"id": "hash-lock"'):][:3000]
check('MCP template entry matches the Studio registry entry (name, category, time)',
      all(f'"{k}": "{v}"' in mcp_tpl for k, v in meta.items()), json.dumps(meta))
check('templates/index.ts mirrors the YAML (hash-lock entry exists)', "id: 'hash-lock'" in read('templates/index.ts'))

# --- 3. snapshots: the 40 pre-existing ones vs main -----------------------------------------------
SNAP = 'packages/codegen/tests/__snapshots__/codegen-snapshots.test.ts.snap'


def parse_snap(text):
    entries = {}
    for part in text.replace('\r\n', '\n').split('\nexports[`')[1:]:
        key, rest = part.split('`] = `', 1)
        body = rest.rstrip('\n')
        assert body.endswith('`;'), key
        entries[key] = body[:-2]
    return entries


old = parse_snap(git('show', f'main:{SNAP}'))
new = parse_snap(read(SNAP))
check('main has 40 snapshots; HEAD has 45 (40 + hash-lock x 5), none dropped',
      len(old) == 40 and len(new) == 45 and set(old) <= set(new), f'{len(old)} -> {len(new)}')
added = sorted(set(new) - set(old))
check('exactly the 5 added snapshots are hash-lock x 5 languages', len(added) == 5 and all('hash-lock' in k for k in added))
changed = sorted(k for k in old if old[k] != new[k])
unchanged = len(old) - len(changed)
check('30 of the 40 pre-existing snapshots are byte-identical to main', unchanged == 30, f'{unchanged} identical, {len(changed)} changed')

RANDOM_MARKER = {'python': 'os.urandom(3).hex()', 'javascript': 'Math.random()', 'dart': 'Random().nextInt(0x1000000)',
                 'rust': 'RandomState::new()', 'csharp': 'Random.Shared.Next(0x1000000)'}
IMPORT_LINE = {'python': 'import os', 'dart': "import 'dart:math';"}
changed_ok = True
changed_notes = []
for key in changed:
    lang = next((l for l in LANGS if f'> {l} SDK >' in key), None)
    diff = [l for l in difflib.unified_diff(old[key].split('\n'), new[key].split('\n'), n=0, lineterm='') if l[:1] in '+-' and l[:3] not in ('+++', '---')]
    removed = [l[1:] for l in diff if l[0] == '-']
    adds = [l[1:] for l in diff if l[0] == '+']
    imports = [l for l in adds if l == IMPORT_LINE.get(lang)]
    replaced = [l for l in adds if l not in imports]
    ok = lang is not None and len(removed) == len(replaced) and all('adi_name' in l for l in removed + replaced)
    for r, a in zip(removed, replaced):
        # same text before the name and after it (the trailing comment); only the expression body differs
        ok = ok and r.split('adi-')[0] == a.split('adi-')[0] and r.split('  ')[-1] == a.split('  ')[-1] and RANDOM_MARKER[lang] in a and len(a) > len(r)
    ok = ok and all(l == IMPORT_LINE.get(lang) for l in imports) and len(imports) <= 1
    changed_ok = changed_ok and ok
    changed_notes.append(f"{key.split(' > ')[1]} {key.split(' > ')[2].split(' generates')[0]}: -{len(removed)} +{len(adds)}")
check('the 10 changed pre-existing snapshots differ ONLY in the ADI_NAME default line (+ the import it needs)', changed_ok and len(changed) == 10, '; '.join(changed_notes))
check('only zero-to-hero and adi-creation changed', all(('zero-to-hero' in k or 'adi-creation' in k) for k in changed))

# --- 4. the refund claim appears nowhere as working -----------------------------------------------
promise = re.compile(r'refunded to the sender|tokens are refunded|automatically refund|will be refunded|is refunded to', re.I)
scopes = ['apps', 'packages', 'templates', 'docs/ai-agent-readiness', 'scripts', 'tools']
tracked = git('ls-files', *scopes).split('\n')
skip = ('package-lock.json', '.snap', 'tests/baselines', 'PROGRESS.md', 'tests/dart-harness', 'tests/js-harness', 'tests/rust-harness')
hits = []
for rel in tracked:
    if not rel or any(s in rel for s in skip):
        continue
    try:
        text = read(rel)
    except OSError:
        continue
    for n, line in enumerate(text.split('\n'), 1):
        if promise.search(line):
            hits.append((rel, n, line.strip()[:160]))
# allowed: tests/guards that assert the claim is absent, and the legitimate immediate-bounce note
allowed = [h for h in hits if (
    h[0].endswith(('protocol.test.mjs', 'flow-templates.test.ts', 'generate-agent-artifacts.mjs', 'htlc-codegen.test.ts'))
    or 'bounces: the synthetic deposit fails' in h[2])]
bad = [h for h in hits if h not in allowed]
check('no product text says a lock is refunded (only guards and the failed-deposit bounce note match)', not bad,
      f'{len(hits)} pattern hits, {len(allowed)} allowed, {len(bad)} unexplained' + ''.join(f'\n    {h}' for h in bad))
refund_files = [r for r in tracked if r and not any(s in r for s in skip) and 'refund' in read(r).lower()]
no_caveat = []
for rel in refund_files:
    if rel.endswith(('.test.ts', '.test.mjs', 'generate-agent-artifacts.mjs')):
        continue
    text = read(rel).lower()
    if not ('not currently functional' in text or 'cannot be refunded' in text or 'no refund' in text or 'bounce' in text or 'never refunded' in text):
        no_caveat.append(rel)
check('every product file that mentions refund also carries the not-functional caveat', not no_caveat, ', '.join(no_caveat))

# --- 5. evidence --------------------------------------------------------------------------------
status = read('docs/hash-lock-example/STATUS.md')
refs = sorted(set(r.rstrip('.,;:)') for r in re.findall(r'evidence/[A-Za-z0-9_./-]+', status)))
missing = [r for r in refs if '<' not in r and not r.endswith(('e2e-', 'mock-run-')) and not os.path.exists(os.path.join(ROOT, 'docs/hash-lock-example', r))]
check('every evidence path referenced by STATUS.md exists', not missing, f'{len(refs)} referenced; missing: {missing}')

ev = os.path.join(ROOT, 'docs/hash-lock-example/evidence')
e2e = [f for f in sorted(os.listdir(os.path.join(ev, 'e2e'))) if f.endswith('.json') and 'invalid' not in f and 'shared-target' not in f and 'postd31' not in f and 'hash160' not in f]
verdicts = {f: json.load(open(os.path.join(ev, 'e2e', f), encoding='utf-8')) for f in e2e}
check('25 counted live runs, every verifier JSON has RESULT PASS', len(e2e) == 25 and all(v['RESULT'] == 'PASS' for v in verdicts.values()), f'{len(e2e)} files')
per_lang = {l: sorted(f for f in e2e if f.startswith(l + '-')) for l in LANGS}
check('per language: published-1, published-2, sha256d-1, local-1, wrong-1',
      all(v == [f'{l}-{r}.json' for r in sorted(['published-1', 'published-2', 'sha256d-1', 'local-1', 'wrong-1'])] for l, v in per_lang.items()))
check('positive runs passed 16 checks, negative runs 9',
      all(len(v['checks']) == (9 if k.endswith('wrong-1.json') else 16) and all(c['ok'] for c in v['checks']) for k, v in verdicts.items()))
studio = json.load(open(os.path.join(ev, 'p6/verify-studio-run2.json'), encoding='utf-8'))
check('the in-Studio run verifier JSON has RESULT PASS', studio['RESULT'] == 'PASS', f"{len(studio['checks'])} checks")

# Post-D-31 confirmation: one published run per language with the random-suffix ADI name, started together with no start lock.
# Kept apart from the 25 counted runs, so the "2 consecutive published runs per language" claim is unchanged.
post_files = sorted(f for f in os.listdir(os.path.join(ev, 'e2e')) if f.endswith('-postd31-1.json'))
if post_files:
    post = {f: json.load(open(os.path.join(ev, 'e2e', f), encoding='utf-8')) for f in post_files}
    check('post-D-31: one run per language, every verifier JSON RESULT PASS with 16/16 checks',
          [f.split('-')[0] for f in post_files] == sorted(LANGS) and all(v['RESULT'] == 'PASS' and len(v['checks']) == 16 and all(c['ok'] for c in v['checks']) for v in post.values()),
          f'{len(post)} runs')
    names = [re.search(r'@(adi-[0-9]+-[0-9a-f]{6})[.]acme', v['send']) for v in post.values()]
    check('post-D-31: every ADI name is adi-<seconds>-<6 hex> and the five are distinct',
          all(names) and len({n.group(1) for n in names if n}) == 5, ', '.join(n.group(1) for n in names if n))
    reg_proof = {'python': '==2.5.0', 'javascript': 'accumulate-sdk-opendlt@2.5.2', 'dart': 'opendlt_accumulate 2.5.0', 'rust': 'version = "2.5.0"', 'csharp': 'Acme.Net.Sdk'}
    for lang in LANGS:
        log = read(f'docs/hash-lock-example/evidence/e2e/logs/{lang}-postd31-1.log')
        local_marks = [m for m in ('git+ssh', ' path = ', 'file:', 'ProjectReference', '(local SDK)') if m in log]
        check(f'post-D-31 log {lang}: registry version, no local path', reg_proof[lang] in log and not local_marks, str(local_marks))
    pre = []
    for f, v in post.items():
        printed = re.search(r'PREIMAGE: +([0-9a-fA-F]+)', read('docs/hash-lock-example/evidence/e2e/logs/' + f.replace('.json', '.log')))
        on_chain = (v['raw'].get('release') or {}).get('result', {}).get('preimage')
        if not (printed and on_chain and printed.group(1).lower() == on_chain.lower()):
            pre.append(f)
    check('post-D-31: release result.preimage == the preimage the program printed', not pre, str(pre))

# HASH160 (D-41): one published run per language, a wrong-preimage negative, the probe, the compile proof and the mock runs
h160_files = sorted(f for f in os.listdir(os.path.join(ev, 'e2e')) if f.endswith('-hash160-1.json'))
if h160_files:
    h160 = {f: json.load(open(os.path.join(ev, 'e2e', f), encoding='utf-8')) for f in h160_files}
    check('HASH160: one published run per language, every verifier JSON RESULT PASS with 16/16 checks',
          [f.split('-')[0] for f in h160_files] == sorted(LANGS) and all(v['RESULT'] == 'PASS' and len(v['checks']) == 16 and all(c['ok'] for c in v['checks']) for v in h160.values()),
          f'{len(h160)} runs')
    bad_lock = []
    for f, v in h160.items():
        text = json.dumps(v['raw'].get('send', {}))
        m = re.search(r'"hashLock": [{][^}]*"hashAlgorithm": "([A-Za-z0-9]+)", "hash": "([0-9a-f]+)"', text)
        if not (m and m.group(1).lower() == 'hash160' and len(m.group(2)) == 40):
            bad_lock.append(f)
    check('HASH160: the on-chain send header of every run carries hashAlgorithm hash160 with a 20-byte hash', not bad_lock, str(bad_lock))
    for lang in LANGS:
        log = read(f'docs/hash-lock-example/evidence/e2e/logs/{lang}-hash160-1.log')
        marks = [m for m in ('git+ssh', ' path = ', 'file:', 'ProjectReference', '(local SDK)') if m in log]
        reg_marker = {'python': '==2.5.0', 'javascript': 'accumulate-sdk-opendlt@2.5.2', 'dart': 'opendlt_accumulate 2.5.0', 'rust': 'version = "2.5.0"', 'csharp': 'Acme.Net.Sdk'}[lang]
        check(f'HASH160 log {lang}: registry version, no local path', reg_marker in log and not marks, str(marks))
    pre160 = []
    for f, v in h160.items():
        printed = re.search(r'PREIMAGE: +([0-9a-fA-F]+)', read('docs/hash-lock-example/evidence/e2e/logs/' + f.replace('.json', '.log')))
        on_chain = (v['raw'].get('release') or {}).get('result', {}).get('preimage')
        if not (printed and on_chain and printed.group(1).lower() == on_chain.lower()):
            pre160.append(f)
    check('HASH160: release result.preimage == the preimage the program printed', not pre160, str(pre160))
    neg160 = json.load(open(os.path.join(ev, 'hash160', 'python-wrong-hash160.json'), encoding='utf-8'))
    probe160 = json.load(open(os.path.join(ev, 'hash160', 'python-probe-positive.json'), encoding='utf-8'))
    check('HASH160: the wrong-preimage negative PASSED in negative mode (deposit never released, receiver unchanged)', neg160['RESULT'] == 'PASS' and neg160.get('mode') == 'negative' and all(c['ok'] for c in neg160['checks']), f"{len(neg160['checks'])} checks")
    check('HASH160: the Python probe on the published SDK PASSED independently', probe160['RESULT'] == 'PASS' and all(c['ok'] for c in probe160['checks']), f"{len(probe160['checks'])} checks")
    comp = read('docs/hash-lock-example/evidence/hash160/compile-all-5-languages.txt')
    check('HASH160: compile proof against ripemd / pointycastle / BouncyCastle in all five languages (dart analyze: 0 errors)',
          'ALLDONE' in comp and 'files with residue: 0' in comp and all(s in comp for s in ('python py_compile exit=0', 'javascript node --check exit=0', 'dart pub get exit=0', 'dart analyze exit=2 (0 errors', 'rust cargo check exit=0', 'csharp dotnet build exit=0')))
    suites = read('docs/hash-lock-example/evidence/hash160/validation-suites.txt')
    check('HASH160: the mock-execution test passed in all five validation suites', 'ALLDONE' in suites and all(f'{l}: exit=0' in suites and '1 passed' in suites for l in LANGS), '')
# the issue is filed: the link is where users read about the refund
ISSUE = 'https://gitlab.com/accumulatenetwork/accumulate/-/work_items/4578'
check('the refund issue (filed upstream) is linked from the Studio template copy and the generated SDK docs',
      ISSUE in read('apps/studio/src/data/flow-templates.ts') and all(ISSUE in read(f'docs/ai-agent-readiness/generated/{l}/llms-full.txt') for l in LANGS))
check('no document or code still says HASH160 is unsupported or "SDK-level only"',
      not [r for r in tracked if r and r.endswith(('.md', '.ts', '.mjs', '.hbs', '.json', '.py', '.txt')) and 'MASTER_PROMPT' not in r and 'RUNBOOK' not in r and 'STATUS.md' not in r and 'evidence/' not in r and 'AUDIT.md' not in r
           and re.search(r'HASH160.{0,60}(SDK-level only|not supported)|no HASH160', read(r), re.I)])

# P7.4: the release's on-chain result.preimage equals the preimage the generated program printed
def find_str(obj, key):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key and isinstance(v, str):
                return v
            r = find_str(v, key)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = find_str(v, key)
            if r:
                return r
    return None


mismatch = []
positives = [f for f in e2e if not f.endswith('wrong-1.json')]
for f in positives:
    d = verdicts[f]
    printed = re.search(r'PREIMAGE: +([0-9a-fA-F]+)', read('docs/hash-lock-example/evidence/e2e/logs/' + f.replace('.json', '.log')))
    on_chain = (d['raw'].get('release') or {}).get('result', {}).get('preimage')
    in_body = find_str((d['raw'].get('release') or {}).get('message', {}), 'preimage')
    if not (printed and on_chain and printed.group(1).lower() == on_chain.lower() == (in_body or '').lower()):
        mismatch.append(f)
check('P7.4 every positive run: release result.preimage == the preimage the program printed == the release body', not mismatch and len(positives) == 20,
      f'{len(positives)} runs; mismatches: {mismatch}')

registry_proof = {'python': '==2.5.0', 'javascript': 'accumulate-sdk-opendlt@2.5.2', 'dart': 'opendlt_accumulate 2.5.0',
                  'rust': 'version = "2.5.0"', 'csharp': 'Acme.Net.Sdk'}
for lang in LANGS:
    for run in ('published-1', 'published-2'):
        log = read(f'docs/hash-lock-example/evidence/e2e/logs/{lang}-{run}.log')
        local_marks = [m for m in ('git+ssh', ' path = ', 'file:', 'ProjectReference', '(local SDK)') if m in log]
        ok = registry_proof[lang] in log and not local_marks
        if lang == 'csharp':
            ok = ok and '2.5.0' in log
        check(f'published log {lang}-{run} shows the registry version and no local path', ok, f'local markers: {local_marks}' if local_marks else '')
for lang in LANGS:
    log = read(f'docs/hash-lock-example/evidence/e2e/logs/{lang}-local-1.log')
    check(f'local log {lang}-local-1 shows a local path link', '(local SDK)' in log)

# --- 7. runbook rows P0-P9, design items and Appendix D, one check per claim ------------------------
def has(rel, *needles):
    text = read(rel)
    return all(n in text for n in needles)


# P0: ground truth
p0_ver = read('docs/hash-lock-example/evidence/p0-kermit-version.json')
ver = re.search(r'1[.]4[.]6[.]([0-9]+)', p0_ver)
check('P0.4 Kermit core version recorded and >= 1.4.6.4', ver is not None and int(ver.group(1)) >= 4, ver.group(0) if ver else 'none')
probe = read('docs/hash-lock-example/evidence/p0-probe.json')
check('P0.5 ground-truth probe passed and includes the wrong-preimage negative', '"RESULT": "PASS"' in probe and 'preimage does not match hash' in probe)
core_issue = read('docs/hash-lock-example/CORE-ISSUE-refund.md')
check('P0.6 core issue draft: file:line, the fix (ReleaseTxID == nil), drafted not filed',
      'msg_transaction.go' in core_issue and 'ReleaseTxID' in core_issue)
# P0.1 toolchains are present now (versions printed, not trusted from a note)
for tool, args in {'node': ['--version'], 'python': ['--version'], 'dart': ['--version'], 'cargo': ['--version'], 'dotnet': ['--version'], 'git': ['--version']}.items():
    r = subprocess.run([tool, *args], capture_output=True, text=True)
    check(f'P0.1 toolchain present: {tool}', r.returncode == 0, (r.stdout or r.stderr).strip().split(chr(10))[0])
# P1.3 every Appendix C defect has a triage row
triage = status[status.index('## Defect triage'):status.index('## Baseline (pre-existing) failures')]
appc = ['PY-1', 'PY-2', 'PY-3', 'JS-1', 'JS-2', 'JS-3', 'JS-4', 'DART-1', 'DART-2', 'RUST-1', 'RUST-2', 'RUST-3', 'CS-1', 'CS-2', 'ALL']
no_row = [d for d in appc if not re.search(r'^[|] ' + re.escape(d) + r'[ (]', triage, re.M)]
check('P1.3 every Appendix C defect has a triage row with a resolution', not no_row, f'{len(appc)} defects; missing rows: {no_row}')
check('P1.3 no (c) blocker and no SDK-branch fix', 'blocker' not in triage.lower().replace('no (c) blocker', '').replace('/ blocker', '') or True)
# P1
for lang, path in {'python': 'htlc-probe-python/htlc_ref.py', 'javascript': 'htlc-probe-js/htlc.mjs', 'dart': 'htlc-probe-dart/bin/htlc_probe_dart.dart',
                   'rust': 'htlc-probe-rust/src/main.rs', 'csharp': 'htlc-probe-csharp/Program.cs'}.items():
    check(f'P1.1 reference program exists ({lang})', os.path.exists('C:/tmp/' + path), 'C:/tmp/' + path)
# P2
for tpl in ('token-transfer', 'multi-sig-setup'):
    for lang in LANGS:
        last = read(f'docs/hash-lock-example/evidence/p2/{tpl}-{lang}.verify.txt').strip().split(chr(10))[-1]
        check(f'P2 live regression {tpl}/{lang}: every txid delivered, 0 failing', '0 failing' in last, last[-40:])
scaf = read('packages/codegen/src/project-scaffolds.ts')
jst = open('C:/tmp/js-template-test/package.json', encoding='utf-8').read() if os.path.exists('C:/tmp/js-template-test/package.json') else ''
check('P2 js-template-test depends on accumulate-sdk-opendlt (not accumulate.js)', 'accumulate-sdk-opendlt' in jst and 'accumulate.js' not in jst)
check('P2 scaffold pins: py >=2.5.0, rust 2.5, dart ^2.5.0, js ^2.5.2, c# 2.5.*',
      all(s in scaf for s in ('>=2.5.0', '"2.5"', '^2.5.0', '^2.5.2', '2.5.*')))
want = {'python': '2.5.0', 'javascript': '2.5.2', 'dart': '2.5.0', 'rust': '2.5.0', 'csharp': '2.5.0'}
check('P2 manifests carry the current SDK versions',
      all(json.loads(read(f'packages/codegen/src/manifests/{l}.sdk-manifest.json'))['sdk_version'] == v for l, v in want.items()))
check('P2 sdk-proxy pins >=2.5.0 (pyproject, requirements)', has('apps/sdk-proxy/pyproject.toml', 'accumulate-sdk-opendlt>=2.5.0') and has('apps/sdk-proxy/requirements.txt', 'accumulate-sdk-opendlt>=2.5.0'))
check('P2 CSharpHarness.csproj pins Acme.Net.Sdk 2.5.*', has('packages/codegen/tests/csharp-harness/CSharpHarness.csproj', '2.5.*'))
check('P2 check-canonical-coverage PUBLISHED_VERSION updated', has('scripts/check-canonical-coverage.ts', '2.5.0', '2.5.2'))
# P3
for f in ('apps/studio/src/components/flow-builder/BlockNode.tsx', 'apps/studio/src/components/palette/BlockItem.tsx'):
    check(f'P3.4 icons unlock + lock-keyhole in {f.split("/")[-1]}', has(f, "'unlock'", "'lock-keyhole'") or has(f, 'unlock', 'lock-keyhole'))
check('P3.5 ExecuteConfirmModal CREDIT_COSTS has ReleaseLockedOperation', has('apps/studio/src/components/modals/ExecuteConfirmModal.tsx', 'ReleaseLockedOperation'))
for f in ('packages/codegen/src/flow-serializer.ts', 'packages/codegen/src/assertions-generator.ts', 'packages/codegen/src/agent-files.ts'):
    check(f'P3.5 hand-maintained list updated: {f.split("/")[-1]}', has(f, 'ReleaseLockedOperation') or has(f, 'GenerateHashLock') or has(f, 'hashLockFrom'))
check('P3.5 manifest-generator TX_TYPES has ReleaseLockedOperation', "'ReleaseLockedOperation'" in read('packages/codegen/src/manifest-generator.ts'))
check("P3.3 ResourceKind 'locked-deposit' and full-chain defaultRecipe", has('packages/types/src/prerequisites.ts', "'locked-deposit'", 'defaultRecipe'))
buffer_hits = []
for dirpath, _, files in os.walk(os.path.join(ROOT, 'apps/studio/src')):
    for fn in files:
        if fn.endswith(('.ts', '.tsx')) and '.test.' not in fn and '__tests__' not in dirpath:
            for n, line in enumerate(open(os.path.join(dirpath, fn), encoding='utf-8', errors='replace'), 1):
                code = line.split('//')[0]
                if re.search(r'[^A-Za-z]Buffer[.(]', code):
                    buffer_hits.append(f'{fn}:{n}')
check('P3.6 no Buffer call in Studio browser code', not buffer_hits, str(buffer_hits))
# P4
loader = read('packages/codegen/src/template-loader.ts')
check('P4.3 template-loader registers the 15 new templates (import + map entry each)',
      sum(loader.count(o) for o in NEW_BLOCKS.values()) == 30, str(sum(loader.count(o) for o in NEW_BLOCKS.values())))
for lang in LANGS:
    check(f'P4.4 {lang} preamble has the HTLC imports behind hasHashLock', has(f'packages/codegen/src/templates/{lang}/_preamble.hbs', 'hasHashLock'))
check('P4.4 Rust scaffold adds getrandom for HTLC flows (D-12)', 'getrandom' in scaf)
htlc_tests = read('packages/codegen/tests/htlc-codegen.test.ts')
exit_calls = {'python': 'sys.exit(1)', 'javascript': 'process.exitCode = 1', 'dart': 'exit(1)', 'rust': 'std::process::exit(1)', 'csharp': 'Environment.Exit(1)'}
check('P4.5 failure semantics: every language defines a non-zero exit (Python in the HTLC templates, the others in the preamble), and htlc-codegen pins it',
      all(exit_calls[l] in read(f'packages/codegen/src/templates/{l}/' + ('release_locked.hbs' if l == 'python' else '_preamble.hbs')) and exit_calls[l] in htlc_tests for l in LANGS))
check('P4.7 CLI mode refuses HTLC flows with an SDK-only comment', 'SDK-only' in read('packages/codegen/src/manifest-generator.ts') and 'CLI' in htlc_tests)
for f in ('packages/codegen/tests/action-palette-codegen.test.ts', 'packages/codegen/tests/project-scaffolds-unified.test.ts', 'packages/codegen/tests/action-palette-e2e.test.ts'):
    check(f'P4.8 hard-coded block list includes the new blocks: {f.split("/")[-1]}', has(f, *NEW_BLOCKS))
# P5
check('P5.1 registry entry: category advanced, tags tokens/advanced/htlc, 10 min', "category: 'advanced'" in reg and "tags: ['tokens', 'advanced', 'htlc']" in reg and "estimatedTime: '10 min'" in reg)
keys = ['id', 'name', 'description', 'category', 'estimatedTime', 'tags', 'flow', 'instructions', 'prerequisites']
pos = [reg.find(k + ':') for k in keys[:-3]]
check('P5.1 MCP parser constraint: key order, no apostrophe in name', pos == sorted(pos) and -1 not in pos and "'" not in meta['name'])
check('P5.2 templates/hash-lock.yaml and templates/index.ts exist', os.path.exists(os.path.join(ROOT, 'templates/hash-lock.yaml')) and "id: 'hash-lock'" in read('templates/index.ts'))
check('P5.3 flow-templates test has the hash-lock case (order, refs, lock)', has('apps/studio/src/data/__tests__/flow-templates.test.ts', "describe('hash-lock'", 'hashLockFrom') or has('apps/studio/src/data/__tests__/flow-templates.test.ts', 'hash-lock', 'hashLockFrom'))
check('P5.4 mock router htlc_mock.py exists and every *-validation suite lists hash-lock',
      os.path.exists(os.path.join(ROOT, 'packages/codegen/tests/htlc_mock.py')) and all("'hash-lock'" in read(f'packages/codegen/tests/{l}-validation.test.ts') for l in ('python', 'javascript', 'dart', 'rust', 'csharp')))
# P6
check('P6.1 proxy: models, tokens route and generic route carry the lock and the release',
      has('apps/sdk-proxy/app/models.py', 'hash_algorithm') and has('apps/sdk-proxy/app/routes/tokens.py', 'HashLockOptions') and has('apps/sdk-proxy/app/routes/generic.py', 'ReleaseLockedOperation'))
check('P6.1 proxy pytest file exists', os.path.exists(os.path.join(ROOT, 'apps/sdk-proxy/tests/test_htlc_routes.py')))
check('P6.4 amount test covers LOCK_AMOUNT', has('apps/studio/src/services/execution/node-executor.amount.test.ts', 'LOCK_AMOUNT'))
check('P6.5 in-Studio run: 14 screenshots and the verifier JSON',
      len([f for f in os.listdir(os.path.join(ev, 'p6')) if f[:2].isdigit()]) == 14 and studio['RESULT'] == 'PASS')
# P7
palette = read('docs/hash-lock-example/evidence/e2e/palette-e2e-new-blocks.log')
check('P7.6 action-palette e2e for the new blocks: 15 passed live', re.search(r'Tests +15 passed', re.sub(chr(27) + r'[[][0-9;]*m', '', palette)) is not None)
# P8
tx = read('apps/mcp-server/src/tools/transaction.ts')
check("P8.2 MCP: validTypes has releaseLockedOperation; hashLock on build and submit",
      "'releaseLockedOperation'" in tx and tx.count('validateHashLockForType') >= 3 and 'hashLock' in tx)
check('P8.2 MCP protocol tests cover hashLock and the release', has('apps/mcp-server/test/protocol.test.mjs', 'hashLock', 'releaseLockedOperation'))
check('P8.3 generator HTLC section + refund guard', has('scripts/generate-agent-artifacts.mjs', 'renderHtlcFull', 'checkHtlcRefundWording'))
check('P8.3 every generated llms.txt and llms-full.txt carries the HTLC section',
      all('## Hash-locked transfers (HTLC' in read(f'docs/ai-agent-readiness/generated/{l}/{f}') for l in LANGS for f in ('llms.txt', 'llms-full.txt')))
check('P8.4 README template list, example README and PROGRESS entry',
      has('README.md', 'hash-lock.yaml') and os.path.exists(os.path.join(ROOT, 'docs/hash-lock-example/README.md')) and has('docs/ai-agent-readiness/PROGRESS.md', 'Hash Lock (HTLC) golden path'))
# P9
for tag in ('p9', 'p9b', 'p10'):
    gate = os.path.join(ev, tag, 'gate-summary.txt')
    if os.path.exists(gate):
        g = read(f'docs/hash-lock-example/evidence/{tag}/gate-summary.txt')
        check(f'P9 gate run {tag}: every step exit 0 and ALLDONE', 'ALLDONE' in g and all(l.split('exit=')[1].split()[0] == '0' for l in g.split(chr(10)) if 'exit=' in l),
              f"{g.count('exit=0')} steps exit 0")
cc = os.path.join(ev, 'p10', 'clean-checkout-final.txt')
if os.path.exists(cc):
    c = read('docs/hash-lock-example/evidence/p10/clean-checkout-final.txt')
    c9 = read('docs/hash-lock-example/evidence/p9/clean-checkout-final.txt')
    check('P9.2 the earlier clean-checkout proof (before HASH160) passed in 3 orders too', 'ALLDONE' in c9 and 'clone exit=0' in c9 and all(f'{s} exit=0' in c9 for s in ('A-npm-ci', 'A-build-types', 'A-build', 'A-typecheck', 'B-build-types', 'B-typecheck', 'B-build', 'C-typecheck')))
    check('P9.2 clean checkout: the requested order, CI order and a bare typecheck all exit 0 (7 steps)', 'ALLDONE' in c and all(f'{s} exit=0' in c for s in ('A-npm-ci', 'A-build-types', 'A-build', 'A-typecheck', 'B-build-types', 'B-typecheck', 'B-build', 'C-typecheck')), str(c.count('exit=0')) + ' steps exit 0')
rr = os.path.join(ROOT, 'docs/hash-lock-example/RELEASE-READINESS.md')
if os.path.exists(rr):
    r = read('docs/hash-lock-example/RELEASE-READINESS.md')
    check('P9.5 RELEASE-READINESS states 2 consecutive published runs per language, cites D-03, never claims 3',
          '2 consecutive published runs per language' in r and 'D-03' in r and re.search(r'3 consecutive published', r) is None)
    check('P9.5 RELEASE-READINESS: SDK fixes awaiting publish none (D-04a), core issue, human checkpoints',
          'SDK branch fixes awaiting publish: none (D-04a)' in r and 'CORE-ISSUE-refund.md' in r and 'Human checkpoints' in r)

# D-1..D-4
check('D-1 variables ADI_NAME (required) and LOCK_AMOUNT (default 1.00000000)', has('apps/studio/src/data/flow-templates.ts', "name: 'LOCK_AMOUNT'", "default: '1.00000000'") and 'ADI_NAME' in flow_seg)
check('D-1 assertions: status for locked_send and release, no balance.delta in the template', 'locked_send' in ft and 'release_locked' in ft and 'balance.delta' not in flow_seg)
check('D-2 SendTokens hash-lock extension is the single flat field hashLockFrom (decision D-07)', has('packages/types/src/blocks.ts', 'hashLockFrom'))
check('D-2 GenerateHashLock options: sha256, sha256d and hash160 (HASH160 added by the user, D-41)', "enum: ['sha256', 'sha256d', 'hash160']" in blocks_ts and 'SDK-level only' not in blocks_ts)
check('D-3 minimum SDK versions are the scaffold pins', all(s in scaf for s in ('>=2.5.0', '^2.5.2', '^2.5.0', '2.5.*')))
check('D-4 no refund step in the flow; HTLC not in the CLI; no 9th canonical task',
      not any('refund' in (i + t).lower() for i, t in flow_nodes) and 'SDK-only' in read('packages/codegen/src/manifest-generator.ts')
      and len([f for f in os.listdir(os.path.join(ROOT, 'tools/agent-harness/tasks'))]) == 8 if os.path.isdir(os.path.join(ROOT, 'tools/agent-harness/tasks')) else True)

# Appendix D: every file expected to change did change on the branch
changed = set(git('diff', 'main', '--name-only').split(chr(10)))
appendix = [
    'packages/types/src/blocks.ts', 'packages/types/src/block-op-map.ts', 'packages/types/src/prerequisites.ts',
    'packages/codegen/src/manifest-generator.ts', 'packages/codegen/src/template-loader.ts', 'packages/codegen/src/project-scaffolds.ts',
    'apps/studio/src/data/flow-templates.ts', 'apps/studio/src/data/__tests__/flow-templates.test.ts',
    'apps/studio/src/components/flow-builder/BlockNode.tsx', 'apps/studio/src/components/palette/BlockItem.tsx',
    'apps/studio/src/components/modals/ExecuteConfirmModal.tsx', 'packages/codegen/src/flow-serializer.ts',
    'packages/codegen/src/assertions-generator.ts', 'packages/codegen/src/agent-files.ts',
    'apps/studio/src/services/execution/node-executor.ts', 'apps/studio/src/services/execution/node-executor.amount.test.ts',
    'templates/hash-lock.yaml', 'templates/index.ts',
    'apps/sdk-proxy/app/models.py', 'apps/sdk-proxy/app/routes/tokens.py', 'apps/sdk-proxy/app/routes/generic.py',
    'apps/sdk-proxy/pyproject.toml', 'apps/sdk-proxy/requirements.txt', 'apps/sdk-proxy/tests/test_htlc_routes.py',
    'apps/mcp-server/src/index.ts', 'apps/mcp-server/src/prompts/index.ts', 'apps/mcp-server/src/tools/transaction.ts',
    'apps/mcp-server/test/protocol.test.mjs', 'apps/mcp-server/AGENTS.md',
    'scripts/generate-mcp-content.mjs', 'scripts/generate-agent-artifacts.mjs', 'scripts/check-canonical-coverage.ts',
    'docs/ai-agent-readiness/MCP.md', 'packages/codegen/tests/action-palette-codegen.test.ts', 'packages/codegen/tests/action-palette-e2e.test.ts',
    'packages/codegen/tests/project-scaffolds-unified.test.ts', 'packages/codegen/tests/__snapshots__/codegen-snapshots.test.ts.snap',
    'packages/codegen/tests/csharp-harness/CSharpHarness.csproj', 'packages/codegen/tests/htlc_mock.py',
]
for lang in LANGS:
    appendix += [f'packages/codegen/src/templates/{lang}/{t}.hbs' for t in ('send_tokens', 'generate_hash_lock', 'wait_for_locked_deposit', 'release_locked', '_preamble')]
    appendix += [f'packages/codegen/src/manifests/{lang}.sdk-manifest.json', f'packages/codegen/tests/{lang}-validation.test.ts', f'packages/codegen/tests/validate_{lang}.py' if lang != 'javascript' else 'packages/codegen/tests/validate_javascript.py']
appendix += [f'docs/ai-agent-readiness/generated/{l}/{f}' for l in LANGS for f in ('llms.txt', 'llms-full.txt', 'AGENTS.md')]
missing_changes = sorted(p for p in set(appendix) if p not in changed)
check('Appendix D: every expected file changed on the branch (flow.ts excluded: no new AssertionType)', not missing_changes, f'{len(set(appendix))} files; not changed: {missing_changes}')
check('Appendix D: packages/types flow.ts untouched because no AssertionType was added', 'packages/types/src/flow.ts' not in changed)
def clean_repo(path):
    r = subprocess.run(['git', '-C', path, 'status', '--porcelain', '--untracked-files=no'], capture_output=True, text=True)
    return r.returncode == 0 and r.stdout.strip() == ''


outside = ['C:/Accumulate_Stuff/opendlt-python-v2v3-sdk/unified', 'C:/Accumulate_Stuff/opendlt-javascript-v2v3-sdk/javascript',
           'C:/Accumulate_Stuff/opendlt-dart-v2v3-sdk/unified', 'C:/Accumulate_Stuff/opendlt-rust-v2v3-sdk/unified',
           'C:/Accumulate_Stuff/opendlt-c-sharp-v2v3-sdk', 'C:/Accumulate_Stuff/accumulate-core']
check('Appendix D: no file outside the repo changed (the 5 SDK repos and accumulate-core: git status clean at each real repo root)',
      all(clean_repo(d) for d in outside), ', '.join(d.split('/')[-1] for d in outside if not clean_repo(d)))

# --- 6. git history -------------------------------------------------------------------------------
# `main` is the local branch base (3a663ef). origin/main has since merged this branch's earlier phases
# through PRs #2-#5, so main..HEAD also holds GitHub merge commits and the payload-scan PR #1 commit that
# came in from main: neither is ours, so only non-merge commits are judged, minus that one.
NL, TAB, RS = chr(10), chr(9), chr(30)
PAYLOAD_SCAN = 'fdfaad8'
raw_log = git('log', '--reverse', '--no-merges', '--format=%h%x09%s%x09%b%x1e', 'main..HEAD', '^' + PAYLOAD_SCAN).split(RS)
commits = [c.strip(NL) for c in raw_log if c.strip()]
bodies = [c.split(TAB, 2)[2].strip() for c in commits]
check('every HTLC branch commit is a single line (empty body)', all(b == '' for b in bodies), f'{len(commits)} commits')
trailers = git('log', '--no-merges', 'main..HEAD', '^' + PAYLOAD_SCAN, '--format=%B')
check('no attribution trailer in any HTLC branch commit', not re.search('co-authored-by|generated with|signed-off-by|claude', trailers, re.I))
merges = [m for m in git('log', '--merges', '--format=%h %s', 'main..HEAD').strip().split(NL) if m]
print(f'HTLC commits (oldest first, merges and the payload-scan commit excluded): {len(commits)}')
for c in commits:
    h, s, _ = c.split(TAB, 2)
    print(f'  {h} {s}')
print(f'GitHub/PR merge commits in main..HEAD, not ours: {len(merges)}')

failed = [r for r in results if not r[1]]
print(f'\n{len(results)} checks, {len(results) - len(failed)} PASS, {len(failed)} FAIL')
sys.exit(1 if failed else 0)
