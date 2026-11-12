package es.pelletcontrol.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

/** Widget de la pantalla de inicio: sacos, tolva y autonomía, con botones de compra y recarga. */
public class PelletWidget extends AppWidgetProvider {

    static final String PREFS = "pc-widget";
    static final String ACTION_PREFIX = "es.pelletcontrol.app.WIDGET_";
    static final String EXTRA_ACTION = "pc_widget_action";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    /** Redibuja todos los widgets colocados. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PelletWidget.class));
        if (ids.length == 0) return;
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private static PendingIntent open(Context context, String action, int code) {
        Intent i = new Intent(context, MainActivity.class);
        i.setAction(ACTION_PREFIX + (action == null ? "OPEN" : action.toUpperCase()));
        if (action != null) i.putExtra(EXTRA_ACTION, action);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static final long TEMP_MAX_AGE_MS = 3 * 3_600_000L;

    private static String fmtTemp(float t) {
        return String.format(new java.util.Locale("es", "ES"), "%.1f°", t);
    }

    /** «Casa 21,4° · Fuera 9,8°» con las lecturas de menos de 3 h. */
    static String temps(SharedPreferences p) {
        long now = System.currentTimeMillis();
        StringBuilder sb = new StringBuilder();
        if (p.contains("tIn") && now - p.getLong("tInAt", 0) < TEMP_MAX_AGE_MS) sb.append("Casa ").append(fmtTemp(p.getFloat("tIn", 0)));
        if (p.contains("tOut") && now - p.getLong("tOutAt", 0) < TEMP_MAX_AGE_MS) {
            if (sb.length() > 0) sb.append("  ·  ");
            sb.append("Fuera ").append(fmtTemp(p.getFloat("tOut", 0)));
        }
        return sb.toString();
    }

    /** La tarea en segundo plano guarda aquí las temperaturas recién leídas y repinta el widget. */
    static void saveTemps(Context context, Double in, Double out) {
        SharedPreferences.Editor e = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        long now = System.currentTimeMillis();
        if (in != null) e.putFloat("tIn", in.floatValue()).putLong("tInAt", now);
        if (out != null) e.putFloat("tOut", out.floatValue()).putLong("tOutAt", now);
        e.apply();
        updateAll(context);
    }

    static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_pellet);

        if (p.getBoolean("has", false)) {
            v.setTextViewText(R.id.w_bags, p.getString("bags", "—"));
            v.setTextViewText(R.id.w_bags_sub, p.getString("bagsSub", "sacos"));

            int pct = p.getInt("hopperPct", -1);
            if (pct >= 0) {
                v.setTextViewText(R.id.w_hopper, (p.getBoolean("hopperApprox", true) ? "~" : "") + pct + " %");
                v.setViewVisibility(R.id.w_hopper_bar, View.VISIBLE);
                v.setProgressBar(R.id.w_hopper_bar, 100, Math.max(0, Math.min(100, pct)), false);
            } else {
                v.setTextViewText(R.id.w_hopper, "—");
                v.setViewVisibility(R.id.w_hopper_bar, View.GONE);
            }
            v.setTextViewText(R.id.w_hopper_sub, p.getString("hopperSub", "tolva"));

            long runOut = p.getLong("runOutAt", 0);
            if (runOut > 0) {
                double days = Math.max(0, (runOut - System.currentTimeMillis()) / 86_400_000.0);
                int d = (int) Math.floor(days);
                v.setTextViewText(R.id.w_days, days < 1 ? "< 1 día" : d + (d == 1 ? " día" : " días"));
                v.setTextViewText(R.id.w_days_sub, "autonomía");
            } else {
                v.setTextViewText(R.id.w_days, "—");
                v.setTextViewText(R.id.w_days_sub, "sin consumo aún");
            }
        } else {
            v.setTextViewText(R.id.w_bags, "—");
            v.setTextViewText(R.id.w_bags_sub, "abre la app");
            v.setTextViewText(R.id.w_hopper, "—");
            v.setViewVisibility(R.id.w_hopper_bar, View.GONE);
            v.setTextViewText(R.id.w_days, "—");
        }

        String temps = temps(p);
        if (temps.isEmpty()) {
            v.setViewVisibility(R.id.w_temps, View.GONE);
        } else {
            v.setViewVisibility(R.id.w_temps, View.VISIBLE);
            v.setTextViewText(R.id.w_temps, temps);
        }

        v.setOnClickPendingIntent(R.id.w_root, open(context, null, 0));
        v.setOnClickPendingIntent(R.id.w_btn_purchase, open(context, "purchase", 1));
        v.setOnClickPendingIntent(R.id.w_btn_refill, open(context, "refill", 2));
        return v;
    }
}
