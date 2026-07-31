#!/usr/bin/env python3
"""Live e2e verification of bulk student import (Excel/CSV)."""
import json, re, time, urllib.request, urllib.error

BASE = 'http://localhost:4000/api'
passed = failed = 0

def req(method, path, token=None, body=None, raw=False):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header('Content-Type', 'application/json')
    if token: r.add_header('Authorization', f'Bearer {token}')
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(r, data=data) as resp:
            payload = resp.read()
            return resp.status, (payload if raw else (json.loads(payload) if payload else {}))
    except urllib.error.HTTPError as e:
        payload = e.read()
        try: payload = json.loads(payload)
        except Exception: pass
        return e.code, payload

def upload(path, token, filepath, filename=None, ctype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'):
    boundary = f'----sgs{int(time.time()*1000)}'
    content = open(filepath, 'rb').read()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename or filepath.split("/")[-1]}"\r\n'
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
    return (b or {}).get('accessToken') if s == 200 else None

admin = login('admin@school.rw', 'Admin@123')
teacher = login('m.habimana@school.rw', 'Teacher@123')
assert admin and teacher
T = open('/tmp/import-tag.txt').read().strip()
print(f'timestamp tag: {T}')

print('\n══ TEMPLATE ══')
r = urllib.request.Request(BASE + '/students/import/template')
r.add_header('Authorization', f'Bearer {admin}')
with urllib.request.urlopen(r) as resp:
    tpl = resp.read(); ct = resp.headers.get('Content-Type'); cd = resp.headers.get('Content-Disposition')
check('template downloads as .xlsx', tpl[:2] == b'PK' and 'spreadsheetml' in ct and 'students_import_template' in cd, f'{ct} | {cd} | {len(tpl)}B')

print('\n══ RBAC & VALIDATION ══')
s, b = upload('/students/import', teacher, '/tmp/import-test.xlsx')
check('teacher cannot import (403)', s == 403, f'got {s}')
s, b = req('POST', '/students/import', token=admin, body={})
check('no file → 400', s == 400, f'got {s}: {str(b)[:100]}')
s, b = upload('/students/import', admin, '/tmp/import-wrong.txt', ctype='text/plain')
check('wrong extension (.txt) → 400', s == 400, f'got {s}: {str(b)[:100]}')
s, b = upload('/students/import', admin, '/tmp/import-big.csv', ctype='text/csv')
check('501 rows → 400 (batch limit)', s == 400 and '500' in str(b), f'got {s}: {str(b)[:120]}')

print('\n══ XLSX IMPORT (mixed valid/invalid rows) ══')
s, res = upload('/students/import', admin, '/tmp/import-test.xlsx')
check('import accepted (200)', s == 200, f'{s}: {str(res)[:200]}')
check('3 rows created, 5 skipped', res.get('created') == 3 and res.get('failed') == 5,
      f"created={res.get('created')} failed={res.get('failed')}")
reasons = {e['row']: e['reason'] for e in res.get('errors', [])}
print(f'     errors: {json.dumps(reasons, indent=None)[:400]}')
check('row 4 duplicate-in-file', 4 in reasons and 'duplicate' in reasons[4].lower())
check('row 5 invalid email', 5 in reasons and 'email' in reasons[5].lower())
check('row 6 class not found', 6 in reasons and 'class' in reasons[6].lower() and 'not found' in reasons[6].lower())
check('row 7 invalid gender', 7 in reasons and 'gender' in reasons[7].lower())
check('row 9 existing email rejected', 9 in reasons and 'registered' in reasons[9].lower())

creds = {c['email']: c['password'] for c in res.get('credentials', [])}
bosco = f'bosco.{T}@school.rw'; claudine = f'claudine.{T}@school.rw'; divine = f'divine.{T}@school.rw'
check('explicit password marked as "(set in file)"', creds.get(bosco) == '(set in file)', str(creds.get(bosco)))
check('blank password auto-generated', bool(creds.get(claudine)) and creds[claudine].startswith('Stu'), str(creds.get(claudine)))

print('\n══ CREATED DATA INTEGRITY ══')
s, stu = req('GET', f'/students?search={T}&pageSize=10', token=admin)
check('3 new students searchable', s == 200 and stu['total'] == 3, f"total={stu.get('total')}")
adm = sorted(x['admissionNumber'] for x in stu['data'])
print(f'     admission numbers: {adm}')
check('admission numbers auto-assigned & unique', len(set(adm)) == 3 and all(re.match(r'[A-Z]+-\d{4}-\d{4}$', a) for a in adm), str(adm))
by_email = {x['user']['email']: x for x in stu['data']}
check('bosco enrolled in Senior 1 A', by_email[bosco]['classRoom'] and by_email[bosco]['classRoom']['name'] == 'Senior 1', str(by_email[bosco].get('classRoom')))
check('claudine enrolled in Senior 2 A', by_email[claudine]['classRoom'] and by_email[claudine]['classRoom']['name'] == 'Senior 2')
check('divine linked to parent account', by_email[divine]['parent'] and by_email[divine]['parent']['user']['email'] == 'parent@school.rw', str(by_email[divine].get('parent')))

tok = login(bosco, 'Bosco@123')
check('bosco can log in with explicit password', bool(tok))
tok2 = login(claudine, creds[claudine])
check('claudine can log in with generated password', bool(tok2))

print('\n══ CSV + HEADER ALIASES ══')
s, res2 = upload('/students/import', admin, '/tmp/import-aliases.csv', ctype='text/csv')
eric = f'eric.{T}@school.rw'
check('CSV with aliased headers imports', s == 200 and res2.get('created') == 1 and res2.get('failed') == 0, f'{s}: {str(res2)[:200]}')
s, stu2 = req('GET', f'/students?search={urllib.parse.quote(eric)}', token=admin)
check('eric created via alias mapping + enrolled', stu2['total'] == 1 and stu2['data'][0]['classRoom'], str(stu2.get('data'))[:160])

print('\n══ IDEMPOTENT RE-RUN & AUDIT ══')
s, res3 = upload('/students/import', admin, '/tmp/import-test.xlsx')
check('re-run: 0 created, all 8 skipped (safe to retry)', res3.get('created') == 0 and res3.get('failed') == 8,
      f"created={res3.get('created')} failed={res3.get('failed')}")
s, logs = req('GET', '/admin/audit-logs?action=BULK_IMPORT_STUDENTS', token=admin)
check('imports recorded in audit log', s == 200 and logs['total'] >= 2, f"total={logs.get('total')}")

print(f'\n════ RESULT: {passed} passed, {failed} failed ════')
exit(1 if failed else 0)
