import { useEffect, useState } from 'react';
import { ThemeContext } from './useTheme';

// Mesma lógica de app-react/src/context/ThemeContext.jsx — data-theme na raiz
// + persistência em localStorage, pra manter os dois apps consistentes.
function getInitialTheme() {
  return localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
