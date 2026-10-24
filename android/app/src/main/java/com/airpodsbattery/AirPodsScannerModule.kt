package com.airpodsbattery

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
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
  private val records = linkedMapOf<String, WritableMap>()
  private val timeout = Runnable { finish() }

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
      records.clear()
      try {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = manager.adapter
        if (adapter == null || !adapter.isEnabled) {
          fail("BLUETOOTH_OFF", "Включи Bluetooth и повтори проверку.")
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
            val bytes = result.scanRecord?.getManufacturerSpecificData(0x004c) ?: return
            val rssi = result.rssi
            handler.post {
              if (callback !== this || pending == null) return@post
              val id = try { result.device.address } catch (_: SecurityException) {
                fail("PERMISSION", "Bluetooth-разрешение отозвано. Проверь разрешения приложения.")
                return@post
              }
              // Keep only this session's latest packet per advertising address.
              // No names, addresses or packet contents are written to disk/logs.
              if (records.size >= 64 && !records.containsKey(id)) return@post
              val payload = Arguments.createArray()
              bytes.forEach { payload.pushInt(it.toInt() and 255) }
              records[id] = Arguments.createMap().apply {
                putString("id", id)
                putInt("rssi", rssi)
                putArray("data", payload)
              }
            }
          }
        }
        callback = cb
        val filters = listOf(ScanFilter.Builder().setManufacturerData(0x004c, byteArrayOf(0x07, 0x19, 0x01)).build())
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        scanner!!.startScan(filters, settings, cb)
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
    val cb = callback
    callback = null
    try { if (cb != null) scanner?.stopScan(cb) } catch (_: Exception) { }
    scanner = null
  }

  private fun finish() {
    stopRadio()
    val promise = pending
    pending = null
    val result = Arguments.createArray()
    records.values.forEach { result.pushMap(it) }
    records.clear()
    promise?.resolve(result)
  }

  private fun fail(code: String, message: String) {
    stopRadio()
    val promise = pending
    pending = null
    records.clear()
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
