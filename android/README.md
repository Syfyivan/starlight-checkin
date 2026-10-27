# 小小成就 Android 3.2.0

版本号 320，沿用原签名，可覆盖安装。删除重复的原生标题与菜单栏，网站顶栏和底部导航负责日常操作；账号页的“安卓工具箱”保留刷新、浏览器打开与帮助。只处理可信站点主框架的用户点击，不新增 JavaScript 原生桥。

Android 11 及以上由容器统一处理系统栏、屏幕开孔与键盘占用区域，并消费 Insets，避免网页重复留白；较旧版本沿用系统布局与 adjustResize。WebView 启用 viewport 适配。实现参考 [Edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge) 与 [WebSettings](https://developer.android.com/reference/android/webkit/WebSettings)。

独立 Android 安装包，包名 `app.starlight.checkin`，支持 Android 8.0（API 26）及以上。使用 Android 平台 WebView 打开正式 HTTPS 网站，账号、计划和奖励与网页同步；需要联网。未引入 AndroidX、第三方框架或 npm 依赖。

实现了文件选择（计划导入、凭证图片）、登录 Cookie 保存、原生返回/刷新菜单、网络与证书错误提示、邀请/核销 HTTPS 链接入口。仅声明联网权限，无存储权限或 JavaScript 原生桥接，不允许明文或混合内容，不跳过证书校验。深链接提供 Android 的应用选择入口，未声明系统验证过的 App Links。

## 构建

已有 JDK 18、Android API 35 平台及 Build Tools 34.0.0 时，在 PowerShell 7 执行：

```powershell
pwsh -NoProfile -File android/build.ps1
```

构建脚本按 `aapt2 → javac → d8 → zipalign → apksigner` 顺序打包，并验证 APK 签名和 ZIP 对齐。输出为 `public/downloads/starlight.apk` 与 SHA-256 文件。SDK 由 Google 官方 ZIP 安装，本轮用户已明确同意 SDK 许可；未安装 IDE、模拟器或 NDK。

正式签名私钥保存在当前 Windows 用户的 `%LOCALAPPDATA%\StarlightSigning\starlight-release.p12`，目录仅当前用户可访问，密码以 Windows DPAPI 密文保存于同目录。构建期间通过进程环境变量传递密码，退出即清除；私钥和密码不进入源码、发布包或服务器。后续 APK 更新必须沿用这把签名密钥。该本地副本不是异机备份，换电脑前应通过安全方式备份签名材料。

签名证书 SHA-256：`4c357be4986f738bd46605295b1f08072dda6f7637f7fcb9b1abeda42d04eb6e`。

验证边界：编译、DEX、Manifest、v2/v3 签名、ZIP 对齐已检查；网页已做浏览器手机视口测试。未连接真实安卓手机，也未做设备上的安装、文件选择、WebView 兼容性实测。

平台实现依据：[WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview)、[D8](https://developer.android.com/tools/d8)、[AAPT2](https://developer.android.com/tools/aapt2)、[APK 签名](https://developer.android.com/tools/apksigner)。

网站 3.2.1 增加在线检查更新入口，网站与 APK 版本分别显示。当前 APK 仍为 3.2.0；未来构建会一并生成 public/downloads/starlight.json。页面无需重装，APK 升级由浏览器下载、用户在安卓系统确认覆盖安装。

已核对用户提供的 APK 2.1.0：同样在线加载网页并支持把下载交给浏览器，不必先换包才能看到更新入口。该包没有上报自身版本号，因此网站无法准确判断当前是 2.1.0；新版网页会说明这一点。可在旧版原生“菜单 → 刷新页面”后，进入头像菜单的“检查更新”，下载新版并按安卓提示安装。页面刷新不能删除旧包的原生标题栏，原生布局改进仍需升级到 APK 3.2.0。签名一致已验证，真机覆盖安装尚未实测。
