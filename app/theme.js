// Tema claro/escuro compartilhado entre as páginas. Carregado no <head> para aplicar
// a preferência salva antes da primeira pintura; o botão #theme-toggle alterna e salva.
(function () {
  const STORAGE_KEY = 'reportFilaTec.theme';
  const root = document.documentElement;

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
  root.dataset.theme = saved === 'dark' ? 'dark' : 'light';

  function applyTheme(theme) {
    root.dataset.theme = theme;
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const label = theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(root).getPropertyValue('--paper').trim());
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.dataset.theme);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Sem acesso ao armazenamento: o tema vale só para esta visita.
      }
    });
  });
})();
