import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from '@/context/AppContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { ThemeDefinition } from '@/constants/theme';
import { loadCustomThemes } from '@/lib/community';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

function AppThemeWrapper({ children }: { children: React.ReactNode }) {
  const { settings, vault } = useApp();
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>([]);

  useEffect(() => {
    if (vault?.path) {
      loadCustomThemes(vault.path).then(setCustomThemes);
    }
  }, [vault?.path]);

  return (
    <ThemeProvider themeId={settings.theme} customThemes={customThemes}>
      {children}
    </ThemeProvider>
  );
}

function ThemedNavigation() {
  const { colors, isDark } = useTheme();

  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.accent,
      background: colors.bgPrimary,
      card: colors.bgSecondary,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.red,
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bgSecondary },
          headerTintColor: colors.textPrimary,
          contentStyle: { backgroundColor: colors.bgPrimary },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="editor" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'modal',
            title: 'Settings',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen
          name="snippets"
          options={{
            presentation: 'modal',
            title: 'CSS Snippets',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="plugins"
          options={{
            presentation: 'modal',
            title: 'Plugins',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="templates"
          options={{
            presentation: 'modal',
            title: 'Templates',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="recovery"
          options={{
            presentation: 'modal',
            title: 'File Recovery',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="composer"
          options={{
            presentation: 'modal',
            title: 'Note Composer',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="attachments"
          options={{
            presentation: 'modal',
            title: 'Attachments',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="slides"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="backlinks"
          options={{
            presentation: 'modal',
            title: 'Backlinks',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="frontmatter"
          options={{
            presentation: 'modal',
            title: 'Frontmatter',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="flashcards"
          options={{
            title: 'Flashcards',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="trash"
          options={{
            presentation: 'modal',
            title: 'Trash',
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
          }}
        />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <AppThemeWrapper>
        <ThemedNavigation />
      </AppThemeWrapper>
    </AppProvider>
  );
}
