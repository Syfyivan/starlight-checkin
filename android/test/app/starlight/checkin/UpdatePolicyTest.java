package app.starlight.checkin;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.Arrays;

public final class UpdatePolicyTest {
    interface Action { void run() throws Exception; }
    private static int checks;
    private static void rejected(Action action) throws Exception {
        try { action.run(); } catch (java.io.IOException expected) { checks++; return; }
        throw new AssertionError("Unsafe input was accepted");
    }
    public static void main(String[] args) throws Exception {
        byte[] bytes="signed-package-test".getBytes("UTF-8");
        String digest=UpdatePolicy.hex(MessageDigest.getInstance("SHA-256").digest(bytes));
        UpdatePolicy.validate(320,370,"3.7.0",bytes.length,digest,UpdatePolicy.APK_PATH);checks++;
        for(long next:new long[]{319,320,-1,((long)Integer.MAX_VALUE)+1})rejected(()->UpdatePolicy.validate(320,next,"3.7.0",bytes.length,digest,UpdatePolicy.APK_PATH));
        for(long size:new long[]{-1,0,UpdatePolicy.MAX_APK_BYTES+1})rejected(()->UpdatePolicy.validate(320,370,"3.7.0",size,digest,UpdatePolicy.APK_PATH));
        for(String path:new String[]{"https://evil.invalid/app.apk","//evil.invalid/app.apk","/starlight/downloads/../other.apk","/starlight/downloads/starlight.apk?target=evil","/starlight/downloads/starlight.apk#other"})rejected(()->UpdatePolicy.validate(320,370,"3.7.0",bytes.length,digest,path));
        for(String hash:new String[]{"",digest.substring(1),"g"+digest.substring(1)})rejected(()->UpdatePolicy.validate(320,370,"3.7.0",bytes.length,hash,UpdatePolicy.APK_PATH));
        for(String version:new String[]{"3.7","3.7.x","3.7.0\nnext"})rejected(()->UpdatePolicy.validate(320,370,version,bytes.length,digest,UpdatePolicy.APK_PATH));
        ByteArrayOutputStream out=new ByteArrayOutputStream();UpdatePolicy.copyVerified(new ByteArrayInputStream(bytes),out,bytes.length,digest);if(!Arrays.equals(bytes,out.toByteArray()))throw new AssertionError("Changed bytes");checks++;
        rejected(()->UpdatePolicy.copyVerified(new ByteArrayInputStream(bytes),new ByteArrayOutputStream(),bytes.length-1,digest));
        rejected(()->UpdatePolicy.copyVerified(new ByteArrayInputStream(bytes),new ByteArrayOutputStream(),bytes.length+1,digest));
        rejected(()->UpdatePolicy.copyVerified(new ByteArrayInputStream(bytes),new ByteArrayOutputStream(),bytes.length,"0".repeat(64)));
        System.out.println("Android updater policy: "+checks+" checks passed");
    }
}
