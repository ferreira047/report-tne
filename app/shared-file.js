'use strict';

// Compartilha a planilha importada entre a Análise diária de técnicos (index.html), o
// Report Backlog (backlog.html) e o campo ONLINE dos Chamados Repetidos (repetidos.html)
// na mesma aba do navegador, via sessionStorage: quem
// importa grava, quem abre em seguida carrega. Nada sai do navegador.
// Com outra chave, guarda uma planilha só de uma página (ex.: NÃO AGENDADAS ao apertar F5).
const SHARED_FILE_KEY = 'reportFilaTecTNE.planilha';

async function saveSharedFile(file, key = SHARED_FILE_KEY) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    sessionStorage.setItem(key, JSON.stringify({ name: file.name, type: file.type, data: btoa(binary) }));
  } catch {
    // Arquivo grande demais para o armazenamento ou sem acesso: a outra página pede o upload.
    clearSharedFile(key);
  }
}

function loadSharedFile(key = SHARED_FILE_KEY) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!stored?.data) return null;
    const bytes = Uint8Array.from(atob(stored.data), (char) => char.charCodeAt(0));
    return new File([bytes], stored.name, { type: stored.type || '' });
  } catch {
    return null;
  }
}

function clearSharedFile(key = SHARED_FILE_KEY) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Sem acesso ao armazenamento: nada a limpar.
  }
}
