'use strict';

// Compartilha a planilha importada entre a Análise diária de técnicos (index.html) e o
// Report Backlog (backlog.html) na mesma aba do navegador, via sessionStorage: quem
// importa grava, quem abre em seguida carrega. Nada sai do navegador.
const SHARED_FILE_KEY = 'reportFilaTecTNE.planilha';

async function saveSharedFile(file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    sessionStorage.setItem(SHARED_FILE_KEY, JSON.stringify({ name: file.name, type: file.type, data: btoa(binary) }));
  } catch {
    // Arquivo grande demais para o armazenamento ou sem acesso: a outra página pede o upload.
    clearSharedFile();
  }
}

function loadSharedFile() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SHARED_FILE_KEY) || 'null');
    if (!stored?.data) return null;
    const bytes = Uint8Array.from(atob(stored.data), (char) => char.charCodeAt(0));
    return new File([bytes], stored.name, { type: stored.type || '' });
  } catch {
    return null;
  }
}

function clearSharedFile() {
  try {
    sessionStorage.removeItem(SHARED_FILE_KEY);
  } catch {
    // Sem acesso ao armazenamento: nada a limpar.
  }
}
