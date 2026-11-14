package es.pelletcontrol.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Lee el texto de una foto (saco de pellet, etiqueta de precio del lineal) en el propio móvil,
 * sin enviar la imagen a ningún sitio.
 */
@CapacitorPlugin(name = "PelletOcr")
public class OcrPlugin extends Plugin {

    @PluginMethod
    public void recognize(PluginCall call) {
        String b64 = call.getString("base64", "");
        if (b64 == null || b64.isEmpty()) {
            call.reject("Falta la imagen");
            return;
        }
        Bitmap bmp;
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) {
            bmp = null;
        }
        if (bmp == null) {
            call.reject("No se pudo abrir la imagen");
            return;
        }
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizer.process(InputImage.fromBitmap(bmp, 0))
                .addOnSuccessListener(text -> {
                    JSObject r = new JSObject();
                    r.put("text", text.getText());
                    call.resolve(r);
                    recognizer.close();
                })
                .addOnFailureListener(e -> {
                    String m = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
                    // La primera vez, los servicios de Google tienen que descargar el lector (unos segundos con conexión).
                    call.reject(m.contains("download") || m.contains("module") || m.contains("unavailable")
                            ? "El móvil está descargando el lector de texto. Vuelve a hacer la foto dentro de un minuto, con conexión."
                            : "No se pudo leer el texto de la foto");
                    recognizer.close();
                });
    }
}
