package es.pelletcontrol.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;

import java.util.concurrent.TimeUnit;

/** Configura la lectura de sensores en segundo plano y entrega a la app las lecturas acumuladas. */
@CapacitorPlugin(
        name = "BackgroundSensors",
        permissions = {@Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")}
)
public class BackgroundSensorsPlugin extends Plugin {

    private static final String WORK = "pc-sensors";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(SensorWorker.PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String token = call.getString("token", "");
        String secret = call.getString("secret", "");
        JSArray ids = call.getArray("deviceIds", new JSArray());
        JSArray indoor = call.getArray("indoorIds", new JSArray());
        Object thrRaw = call.getData().opt("threshold");
        Double threshold = thrRaw instanceof Number ? ((Number) thrRaw).doubleValue() : 0.5;
        boolean notify = Boolean.TRUE.equals(call.getBoolean("notify", false));
        String plugId = call.getString("plugId", "");
        Object plugRaw = call.getData().opt("plugThresholdW");
        Double plugThreshold = plugRaw instanceof Number ? ((Number) plugRaw).doubleValue() : 30.0;
        if (plugId == null) plugId = "";
        prefs().edit()
                .putString("plugId", plugId)
                .putLong("plugThresholdW", Double.doubleToLongBits(plugThreshold == null ? 30.0 : plugThreshold))
                .putString("token", token)
                .putString("secret", secret)
                .putString("deviceIds", ids.toString())
                .putString("indoorIds", indoor.toString())
                .putLong("threshold", Double.doubleToLongBits(threshold == null ? 0.5 : threshold))
                .putBoolean("notify", notify)
                .apply();

        WorkManager wm = WorkManager.getInstance(getContext());
        if (token == null || token.isEmpty() || secret == null || secret.isEmpty() || (ids.length() == 0 && plugId.isEmpty())) {
            wm.cancelUniqueWork(WORK);
        } else {
            Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(SensorWorker.class, 15, TimeUnit.MINUTES)
                    .setConstraints(c)
                    .build();
            wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req);
        }
        SensorWorker.ensureChannel(getContext());
        call.resolve();
    }

    /** Devuelve las lecturas tomadas en segundo plano y vacía el almacén temporal. */
    @PluginMethod
    public void drain(PluginCall call) {
        SharedPreferences p = prefs();
        String raw = p.getString("readings", "[]");
        String rawPlug = p.getString("plugReadings", "[]");
        p.edit().putString("readings", "[]").putString("plugReadings", "[]").apply();
        JSObject ret = new JSObject();
        try {
            ret.put("readings", new JSArray(new JSONArray(raw).toString()));
        } catch (Exception e) {
            ret.put("readings", new JSArray());
        }
        try {
            ret.put("plug", new JSArray(new JSONArray(rawPlug).toString()));
        } catch (Exception e) {
            ret.put("plug", new JSArray());
        }
        ret.put("heating", p.getBoolean("heating", false));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsCallback");
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(r);
    }

    /** Envía una notificación de prueba para comprobar que llegan. */
    @PluginMethod
    public void testNotification(PluginCall call) {
        SensorWorker.notifyStart(getContext(), "Prueba de aviso", "Así te avisará Pellet Control cuando la casa empiece a calentarse.");
        call.resolve();
    }
}
