package com.airpodsbattery

/** Session-local readings, independent of Android, clocks and the React Native bridge. */
internal class ScanReadings(private val modelKinds: Map<String, String?>) {
  data class Reading(val id: String, val rssi: Int, val data: ByteArray, val complete: Boolean)

  private val records = linkedMapOf<String, Reading>()
  var hasAppleData = false
    private set
  val complete: Boolean
    get() = records.values.any { it.complete }

  fun receive(id: String, rssi: Int, raw: ByteArray) {
    val payloads = AppleAdvertisements.payloads(raw)
    if (payloads.isNotEmpty()) hasAppleData = true
    for (payload in payloads) {
      for (frame in AppleAdvertisements.messages(payload)) {
        if (frame[0].toInt() != 7 || frame[1].toInt() != 25 || frame[2].toInt() != 1) continue
        val model = ((frame[3].toInt() and 255) shl 8) or (frame[4].toInt() and 255)
        val kind = modelKinds[model.toString()] ?: continue
        if (records.size >= 64 && !records.containsKey(id)) continue
        val fullReading = AppleAdvertisements.hasCompleteBattery(frame, kind)
        // Preserve a complete reading if a later packet in the same batch is partial.
        if (fullReading || records[id]?.complete != true) {
          records[id] = Reading(id, rssi, frame, fullReading)
        }
      }
    }
  }

  // A deadline returns every available reading, including earbuds without case data.
  fun snapshot(): List<Reading> = records.values.toList()
}
