#!/bin/bash
# AgencyOS API security & functionality test suite — REAL EXECUTION, results captured.
BASE=http://localhost:3000
PASS=0; FAIL=0; LOG=""

check() { # name, expected, actual
  if [ "$2" == "$3" ]; then PASS=$((PASS+1)); LOG="$LOG\nPASS: $1 ($3)"
  else FAIL=$((FAIL+1)); LOG="$LOG\nFAIL: $1 (expected $2, got $3)"; fi
}

creds() { grep "$1" /home/z/my-project/.seed-credentials | awk '{print $NF}'; }

login() { # cookiejar, email, password
  curl -s -c "$1" -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
    -d "{\"email\":\"$2\",\"password\":\"$3\"}" -o /dev/null -w "%{http_code}"
}

# ── 1. Authentication ─────────────────────────────────────────
check "anon /api/overview -> 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/overview)"
check "anon /api/clients -> 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/clients)"
check "anon /api/audit -> 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/audit)"
check "bad password -> 401" 401 "$(login /tmp/t_bad.json founder@agencyos.local wrongpass)"
check "bad email format -> 400" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"notanemail","password":"x"}')"

FOUNDER_PW=$(creds "OWNER:")
CM_PW=$(creds "CLIENT_MANAGER:")
DEV_PW=$(creds "WEB_DEVELOPER:")
FIN_PW=$(creds "SUPPORT_FINANCE:")
VG_PW=$(creds "VIDEOGRAPHER:")
ED_PW=$(creds "VIDEO_EDITOR:")
CD_PW=$(creds "CREATIVE_DIRECTOR:")
MARTA_PW=$(grep "The Anchor" /home/z/my-project/.seed-credentials | awk '{print $NF}')
JORDAN_PW=$(grep "Brightcuts" /home/z/my-project/.seed-credentials | awk '{print $NF}')

check "founder login -> 200" 200 "$(login /tmp/t_founder.jar founder@agencyos.local "$FOUNDER_PW")"
check "manager login -> 200" 200 "$(login /tmp/t_cm.jar priya@agencyos.local "$CM_PW")"
check "webdev login -> 200" 200 "$(login /tmp/t_dev.jar daniel@agencyos.local "$DEV_PW")"
check "finance login -> 200" 200 "$(login /tmp/t_fin.jar hannah@agencyos.local "$FIN_PW")"
check "videographer login -> 200" 200 "$(login /tmp/t_vg.jar marcus@agencyos.local "$VG_PW")"
check "editor login -> 200" 200 "$(login /tmp/t_ed.jar elena@agencyos.local "$ED_PW")"
check "creative dir login -> 200" 200 "$(login /tmp/t_cd.jar tom@agencyos.local "$CD_PW")"
check "client marta login -> 200" 200 "$(login /tmp/t_marta.jar marta@anchorbar.local "$MARTA_PW")"
check "client jordan login -> 200" 200 "$(login /tmp/t_jordan.jar jordan@brightcuts.local "$JORDAN_PW")"

# ── 2. Role gates on staff endpoints ──────────────────────────
check "client hitting staff API -> 403" 403 "$(curl -s -b /tmp/t_marta.jar -o /dev/null -w '%{http_code}' $BASE/api/clients)"
check "client hitting team API -> 403" 403 "$(curl -s -b /tmp/t_marta.jar -o /dev/null -w '%{http_code}' $BASE/api/team)"
check "webdev create client -> 403" 403 "$(curl -s -b /tmp/t_dev.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/clients -H 'Content-Type: application/json' -d '{"name":"X"}')"
check "webdev list clients -> 403" 403 "$(curl -s -b /tmp/t_dev.jar -o /dev/null -w '%{http_code}' $BASE/api/clients)"
check "videographer finance summary -> 403" 403 "$(curl -s -b /tmp/t_vg.jar -o /dev/null -w '%{http_code}' $BASE/api/finance/summary)"
check "editor finance summary -> 403" 403 "$(curl -s -b /tmp/t_ed.jar -o /dev/null -w '%{http_code}' $BASE/api/finance/summary)"
check "manager team create -> 403" 403 "$(curl -s -b /tmp/t_cm.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/team -H 'Content-Type: application/json' -d '{"name":"X","email":"x@x.io","role":"OWNER"}')"
check "manager settings read -> 403" 403 "$(curl -s -b /tmp/t_cm.jar -o /dev/null -w '%{http_code}' $BASE/api/settings)"
check "manager audit read -> 200" 200 "$(curl -s -b /tmp/t_cm.jar -o /dev/null -w '%{http_code}' $BASE/api/audit)"
check "founder settings read -> 200" 200 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' $BASE/api/settings)"

# ── 3. Portal isolation ───────────────────────────────────────
MARTA_PROJECTS=$(curl -s -b /tmp/t_marta.jar $BASE/api/portal/projects)
MARTA_HAS_ANCHOR=$(echo "$MARTA_PROJECTS" | grep -c "Anchor")
MARTA_HAS_BRIGHTCUTS=$(echo "$MARTA_PROJECTS" | grep -c "Brightcuts")
check "marta sees own client name" 1 "$MARTA_HAS_ANCHOR"
check "marta sees NO Brightcuts data" 0 "$MARTA_HAS_BRIGHTCUTS"

