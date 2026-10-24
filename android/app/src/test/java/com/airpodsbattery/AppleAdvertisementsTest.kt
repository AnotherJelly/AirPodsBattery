package com.airpodsbattery

import org.junit.Assert.*
import org.junit.Test

class AppleAdvertisementsTest {
  private fun frame(): ByteArray = byteArrayOf(7, 25, 1, 15, 32, 32, 0x85.toByte(), 3, 8) + ByteArray(18)
  private fun ad(payload: ByteArray, company: Int = 0x4c): ByteArray =
    byteArrayOf((payload.size + 3).toByte(), 0xff.toByte(), company.toByte(), 0) + payload

  @Test fun preservesBothAppleManufacturerSectionsWhenBatteryIsFirst() {
    val battery = frame()
    val findMy = byteArrayOf(0x12, 2, 0, 0)
    val sections = AppleAdvertisements.payloads(ad(battery) + ad(findMy))
    assertEquals(2, sections.size)
    assertArrayEquals(battery, sections[0])
    assertArrayEquals(findMy, sections[1])
  }
  @Test fun preservesBothAppleSectionsWhenBatteryIsLast() {
    val battery = frame()
    val sections = AppleAdvertisements.payloads(ad(byteArrayOf(0x12, 0)) + ad(battery))
    assertArrayEquals(battery, sections[1])
  }
  @Test fun acceptsAnAdStructureEndingExactlyAtTheBufferBoundary() {
    val battery = frame()
    assertArrayEquals(battery, AppleAdvertisements.payloads(ad(battery)).single())
  }
  @Test fun ignoresOtherVendorsAndStopsAtPadding() {
    val raw = ad(frame(), 0x75) + ad(frame()) + byteArrayOf(0, 0, 0)
    assertEquals(1, AppleAdvertisements.payloads(raw).size)
  }
  @Test fun keepsEarlierSectionsWhenTheTailIsTruncated() {
    assertEquals(1, AppleAdvertisements.payloads(ad(frame()) + byteArrayOf(30, 0xff.toByte(), 0x4c)).size)
  }
  @Test fun rejectsAnIncompleteManufacturerHeader() {
    assertTrue(AppleAdvertisements.payloads(byteArrayOf(3, 0xff.toByte(), 0x4c)).isEmpty())
  }
  @Test fun handlesMultipleContinuityMessagesInOneManufacturerSection() {
    val messages = AppleAdvertisements.messages(byteArrayOf(0x10, 0) + frame())
    assertEquals(2, messages.size)
    assertArrayEquals(frame(), messages[1])
  }
  @Test fun acceptsKnownGen2PlaintextInAShortAdSection() {
    val short = frame().copyOf(24)
    assertArrayEquals(short, AppleAdvertisements.messages(short).single())
  }
  @Test fun rejectsTruncatedMessagesForUnknownLayouts() {
    val short = frame().copyOf(24)
    short[3] = 0x27
    assertTrue(AppleAdvertisements.messages(short).isEmpty())
  }
  @Test fun preservesEncryptedCaseAsASeparateMessageWithoutInventingPlaintext() {
    val encrypted = byteArrayOf(7, 17, 6, 0x50, 0xc3.toByte()) + ByteArray(14)
    assertArrayEquals(encrypted, AppleAdvertisements.messages(encrypted).single())
  }
}
