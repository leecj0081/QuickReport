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
    message: {
      to,
      from: sender,
      text
    }
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

// ── 메인 로직 ────────────────────────────────────────────
async function main() {
  // 마지막 처리 시각 로드 (없으면 1분 전)
  const LAST_CHECK_FILE = '/tmp/last_check.txt';
  let lastCheck;
  try {
    lastCheck = new Date(fs.readFileSync(LAST_CHECK_FILE, 'utf8').trim());
  } catch {
    lastCheck = new Date(Date.now() - 60 * 1000);
  }

  console.log(`🔍 ${lastCheck.toISOString()} 이후 신규 보고 확인 중...`);

  // Firestore에서 신규 보고 조회
  // 컬렉션명은 실제 앱에서 사용하는 이름으로 맞춰주세요
  const snapshot = await db.collection('reports')
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(lastCheck))
    .orderBy('createdAt', 'asc')
    .get();

  if (snapshot.empty) {
    console.log('📭 신규 보고 없음');
  } else {
    console.log(`📬 신규 보고 ${snapshot.size}건 발견`);

    for (const doc of snapshot.docs) {
      const d = doc.data();

      // SMS 메시지 구성
      const msg = [
        '🚨 [사고 퀵보고]',
        `▪ 현장: ${d.site       || '-'}`,
        `▪ 유형: ${d.type       || '-'}`,
        `▪ 피해: ${d.severity   || '-'}`,
        `▪ 장소: ${d.location   || '-'}`,
        `▪ 일시: ${d.datetime   || '-'}`,
        `▪ 보고자: ${d.reporter || '-'}`,
        '* 퀵보고앱 자동발송'
      ].join('\n');

      // 수신번호 전체에 발송
      for (const receiver of RECEIVERS) {
        await sendSMS(receiver, msg);
      }
    }
  }

  // 현재 시각 저장
  fs.writeFileSync(LAST_CHECK_FILE, new Date().toISOString());
  process.exit(0);
}

main().catch(err => {
  console.error('💥 오류 발생:', err);
  process.exit(1);
});
