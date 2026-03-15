import React, { createContext, useContext, useMemo } from 'react';
import { BUILT_IN_THEMES, ThemeColors, ThemeDefinition, getTheme } from '@/constants/theme';

interface ThemeContextType {
  colors: ThemeColors;
  themeId: string;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: getTheme('catppuccin-mocha'),
  themeId: 'catppuccin-mocha',
  isDark: true,
});

export function ThemeProvider({
  themeId,
  customThemes,
  children,
}: {
  themeId: string;
  customThemes?: ThemeDefinition[];
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    // Check custom themes first, then fall back to built-in
    const custom = customThemes?.find((t) => t.id === themeId);
    const builtIn = BUILT_IN_THEMES.find((t) => t.id === themeId);
    const themeType = custom?.type ?? builtIn?.type ?? 'dark';
    return {
      colors: custom ? custom.colors : getTheme(themeId),
      themeId,
      isDark: themeType === 'dark',
    };
  }, [themeId, customThemes]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
