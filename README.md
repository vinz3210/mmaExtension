# Map Making App Extension

A Tampermonkey userscript that adds layout controls, smoother panorama zoom, and a panorama-pinning shortcut to [Map Making App](https://map-making.app).

## Features

- Switch between a 50:50 layout and **⅓ map / ⅔ panorama**.
- Fine, animated panorama zoom with adjustable speed for the mouse wheel and +/− buttons.
- Press **P** to pin the currently visible panorama by its exact ID instead of using **Default / auto-updating**.
- Choose whether pinning also saves the location or leaves the panorama open for further editing.
- Press **V** to hide all UI overlays inside the panorama, including controls, navigation arrows, and the crosshair. Press **V** again to restore them. The map and location editor stay visible.

Controls appear at the bottom-right, and preferences are remembered. Change the pin shortcut through **Tampermonkey → Set pin-and-save shortcut…**. Saving a location still requires the usual **Save / Ctrl+S** to commit the map to the server.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open the [userscript installation link](https://github.com/vinz3210/mmaExtension/raw/refs/heads/main/map-making-tools.user.js) and click **Install** in Tampermonkey.
3. Open or reload a map in [Map Making App](https://map-making.app).
