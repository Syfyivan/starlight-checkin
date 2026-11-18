# Pet & Cottage Art Assets

## 1. Unified Storybook Watercolor Pet Roster (6 Species × 4 Stages)

All 6 companion species in `public/pets/<species>/` share a unified warm-brown-ink (`#553828`) + soft pastel watercolor storybook illustration style matching `window-cottage.webp`:

- `nuonuo-seal` — **糯糯海豹**（观星慢行家）
- `cloud-fox` — **晴空云狐**（追云气象员）
- `pocket-glider` — **兜兜鼯鼠**（森果采集家）
- `moon-bunny` — **月桂垂耳兔**（草木调香师）
- `cottonpod-hermit` — **棉桃寄居蟹**（海岛拾贝客）
- `moss-dragon` — **墨墨小书龙**（博物藏书家）

Each species directory includes 6 PNG assets (512 × 512 RGBA transparent canvas):
- `young.png` — 幼年态静态立绘
- `winged.png` — 成长态静态立绘
- `moon.png` — 灵阶初绽静态立绘（第二次孵化后）
- `star.png` — 满阶星海静态立绘（最终成长形态）
- `young-idle-animated.png` — 幼年态轻呼吸双帧 APNG
- `winged-idle-animated.png` — 成长态轻呼吸双帧 APNG

Eggs (`云朵蛋` & `星辉灵蛋` with species-specific markings) and all 22 wearable multi-slot outfits (`head`, `neck`, `body`, `companion`) are native SVG layers aligned via `FIT` anchor coordinates in `public/pets.js`.

## 2. Cottage Scene

窗边小屋背景 `window-cottage.webp` 为本项目使用内置图像生成工具绘制的原创绘本木屋场景。画面包含暖色木屋、拱窗、书桌、草编地毯与旅行皮箱，支持「暖阳午后 / 春樱微风 / 听雨屋檐 / 星夜灯火」四档光影氛围与最多 3 件旅行纪念物陈列。
