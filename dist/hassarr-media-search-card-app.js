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

// No direct React import needed, as it will be available globally via window.React
// import React, { useState, useEffect, useCallback } from './react.production.min.js';

// Debounce utility function to limit API calls while typing
const debounce = (func, delay) => {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
};

const HASSARR_DOMAIN = 'hassarr';
const MOVIE_SERVICE_BASE = 'add_radarr_movie';
const TV_SERVICE_BASE = 'add_sonarr_tv_show';
const FALLBACK_POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 185 278" width="185" height="278"><rect width="185" height="278" fill="#1F2937"/><text x="92.5" y="139" fill="#F3F4F6" font-family="Arial, sans-serif" font-size="18" text-anchor="middle" dominant-baseline="middle">No Poster</text></svg>`;
const FALLBACK_POSTER_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(FALLBACK_POSTER_SVG)}`;

const extractServiceSuffix = (serviceName, baseName) => {
    const prefix = `${baseName}_`;
    if (!serviceName.startsWith(prefix)) {
        return null;
    }
    return serviceName.slice(prefix.length);
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX32_PATTERN = /^[0-9a-f]{32}$/i;

const looksLikeOpaqueId = (value) => {
    if (typeof value !== 'string') {
        return false;
    }
    const text = value.trim();
    if (!text) {
        return false;
    }
    return ULID_PATTERN.test(text) || UUID_PATTERN.test(text) || HEX32_PATTERN.test(text);
};

const cleanServiceInstanceName = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .replace(/^add\s+radarr\s+movie(?:\s*[-:])?\s*/i, '')
        .replace(/^add\s+sonarr\s+tv\s+show(?:\s*[-:])?\s*/i, '')
        .replace(/^hassarr(?:\s*[-:])?\s*/i, '')
        .trim();
};

/**
 * Main React component for the Home Assistant TMDB Search Card.
 * This component handles searching TMDB, displaying results, and triggering
 * Home Assistant service calls to add content to Radarr/Sonarr.
 *
 * @param {object} props - The component props.
 * @param {object} props.hass - The Home Assistant object, providing access to service calls.
 * @param {object} props.config - The card configuration, including the TMDB API key.
 */
const App = ({ hass, config }) => {
    // State variables for managing UI and data, using window.React.useState
    const [searchTerm, setSearchTerm] = window.React.useState('');
    const [searchResults, setSearchResults] = window.React.useState([]);
    const [loading, setLoading] = window.React.useState(false);
    const [error, setError] = window.React.useState(null);
    const [message, setMessage] = window.React.useState(''); // For success/error messages after adding content

    const [instanceOptions, setInstanceOptions] = window.React.useState([]);
    const [selectedInstanceValue, setSelectedInstanceValue] = window.React.useState('');
    const [loadingInstances, setLoadingInstances] = window.React.useState(false);
    const [instanceStatus, setInstanceStatus] = window.React.useState('');

    // Retrieve API keys and configuration options from the card configuration
    const TMDB_API_KEY = config.tmdb_api_key;
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w185';

    // Other configuration options with defaults
    const showTitle = config.show_title !== false;
    const customTitle = config.custom_title || 'Media Search';
    const targetInstanceSubtitle =
        typeof config.target_instance_subtitle === 'string' ? config.target_instance_subtitle : 'Target Instance';
    const resultItemBackgroundColor = config.result_item_background_color || 'var(--secondary-background-color, #374151)';
    const disableHoverAnimation = config.disable_hover_animation === true;
    const titleTextColor = config.title_text_color || 'var(--primary-text-color, #F3F4F6)';
    const descriptionTextColor = config.description_text_color || 'var(--secondary-text-color, #D1D5DB)';
    const addButtonColor = config.add_button_color || 'var(--success-color, #4CAF50)';

    const selectedInstance = window.React.useMemo(
        () => instanceOptions.find((option) => option.value === selectedInstanceValue) || null,
        [instanceOptions, selectedInstanceValue]
    );
    const haSelectAvailable = typeof customElements !== 'undefined' && Boolean(customElements.get('ha-select'));
    const haSelectItemTag =
        typeof customElements !== 'undefined' && customElements.get('ha-list-item') ? 'ha-list-item' : 'mwc-list-item';
    const haSelectRef = window.React.useRef(null);
    const handleInstanceSelectionChange = (event) => {
        const nextValue =
            (event && event.target && event.target.value) ||
            (event && event.detail && event.detail.value) ||
            (event && event.detail && event.detail.item && event.detail.item.value) ||
            '';
        setSelectedInstanceValue(String(nextValue || ''));
    };
    const haSelectOptions = window.React.useMemo(
        () => instanceOptions.map((option) => ({ value: option.value, label: option.displayName })),
        [instanceOptions]
    );

    window.React.useEffect(() => {
        if (!haSelectAvailable) {
            return undefined;
        }
        const selectElement = haSelectRef.current;
        if (!selectElement || typeof selectElement.addEventListener !== 'function') {
            return undefined;
        }

        const handleSelected = (event) => {
            const nextValue =
                (event && event.detail && event.detail.value) ||
                (event && event.target && event.target.value) ||
                '';
            setSelectedInstanceValue(String(nextValue || ''));
        };

        selectElement.addEventListener('selected', handleSelected);
        selectElement.addEventListener('change', handleSelected);

        return () => {
            selectElement.removeEventListener('selected', handleSelected);
            selectElement.removeEventListener('change', handleSelected);
        };
    }, [haSelectAvailable]);

    window.React.useEffect(() => {
        if (!haSelectAvailable) {
            return;
        }
        const selectElement = haSelectRef.current;
        if (!selectElement) {
            return;
        }
        selectElement.options = haSelectOptions;
        selectElement.disabled = loadingInstances || instanceOptions.length === 0;
        selectElement.value = selectedInstanceValue || '';
    }, [haSelectAvailable, haSelectOptions, loadingInstances, instanceOptions.length, selectedInstanceValue]);

    const serviceSignature = window.React.useMemo(() => {
        const hassarrServices = hass && hass.services && hass.services[HASSARR_DOMAIN] ? hass.services[HASSARR_DOMAIN] : {};
        return Object.keys(hassarrServices).sort().join('|');
    }, [hass && hass.services && hass.services[HASSARR_DOMAIN]]);

    const fetchHassarrEntries = window.React.useCallback(async () => {
        if (!hass) {
            return [];
        }

        if (typeof hass.callWS === 'function') {
            try {
                const wsEntries = await hass.callWS({ type: 'config_entries/get' });
                if (Array.isArray(wsEntries)) {
                    return wsEntries;
                }
            } catch (wsError) {
                console.warn('Failed to load config entries via callWS(config_entries/get):', wsError);
            }
        }

        if (typeof hass.callApi === 'function') {
            const endpoints = ['config/config_entries/entry', 'config/config_entries'];
            for (const endpoint of endpoints) {
                try {
                    const apiEntries = await hass.callApi('GET', endpoint);
                    if (Array.isArray(apiEntries)) {
                        return apiEntries;
                    }
                } catch (apiError) {
                    console.warn(`Failed to load config entries via callApi(${endpoint}):`, apiError);
                }
            }
        }

        return [];
    }, [hass && hass.callWS, hass && hass.callApi]);

    const discoverInstances = window.React.useCallback(async () => {
        if (!hass) {
            setInstanceOptions([]);
            setSelectedInstanceValue('');
            setInstanceStatus('');
            return;
        }

        const hassarrServices = hass.services && hass.services[HASSARR_DOMAIN] ? hass.services[HASSARR_DOMAIN] : {};
        const serviceNames = Object.keys(hassarrServices);

        if (serviceNames.length === 0) {
            setInstanceOptions([]);
            setSelectedInstanceValue('');
            setInstanceStatus('No Hassarr services found.');
            return;
        }

        const hasBaseMovieService = Boolean(hassarrServices[MOVIE_SERVICE_BASE]);
        const hasBaseTvService = Boolean(hassarrServices[TV_SERVICE_BASE]);

        const capabilityBySuffix = {};
        for (const serviceName of serviceNames) {
            const movieSuffix = extractServiceSuffix(serviceName, MOVIE_SERVICE_BASE);
            if (movieSuffix) {
                capabilityBySuffix[movieSuffix] = capabilityBySuffix[movieSuffix] || { hasMovie: false, hasTv: false };
                capabilityBySuffix[movieSuffix].hasMovie = true;
            }

            const tvSuffix = extractServiceSuffix(serviceName, TV_SERVICE_BASE);
            if (tvSuffix) {
                capabilityBySuffix[tvSuffix] = capabilityBySuffix[tvSuffix] || { hasMovie: false, hasTv: false };
                capabilityBySuffix[tvSuffix].hasTv = true;
            }
        }

        setLoadingInstances(true);
        let discoveredEntries = [];
        let usedFallbackNames = false;

        try {
            discoveredEntries = await fetchHassarrEntries();
        } finally {
            setLoadingInstances(false);
        }

        const hassarrEntries = asArray(discoveredEntries)
            .filter((entry) => entry && entry.domain === HASSARR_DOMAIN)
            .map((entry, index) => {
                const entryId = entry.entry_id || entry.entryId || entry.id;
                if (!entryId || typeof entryId !== 'string') {
                    return null;
                }

                const suffix = entryId.slice(0, 8);
                const capability = capabilityBySuffix[suffix] || { hasMovie: false, hasTv: false };
                const movieService = capability.hasMovie ? `${MOVIE_SERVICE_BASE}_${suffix}` : hasBaseMovieService ? MOVIE_SERVICE_BASE : null;
                const tvService = capability.hasTv ? `${TV_SERVICE_BASE}_${suffix}` : hasBaseTvService ? TV_SERVICE_BASE : null;

                if (!movieService && !tvService) {
                    return null;
                }

                const serviceLabelCandidates = [
                    movieService && hassarrServices[movieService] ? hassarrServices[movieService].name : null,
                    tvService && hassarrServices[tvService] ? hassarrServices[tvService].name : null,
                ];
                const serviceLabel = serviceLabelCandidates
                    .map((label) => cleanServiceInstanceName(label))
                    .find((label) => label && !looksLikeOpaqueId(label));

                const titleCandidates = [
                    entry.title,
                    entry.name,
                    entry.data && entry.data.title,
                    entry.data && entry.data.name,
                    entry.options && entry.options.title,
                    entry.options && entry.options.name,
                    serviceLabel,
                ];
                const title = titleCandidates
                    .map((candidate) => (typeof candidate === 'string' ? candidate.trim() : ''))
                    .find((candidate) => candidate && candidate !== entryId && !looksLikeOpaqueId(candidate));
                return {
                    value: entryId,
                    entry_id: entryId,
                    suffix,
                    title: title || `Hassarr ${suffix}`,
                    displayName: title || `Hassarr ${suffix}`,
                    movieService,
                    tvService,
                    includeInstanceField: movieService === MOVIE_SERVICE_BASE || tvService === TV_SERVICE_BASE,
                };
            })
            .filter(Boolean);

        let options = hassarrEntries;

        if (options.length === 0) {
            const suffixes = Object.keys(capabilityBySuffix);
            if (suffixes.length > 0) {
                usedFallbackNames = true;
                options = suffixes.map((suffix) => {
                    const capability = capabilityBySuffix[suffix] || { hasMovie: false, hasTv: false };
                    return {
                        value: suffix,
                        entry_id: null,
                        suffix,
                        title: `Hassarr ${suffix}`,
                        displayName: `Hassarr ${suffix}`,
                        movieService: capability.hasMovie ? `${MOVIE_SERVICE_BASE}_${suffix}` : hasBaseMovieService ? MOVIE_SERVICE_BASE : null,
                        tvService: capability.hasTv ? `${TV_SERVICE_BASE}_${suffix}` : hasBaseTvService ? TV_SERVICE_BASE : null,
                        includeInstanceField: false,
                    };
                });
            }
        }

        // Last fallback for very old setup where only base services exist
        if (options.length === 0 && (hasBaseMovieService || hasBaseTvService)) {
            options = [
                {
                    value: 'default',
                    entry_id: null,
                    suffix: null,
                    title: 'Default Hassarr',
                    displayName: 'Default Hassarr',
                    movieService: hasBaseMovieService ? MOVIE_SERVICE_BASE : null,
                    tvService: hasBaseTvService ? TV_SERVICE_BASE : null,
                    includeInstanceField: false,
                },
            ];
        }

        // If there are duplicate titles, append short suffix for disambiguation
        const titleCounts = options.reduce((acc, option) => {
            acc[option.title] = (acc[option.title] || 0) + 1;
            return acc;
        }, {});

        const normalizedOptions = options.map((option) => {
            if (titleCounts[option.title] > 1 && option.suffix) {
                return { ...option, displayName: `${option.title} (${option.suffix})` };
            }
            return option;
        });

        setInstanceOptions(normalizedOptions);

        setSelectedInstanceValue((currentValue) => {
            if (!currentValue || !normalizedOptions.find((option) => option.value === currentValue)) {
                return normalizedOptions[0] ? normalizedOptions[0].value : '';
            }
            return currentValue;
        });

        if (normalizedOptions.length === 0) {
            setInstanceStatus('No Radarr/Sonarr Hassarr instances found.');
        } else if (usedFallbackNames) {
            setInstanceStatus('Loaded instances from service names. Entry display names were not available from Home Assistant.');
        } else {
            setInstanceStatus('');
        }
    }, [hass && hass.services && hass.services[HASSARR_DOMAIN], fetchHassarrEntries]);

    window.React.useEffect(() => {
        discoverInstances();
    }, [discoverInstances, serviceSignature]);

    /**
     * Fetches movie/TV show results from TMDB based on the search query.
     * This function is debounced to limit API calls while typing.
     * It handles both movie and TV show results, and for TV shows, it makes
     * an additional call to get the TVDB ID if available.
     *
     * @param {string} query - The search term entered by the user.
     */
    const fetchTmdbResults = window.React.useCallback(
        debounce(async (query) => {
            if (!query.trim()) {
                setSearchResults([]);
                return;
            }
            if (!TMDB_API_KEY) {
                setError('TMDB API Key is not configured. Please add it to your card configuration.');
                return;
            }

            setLoading(true);
            setError(null);
            setMessage('');

            try {
                const searchUrl = `${TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(query)}&api_key=${TMDB_API_KEY}`;
                const searchResponse = await fetch(searchUrl);

                if (!searchResponse.ok) {
                    throw new Error(`TMDB search failed: ${searchResponse.statusText} (${searchResponse.status})`);
                }
                const searchData = await searchResponse.json();

                const results = [];
                for (const item of searchData.results.slice(0, 5)) {
                    if (item.media_type === 'movie') {
                        results.push({
                            id: `tmdb:${item.id}`,
                            title: item.title,
                            release_date: item.release_date,
                            poster_path: item.poster_path,
                            media_type: 'movie',
                            tmdb_id: item.id,
                            vote_average: item.vote_average,
                        });
                    } else if (item.media_type === 'tv') {
                        const externalIdsUrl = `${TMDB_BASE_URL}/tv/${item.id}/external_ids?api_key=${TMDB_API_KEY}`;
                        const externalIdsResponse = await fetch(externalIdsUrl);

                        if (!externalIdsResponse.ok) {
                            console.warn(`Could not fetch external IDs for TV show "${item.name}" (TMDB ID: ${item.id}). Falling back.`);
                            results.push({
                                id: `tmdb:${item.id}`,
                                title: item.name,
                                first_air_date: item.first_air_date,
                                poster_path: item.poster_path,
                                media_type: 'tv',
                                tmdb_id: item.id,
                                vote_average: item.vote_average,
                            });
                            continue;
                        }
                        const externalIdsData = await externalIdsResponse.json();

                        if (externalIdsData.tvdb_id) {
                            results.push({
                                id: `tvdb:${externalIdsData.tvdb_id}`,
                                title: item.name,
                                first_air_date: item.first_air_date,
                                poster_path: item.poster_path,
                                media_type: 'tv',
                                tmdb_id: item.id,
                                vote_average: item.vote_average,
                            });
                        } else {
                            console.warn(`TVDB ID not found for TV show "${item.name}" (TMDB ID: ${item.id}). Falling back.`);
                            results.push({
                                id: `tmdb:${item.id}`,
                                title: item.name,
                                first_air_date: item.first_air_date,
                                poster_path: item.poster_path,
                                media_type: 'tv',
                                tmdb_id: item.id,
                                vote_average: item.vote_average,
                            });
                        }
                    }
                }
                setSearchResults(results);
            } catch (err) {
                setError(`Failed to fetch results: ${err.message}`);
                console.error('TMDB fetch error:', err);
            } finally {
                setLoading(false);
            }
        }, 500),
        [TMDB_API_KEY]
    );

    window.React.useEffect(() => {
        fetchTmdbResults(searchTerm);
    }, [searchTerm, fetchTmdbResults]);

    /**
     * Handles adding content to Radarr/Sonarr through Hassarr.
     *
     * @param {object} item - The selected movie/TV show item from searchResults.
     */
    const handleAddContent = async (item) => {
        if (!hass || typeof hass.callService !== 'function') {
            setError('Home Assistant service call object (_hass) not available. Card might not be properly integrated.');
            return;
        }

        if (!selectedInstance) {
            setError('No Hassarr target instance selected.');
            return;
        }

        const isMovie = item.media_type === 'movie';
        const selectedService = isMovie ? selectedInstance.movieService : selectedInstance.tvService;

        if (!selectedService) {
            setError(`Selected instance "${selectedInstance.displayName}" does not support ${isMovie ? 'movies' : 'TV shows'}.`);
            return;
        }

        const serviceData = { title: item.id };

        // For shared service names, pass entry_id so Hassarr can route to the right config entry.
        if (selectedInstance.includeInstanceField && selectedInstance.entry_id) {
            serviceData.instance = selectedInstance.entry_id;
        }

        setLoading(true);
        setMessage('');
        setError(null);

        try {
            await hass.callService(HASSARR_DOMAIN, selectedService, serviceData);

            if (isMovie) {
                setMessage(`Successfully sent movie "${item.title}" to ${selectedInstance.displayName}!`);
            } else {
                setMessage(`Successfully sent TV show "${item.title}" to ${selectedInstance.displayName}!`);
            }

            setSearchTerm('');
            setSearchResults([]);
        } catch (err) {
            setError(`Failed to add content: ${err.message}. Please check Home Assistant and your Hassarr setup.`);
            console.error('Home Assistant service call or API error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Render the component
    return window.React.createElement(
        'div',
        {
            className: 'card-shell',
        },
        // Custom CSS for Pulsarr-like styling and scrollbar
        window.React.createElement(
            'style',
            null,
            `
                .font-inter { font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
                .p-4 { padding: 16px; }
                .p-3 { padding: 12px; }
                .p-2 { padding: 8px; }
                .w-full { width: 100%; }
                .rounded-lg { border-radius: 8px; }
                .rounded-md { border-radius: 6px; }
                .bg-gray-800 { background-color: #1F2937; }
                .bg-gray-700 { background-color: #374151; }
                .bg-red-900 { background-color: #7F1D1D; }
                .bg-green-900 { background-color: #14532D; }
                .text-gray-100 { color: #F3F4F6; }
                .text-gray-400 { color: #9CA3AF; }
                .text-blue-300 { color: #93C5FD; }
                .text-red-400 { color: #F87171; }
                .text-green-400 { color: #4ADE80; }
                .text-center { text-align: center; }
                .border { border: 1px solid transparent; }
                .border-gray-700 { border-color: #374151; }
                .border-gray-600 { border-color: #4B5563; }
                .shadow-lg { box-shadow: var(--ha-card-box-shadow, 0px 10px 20px rgba(0, 0, 0, 0.25)); }
                .mt-4 { margin-top: 16px; }
                .flex { display: flex; }
                .flex-col { flex-direction: column; }
                .animate-pulse { animation: pulse 1.5s ease-in-out infinite; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }
                .card-shell {
                    padding: 0;
                    background: transparent;
                    border: 0;
                    border-radius: 0;
                    color: var(--primary-text-color);
                    box-shadow: none;
                    font-family: inherit;
                    overflow: visible;
                }
                .card-shell, .card-shell * { box-sizing: border-box; }
                .results-container::-webkit-scrollbar { width: 8px; }
                .results-container::-webkit-scrollbar-track { background: #374151; border-radius: 10px; }
                .results-container::-webkit-scrollbar-thumb { background: #6B7280; border-radius: 10px; }
                .results-container::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
                .header { font-size: 1.5em; font-weight: 500; margin-bottom: 16px; color: var(--primary-text-color); display: flex; align-items: center; gap: 8px; }
                .header ha-icon { color: var(--primary-text-color); }
                .instance-selector { margin-bottom: 16px; }
                .instance-label { display: block; margin-bottom: 8px; font-size: 0.85em; font-weight: 600; color: ${descriptionTextColor}; text-transform: uppercase; letter-spacing: 0.04em; }
                .instance-select {
                    width: 100%;
                    min-height: 56px;
                    padding: 0 12px;
                    border-radius: 10px;
                    border: 1px solid var(--input-outlined-idle-border-color, var(--divider-color, #4B5563));
                    background-color: var(--ha-input-fill-color, var(--secondary-background-color));
                    color: var(--primary-text-color);
                    font: inherit;
                }
                .instance-select:focus {
                    outline: none;
                    border-color: var(--input-outlined-hover-border-color, var(--primary-color, #3B82F6));
                }
                .instance-select-ha {
                    display: block;
                    width: 100%;
                }
                .instance-status { margin-top: 6px; font-size: 0.82em; color: ${descriptionTextColor}; }
                .result-item { display: flex; align-items: flex-start; gap: 16px; padding: 12px; border: 1px solid var(--divider-color, #4B5563); border-radius: 8px; background-color: ${resultItemBackgroundColor}; box-shadow: var(--ha-card-box-shadow, 0px 1px 2px 0px rgba(0,0,0,0.05)); ${disableHoverAnimation ? '' : 'transition: transform 0.2s ease-in-out;'} margin-bottom: 16px; }
                .result-item:last-child { margin-bottom: 0; }
                .result-item:hover { ${disableHoverAnimation ? '' : 'transform: translateY(-3px);'} }
                .poster { width: 80px; height: 120px; border-radius: 6px; object-fit: cover; flex-shrink: 0; box-shadow: var(--ha-card-box-shadow, 0px 2px 4px 0px rgba(0,0,0,0.1)); }
                .details { flex-grow: 1; display: flex; flex-direction: column; }
                .title { font-size: 1.2em; font-weight: bold; margin-bottom: 4px; color: ${titleTextColor}; }
                .media-info { font-size: 0.9em; color: ${descriptionTextColor}; margin-bottom: 8px; }
                .ratings { display: flex; align-items: center; gap: 10px; margin-top: 5px; font-size: 0.85em; color: ${descriptionTextColor}; flex-wrap: nowrap; }
                .rating-item { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
                .title-icon { width: 24px; height: 24px; min-width: 24px; min-height: 24px; fill: var(--primary-color, #4CAF50); }
                .add-button { padding: 10px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background-color 0.3s ease; flex: 1; text-align: center; text-transform: uppercase; background-color: ${addButtonColor}; color: white; margin-top: 10px; }
                .add-button:hover { background-color: var(--success-color-dark, #45a049); }
                .add-button:disabled { opacity: 0.5; cursor: not-allowed; }
                .search-input-container {
                    margin-bottom: 20px;
                    display: flex;
                    align-items: stretch;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    overflow: hidden;
                }
                .search-input {
                    display: block;
                    flex: 1 1 auto;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    margin: 0;
                    padding-top: 16px;
                    padding-bottom: 16px;
                    font-size: 1.1em;
                    border-radius: 10px;
                    border: 1px solid var(--input-outlined-idle-border-color, var(--divider-color, #4B5563));
                    background-color: var(--ha-input-fill-color, var(--secondary-background-color));
                    color: var(--primary-text-color);
                    padding-left: 12px;
                    padding-right: 12px;
                    transition: border-color 0.2s ease-in-out;
                }
                .search-input::placeholder { color: var(--secondary-text-color); }
                .search-input:focus {
                    outline: none;
                    border-color: var(--input-outlined-hover-border-color, var(--primary-color, #3B82F6));
                }
                .status-loading {
                    text-align: center;
                    color: #93C5FD;
                    animation: pulse 1.5s ease-in-out infinite;
                }
                .status-error {
                    text-align: center;
                    color: #F87171;
                    padding: 8px;
                    background-color: #7F1D1D;
                    border-radius: 6px;
                }
                .status-success {
                    text-align: center;
                    color: #4ADE80;
                    padding: 8px;
                    background-color: #14532D;
                    border-radius: 6px;
                }
                .status-empty {
                    text-align: center;
                    color: #9CA3AF;
                    margin-top: 16px;
                }
            `
        ),
        showTitle &&
            window.React.createElement(
                'div',
                { className: 'header' },
                window.React.createElement(
                    'svg',
                    { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 576 512', className: 'title-icon', style: { fill: 'var(--primary-color, #4CAF50)' } },
                    window.React.createElement('path', { d: 'M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.1 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2.3 12.7 3.1 25.4 13.2 32.2s23.3 7.5 34 4.6L288.1 439.5l123.4 69.2c10.7 2.9 21.9 2.6 34-4.6s15.5-19.5 13.2-32.2L438.2 329l116.4-106.9c8.6-8.5 11.3-20.8 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3l-74.3-132.3z' })
                ),
                customTitle
            ),
        window.React.createElement(
            'div',
            { className: 'instance-selector' },
            window.React.createElement('label', { className: 'instance-label' }, targetInstanceSubtitle),
            haSelectAvailable
                ? window.React.createElement(
                      'ha-select',
                      {
                          ref: haSelectRef,
                          className: 'instance-select-ha',
                          'aria-label': targetInstanceSubtitle || 'Select Hassarr target instance',
                      },
                      instanceOptions.length === 0
                          ? window.React.createElement(
                                haSelectItemTag,
                                { value: '', disabled: true },
                                loadingInstances ? 'Loading instances...' : 'No instances found'
                            )
                          : instanceOptions.map((option) =>
                                window.React.createElement(haSelectItemTag, { key: option.value, value: option.value }, option.displayName)
                            )
                  )
                : window.React.createElement(
                      'select',
                      {
                          className: 'instance-select',
                          value: selectedInstanceValue,
                          disabled: loadingInstances || instanceOptions.length === 0,
                          onChange: handleInstanceSelectionChange,
                          'aria-label': targetInstanceSubtitle || 'Select Hassarr target instance',
                      },
                      instanceOptions.length === 0
                          ? window.React.createElement('option', { value: '' }, loadingInstances ? 'Loading instances...' : 'No instances found')
                          : instanceOptions.map((option) =>
                                window.React.createElement('option', { key: option.value, value: option.value }, option.displayName)
                            )
                  ),
            instanceStatus && window.React.createElement('div', { className: 'instance-status' }, instanceStatus)
        ),
        window.React.createElement(
            'div',
            { className: 'search-input-container' },
            window.React.createElement('input', {
                type: 'text',
                placeholder: 'Search for movies or TV shows...',
                className: 'search-input',
                value: searchTerm,
                onChange: (event) => setSearchTerm(event.target.value),
                'aria-label': 'Search media',
            })
        ),
        loading &&
            window.React.createElement(
                'p',
                { className: 'status-loading' },
                'Loading results...'
            ),
        error &&
            window.React.createElement(
                'p',
                { className: 'status-error' },
                error
            ),
        message &&
            window.React.createElement(
                'p',
                { className: 'status-success' },
                message
            ),
        searchResults.length > 0 &&
            window.React.createElement(
                'div',
                { className: 'results-container flex flex-col' },
                searchResults.map((item) =>
                    window.React.createElement(
                        'div',
                        { key: item.id, className: 'result-item' },
                        window.React.createElement('img', {
                            src: item.poster_path ? `${POSTER_BASE_URL}${item.poster_path}` : FALLBACK_POSTER_URL,
                            alt: item.title || 'No Title',
                            className: 'poster',
                            onError: (event) => {
                                event.target.onerror = null;
                                event.target.src = FALLBACK_POSTER_URL;
                            },
                        }),
                        window.React.createElement(
                            'div',
                            { className: 'details' },
                            window.React.createElement(
                                'div',
                                { className: 'title' },
                                item.title
                            ),
                            window.React.createElement(
                                'div',
                                { className: 'media-info' },
                                item.media_type === 'movie' ? 'Movie' : 'TV Show',
                                item.release_date && ` (${new Date(item.release_date).getFullYear()})`,
                                item.first_air_date && ` (${new Date(item.first_air_date).getFullYear()})`
                            ),
                            item.vote_average &&
                                item.vote_average > 0 &&
                                window.React.createElement(
                                    'div',
                                    { className: 'ratings' },
                                    window.React.createElement(
                                        'div',
                                        { className: 'rating-item' },
                                        window.React.createElement(
                                            'svg',
                                            { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 576 512', className: 'w-4 h-4', style: { fill: 'var(--warning-color, #FFC107)' } },
                                            window.React.createElement('path', { d: 'M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.1 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2.3 12.7 3.1 25.4 13.2 32.2s23.3 7.5 34 4.6L288.1 439.5l123.4 69.2c10.7 2.9 21.9 2.6 34-4.6s15.5-19.5 13.2-32.2L438.2 329l116.4-106.9c8.6-8.5 11.3-20.8 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3l-74.3-132.3z' })
                                        ),
                                        `${item.vote_average.toFixed(1)} / 10`
                                    )
                                ),
                            window.React.createElement(
                                'button',
                                {
                                    onClick: () => handleAddContent(item),
                                    className: 'add-button',
                                    disabled: !selectedInstance,
                                    'aria-label': `Add ${item.title}`,
                                },
                                'Add'
                            )
                        )
                    )
                )
            ),
        searchTerm &&
            !loading &&
            searchResults.length === 0 &&
            !error &&
            window.React.createElement(
                'p',
                { className: 'status-empty' },
                `No results found for "${searchTerm}".`
            )
    );
};

export default App;
