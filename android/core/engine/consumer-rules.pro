# UniFFI 0.31.2 and JNA 5.18.1 discover generated interfaces and structures through reflection.
-keepattributes Signature,InnerClasses,EnclosingMethod
-keep class dev.yigeyinian.sudoku.ffi.** { *; }
-keep class com.sun.jna.** { *; }
-keepclasseswithmembers class * { native <methods>; }

# JNA's desktop-only AWT helpers reference these four absent Android classes.
# The Android integration uses neither windows nor AWT; see JNA's Android ProGuard guidance:
# https://github.com/java-native-access/jna/blob/master/www/FrequentlyAskedQuestions.md#jna-on-android
-dontwarn java.awt.Component
-dontwarn java.awt.GraphicsEnvironment
-dontwarn java.awt.HeadlessException
-dontwarn java.awt.Window
