// Configuration object for magic numbers and URLs
const config = {
    MAP_CENTER: [30.2672, -97.7431],
    ZOOM_LEVEL: 12,
    TILE_LAYER_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    TILE_LAYER_ATTRIBUTION: '© OpenStreetMap contributors',
    REFRESH_INTERVAL: 15000,             // Milliseconds for data refresh
    SPEED_CONVERSION_FACTOR: 2.23694,      // Conversion factor from m/s to mph
    DEFAULT_ROUTE: "20"                    // Default route to select if available
};

// Initialize the map using config values
const map = L.map('map').setView(config.MAP_CENTER, config.ZOOM_LEVEL);
L.tileLayer(config.TILE_LAYER_URL, {
    attribution: config.TILE_LAYER_ATTRIBUTION
}).addTo(map);

// Application state encapsulated in an object
const state = {
    markers: [],
    vehicles: [],
    busRoutesLayer: null,
    allBusRoutesLayer: null,
    busRoutes: {},
    routes: new Set(),
    signedUrl: '',
    dropdownInitialized: false,
};

const routeFilter = document.getElementById('routeFilter');
const vehicleTable = document.getElementById('vehicleTable');

// Utility: Clean route names by removing duplicate route ID prefixes
const cleanRouteName = rawName =>
    typeof rawName === 'string' ? rawName.replace(/^\d+-/, '') : rawName;

// Fetch the signed URL from the API using async/await
async function fetchSignedUrl() {
    try {
        const response = await fetch('https://get-signed-url-1030252149980.us-central1.run.app/');
        const data = await response.json();
        state.signedUrl = data.signedUrl;
        console.log('Signed URL fetched successfully:', state.signedUrl);
    } catch (error) {
        console.error('Error fetching signed URL:', error);
    }
}

// Update the dropdown list with unique routes
function updateDropdown() {
    routeFilter.innerHTML = '';

    // Add "All Routes" option first
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Routes';
    routeFilter.appendChild(allOption);

    // Sort and add unique routes to the dropdown
    const sortedRoutes = Array.from(state.routes).sort((a, b) => a - b);
    sortedRoutes.forEach(route => {
        const option = document.createElement('option');
        option.value = route;
        const rawName = state.busRoutes[route]?.properties.ROUTENAME || '';
        const cleanedName = cleanRouteName(rawName);
        option.textContent = cleanedName ? `Route ${route} - ${cleanedName}` : `Route ${route}`;
        routeFilter.appendChild(option);
    });

    // Optionally, select a default route if available
    if (state.routes.has(config.DEFAULT_ROUTE)) {
        routeFilter.value = config.DEFAULT_ROUTE;
    }
    state.dropdownInitialized = true;
}

// Fetch vehicle data and update the map and table
async function fetchDataAndUpdate() {
    if (!state.signedUrl) {
        console.error('Signed URL is not available yet.');
        return;
    }

    const timestamp = Date.now();
    try {
        const response = await fetch(`${state.signedUrl}&t=${timestamp}`);
        const data = await response.json();

        state.vehicles = data.entity.map(v => {
            const { latitude: lat, longitude: lon, speed } = v.vehicle.position;
            const { label, id } = v.vehicle.vehicle;
            const timestampFormatted = new Date(v.vehicle.timestamp * 1000).toLocaleString();
            const route = v.vehicle.trip ? v.vehicle.trip.routeId : 'N/A';

            state.routes.add(route);
            return { lat, lon, label, speed: speed || 0, timestamp: timestampFormatted, route, id };
        });

        if (!state.dropdownInitialized) {
            updateDropdown();
        }

        updateMapAndTable();
    } catch (error) {
        console.error('Error loading vehicle data:', error);
    }
}

