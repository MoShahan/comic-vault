import { useCallback, useEffect, useState } from 'react';

import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { useFonts, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getDb } from '@/db/database';
import { RootNavigator } from '@/navigation/RootNavigator';
import { purgeOrphanComicFolders } from '@/services/orphanCleanup';
import { ThemeProvider, useTheme } from '@/theme';
import { darkColors } from '@/theme/colors';

function NavigationRoot() {
  const { colors, isDark } = useTheme();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.accent,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: darkColors.bg,
        paddingHorizontal: 32,
        gap: 16,
      }}
    >
      <Text style={{ color: darkColors.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>
        Couldn’t start Comic Vault
      </Text>
      <Text style={{ color: darkColors.muted, textAlign: 'center', lineHeight: 22 }}>{message}</Text>
      <Pressable
        onPress={onRetry}
        style={{
          marginTop: 8,
          backgroundColor: darkColors.accent,
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: '#14171C', fontWeight: '700' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  // Open SQLite, then sweep orphan comics/<id>/ folders left by killed imports.
  const loadDb = useCallback(() => {
    setDbError(null);
    setDbReady(false);
    void getDb()
      .then(async () => {
        try {
          await purgeOrphanComicFolders();
        } catch {
          // Best-effort; do not block boot on cleanup failure.
        }
        setDbReady(true);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : 'Could not open the local library database.';
        setDbError(message);
      });
  }, []);

  useEffect(() => {
    loadDb();
  }, [bootAttempt, loadDb]);

  // Font download failures used to leave fontsLoaded false forever. Continue with
  // system fonts rather than hanging on the splash spinner.
  const fontsReady = fontsLoaded || fontError != null;

  if (dbError) {
    return (
      <BootError
        message={dbError}
        onRetry={() => {
          setBootAttempt((n) => n + 1);
        }}
      />
    );
  }

  if (!fontsReady || !dbReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: darkColors.bg,
        }}
      >
        <ActivityIndicator color={darkColors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NavigationRoot />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
