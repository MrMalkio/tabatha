import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../context/AuthContext';
import CrashGuard from '../components/CrashGuard';
import { useStaleBundleReload } from '../lib/freshness';
import { colors } from '../lib/theme';

export default function RootLayout() {
  // PWA staleness guard — reload when a newer bundle is live (see freshness.ts).
  useStaleBundleReload();
  return (
    <CrashGuard>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bgBase },
            }}
          />
        </AuthProvider>
      </SafeAreaProvider>
    </CrashGuard>
  );
}
