const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

// ── Firebase 초기화 ──────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── 수신번호 목록 ────────────────────────────────────────
const RECEIVERS = [
  '01022430081',
  '01035960414'
];

// ── 솔라피 SMS 발송 함수 ─────────────────────────────────
async function sendSMS(to, text) {
  const apiKey    = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender    = process.env.SOLAPI_SENDER;

  const date      = new Date().toISOString();
  const salt      = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');

  const headers = {
    Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
    'Content-Type': 'application/json'
  };

  const body = {
    message: { to, from: sender, text }
  };

  try {
    const res = await axios.post(
      'https://api.solapi.com/messages/v4/send',
      body,
      { headers }
    );
    console.log(`✅ SMS 발송 성공 → ${to}`, res.data);
  } catch (err) {
    console.error(`❌ SMS 발송 실패 → ${to}`, err.response?.data || err.message);
  }
}

// ── Firestore 컬렉션 목록 출력 (디버깅용) ────────────────
async function listCollections() {
  const collections = await db.listCollections();
  console.log('📂 Firestore 컬렉션 목록:');
  if (collections.length === 0) {
    console.log('  (비어있음 - 아직 보고가 등록되지 않았습니다)');
  }
  for (const col of collections) {
    console.log(`  - ${col.id}`);
    const snap = await col.limit(3).get();
    snap.forEach(doc => {
      console.log(`    문서: ${doc.id}`, JSON.stringify(doc.data()).substring(0, 100));
    });
  }
  return collections.map(c => c.id);
}

// ── 메인 로직 ────────────────────────────────────────────
async function main() {
  // 컬렉션 목록 확인
  const collectionIds = await listCollections();

  if (collectionIds.length === 0) {
    console.log('📭 데이터 없음: 앱에서 보고를 먼저 등록해주세요.');
    process.exit(0);
  }

  // 마지막 처리 시각 로드
  const LAST_CHECK_FILE = '/tmp/last_check.txt';
  let lastCheck;
  try {
    lastCheck = new Date(fs.readFileSync(LAST_CHECK_FILE, 'utf8').trim());
  } catch {
    lastCheck = new Date(Date.now() - 60 * 60 * 1000); // 1시간 전
  }

  console.log(`🔍 ${lastCheck.toISOString()} 이후 신규 보고 확인 중...`);

  // 발견된 첫 번째 컬렉션에서 조회
  const targetCollection = collectionIds[0];
  console.log(`📌 대상 컬렉션: ${targetCollection}`);

  const snapshot = await db.collection(targetCollection)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  if (snapshot.empty) {
    console.log('📭 신규 보고 없음');
  } else {
    console.log(`📬 문서 ${snapshot.size}건 발견`);

    for (const doc of snapshot.docs) {
      const d = doc.data();
      console.log('문서 데이터:', JSON.stringify(d).substring(0, 200));

      const createdAt = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || 0);
      if (createdAt <= lastCheck) continue;

      const msg = [
        '🚨 [사고 퀵보고]',
        `▪ 현장: ${d.site || d.현장 || d.location || '-'}`,
        `▪ 유형: ${d.type || d.유형 || d.accidentType || '-'}`,
        `▪ 피해: ${d.severity || d.피해 || d.damage || '-'}`,
        `▪ 장소: ${d.place || d.장소 || d.spot || '-'}`,
        `▪ 일시: ${d.datetime || d.일시 || d.date || '-'}`,
        `▪ 보고자: ${d.reporter || d.보고자 || d.name || '-'}`,
        '* 퀵보고앱 자동발송'
      ].join('\n');

      for (const receiver of RECEIVERS) {
        await sendSMS(receiver, msg);
      }
    }
  }

  fs.writeFileSync(LAST_CHECK_FILE, new Date().toISOString());
  process.exit(0);
}

main().catch(err => {
  console.error('💥 오류 발생:', err);
  process.exit(1);
});
