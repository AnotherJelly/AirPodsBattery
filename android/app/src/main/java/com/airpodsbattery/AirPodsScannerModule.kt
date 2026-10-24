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

/** One foreground scan; a native timer bounds radio use independently of JS. */
@SuppressLint("MissingPermission")
class AirPodsScannerModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private var scanner: BluetoothLeScanner? = null
  private var callback: ScanCallback? = null
  private var pending: Promise? = null
  private var readings: ScanReadings? = null
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
  fun scan(knownModels: ReadableMap, promise: Promise) {
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
      try {
        readings = ScanReadings(knownModels.toHashMap().mapValues { it.value as? String })
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = manager.adapter
        if (adapter == null || !adapter.isEnabled) {
          fail("BLUETOOTH_OFF", "Включи Bluetooth и повтори проверку.")
          return@post
        }
        if (Build.VERSION.SDK_INT in 28..30) {
          val location = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
          if (!location.isLocationEnabled) {
            fail("LOCATION_OFF", "Включи системную геолокацию: Android может скрывать BLE-маячки, когда она выключена. Координаты приложение не получает.")
            return@post
          }
        }
        scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
          fail("NO_SCANNER", "Bluetooth-поиск недоступен. Попробуй включить Bluetooth заново.")
          return@post
        }
        val cb = object : ScanCallback() {
          override fun onScanResult(type: Int, result: ScanResult) { receive(listOf(result)) }
          override fun onBatchScanResults(results: MutableList<ScanResult>) { receive(results) }
          override fun onScanFailed(code: Int) {
            handler.post { if (callback === this) fail("SCAN_FAILED", "Ошибка Bluetooth ($code). Подожди несколько секунд и повтори.") }
          }
          private fun receive(results: List<ScanResult>) {
            handler.post {
              if (callback !== this || pending == null) return@post
              val session = readings ?: return@post
              for (result in results) {
                val raw = result.scanRecord?.bytes ?: continue
                val id = try { result.device.address } catch (_: SecurityException) {
                  fail("PERMISSION", "Bluetooth-разрешение отозвано. Проверь разрешения приложения.")
                  return@post
                }
                session.receive(id, result.rssi, raw)
              }
              // Process the whole delivered batch before stopping, keeping nearby results together.
              if (session.complete) finish()
            }
          }
        }
        callback = cb
        val supportsBatching = adapter.isOffloadedScanBatchingSupported
        val settings = ScanSettings.Builder()
          .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
          .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
          .setReportDelay(if (supportsBatching) 5000L else 0L)
        // Keep controller filters disabled for devices that otherwise hide AirPods.
        scanner!!.startScan(null, settings.build(), cb)
        // Some controllers deliver AirPods only through batched results.
        // Flush before the deadline, leaving time for the final callback.
        if (supportsBatching) handler.postDelayed(flush, 7000)
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

  private fun finish() {
    stopRadio()
    val promise = pending
    pending = null
    val session = readings
    readings = null
    val advertisements = Arguments.createArray()
    // Convert each final reading once, instead of allocating bridge objects for every packet.
    session?.snapshot()?.forEach { reading ->
      val payload = Arguments.createArray()
      reading.data.forEach { payload.pushInt(it.toInt() and 255) }
      advertisements.pushMap(Arguments.createMap().apply {
        putString("id", reading.id)
        putInt("rssi", reading.rssi)
        putArray("data", payload)
      })
    }
    val result = Arguments.createMap().apply {
      putArray("advertisements", advertisements)
      putBoolean("hasAppleData", session?.hasAppleData ?: false)
    }
    promise?.resolve(result)
  }

  private fun fail(code: String, message: String) {
    stopRadio()
    val promise = pending
    pending = null
    readings = null
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
