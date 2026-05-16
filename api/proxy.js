/* Vercel Serverless — DeepSeek CORS代理 */
export default async function handler(req, res) {
  /* CORS */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  /* Edge移动端要求显式列出Authorization，不能用通配符 */
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-012f84b897de4f93ba6bebf897b637e8'
      },
      body: JSON.stringify(req.body)
    });
    const data = await resp.text();
    /* 透传响应+CORS头 */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(resp.status).send(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
