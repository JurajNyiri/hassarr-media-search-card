// Copyright 2024 SpaceFrags
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// my-hassarr-search-card.js
// This file integrates the React component into Home Assistant Lovelace.

import App from './hassarr-media-search-card-app.js'; // Path to your React App component

// Reuse the Lit runtime already shipped with Home Assistant.
const HaLovelaceElement = customElements.get('ha-panel-lovelace') || customElements.get('hui-view');
const LitElement = HaLovelaceElement ? Object.getPrototypeOf(HaLovelaceElement) : null;
const html = LitElement && LitElement.prototype ? LitElement.prototype.html : null;
const css = LitElement && LitElement.prototype ? LitElement.prototype.css : null;

if (!LitElement || !html || !css) {
  throw new Error('Unable to resolve Home Assistant LitElement runtime.');
}

// Load React and ReactDOM as global scripts (UMD builds)
// IMPORTANT: Use the full /local/ path to ensure correct loading by Home Assistant's web server
const reactScript = document.createElement('script');
reactScript.src = '/local/community/hassarr-media-search-card/react.production.min.js';
document.head.appendChild(reactScript);

const reactDOMScript = document.createElement('script');
reactDOMScript.src = '/local/community/hassarr-media-search-card/react-dom.production.min.js';
document.head.appendChild(reactDOMScript);

// Define the custom element class
class HassarrMediaSearchCard extends LitElement {
  // Define properties that Home Assistant will pass to the card
  static properties = {
    hass: { type: Object }, // The Home Assistant object for service calls
    config: { type: Object }, // The card configuration from Lovelace YAML
  };

  // Define static styles for the web component wrapper
  static styles = css`
    :host {
      display: block;
      /* Default card styling, can be overridden by Tailwind in React component */
      padding: 16px;
      background: var(--ha-card-background, var(--card-background-color, #202020)); /* Dark background for HA */
      border-radius: var(--ha-card-border-radius, 8px);
      box-shadow: var(--ha-card-box-shadow, 0px 2px 4px rgba(0, 0, 0, 0.1));
      color: var(--primary-text-color); /* Ensure text color is readable */
    }
  `;

  constructor() {
    super();
    this._reactRoot = null; // Initialize React root
  }

  /**
   * Called when the element is first connected to the DOM.
   * This is where we initialize the React root and render the App.
   */
  async connectedCallback() { // Make this async to await React/ReactDOM loading
    super.connectedCallback();

    // Wait for both React and ReactDOM to be available globally
    await Promise.all([
        new Promise(resolve => {
            if (window.React) {
                resolve();
            } else {
                reactScript.onload = resolve;
                reactScript.onerror = () => {
                    console.error("Failed to load react.production.min.js. Please ensure the file exists and is accessible.");
                    resolve(); // Resolve to prevent hanging, but rendering will fail
                };
            }
        }),
        new Promise(resolve => {
            if (window.ReactDOM) {
                resolve();
            } else {
                reactDOMScript.onload = resolve;
                reactDOMScript.onerror = () => {
                    console.error("Failed to load react-dom.production.min.js. Please ensure the file exists and is accessible.");
                    resolve(); // Resolve to prevent hanging, but rendering will fail
                };
            }
        })
    ]);

    // Check if React and ReactDOM are actually available after waiting
    if (!window.React || !window.ReactDOM) {
        console.error("React or ReactDOM is not available. Cannot render React component.");
        this.shadowRoot.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--error-color, red);">Error: React libraries failed to load. Please check your Home Assistant logs and file paths.</div>';
        return;
    }

    if (!this._reactRoot) {
      const container = this.shadowRoot.querySelector('#react-root');
      if (container) {
        // Access createRoot from the global ReactDOM object
        this._reactRoot = window.ReactDOM.createRoot(container);
        this._reactRoot.render(
          window.React.createElement( // Use window.React
            window.React.StrictMode, // Use window.React
            null,
            window.React.createElement(App, { hass: this.hass, config: this.config }) // Use window.React
          )
        );
      }
    } else {
      // If already connected, just re-render with current props
      this._renderReactApp();
    }
  }

  /**
   * Called when the element is disconnected from the DOM.
   * This is important for cleaning up the React app to prevent memory leaks.
   */
  disconnectedCallback() {
    if (this._reactRoot) {
      this._reactRoot.unmount(); // Unmount the React app
      this._reactRoot = null;
    }
    super.disconnectedCallback();
  }

  /**
   * Called when observed properties (hass, config) change.
   * This triggers a re-render of the React app with updated props.
   * @param {Map<string, any>} changedProperties - A Map of changed properties.
   */
  updated(changedProperties) {
    if (this._reactRoot && (changedProperties.has('hass') || changedProperties.has('config'))) {
      this._renderReactApp();
    }
  }

  /**
   * Renders the React App component with the current hass and config props.
   */
  _renderReactApp() {
    if (this._reactRoot) {
      // Re-render the React app with updated props using window.React.createElement
      this._reactRoot.render(
        window.React.createElement( // Use window.React
          window.React.StrictMode, // Use window.React
          null,
          window.React.createElement(App, { hass: this.hass, config: this.config }) // Use window.React
        )
      );
    }
  }

  /**
   * Sets the card configuration from Lovelace.
   * @param {object} config - The configuration object.
   */
  setConfig(config) {
    if (!config.tmdb_api_key) {
      throw new Error('You need to define a TMDB API key in the card configuration.');
    }
    this.config = config;
  }

  /**
   * Renders the LitElement's HTML template, which contains the div
   * where the React app will be mounted.
   */
  render() {
    return html`<div id="react-root"></div>`;
  }

  /**
   * Optional: Provides a size hint for the Lovelace UI editor.
   * @returns {number} The approximate height of the card in grid units.
   */
  getCardSize() {
    return 5; // Adjust as needed
  }
}

// Register the custom element with a unique tag name
customElements.define('hassarr-media-search-card', HassarrMediaSearchCard);
