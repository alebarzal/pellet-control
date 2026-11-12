# Pellet Control

App para controlar el pellet de casa: existencias, compras, recargas de la tolva, consumo, gasto y previsiones. Pensada para una caldera Domusa Bioclass IC DX (tolva de 240 kg), pero la capacidad, el peso del saco y la temporada se configuran.

Funciona en el navegador y como app Android (Capacitor), y varios móviles pueden compartir los mismos datos.

## Funciones

- **Inventario**: sacos guardados, nivel de la tolva y autonomía estimada.
- **Compras y gasto**: precio medio por saco, gasto por mes y temporada, contador de gasto que se puede poner a cero.
- **Consumo y estadísticas**: medias diarias y semanales, recargas de la tolva, reinicio de estadísticas sin borrar el historial.
- **Precios**: seguimiento de fichas de producto de distintas tiendas y comparación de calidad (clase A1 / ENplus).
- **Clima**: temperatura exterior (Open-Meteo) y sensores SwitchBot; previsión de consumo según el frío.
- **Aviso de arranque** de la caldera en el móvil, por la temperatura interior o por un enchufe SwitchBot con medidor.
- **Widget** de Android con sacos, tolva, autonomía, temperaturas y botones de compra y recarga.
- **Calendario**: fechas previstas de compra y de recarga en el calendario del móvil.
- **Hogar compartido** con Supabase (código de invitación de 6 dígitos).
- **Exportar a Excel** y copias de seguridad.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas de cálculos, sincronización y esquema
npm run build
```

Para el hogar compartido integrado, copia `.env.example` a `.env.local` y pon la URL y la clave **pública** de tu proyecto de Supabase.

## App Android

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # requiere JDK 21 y Android SDK 35
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

El APK de depuración se instala directamente (activar «Instalar apps desconocidas»). Para Google Play haría falta firmarlo con una clave propia (`assembleRelease`).

## Estructura

- `src/domain/` — tipos y cálculos puros (inventario, consumo, clima, calendario, enchufe). Sin React.
- `src/data/` — persistencia local, SwitchBot, Open-Meteo, Excel, widget, calendario y sincronización (`sync/`).
- `src/store/` — estado global y operaciones con deshacer.
- `src/features/` y `src/pages/` — interfaz.
- `android/app/src/main/java/…` — plugins nativos: lector de fichas de producto, sensores en segundo plano, widget y calendario.
- `supabase/schema.sql` — tablas, RLS e invitaciones del hogar compartido (probado con PGlite).

## Reglas de cálculo

- Stock guardado = último recuento + compras − sacos recargados ± ajustes. Todo se deriva de los registros: editar o borrar uno recalcula el resto.
- Recargar la tolva **no** es consumo.
- El consumo sale de registros manuales o de lecturas de nivel en porcentaje con todas las recargas intermedias cuantificadas. Las estimaciones visuales (llena/media/baja/vacía) nunca generan consumo.
- Medias, autonomía y previsiones necesitan al menos 3 días con consumo real.

## Hogar compartido (Supabase)

1. Crea un proyecto gratuito en https://supabase.com.
2. SQL Editor → pega `supabase/schema.sql` → Run.
3. Authentication → Sign In / Providers → activa «Allow anonymous sign-ins».
4. En la app: Más → Hogar → Crear un hogar. «Invitar» genera un código de 6 dígitos (24 h, un solo uso).

Cada móvil entra con una sesión anónima y solo los miembros del hogar leen o escriben sus datos. Las credenciales de SwitchBot nunca se comparten ni se incluyen en las copias.

## Autor

Creado por [alebarzal](https://github.com/alebarzal).
