package es.pelletcontrol.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Descarga el APK publicado en GitHub y abre el instalador de Android.
 * Android solo lo instala encima si viene firmado igual que la app que ya está puesta.
 */
@CapacitorPlugin(name = "PelletUpdater")
public class UpdaterPlugin extends Plugin {

    /** Solo se descarga de las releases de este repositorio. */
    private static final String ALLOWED = "https://github.com/alebarzal/pellet-control/releases/download/";

    private boolean busy = false;

    private JSObject status(String s) {
        JSObject r = new JSObject();
        r.put("status", s);
        return r;
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url", "");
        String sha = call.getString("sha", "");
        if (url == null || !url.startsWith(ALLOWED) || sha == null || !sha.matches("[0-9a-f]{7,40}")) {
            call.reject("Dirección de descarga no válida");
            return;
        }
        // Android 8+: el usuario tiene que permitir a esta app instalar aplicaciones (una sola vez).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception ignored) {
            }
            call.resolve(status("permission"));
            return;
        }
        if (busy) {
            call.reject("Ya hay una descarga en marcha");
            return;
        }
        busy = true;
        new Thread(() -> {
            try {
                File apk = download(url, sha);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve(status("installing"));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "No se pudo descargar");
            } finally {
                busy = false;
            }
        }).start();
    }

    /** Descarga a la caché (un archivo por versión; si ya está bajado no se repite). */
    private File download(String url, String sha) throws Exception {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Sin espacio para la descarga");
        File apk = new File(dir, "PelletControl-" + sha + ".apk");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) if (!f.equals(apk)) f.delete();
        if (apk.exists() && apk.length() > 0) return apk;

        File part = new File(dir, "descarga.part");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("GitHub respondió " + code);
            long total = c.getContentLengthLong();
            long done = 0;
            int lastPct = -1;
            byte[] buf = new byte[64 * 1024];
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    int pct = total > 0 ? (int) (done * 100 / total) : -1;
                    if (pct != lastPct) {
                        lastPct = pct;
                        JSObject p = new JSObject();
                        p.put("percent", pct);
                        notifyListeners("progress", p);
                    }
                }
            }
            if (total > 0 && done != total) throw new Exception("La descarga se cortó");
        } catch (Exception e) {
            part.delete();
            throw e;
        } finally {
            c.disconnect();
        }
        if (!part.renameTo(apk)) throw new Exception("No se pudo guardar la descarga");
        return apk;
    }
}
