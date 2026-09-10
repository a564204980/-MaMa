# Bathroom southwest corner correction

Mode: built-in image_gen edit
Target: `house-night-doorless.png`
Output: `house-bathroom-corrected.png`

Use case: precise-object-edit. Image 1 is the full-map edit target. Image 2 is an annotated zoomed reference identifying two tiny wall edits; do NOT copy its red annotations.
Modify ONLY the bathroom southwest corner in the full map, approximately x440..510,y195..245 of the original 1578x996 image:
1. REMOVE the short vertical wall end sticking south into hallway at x440..460,y210..245 (red marked 1 in zoom). Fill this small removed piece with matching dark wooden corridor floor.
2. ADD a short HORIZONTAL wall from x465 to x510 along bathroom south boundary y195..215 (red marked 2 in zoom), meeting the bathroom west wall. Match thickness, raised wall perspective, and cold dark blue masonry of existing walls. The west wall now terminates by turning RIGHT/EAST along the bathroom edge, instead of sticking down into corridor.
Keep the bathroom's entrance gap to the RIGHT of this added horizontal segment, approximately x510..565. Do not add any door leaf. Do not touch the existing right-side bathroom/corridor wall at x565..620, including its vertical segment y245..332 and the gap below it.
The required change is a very small L-corner correction, not a new room or overall redesign. Preserve image 1 exactly everywhere else: furniture, fixtures, walls, all room positions, lighting, darkness, texture, dimensions, framing. Never brighten or recolor the overall image. Keep 1578x996. No added text, markup, doors, objects, crop or perspective changes.
