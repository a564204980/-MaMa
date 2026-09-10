# Doorless night background

## Corrective pass

Precise correction of image 1 (doorless night map), using image 2 (original night map) ONLY as the reference for accidentally removed furniture. Restore the exact tall narrow wardrobe at the right side of the parents bedroom (original x398..443,y44..208), restore the exact standing floor lamp in computer room (original x592..627,y716..789), and restore the exterior wall lantern (original x1524..1545,y363..402). These three are FURNITURE/LAMPS, not architectural door panels. Restore their original shapes/colors/location and original brightness exactly from image 2. Also restore the original narrow exterior walkway and wall around the outside lantern without closing the original exterior doorway. Change nothing else in image 1. All architectural door leaves must remain REMOVED. Preserve all empty door openings and all current doorless layout. No other change, no relighting, no added objects, no crop, same 1579x996 dimensions. Do NOT restore any architectural door from image 2, including computer room arched slab. Keep all furniture and geometry at exact pixel coordinates.

## Initial pass

Mode: built-in image_gen edit
Source: `house-night.png`
Output: `house-night-doorless.png`

Use case: precise-object-edit
Asset type: coordinate-locked background for a top-down 2D house game.
Input: image 1 is the edit target, a midnight house map.
Primary request: Remove EVERY architectural door leaf/panel painted into this background. The game will render doors separately. Remove hinged door slabs, handles and only their associated cast shadows, inpaint the revealed floor naturally. Keep all door OPENINGS, thresholds and wall/doorframe geometry at exactly the same positions. Keep all furniture cabinet doors and wardrobe fronts, these are NOT architectural doors.
Target locations on the original 1579x996 image:
- Parents bedroom door near x430,y231, opening on its bottom-right edge to corridor.
- Bathroom open diagonal door leaf near x493,y195.
- Player bedroom open diagonal door near x424,y404.
- Nursery open diagonal door near x421,y610.
- Computer room north entrance open door near x767,y645.
- Entry vestibule exterior open door on far right near x1480,y423.
- Also remove the tall arched wooden door-like slab at the computer room upper-left near x606,y693, immediately above the standing lamp. Inpaint its occupied area as the existing room wall/floor continuation; do not leave a standing door panel.
Inspect the entire map for any other architectural door leaves and remove them too. Do not invent replacement doors or close off doorways.
Strict invariants: change ONLY these door leaf objects and their immediate revealed background. Preserve exact full frame, original 1579x996 resolution/aspect, all walls, door openings, corridors, all furniture, rugs, windows, floor boundaries, lights, shadows unrelated to doors and original nighttime darkness/color. No shifting, cropping, scaling, perspective change or room redesign. Preserve the dim blue midnight lighting and existing tiny warm lamp pools. No new objects, characters, text, UI, labels or watermarks.
Result: the SAME exact map with clean empty doorways ready for independently rendered game doors.
