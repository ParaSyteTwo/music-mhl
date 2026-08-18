package com.mhl.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

public class DownloadForegroundService extends Service {
    private static final String CHANNEL_ID = "DownloadServiceChannel";
    private static final int NOTIFICATION_ID = 1;
    
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MHLMusic::DownloadWakeLock");
            wakeLock.acquire(10 * 60 * 1000L /*10 minutes max per lock to be safe*/);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = "MHL Music";
        String text = "Descargando...";
        
        if (intent != null) {
            if (intent.hasExtra("title")) title = intent.getStringExtra("title");
            if (intent.hasExtra("text")) text = intent.getStringExtra("text");
            
            if ("STOP".equals(intent.getAction())) {
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }
        }

        createNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(R.mipmap.ic_launcher) // Using default launcher icon
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Descargas",
                    NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Mantiene la aplicación activa mientras se descarga música");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }
}
