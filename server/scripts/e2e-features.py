#!/usr/bin/env python3
"""Live e2e verification: approval inbox, delete security gate, audit logs, notification deletion."""
import json, time, urllib.request, urllib.error

BASE = 'http://localhost:4000/api'
passed = failed = 0

def req(method, path, token=None, body=None, raw=False):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header('Content-Type', 'application/json')
    if token: r.add_header('Authorization', f'Bearer {token}')
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(r, data=data) as resp:
            payload = resp.read().decode()
            return resp.status, (payload if raw else json.loads(payload) if payload else {})
    except urllib.error.HTTPError as e:
        payload = e.read().decode()
        try: payload = json.loads(payload)
        except Exception: pass
        return e.code, payload

def check(name, cond, extra=''):
    global passed, failed
    if cond: passed += 1; print(f'  ✅ {name}')
    else: failed += 1; print(f'  ❌ {name} {extra}')

def login(email, pw):
    s, b = req('POST', '/auth/login', body={'email': email, 'password': pw})
    assert s == 200, (s, b)
    return b['accessToken']

admin = login('admin@school.rw', 'Admin@123')
teacher = login('m.habimana@school.rw', 'Teacher@123')
print('logged in')

# ── Find a workable (class, subject, term) grid for the teacher ──────────────
s, me = req('GET', '/teachers/me', token=teacher)
s, year = req('GET', '/academic-years/active', token=admin)
semester = next(sm for sm in year['semesters'] if sm['isCurrent'])
grid = None
for a in me['assignments']:
    cid, sid = a['classRoom']['id'], a['subject']['id']
    s, g = req('GET', f"/grades/grid?classId={cid}&subjectId={sid}&semesterId={semester['id']}", token=teacher)
    if s == 200 and g['status'] in ('EMPTY', 'DRAFT') and g['students'] and g['components']:
        grid = (cid, sid, g, a)
        break
assert grid, 'no workable grid found'
classId, subjectId, g0, assignment = grid
print(f'using grid: {assignment["classRoom"]["name"]} {assignment["classRoom"]["stream"]} — {assignment["subject"]["name"]}')

print('\n══ 1. APPROVAL INBOX ══')
# teacher cannot read the inbox
s, _ = req('GET', '/grades/pending-approvals', token=teacher)
check('teacher blocked from /pending-approvals (403)', s == 403, f'got {s}')

# enter marks + submit
entries = [{'studentId': st['id'], 'scores': {g0['components'][0]['id']: 15}} for st in g0['students'][:5]]
s, b = req('POST', '/grades/entry', token=teacher,
           body={'classId': classId, 'subjectId': subjectId, 'semesterId': semester['id'], 'entries': entries})
check('marks entered as draft', s == 200, f'{s} {str(b)[:120]}')
s, b = req('POST', '/grades/submit', token=teacher,
           body={'classId': classId, 'subjectId': subjectId, 'semesterId': semester['id']})
check('marks submitted for approval', s == 200 and b['submitted'] > 0, f'{s} {str(b)[:120]}')

# inbox shows exactly our row with aggregates
s, inbox = req('GET', '/grades/pending-approvals', token=admin)
row = next((r for r in inbox['data'] if r['classId'] == classId and r['subjectId'] == subjectId and r['semesterId'] == semester['id']), None)
check('submission appears in admin inbox', row is not None, json.dumps(inbox)[:200])
if row:
    check('inbox row has marks/students/teachers/labels',
          row['marks'] >= 1 and row['students'] >= 1 and row['className'] and row['subjectName'] and row['semesterName'],
          json.dumps(row)[:200])
    print(f'     row: {row["className"]} {row["stream"]} | {row["subjectName"]} | {row["marks"]} marks | teachers={row["teachers"]}')

# admin notification deep-links to /approvals
s, notifs = req('GET', '/notifications', token=admin)
n = next((x for x in notifs['data'] if x['title'] == 'Grades awaiting approval'), None)
check('admin notified with /approvals deep link', n and n.get('link') == '/approvals' and classId != '', str(n)[:200] if n else 'none')
if n: print(f'     notif: "{n["message"]}" → {n["link"]}')

# return for correction with a note (the Approvals page "Return" action)
s, b = req('POST', '/grades/unlock', token=admin,
           body={'classId': classId, 'subjectId': subjectId, 'semesterId': semester['id'], 'to': 'DRAFT',
                 'note': 'Two CAT marks missing — please complete.'})
check('returned to teacher as DRAFT', s == 200 and b['unlocked'] > 0, f'{s} {str(b)[:120]}')
s, inbox = req('GET', '/grades/pending-approvals', token=admin)
check('inbox empty after return', not any(r['classId'] == classId and r['subjectId'] == subjectId for r in inbox['data']))
s, tnotifs = req('GET', '/notifications', token=teacher)
tn = next((x for x in tnotifs['data'] if x['title'] == 'Marks returned for correction'), None)
check('teacher notified with note + grade-entry link',
      tn and 'Two CAT marks missing' in tn['message'] and tn.get('link', '').startswith('/grade-entry?'),
      str(tn)[:220] if tn else 'none')
if tn: print(f'     notif: "{tn["message"][:110]}…" → {tn["link"][:60]}')

# resubmit then approve exactly like the Approvals page does
req('POST', '/grades/submit', token=teacher, body={'classId': classId, 'subjectId': subjectId, 'semesterId': semester['id']})
s, b = req('POST', '/grades/approve', token=admin,
           body={'classId': classId, 'subjectId': subjectId, 'semesterId': semester['id']})
check('one-click approve computes results', s == 200 and b['resultsComputed'] > 0, f'{s} {str(b)[:150]}')
s, inbox = req('GET', '/grades/pending-approvals', token=admin)
check('inbox empty after approval', not any(r['classId'] == classId and r['subjectId'] == subjectId for r in inbox['data']))

