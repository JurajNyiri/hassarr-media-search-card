# Hassarr Media Search Card

A custom Lovelace card for Home Assistant that enables quick searching of Movies and TV Shows via TMDB and instantly adds them to your \*Arr stack (Radarr and Sonarr) using the **Hassarr** integration.

This card is **specifically built to work with the data and service calls provided by the [Hassarr Integration](https://github.com/TegridyTate/Hassarr)**.

<img width="513" height="623" alt="image" src="https://github.com/user-attachments/assets/8b2d2e7d-7fd4-4718-930d-a8ba93b4564a" />

---

## 🛠 Installation

### Option 1: HACS My Home Assistant (Recommended)

The easiest way to install the Hassarr Media Search Card is via HACS.

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=SpaceFrags&repository=hassarr-media-search-card&category=plugin)

### Option 2: Manual HACS Installation

1.  Ensure you have **HACS (Home Assistant Community Store)** installed.
2.  Click the **...** menu in the top right and select **Custom repositories**.
3.  Enter the URL of this GitHub repository and select **Lovelace** as the category.
4.  Click **Add**.
5.  Search for "Hassarr Media Search Card" in the HACS Frontend section and click **Install**.
6.  **Reload** your Home Assistant frontend (a hard refresh `Ctrl+F5` or `Shift+F5` is recommended).

### Option 3: Manual Installation

1.  Download all the files in the dist directory from the latest release of this repository.
2.  Place the file into your Home Assistant configuration directory under `www/hassarr_media_search_card/`.
    * Path should look like: `/config/www/hassarr_media_search_card/my-hassarr-search-card.js`
3.  Add a resource reference in your Lovelace configuration (via the UI or `ui-lovelace.yaml`):

    **If using the UI:**
    * Go to **Settings** > **Dashboards** > **...** > **Resources**.
    * Click **Add Resource**.
    * **URL:** `/local/hassarr_media_search_card/my-hassarr-search-card.js`
    * **Type:** `JavaScript Module`

---

## ⚙️ Configuration

The card requires configuration in your Lovelace dashboard YAML (or via the UI editor).

### Prerequisites

These settings are necessary for the core functionality of the card.

| Setting | Required | Type | Description |
| :--- | :---: | :--- | :--- |
| **`tmdb_api_key`** | **Yes** | `string` | Your The Movie Database (TMDB) API key for searching the movie/TV database. |

### Automatic Hassarr Instance Selection

The card now auto-detects Hassarr config entries and shows a **Target Instance** selector.

- It queries Home Assistant config entries (`domain: hassarr`) and uses the entry display title (the nice name from HA).
- It automatically routes Add Movie/Add TV calls to the selected Hassarr instance.
- If HA does not expose config entry names to the card, it falls back to instance suffix-based names.

### Optional Visual Customization

| Setting | Default | Type | Description |
| :--- | :---: | :--- | :--- |
| **`show_title`** | `true` | `boolean` | Toggles the visibility of the card header. |
| **`custom_title`** | `Media Search` | `string` | Custom text to display in the card header. |
| **`target_instance_subtitle`** | `Target Instance` | `string` | Custom text shown above the instance selector. |
| **`result_item_background_color`** | `var(--secondary-background-color)` | `string` | Custom CSS color for the background of individual search results (e.g., `#374151`). |
| **`disable_hover_animation`** | `false` | `boolean` | If set to `true`, disables the subtle lift effect when hovering over results. |
| **`title_text_color`** | `var(--primary-text-color)` | `string` | Custom CSS color for the media titles. |
| **`description_text_color`** | `var(--secondary-text-color)` | `string` | Custom CSS color for the date/type text. |
| **`add_button_color`** | `var(--success-color, #4CAF50)` | `string` | Custom CSS color for the 'Add' buttons. |

### Example Lovelace YAML

Here is a full example configuration. It is highly recommended to use secrets for your API keys.

```yaml
type: custom:hassarr-media-search-card
# Required for searching
tmdb_api_key: !secret tmdb_api_key

# Optional Customization
custom_title: 'Request Media'
target_instance_subtitle: 'Library'
show_title: true
add_button_color: '#8A2BE2' # Custom button color (Blue Violet)
