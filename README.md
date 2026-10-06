# Map Making App: Layout & Fine Panorama Zoom

## Installation

1. Open **Create a new script** in Tampermonkey.
2. Paste the complete contents of `map-making-tools.user.js` and save (Ctrl+S).
3. Reload the Map Making App page, for example [the test map](https://map-making.app/maps/455346).

The settings and Pin button appear at the bottom-right of the page. The labels currently displayed by the script are listed below, with their English meanings:

- **⅓ Karte / ⅔ Pano** (⅓ Map / ⅔ Panorama): switches between 50:50 and 1:2. At window widths of 800 px or less, the app keeps its stacked mobile layout.
- **Feiner Zoom** (Fine Zoom): enables small, animated zoom steps for the mouse wheel and panorama +/− buttons. Enabled by default. Turning it off restores the original controls.
- **Tempo** (Speed): Sehr fein / Very fine (0.05), Fein / Fine (0.1), Mittel / Medium (0.2), or Schnell / Fast (0.35) per typical mouse-wheel tick. Trackpad movement is handled proportionally.
- **Save after pin**: enabled by default; saves the location after pinning. Turn it off to select only the panorama ID and leave the panorama open. Applies to both the shortcut and Pin button. Your preference is remembered.

Settings are saved locally in your browser. The left map's zoom, panorama reset, and existing app shortcuts retain their original behavior. Ctrl/Cmd+mouse wheel is not intercepted.

## Pin the Visible Panorama and Save the Location

**P** (or the **Pin / Pin + Save** button) selects the exact ID of the currently visible panorama in the date selector. With **Save after pin** enabled, it then saves the location. With the option disabled, the panorama stays open so you can continue editing and save the location manually later. This pins the specific image instead of using **Default / auto-updating**. No other capture date is selected in between; “current” means the visible image, not today's calendar date.

The app does not currently use P for its own shortcuts. To change it, open the Tampermonkey icon → this script → **Set pin-and-save shortcut…**. Enter a shortcut such as `J` or `Alt+P`. The setting is stored in Tampermonkey and takes effect immediately. The shortcut is inactive while typing in search, tag, or other input fields.

When **Save after pin** is enabled, the script triggers the location's normal **Save** button. Save the entire map to the server afterward using **Ctrl+S / Save**, as usual. A status message reports if the panorama is still loading, its ID is missing from the selector, or saving is unavailable. Changing the open location or panorama during the operation prevents an automatic save.

## Technical Details and Verification

The live page and its public JS/CSS files were inspected on October 6, 2026. The app uses `.page-map-editor` with two grid columns and exposes the Google panorama as `window.streetView`. The script uses that existing instance; it does not create a second panorama.

Fine zoom is limited to the app's current zoom range (0 to 4). Panorama changes and external zoom changes stop an active animation. With automatic saving enabled, the Pin shortcut saves only the open location through the app's normal controls. It does not delete locations or trigger a global map save.

The script has not been executed on the signed-in live page: the available browser interface only permits read-only JavaScript evaluation. After installation, check both layouts, mouse-wheel zoom, panorama changes, and P with **Save after pin** both enabled and disabled. If the app changes its CSS classes, date selector, or `window.streetView`, the script may need updating.

Run local tests with `node --test tests/*.test.cjs`. They cover zoom, exact ID selection, both selector variants, pinning without saving, save cancellation on panorama changes, and configurable shortcuts. They do not replace integration testing with the live app.
