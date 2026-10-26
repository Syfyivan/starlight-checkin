package app.starlight.checkin;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/** A small platform WebView client. All identity and room permissions stay on the server. */
public final class MainActivity extends Activity {
    private static final String HOME = "https://124-221-36-36.anyip.dev:8443/starlight/";
    private static final int PICK_FILE = 41;
    private WebView web;
    private LinearLayout error;
    private TextView errorText;
    private ProgressBar progress;
    private ValueCallback<Uri[]> upload;
    private String retryUrl = HOME;

    private static boolean trusted(Uri uri) {
        return uri != null && "https".equals(uri.getScheme())
            && "124-221-36-36.anyip.dev".equals(uri.getHost()) && uri.getPort() == 8443
            && uri.getUserInfo() == null && uri.getPath() != null && uri.getPath().startsWith("/starlight/");
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(246, 247, 242));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(this);
        TextView title = new TextView(this);
        title.setText("  ✳ 小小成就");
        title.setTextSize(17);
        title.setTextColor(Color.rgb(40, 78, 59));
        title.setGravity(android.view.Gravity.CENTER_VERTICAL);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, Math.round(48 * getResources().getDisplayMetrics().density), 1));
        Button menu = new Button(this);
        menu.setText("菜单");
        menu.setContentDescription("刷新、浏览器打开与使用帮助");
        menu.setOnClickListener(v -> showMenu());
        toolbar.addView(menu);
        root.addView(toolbar);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new LinearLayout.LayoutParams(-1, 5));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(246, 247, 242));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setSafeBrowsingEnabled(true);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if (trusted(uri) && !uri.getPath().contains("/downloads/")) return false;
                if (request.hasGesture()) external(uri);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (trusted(Uri.parse(url))) retryUrl = url;
                error.setVisibility(View.GONE);
                web.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError problem) {
                if (request.isForMainFrame()) showError("暂时没连上小屋，看看网络，再试一次吧。", false);
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError problem) {
                handler.cancel();
                showError("小屋的安全连接暂时没有准备好，请稍后再来。", true);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);progress.setVisibility(value < 100 ? View.VISIBLE : View.GONE);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (upload != null) upload.onReceiveValue(null);
                upload = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                String[] types = params.getAcceptTypes();
                if (types != null && types.length > 0 && types[0].startsWith("image/")) pick.setType("image/*");
                try { startActivityForResult(Intent.createChooser(pick, "选择计划文件或购买凭证"), PICK_FILE); }
                catch (android.content.ActivityNotFoundException e) { upload.onReceiveValue(null); upload = null; }
                return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            Uri uri = Uri.parse(url);
            if (trusted(uri)) new AlertDialog.Builder(this).setMessage("在浏览器里继续下载；个人账本需要在浏览器登录后导出。").setPositiveButton("去浏览器", (d, w) -> external(uri)).setNegativeButton("留在这里", null).show();
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        error = new LinearLayout(this);error.setOrientation(LinearLayout.VERTICAL);error.setPadding(32, 50, 32, 32);
        errorText = new TextView(this);errorText.setTextSize(17);error.addView(errorText);
        Button retry = new Button(this);retry.setText("再连一次");retry.setOnClickListener(v -> web.loadUrl(retryUrl));error.addView(retry);
        error.setVisibility(View.GONE);root.addView(error, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        if (state == null || web.restoreState(state) == null) openIntent(getIntent());
    }

    private void showError(String message, boolean reset) {
        errorText.setText(message);web.setVisibility(View.GONE);error.setVisibility(View.VISIBLE);progress.setVisibility(View.GONE);
        if (reset) retryUrl = HOME;
    }
    private void external(Uri uri) {
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) return;
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);intent.addCategory(Intent.CATEGORY_BROWSABLE);
        // Force a browser-style chooser so this app's own link filter cannot loop back into itself.
        try {
            java.util.ArrayList<Intent> choices = new java.util.ArrayList<>();
            for (android.content.pm.ResolveInfo info : getPackageManager().queryIntentActivities(intent, 0)) {
                if (!getPackageName().equals(info.activityInfo.packageName)) choices.add(new Intent(intent).setPackage(info.activityInfo.packageName));
            }
            if (!choices.isEmpty()) {
                Intent chooser = Intent.createChooser(choices.remove(0), "选择浏览器");
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, choices.toArray(new Intent[0]));startActivity(chooser);
            } else new AlertDialog.Builder(this).setMessage("请用手机浏览器打开小小成就网站。").setPositiveButton("知道啦", null).show();
        } catch (android.content.ActivityNotFoundException ignored) { }
    }
    private void showMenu() {
        new AlertDialog.Builder(this).setTitle("小屋工具箱").setItems(new String[]{"刷新页面", "用浏览器打开", "使用小提示"}, (d, which) -> {
            if (which == 0) new AlertDialog.Builder(this).setMessage("刷新会清空还没提交的内容，继续吗？").setPositiveButton("刷新", (x, y) -> web.reload()).setNegativeButton("继续填写", null).show();
            if (which == 1) { String current = web.getUrl() == null ? HOME : web.getUrl();external(Uri.parse(trusted(Uri.parse(current)) ? current : HOME)); }
            if (which == 2) new AlertDialog.Builder(this).setMessage("注册后就能记计划。在“我的小屋与伙伴”里邀请朋友，或输入邀请码。每间小屋的计划、学习币和卡片各自保存。网站首页和账号页都有完整玩法说明。").setPositiveButton("知道啦", null).show();
        }).show();
    }
    private void openIntent(Intent intent) { Uri uri = intent.getData();web.loadUrl(trusted(uri) ? uri.toString() : HOME); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent);setIntent(intent);openIntent(intent); }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && upload != null) {
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            upload.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);upload = null;
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(function(){var d=document.querySelector('dialog[open]');if(d){d.close();return true;}return false;})()", result -> {
            if ("true".equals(result)) return;
            if (web.canGoBack()) web.goBack();
            else new AlertDialog.Builder(this).setMessage("今天也辛苦啦，要先离开小屋吗？").setPositiveButton("先离开", (d, w) -> finish()).setNegativeButton("再待一会", null).show();
        });
    }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state);super.onSaveInstanceState(state); }
    @Override protected void onPause() { CookieManager.getInstance().flush();web.onPause();super.onPause(); }
    @Override protected void onResume() { super.onResume();if (web != null) web.onResume(); }
    @Override protected void onDestroy() { if (upload != null) upload.onReceiveValue(null);web.destroy();super.onDestroy(); }
}
