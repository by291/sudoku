# UniFFI and JNA discover generated interfaces and structures through reflection.
-keepattributes Signature,InnerClasses,EnclosingMethod
-keep class dev.sudoku.app.ffi.** { *; }
-keep class com.sun.jna.** { *; }
-keepclasseswithmembers class * { native <methods>; }

# JNA's desktop-only AWT helpers reference these four absent Android classes.
# The Android integration uses neither windows nor AWT; see JNA's Android ProGuard guidance:
# https://github.com/java-native-access/jna/blob/master/www/FrequentlyAskedQuestions.md#jna-on-android
-dontwarn java.awt.Component
-dontwarn java.awt.GraphicsEnvironment
-dontwarn java.awt.HeadlessException
-dontwarn java.awt.Window
