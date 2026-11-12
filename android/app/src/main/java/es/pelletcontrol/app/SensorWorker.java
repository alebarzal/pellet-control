package es.pelletcontrol.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Tarea periódica (cada 15 min, el mínimo de Android) que lee los sensores SwitchBot con la app cerrada,
 * guarda las lecturas para que la app las recoja y avisa cuando la casa empieza a calentarse.
 */
public class SensorWorker extends Worker {

    static final String PREFS = "pc_background_sensors";
    static final String CHANNEL = "caldera";
    private static final int MAX_STORED = 3000;
    private static final long MAX_GAP_MS = 45 * 60_000L;

    public SensorWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences p = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = p.getString("token", "");
        String secret = p.getString("secret", "");
        if (token.isEmpty() || secret.isEmpty()) return Result.success();
        try {
            JSONArray ids = new JSONArray(p.getString("deviceIds", "[]"));
            JSONArray indoor = new JSONArray(p.getString("indoorIds", "[]"));
            JSONArray stored = new JSONArray(p.getString("readings", "[]"));
            String now = iso(new Date());
            double sum = 0;
            int n = 0;
            Double outdoorTemp = null;
            boolean upper = p.getBoolean("upperSign", false);
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.getString(i);
                JSONObject body = null;
                try {
                    body = status(id, token, secret, upper);
                } catch (AuthException e) {
                    // La documentación oficial se contradice sobre las mayúsculas de la firma: prueba la otra variante.
                    try {
                        body = status(id, token, secret, !upper);
                        upper = !upper;
                        p.edit().putBoolean("upperSign", upper).apply();
                    } catch (Exception ignored) {
                    }
                } catch (Exception ignored) {
                }
                if (body == null || !body.has("temperature")) continue;
                JSONObject r = new JSONObject();
                r.put("at", now);
                r.put("deviceId", id);
                r.put("temperature", body.getDouble("temperature"));
                r.put("humidity", body.has("humidity") ? body.getDouble("humidity") : JSONObject.NULL);
                r.put("battery", body.has("battery") ? body.getDouble("battery") : JSONObject.NULL);
                stored.put(r);
                if (contains(indoor, id)) {
                    sum += body.getDouble("temperature");
                    n++;
                } else {
                    outdoorTemp = body.getDouble("temperature");
                }
            }
            // Si la app lleva mucho sin abrirse, descarta lo más antiguo.
            while (stored.length() > MAX_STORED) stored.remove(0);
            SharedPreferences.Editor e = p.edit().putString("readings", stored.toString());

            // Enchufe con medidor: el quemador está funcionando si consume por encima del umbral.
            String plugId = p.getString("plugId", "");
            boolean usePlug = !plugId.isEmpty();
            if (usePlug) {
                Double watts = null;
                try {
                    watts = plugWatts(status(plugId, token, secret, upper));
                } catch (Exception ignored) {
                }
                if (watts != null) {
                    JSONArray plug = new JSONArray(p.getString("plugReadings", "[]"));
                    JSONObject r = new JSONObject();
                    r.put("at", now);
                    r.put("watts", Math.round(watts * 10) / 10.0);
                    plug.put(r);
                    while (plug.length() > MAX_STORED) plug.remove(0);
                    e.putString("plugReadings", plug.toString());
                    double thr = Double.longBitsToDouble(p.getLong("plugThresholdW", Double.doubleToLongBits(30.0)));
                    boolean wasOn = p.getBoolean("plugOn", false);
                    boolean on = watts >= thr;
                    if (on && !wasOn && p.getBoolean("notify", false)) {
                        notifyStart(getApplicationContext(), "La caldera ha arrancado",
                                String.format(new Locale("es", "ES"), "El enchufe de la caldera marca %.0f W. Medido por el enchufe SwitchBot.", watts));
                    }
                    e.putBoolean("plugOn", on).putBoolean("heating", on);
                }
            }

