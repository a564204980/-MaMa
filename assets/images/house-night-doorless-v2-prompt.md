# Bathroom south-wall correction

## Corrective second pass

Precise tiny correction. Image 1 is the TARGET; image 2 is reference for a missing vertical wall. In image 1 restore the narrow vertical hallway wall at x565..585,y245..332 exactly as it appears in image 2, immediately south of bathroom and to the right of the corridor runner. It was accidentally erased. It must separate hallway from living room again, without closing the doorway gap below y332. Keep bathroom's newly restored south wall segments in image 1, but set their INNER jamb edges at x485 and x550, so the empty bathroom entrance has width65 centeredx517.5. Only these wall pixels may change. Preserve every other object, wall, floor, framing, brightness and image coordinate in image 1. No new doors. Same full frame 1578x996. This is surgical wall restoration, no entire-image redesign or relighting.

## Initial pass

Mode: built-in image_gen edit
Target: `house-night-doorless.png`
Reference: `house-night.png`
Output: `house-night-doorless-v2.png`

Use case: precise-object-edit.
Image 1 is the edit target: doorless midnight house map, original dimensions 1578x996. Image 2 is reference only for matching wall construction/material, NOT to restore doors or change the target lighting.
Fix ONE small region ONLY: restore the missing southern boundary wall of the bathroom. Bathroom is near top-left-middle, interior x470..605 and y35..215. The bottom tiled edge is now wrongly wide open into the wooden corridor.
Add the missing short wall segments along bathroom south edge, with wall depth/height and top-down raised-wall perspective matching the immediately adjoining walls:
- left jamb/short segment at x460..485, y200..230, meeting left existing wall.
- right segment x550..605, y200..230, meeting existing right wall.
Keep a clear 65-pixel-wide central doorway gap from x485 through x550 centered at x517,y215. The opening must have NO door leaf, NO panel and NO handle; the game renders its own door. Use continuous floor through that central gap.
The added right segment must clearly separate bathroom tile floor from wooden hallway and match original blue-black wall tones. Do not cover bathroom fixtures or move rug.
Every pixel outside this tiny bathroom south-wall correction must remain visually unchanged: no new doors elsewhere, no furniture changes, no lighting/color changes, no texture restyle, no crop or scaling. Preserve original image 1 framing and exact map coordinates. Do not recreate full scene. Only repair the two small wall/jamb pieces around the existing bathroom doorway.
