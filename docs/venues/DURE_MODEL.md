# 두레문예관 3D model — sources and estimates

Preset key `dure` in `src/config/venues.ts`. There is no vector drawing; everything comes from two plan photos and two hall photos (2026-10-22).

## Coordinates
- Origin: inner face of the basement (B1) hall walls, stage-side wall × left wall. x → right, y → audience.
- Scale: B1 plan photo, structural grid 6 m (18 m wide × 24 m deep), about 44.4 px/m. 1F plan photo, about 16 px/m.

## Values

| Item | Value | Source |
|---|---|---|
| Hall inner size (B1) | 16.4 × 23.1 m | B1 plan photo (dimension sheet) |
| Front flat stage / seating / back aisle | 9.6 / 8.4 (10 rows, block 14.4 m wide) / 5.1 m | B1 plan photo |
| Lighting grid height | 7.2 m | given by the user |
| Balcony | stage side + both sides, about 1.1 m deep from the 1F wall face | 1F plan "극장상부" |
| Balcony edge (railing line) | x 0.8 – 15.6, y 1.1 | 1F plan |
| Stage-side corners | curved, 2.3 m along the stage wall × 0.95 m along the side | 1F plan |
| 1F wall face | 0.35 m outside the B1 wall on both sides (x −0.35 / 16.75) | 1F plan vs grid |
| Balcony floor height | 2.5 m | photo: about the height of a 2440 plywood sheet |
| Spiral stair | upstage-left corner (balcony → grid); left out of the 3D model to keep rendering light | 1F plan |
| Railing | 1.0 m metal railing: handrail, three horizontal bars, posts every 1.2 m, dark grey; merged into one mesh | photos |
| Projection room wall | y 18.0 (end of the seating), three windows z 3.9–4.55 | 1F plan + audience-side photo |
| Seating top row | 2.5 m | estimate (photo) |
| Ceiling | 8.0 m | assumption (just above the grid) |

No balcony on the audience side: the projection room sits over the back aisle. The back aisle (y 18.0–23.1) is left outside the 3D walls; it stays on the 2D plan.

## Plan image
`public/venues/dure/dure_floor_plan.png`: the B1 dimension photo with the coloured measurement marks and label boxes removed (OpenCV inpaint), one smeared seat row and the back bar patched by copying neighbouring pixels, cropped to the inner walls plus 0.4 m. Layer placed at x −0.4, y −0.4, 17.21 × 23.91 m.

## Model support added
- `catwalk` is optional; `lightingGrid` shows a grid of unknown pipe layout as a translucent plane (3D toggle "캣워크·조명 그리드").
- `balconies` (polygon slab + metal railing along `edge`), `solids` (extra wall mass).
- Layer panel toggles are built from the current work's reference layers.
- New works place the default actor and the first light's aim in the middle of the acting area (in front of the seating) when the venue has seating.

## Not done
- Channel check (patch) is still the 인문소극장 patch for every venue.
- Pipe positions of the grid are unknown, so lights do not snap in 두레문예관.
