export default {
  async fetch(request) {
    /* CORS 预检 */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    /* 健康检查 */
    const url = new URL(request.url);
    if (url.pathname === '/health' || request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', provider: 'DeepSeek' }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    /* POST → DeepSeek */
    const DEEPSEEK_KEY = 'sk-012f84b897de4f93ba6bebf897b637e8';

    try {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + DEEPSEEK_KEY
        },
        body: request.body
      });

      const data = await resp.text();

      return new Response(data, {
        status: resp.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'DeepSeek unreachable: ' + e.message }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
