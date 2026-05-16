/* Vercel Serverless — DeepSeek CORS代理 */
export default async function handler(req, res) {
  /* CORS */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
    res.status(resp.status).send(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
