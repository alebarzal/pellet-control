package es.pelletcontrol.app;

import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup.MarginLayoutParams;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PageFetcherPlugin.class);
        registerPlugin(BackgroundSensorsPlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(CalendarPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        // Android 15+ dibuja la app a pantalla completa (edge-to-edge) y ya no encoge la ventana
        // al abrir el teclado. Se reservan los márgenes de las barras del sistema y, además, el
        // alto del teclado: así la vista web se encoge y el campo que se escribe queda visible.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            WebView wv = getBridge().getWebView();
            ViewCompat.setOnApplyWindowInsetsListener(wv, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                MarginLayoutParams mlp = (MarginLayoutParams) v.getLayoutParams();
                mlp.leftMargin = bars.left;
                mlp.topMargin = bars.top;
                mlp.rightMargin = bars.right;
                mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
                v.setLayoutParams(mlp);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(wv);
        }
    }
}
