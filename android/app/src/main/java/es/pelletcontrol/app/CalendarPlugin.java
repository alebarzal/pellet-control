package es.pelletcontrol.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * Crea y mantiene en el calendario del móvil los eventos previstos (comprar pellet, recargar la tolva).
 * Cada evento se identifica por una clave; si cambia la fecha se mueve el mismo evento en lugar de crear otro.
 */
@CapacitorPlugin(
        name = "PelletCalendar",
        permissions = {@Permission(strings = {Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR}, alias = "calendar")}
)
public class CalendarPlugin extends Plugin {

    private static final String PREFS = "pc-calendar";
    /** Aviso del evento: 15 h antes de la medianoche UTC del día (≈ la mañana del día anterior en España). */
    private static final int REMINDER_MINUTES = 15 * 60;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean granted() {
        return getPermissionState("calendar") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (granted()) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("calendar", call, "accessCallback");
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    /** Calendarios en los que se puede escribir. */
    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (!granted()) {
            call.reject("Sin permiso de calendario");
            return;
        }
        JSArray list = new JSArray();
        String[] proj = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.IS_PRIMARY,
        };
        String sel = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + ">=" + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR
                + " AND " + CalendarContract.Calendars.VISIBLE + "=1";
        try (Cursor c = getContext().getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, proj, sel, null, null)) {
            while (c != null && c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", String.valueOf(c.getLong(0)));
                o.put("name", c.getString(1));
                o.put("account", c.getString(2));
                o.put("primary", c.getInt(3) == 1);
                list.put(o);
            }
        } catch (Exception e) {
            call.reject("No se pudieron leer los calendarios");
            return;
        }
        JSObject r = new JSObject();
        r.put("calendars", list);
        call.resolve(r);
    }

    private static long utcMidnight(String iso) throws Exception {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.parse(iso).getTime();
    }

    private boolean exists(ContentResolver cr, long id) {
        Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id);
        try (Cursor c = cr.query(uri, new String[]{CalendarContract.Events._ID, CalendarContract.Events.DELETED}, null, null, null)) {
            return c != null && c.moveToFirst() && c.getInt(1) == 0;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Deja en el calendario exactamente los eventos indicados: crea, mueve o borra según haga falta.
     * events: [{key, title, description, date: yyyy-mm-dd}]
     */
    @PluginMethod
    public void sync(PluginCall call) {
        if (!granted()) {
            call.reject("Sin permiso de calendario");
            return;
        }
        String calendarId = call.getString("calendarId", "");
        JSArray events = call.getArray("events", new JSArray());
        ContentResolver cr = getContext().getContentResolver();
        SharedPreferences p = prefs();
        SharedPreferences.Editor ed = p.edit();
        Set<String> keep = new HashSet<>();
        int changed = 0;
        try {
            JSONObject stored = new JSONObject(p.getString("events", "{}"));
            // Si se cambia de calendario, los eventos anteriores se borran y se crean en el nuevo.
            if (!calendarId.equals(p.getString("calendarId", calendarId))) {
                Iterator<String> it = stored.keys();
                while (it.hasNext()) deleteEvent(cr, stored.getJSONObject(it.next()).optLong("id"));
                stored = new JSONObject();
            }
            for (int i = 0; i < events.length(); i++) {
                JSONObject e = events.getJSONObject(i);
                String key = e.getString("key");
                keep.add(key);
                String sig = e.getString("date") + "|" + e.getString("title") + "|" + e.optString("description");
                JSONObject prev = stored.optJSONObject(key);
                long prevId = prev == null ? -1 : prev.optLong("id", -1);
                if (prev != null && sig.equals(prev.optString("sig")) && exists(cr, prevId)) continue;

                long start = utcMidnight(e.getString("date"));
                ContentValues v = new ContentValues();
                v.put(CalendarContract.Events.DTSTART, start);
                v.put(CalendarContract.Events.DTEND, start + 86_400_000L);
                v.put(CalendarContract.Events.ALL_DAY, 1);
                v.put(CalendarContract.Events.EVENT_TIMEZONE, "UTC");
                v.put(CalendarContract.Events.TITLE, e.getString("title"));
                v.put(CalendarContract.Events.DESCRIPTION, e.optString("description"));
                v.put(CalendarContract.Events.HAS_ALARM, 1);
                long id;
                if (prevId > 0 && exists(cr, prevId)) {
                    cr.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, prevId), v, null, null);
                    id = prevId;
                } else {
                    v.put(CalendarContract.Events.CALENDAR_ID, Long.parseLong(calendarId));
                    Uri uri = cr.insert(CalendarContract.Events.CONTENT_URI, v);
                    if (uri == null) continue;
                    id = ContentUris.parseId(uri);
                    ContentValues rem = new ContentValues();
                    rem.put(CalendarContract.Reminders.EVENT_ID, id);
                    rem.put(CalendarContract.Reminders.MINUTES, REMINDER_MINUTES);
                    rem.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                    cr.insert(CalendarContract.Reminders.CONTENT_URI, rem);
                }
                JSONObject s = new JSONObject();
                s.put("id", id);
                s.put("sig", sig);
                stored.put(key, s);
                changed++;
            }
            // Eventos que ya no tocan (por ejemplo, faltan datos de consumo): se borran.
            Iterator<String> it = stored.keys();
            Set<String> remove = new HashSet<>();
            while (it.hasNext()) {
                String k = it.next();
                if (!keep.contains(k)) remove.add(k);
            }
            for (String k : remove) {
                deleteEvent(cr, stored.getJSONObject(k).optLong("id"));
                stored.remove(k);
                changed++;
            }
            ed.putString("events", stored.toString()).putString("calendarId", calendarId).apply();
        } catch (Exception ex) {
            call.reject("No se pudo actualizar el calendario");
            return;
        }
        JSObject r = new JSObject();
        r.put("changed", changed);
        call.resolve(r);
    }

    /** Borra todos los eventos creados por la app. */
    @PluginMethod
    public void clear(PluginCall call) {
        ContentResolver cr = getContext().getContentResolver();
        try {
            JSONObject stored = new JSONObject(prefs().getString("events", "{}"));
            if (granted()) {
                Iterator<String> it = stored.keys();
                while (it.hasNext()) deleteEvent(cr, stored.getJSONObject(it.next()).optLong("id"));
            }
        } catch (Exception ignored) {
        }
        prefs().edit().remove("events").remove("calendarId").apply();
        call.resolve();
    }

    private static void deleteEvent(ContentResolver cr, long id) {
        if (id <= 0) return;
        try {
            cr.delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), null, null);
        } catch (Exception ignored) {
        }
    }
}