            if (n > 0 && !usePlug) {
                double avg = sum / n;
                long t = System.currentTimeMillis();
                long lastAt = p.getLong("lastAt", 0);
                double lastAvg = Double.longBitsToDouble(p.getLong("lastAvg", Double.doubleToLongBits(avg)));
                boolean heating = p.getBoolean("heating", false);
                double threshold = Double.longBitsToDouble(p.getLong("threshold", Double.doubleToLongBits(0.5)));
                if (lastAt > 0 && t - lastAt <= MAX_GAP_MS) {
                    double rate = (avg - lastAvg) / ((t - lastAt) / 3_600_000.0);
                    if (rate >= threshold && !heating) {
                        heating = true;
                        if (p.getBoolean("notify", false)) notifyStart(avg, avg - lastAvg);
                    } else if (rate <= 0 && heating) {
                        heating = false;
                    }
                }
                e.putLong("lastAt", t).putLong("lastAvg", Double.doubleToLongBits(avg)).putBoolean("heating", heating);
            }
            e.apply();
            if (n > 0 || outdoorTemp != null) PelletWidget.saveTemps(getApplicationContext(), n > 0 ? sum / n : null, outdoorTemp);
        } catch (Exception ignored) {
            return Result.retry();
        }
        return Result.success();
    }

    /** Igual que plugWatts() de la app: power o weight en W, o tensión × corriente (A o mA). */
    static Double plugWatts(JSONObject b) {
        if (b == null) return null;
        Object p = b.opt("power");
        if (p instanceof Number) return Math.max(0, ((Number) p).doubleValue());
        Object w = b.opt("weight");
        if (w instanceof Number) return Math.max(0, ((Number) w).doubleValue());
        Object v = b.opt("voltage");
        Object i = b.opt("electricCurrent");
        if (v instanceof Number && i instanceof Number) {
            double amps = ((Number) i).doubleValue();
            if (amps > 20) amps = amps / 1000.0;
            return Math.max(0, ((Number) v).doubleValue() * amps);
        }
        return null;
    }

    private static boolean contains(JSONArray a, String v) throws Exception {
        for (int i = 0; i < a.length(); i++) if (a.getString(i).equals(v)) return true;
        return false;
    }

    private static String iso(Date d) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(d);
    }

    static class AuthException extends Exception {
    }

    private static JSONObject status(String id, String token, String secret, boolean upper) throws Exception {
        long t = System.currentTimeMillis();
        String nonce = UUID.randomUUID().toString();
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sign = Base64.encodeToString(mac.doFinal((token + t + nonce).getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (upper) sign = sign.toUpperCase(Locale.ROOT);

        HttpURLConnection c = (HttpURLConnection) new URL("https://api.switch-bot.com/v1.1/devices/" + id + "/status").openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Authorization", token);
        c.setRequestProperty("sign", sign);
        c.setRequestProperty("nonce", nonce);
        c.setRequestProperty("t", String.valueOf(t));
        c.setRequestProperty("Content-Type", "application/json; charset=utf8");
        int code = c.getResponseCode();
        if (code == 401 || code == 403) throw new AuthException();
        if (code >= 400) throw new Exception("HTTP " + code);
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
        }
        JSONObject json = new JSONObject(sb.toString());
        if (json.optInt("statusCode") != 100) throw new Exception("SwitchBot " + json.optInt("statusCode"));
        return json.getJSONObject("body");
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Caldera", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Aviso cuando la casa empieza a calentarse");
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    /** Notificación «la caldera parece haber arrancado». También la usa la app para enviar una prueba. */
    static void notifyStart(Context ctx, String title, String text) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_pc_foreground)
                .setColor(0xFF2C3A29)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true);
        NotificationManagerCompat.from(ctx).notify(1001, b.build());
    }

    private void notifyStart(double temp, double rise) {
        String text = String.format(new Locale("es", "ES"),
                "La casa ha subido %.1f °C en el último cuarto de hora (ahora %.1f °C). Estimación por la temperatura interior.", rise, temp);
        notifyStart(getApplicationContext(), "La caldera parece haber arrancado", text);
    }
}
