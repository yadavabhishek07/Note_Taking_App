import assert from 'assert';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runTests() {
  console.log(`\n🚀 Starting End-to-End Verification against ${BASE_URL}...\n`);

  let authCookie = '';

  // 1. Health check
  console.log('1️⃣ Checking API Health...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
  const healthData = await healthRes.json();
  assert.strictEqual(healthData.status, 'ok');
  console.log('  ✅ API Health OK');

  // 2. Register / Login
  console.log('\n2️⃣ Testing Registration & Authentication...');
  const testEmail = `test_${Date.now()}@example.com`;
  const testPass = 'securePassword123';

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPass }),
  });
  assert.strictEqual(regRes.status, 201, 'Registration should return 201');
  const regCookie = regRes.headers.get('set-cookie');
  assert.ok(regCookie, 'Should receive session cookie');
  authCookie = regCookie.split(';')[0];
  console.log('  ✅ User registered & session cookie received');

  // Verify /api/auth/me
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: authCookie },
  });
  assert.strictEqual(meRes.status, 200);
  const meData = await meRes.json();
  assert.strictEqual(meData.user?.email, testEmail);
  console.log('  ✅ /api/auth/me authenticated correctly');

  // 3. Public One-Time Note Flow
  console.log('\n3️⃣ Testing Public One-Time Link & Self-Destruction...');
  const oneTimeRes = await fetch(`${BASE_URL}/api/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookie,
    },
    body: JSON.stringify({
      title: 'Top Secret Payload',
      content: 'This note will self destruct after 1 view.',
      shareType: 'ONE_TIME',
      accessType: 'PUBLIC',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  assert.strictEqual(oneTimeRes.status, 201);
  const oneTimeData = await oneTimeRes.json();
  const publicToken = oneTimeData.shareLink.token;
  console.log(`  ✅ One-time public note created (token: ${publicToken})`);

  // First View: should succeed and return content
  const view1 = await fetch(`${BASE_URL}/api/share/${publicToken}`);
  assert.strictEqual(view1.status, 200, 'First view of one-time public link must return 200');
  const view1Data = await view1.json();
  assert.strictEqual(view1Data.content, 'This note will self destruct after 1 view.');
  assert.strictEqual(view1Data.viewCount, 1, 'View count must be 1');
  console.log('  ✅ First view succeeded, view count = 1');

  // Second View: MUST return 410 Gone / ONE_TIME_USED
  const view2 = await fetch(`${BASE_URL}/api/share/${publicToken}`);
  assert.strictEqual(view2.status, 410, 'Second view of one-time link must return 410 Gone');
  const view2Data = await view2.json();
  assert.strictEqual(view2Data.code, 'ONE_TIME_USED', 'Error code must be ONE_TIME_USED');
  console.log('  ✅ Second view blocked with 410 ONE_TIME_USED (Self-Destruct Verified!)');

  // 4. Password-Protected Note Flow
  console.log('\n4️⃣ Testing Password-Protected Note & Dynamic Key...');
  const pwdNoteRes = await fetch(`${BASE_URL}/api/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookie,
    },
    body: JSON.stringify({
      title: 'Encrypted Vault',
      content: 'Super secure secret message inside the vault.',
      shareType: 'ONE_TIME',
      accessType: 'PASSWORD_PROTECTED',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  assert.strictEqual(pwdNoteRes.status, 201);
  const pwdNoteData = await pwdNoteRes.json();
  const pwdToken = pwdNoteData.shareLink.token;
  const dynamicKey = pwdNoteData.shareLink.dynamicPassword;
  assert.ok(dynamicKey, 'Must receive generated dynamic password');
  console.log(`  ✅ Note created with dynamic key: "${dynamicKey}"`);

  // Initial GET /api/share/:token: must hide content
  const checkPwd = await fetch(`${BASE_URL}/api/share/${pwdToken}`);
  assert.strictEqual(checkPwd.status, 200);
  const checkPwdData = await checkPwd.json();
  assert.strictEqual(checkPwdData.requiresPassword, true, 'Must indicate password is required');
  assert.strictEqual(checkPwdData.content, undefined, 'Content MUST NOT be leaked in initial request');
  console.log('  ✅ Initial share request hides content and requires password');

  // Wrong password attempt
  const wrongUnlock = await fetch(`${BASE_URL}/api/share/${pwdToken}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'WrongPassword999' }),
  });
  assert.strictEqual(wrongUnlock.status, 401, 'Wrong password must return 401 Unauthorized');
  const wrongUnlockData = await wrongUnlock.json();
  assert.strictEqual(wrongUnlockData.code, 'INVALID_PASSWORD');
  console.log('  ✅ Wrong password rejected with 401 (view count NOT incremented)');

  // Correct password unlock
  const correctUnlock = await fetch(`${BASE_URL}/api/share/${pwdToken}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: dynamicKey }),
  });
  assert.strictEqual(correctUnlock.status, 200, 'Correct dynamic key must return 200');
  const correctUnlockData = await correctUnlock.json();
  assert.strictEqual(correctUnlockData.content, 'Super secure secret message inside the vault.');
  assert.strictEqual(correctUnlockData.viewCount, 1, 'View count must be incremented to 1');
  console.log('  ✅ Correct password unlocked note, view count = 1');

  // Re-attempting unlock on one-time link: must return 410
  const reUnlock = await fetch(`${BASE_URL}/api/share/${pwdToken}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: dynamicKey }),
  });
  assert.strictEqual(reUnlock.status, 410, 'One-time link must be burned after first successful unlock');
  console.log('  ✅ Post-unlock re-access blocked with 410 (Burn Verified)');

  // 5. Time-Based Link & Force Revoke
  console.log('\n5️⃣ Testing Time-Based Access & Force Invalidation/Revocation...');
  const timeNoteRes = await fetch(`${BASE_URL}/api/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookie,
    },
    body: JSON.stringify({
      title: 'Company Policy Notice',
      content: 'This note can be read multiple times until revoked.',
      shareType: 'TIME_BASED',
      accessType: 'PUBLIC',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  const timeNoteData = await timeNoteRes.json();
  const timeNoteId = timeNoteData.note.id;
  const timeToken = timeNoteData.shareLink.token;

  // View 1
  const tView1 = await fetch(`${BASE_URL}/api/share/${timeToken}`);
  const tData1 = await tView1.json();
  assert.strictEqual(tData1.viewCount, 1);

  // View 2 (should allow multiple views)
  const tView2 = await fetch(`${BASE_URL}/api/share/${timeToken}`);
  const tData2 = await tView2.json();
  assert.strictEqual(tData2.viewCount, 2);
  console.log('  ✅ Time-based note allowed multiple views (view count = 2)');

  // Now FORCE REVOKE the link as the creator
  const revokeRes = await fetch(`${BASE_URL}/api/notes/${timeNoteId}/revoke`, {
    method: 'POST',
    headers: { Cookie: authCookie },
  });
  assert.strictEqual(revokeRes.status, 200, 'Revoke must return 200');
  console.log('  ✅ Creator revoked the share link');

  // Attempt to view after revocation
  const postRevokeView = await fetch(`${BASE_URL}/api/share/${timeToken}`);
  assert.strictEqual(postRevokeView.status, 410, 'Revoked link must return 410');
  const postRevokeData = await postRevokeView.json();
  assert.strictEqual(postRevokeData.code, 'LINK_REVOKED');
  console.log('  ✅ Revoked link immediately blocked with 410 LINK_REVOKED');

  // Verify view count was NOT incremented by the blocked request
  const noteInspect = await fetch(`${BASE_URL}/api/notes/${timeNoteId}`, {
    headers: { Cookie: authCookie },
  });
  const inspectData = await noteInspect.json();
  assert.strictEqual(inspectData.activeLink.viewCount, 2, 'View count must stay 2');
  console.log('  ✅ View count remained at 2 (blocked visit did not increment count)');

  // 6. Concurrency / Race Condition Test
  console.log('\n6️⃣ Simulating Concurrent Access Race Condition on One-Time Link...');
  const raceNoteRes = await fetch(`${BASE_URL}/api/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookie,
    },
    body: JSON.stringify({
      title: 'High Concurrency Race Test',
      content: 'Only one thread is allowed to open this!',
      shareType: 'ONE_TIME',
      accessType: 'PUBLIC',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  const raceNoteData = await raceNoteRes.json();
  const raceToken = raceNoteData.shareLink.token;

  // Fire 10 simultaneous requests to open the one-time link at the exact same instant
  console.log('  ⚡ Firing 10 simultaneous requests to the same one-time link...');
  const results = await Promise.all(
    Array.from({ length: 10 }).map(() => fetch(`${BASE_URL}/api/share/${raceToken}`))
  );

  const statusCodes = results.map((r) => r.status);
  const successCount = statusCodes.filter((s) => s === 200).length;
  const goneCount = statusCodes.filter((s) => s === 410).length;

  console.log(`  📊 Result: 200 OK: ${successCount}, 410 Gone: ${goneCount}`);
  assert.strictEqual(successCount, 1, 'EXACTLY ONE request must receive 200 OK');
  assert.strictEqual(goneCount, 9, 'EXACTLY NINE requests must receive 410 Gone');

  // Verify view count in DB is exactly 1
  const raceCheck = await fetch(`${BASE_URL}/api/notes/${raceNoteData.note.id}`, {
    headers: { Cookie: authCookie },
  });
  const raceCheckData = await raceCheck.json();
  assert.strictEqual(raceCheckData.activeLink.viewCount, 1, 'Database view count must be exactly 1');
  console.log('  ✅ RACE CONDITION PREVENTED: Atomic SQL update guaranteed single-consumer execution!');

  console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY! 100% COMPLIANT!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
