package es.pelletcontrol.app;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONTokener;

/**
 * Carga una ficha de producto en una vista web oculta (motor de navegador del teléfono)
 * y devuelve el HTML ya renderizado. Así las tiendas ven un navegador normal.
 */
@CapacitorPlugin(name = "PageFetcher")
public class PageFetcherPlugin extends Plugin {

    private static final long SETTLE_MS = 2500;
    private static final long TIMEOUT_MS = 30000;

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void fetch(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            call.reject("URL no válida");
            return;
        }
        getActivity().runOnUiThread(() -> {
            final Handler handler = new Handler(Looper.getMainLooper());
            final WebView wv = new WebView(getContext());
            final boolean[] done = {false};
            final int[] status = {200};

            WebSettings s = wv.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setBlockNetworkImage(true);
            s.setLoadsImagesAutomatically(false);
            s.setMediaPlaybackRequiresUserGesture(true);

            final Runnable[] finish = new Runnable[1];
            final Runnable cleanup = () -> {
                handler.removeCallbacksAndMessages(null);
                wv.stopLoading();
                wv.destroy();
            };

            finish[0] = () -> {
                if (done[0]) return;
                wv.evaluateJavascript("document.documentElement.outerHTML", value -> {
                    if (done[0]) return;
                    done[0] = true;
                    String html = "";
                    try {
                        Object v = new JSONTokener(value).nextValue();
                        if (v instanceof String) html = (String) v;
                    } catch (Exception ignored) {
                    }
                    JSObject ret = new JSObject();
                    ret.put("status", status[0]);
                    ret.put("html", html);
                    call.resolve(ret);
                    cleanup.run();
                });
            };

            wv.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String u, android.graphics.Bitmap favicon) {
                    handler.removeCallbacks(finish[0]);
                    status[0] = 200;
                }

                @Override
                public void onPageFinished(WebView view, String u) {
                    handler.removeCallbacks(finish[0]);
                    // Margen para retos antibot y contenido cargado por JavaScript.
                    handler.postDelayed(finish[0], SETTLE_MS);
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse resp) {
                    if (req.isForMainFrame()) status[0] = resp.getStatusCode();
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                    if (req.isForMainFrame() && !done[0]) {
                        done[0] = true;
                        call.reject("Sin conexión: " + err.getDescription());
                        cleanup.run();
                    }
                }
            });

            handler.postDelayed(() -> {
                if (!done[0]) {
                    // Si no terminó, devuelve lo que haya cargado.
                    finish[0].run();
                }
            }, TIMEOUT_MS);

            wv.loadUrl(url);
        });
    }
}
