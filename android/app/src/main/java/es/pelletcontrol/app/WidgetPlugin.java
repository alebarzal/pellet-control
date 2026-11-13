package es.pelletcontrol.app;

import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Puente con el widget: la app le pasa los datos y recibe los toques de sus botones. */
@CapacitorPlugin(name = "PelletWidget")
public class WidgetPlugin extends Plugin {

    private String pending;

    @Override
    public void load() {
        if (getActivity() != null) pending = actionOf(getActivity().getIntent());
    }

    private static String actionOf(Intent intent) {
        if (intent == null) return null;
        String a = intent.getStringExtra(PelletWidget.EXTRA_ACTION);
        intent.removeExtra(PelletWidget.EXTRA_ACTION);
        return a;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String a = actionOf(intent);
        if (a == null) return;
        JSObject o = new JSObject();
        o.put("action", a);
        notifyListeners("action", o);
    }

    @PluginMethod
    public void update(PluginCall call) {
        Integer pct = call.getInt("hopperPct");
        // getDouble() de Capacitor no admite números largos (milisegundos): se leen directamente del JSON.
        Double runOut = num(call, "runOutAt");
        Double tIn = num(call, "tIn");
        Double tOut = num(call, "tOut");
        Double tInAt = num(call, "tInAt");
        Double tOutAt = num(call, "tOutAt");
        // Solo se guarda si es más reciente que lo que ya leyó la tarea en segundo plano.
        android.content.SharedPreferences tp = getContext().getSharedPreferences(PelletWidget.PREFS, Context.MODE_PRIVATE);
        android.content.SharedPreferences.Editor te = tp.edit();
        if (tIn != null && tInAt != null && tInAt.longValue() >= tp.getLong("tInAt", 0))
            te.putFloat("tIn", tIn.floatValue()).putLong("tInAt", tInAt.longValue());
        if (tOut != null && tOutAt != null && tOutAt.longValue() >= tp.getLong("tOutAt", 0))
            te.putFloat("tOut", tOut.floatValue()).putLong("tOutAt", tOutAt.longValue());
        // Enchufe de la caldera: igual, solo si la lectura es más nueva. Sin enchufe elegido se borra.
        Double plugW = num(call, "plugW");
        Double plugAt = num(call, "plugAt");
        if (!Boolean.TRUE.equals(call.getBoolean("plug", false))) te.remove("plugW").remove("plugOn").remove("plugAt");
        else if (plugW != null && plugAt != null && plugAt.longValue() >= tp.getLong("plugAt", 0))
            te.putFloat("plugW", plugW.floatValue()).putBoolean("plugOn", Boolean.TRUE.equals(call.getBoolean("plugOn", false))).putLong("plugAt", plugAt.longValue());
        te.apply();
        getContext().getSharedPreferences(PelletWidget.PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("has", true)
                .putString("bags", call.getString("bags", "—"))
                .putString("bagsSub", call.getString("bagsSub", "sacos"))
                .putInt("hopperPct", pct == null ? -1 : pct)
                .putBoolean("hopperApprox", Boolean.TRUE.equals(call.getBoolean("hopperApprox", true)))
                .putString("hopperSub", call.getString("hopperSub", "tolva"))
                .putLong("runOutAt", runOut == null ? 0 : runOut.longValue())
                .apply();
        PelletWidget.updateAll(getContext());
        call.resolve();
    }

    private static Double num(PluginCall call, String key) {
        Object v = call.getData().opt(key);
        return v instanceof Number ? ((Number) v).doubleValue() : null;
    }

    /** Acción con la que se abrió la app desde el widget (se entrega una sola vez). */
    @PluginMethod
    public void takeAction(PluginCall call) {
        JSObject o = new JSObject();
        o.put("action", pending);
        pending = null;
        call.resolve(o);
    }
}
