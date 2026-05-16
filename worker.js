/* ═══════════════════════════════════════════════════
   调度精灵 — Cloudflare Worker CORS代理
   部署: npx wrangler deploy
   ═══════════════════════════════════════════════════ */

export default {
  async fetch(request) {
    /* 处理CORS预检 */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    const DEEPSEEK_KEY = 'sk-012f84b897de4f93ba6bebf897b637e8';
    const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

    /* 转发请求到DeepSeek */
    const modified = new Request(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_KEY
      },
      body: request.body
    });

    const resp = await fetch(modified);
    const corsHeaders = new Headers(resp.headers);
    corsHeaders.set('Access-Control-Allow-Origin', '*');
    corsHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    corsHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(resp.body, {
      status: resp.status,
      headers: corsHeaders
    });
  }
};
