package app.starlight.checkin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Only the explicit PackageInstaller PendingIntent can reach this unexported receiver. */
public final class UpdateReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        AppUpdater.get(context).installationResult(intent);
    }
}
