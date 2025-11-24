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
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
};

/**
 * Main React component for the Home Assistant TMDB Search Card.
 * This component handles searching TMDB, displaying results, and triggering
 * Home Assistant service calls to add content to Radarr/Sonarr.
 *
 * @param {object} props - The component props.
 * @param {object} props.hass - The Home Assistant object, providing access to service calls.
 * @param {object} props.config - The card configuration, including the TMDB API key, Radarr URL, and API key.
 */
const App = ({ hass, config }) => {
    // State variables for managing UI and data, using window.React.useState
    const [searchTerm, setSearchTerm] = window.React.useState('');
    const [searchResults, setSearchResults] = window.React.useState([]);
    const [loading, setLoading] = window.React.useState(false);
    const [error, setError] = window.React.useState(null);
    const [message, setMessage] = window.React.useState(''); // For success/error messages after adding content

    // Retrieve API keys and configuration options from the card configuration
    const TMDB_API_KEY = config.tmdb_api_key;
    const RADARR_URL = config.radarr_url;
    const RADARR_API_KEY = config.radarr_api_key;
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w185';

    // Other configuration options with defaults
    const showTitle = config.show_title !== false;
    const customTitle = config.custom_title || 'Media Search';
    const resultItemBackgroundColor = config.result_item_background_color || 'var(--secondary-background-color, #374151)';
    const disableHoverAnimation = config.disable_hover_animation === true;
    const titleTextColor = config.title_text_color || 'var(--primary-text-color, #F3F4F6)';
    const descriptionTextColor = config.description_text_color || 'var(--secondary-text-color, #D1D5DB)';
    const addButtonColor = config.add_button_color || 'var(--success-color, #4CAF50)';

    /**
     * Fetches movie/TV show results from TMDB based on the search query.
     * This function is debounced to limit API calls while typing.
     * It handles both movie and TV show results, and for TV shows, it makes
     * an additional call to get the TVDB ID if available.
     *
     * @param {string} query - The search term entered by the user.
     */
    const fetchTmdbResults = window.React.useCallback(debounce(async (query) => {
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
                        vote_average: item.vote_average
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
                            vote_average: item.vote_average
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
                            vote_average: item.vote_average
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
                            vote_average: item.vote_average
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
    }, 500), []);

    window.React.useEffect(() => {
        fetchTmdbResults(searchTerm);
    }, [searchTerm, fetchTmdbResults]);

    /**
     * Handles adding content to Radarr/Sonarr and triggers a quality search for movies.
     *
     * @param {object} item - The selected movie/TV show item from searchResults.
     */
    const handleAddContent = async (item) => {
        if (!hass || typeof hass.callService !== 'function') {
            setError('Home Assistant service call object (_hass) not available. Card might not be properly integrated.');
            return;
        }

        setLoading(true);
        setMessage('');
        setError(null);

        try {
            if (item.media_type === 'movie') {
                // 1. Send the command to hassarr to add the movie
                await hass.callService('hassarr', 'add_radarr_movie', { title: item.id });
                setMessage(`Successfully sent movie "${item.title}" to Radarr!`);

                // 2. After a short delay, try to get the movieId from Radarr directly
                // This gives Radarr a moment to process the new movie.
                await new Promise(resolve => setTimeout(resolve, 3000));

                if (!RADARR_URL || !RADARR_API_KEY) {
                    setMessage(`Movie added to Radarr, but unable to trigger quality search. Radarr URL and/or API Key not configured.`);
                    setLoading(false);
                    return;
                }

                // Get Radarr's internal movieId using the TMDB ID
                const movieIdUrl = `${RADARR_URL}/api/v3/movie?tmdbId=${item.tmdb_id}&apikey=${RADARR_API_KEY}`;
                const movieIdResponse = await fetch(movieIdUrl);
                const movieData = await movieIdResponse.json();

                if (movieData.length > 0 && movieData[0].id) {
                    const movieId = movieData[0].id;

                    // Trigger a MoviesSearch command to find better quality
                    const searchCommandUrl = `${RADARR_URL}/api/v3/command?apikey=${RADARR_API_KEY}`;
                    const searchCommandBody = {
                        name: "MoviesSearch",
                        movieIds: [movieId]
                    };

                    const searchResponse = await fetch(searchCommandUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(searchCommandBody)
                    });

                    if (searchResponse.ok) {
                        setMessage(`Movie added to Radarr and quality search successfully triggered!`);
                    } else {
                        setMessage(`Movie added, but failed to trigger quality search: ${searchResponse.statusText}.`);
                        console.error('Radarr search command error:', searchResponse.statusText);
                    }
                } else {
                    setMessage(`Movie added to Radarr, but couldn't find its ID to trigger quality search.`);
                }
            } else if (item.media_type === 'tv') {
                // For TV shows, just send the command to hassarr
                await hass.callService('hassarr', 'add_sonarr_tv_show', { title: item.id });
                setMessage(`Successfully sent TV show "${item.title}" to Sonarr!`);
            }
            setSearchTerm('');
            setSearchResults([]);
        } catch (err) {
            setError(`Failed to add content: ${err.message}. Please check Home Assistant and your Radarr/Sonarr setup.`);
            console.error('Home Assistant service call or API error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Render the component
    return window.React.createElement(
        "div",
        {
            className: "p-4 bg-gray-800 text-gray-100 rounded-lg shadow-lg font-inter border border-gray-700",
        },
        // Custom CSS for Pulsarr-like styling and scrollbar
        window.React.createElement(
            "style",
            null,
            `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                .font-inter { font-family: 'Inter', sans-serif; }
                .results-container::-webkit-scrollbar { width: 8px; }
                .results-container::-webkit-scrollbar-track { background: #374151; border-radius: 10px; }
                .results-container::-webkit-scrollbar-thumb { background: #6B7280; border-radius: 10px; }
                .results-container::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
                .header { font-size: 1.5em; font-weight: bold; margin-bottom: 16px; color: var(--primary-color, #4CAF50); display: flex; align-items: center; gap: 8px; }
                .header ha-icon { color: var(--primary-color, #4CAF50); }
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
                .search-input-container { margin-bottom: 30px; }
                .search-input-container input { width: 100%; padding-top: 16px; padding-bottom: 16px; font-size: 1.1em; }
            `
        ),
        showTitle && window.React.createElement(
            "div",
            { className: "header" },
            window.React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 576 512", className: "title-icon", style: { fill: 'var(--primary-color, #4CAF50)' } },
            window.React.createElement("path", { d: "M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.1 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2.3 12.7 3.1 25.4 13.2 32.2s23.3 7.5 34 4.6L288.1 439.5l123.4 69.2c10.7 2.9 21.9 2.6 34-4.6s15.5-19.5 13.2-32.2L438.2 329l116.4-106.9c8.6-8.5 11.3-20.8 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3l-74.3-132.3z" })
            ),
            customTitle
        ),
        window.React.createElement(
            "div",
            { className: "search-input-container" },
            window.React.createElement("input", {
                type: "text",
                placeholder: "Search for movies or TV shows...",
                className: "w-full p-3 rounded-md bg-gray-700 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out border border-gray-600",
                value: searchTerm,
                onChange: (e) => setSearchTerm(e.target.value),
                "aria-label": "Search media"
            })
        ),
        loading && window.React.createElement(
            "p",
            { className: "text-center text-blue-300 animate-pulse" },
            "Loading results..."
        ),
        error && window.React.createElement(
            "p",
            { className: "text-center text-red-400 p-2 bg-red-900 rounded-md" },
            error
        ),
        message && window.React.createElement(
            "p",
            { className: "text-center text-green-400 p-2 bg-green-900 rounded-md" },
            message
        ),
        searchResults.length > 0 && window.React.createElement(
            "div",
            { className: "results-container flex flex-col" },
            searchResults.map((item) =>
                window.React.createElement(
                    "div",
                    { key: item.id, className: "result-item" },
                    window.React.createElement("img", {
                        src: item.poster_path ? `${POSTER_BASE_URL}${item.poster_path}` : `https://placehold.co/185x278/1F2937/F3F4F6?text=No+Poster`,
                        alt: item.title || 'No Title',
                        className: "poster",
                        onError: (e) => { e.target.onerror = null; e.target.src = `https://placehold.co/185x278/1F2937/F3F4F6?text=No+Poster`; }
                    }),
                    window.React.createElement(
                        "div",
                        { className: "details" },
                        window.React.createElement(
                            "div",
                            { className: "title" },
                            item.title
                        ),
                        window.React.createElement(
                            "div",
                            { className: "media-info" },
                            item.media_type === 'movie' ? 'Movie' : 'TV Show',
                            item.release_date && ` (${new Date(item.release_date).getFullYear()})`,
                            item.first_air_date && ` (${new Date(item.first_air_date).getFullYear()})`
                        ),
                        item.vote_average && item.vote_average > 0 && window.React.createElement(
                            "div",
                            { className: "ratings" },
                            window.React.createElement(
                                "div",
                                { className: "rating-item" },
                                window.React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 576 512", className: "w-4 h-4", style: { fill: 'var(--warning-color, #FFC107)' } },
                                window.React.createElement("path", { d: "M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.1 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2.3 12.7 3.1 25.4 13.2 32.2s23.3 7.5 34 4.6L288.1 439.5l123.4 69.2c10.7 2.9 21.9 2.6 34-4.6s15.5-19.5 13.2-32.2L438.2 329l116.4-106.9c8.6-8.5 11.3-20.8 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3l-74.3-132.3z" })
                                ),
                                `${item.vote_average.toFixed(1)} / 10`
                            )
                        ),
                        window.React.createElement(
                            "button",
                            {
                                onClick: () => handleAddContent(item),
                                className: "add-button",
                                "aria-label": `Add ${item.title}`
                            },
                            item.media_type === 'movie' ? 'Add & Update Quality' : 'Add'
                        )
                    )
                )
            )
        ),
        searchTerm && !loading && searchResults.length === 0 && !error && window.React.createElement(
            "p",
            { className: "text-center text-gray-400 mt-4" },
            `No results found for "${searchTerm}".`
        )
    );
};

export default App;
