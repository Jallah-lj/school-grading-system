#!/usr/bin/env python3
"""Live e2e: teacher marks import (template, xlsx/csv import, locks, RBAC)."""
import json, subprocess, time, urllib.request, urllib.error

BASE = 'http://localhost:4000/api'
SERVER = '/home/user/school-grading-system/server'
passed = failed = 0

def req(method, path, token=None, body=None):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header('Content-Type', 'application/json')
    if token: r.add_header('Authorization', f'Bearer {token}')
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(r, data=data) as resp:
            payload = resp.read()
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, {}

def upload(path, token, filepath, ctype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'):
    boundary = f'----sgs{int(time.time()*1000)}'
    content = open(filepath, 'rb').read()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filepath.split("/")[-1]}"\r\n'
            f'Content-Type: {ctype}\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
    r = urllib.request.Request(BASE + path, data=body, method='POST')
    r.add_header('Authorization', f'Bearer {token}')
    r.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, {}

def check(name, cond, extra=''):
    global passed, failed
    if cond: passed += 1; print(f'  ✅ {name}')
    else: failed += 1; print(f'  ❌ {name} {extra}')

def login(email, pw):
    s, b = req('POST', '/auth/login', body={'email': email, 'password': pw})
    return b.get('accessToken') if s == 200 else None

admin = login('admin@school.rw', 'Admin@123')
teacher = login('m.habimana@school.rw', 'Teacher@123')
assert admin and teacher

# Choose the teacher's first assigned grid in the current term
s, year = req('GET', '/academic-years/active', token=admin)
sem = next(x for x in year['semesters'] if x['isCurrent'])
s, me = req('GET', '/teachers/me', token=teacher)
a = me['assignments'][0]
classId, subjectId = a['classRoom']['id'], a['subject']['id']
print(f"grid: {a['classRoom']['name']} {a['classRoom']['stream']} — {a['subject']['name']} ({sem['name']})")

s, grid = req('GET', f'/grades/grid?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', token=teacher)
students, comps = grid['students'], grid['components']
assert students and comps, 'need roster + components'
# normalize to a fully-DRAFT grid before testing (unlock is idempotent)
req('POST', '/grades/unlock', token=admin, body={'classId': classId, 'subjectId': subjectId, 'semesterId': sem['id'], 'to': 'SUBMITTED'})
req('POST', '/grades/unlock', token=admin, body={'classId': classId, 'subjectId': subjectId, 'semesterId': sem['id'], 'to': 'DRAFT'})
s, grid = req('GET', f'/grades/grid?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', token=teacher)
students, comps = grid['students'], grid['components']
print(f'  {len(students)} students × {len(comps)} components; grid status={grid["status"]}')

print('\n══ TEMPLATE ══')
r = urllib.request.Request(BASE + f'/grades/import/template?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}')
r.add_header('Authorization', f'Bearer {teacher}')
with urllib.request.urlopen(r) as resp:
    tpl = resp.read(); cd = resp.headers.get('Content-Disposition', '')
check('teacher downloads pre-filled template (.xlsx)', tpl[:2] == b'PK' and 'marks_' in cd, f'{cd} {len(tpl)}B')

print('\n══ PRELOAD + BUILD IMPORT FILE ══')
s0, s1, s2, s3 = students[0], students[1], students[2], students[3]
c0, c1, c2 = comps[0], comps[1], comps[2 if len(comps) > 2 else 1]
s, b = req('POST', '/grades/entry', token=teacher, body={
    'classId': classId, 'subjectId': subjectId, 'semesterId': sem['id'],
    'entries': [{'studentId': s0['id'], 'scores': {c0['id']: 7}}]})
check('preloaded a mark (7) into student-0/comp-0', s == 200, f'{s} {str(b)[:120]}')

val = lambda comp: min(comp['maxScore'] - 1, 28)  # valid realistic score
headers = ['admissionNumber', 'name'] + [c['name'] for c in comps]
rows = []
spec_rows = []
for i, stu in enumerate(students):
    cells = []
    for c in comps:
        v = str(val(c))
        if i == 0 and c['id'] == c0['id']: v = ''            # blank → must keep preloaded 7
        if i == 2 and c['id'] == c1['id']: v = str(c1['maxScore'] + 5)  # over max → reject
        if i == 3 and c['id'] == c2['id']: v = 'abc'         # not a number → reject
        cells.append(v)
    rows.append([stu['admissionNumber'], stu['name']] + cells)
    spec_rows.append((stu, cells))
dup_v = val(c0) - 1
rows.append([s1['admissionNumber'], s1['name'], str(dup_v)] + [''] * (len(comps) - 1))  # duplicate row → last wins
rows.append(['SGS-1900-999', 'Ghost Student'] + ['10'] * len(comps))                    # unknown admission
spec = {'headers': headers, 'rows': rows,
        'csvHeaders': headers[:3], 'csvRows': [[s0['admissionNumber'], s0['name'], str(val(c0) + 1)]]}
open('/tmp/marks-spec.json', 'w').write(json.dumps(spec))
subprocess.run(['node', '/tmp/make-marks-xlsx.js'], env={'NODE_PATH': f'{SERVER}/node_modules', 'PATH': '/usr/bin:/bin:/usr/local/bin'}, check=True)

valid_expected = 0
for i, (stu, cells) in enumerate(spec_rows):
    for j, c in enumerate(comps):
        v = cells[j]
        if v == '' or not v.replace('.', '').isdigit() or float(v) > c['maxScore']:
            continue
        valid_expected += 1
