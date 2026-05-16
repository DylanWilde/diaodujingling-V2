/* Vercel Serverless — DeepSeek CORS代理 (全策略覆盖) */
export default async function handler(req, res) {
  /* ═══ 全量CORS响应头，覆盖所有浏览器策略 ═══ */
  const ALLOW_ORIGIN = req.headers.origin || '*';

  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, User-Agent, DNT, Cache-Control, Keep-Alive, If-Modified-Since, If-None-Match, X-CSRF-Token');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Date, X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Timing-Allow-Origin', '*');

  /* OPTIONS预检 */
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  /* ═══ 转发到DeepSeek ═══ */
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-012f84b897de4f93ba6bebf897b637e8',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await resp.text();

    /* 透传DeepSeek响应 + CORS头 */
    res.status(resp.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (e) {
    res.status(502);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ error: 'DeepSeek unreachable', detail: e.message }));
  }
}
