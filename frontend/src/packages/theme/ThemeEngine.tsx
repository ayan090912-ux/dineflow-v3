import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeConfig } from '../types';
import { DEFAULT_THEME } from '../data/mockData';
import { getCurrencySymbol, formatCurrency } from '../utils/currency';

interface ThemeContextType {
  theme: ThemeConfig;
  currencySymbol: string;
  formatPrice: (amount: number) => string;
  setTheme: (theme: ThemeConfig) => void;
  updateThemeColor: (key: keyof ThemeConfig, value: string) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode; initialTheme?: ThemeConfig }> = ({
  children,
  initialTheme = DEFAULT_THEME,
}) => {
  const [theme, setThemeState] = useState<ThemeConfig>(initialTheme);

  useEffect(() => {
    // Inject dynamic CSS variables into document element
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', theme.primaryColor);
    root.style.setProperty('--brand-secondary', theme.secondaryColor);
    root.style.setProperty('--brand-accent', theme.accentColor);
    root.style.setProperty('--brand-bg', theme.backgroundColor);
    root.style.setProperty('--brand-text', theme.textColor);
    
    // Set border radius variable
    const radiusMap = {
      none: '0px',
      sm: '4px',
      md: '8px',
      lg: '16px',
      full: '9999px',
    };
    root.style.setProperty('--brand-radius', radiusMap[theme.borderRadius] || '16px');
  }, [theme]);

  const setTheme = (newTheme: ThemeConfig) => {
    setThemeState(newTheme);
  };

  const updateThemeColor = (key: keyof ThemeConfig, value: string) => {
    setThemeState((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetTheme = () => {
    setThemeState(DEFAULT_THEME);
  };

  const currencySymbol = getCurrencySymbol(theme.currency);
  const formatPrice = (amount: number) => formatCurrency(amount, theme.currency);

  return (
    <ThemeContext.Provider value={{ theme, currencySymbol, formatPrice, setTheme, updateThemeColor, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
