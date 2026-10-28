# Kodama character assets

Reused at the owner's explicit request from their local `Syfyivan/kodama`
project, `src/renderer/pets/`. Characters: 糯糯海豹 (nuonuo-seal),
兜兜鼯鼠 (pocket-glider), 棉桃寄居蟹 (cottonpod-hermit).

The static PNGs and existing animated PNGs are copied without alteration.
The original project, including its uncommitted changes, was not modified.
This reuse does not grant others a license to redistribute these characters.
No Live2D runtime, third-party model, or added dependency is involved.

Each original character includes young.png, winged.png, young-idle-animated.png,
and winged-idle-animated.png. Since 3.9 the fitted-outfit renderer uses the
static PNG with a gentle CSS breathing motion so accessories stay aligned.
Reduced-motion preference disables that motion. Animated originals remain unchanged.

In 3.10, nuonuo-seal/moon.png and star.png were generated with the built-in
image_gen tool, using young.png and winged.png as visual references. These are
new sibling assets, not replacements. Transparent output was copied without
bitmap edits; each new pose has its own outfit anchors. Eggs are native SVG.
See ../../docs/PET-EVOLUTION-ART.md in the repository for the generation brief.
