package dev.yigeyinian.sudoku.feature.records

import dev.yigeyinian.sudoku.model.BackupLimits
import java.io.ByteArrayInputStream
import java.io.InputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class BackupDocumentsTest {
    @Test fun `unknown provider size cannot bypass backup byte bound`() {
        val input = object : InputStream() {
            var remaining = BackupLimits.BYTES + 1
            override fun read(): Int = if (remaining-- > 0) ' '.code else -1
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                if (remaining == 0) return -1
                val count = minOf(remaining, length)
                buffer.fill(' '.code.toByte(), offset, offset + count)
                remaining -= count
                return count
            }
        }

        assertFailsWith<IllegalArgumentException> { readBackupDocument(input) }
    }

    @Test fun `UTF8 decoding rejects truncated multibyte text without replacing portable facts`() {
        val input = ByteArrayInputStream(byteArrayOf(0x7b, 0xe4.toByte(), 0xb8.toByte()))

        assertFailsWith<java.nio.charset.CharacterCodingException> { readBackupDocument(input) }
    }

    @Test fun `unknown size Chinese document is preserved`() {
        val text = "{\"title\":\"一格一念\",\"seed\":\"\\ud800\"}"

        assertEquals(text, readBackupDocument(ByteArrayInputStream(text.toByteArray(Charsets.UTF_8))))
    }
}