print('\n══ 2. DELETE SECURITY GATE (password step-up) ══')
stamp = int(time.time())
s, stu = req('POST', '/students', token=admin, body={
    'name': 'Gate Test Student', 'email': f'gate.student.{stamp}@school.rw', 'password': 'Student@123',
    'dateOfBirth': '2010-05-01', 'gender': 'MALE'})
check('test student created', s == 201, f'{s} {str(stu)[:120]}')
sid = stu['id']

s, b = req('DELETE', f'/students/{sid}', token=admin)
check('delete without password → 400', s == 400, f'got {s}: {str(b)[:100]}')
s, b = req('DELETE', f'/students/{sid}', token=admin, body={'password': 'WrongPass999'})
check('delete with wrong password → 403', s == 403 and b.get('error', {}).get('code') == 'PASSWORD_CONFIRMATION_FAILED', f'{s} {str(b)[:140]}')
s, b = req('GET', '/admin/audit-logs?action=DELETE_STUDENT_DENIED', token=admin)
check('failed attempt recorded in audit log', s == 200 and b['total'] >= 1, f'{s} {str(b)[:120]}')
s, b = req('DELETE', f'/students/{sid}', token=admin, body={'password': 'Admin@123'})
check('delete with correct password → 200', s == 200 and b.get('success'), f'{s} {str(b)[:120]}')
s, b = req('GET', f'/students/{sid}', token=admin)
check('student actually gone (404)', s == 404, f'got {s}')
s, b = req('GET', '/admin/audit-logs?action=DELETE_STUDENT', token=admin)
check('successful delete recorded in audit log', s == 200 and b['total'] >= 1)

s, tch = req('POST', '/teachers', token=admin, body={
    'name': 'Gate Test Teacher', 'email': f'gate.teacher.{stamp}@school.rw', 'password': 'Teacher@123'})
check('test teacher created', s == 201, f'{s} {str(tch)[:120]}')
tid = tch['id']
s, b = req('DELETE', f'/teachers/{tid}', token=admin, body={'password': 'Nope12345'})
check('teacher delete wrong password → 403 + audited', s == 403)
s, b = req('GET', '/admin/audit-logs?action=DELETE_TEACHER_DENIED', token=admin)
check('teacher denial in audit log', s == 200 and b['total'] >= 1)
s, b = req('DELETE', f'/teachers/{tid}', token=admin, body={'password': 'Admin@123'})
check('teacher delete correct password → 200', s == 200 and b.get('success'), f'{s} {str(b)[:120]}')

print('\n══ 3. AUDIT LOG API FILTERS (backing the new page) ══')
s, b = req('GET', f'/admin/audit-logs?search=denied&pageSize=50', token=admin)
check('search filter finds DENIED events', s == 200 and b['total'] >= 2, f'total={b.get("total")}')
now = time.gmtime()
today = time.strftime('%Y-%m-%dT00:00:00.000Z', now)
s, b = req('GET', f'/admin/audit-logs?from={today}&pageSize=100', token=admin)
check('date from-filter bounds results', s == 200 and all(x['createdAt'] >= today[:10] for x in b['data']), f'total={b.get("total")}')
s, b = req('GET', '/admin/audit-logs?entity=GradeEntry&pageSize=10', token=admin)
check('entity filter works', s == 200 and all(x['entity'] == 'GradeEntry' for x in b['data']))
s, b = req('GET', '/admin/audit-logs/meta', token=admin)
check('meta endpoint lists actions+entities', s == 200 and 'RETURN_GRADES' in b['actions'] and 'StudentProfile' in b['entities'],
      str(b)[:160])
s, _ = req('GET', '/admin/audit-logs', token=teacher)
check('audit logs admin-only (teacher → 403)', s == 403)

print('\n══ 4. NOTIFICATION DELETION ══')
s, before = req('GET', '/notifications', token=teacher)
check('teacher has notifications to delete', len(before['data']) >= 1, f'count={len(before["data"])}')
victim = before['data'][0]
s, b = req('DELETE', f"/notifications/{victim['id']}", token=teacher)
check('delete single notification → 200', s == 200 and b.get('success'), f'{s}')
s, after = req('GET', '/notifications', token=teacher)
check('notification actually removed', not any(x['id'] == victim['id'] for x in after['data']))
s, b = req('DELETE', f"/notifications/{victim['id']}", token=teacher)
check('re-delete missing notification → 404', s == 404, f'got {s}')
s, anotifs = req('GET', '/notifications', token=admin)
s, b = req('DELETE', f"/notifications/{anotifs['data'][0]['id']}", token=teacher)
check("teacher cannot delete admin's notification (404)", s == 404, f'got {s}')
# generate one more teacher notification (unlock APPROVED -> SUBMITTED), then clear all
req('POST', '/grades/unlock', token=admin, body={'classId': classId, 'subjectId': subjectId, 'semesterId': semester['id'], 'to': 'SUBMITTED'})
s, b = req('DELETE', '/notifications', token=teacher)
check('clear all → 200 with count', s == 200 and b.get('deleted', 0) >= 1, f'{s} {b}')
s, final = req('GET', '/notifications', token=teacher)
check('mailbox empty after clear all', len(final['data']) == 0 and final['unreadCount'] == 0, f"left={len(final['data'])}")
# restore clean state: approve the grid again so marks are back to APPROVED
req('POST', '/grades/approve', token=admin, body={'classId': classId, 'subjectId': subjectId, 'semesterId': semester['id']})

print(f'\n════ RESULT: {passed} passed, {failed} failed ════')
exit(1 if failed else 0)
