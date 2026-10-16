#!/usr/bin/env bash
set -euo pipefail

android_root="$(cd "$(dirname "$0")/.." && pwd)"
repository_root="$(cd "$android_root/.." && pwd)"
output_root="${1:?Expected the engine build output directory}"
native_tools="$android_root/.native-tools"
ndk_version="29.0.14206865"
cargo_ndk_version="4.1.2"

sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$sdk_root" && -f "$android_root/local.properties" ]]; then
    sdk_root="$(sed -n 's/^sdk.dir=//p' "$android_root/local.properties")"
fi
if [[ -z "$sdk_root" ]]; then
    printf '%s\n' 'Set ANDROID_HOME or sdk.dir in android/local.properties.' >&2
    exit 1
fi

export ANDROID_NDK_HOME="$sdk_root/ndk/$ndk_version"
if [[ ! -d "$ANDROID_NDK_HOME" ]]; then
    printf 'Install the pinned Android NDK %s with sdkmanager.\n' "$ndk_version" >&2
    exit 1
fi

# Tooling is private to this Android project; builds do not replace globally installed Cargo tools.
if [[ ! -x "$native_tools/bin/cargo-ndk" ]]; then
    cargo install cargo-ndk --version "$cargo_ndk_version" --locked --root "$native_tools"
fi
export PATH="$native_tools/bin:$PATH"
rustup target add aarch64-linux-android x86_64-linux-android

cd "$repository_root"
mkdir -p "$output_root/generated/uniffi" "$output_root/generated/jniLibs"
cargo build --locked -p sudoku-ffi
case "$(uname -s)" in
    Darwin) host_library="$repository_root/target/debug/libsudoku_ffi.dylib" ;;
    Linux) host_library="$repository_root/target/debug/libsudoku_ffi.so" ;;
    *) printf '%s\n' 'Use macOS or Linux to build the generated Android bindings.' >&2; exit 1 ;;
esac
cargo run --locked -p sudoku-ffi --features cli --bin uniffi-bindgen -- \
    generate --library "$host_library" --language kotlin \
    --config "$android_root/ffi/uniffi.toml" --no-format \
    --out-dir "$output_root/generated/uniffi"

# One locked source/version produces both ABI libraries and the Kotlin binding metadata.
cargo ndk --platform 26 --target arm64-v8a --target x86_64 \
    --output-dir "$output_root/generated/jniLibs" \
    build --locked --release -p sudoku-ffi
