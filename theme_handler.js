const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
handleThemeChange(mediaQuery.matches);
mediaQuery.addEventListener('change', e => handleThemeChange(e.matches));
