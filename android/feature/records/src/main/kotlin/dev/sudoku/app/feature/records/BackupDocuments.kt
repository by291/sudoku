package dev.sudoku.app.feature.records

import dev.sudoku.app.model.BackupLimits
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/** Reads unknown-size document providers without ever buffering more than the portable limit. */
internal fun readBackupDocument(input: InputStream): String {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    var total = 0
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        if (count == 0) continue
        require(count <= BackupLimits.BYTES - total) { "备份超过 25 MiB 文件限制。" }
        output.write(buffer, 0, count)
        total += count
    }
    return Charsets.UTF_8.newDecoder().onMalformedInput(
        CodingErrorAction.REPORT
    ).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(output.toByteArray())).toString()
}
