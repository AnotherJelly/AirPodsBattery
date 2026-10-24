# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# React Native 0.81 loads react_devsupportjni during release startup to read
# InspectorFlags. JNI registers these classes by name, even with dev support
# disabled; R8 cannot see those references in the native library.
-keep class com.facebook.react.devsupport.CxxInspectorPackagerConnection { *; }
-keep class com.facebook.react.devsupport.CxxInspectorPackagerConnection$* { *; }