// Load bus routes GeoJSON and update route names in the dropdown when available
async function loadBusRoutes() {
    try {
        const response = await fetch('busroutes.geojson');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        data.features.forEach(feature => {
            try {
                const routeId = feature.properties.ROUTE_ID?.toString();
                if (!routeId) throw new Error('Missing ROUTE_ID in feature');

                state.busRoutes[routeId] = feature;

                // Update the corresponding dropdown option if it already exists
                const existingOption = routeFilter.querySelector(`option[value="${routeId}"]`);
                if (existingOption) {
                    const rawName = feature.properties.ROUTENAME || '';
                    const cleanedName = cleanRouteName(rawName);
                    existingOption.textContent = cleanedName ? `Route ${routeId} - ${cleanedName}` : `Route ${routeId}`;
                }
            } catch (e) {
                console.error('Error processing GeoJSON feature:', e);
            }
        });
    } catch (error) {
        console.error('Error loading bus routes:', error);
        // Optionally show user notification here
    }
}

// Update the map markers, table, and bus route layers based on the selected route
function updateMapAndTable() {
    const selectedRoute = routeFilter.value;

    // Clear existing markers and table rows
    state.markers.forEach(marker => map.removeLayer(marker));
    state.markers = [];
    vehicleTable.innerHTML = '';

    // Add markers and table rows for vehicles matching the selected route
    state.vehicles.forEach(v => {
        if (selectedRoute === "all" || v.route === selectedRoute) {
            const marker = L.marker([v.lat, v.lon]).addTo(map)
                .bindPopup(`<b>Vehicle: ${v.label}</b><br>Route: ${v.route}<br>Speed: ${(v.speed * config.SPEED_CONVERSION_FACTOR).toFixed(1)} mph`);
            state.markers.push(marker);

            vehicleTable.innerHTML += `
          <tr>
            <td>${v.id}</td>
            <td>${v.route}</td>
            <td>${(v.speed * config.SPEED_CONVERSION_FACTOR).toFixed(1)}</td>
            <td>${v.timestamp}</td>
          </tr>`;
        }
    });

    // Remove existing bus route layers if any
    if (state.busRoutesLayer) {
        map.removeLayer(state.busRoutesLayer);
        state.busRoutesLayer = null;
    }
    if (state.allBusRoutesLayer) {
        map.removeLayer(state.allBusRoutesLayer);
        state.allBusRoutesLayer = null;
    }

    // Add bus routes layer based on the selected route
    if (selectedRoute === "all") {
        state.allBusRoutesLayer = L.geoJSON({
            type: "FeatureCollection",
            features: Object.values(state.busRoutes)
        }, {
            style: feature => ({
                color: "#" + (feature.properties.ROUTECOLOR || "ffffff"),
                weight: 3,
                opacity: 0.5,
            }),
            onEachFeature: (feature, layer) => {
                layer.bindPopup(`Route: ${feature.properties.ROUTENAME} (${feature.properties.DIRECTION})`);
                layer.on('mouseover', function () {
                    this.setStyle({ weight: 5, opacity: 1 });
                    this.bringToFront();
                });
                layer.on('mouseout', function () {
                    this.setStyle({ weight: 3, opacity: 0.5, color: this.options.color });
                });
            }
        }).addTo(map);
    } else if (state.busRoutes[selectedRoute]) {
        state.busRoutesLayer = L.geoJSON(state.busRoutes[selectedRoute], {
            style: feature => ({
                color: "#" + (feature.properties.ROUTECOLOR || "000000"),
                weight: 4,
                opacity: 0.7,
            }),
            onEachFeature: (feature, layer) => {
                layer.bindPopup(`Route: ${feature.properties.ROUTENAME} (${feature.properties.DIRECTION})`);
            }
        }).addTo(map);
    }
}

// Listen for route filter changes
routeFilter.addEventListener('change', updateMapAndTable);

// Initialize the application, then update periodically with updated position data
async function init() {
    await Promise.all([
        fetchSignedUrl(),
        loadBusRoutes()
    ]);
    await fetchDataAndUpdate();
    setInterval(fetchDataAndUpdate, config.REFRESH_INTERVAL);
}

init();
