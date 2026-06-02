/* ═══════════════════════════════════════════════════
   阿里云 FC HTTP函数 — DeepSeek CORS代理
   代码粘贴后在「HTTP触发器」获取公网URL
   ═══════════════════════════════════════════════════ */

var DEEPSEEK_KEY = 'DEEPSEEK_KEY_1_REDACTED';

exports.handler = async (event, context) => {
  /* CORS预检 */
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      },
      body: ''
    };
  }

  /* 转发到DeepSeek */
  try {
    var resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_KEY
      },
      body: event.body || '{}'
    });
    var data = await resp.text();

    return {
      statusCode: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: data
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: e.message })
    };
  }
};
