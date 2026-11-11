// help.js — Script khusus untuk halaman panduan

document.addEventListener('DOMContentLoaded', () => {
  // 1. Terapkan tema yang tersimpan
  const savedTheme = localStorage.getItem('memora-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // 2. Setup tombol toggle tema
  const btnTheme = document.getElementById('btnTheme');
  if (btnTheme) {
    updateThemeIcon(savedTheme);
    btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('memora-theme', next);
      updateThemeIcon(next);
    });
  }

  function updateThemeIcon(theme) {
    if (!btnTheme) return;
    btnTheme.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    btnTheme.title = theme === 'dark' ? 'Mode terang' : 'Mode gelap';
  }
});
