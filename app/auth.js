// Login das páginas. Carregado no <head>: com data-protegida no <script>, quem não entrou
// vai para login.html antes da primeira pintura. O login abre o cadastro criptografado
// (cadastro.enc.js) com a senha do usuário; o cadastro aberto fica na sessão desta aba
// e é exposto como CADASTRO_PADRAO para o app.js.
const AUTH_SESSION_KEY = 'reportFilaTec.sessao';
const AUTH_LOGIN_PAGE = 'login.html';
const AUTH_DEFAULT_PAGE = 'index.html';

function readAuthSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY) || 'null');
    return session?.usuario ? session : null;
  } catch {
    return null;
  }
}

const CADASTRO_PADRAO = readAuthSession()?.cadastro || [];

class LoginError extends Error {}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

// Mesmo esquema do ferramentas/criptografar_cadastro.py: a senha (PBKDF2) abre a chave
// do usuário, que abre o cadastro. Senha errada falha na verificação do AES-GCM.
async function unlockCadastro(usuario, senha) {
  const pacote = typeof CADASTRO_CRIPTOGRAFADO === 'undefined' ? null : CADASTRO_CRIPTOGRAFADO;
  const entrada = pacote?.usuarios[usuario.toLowerCase()];
  if (!entrada) throw new LoginError('Usuário ou senha inválidos.');
  const encoder = new TextEncoder();
  try {
    const base = await crypto.subtle.importKey('raw', encoder.encode(senha), 'PBKDF2', false, ['deriveKey']);
    const chaveSenha = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: fromBase64(entrada.salt), iterations: pacote.iteracoes, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const chaveDados = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(entrada.iv), additionalData: encoder.encode(usuario.toLowerCase()) },
      chaveSenha, fromBase64(entrada.chave)
    );
    const chave = await crypto.subtle.importKey('raw', chaveDados, 'AES-GCM', false, ['decrypt']);
    const dados = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(pacote.iv) }, chave, fromBase64(pacote.dados));
    return JSON.parse(new TextDecoder().decode(dados));
  } catch {
    throw new LoginError('Usuário ou senha inválidos.');
  }
}

async function login(usuario, senha) {
  const nome = usuario.trim();
  const cadastro = await unlockCadastro(nome, senha);
  try {
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ usuario: nome, cadastro }));
  } catch {
    throw new LoginError('O navegador bloqueou o armazenamento da sessão. Saia da navegação anônima ou libere os dados do site.');
  }
}

function logout() {
  try { sessionStorage.removeItem(AUTH_SESSION_KEY); } catch {}
  location.replace(AUTH_LOGIN_PAGE);
}

// Só volta para páginas do próprio site (ex.: "backlog.html"), nunca para outro endereço.
function pageAfterLogin() {
  const volta = new URLSearchParams(location.search).get('volta') || '';
  return /^[\w-]+\.html$/.test(volta) ? volta : AUTH_DEFAULT_PAGE;
}

(function () {
  if (!document.currentScript?.hasAttribute('data-protegida')) return;
  const session = readAuthSession();
  if (!session) {
    document.documentElement.style.display = 'none';
    const pagina = location.pathname.split('/').pop() || AUTH_DEFAULT_PAGE;
    location.replace(`${AUTH_LOGIN_PAGE}?volta=${encodeURIComponent(pagina)}`);
    return;
  }
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('logout-button');
    if (!button) return;
    button.title = `Sair (${session.usuario})`;
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', logout);
  });
})();
