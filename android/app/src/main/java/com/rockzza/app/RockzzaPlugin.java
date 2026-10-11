package com.rockzza.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Lo que la página no puede hacer sola.
 *
 * IMPRIMIR POR BLUETOOTH CLÁSICO. La PT-210 del local habla Bluetooth clásico
 * (SPP, el que pide PIN 0000), y Chrome solo habla Bluetooth de baja energía:
 * desde una página web esa impresora no existe. Desde aquí sí, igual que lo
 * hace RawBT, pero sin otra app de por medio.
 *
 * La impresora se empareja una vez en los ajustes de Android; aquí solo se
 * elige de la lista de emparejadas, así que no hace falta buscar aparatos
 * cercanos ni pedir permiso de ubicación.
 *
 * Todo lo que toca la impresora pasa por UNA cola de un solo hilo: dos tickets
 * a la vez se intercalarían en el papel.
 *
 * Rockzza · kjd
 */
@CapacitorPlugin(
    name = "Rockzza",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class RockzzaPlugin extends Plugin {

    /** Puerto serie por Bluetooth: el perfil que usan casi todas las impresoras térmicas. */
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    /** Trozos chicos con pausa: las impresoras baratas pierden datos si se les manda todo junto. */
    private static final int TROZO = 512;
    private static final int PAUSA_MS = 12;

    private final ExecutorService cola = Executors.newSingleThreadExecutor();
    private BluetoothSocket socket;
    private String direccion;
    private String nombre;

    // --- Bluetooth ------------------------------------------------------------

    private BluetoothAdapter adaptador() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    /** Antes de Android 12 el permiso de Bluetooth se concede al instalar. */
    private boolean faltaPermiso() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private boolean conectada() {
        return socket != null && socket.isConnected();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        BluetoothAdapter a = adaptador();
        JSObject r = new JSObject();
        r.put("disponible", a != null);
        r.put("encendido", a != null && a.isEnabled());
        r.put("permiso", !faltaPermiso());
        r.put("conectada", conectada());
        r.put("direccion", direccion);
        r.put("nombre", nombre);
        call.resolve(r);
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void emparejadas(PluginCall call) {
        if (faltaPermiso()) {
            requestPermissionForAlias("bluetooth", call, "alResponderPermiso");
            return;
        }
        BluetoothAdapter a = adaptador();
        if (a == null) {
            call.reject("Este teléfono no tiene Bluetooth.", "SIN_BLUETOOTH");
            return;
        }
        if (!a.isEnabled()) {
            call.reject("El Bluetooth está apagado. Enciéndelo y vuelve a intentar.", "APAGADO");
            return;
        }
        JSArray lista = new JSArray();
        for (BluetoothDevice d : a.getBondedDevices()) {
            JSObject o = new JSObject();
            o.put("nombre", d.getName() == null ? d.getAddress() : d.getName());
            o.put("direccion", d.getAddress());
            BluetoothClass c = d.getBluetoothClass();
            // Las impresoras se anuncian como «imagen»: se ponen primero en la lista.
            o.put("esImpresora", c != null && c.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING);
            lista.put(o);
        }
        JSObject r = new JSObject();
        r.put("impresoras", lista);
        call.resolve(r);
    }

    @PluginMethod
    public void conectar(PluginCall call) {
        String dir = call.getString("direccion");
        if (dir == null || !BluetoothAdapter.checkBluetoothAddress(dir)) {
            call.reject("Falta la impresora.", "SIN_DIRECCION");
            return;
        }
        if (faltaPermiso()) {
            requestPermissionForAlias("bluetooth", call, "alResponderPermiso");
            return;
        }
        cola.execute(() -> {
            try {
                abrir(dir);
                JSObject r = new JSObject();
                r.put("nombre", nombre);
                r.put("direccion", direccion);
                call.resolve(r);
            } catch (ErrorImpresora e) {
                call.reject(e.getMessage(), e.codigo);
            }
        });
    }

    @PluginMethod
    public void imprimir(PluginCall call) {
        String datos = call.getString("datos");
        String dir = call.getString("direccion", direccion);
        if (datos == null || dir == null) {
            call.reject("Falta el ticket o la impresora.", "SIN_DATOS");
            return;
        }
        if (faltaPermiso()) {
            requestPermissionForAlias("bluetooth", call, "alResponderPermiso");
            return;
        }
        final byte[] bytes;
        try {
            bytes = Base64.decode(datos, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("El ticket llegó dañado.", "DATOS_INVALIDOS");
            return;
        }
        cola.execute(() -> {
            try {
                if (!conectada() || !dir.equalsIgnoreCase(direccion)) abrir(dir);
                int escritos = escribir(bytes);
                if (escritos < 0) {
                    // La conexión estaba muerta (la impresora se apagó o se durmió) y
                    // no salió NADA: se reconecta y se manda una vez más. Si ya había
                    // salido algo, no se repite: medio ticket dos veces confunde más.
                    abrir(dir);
                    if (escribir(bytes) < 0) throw new ErrorImpresora("Se perdió la conexión con la impresora.", "SIN_CONEXION");
                }
                call.resolve();
            } catch (ErrorImpresora e) {
                call.reject(e.getMessage(), e.codigo);
            }
        });
    }

    @PluginMethod
    public void desconectar(PluginCall call) {
        cola.execute(() -> {
            cerrar();
            direccion = null;
            nombre = null;
            call.resolve();
        });
    }

    @PermissionCallback
    private void alResponderPermiso(PluginCall call) {
        if (faltaPermiso()) {
            call.reject(
                "Sin permiso para usar el Bluetooth. Dalo en Ajustes → Apps → Rockzza → Permisos → Dispositivos cercanos.",
                "SIN_PERMISO"
            );
            return;
        }
        switch (call.getMethodName()) {
            case "emparejadas" -> emparejadas(call);
            case "conectar" -> conectar(call);
            case "imprimir" -> imprimir(call);
            default -> call.resolve();
        }
    }

    @SuppressLint("MissingPermission")
    private void abrir(String dir) throws ErrorImpresora {
        cerrar();
        BluetoothAdapter a = adaptador();
        if (a == null) throw new ErrorImpresora("Este teléfono no tiene Bluetooth.", "SIN_BLUETOOTH");
        if (!a.isEnabled()) throw new ErrorImpresora("El Bluetooth está apagado. Enciéndelo y vuelve a intentar.", "APAGADO");

        BluetoothDevice d = a.getRemoteDevice(dir);
        String n = d.getName() == null ? dir : d.getName();
        BluetoothSocket s = null;
        try {
            s = d.createRfcommSocketToServiceRecord(SPP);
            s.connect();
        } catch (IOException primero) {
            cerrarSilencioso(s);
            // Muchas impresoras chinas no publican bien el servicio SPP: se
            // conecta directo al canal 1, que es donde casi todas lo tienen.
            try {
                Method m = d.getClass().getMethod("createRfcommSocket", int.class);
                s = (BluetoothSocket) m.invoke(d, 1);
                s.connect();
            } catch (Exception segundo) {
                cerrarSilencioso(s);
                throw new ErrorImpresora(
                    "No se pudo conectar con " + n + ". Revisa que esté encendida, con papel y cerca del teléfono.",
                    "NO_CONECTA"
                );
            }
        }
        socket = s;
        direccion = dir;
        nombre = n;
    }

    /** Bytes escritos, o -1 si falló antes de mandar el primero. */
    private int escribir(byte[] bytes) throws ErrorImpresora {
        int enviados = 0;
        try {
            OutputStream out = socket.getOutputStream();
            for (int i = 0; i < bytes.length; i += TROZO) {
                int n = Math.min(TROZO, bytes.length - i);
                out.write(bytes, i, n);
                out.flush();
                enviados += n;
                Thread.sleep(PAUSA_MS);
            }
            return enviados;
        } catch (IOException e) {
            cerrar();
            if (enviados == 0) return -1;
            throw new ErrorImpresora("Se cortó la conexión a mitad del ticket. Reimprime desde Órdenes guardadas.", "CORTADO");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ErrorImpresora("Se interrumpió la impresión.", "INTERRUMPIDO");
        }
    }

    private void cerrar() {
        cerrarSilencioso(socket);
        socket = null;
    }

    private static void cerrarSilencioso(BluetoothSocket s) {
        if (s == null) return;
        try {
            s.close();
        } catch (IOException ignored) {}
    }

    private static class ErrorImpresora extends Exception {

        final String codigo;

        ErrorImpresora(String mensaje, String codigo) {
            super(mensaje);
            this.codigo = codigo;
        }
    }

    // --- Lo demás -----------------------------------------------------------

    /** Lleva a los ajustes de Bluetooth de Android, donde se empareja la impresora con su PIN. */
    @PluginMethod
    public void abrirAjustesBluetooth(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Un toque corto al agregar, cobrar o fallar: se siente sin mirar la pantalla. */
    @PluginMethod
    public void vibrar(PluginCall call) {
        int ms = Math.max(1, Math.min(call.getInt("ms", 12), 200));
        Vibrator v;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            v = vm == null ? null : vm.getDefaultVibrator();
        } else {
            v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (v != null && v.hasVibrator()) {
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        }
        call.resolve();
    }

    /**
     * Abre un enlace en el navegador del teléfono: así se descarga un APK
     * nuevo. Solo https, y solo de GitHub, que es donde se publican.
     */
    @PluginMethod
    public void abrirEnNavegador(PluginCall call) {
        String url = call.getString("url", "");
        Uri u = Uri.parse(url);
        String host = u.getHost() == null ? "" : u.getHost();
        boolean deGithub = host.equals("github.com") || host.endsWith(".githubusercontent.com");
        if (!"https".equals(u.getScheme()) || !deGithub) {
            call.reject("Enlace no permitido.", "URL_NO_PERMITIDA");
            return;
        }
        getContext().startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        cola.execute(this::cerrar);
        cola.shutdown();
        super.handleOnDestroy();
    }
}
