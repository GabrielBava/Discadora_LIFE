// Função da Vercel: diz ao site se o token padrão está configurado no servidor.
// Nunca devolve o token.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ tokenNoServidor: Boolean(process.env.API4COM_TOKEN) });
};