# duplicate row overwrites one existing op (doesn't add)
print(f'  expected applied={valid_expected}, expected failed=3')

print('\n══ XLSX IMPORT ══')
s, res = upload(f'/grades/import?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', teacher, '/tmp/marks-import-test.xlsx')
check('import accepted (200)', s == 200, f'{s}: {str(res)[:250]}')
check(f'applied == {valid_expected}', res.get('applied') == valid_expected, f"got {res.get('applied')}")
check('failed == 3 with row numbers', res.get('failed') == 3, f"got {res.get('failed')} errors={res.get('errors')}")
check('skipped counts blank cells', res.get('skipped', 0) >= len(comps) - 1)
print(f'     errors: {json.dumps(res.get("errors", []))[:300]}')

s, g2 = req('GET', f'/grades/grid?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', token=teacher)
e2 = g2['entries']
check('blank cell KEPT preloaded mark (7)', e2.get(s0['id'], {}).get(c0['id'], {}).get('score') == 7, str(e2.get(s0['id'], {}).get(c0['id'])))
check('duplicate row → last value wins', e2.get(s1['id'], {}).get(c0['id'], {}).get('score') == dup_v, str(e2.get(s1['id'], {}).get(c0['id'])))
orig = grid['entries']
check('over-max cell kept ORIGINAL value (105 rejected)',
      e2.get(s2['id'], {}).get(c1['id'], {}).get('score') == orig.get(s2['id'], {}).get(c1['id'], {}).get('score') != 105,
      str(e2.get(s2['id'], {}).get(c1['id'])))
check('non-numeric cell kept ORIGINAL value (abc rejected)',
      e2.get(s3['id'], {}).get(c2['id'], {}).get('score') == orig.get(s3['id'], {}).get(c2['id'], {}).get('score'),
      str(e2.get(s3['id'], {}).get(c2['id'])))
check('imported marks are DRAFT', all(x['status'] == 'DRAFT' for stu in e2.values() for x in stu.values()))

print('\n══ RBAC SCOPE ══')
s, teachers = req('GET', '/teachers?pageSize=20', token=admin)
other = next((t for t in teachers['data'] if t['id'] != me['id'] and
              not any(x['classRoom']['id'] == classId and x['subject']['id'] == subjectId for x in t['assignments'])), None)
assert other, 'need a teacher not assigned to this pair'
other_tok = login(other['user']['email'], 'Teacher@123')
s, b = upload(f'/grades/import?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', other_tok, '/tmp/marks-import-test.csv', 'text/csv')
check('unassigned teacher import → 403', s == 403, f'got {s}: {str(b)[:120]}')

print('\n══ CSV VARIANT ══')
s, res2 = upload(f'/grades/import?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', teacher, '/tmp/marks-import-test.csv', 'text/csv')
check('CSV import applies 1 mark', s == 200 and res2.get('applied') == 1, f'{s}: {str(res2)[:200]}')

print('\n══ LOCK PROTECTION ══')
req('POST', '/grades/submit', token=teacher, body={'classId': classId, 'subjectId': subjectId, 'semesterId': sem['id']})
s, appr = req('POST', '/grades/approve', token=admin, body={'classId': classId, 'subjectId': subjectId, 'semesterId': sem['id']})
check('grid approved for lock test', s == 200 and appr['resultsComputed'] > 0, f'{s}')
s, b = upload(f'/grades/import?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', teacher, '/tmp/marks-import-test.csv', 'text/csv')
check('teacher import on APPROVED → 409 conflict', s == 409, f'got {s}: {str(b)[:150]}')
admin_csv = '/tmp/marks-admin.csv'
open(admin_csv, 'w').write(f'admissionNumber,name,{c0["name"]}\n{s0["admissionNumber"]},{s0["name"]},{val(c0)}\n')
s, res3 = upload(f'/grades/import?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', admin, admin_csv, 'text/csv')
check('admin import over APPROVED works + recomputes', s == 200 and res3.get('applied') == 1 and res3.get('recomputed') is True, f'{s}: {str(res3)[:200]}')
s, g3 = req('GET', f'/grades/grid?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', token=admin)
check('status stays APPROVED after admin fix', g3['status'] == 'APPROVED', g3['status'])
s, u1 = req('POST', '/grades/unlock', token=admin, body={'classId': classId, 'subjectId': subjectId, 'semesterId': sem['id'], 'to': 'SUBMITTED'})
s2c, u2 = req('POST', '/grades/unlock', token=admin, body={'classId': classId, 'subjectId': subjectId, 'semesterId': sem['id'], 'to': 'DRAFT', 'note': 'e2e cleanup'})
s, g4 = req('GET', f'/grades/grid?classId={classId}&subjectId={subjectId}&semesterId={sem["id"]}', token=admin)
check('cleanup: grid returned to DRAFT', g4['status'] in ('DRAFT',), f"status={g4['status']} steps={u1.get('unlocked')},{u2.get('unlocked')}")

s, logs = req('GET', '/admin/audit-logs?action=IMPORT_GRADES', token=admin)
check('imports audit-logged (IMPORT_GRADES)', s == 200 and logs['total'] >= 2, f"total={logs.get('total')}")

print(f'\n════ RESULT: {passed} passed, {failed} failed ════')
exit(1 if failed else 0)
