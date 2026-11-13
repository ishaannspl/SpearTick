# SpearTick Figma import

## Files

- `speartick-screens.html` is a self-contained visual board for import with an HTML-to-Figma plugin. It has the shared app shell, design-system references, and representative customer and platform screens, arranged as separate frames.
- `speartick-tokens.json` contains the source color, typography, radius, and shadow tokens for importing as Figma variables.

## Import

1. Open `speartick-screens.html` in a browser and use the HTML-to-Figma plugin's capture/import flow. If the plugin accepts a local HTML file, select the file directly.
2. Import `speartick-tokens.json` separately using Figma's variable import workflow or a compatible design-token plugin.

The HTML contains static sample data so it does not need the app server or a login. It is a design reference, not a functional app prototype. The Figma import creates editable layers; turn repeated elements into Figma components after import.
