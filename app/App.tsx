import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

import './global.css';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'Geist-Regular': Geist_400Regular,
    'Geist-Medium': Geist_500Medium,
    'GeistMono-Regular': GeistMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-background">
        <StatusBar style="dark" />
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 p-6"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View className="gap-2">
            <Text className="font-sans-medium text-xs uppercase tracking-[1.6px] text-muted-foreground">
              KnoGest mobile
            </Text>
            <Text className="font-heading text-3xl text-foreground">
              Tokens de estilo
            </Text>
            <Text className="font-sans text-base leading-6 text-muted-foreground">
              A base visual do dashboard web está pronta para os próximos fluxos
              nativos.
            </Text>
          </View>

          <View className="gap-4 rounded-lg border border-border bg-card p-5">
            <View className="gap-1">
              <Text className="font-sans-semibold text-base text-card-foreground">
                Tipografia
              </Text>
              <Text className="font-sans text-sm text-muted-foreground">
                Inter é a fonte de interface; Geist e Geist Mono estão
                disponíveis para uso específico.
              </Text>
            </View>
            <Text className="font-geist-sans text-lg text-foreground">
              Geist Sans · detalhes e rótulos técnicos
            </Text>
            <Text className="font-mono text-sm text-foreground">
              Geist Mono · RDO-2026-09-14 / 08:30
            </Text>
          </View>

          <View className="gap-3 rounded-lg border border-border bg-card p-5">
            <Text className="font-sans-semibold text-base text-card-foreground">
              Estados operacionais
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <View className="rounded-md bg-primary px-3 py-2">
                <Text className="font-sans-semibold text-sm text-primary-foreground">
                  Primário
                </Text>
              </View>
              <View className="rounded-md bg-secondary px-3 py-2">
                <Text className="font-sans-semibold text-sm text-secondary-foreground">
                  Secundário
                </Text>
              </View>
              <View className="rounded-md bg-accent px-3 py-2">
                <Text className="font-sans-semibold text-sm text-accent-foreground">
                  Destaque
                </Text>
              </View>
              <View className="rounded-md bg-destructive px-3 py-2">
                <Text className="font-sans-semibold text-sm text-primary-foreground">
                  Erro
                </Text>
              </View>
            </View>
          </View>

          <View className="gap-3 rounded-lg border border-sidebar-border bg-sidebar p-5">
            <Text className="font-sans-semibold text-base text-sidebar-foreground">
              Escala de superfície
            </Text>
            <View className="h-3 rounded-sm bg-chart-1" />
            <View className="h-3 rounded-md bg-chart-2" />
            <View className="h-3 rounded-lg bg-chart-3" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