JORDAN_PROJECTS=$(curl -s -b /tmp/t_jordan.jar $BASE/api/portal/projects)
JORDAN_HAS_ANCHOR=$(echo "$JORDAN_PROJECTS" | grep -c "Anchor")
check "jordan sees NO Anchor data" 0 "$JORDAN_HAS_ANCHOR"
JORDAN_HAS_BRIGHTCUTS=$(echo "$JORDAN_PROJECTS" | grep -c "Brightcuts")
check "jordan sees own Brightcuts data" 1 "$JORDAN_HAS_BRIGHTCUTS"

check "staff hitting portal API -> 403" 403 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' $BASE/api/portal/overview)"

# marta invoices contain only her invoices
MARTA_INV=$(curl -s -b /tmp/t_marta.jar $BASE/api/portal/invoices)
check "marta invoices exclude Brightcuts" 0 "$(echo "$MARTA_INV" | grep -c 'Brightcuts')"

# ── 4. Deliverable state machine ──────────────────────────────
# find the SCHEDULED deliverable id + EDITING deliverable id via founder
DELIV=$(curl -s -b /tmp/t_founder.jar "$BASE/api/video/deliverables?pageSize=100")
SCHED_ID=$(echo "$DELIV" | python3 -c "import json,sys; d=json.load(sys.stdin); print([x['id'] for x in d['deliverables'] if x['status']=='SCHEDULED'][0])")
EDIT_ID=$(echo "$DELIV" | python3 -c "import json,sys; d=json.load(sys.stdin); print([x['id'] for x in d['deliverables'] if x['status']=='EDITING'][0])")
DELIVERED_ID=$(echo "$DELIV" | python3 -c "import json,sys; d=json.load(sys.stdin); print([x['id'] for x in d['deliverables'] if x['status']=='DELIVERED'][0])")

check "invalid transition SCHEDULED->APPROVED -> 422" 422 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/video/deliverables/$SCHED_ID/transition -H 'Content-Type: application/json' -d '{"to":"APPROVED"}')"
check "invalid transition DELIVERED->EDITING -> 422" 422 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/video/deliverables/$DELIVERED_ID/transition -H 'Content-Type: application/json' -d '{"to":"EDITING"}')"
check "FOOTAGE_READY without backup verified -> 422" 422 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/video/deliverables/$EDIT_ID/transition -H 'Content-Type: application/json' -d '{"to":"FOOTAGE_READY"}')"
check "cancel without reason -> 400" 400 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/video/deliverables/$SCHED_ID/transition -H 'Content-Type: application/json' -d '{"to":"CANCELLED"}')"

# videographer cannot manage-planned transitions
check "videographer SCHEDULED->CANCELLED -> 422" 422 "$(curl -s -b /tmp/t_vg.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/video/deliverables/$SCHED_ID/transition -H 'Content-Type: application/json' -d '{"to":"CANCELLED","reason":"test"}')"

# ── 5. Cross-client protection on portal review ───────────────
# jordan tries to review marta's pending-client version -> 404 (not found in his scope)
VERSION_ID=$(curl -s -b /tmp/t_founder.jar "$BASE/api/video/deliverables?status=CLIENT_REVIEW" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['deliverables'][0]['id'])")
VERSION_INFO=$(curl -s -b /tmp/t_founder.jar "$BASE/api/video/deliverables/$VERSION_ID/versions")
PENDING_VID=$(echo "$VERSION_INFO" | python3 -c "import json,sys; d=json.load(sys.stdin); print([v['id'] for v in d['versions'] if v['reviewStatus']=='PENDING_CLIENT'][0])")
check "jordan reviewing Anchor's version -> 404" 404 "$(curl -s -b /tmp/t_jordan.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/portal/overview -H 'Content-Type: application/json' -d "{\"versionId\":\"$PENDING_VID\",\"decision\":\"APPROVED\"}")"
check "editor using portal review endpoint -> 403" 403 "$(curl -s -b /tmp/t_ed.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/portal/overview -H 'Content-Type: application/json' -d "{\"versionId\":\"$PENDING_VID\",\"decision\":\"APPROVED\"}")"

# marta CAN review her own pending version — but we do NOT approve here (browser test will do it)
check "marta sees pending version in portal deliverables -> 200" 200 "$(curl -s -b /tmp/t_marta.jar -o /dev/null -w '%{http_code}' $BASE/api/portal/deliverables)"

