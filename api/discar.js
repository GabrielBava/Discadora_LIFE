// Função da Vercel: pede a ligação à Api4Com (POST /calls).
// Existe porque o navegador bloqueia chamadas diretas do site para a API (CORS).
// O token padrão fica na variável de ambiente API4COM_TOKEN da Vercel (nunca no
// código nem no navegador). Se o navegador mandar um token próprio, ele é usado.
// A Api4Com aceita uma ligação por vez por usuário: se o site mandar "encerrar"
// (o id da ligação anterior), ela é encerrada antes da nova.
const API4COM = 'https://api.api4com.com/api/v1';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const token = req.headers.authorization || process.env.API4COM_TOKEN || '';
  if (!token) return res.status(401).json({ erro: 'Token da Api4Com não configurado.' });
  const { extension, called, encerrar } = req.body || {};
  const cabecalhos = { 'Content-Type': 'application/json', Authorization: token };
  try {
    if (encerrar) {
      const fim = await fetch(`${API4COM}/calls/${encodeURIComponent(encerrar)}/hangup`, { method: 'POST', headers: cabecalhos });
      if (fim.ok) await new Promise((r) => setTimeout(r, 1500)); // dá tempo do Webphone liberar
    }
    const resposta = await fetch(`${API4COM}/calls`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        extension,
        caller: extension,
        called,
        metadata: { gateway: 'discadora-life', callRef: `dl-${Date.now()}` },
      }),
    });
    res.status(resposta.status);
    res.setHeader('Content-Type', resposta.headers.get('content-type') || 'application/json');
    res.send(await resposta.text());
  } catch {
    res.status(502).json({ erro: 'Não foi possível falar com a Api4Com.' });
  }
};
