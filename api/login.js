// Função da Vercel: repassa o login para a Api4Com e devolve o token.
// A senha só passa por aqui a caminho da Api4Com; nada é salvo.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const { email, password } = req.body || {};
  try {
    const resposta = await fetch('https://api.api4com.com/api/v1/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    res.status(resposta.status);
    res.setHeader('Content-Type', resposta.headers.get('content-type') || 'application/json');
    res.send(await resposta.text());
  } catch {
    res.status(502).json({ erro: 'Não foi possível falar com a Api4Com.' });
  }
};
