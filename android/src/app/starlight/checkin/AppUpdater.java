package app.starlight.checkin;

import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Downloads only this app, from its fixed HTTPS origin, with digest and signing-certificate checks. */
final class AppUpdater {
    private static final String ORIGIN = "https://124-221-36-36.anyip.dev:8443";
    private static final long CHECK_INTERVAL = 6 * 60 * 60 * 1000L, SNOOZE = 24 * 60 * 60 * 1000L;
    private static AppUpdater instance;
    static synchronized AppUpdater get(Context context) {
        if (instance == null) instance = new AppUpdater(context.getApplicationContext());
        return instance;
    }
    private final Context context;
    private final SharedPreferences prefs;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private WeakReference<MainActivity> activity = new WeakReference<>(null);
    private long lastCheck;
    private boolean busy, installing, returningFromPermission, explicitInstall;
    private Release ready;
    private Intent pendingConfirmation;
    private String message = "";
    private Runnable action;
    private String actionLabel = "";

    private AppUpdater(Context context) {
        this.context = context;
        prefs = context.getSharedPreferences("native-updates", Context.MODE_PRIVATE);
    }
    boolean enabled() { return prefs.getBoolean("enabled", true); }
    void resume(MainActivity current) {
        activity = new WeakReference<>(current); render();
        if (returningFromPermission) {
            returningFromPermission = false;
            if (context.getPackageManager().canRequestPackageInstalls()) install(true);
            else later();
            return;
        }
        if (pendingConfirmation != null) { showReady(); return; }
        if (enabled() && System.currentTimeMillis() >= prefs.getLong("snoozeUntil", 0)) check(false);
    }
    void pause(MainActivity current) { if (activity.get() == current) activity.clear(); }
    void preferences() {
        MainActivity current = activity.get(); if (current == null) return;
        new AlertDialog.Builder(current).setTitle("安装包更新")
            .setMultiChoiceItems(new String[]{"打开 App 时自动接收新版"}, new boolean[]{enabled()}, (d, which, checked) -> {
                prefs.edit().putBoolean("enabled", checked).apply();
                if (checked) check(false);
            }).setNeutralButton("更新说明", (d, which) -> new AlertDialog.Builder(current).setMessage("新版会在后台下载并校验。安卓允许时自动安装，需要确认时会交给系统。已开始填写内容时先提醒，避免打断。网页功能仍直接在线更新。").setPositiveButton("知道啦", null).show())
            .setPositiveButton("立即查看", (d, which) -> check(true)).setNegativeButton("知道啦", null).show();
    }
    void check(boolean manual) {
        if (busy || installing) return;
        if (ready != null) { if (manual) install(true); else showReady(); return; }
        if (!manual && lastCheck != 0 && System.currentTimeMillis() - lastCheck < CHECK_INTERVAL) return;
        busy = true; lastCheck = System.currentTimeMillis();
        if (manual) status("正在看看有没有新版…", "", null);
        worker.execute(() -> {
            Release release = null;
            try {
                JSONObject metadata = readMetadata();
                JSONObject apk = metadata.optJSONObject("apk");
                if (apk == null) throw new java.io.IOException("No release");
                PackageInfo own = installed();
                long next = apk.getLong("versionCode");
                if (next > code(own)) {
                    release = new Release(apk.getString("version"), next, apk.getLong("bytes"), apk.getString("sha256"), apk.getString("url"));
                    UpdatePolicy.validate(code(own), release.code, release.version, release.bytes, release.sha, release.path);
                    if (!manual && !enabled()) { main.post(() -> { busy = false; status("", "", null); }); return; }
                    main.post(() -> status("发现新版，正在悄悄准备…", "", null));
                    download(release); verifyArchive(release);
                }
                Release result = release;
                main.post(() -> {
                    busy = false;
                    if (result == null) { status(manual ? "安装包已经是最新版啦" : "", "", null); return; }
                    ready = result;
                    MainActivity current = activity.get();
                    if (manual) install(true);
                    else if (!enabled() || System.currentTimeMillis() < prefs.getLong("snoozeUntil", 0)) status("", "", null);
                    else if (current != null && !current.hasInteracted()) install(false);
                    else showReady();
                });
            } catch (Exception problem) {
                main.post(() -> { busy = false; status("这次更新没准备好，不影响继续使用", "重试", () -> check(true)); });
            }
        });
    }
    private PackageInfo installed() throws PackageManager.NameNotFoundException {
        return context.getPackageManager().getPackageInfo(context.getPackageName(), signatureFlags());
    }
    private static int signatureFlags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    private static long code(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    private static String[] signers(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        if (signatures == null || signatures.length == 0) throw new java.io.IOException("Missing signer");
        String[] hashes = new String[signatures.length];
        for (int i = 0; i < signatures.length; i++) hashes[i] = UpdatePolicy.hex(MessageDigest.getInstance("SHA-256").digest(signatures[i].toByteArray()));
        Arrays.sort(hashes); return hashes;
    }
    private HttpsURLConnection connection(String path) throws Exception {
        HttpsURLConnection c = (HttpsURLConnection) new URL(ORIGIN + path).openConnection();
        c.setInstanceFollowRedirects(false); c.setConnectTimeout(10000); c.setReadTimeout(20000); c.setUseCaches(false);
        c.setRequestProperty("Accept", path.endsWith(".apk") ? "application/vnd.android.package-archive" : "application/json");
        // Never send WebView cookies, task contents, or credentials to the update endpoint.
        if (c.getResponseCode() != 200) { c.disconnect(); throw new java.io.IOException("Update unavailable"); }
        return c;
    }
    private JSONObject readMetadata() throws Exception {
        HttpsURLConnection c = connection("/starlight/api/status");
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int n;
            while ((n = in.read(buffer)) != -1) { if (out.size() + n > 65536) throw new java.io.IOException("Metadata too large"); out.write(buffer, 0, n); }
            return new JSONObject(out.toString("UTF-8"));
        } finally { c.disconnect(); }
    }
    private File packageFile() { return new File(context.getCacheDir(), "starlight-update.apk"); }
    private void download(Release release) throws Exception {
        File target = packageFile();
        if (target.isFile()) {
            try (InputStream in = new FileInputStream(target)) {
                UpdatePolicy.copyVerified(in, new OutputStream(){ @Override public void write(int b) {} @Override public void write(byte[] b, int o, int n) {} }, release.bytes, release.sha);
                return;
            } catch (Exception ignored) { /* A stale/partial cached package is never installed. */ }
        }
        File part = new File(context.getCacheDir(), "starlight-update.part");
        HttpsURLConnection c = connection(release.path);
        try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
            UpdatePolicy.copyVerified(in, out, release.bytes, release.sha); out.getFD().sync();
        } catch (Exception e) { part.delete(); throw e; }
        finally { c.disconnect(); }
        if (target.exists() && !target.delete()) throw new java.io.IOException("Cannot replace cached package");
        if (!part.renameTo(target)) throw new java.io.IOException("Cannot save package");
    }
    private void verifyArchive(Release release) throws Exception {
        PackageInfo own = installed(), downloaded = context.getPackageManager().getPackageArchiveInfo(packageFile().getPath(), signatureFlags());
        if (downloaded == null || downloaded.applicationInfo == null || !context.getPackageName().equals(downloaded.packageName)
                || code(downloaded) != release.code || code(downloaded) <= code(own) || !release.version.equals(downloaded.versionName)
                || downloaded.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT || !Arrays.equals(signers(own), signers(downloaded)))
            throw new java.io.IOException("Package identity verification failed");
    }
    private void showReady() {
        if (pendingConfirmation != null) status("安卓需要你确认安装", "继续", this::launchConfirmation);
        else if (ready != null) status("新版 " + ready.version + " 已准备好", "安装", () -> install(true));
    }
    void later() {
        prefs.edit().putLong("snoozeUntil", System.currentTimeMillis() + SNOOZE).apply(); status("", "", null);
    }
    private void install(boolean userRequested) {
        MainActivity current = activity.get(); if (current == null || installing) return;
        if (pendingConfirmation != null) { launchConfirmation(); return; }
        if (ready == null) { check(true); return; }
        if (!userRequested && (!enabled() || current.hasInteracted() || System.currentTimeMillis() < prefs.getLong("snoozeUntil", 0))) { showReady(); return; }
        if (!context.getPackageManager().canRequestPackageInstalls()) {
            showReady();
            new AlertDialog.Builder(current).setTitle("让小屋接收新版安装包")
                .setMessage("需要你在安卓设置里允许“小小成就”安装应用。只更新小小成就，系统仍可能请你确认；不允许也能继续使用。")
                .setPositiveButton("去允许", (d, which) -> {
                    try { returningFromPermission = true; current.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()))); }
                    catch (android.content.ActivityNotFoundException e) { returningFromPermission = false; later(); }
                }).setNegativeButton("稍后", (d, which) -> later()).setOnCancelListener(d -> later()).show();
            return;
        }
        installing = true; explicitInstall = userRequested; status("正在交给安卓安装…", "", null);
        Release release = ready;
        worker.execute(() -> {
            int sessionId = -1;
            PackageInstaller installer = context.getPackageManager().getPackageInstaller();
            try {
                verifyArchive(release);
                int oldSession = prefs.getInt("session", -1);
                if (oldSession >= 0) try { installer.abandonSession(oldSession); } catch (RuntimeException ignored) { }
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(context.getPackageName()); params.setSize(release.bytes);
                if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                sessionId = installer.createSession(params);
                String token = UUID.randomUUID().toString();
                if (!prefs.edit().putInt("session", sessionId).putString("callback", token).commit()) throw new java.io.IOException("Cannot save update session");
                try (PackageInstaller.Session session = installer.openSession(sessionId); InputStream in = new FileInputStream(packageFile())) {
                    try (OutputStream out = session.openWrite("base.apk", 0, release.bytes)) { UpdatePolicy.copyVerified(in, out, release.bytes, release.sha); session.fsync(out); }
                    Intent callback = new Intent(context, UpdateReceiver.class).setAction(context.getPackageName() + ".UPDATE_RESULT").putExtra("callback", token);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    PendingIntent result = PendingIntent.getBroadcast(context, sessionId, callback, flags);
                    session.commit(result.getIntentSender());
                }
            } catch (Exception e) {
                if (sessionId >= 0) try { installer.abandonSession(sessionId); } catch (RuntimeException ignored) { }
                main.post(() -> { installing = false; status("安装暂时没完成，原版本可以继续用", "重试", () -> install(true)); });
            }
        });
    }
    void installationResult(Intent result) {
        if (!(context.getPackageName() + ".UPDATE_RESULT").equals(result.getAction())
                || !prefs.getString("callback", "").equals(result.getStringExtra("callback"))
                || prefs.getInt("session", -2) != result.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)) return;
        installing = false;
        int status = result.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            pendingConfirmation = result.getParcelableExtra(Intent.EXTRA_INTENT);
            MainActivity current = activity.get();
            if (pendingConfirmation != null && current != null && (explicitInstall || !current.hasInteracted())) launchConfirmation();
            else showReady();
        } else {
            prefs.edit().remove("session").remove("callback").apply(); pendingConfirmation = null;
            if (status == PackageInstaller.STATUS_SUCCESS) { ready = null; packageFile().delete(); status("更新完成啦", "", null); }
            else { prefs.edit().putLong("snoozeUntil", System.currentTimeMillis() + SNOOZE).apply(); status("这次没有安装，原版本仍可使用", "重试", () -> install(true)); }
        }
    }
    private void launchConfirmation() {
        MainActivity current = activity.get(); if (current == null || pendingConfirmation == null) return;
        Intent confirmation = pendingConfirmation; pendingConfirmation = null;
        try { current.startActivity(confirmation); status("请按安卓提示确认安装", "", null); }
        catch (RuntimeException e) { status("请稍后再试，原版本可以继续用", "重试", () -> install(true)); }
    }
    private void status(String text, String label, Runnable click) { message = text; actionLabel = label; action = click; render(); }
    private void render() { MainActivity current = activity.get(); if (current != null) current.updateBanner(message, actionLabel, action); }
    private static final class Release {
        final String version, sha, path; final long code, bytes;
        Release(String version, long code, long bytes, String sha, String path) { this.version=version;this.code=code;this.bytes=bytes;this.sha=sha;this.path=path; }
    }
}
