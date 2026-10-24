package com.airpodsbattery

/** Parse every manufacturer AD section, including repeated Apple company IDs.
 * Android's company-ID map can overwrite an earlier battery section.
 * Wire-format reference: https://github.com/Ovalvoi/Andropods/blob/main/app/src/main/java/com/ovalvoi/andropods/ble/ProximityPayload.kt
 * This implementation is independent and has no Android dependencies.
 */
internal object AppleAdvertisements {
  fun payloads(raw: ByteArray): List<ByteArray> {
    val found = mutableListOf<ByteArray>()
    var offset = 0
    while (offset < raw.size) {
      val length = raw[offset].toInt() and 255
      if (length == 0) break
      val end = offset + 1 + length
      if (end > raw.size) break
      if (length >= 3 && (raw[offset + 1].toInt() and 255) == 255 &&
        (raw[offset + 2].toInt() and 255) == 0x4c && (raw[offset + 3].toInt() and 255) == 0) {
        found.add(raw.copyOfRange(offset + 4, end))
      }
      offset = end
    }
    return found
  }

  fun messages(payload: ByteArray): List<ByteArray> {
    val found = mutableListOf<ByteArray>()
    var offset = 0
    while (offset + 2 <= payload.size) {
      val length = payload[offset + 1].toInt() and 255
      val end = offset + 2 + length
      if (end > payload.size) {
        val tail = payload.copyOfRange(offset, payload.size)
        // Gen 1/2 can send a shorter AD section while keeping the 0x19 length.
        // Only accept their known plaintext layout; never the 19-byte encrypted case.
        if (tail.size in 20..26 && tail[0].toInt() == 7 && length == 25 &&
          tail[2].toInt() == 1 && tail[4].toInt() == 0x20 &&
          tail[3].toInt() in listOf(2, 15)) {
          found.add(tail)
        }
        break
      }
      found.add(payload.copyOfRange(offset, end))
      offset = end
    }
    return found
  }
}
