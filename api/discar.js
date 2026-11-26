// Função da Vercel: repassa o pedido de ligação para a Api4Com.
// Existe porque o navegador bloqueia chamadas diretas do site para a API (CORS).
// Só repassa; nada é salvo aqui.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const { extension, phone, metadata } = req.body || {};
  try {
    const resposta = await fetch('https://api.api4com.com/api/v1/dialer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization || '' },
      body: JSON.stringify({ extension, phone, metadata }),
    });
    res.status(resposta.status);
    res.setHeader('Content-Type', resposta.headers.get('content-type') || 'application/json');
    res.send(await resposta.text());
  } catch {
    res.status(502).json({ erro: 'Não foi possível falar com a Api4Com.' });
  }
};
