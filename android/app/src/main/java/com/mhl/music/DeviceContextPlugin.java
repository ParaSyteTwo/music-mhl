package com.mhl.music;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "DeviceContext")
public class DeviceContextPlugin extends Plugin {
    @PluginMethod
    public void getContext(PluginCall call) {
        Context context = getContext();
        ConnectivityManager connectivity =
            (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        Network active = connectivity.getActiveNetwork();
        NetworkCapabilities capabilities = active == null ? null : connectivity.getNetworkCapabilities(active);
        boolean online = capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        boolean metered = online && connectivity.isActiveNetworkMetered();

        Intent battery = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int level = battery == null ? -1 : battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery == null ? -1 : battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int batteryPercent = level >= 0 && scale > 0 ? Math.round(level * 100f / scale) : -1;
        int status = battery == null ? -1 : battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
            || status == BatteryManager.BATTERY_STATUS_FULL;
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);

        ActivityManager activity = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
        activity.getMemoryInfo(memory);

        JSObject result = new JSObject();
        result.put("online", online);
        result.put("metered", metered);
        result.put("networkType", capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
            ? "wifi" : capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
            ? "cellular" : online ? "other" : "offline");
        result.put("batteryPercent", batteryPercent);
        result.put("charging", charging);
        result.put("batterySaver", power != null && power.isPowerSaveMode());
        result.put("availableMemoryMb", Math.round(memory.availMem / 1048576d));
        result.put("totalMemoryMb", Math.round(memory.totalMem / 1048576d));
        result.put("processors", Runtime.getRuntime().availableProcessors());
        result.put("locale", Locale.getDefault().toLanguageTag());
        call.resolve(result);
    }
}
