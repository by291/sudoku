#!/usr/bin/env python3
"""Verify every packaged native library and APK alignment with the Android SDK tools."""

import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--sdk", type=Path, default=os.environ.get("ANDROID_HOME"))
    arguments = parser.parse_args()
    if arguments.sdk is None:
        parser.error("Set ANDROID_HOME or provide --sdk")

    ndk = arguments.sdk / "ndk" / "29.0.14206865" / "toolchains" / "llvm" / "prebuilt"
    hosts = list(ndk.glob("*/bin/llvm-readelf"))
    if len(hosts) != 1:
        raise RuntimeError("Expected one llvm-readelf in the pinned Android NDK")
    zipaligns = sorted((arguments.sdk / "build-tools").glob("*/zipalign"))
    if not zipaligns:
        raise RuntimeError("Install Android SDK build tools containing zipalign")

    with zipfile.ZipFile(arguments.apk) as archive, tempfile.TemporaryDirectory(prefix="sudoku-elf-") as temporary:
        libraries = [entry for entry in archive.namelist() if entry.startswith("lib/") and entry.endswith(".so")]
        if not libraries:
            raise RuntimeError("APK contains no native libraries")
        abis = {entry.split("/")[1] for entry in libraries}
        if abis != {"arm64-v8a", "x86_64"}:
            raise RuntimeError(f"Unexpected packaged ABI set: {sorted(abis)}")
        for entry in libraries:
            local = Path(temporary) / entry
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(archive.read(entry))
            headers = subprocess.check_output([str(hosts[0]), "-lW", str(local)], text=True)
            alignments = [int(line.split()[-1], 16) for line in headers.splitlines() if re.match(r"\s*LOAD\s", line)]
            if not alignments or min(alignments) < 16384:
                raise RuntimeError(f"{entry}: incompatible ELF LOAD alignment {alignments}")
            print(f"16 KB ELF: {entry}")

    subprocess.run([str(zipaligns[-1]), "-c", "-P", "16", "4", str(arguments.apk)], check=True)
    print(f"16 KB APK alignment verified; SHA256 {hashlib.sha256(arguments.apk.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
