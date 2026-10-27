package app.starlight.checkin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;

/** Pure Java checks shared by the downloader and desktop regression checks. */
final class UpdatePolicy {
    static final long MAX_APK_BYTES = 25L * 1024 * 1024;
    static final String APK_PATH = "/starlight/downloads/starlight.apk";

    static void validate(long installed, long next, String version, long bytes, String sha, String path) throws IOException {
        if (next <= installed || next > Integer.MAX_VALUE) throw new IOException("Not a newer release");
        if (version == null || !version.matches("[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}")) throw new IOException("Invalid version");
        if (bytes <= 0 || bytes > MAX_APK_BYTES) throw new IOException("Invalid package size");
        if (sha == null || !sha.matches("[a-f0-9]{64}")) throw new IOException("Invalid digest");
        if (!APK_PATH.equals(path)) throw new IOException("Unexpected package location");
    }

    static void copyVerified(InputStream in, OutputStream out, long expectedSize, String expectedHash) throws Exception {
        if (expectedSize <= 0 || expectedSize > MAX_APK_BYTES) throw new IOException("Invalid package size");
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[8192]; long total = 0; int count;
        while ((count = in.read(buffer)) != -1) {
            total += count;
            if (total > expectedSize) throw new IOException("Package exceeds announced size");
            hash.update(buffer, 0, count); out.write(buffer, 0, count);
        }
        if (total != expectedSize || !hex(hash.digest()).equals(expectedHash)) throw new IOException("Package verification failed");
    }

    static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte b : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }
}
