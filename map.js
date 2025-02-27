let map = L.map('map').setView([30.2672, -97.7431], 12); // Center on Austin, TX

// Add a tile layer (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let markers = []; // Store vehicle markers
let allVehicles = []; // Store all vehicle data
let busRoutesLayer = null; // Store displayed bus routes
let allBusRoutes = {}; // Store all bus routes
let routeFilter = document.getElementById('routeFilter');
let routes = new Set(); // Store unique routes
let isDropdownInitialized = false; // Flag to ensure dropdown is populated once
let signedUrl = ''; // Store the signed URL

// Function to fetch signed URL from the API (this will be called only once)
function fetchSignedUrl() {
    return fetch('https://get-signed-url-1030252149980.us-central1.run.app/')
        .then(response => response.json())
        .then(data => {
            signedUrl = data.signedUrl;  // Store the signed URL globally
            console.log('Signed URL fetched successfully:', signedUrl);
        })
        .catch(error => {
            console.error('Error fetching signed URL:', error);
        });
}

// Function to fetch vehicle positions and update the map
function fetchDataAndUpdate() {
    if (!signedUrl) {
        console.error('Signed URL is not available yet.');
        return;
    }

    const timestamp = Date.now();

    // Use the signed URL to fetch data
    fetch(`${signedUrl}&t=${timestamp}`) // Cache-busting parameter
        .then(response => response.json())
        .then(data => {
            let tableBody = document.getElementById('vehicleTable');

            // Update the allVehicles array with the latest data
            allVehicles = data.entity.map(v => {
                let lat = v.vehicle.position.latitude;
                let lon = v.vehicle.position.longitude;
                let label = v.vehicle.vehicle.label;
                let speed = v.vehicle.position.speed || 0;
                let timestamp = new Date(v.vehicle.timestamp * 1000).toLocaleString();
                let route = v.vehicle.trip ? v.vehicle.trip.routeId : 'N/A';

                // Add the route to the Set (if not already present)
                routes.add(route);
                return { lat, lon, label, speed, timestamp, route, id: v.vehicle.vehicle.id };
            });

            // Populate the dropdown ONLY ONCE using vehicle data
            if (!isDropdownInitialized) {
                // Convert Set to array and sort numerically
                const sortedRoutes = Array.from(routes).sort((a, b) => a - b);

                sortedRoutes.forEach(route => {
                    let option = document.createElement('option');
                    option.value = route;
                    option.textContent = `Route ${route}`;
                    routeFilter.appendChild(option);
                });

                // Set the default filter to Route 20 if it exists
                if (routes.has("20")) {
                    routeFilter.value = "20";
                }

                isDropdownInitialized = true; // Prevent re-initialization
            }

            // Update the map and table
            updateMapAndTable();
        })
        .catch(error => console.error('Error loading vehicle data:', error));
}

fetch('busroutes.geojson')
    .then(response => response.json())
    .then(data => {
        data.features.forEach(feature => {
            let routeId = feature.properties.ROUTE_ID.toString();
            allBusRoutes[routeId] = feature; // Store by route ID
        });

        // Pre-render routes immediately after GeoJSON loads
        updateMapAndTable(); // Add this line
    })
    .catch(error => console.error('Error loading bus routes:', error));

// Function to update both vehicles and routes
function updateMapAndTable() {
    let selectedRoute = routeFilter.value;
    let tableBody = document.getElementById('vehicleTable');

    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    tableBody.innerHTML = '';

    // Display vehicles for selected route
    allVehicles.forEach(v => {
        if (selectedRoute === "all" || v.route === selectedRoute) {
            let marker = L.marker([v.lat, v.lon]).addTo(map)
                .bindPopup(`<b>Vehicle: ${v.label}</b><br>Route: ${v.route}<br>Speed: ${(v.speed * 2.23694).toFixed(1)} mph`);
            markers.push(marker);

            let row = `<tr>
                <td>${v.id}</td>
                <td>${v.route}</td>
                <td>${(v.speed * 2.23694).toFixed(1)}</td>
                <td>${v.timestamp}</td>
            </tr>`;
            tableBody.innerHTML += row;
        }
    });

    // Remove old polyline before adding a new one
    if (busRoutesLayer) {
        map.removeLayer(busRoutesLayer);
    }

    // Display the selected route's polyline
    if (selectedRoute !== "all" && allBusRoutes[selectedRoute]) {
        busRoutesLayer = L.geoJSON(allBusRoutes[selectedRoute], {
            style: function (feature) {
                return {
                    color: "#" + (feature.properties.ROUTECOLOR || "000000"),
                    weight: 3,
                    opacity: 0.7
                };
            },
            onEachFeature: function (feature, layer) {
                layer.bindPopup(`Route: ${feature.properties.ROUTENAME} (${feature.properties.DIRECTION})`);
            }
        }).addTo(map);
    }
}

// Event listener for dropdown change
routeFilter.addEventListener('change', updateMapAndTable);

// Initial fetch and update
fetchSignedUrl().then(() => {
    fetchDataAndUpdate(); // Fetch the data once signed URL is available
});

// Fetch data and update the map every 15 seconds
setInterval(fetchDataAndUpdate, 15000);
