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
import {
  ScanReport,
  scanDiagnostics,
  scanFailureMessage,
} from './src/scanReport';

type Scanner = { scan(): Promise<ScanReport>; cancel(): void };
const scanner: Scanner | undefined = NativeModules.AirPodsScanner;

async function requestPermissions() {
  const permissions = scanPermissions(Number(Platform.Version));
  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    p => result[p] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

function BatteryRow({ label, value }: { label: string; value: Battery }) {
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail}>
          {value.percent === null
            ? 'Нет данных'
            : value.charging
            ? 'Заряжается'
            : 'Не заряжается'}
        </Text>
      </View>
      <Text style={styles.percent}>
        {value.percent === null ? '—' : `≈ ${value.percent}%`}
      </Text>
    </View>
  );
}

function Screen() {
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<AirPods[]>([]);
  const [updated, setUpdated] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [message, setMessage] = useState(
    'Положи наушники в кейс и открой крышку рядом с телефоном.',
  );
  const pending = useRef(false);
  const permissionPhase = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' && !permissionPhase.current) {
        generation.current += 1;
        scanner?.cancel();
        pending.current = false;
        setBusy(false);
        setMessage('Проверка остановлена. Нажми кнопку, чтобы начать заново.');
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
    setUpdated(null);
    setDiagnostics(null);
    setMessage('Подготовка Bluetooth…');
    try {
      if (!scanner || Platform.OS !== 'android') {
        throw new Error(
          'Нужна Android-сборка APK. В Expo Go проверка не работает.',
        );
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
        setMessage('Проверка остановлена. Нажми кнопку, чтобы начать заново.');
        return;
      }
      if (!granted) {
        throw new Error(
          'Разреши доступ к устройствам поблизости в настройках приложения. На Android 11 и старше также требуется местоположение.',
        );
      }
      setMessage('Ищем AirPods — около 8 секунд. Держи крышку кейса открытой.');
      const report = await scanner.scan();
      if (generation.current !== session) {
        return;
      }
      const found = report.advertisements
        .map(decodeAirPods)
        .filter((d): d is AirPods => d !== null);
      found.sort((a, b) => b.rssi - a.rssi);
      setDevices(found);
      if (found.length) {
        setUpdated(new Date().toLocaleTimeString('ru-RU'));
        setMessage('Проверка завершена. Сканирование выключено.');
      } else {
        setMessage(scanFailureMessage(report));
        setDiagnostics(scanDiagnostics(report));
      }
    } catch (error) {
      if (generation.current === session) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Не удалось проверить заряд. Попробуй ещё раз.',
        );
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
        <Text style={styles.eyebrow}>BLUETOOTH · ОФЛАЙН</Text>
        <Text style={styles.title}>Заряд AirPods</Text>
        <Text style={styles.subtitle}>
          Проверка по кнопке.{'\n'}Без работы в фоне.
        </Text>
        <View style={styles.info}>
          <Text style={styles.message} accessibilityLiveRegion="polite">
            {message}
          </Text>
        </View>
        {diagnostics ? (
          <Text selectable style={styles.note}>
            {diagnostics}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
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
        {devices.map((device, index) => (
          <View key={device.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {device.model}
              {devices.length > 1 ? ` · ${index + 1}` : ''}
            </Text>
            {devices.length > 1 ? (
              <Text style={styles.detail}>
                Найдены рядом · сигнал {device.rssi} dBm
              </Text>
            ) : null}
            {device.kind === 'headphones' ? (
              <BatteryRow label="Наушники" value={device.headset} />
            ) : (
              <>
                <BatteryRow label="Левый наушник" value={device.left} />
                <BatteryRow label="Правый наушник" value={device.right} />
                <BatteryRow label="Кейс" value={device.case} />
              </>
            )}
          </View>
        ))}
        {updated ? (
          <Text style={styles.note}>
            Обновлено в {updated}. Это последний замер, не постоянный
            мониторинг.
          </Text>
        ) : null}
        <Text style={styles.note}>
          Проценты приблизительные, с шагом 10%. Доступность заряда кейса
          зависит от передаваемого формата.
        </Text>
        <Text style={styles.note}>
          На Android 12 и новее нужны только «Устройства поблизости». На Android
          11 и старше требуется местоположение. Приложение не получает
          координаты.
        </Text>
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
  content: { padding: 24, paddingTop: 36, gap: 20 },
  eyebrow: { color: '#9cceb4', fontSize: 12, letterSpacing: 2 },
  title: { color: '#f2f5f7', fontSize: 34, fontWeight: '700' },
  subtitle: { color: '#a6b0bb', fontSize: 18, lineHeight: 27 },
  info: { backgroundColor: '#1c252e', borderRadius: 16, padding: 20 },
  message: { color: '#e1e7ec', fontSize: 16, lineHeight: 24 },
  button: {
    backgroundColor: '#a5edbf',
    padding: 19,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#101419', fontSize: 17, fontWeight: '700' },
  dim: { opacity: 0.65 },
  card: { backgroundColor: '#192028', padding: 20, borderRadius: 20, gap: 8 },
  cardTitle: {
    color: '#f2f5f7',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#2c3640',
  },
  label: { color: '#f2f5f7', fontSize: 16 },
  detail: { color: '#9ba9b6', fontSize: 13, marginTop: 5 },
  percent: { color: '#a5edbf', fontSize: 26, fontWeight: '600' },
  note: { color: '#9ba9b6', fontSize: 13, lineHeight: 20 },
});
