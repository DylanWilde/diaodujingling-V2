/* ═══════════════════════════════════════════════════
   腾讯云 SCF — DeepSeek CORS 代理函数
   直接粘贴到腾讯云函数控制台即可
   ═══════════════════════════════════════════════════ */

exports.main_handler = async (event) => {
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

  /* POST → DeepSeek */
  try {
    const body = JSON.parse(event.body || '{}');
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (process.env.DEEPSEEK_KEY || '')
      },
      body: JSON.stringify(body)
    });
    const data = await resp.text();

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