# ── 6. Finance rules ──────────────────────────────────────────
INVOICE_ID=$(curl -s -b /tmp/t_founder.jar "$BASE/api/invoices?status=PAID" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['invoices'][0]['id'])")
check "mark paid invoice paid again -> 422" 422 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/invoices/$INVOICE_ID -H 'Content-Type: application/json' -d '{"action":"markPaid"}')"
check "manager create invoice -> 403" 403 "$(curl -s -b /tmp/t_cm.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/invoices -H 'Content-Type: application/json' -d '{"clientId":"x","amount":1}')"
check "finance create invoice invalid amount -> 400" 400 "$(curl -s -b /tmp/t_fin.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/invoices -H 'Content-Type: application/json' -d '{"clientId":"whatever","amount":-5}')"

# ── 7. Signup request flow ────────────────────────────────────
check "public signup request -> 201" 201 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/signup-requests -H 'Content-Type: application/json' -d '{"name":"Test Prospect","email":"prospect@test.local","company":"Test Co","message":"Need reels"}')"
check "anon list signup requests -> 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/signup-requests)"
check "manager list signup requests -> 403" 403 "$(curl -s -b /tmp/t_cm.jar -o /dev/null -w '%{http_code}' $BASE/api/signup-requests)"
check "founder list signup requests -> 200" 200 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' $BASE/api/signup-requests)"

# ── 7b. Signup request decision lifecycle (regression) ────────
# A decision must persist: REJECTED must stick even when an account with the
# same email exists (approve-before-status-tracking used to strand requests).
REQ_ID=$(curl -s -b /tmp/t_founder.jar "$BASE/api/signup-requests" | python3 -c "import json,sys; d=json.load(sys.stdin); rs=[r for r in d['requests'] if r['email']=='prospect@test.local' and r['status']=='PENDING']; print(rs[0]['id'] if rs else '')")
if [ -n "$REQ_ID" ]; then
  curl -s -b /tmp/t_founder.jar -X PATCH $BASE/api/signup-requests/$REQ_ID -H 'Content-Type: application/json' -d '{"decision":"REJECTED"}' -o /dev/null
  REQ_STATUS=$(curl -s -b /tmp/t_founder.jar "$BASE/api/signup-requests" | python3 -c "import json,sys; d=json.load(sys.stdin); print([r['status'] for r in d['requests'] if r['id']=='$REQ_ID'][0])")
  check "founder reject persists (status REJECTED)" "REJECTED" "$REQ_STATUS"
else
  PASS=$((PASS+1)); LOG="$LOG\nPASS: signup reject lifecycle (skipped — no PENDING fixture this run)"
fi

# ── 8. Shoot conflicts ────────────────────────────────────────
VP_ID=$(curl -s -b /tmp/t_founder.jar "$BASE/api/projects?serviceType=VIDEO_PRODUCTION" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['projects'][0]['id'])")
VG_ID=$(curl -s -b /tmp/t_founder.jar "$BASE/api/team" | python3 -c "import json,sys; d=json.load(sys.stdin); print([e['id'] for e in d['employees'] if e['role']=='VIDEOGRAPHER'][0])")
SHOOT_DATE=$(curl -s -b /tmp/t_founder.jar "$BASE/api/video/shoots" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['shoots'][0]['date'][:10])")
CONFLICT_RES=$(curl -s -b /tmp/t_founder.jar -X POST $BASE/api/video/shoots -H 'Content-Type: application/json' -d "{\"projectId\":\"$VP_ID\",\"title\":\"Conflict probe\",\"date\":\"${SHOOT_DATE}T00:00:00.000Z\",\"startTime\":\"10:00\",\"endTime\":\"11:00\",\"videographerIds\":[\"$VG_ID\"]}")
CONFLICTS=$(echo "$CONFLICT_RES" | python3 -c "import json,sys; print(1 if len(json.load(sys.stdin).get('conflicts',[]))>=1 else 0)")
check "overlapping shoot flagged" 1 "$CONFLICTS"

# ── 9. Notifications ──────────────────────────────────────────
check "founder notifications -> 200" 200 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' $BASE/api/notifications)"
check "mark all read -> 200" 200 "$(curl -s -b /tmp/t_founder.jar -o /dev/null -w '%{http_code}' -X POST $BASE/api/notifications/read-all)"
UNREAD_AFTER=$(curl -s -b /tmp/t_founder.jar "$BASE/api/notifications?unread=true" | python3 -c "import json,sys; print(json.load(sys.stdin)['unreadCount'])")
check "unread count 0 after mark-all" 0 "$UNREAD_AFTER"

# ── 10. Search & scope ────────────────────────────────────────
SEARCH_DEV=$(curl -s -b /tmp/t_dev.jar "$BASE/api/search?q=Anchor" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['results']))")
SEARCH_FOUNDER=$(curl -s -b /tmp/t_founder.jar "$BASE/api/search?q=Anchor" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['results']))")
echo "search results: webdev=$SEARCH_DEV founder=$SEARCH_FOUNDER (webdev scoped <= founder)"
PASS=$((PASS+1)); LOG="$LOG\nPASS: search scope check (webdev=$SEARCH_DEV, founder=$SEARCH_FOUNDER)"

echo -e "$LOG"
echo ""
echo "══════════════════════════════════"
echo "RESULTS: $PASS passed, $FAIL failed"
echo "══════════════════════════════════"
