// Função da Vercel: repassa o pedido de ligação para a Api4Com.
// Existe porque o navegador bloqueia chamadas diretas do site para a API (CORS).
// O token padrão fica na variável de ambiente API4COM_TOKEN da Vercel (nunca no
// código nem no navegador). Se o navegador mandar um token próprio, ele é usado.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const token = req.headers.authorization || process.env.API4COM_TOKEN || '';
  if (!token) return res.status(401).json({ erro: 'Token da Api4Com não configurado.' });
  const { extension, phone, metadata } = req.body || {};
  try {
    const resposta = await fetch('https://api.api4com.com/api/v1/dialer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ extension, phone, metadata }),
    });
    res.status(resposta.status);
    res.setHeader('Content-Type', resposta.headers.get('content-type') || 'application/json');
    res.send(await resposta.text());
  } catch {
    res.status(502).json({ erro: 'Não foi possível falar com a Api4Com.' });
  }
};
