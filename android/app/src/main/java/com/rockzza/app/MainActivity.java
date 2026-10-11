package com.rockzza.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios se registran ANTES de crear el puente.
        registerPlugin(RockzzaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
