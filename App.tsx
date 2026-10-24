import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AirPods, Battery, decodeAirPods } from './src/airpods';
import { scanPermissions } from './src/permissions';
import type { ScanReport } from './src/scanReport';

type Scanner = { scan(): Promise<ScanReport>; cancel(): void };
const scanner: Scanner | undefined = NativeModules.AirPodsScanner;
const emptyBattery: Battery = { percent: null, charging: null };

async function requestPermissions() {
  const permissions = scanPermissions(Number(Platform.Version));
  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    p => result[p] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

function BatteryRow({ label, value }: { label: string; value: Battery }) {
  const percent = value.percent === null ? '—' : `≈ ${value.percent}%`;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${
        value.percent === null ? 'нет данных' : `около ${value.percent}%`
      }${value.charging ? ', заряжается' : ''}`}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.reading}>
        {value.charging ? <Text style={styles.charging}>ϟ</Text> : null}
        <Text style={styles.percent}>{percent}</Text>
      </View>
    </View>
  );
}

function BatteryCard({ device }: { device?: AirPods }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{device?.model ?? 'AirPods'}</Text>
      {device?.kind === 'headphones' ? (
        <BatteryRow label="Наушники" value={device.headset} />
      ) : (
        <>
          <BatteryRow
            label="Левый наушник"
            value={device?.left ?? emptyBattery}
          />
          <BatteryRow
            label="Правый наушник"
            value={device?.right ?? emptyBattery}
          />
          <BatteryRow label="Кейс" value={device?.case ?? emptyBattery} />
        </>
      )}
    </View>
  );
}

function errorMessage(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'BLUETOOTH_OFF':
      return 'Включи Bluetooth.';
    case 'PERMISSION':
      return 'Разреши доступ к устройствам поблизости.';
    case 'LOCATION_OFF':
      return 'Включи местоположение для Bluetooth-поиска.';
    case 'CANCELLED':
      return 'Проверка остановлена.';
    default:
      return error instanceof Error
        ? error.message
        : 'Не удалось проверить заряд. Повтори попытку.';
  }
}

function Screen() {
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<AirPods[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef(false);
  const permissionPhase = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' && !permissionPhase.current) {
        generation.current += 1;
        scanner?.cancel();
        if (pending.current) {
          pending.current = false;
          setBusy(false);
          setMessage('Проверка остановлена.');
        }
      }
    });
    return () => {
      generation.current += 1;
      sub.remove();
      scanner?.cancel();
    };
  }, []);

  async function check() {
    if (pending.current) {
      return;
    }
    pending.current = true;
    const session = ++generation.current;
    setBusy(true);
    setDevices([]);
    setMessage(null);
    try {
      if (!scanner || Platform.OS !== 'android') {
        throw new Error('Нужна Android-сборка приложения.');
      }
      permissionPhase.current = true;
      let granted: boolean;
      try {
        granted = await requestPermissions();
      } finally {
        permissionPhase.current = false;
      }
      if (generation.current !== session) {
        return;
      }
      if (AppState.currentState !== 'active') {
        setMessage('Проверка остановлена.');
        return;
      }
      if (!granted) {
        throw new Error(
          Number(Platform.Version) >= 31
            ? 'Разреши доступ к устройствам поблизости.'
            : 'Разреши доступ к местоположению для Bluetooth-поиска.',
        );
      }
      const report = await scanner.scan();
      if (generation.current !== session) {
        return;
      }
      const found = report.advertisements
        .map(decodeAirPods)
        .filter((d): d is AirPods => d !== null);
      found.sort((a, b) => b.rssi - a.rssi);
      setDevices(found);
      if (!found.length) {
        setMessage(
          report.applePacketCount > 0
            ? 'Заряд недоступен. Открой кейс рядом с телефоном и повтори.'
            : 'AirPods не найдены. Открой кейс рядом с телефоном.',
        );
      }
    } catch (error) {
      if (generation.current === session) {
        setMessage(errorMessage(error));
      }
    } finally {
      if (generation.current === session) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#101419" />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={check}
          style={({ pressed }) => [
            styles.button,
            (busy || pressed) && styles.dim,
          ]}
        >
          {busy ? <ActivityIndicator color="#101419" /> : null}
          <Text style={styles.buttonText}>
            {busy ? 'Проверяем…' : 'Проверить заряд'}
          </Text>
        </Pressable>
        {devices.length ? (
          devices.map(device => <BatteryCard key={device.id} device={device} />)
        ) : (
          <BatteryCard />
        )}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#101419' },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 20,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  button: {
    backgroundColor: '#a5edbf',
    paddingVertical: 19,
    paddingHorizontal: 24,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#101419', fontSize: 17, fontWeight: '700' },
  dim: { opacity: 0.65 },
  card: {
    backgroundColor: '#192028',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 8,
    borderRadius: 24,
  },
  cardTitle: {
    color: '#f2f5f7',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 18,
  },
  row: {
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#2c3640',
  },
  label: { color: '#dce3e9', fontSize: 16, flexShrink: 1 },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  percent: {
    color: '#a5edbf',
    fontSize: 30,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  charging: { color: '#a5edbf', fontSize: 25, fontWeight: '700' },
  message: {
    color: '#b4bec8',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
