package com.mhl.music;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(YtDlpPlugin.class);
        registerPlugin(NativeLibraryPlugin.class);
        registerPlugin(OpenFilePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
