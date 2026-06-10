package com.mhl.music;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String UPDATE_DIRECTORY = "app-updates";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean downloadInProgress = false;
    private volatile boolean downloadCancellationRequested = false;
    private volatile HttpURLConnection activeDownloadConnection = null;

    @PluginMethod
    public void getInstalledIdentity(PluginCall call) {
        executor.execute(() -> {
            try {
                PackageManager packageManager = getContext().getPackageManager();
                PackageInfo packageInfo = getPackageInfo(
                    packageManager,
                    getContext().getPackageName()
                );
                File installedApk = new File(
                    getContext().getApplicationInfo().sourceDir
                );
                JSObject data = buildIdentity(packageInfo, installedApk);
                resolveSuccess(call, data);
            } catch (Exception error) {
                resolveError(call, "NATIVE_IDENTITY_FAILED", error.getMessage());
            }
        });
    }

    @PluginMethod
    public void inspectDownloadedApk(PluginCall call) {
        String requestedPath = call.getString("path");
        if (requestedPath == null || requestedPath.trim().isEmpty()) {
            resolveError(call, "APK_INSPECTION_FAILED", "Missing APK path.");
            return;
        }

        executor.execute(() -> {
            try {
                File apkFile = requirePrivateUpdateFile(requestedPath);
                PackageManager packageManager = getContext().getPackageManager();
                PackageInfo archiveInfo = getArchivePackageInfo(packageManager, apkFile);
                PackageInfo installedInfo = getPackageInfo(
                    packageManager,
                    getContext().getPackageName()
                );

                JSObject data = buildIdentity(archiveInfo, apkFile);
                Set<String> archiveCertificates = getCertificateDigests(archiveInfo);
                Set<String> installedCertificates = getCertificateDigests(installedInfo);
                data.put(
                    "matchesInstalledCertificate",
                    !archiveCertificates.isEmpty() &&
                    archiveCertificates.equals(installedCertificates)
                );
                resolveSuccess(call, data);
            } catch (Exception error) {
                resolveError(call, "APK_INSPECTION_FAILED", error.getMessage());
            }
        });
    }

    @PluginMethod
    public synchronized void downloadUpdate(PluginCall call) {
        if (downloadInProgress) {
            resolveError(call, "DOWNLOAD_FAILED", "An update download is already in progress.");
            return;
        }

        String url = call.getString("url");
        String assetName = call.getString("assetName");
        String expectedDigest = call.getString("expectedDigest");
        Long expectedSize = call.getLong("expectedSize");
        Long eligibleAtMs = call.getLong("eligibleAtMs");
        Long trustedTimeMs = call.getLong("trustedTimeMs");
        if (
            url == null ||
            assetName == null ||
            expectedDigest == null ||
            expectedSize == null ||
            eligibleAtMs == null ||
            trustedTimeMs == null
        ) {
            resolveError(call, "DOWNLOAD_FAILED", "Missing update download parameters.");
            return;
        }
        if (trustedTimeMs < eligibleAtMs) {
            resolveError(call, "SAFETY_PERIOD_ACTIVE", "The APK safety period has not elapsed.");
            return;
        }

        downloadCancellationRequested = false;
        downloadInProgress = true;
        executor.execute(() -> {
            File temporaryFile = null;
            try {
                validateOfficialDownloadUrl(url, assetName);
                File updateDirectory = new File(getContext().getCacheDir(), UPDATE_DIRECTORY);
                if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                    throw new IllegalStateException("Could not create the private update directory.");
                }

                temporaryFile = new File(updateDirectory, assetName + ".part");
                File destinationFile = new File(updateDirectory, assetName);
                if (temporaryFile.exists() && !temporaryFile.delete()) {
                    throw new IllegalStateException("Could not clear the previous temporary APK.");
                }
                if (destinationFile.exists() && !destinationFile.delete()) {
                    throw new IllegalStateException("Could not clear the previous APK.");
                }

                HttpURLConnection connection = openOfficialConnection(url);
                activeDownloadConnection = connection;
                long contentLength = connection.getContentLengthLong();
                if (contentLength > 0 && contentLength != expectedSize) {
                    throw new IllegalStateException("Remote APK size changed before download.");
                }

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long downloadedBytes = 0;
                byte[] buffer = new byte[64 * 1024];
                try (
                    InputStream input = connection.getInputStream();
                    FileOutputStream output = new FileOutputStream(temporaryFile)
                ) {
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (downloadCancellationRequested) {
                            throw new DownloadCancelledException(
                                "Update download was cancelled."
                            );
                        }
                        output.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                        downloadedBytes += read;
                        emitDownloadProgress(downloadedBytes, expectedSize);
                    }
                    output.getFD().sync();
                } finally {
                    connection.disconnect();
                }

                if (downloadedBytes != expectedSize) {
                    throw new IllegalStateException("Downloaded APK size does not match GitHub metadata.");
                }
                String downloadedDigest = formatDigest(digest.digest());
                if (!downloadedDigest.equalsIgnoreCase(expectedDigest)) {
                    throw new DigestMismatchException(
                        "Downloaded APK SHA-256 does not match GitHub metadata."
                    );
                }
                if (!temporaryFile.renameTo(destinationFile)) {
                    throw new IllegalStateException("Could not finalize the downloaded APK.");
                }

                JSObject data = new JSObject();
                data.put("path", destinationFile.getAbsolutePath());
                data.put("digest", downloadedDigest);
                data.put("size", downloadedBytes);
                resolveSuccess(call, data);
            } catch (DownloadCancelledException error) {
                if (temporaryFile != null) temporaryFile.delete();
                resolveError(call, "DOWNLOAD_CANCELLED", error.getMessage());
            } catch (DigestMismatchException error) {
                if (temporaryFile != null) temporaryFile.delete();
                resolveError(call, "CHECKSUM_MISMATCH", error.getMessage());
            } catch (Exception error) {
                if (temporaryFile != null) temporaryFile.delete();
                resolveError(
                    call,
                    downloadCancellationRequested ? "DOWNLOAD_CANCELLED" : "DOWNLOAD_FAILED",
                    downloadCancellationRequested
                        ? "Update download was cancelled."
                        : error.getMessage()
                );
            } finally {
                synchronized (this) {
                    activeDownloadConnection = null;
                    downloadInProgress = false;
                    downloadCancellationRequested = false;
                }
            }
        });
    }

    @PluginMethod
    public synchronized void cancelDownload(PluginCall call) {
        boolean cancelled = downloadInProgress;
        if (cancelled) {
            downloadCancellationRequested = true;
            HttpURLConnection connection = activeDownloadConnection;
            if (connection != null) connection.disconnect();
        }
        JSObject data = new JSObject();
        data.put("cancelled", cancelled);
        resolveSuccess(call, data);
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            getContext().getPackageManager().canRequestPackageInstalls();
        JSObject data = new JSObject();
        data.put("allowed", allowed);
        resolveSuccess(call, data);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            JSObject data = new JSObject();
            data.put("opened", true);
            resolveSuccess(call, data);
        } catch (Exception error) {
            resolveError(call, "INSTALL_FAILED", error.getMessage());
        }
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        String path = call.getString("path");
        String expectedDigest = call.getString("expectedDigest");
        String expectedVersionName = call.getString("expectedVersionName");
        Long expectedVersionCode = call.getLong("expectedVersionCode");
        Long eligibleAtMs = call.getLong("eligibleAtMs");
        Long trustedTimeMs = call.getLong("trustedTimeMs");
        if (
            path == null ||
            expectedDigest == null ||
            expectedVersionName == null ||
            expectedVersionCode == null ||
            eligibleAtMs == null ||
            trustedTimeMs == null
        ) {
            resolveError(call, "INSTALL_FAILED", "Missing APK installation parameters.");
            return;
        }
        if (trustedTimeMs < eligibleAtMs) {
            resolveError(call, "SAFETY_PERIOD_ACTIVE", "The APK safety period has not elapsed.");
            return;
        }
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !getContext().getPackageManager().canRequestPackageInstalls()
        ) {
            resolveError(
                call,
                "INSTALL_PERMISSION_REQUIRED",
                "Allow MHL Music to install apps before continuing."
            );
            return;
        }

        executor.execute(() -> {
            try {
                File apkFile = requirePrivateUpdateFile(path);
                PackageManager packageManager = getContext().getPackageManager();
                PackageInfo archiveInfo = getArchivePackageInfo(packageManager, apkFile);
                PackageInfo installedInfo = getPackageInfo(
                    packageManager,
                    getContext().getPackageName()
                );
                if (!getContext().getPackageName().equals(archiveInfo.packageName)) {
                    throw new SecurityException("Downloaded APK package does not match MHL Music.");
                }
                if (
                    getVersionCode(archiveInfo) != expectedVersionCode ||
                    !expectedVersionName.equals(archiveInfo.versionName) ||
                    !sha256(apkFile).equalsIgnoreCase(expectedDigest)
                ) {
                    throw new SecurityException("Downloaded APK identity changed before installation.");
                }
                if (!getCertificateDigests(archiveInfo).equals(getCertificateDigests(installedInfo))) {
                    throw new SecurityException("Downloaded APK signing certificate does not match.");
                }

                Uri apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".updateprovider",
                    apkFile
                );
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION |
                    Intent.FLAG_ACTIVITY_NEW_TASK
                );
                getContext().startActivity(intent);

                JSObject data = new JSObject();
                data.put("started", true);
                resolveSuccess(call, data);
            } catch (Exception error) {
                resolveError(call, "INSTALL_FAILED", error.getMessage());
            }
        });
    }

    private static class DigestMismatchException extends SecurityException {
        DigestMismatchException(String message) {
            super(message);
        }
    }

    private static class DownloadCancelledException extends Exception {
        DownloadCancelledException(String message) {
            super(message);
        }
    }

    private void validateOfficialDownloadUrl(String url, String assetName) throws Exception {
        if (!assetName.matches("MHL-Music-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk")) {
            throw new SecurityException("APK asset name does not match the release contract.");
        }
        URL parsed = new URL(url);
        String expectedPrefix = "/ParaSyteTwo/music-mhl/releases/download/";
        if (
            !"https".equalsIgnoreCase(parsed.getProtocol()) ||
            !"github.com".equalsIgnoreCase(parsed.getHost()) ||
            !parsed.getPath().startsWith(expectedPrefix) ||
            !parsed.getPath().endsWith("/" + assetName)
        ) {
            throw new SecurityException("APK URL is outside the official GitHub repository.");
        }
    }

    private HttpURLConnection openOfficialConnection(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(30_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "application/octet-stream");
        connection.connect();

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            connection.disconnect();
            throw new IllegalStateException("GitHub APK request failed with status " + status + ".");
        }
        String finalHost = connection.getURL().getHost().toLowerCase();
        if (
            !finalHost.equals("github.com") &&
            !finalHost.endsWith(".githubusercontent.com")
        ) {
            connection.disconnect();
            throw new SecurityException("GitHub redirected the APK to an untrusted host.");
        }
        return connection;
    }

    private void emitDownloadProgress(long downloadedBytes, long totalBytes) {
        JSObject event = new JSObject();
        long progress = totalBytes > 0
            ? Math.min(100, (downloadedBytes * 100) / totalBytes)
            : 0;
        event.put("progress", progress);
        event.put("downloadedBytes", downloadedBytes);
        event.put("totalBytes", totalBytes);
        notifyListeners("updateDownloadProgress", event);
    }

    private File requirePrivateUpdateFile(String requestedPath) throws Exception {
        File updateDirectory = new File(getContext().getCacheDir(), UPDATE_DIRECTORY);
        File canonicalDirectory = updateDirectory.getCanonicalFile();
        File canonicalFile = new File(requestedPath).getCanonicalFile();
        String directoryPrefix = canonicalDirectory.getPath() + File.separator;
        if (!canonicalFile.getPath().startsWith(directoryPrefix)) {
            throw new SecurityException("APK path is outside the private update directory.");
        }
        if (!canonicalFile.isFile() || !canonicalFile.getName().endsWith(".apk")) {
            throw new IllegalArgumentException("APK file does not exist or has an invalid extension.");
        }
        return canonicalFile;
    }

    @SuppressWarnings("deprecation")
    private PackageInfo getPackageInfo(
        PackageManager packageManager,
        String packageName
    ) throws PackageManager.NameNotFoundException {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        return packageManager.getPackageInfo(packageName, flags);
    }

    @SuppressWarnings("deprecation")
    private PackageInfo getArchivePackageInfo(
        PackageManager packageManager,
        File apkFile
    ) {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo packageInfo = packageManager.getPackageArchiveInfo(
            apkFile.getAbsolutePath(),
            flags
        );
        if (packageInfo == null) {
            throw new IllegalArgumentException("Android could not parse the downloaded APK.");
        }
        return packageInfo;
    }

    private JSObject buildIdentity(PackageInfo packageInfo, File apkFile) throws Exception {
        JSObject identity = new JSObject();
        identity.put("packageName", packageInfo.packageName);
        identity.put("versionName", packageInfo.versionName != null ? packageInfo.versionName : "");
        identity.put("versionCode", getVersionCode(packageInfo));
        identity.put("digest", sha256(apkFile));

        JSArray certificateDigests = new JSArray();
        for (String digest : getCertificateDigests(packageInfo)) {
            certificateDigests.put(digest);
        }
        identity.put("signingCertificateDigests", certificateDigests);
        return identity;
    }

    @SuppressWarnings("deprecation")
    private long getVersionCode(PackageInfo packageInfo) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? packageInfo.getLongVersionCode()
            : packageInfo.versionCode;
    }

    @SuppressWarnings("deprecation")
    private Set<String> getCertificateDigests(PackageInfo packageInfo) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (packageInfo.signingInfo == null) {
                return new HashSet<>();
            }
            signatures = packageInfo.signingInfo.hasMultipleSigners()
                ? packageInfo.signingInfo.getApkContentsSigners()
                : packageInfo.signingInfo.getSigningCertificateHistory();
        } else {
            signatures = packageInfo.signatures;
        }

        Set<String> digests = new HashSet<>();
        if (signatures == null) return digests;
        for (Signature signature : signatures) {
            digests.add(sha256(signature.toByteArray()));
        }
        return digests;
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[8192];
        try (FileInputStream input = new FileInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        return formatDigest(digest.digest());
    }

    private String sha256(byte[] value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return formatDigest(digest.digest(value));
    }

    private String formatDigest(byte[] value) {
        StringBuilder output = new StringBuilder("sha256:");
        for (byte item : value) {
            output.append(String.format("%02x", item));
        }
        return output.toString();
    }

    private void resolveSuccess(PluginCall call, JSObject data) {
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("data", data);
        bridge.getActivity().runOnUiThread(() -> call.resolve(result));
    }

    private void resolveError(PluginCall call, String code, String detail) {
        JSObject error = new JSObject();
        error.put("code", code);
        error.put("detail", detail != null ? detail : "Unknown native updater error.");

        JSObject result = new JSObject();
        result.put("success", false);
        result.put("error", error);
        bridge.getActivity().runOnUiThread(() -> call.resolve(result));
    }
}
