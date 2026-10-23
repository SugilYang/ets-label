/**
 * ETS 입고 라벨 판독 (Gemini) — sugilyang.github.io/ets-label 용
 * 설정: 프로젝트 설정 > 스크립트 속성에 GEMINI_API_KEY 추가
 * 배포: 웹 앱 / 실행: 나 / 액세스: 모든 사용자
 */
const MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.8-flash'];

const PROMPT = `사진은 한국 제조사 입고 부품 라벨입니다. 표의 칸 이름은
프로젝트명, UNIT명, ASSY명, 품명, Maker/재질, 품번/수량, 비고, 규격/도번, 공급업체, 납품일자 입니다.
주의: 라벨이 한 칸씩 밀려 인쇄되어 칸 이름과 값이 어긋난 경우가 있습니다.
칸 위치보다 값의 순서와 형식으로 판단하세요. 값은 항상 위 순서대로 나옵니다.
- 품번은 PUR- 로 시작, 수량은 품번 옆 칸의 숫자
- 납품일자는 YYYY-MM-DD, 공급업체는 회사명, 프로젝트명은 보통 맨 위(밀린 라벨은 맨 아래)
- 값 끝의 쉼표(,)는 빼고, 읽을 수 없으면 빈 문자열
아래 키의 JSON 하나만 출력:
{"project":"","unit":"","assy":"","item":"","maker":"","partNo":"","qty":"","note":"","spec":"","supplier":"","date":""}`;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!key) throw new Error('GEMINI_API_KEY 미설정');
    const payload = {
      contents: [{ parts: [
        { text: PROMPT },
        { inline_data: { mime_type: 'image/jpeg', data: body.image } }
      ]}],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    };
    let last = '';
    for (const m of MODELS) {
      const res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + key,
        { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
      if (res.getResponseCode() === 200) {
        const text = JSON.parse(res.getContentText()).candidates[0].content.parts[0].text;
        return out({ ok: true, data: JSON.parse(text) });
      }
      last = m + ' ' + res.getResponseCode();
    }
    throw new Error('Gemini 호출 실패: ' + last);
  } catch (err) {
    return out({ ok: false, error: String(err.message || err) });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
