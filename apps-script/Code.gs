/**
 * ETS 입고 라벨 판독 (Gemini) — sugilyang.github.io/ets-label 용
 * 설정: 프로젝트 설정 > 스크립트 속성에 GEMINI_API_KEY 추가
 * 배포: 웹 앱 / 실행: 나 / 액세스: 모든 사용자
 */
// 앞 모델이 한도 초과(429)·과부하(503)·없음(404)이면 다음 모델로 (모델별 한도가 따로 계산됨)
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'];

const PROMPT = `사진은 한국 제조사 입고 부품 라벨입니다. 표의 칸 이름은
프로젝트명, UNIT명, ASSY명, 품명, Maker/재질, 품번/수량, 비고, 규격/도번, 공급업체, 납품일자 입니다.
주의: 라벨이 한 칸씩 밀려 인쇄되어 칸 이름과 값이 어긋난 경우가 있습니다.
칸 위치보다 값의 순서와 형식으로 판단하세요. 값은 항상 위 순서대로 나옵니다.
- 품번은 PUR- 로 시작, 수량은 품번 옆 칸의 숫자
- 납품일자는 YYYY-MM-DD (연도 숫자 4자리를 한 자씩 정확히), 공급업체는 회사명
- 프로젝트명은 보통 맨 위(밀린 라벨은 맨 아래)
- 값 끝의 쉼표(,)는 빼고, 읽을 수 없으면 빈 문자열
아래 키의 JSON 하나만 출력:
{"project":"","unit":"","assy":"","item":"","maker":"","partNo":"","qty":"","note":"","spec":"","supplier":"","date":""}`;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'mail') return sendMail(body);
    const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!key) return out({ ok: false, error: '키 미설정(GEMINI_API_KEY)' });
    const payload = JSON.stringify({
      contents: [{ parts: [
        { text: PROMPT },
        { inline_data: { mime_type: 'image/jpeg', data: body.image } }
      ]}],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    });
    const errs = [];
    for (const m of MODELS) {
      const res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + key,
        { method: 'post', contentType: 'application/json', payload: payload, muteHttpExceptions: true });
      const code = res.getResponseCode();
      if (code === 200) {
        const text = JSON.parse(res.getContentText()).candidates[0].content.parts[0].text;
        return out({ ok: true, model: m, data: JSON.parse(text) });
      }
      errs.push(m + ':' + code);
      if ([404, 429, 500, 503].indexOf(code) < 0) {   // 키 오류 등은 다른 모델로 넘어가도 같으므로 중단
        let msg = '';
        try { msg = JSON.parse(res.getContentText()).error.message; } catch (x) {}
        return out({ ok: false, code: code, error: (code === 400 || code === 403 ? '키 오류' : '오류') + ' ' + code + ' ' + msg.slice(0, 120) });
      }
    }
    const busy = errs.some(function (s) { return /:(429|503)$/.test(s); });
    return out({ ok: false, code: busy ? 429 : 404, error: (busy ? '한도 초과' : '모델 없음') + ' (' + errs.join(', ') + ')' });
  } catch (err) {
    return out({ ok: false, error: '판독 실패: ' + String(err.message || err).slice(0, 120) });
  }
}

// 엑셀 첨부 메일 발송 (본인 Gmail 계정으로 발송, 무료 계정은 하루 100통)
function sendMail(b) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.to || '')) return out({ ok: false, error: '이메일 주소 오류' });
  if (!/\.xlsx$/.test(b.name || '') || !b.file) return out({ ok: false, error: '첨부 파일 오류' });
  const when = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  try {
  MailApp.sendEmail({
    to: b.to,
    subject: '[ETS 입고라벨] ' + when + ' (' + (b.count || 0) + '건)',
    body: '입고 라벨 ' + (b.count || 0) + '건을 엑셀로 정리한 파일입니다.\n\n- 보낸 곳: sugilyang.github.io/ets-label',
    name: 'ETS 입고라벨',
    attachments: [Utilities.newBlob(Utilities.base64Decode(b.file),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b.name)]
  });
  } catch (err) {
    return out({ ok: false, error: '메일 발송 실패: ' + String(err.message || err).slice(0, 120) });
  }
  return out({ ok: true });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
