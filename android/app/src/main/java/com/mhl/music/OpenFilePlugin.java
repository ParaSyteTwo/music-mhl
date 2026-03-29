package com.mhl.music;

import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "OpenFile")
public class OpenFilePlugin extends Plugin {
    @PluginMethod
    public void openDownloadedFile(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("Missing fileName");
            return;
        }

        File documentsDir = getContext().getExternalFilesDir(null);
        File publicDocumentsDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOCUMENTS);
        File target = new File(new File(publicDocumentsDir, "MHL Music"), fileName);

        if (!target.exists()) {
            call.reject("File not found");
            return;
        }

        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            target
        );

        String mime = resolveMimeType(fileName);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, mime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(Intent.createChooser(intent, "Abrir con"));
            call.resolve();
        } catch (Exception e) {
            call.reject("No app available to open file", e);
        }
    }

    private String resolveMimeType(String fileName) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(fileName);
        if (extension != null && !extension.isEmpty()) {
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase());
            if (mime != null) {
                return mime;
            }
        }
        return "audio/*";
    }
}
