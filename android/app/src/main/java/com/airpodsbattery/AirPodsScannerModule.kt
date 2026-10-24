package com.airpodsbattery

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.*
import com.facebook.react.common.LifecycleState
import java.util.Locale

/** One foreground scan; a native timer bounds radio use independently of JS. */
@SuppressLint("MissingPermission")
class AirPodsScannerModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private var scanner: BluetoothLeScanner? = null
  private var callback: ScanCallback? = null
  private var pending: Promise? = null
  private val records = linkedMapOf<String, WritableMap>()
  private val formats = linkedSetOf<String>()
  private var packetCount = 0
  private var applePacketCount = 0
  private var encryptedCasePacketCount = 0
  private val timeout = Runnable { finish() }
  private val flush = Runnable {
    val cb = callback
    if (cb != null) {
      try { scanner?.flushPendingScanResults(cb) } catch (_: SecurityException) {
        fail("PERMISSION", "Bluetooth-разрешение отозвано. Проверь разрешения приложения.")
      } catch (_: Exception) { }
    }
  }

  init { context.addLifecycleEventListener(this) }
  override fun getName() = "AirPodsScanner"

  @ReactMethod
  fun scan(promise: Promise) {
    handler.post {
      if (pending != null) {
        promise.reject("BUSY", "Проверка уже выполняется.")
        return@post
      }
      if (context.lifecycleState != LifecycleState.RESUMED) {
        promise.reject("INACTIVE", "Открой приложение, чтобы проверить заряд.")
        return@post
      }
      pending = promise
      clearResults()
      try {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = manager.adapter
        if (adapter == null || !adapter.isEnabled) {
          fail("BLUETOOTH_OFF", "Включи Bluetooth и повтори проверку.")
          return@post
        }
        val location = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        if (Build.VERSION.SDK_INT in 28..30 && !location.isLocationEnabled) {
          fail("LOCATION_OFF", "Включи системную геолокацию: Android может скрывать BLE-маячки, когда она выключена. Координаты приложение не получает.")
          return@post
        }
        scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
          fail("NO_SCANNER", "Bluetooth-поиск недоступен. Попробуй включить Bluetooth заново.")
          return@post
        }
        val cb = object : ScanCallback() {
          override fun onScanResult(type: Int, result: ScanResult) { receive(result) }
          override fun onBatchScanResults(results: MutableList<ScanResult>) { results.forEach { receive(it) } }
          override fun onScanFailed(code: Int) {
            handler.post { if (callback === this) fail("SCAN_FAILED", "Ошибка Bluetooth ($code). Подожди несколько секунд и повтори.") }
          }
          private fun receive(result: ScanResult) {
            handler.post {
              if (callback !== this || pending == null) return@post
              packetCount++
              val payloads = result.scanRecord?.bytes?.let { AppleAdvertisements.payloads(it) } ?: emptyList()
              if (payloads.isEmpty()) return@post
              applePacketCount++
              for (frame in payloads.flatMap { AppleAdvertisements.messages(it) }) {
                val type = frame[0].toInt() and 255
                val length = frame[1].toInt() and 255
                val signature = if (type == 7 && length == 25 && frame[2].toInt() == 1) {
                  String.format(Locale.ROOT, "type=07 bytes=%d prefix=%02X model=%02X%02X", frame.size, frame[2].toInt() and 255, frame[3].toInt() and 255, frame[4].toInt() and 255)
                } else if (type == 7 && length == 17 && frame[2].toInt() == 6) {
                  encryptedCasePacketCount++
                  "type=07 bytes=19 prefix=06 encrypted-case"
                } else {
                  String.format(Locale.ROOT, "type=%02X bytes=%d", type, frame.size)
                }
                if (formats.size < 16) formats.add(signature)
                // Store plaintext status frames, including validated legacy short frames. Other messages must not
                // replace a valid charge reading from the same advertising address.
                if (type != 7 || length != 25 || frame[2].toInt() != 1) continue
                val id = try { result.device.address } catch (_: SecurityException) {
                  fail("PERMISSION", "Bluetooth-разрешение отозвано. Проверь разрешения приложения.")
                  return@post
                }
                // All data is session-local. No names, addresses or payloads are logged or persisted.
                if (records.size >= 64 && !records.containsKey(id)) continue
                val payload = Arguments.createArray()
                frame.forEach { payload.pushInt(it.toInt() and 255) }
                records[id] = Arguments.createMap().apply {
                  putString("id", id)
                  putInt("rssi", result.rssi)
                  putArray("data", payload)
                }
              }
            }
          }
        }
        callback = cb
        val settings = ScanSettings.Builder()
          .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
          .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
          .setReportDelay(if (adapter.isOffloadedScanBatchingSupported) 5000L else 0L)
        // Scan without controller/offload filters. Decode Apple data in the app,
        // and count all results to distinguish radio silence from an unsupported format.
        scanner!!.startScan(null, settings.build(), cb)
        // Some controllers deliver AirPods only through batched results.
        // Flush before the deadline, leaving time for the final callback.
        if (adapter.isOffloadedScanBatchingSupported) handler.postDelayed(flush, 7000)
        handler.postDelayed(timeout, 8000)
      } catch (_: SecurityException) {
        fail("PERMISSION", "Нет разрешения на Bluetooth-поиск. Проверь разрешения приложения.")
      } catch (_: Exception) {
        fail("SCAN_ERROR", "Не удалось запустить Bluetooth-поиск. Повтори проверку.")
      }
    }
  }

  private fun stopRadio() {
    handler.removeCallbacks(timeout)
    handler.removeCallbacks(flush)
    val cb = callback
    callback = null
    try { if (cb != null) scanner?.stopScan(cb) } catch (_: Exception) { }
    scanner = null
  }

  private fun clearResults() {
    records.clear()
    formats.clear()
    packetCount = 0
    applePacketCount = 0
    encryptedCasePacketCount = 0
  }

  private fun finish() {
    stopRadio()
    val promise = pending
    pending = null
    val advertisements = Arguments.createArray()
    records.values.forEach { advertisements.pushMap(it) }
    val signatures = Arguments.createArray()
    formats.forEach { signatures.pushString(it) }
    val result = Arguments.createMap().apply {
      putArray("advertisements", advertisements)
      putInt("packetCount", packetCount)
      putInt("applePacketCount", applePacketCount)
      putInt("encryptedCasePacketCount", encryptedCasePacketCount)
      putArray("formats", signatures)
    }
    clearResults()
    promise?.resolve(result)
  }

  private fun fail(code: String, message: String) {
    stopRadio()
    val promise = pending
    pending = null
    clearResults()
    promise?.reject(code, message)
  }

  @ReactMethod
  fun cancel() { handler.post { fail("CANCELLED", "Проверка остановлена.") } }
  override fun onHostPause() { fail("CANCELLED", "Проверка остановлена при уходе с экрана.") }
  override fun onHostDestroy() { fail("CANCELLED", "Приложение закрыто.") }
  override fun onHostResume() { }
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    handler.post { fail("CANCELLED", "Проверка остановлена.") }
    super.invalidate()
  }
}
