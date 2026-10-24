package com.airpodsbattery

import org.junit.Assert.*
import org.junit.Test

class ScanReadingsTest {
  private fun session() = ScanReadings(mapOf("3872" to "earbuds", "2592" to "headphones"))
  private fun frame(pods: Int = 0x87, flags: Int = 0x0f, model: Int = 0x0f20) =
    byteArrayOf(7, 25, 1, (model shr 8).toByte(), model.toByte(), 32, pods.toByte(), flags.toByte()) + ByteArray(19)
  private fun ad(payload: ByteArray) = byteArrayOf((payload.size + 3).toByte(), 0xff.toByte(), 0x4c, 0) + payload

  @Test fun deadlineResultIncludesEarbudsWhenTheCaseNeverReports() {
    val session = session()
    session.receive("pair", -35, ad(frame()))
    assertFalse(session.complete)
    val result = session.snapshot().single()
    assertEquals("pair", result.id)
    assertEquals(0x87, result.data[6].toInt() and 255)
    assertEquals(15, result.data[7].toInt() and 15)
    assertTrue(session.hasAppleData)
  }

  @Test fun laterCompleteReadingAllowsEarlyStop() {
    val session = session()
    session.receive("pair", -35, ad(frame()))
    assertFalse(session.complete)
    session.receive("pair", -30, ad(frame(flags = 6)))
    assertTrue(session.complete)
    assertEquals(6, session.snapshot().single().data[7].toInt())
  }

  @Test fun laterPartialPacketDoesNotEraseACompleteReadingInTheSameBatch() {
    val session = session()
    val full = frame(flags = 6)
    session.receive("pair", -35, ad(full))
    session.receive("pair", -34, ad(frame()))
    assertTrue(session.complete)
    assertArrayEquals(full, session.snapshot().single().data)
  }

  @Test fun latestPartialReadingIsStillReturnedWithoutInventingCaseCharge() {
    val session = session()
    session.receive("pair", -35, ad(frame(pods = 0x87)))
    session.receive("pair", -30, ad(frame(pods = 0x76)))
    assertFalse(session.complete)
    assertEquals(0x76, session.snapshot().single().data[6].toInt() and 255)
    assertEquals(-30, session.snapshot().single().rssi)
  }

  @Test fun differentPairsAreNeverCombinedIntoACompleteReading() {
    val session = session()
    session.receive("left-known", -35, ad(frame(pods = 0xf7)))
    session.receive("right-and-case-known", -40, ad(frame(pods = 0x8f, flags = 6)))
    assertFalse(session.complete)
    assertEquals(2, session.snapshot().size)
  }

  @Test fun maxNeedsNoCaseOrSecondEarbud() {
    val session = session()
    session.receive("max", -35, ad(frame(pods = 0xf8, model = 0x0a20)))
    assertTrue(session.complete)
    assertEquals(1, session.snapshot().size)
  }

  @Test fun encryptedAndUnknownModelsDoNotReplaceAReadingOrFinishTheScan() {
    val session = session()
    val partial = frame()
    session.receive("pair", -35, ad(partial))
    session.receive("pair", -30, ad(byteArrayOf(7, 17, 6) + ByteArray(16)))
    session.receive("pair", -30, ad(frame(flags = 6, model = 0xffff)))
    assertFalse(session.complete)
    assertArrayEquals(partial, session.snapshot().single().data)
  }

  @Test fun encryptedDataAloneIsRecognizedWithoutFakeBatteryReadings() {
    val session = session()
    session.receive("case", -35, ad(byteArrayOf(7, 17, 6) + ByteArray(16)))
    assertTrue(session.hasAppleData)
    assertFalse(session.complete)
    assertTrue(session.snapshot().isEmpty())
  }

  @Test fun emptyOrUnrelatedAdvertisementsAreHarmless() {
    val session = session()
    session.receive("empty", -35, byteArrayOf())
    session.receive("other", -35, byteArrayOf(3, 0xff.toByte(), 0x75, 0))
    assertFalse(session.hasAppleData)
    assertFalse(session.complete)
    assertTrue(session.snapshot().isEmpty())
  }

  @Test fun numberOfAdvertisersIsBoundedButExistingReadingsCanStillUpdate() {
    val session = session()
    repeat(65) { session.receive("pair-$it", -35, ad(frame())) }
    assertEquals(64, session.snapshot().size)
    session.receive("pair-0", -30, ad(frame(flags = 6)))
    assertTrue(session.complete)
    assertEquals(64, session.snapshot().size)
    assertEquals(6, session.snapshot().first().data[7].toInt())
  }

  @Test fun newScanCannotReuseAnOldCaseReading() {
    val old = session()
    old.receive("pair", -35, ad(frame(flags = 6)))
    val next = session()
    next.receive("pair", -35, ad(frame()))
    assertFalse(next.complete)
    assertEquals(15, next.snapshot().single().data[7].toInt() and 15)
  }

  @Test fun androidInputBufferIsNotRetained() {
    val session = session()
    val raw = ad(frame())
    session.receive("pair", -35, raw)
    raw.fill(0)
    assertEquals(0x87, session.snapshot().single().data[6].toInt() and 255)
  }
}
