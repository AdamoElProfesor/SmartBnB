# SmartBnB logo

The mark is a roof over a small bar chart: the prices of similar stays nearby.
The green bar is the listing being checked. It is lower than the others, so it
is a good deal. The mark is drawn on a 32 × 32 grid, the size the site header
uses.

| File | Use |
|---|---|
| `logo.svg` | Mark and name, for light backgrounds (top of the README) |
| `logo-dark.svg` | Mark and name, for dark backgrounds (README in GitHub dark mode) |
| `mark.svg` | Mark alone, in colour |
| `mark-mono.svg` | Mark alone, in one colour (ink) |
| `mark-reversed.svg` | Mark alone, for dark backgrounds |
| `app-icon.svg` | Source of the phone home-screen icon |

Colours come from the site theme in `smartbnb/frontend/src/App.vue`: lake
`#2F6F8F` for the roof and bars, good `#3F7A3A` for the listing's bar and ink
`#1C2B2A` for the name. The name is set in Schibsted Grotesk ExtraBold,
converted to outlines, so the files need no font.

## Where the website uses it

- Header: the mark is inline in `smartbnb/frontend/src/App.vue` (`.brand`),
  coloured by the CSS variables.
- `smartbnb/frontend/public/`: `favicon.svg`, `favicon.ico` (16, 32 and 48 px),
  `apple-touch-icon.png` (180 px) and the link preview `og-image.png`.

## Regenerate the PNG and ICO files

With [resvg](https://github.com/linebender/resvg) (`brew install resvg`) and
Pillow, from the repository root:

```sh
resvg -w 180 docs/brand/app-icon.svg smartbnb/frontend/public/apple-touch-icon.png
for s in 16 32 48; do resvg -w $s smartbnb/frontend/public/favicon.svg /tmp/favicon-$s.png; done
python3 -c "from PIL import Image; i = [Image.open(f'/tmp/favicon-{s}.png') for s in (48, 32, 16)]; i[0].save('smartbnb/frontend/public/favicon.ico', sizes=[(48, 48), (32, 32), (16, 16)], append_images=i[1:])"
```

Then raise the `?v=` number on the icon and `og:image` links in
`smartbnb/frontend/index.html`, so browsers and link previews fetch the new
files instead of their cached copies.
