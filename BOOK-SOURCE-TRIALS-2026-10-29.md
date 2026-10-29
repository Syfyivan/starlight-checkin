# 中文书源第二轮实测与 3.20.0 接入

目标仍然是：用户搜中文书名，取得正确版本的完整电子书，在小小成就阅读。书目命中、文件可达、正文可解析分别验收。英文版、同名作品、同人小说、书摘和试读不算成功。

## 本轮真正取得的资源

| 路线 | 实际结果 | 本次接入 |
| --- | --- | --- |
| [数位经典](https://www.chineseclassic.com/about) | 11 个 EPUB 版本逐项取文件；9 个成功，2 个超时。完整《论语》有 20 篇，已有解析器实际拆为学而至尧曰 20 小节 | 9 个成功版本 |
| [开读 Open Books Hong Kong](https://openbookshongkong.com/book/) | 找到 21 本官方中文 EPUB，逐条 HEAD 200；9 本符合现有 10 MiB 上限，全部实际下载并用应用解析器解析成功 | 9 本中文出版书 |
| [Hello 算法](https://github.com/krahets/hello-algo/releases/tag/1.3.0) | 官方中文 Python EPUB 实际取得 22,192,685 字节；106 个阅读顺序项、503 张图，中文正文完整。许可 CC BY-NC-SA 4.0 | 暂不接入：超出现有大小上限，且图文教学书需要保留插图。它不算《算法导论》 |
| [好读](https://github.com/haodoo/haodoo-classic) | 目录有 4,173 个书码、4,400 条不同 EPUB 路径；仅公版朱熹《论语集注》实际取得并校验，22 个阅读顺序项、82,147 个汉字 | 未把整个目录作为授权全文库接入 |

新增 18 个版本均完成了本机网络下载、生产用隔离解析器处理、中文正文校验和首尾章节检查。初次有两个格式失败，修复后重新实测通过：一个 `.zip` 文件本身已经是 EPUB；另一个只有字体采用 EPUB 标准混淆，正文没有加密。读取明文正文时不提取或解码字体，仍拒绝正文加密和未知加密算法。相关标准：[W3C EPUB 3.3 字体混淆](https://www.w3.org/TR/epub-33/#sec-font-obfuscation)。

这 18 个版本是真实增量，不意味着已达到“很多现代中文书随搜随有”。当前仍是正文阅读，不保留插图、原字体与复杂排版；不能宣称图文阅读器已完成。繁体内容沿用原文保存、显示层可切简体，不把机器翻译当中文版。

## 同一组目标书的覆盖证据

| 书 | 版本发现 | 已验证完整中文文件 |
| --- | --- | --- |
| 论语 | 数位经典、好读、既有古腾堡/维基文库 | 是，新数位经典版本已接入；另有好读朱熹注本样本 |
| 小海蒂 / 海蒂 | Open Library 用 Heidi 加 `language:chi` 找到中文作品；直接中文词未命中。抽查 ISBN 9789570514766 | 否；IA EPUB/PDF 标为 private，并提供加密借阅格式 |
| 三体 | Open Library、好读目录有准确作者与中文版本；IA 抽查 ISBN 9789861206066 | 本轮未取得可接入文件；IA 为借阅版，好读仅核查元数据 |
| 活着 | 仅用标题会误中其他作者；用 Huo zhe 和余华核对，IA 抽查 ISBN 9787532125944 | 本轮未取得可接入文件；IA 为借阅版 |
| 算法导论 | 用 Suan fa dao lun 定位中文版本，IA 抽查 ISBN 9787111187776 | 否；借阅限制仍存在，不能用 Hello 算法或英文原版替代 |

Open Library 作品级 `ebook_access=public` 可能来自英文版；必须检查中文 edition 的语言、权限和关联文件。[官方搜索 API](https://openlibrary.org/dev/docs/api/search)。

## 正式 API 路线

| 服务 | 本次实际验证 | 还缺什么 |
| --- | --- | --- |
| [阅文 v2](https://open.yuewen.com/docsv2/wxhz/1023.html) | 正式提供 `chapter/content` 和 `epub/url`；完整版 `fileType=0`，试读 `1`。无凭证请求服务可达，但业务码 1204，未返回全文 | 商务资格、报价、授权书单、签名凭据、EPUB 独立权限；不能把接口存在等同于四本目标书都在授权目录 |
| [掌阅精选](https://b.zhangyue.com/product.html) | 产品页可达，官方宣称 25 万+出版书；申请页面向机构 | 确认个人项目资格、应用内阅读方式、正文接口与授权范围；未发送申请 |
| [国图当代图书](https://read.nlc.cn/yuewen/index) | 官方入口已定位，本机与网页工具请求超时 | 当前连通性及读者身份；超时不能推断没有资源 |
| [轻学堂](https://www.qingxuetang.com/admin/help/technology) | 实际无 appId 请求返回 -1000；字段是讲师、课时、音视频和 H5 课程链接 | 属于讲书课程集成，不是 EPUB 全文接口 |
| [eBooksAssistant](https://github.com/caspartse/eBooksAssistant/blob/2024/references/API_Reference.md) | `/metadata` 无 key 请求返回 401；文档只有元数据、豆瓣/微信读书链接 | 不能用元数据接口填补正文缺口 |
| [超星开放平台](https://auth.open.chaoxing.com/open/doc/list/yluywps0/zpsakobd/prcwmqec?custom=null) | 文档可定位路由签名规范；直接请求遇证书主机名错误 | 未验证书籍正文路由，没有关闭 TLS 校验 |

阅文正式接入并非“拿任意 API key”：首先需要确认合作方获授权的书单，然后开通 EPUB。给合作方的具体核验需求已明确：上述目标书的中文版本、全本而非试读、站内阅读、用户范围、缓存与下架同步、报价与最低采购要求。未代用户申请、付费或发送商务消息。

## REA 与多源开源项目路线

不是只读 README：本轮在隔离的研究目录安装并实际运行 [morluto/rea](https://github.com/morluto/rea) `rea-agents@6.8.0`，使用随 Codex 提供的 Node 24.22.1；没有修改系统 Node 或全局 MCP 配置，也没有把 REA 放进生产依赖。

- 目标是 [OlibTauri v3.4.0](https://github.com/shiyi-0x7f/OlibTauri/releases/tag/v3.4.0) 官方 7.72 MB Debian 包。包 SHA256 `25f364002530fd098bc5944b76e8c494bcd8d519fb5e6a9b10e8cca595cd5a17` 与 GitHub release 一致；只解包，不安装或执行客户端。
- 对其中 17,263,544 字节的 ELF（SHA256 `850c7b75bc767eebc97f7f093ead495f096738430eb79ac9bc6f9871171baf06`）实际运行 `inspect-artifact`、`inspect-rust-binary`、`inspect-binary-layout`，保留证据。识别为 amd64 ELF，未发现 cargo-auditable `.dep-v0`；这不代表没有 Rust 依赖。
- 本机没有配置 Ghidra/Hopper/IDA/Kuna，所以没有声称已恢复函数级原始源码。额外只读字符串观察发现搜索、登录、用户资料等 `/eapi/` 字面量；未经运行验证，不能据字符串拼接猜接口契约。
- 与[公开调用源码](https://github.com/shiyi-0x7f/OlibTauri/blob/master/src-tauri/src/commands/search_commands.rs)、[私有模块说明](https://github.com/shiyi-0x7f/OlibTauri/blob/master/dev_docs/refs/olib-api-plugin-rs.md)相互印证：其搜索/下载调用 `ZLibrary`，多线路并不等于多个独立资源库。下载还依赖上游账号与额度。没有访问曾被安全拦截的上游或镜像，没有提取用户凭据。

另检查了这些项目和真实来源：

- [Shelfmark](https://github.com/calibrain/shelfmark)：元数据→版本→下载队列→书库导入的完整工程架构，值得参考。它本身不创造资源；标准部署要求至少 2 GB，不能直接装进现有 192 MB 应用容器。没有部署或宣称其所有来源可用。
- [so-novel](https://github.com/freeok/so-novel)：按默认源做实际搜索，三体/活着出现同人及同名误命中，小海蒂/算法导论无结果；之后遇 403 后停止。增加网文源数并不等于增加出版书覆盖。
- [bookget](https://github.com/deweizhu/bookget)：图书馆影印页、IIIF 获取路线，有助古籍扫描件；没有验证任意现代中文书的端到端获取。
- [鸠摩](https://www.jiumodiary.com/)：本次首页仍显示升级提示及真人验证要求；没有将隐藏表单当作可用搜索 API，也没有绕过验证码。

好读[官方介绍](https://www.haodoo.net/?M=hd&P=about)明确资源含网络收集、扫描录入、读者投稿与校对，且未逐一获得所有作者同意。这解释了资源网站怎样积累书籍，但其大目录不代表允许把现代书全集重新托管。开源下载器、聚合站和镜像数量也不能合计为独立藏书量。

## 实现、验证与未完成项

- `lib/open-books.mjs`、`lib/open-books-catalog.json`：18 个有出处的中文版本，固定 HTTPS 下载地址、唯一版本标识、作者/译者与许可。
- `lib/book-source.mjs`：加入多源搜索与取书，复用 8 份缓存、30 秒下载预算、10 MiB 上限和隔离解析。
- `lib/ebook/parse.mjs`、`lib/ebook-source-worker.mjs`、`lib/wikisource.mjs`：支持一层 ZIP 与字体混淆声明；补上中央目录数量/范围一致性校验，防虚报条目跳过预检。无需新增依赖。
- `public/reading.js`：接受新来源编号；`lib/reading.mjs`：来源许可不参与正文长度与奖励指纹。旧来源、计奖与可见范围不变。
- 26 项聚焦测试通过；18 个新增版本均用真实网络文件通过应用解析。覆盖未知 ID、假缓存、超限/错误响应、非中文内容、串行槽回收、ZIP 套壳/目录欺骗与正文加密拒绝。
- Edge 浏览器另用真实取得的《论语》文件做固定传输验收：搜索→新来源编号经 HTTP 取书→20 篇正文与署名→简体显示→完成最后一篇→刷新保留进度通过，360/390/1280 宽度无横向溢出，未出现浏览器异常；手机截图已人工查看。`npm run check` 与 `git diff --check` 通过。

下一阶段优先验证现代出版物授权书单，以及用户已有会员/图书馆身份可提供的实际阅读接入；扩大公开中文技术书时，先补图文 EPUB 能力。还没有完成“任意中文书立即取得”。研究进展是两个来源已跑通、正式全文接口已定位、无效或受限路线有明确证据，不能把这一点宣告为整个目标不可能。

本机详细证据位于忽略目录 `output/book-research/`、`output/book-api-trials.*`、`output/book-source-trials.*`。电子书文件、工具安装包和用户信息不入仓库。生产部署状态以发布验收补记为准。

## 生产环境补测与副本准备（3.20.1）

3.20.0 推送和部署后，服务器真实访问发现数位经典返回 403，而香港出版来源返回 200。本机成功不能代表生产取书成功，因此追加原始文件预缓存。仅包含这 18 个允许公开分发的版本，共 43,494,063 字节；保留原文件、署名、许可，不向仓库提交书籍或用户数据。

新增 `lib/source-file-cache.mjs`：固定书目 ID 对应固定文件名，配置目录在 Web 根目录外；读取时检查目录大小、固定来源 URL、文件长度和 SHA-256；无运行时写文件。个人书架继续使用原来的数据权限和八份解析缓存。补测缓存淘汰后重新读取、无上游网络、损坏目录与错误校验等路径，并修复 EPUB 字体条目与正文同路径别名的校验遗漏。没有新增依赖或整套下载器服务。

本地 29 项聚焦测试及 18 个真实原文件的离线解析均通过。生产上线后的最终版本、文件和 18 本服务器验收结果另行补记。

最终生产验收（UTC 2026-10-29 15:55）：版本 **3.20.1**，发布代码 `4c3c9bee0372951c089f217b5d387f4c9abe08be` 已推送并核对 GitHub main。部署核对全部 208 个跟踪文件，容器内全量测试通过；先备份 SQLite 再更新，数据库完整性通过、schema 仍为 20，上一容器保留用于恢复。首次全量检查发现旧测试仍固定维基版本第一名，已改为检查旧版本仍可检索，并重新通过全部检查。

公网 health、版本及 5 个阅读/显示/解析/缓存资源的 SHA-256 与提交一致。腾讯云隔离容器设 `--network none`、192 MB 内存、0.5 CPU、空内存数据库，从预备目录逐本取得并解析 **18/18**；单本约 0.50–3.48 秒，这只是本次冷解析实测，不是长期 SLA。《论语》20 篇、23,963 字符；用户数据没有参与测试。生产取书不再依赖这两个源站当时是否接受服务器请求。完整图文排版与现代中文书广覆盖仍未完成。
