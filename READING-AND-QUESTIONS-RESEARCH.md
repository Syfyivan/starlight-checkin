# 阅读与题库接入调研（2026-10-29）

> 复查结论：3.17 的古腾堡小目录与纯文本阅读器没有达到中文日常阅读需求。下方“首次实现”只记录已发布行为，后续方向以文末“书源与阅读体验复查”为准；联网成功、奖励测试通过不等于版本质量和阅读体验合格。

## 首次实现：本机解析，服务端记账

已比较 [EPUB.js](https://github.com/futurepress/epub.js)、[Foliate.js](https://github.com/johnfactotum/foliate-js) 和用户现有的 [myEpubReader](https://github.com/Syfyivan/myEpubReader)。

EPUB.js 提供浏览器内排版、分页等能力；适合以后做保留图文排版的阅读器。Foliate.js 更模块化，支持多种格式及按需读取，但其项目明确不以旧浏览器为目标。当前安卓曾出现旧内核兼容问题，本次先复用已有项目的 EPUB 包结构、路径检查、阅读顺序及正文提取逻辑，将其适配成独立浏览器 Worker。书籍自身 HTML、脚本、字体、远程资源不进入应用页面，只展示转义后的正文。

新增 JSZip 3.10.2、fast-xml-parser 5.11.2、esbuild 0.28.2，均为构建依赖，已获用户授权。锁定版本与完整性校验，浏览器分发包随仓库提交。生产 Node 服务不安装这些依赖，不增加解析进程、转换服务或新数据库。修改解析源码后运行 `npm ci`、`npm run build:ebook`。第三方声明见 `public/vendor/EBOOK-LICENSES.txt`。

这是适合当前资源和旧客户端的选择，不代表完整阅读器项目“不好”。目前不支持 PDF、扫描件 OCR、DRM、复杂 EPUB 原版布局；插图、公式和脚注跳转的完整保真阅读留待后续单独完善。

## 公开书源

采用 [Project Gutenberg 官方目录](https://www.gutenberg.org/ebooks/offline_catalogs.html)，从[官方列出的镜像](https://www.gutenberg.org/MIRRORS.ALL)获取目录与正文，遵守其[自动访问说明](https://www.gutenberg.org/policy/robot_access.html)，不抓取主站搜索网页。

本次目录快照 1,164 本，其中中文 268 本，以作者年代较早的中文典籍、中外经典为主。搜索是本地目录检索，选书时联网取正文，不是覆盖全网、现代畅销书或付费书的下载搜索。`scripts/update-book-catalog.mjs` 可从官方 CSV 更新目录；此次目录更新不作为后台定时任务。简繁常见书名及部分中文别名支持搜索。

每次首次取书会检查该书 RDF 的公版标记，只访问固定 HTTPS 镜像路径，不接受任意 URL；超时、体积和并发均有限制。保留原文本的古腾堡说明及许可信息，展示原书页面链接。古腾堡的公版判断以美国为基础，目录还采用保守作者年代筛选；这不是对每个国家、每个版本的版权保证。[版权说明](https://www.gutenberg.org/policy/permission.html)

Gutendex 提供方便的元数据 API，但本次服务器探测出现 HTTP 错误／超时，未让核心功能依赖它；官方目录快照让日常搜索无需第三方即时响应。读者也可以导入有权使用的 EPUB / TXT / Markdown。

## 题目：仅调研，尚未接入

| 来源 | 已核实的能力 | 接入判断 |
| --- | --- | --- |
| LeetCode / 力扣 | 未找到面向本应用的官方 OAuth 登录或账号进度授权文档；国际站条款明确限制抓取 | 可以设计保存公开主页、跳转做题、提交学习记录；不要把填用户名称为“已验证绑定”，不收账号密码或 Cookie，不将私有 GraphQL 端点当作稳定公共 API |
| Exercism | 开放题目规范、Markdown 题面和 JSON 测试数据；该仓库 MIT | 算法与编程练习优先候选。按固定版本导入、保留来源和许可，再做中文说明和能力分级；不必依赖实时取题 |
| Khan Exercises | 框架 MIT，题目 CC BY-NC-SA；已不用于新增题目开发 | 可作为小学到中学数学题型的候选资料，需单独处理题目许可、中文课程映射与旧技术适配；不能当作免费实时题库 API |
| OpenStax | 有题目 API 文档，但要求 OAuth 或已登录会话；教材覆盖中学后段及大学内容 | 可以研究开放教材习题，逐份保留许可；公开文档不等于已经获得第三方应用接入资格。当前官方帮助文档说明 CC BY-NC-SA，不能沿用历史“全部 CC BY”的假设 |

核对来源：[LeetCode 条款](https://leetcode.com/terms/)、[力扣协议](https://leetcode.cn/terms/)、[Exercism 题目结构](https://github.com/exercism/problem-specifications)、[Exercism 许可](https://github.com/exercism/problem-specifications/blob/main/LICENSE)、[Khan Exercises 状态及许可](https://khan.github.io/khan-exercises/)、[OpenStax API](https://exercises.openstax.org/api/)、[OpenStax 当前许可说明](https://help.openstax.org/s/article/Licensing-information-of-OpenStax-textbooks)。

建议讨论的玩法：先选“数学 / 编程”等学科，再用小学、初中、高中、大学、毕业后作为推荐入口，实际出题按知识点和能力调整。学段不等于题目难度，毕业后也可以选入门。基础数学可以先做数值、选择等可确定判分的题型；编程题使用现成题目与测试，但执行用户代码必须另建隔离判题环境，不能放进当前记账进程。

第一轮奖励建议按“首次完成 + 解题说明”计分，重复练习保留记录，不无限重复发币；题目来源版本、判分结果、奖励规则和改分都入日志。以上是待讨论方案，尚未创建账号绑定、抓题任务或判题服务。

## 书源与阅读体验复查（2026-10-29，3.17.1 之后）

### 两本实际样本暴露的问题

1. **《论语》**：从当前采用的官方镜像重新获取 `23839/pg23839.txt`，HTTP 200。原文件 45,178 字符，包含从“學而第一”到“堯曰第二十”的 20 篇标题。当前 `textChapters()` 没识别“篇名 + 第几”的标题，只按长度拆成两个同名“正文”，长度分别 23,979、19,774；头尾许可、制作说明也在阅读正文里。已确认 20 篇标题存在，但未逐句校勘，也不能据此称它是适合儿童的注释版。不是把结果数量改大就能解决的问题。
2. **《小海蒂》**：当前书目生成器的英文作者白名单未包含 Johanna Spyri，检索别名也未配置“小海蒂 / 海蒂 / Heidi”。古腾堡实际有 [1448](https://www.gutenberg.org/ebooks/1448)、[46409](https://www.gutenberg.org/ebooks/46409) 等版本，已核实为英文；不能拿英文版本冒充中文结果。搜不到既有本应用的筛选错误，也有中文译本覆盖不足。
3. 现有 `reading.js` 将纯文本逐行显示，目录只有下拉框，没有字号、行距、页宽、简繁切换、分页或段落位置恢复；读书奖励区域还占据阅读界面。服务器省资源不要求牺牲这些体验，浏览器 EPUB 排版同样可以把计算放在用户设备上。

### 书源逐项核实

| 渠道 | 本次直接证据 | 应怎样接入，以及未解决的边界 |
| --- | --- | --- |
| 鸠摩 `jiumodiary.com` | 浏览器打开用户给出的原域名，显示“网站升级中，新版本即将上线”，Search 按钮 disabled，未能提交两本书的搜索。其[说明页](https://www.jiumodiary.com/info.php)和[声明](https://www.jiumodiary.com/declare.php)说明自身是到第三方站点的搜索聚合，不保存书籍 | 适合作为外部找书入口或经确认后开发适配器，不能把聚合结果直接当 EPUB 下载接口。当前没有验证可用的正式接入接口；不使用搜索结果中冒充鸠摩的相似域名替代原站 |
| Z-Library | 找到社区项目 [heartleo/zlib](https://github.com/heartleo/zlib) 及其 [EAPI 文档](https://github.com/heartleo/zlib/blob/main/docs/eapi.md)，描述搜索、格式/语言筛选、下载及账号额度 | 技术上存在可研究的接口封装，不能简单断言“没有接口”。但社区说明不等于站方稳定性或分发授权承诺。本次浏览器安全策略禁止访问 `z-library.sk`，未登录、未执行搜索下载，也未转用镜像绕过限制；未安装该工具。登录、额度、版本质量与实际可用性仍待验证，不能列为已接通书源 |
| 中文维基文库 | [《论语》原页](https://zh.wikisource.org/wiki/論語)和官方 [MediaWiki API](https://www.mediawiki.org/wiki/API:Parsing_wikitext)；本机 Action API 实测 HTTP 200，返回分篇链接 | 可做中文古典正文来源，按照页面实际目录顺序选取正文，不能拿 API 的字母排序链接直接充当目录；还包含序说、全览及特殊版本篇章。须核对版本、校对状态和许可；不保证提供现代中文译本，腾讯云连通性尚未补测 |
| Open Library | [官方 API](https://openlibrary.org/developers/api)，实际搜索 Heidi + Johanna Spyri 返回 200、376 条匹配，前三条分别有 public / no_ebook / borrowable 标记 | 适合作品、版本、语言与封面发现。某作品列有中文、又标 public，不能推导出其中文版本可免费下载；必须检查具体 edition。缓存与限速，获取方式逐条展示，不能把目录元数据当正文 |
| 古腾堡 | 英文《海蒂》多版本与现有《论语》实际可取；此前 1,164 本只是本应用筛出来的小集合 | 保留作经典作品补充，扩充必要作者及中英别名；展示语言、版本、章节和正文质量，不再当作覆盖中文日常读物的主书城 |
| 自有书库 / OPDS | [OPDS 规范](https://specs.opds.io/opds-1.2)支持目录发现与获取；[TaleBook](https://github.com/talebook/talebook)、[Readest](https://github.com/readest/readest)已有相关能力 | 可以接入自己已有、有权使用的书库，统一搜索和阅读。协议与开源软件本身不附赠一整套中文书，不应把“支持 OPDS”写成“已获得资源” |

《小海蒂》中文出版电子版也确实存在，例如 [Google Play Books 的万卷版](https://play.google.com/store/books/details?id=aexJEQAAQBAJ)列有 246 页及样章入口。但该页面是售书/阅读入口，不是本应用可直接存储全文的免费 API。本次没有验证到可直接接入并允许在本应用分发的《小海蒂》简体全文，不把“找到书目”写成“找到可导入全本”。

### 建议实现方式

- **统一找书，但保留版本选择**：先合并“小海蒂 / 海蒂 / Heidi”等作品别名，再展示译者、语言、出版社/年代、格式、目录数量、样章和来源。明确区分“直接阅读”“前往来源”“需要登录/借阅”“仅书目信息”；不制造一堆无法打开的假结果。
- **书源可插拔**：统一 `search → editions → sample → acquire`，先接已验证的目录/正文接口和自己的书库。外部来源失败时显示具体状态，不让它拖死全站；缓存书目和已选版本。不能把任意社区书源里的 JavaScript 直接放进记账服务器执行。
- **阅读器升级**：优先验证 [EPUB.js](https://github.com/futurepress/epub.js) 的浏览器分页/滚动、目录、图片和位置定位；以 Readest 的交互作参考，必要时评估其使用的 foliate-js。EPUB.js 默认禁用书中脚本，不开启交互脚本。具体引擎仍需旧 Android WebView 样本对比，不能只凭 README 定案；整套 Readest 是 AGPL，foliate-js 是 MIT，不能混称许可证。
- **中文阅读补齐**：默认适合中文的页宽、字体和行距，提供简体/原文切换，可采用 [OpenCC](https://github.com/BYVoid/OpenCC)；转换只改变显示，不伪造“新版翻译”或改变计奖指纹。保留原文和来源许可，把书源附录与主要目录、读完奖励分开。
- **保存原书**：后续新导入保留私有 EPUB 文件及资源，以浏览器渲染，正文索引用于搜索和计奖。此前已经丢掉的图片、脚注和排版无法从纯文本还原，需要用户重新导入原文件。按书内容/版本做去重，切换简繁或补全排版不重新发奖。

### 下一版验收条件

- 《论语》清楚列出 20 篇、可切简体、从“学而”读到“尧曰”，正文不夹英文许可长文；许可仍可从来源说明访问。当前核对过的是标题存在，不是逐句校勘结论。
- 搜“小海蒂”能识别同一作品，中文与英文版本分开；没有可用中文全文时如实标注，不能自动用英文或片段顶替。
- 下载前可看样章、目录和版本信息；读取失败、登录要求、来源维护等状态能够区分。
- 手机可调字号/行距，翻页与目录跳转清楚，重开恢复具体阅读位置；图文 EPUB 的图片和脚注可用。完读与笔记奖励沿用幂等规则，换源/重导不借机重复计奖。

本次交付是来源实查、根因定位与接入方案：只更新调研文档，没有变更线上读者数据、安装新依赖或宣称新的书源已上线。需要验证的登录、腾讯云网络、具体译本和 Android 真机项目已明确区分。
