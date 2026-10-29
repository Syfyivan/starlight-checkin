# 阅读与题库接入调研（2026-10-29）

## 本次选择：本机解析，服务端记账

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
