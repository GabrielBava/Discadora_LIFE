// Função da Vercel: gera um token da Api4Com que nunca expira, com e-mail e senha
// (login + POST /users/accessTokens com ttl -1). A senha só passa por aqui a caminho
// da Api4Com; nada é salvo.
const API4COM = 'https://api.api4com.com/api/v1';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const { email, password } = req.body || {};
  try {
    const login = await fetch(`${API4COM}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const temporario = (await login.json().catch(() => ({}))).id;
    if (!login.ok || !temporario) return res.status(login.status || 401).json({ erro: 'Login recusado.' });

    const permanente = await fetch(`${API4COM}/users/accessTokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: temporario },
      body: JSON.stringify({ ttl: -1 }),
    });
    const id = (permanente.ok && (await permanente.json().catch(() => ({}))).id) || temporario;
    res.status(200).json({ id, semValidade: id !== temporario });
  } catch {
    res.status(502).json({ erro: 'Não foi possível falar com a Api4Com.' });
  }
};
