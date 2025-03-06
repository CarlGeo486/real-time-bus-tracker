let map = L.map('map').setView([30.2672, -97.7431], 12); // Center on Austin, TX

// Add a tile layer (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let markers = []; // Store vehicle markers
let allVehicles = []; // Store all vehicle data
let busRoutesLayer = null; // Store displayed bus routes
let allBusRoutesLayer = null; // Layer for all routes when "all" is selected
let allBusRoutes = {}; // Store all bus routes
let routeFilter = document.getElementById('routeFilter');
let routes = new Set(); // Store unique routes
let isDropdownInitialized = false; // Flag to ensure dropdown is populated once
let signedUrl = ''; // Store the signed URL

// Fetch signed URL from API
function fetchSignedUrl() {
    return fetch('https://get-signed-url-1030252149980.us-central1.run.app/')
        .then(response => response.json())
        .then(data => {
            signedUrl = data.signedUrl; // Store globally
            console.log('Signed URL fetched successfully:', signedUrl);
        })
        .catch(error => console.error('Error fetching signed URL:', error));
}
// Clean duplicate route ID from displayed names
function cleanRouteName(rawName) {
    try {
        return typeof rawName === 'string' 
            ? rawName.replace(/^\d+-/, '') 
            : rawName;
    } catch (e) {
        console.error('Error cleaning route name:', e);
        return rawName;
    }
}

// Fetch vehicle positions and update the map
function fetchDataAndUpdate() {
    if (!signedUrl) {
        console.error('Signed URL is not available yet.');
        return;
    }

    const timestamp = Date.now();

    fetch(`${signedUrl}&t=${timestamp}`)
        .then(response => response.json())
        .then(data => {
            let tableBody = document.getElementById('vehicleTable');
            allVehicles = data.entity.map(v => {
                let lat = v.vehicle.position.latitude;
                let lon = v.vehicle.position.longitude;
                let label = v.vehicle.vehicle.label;
                let speed = v.vehicle.position.speed || 0;
                let timestamp = new Date(v.vehicle.timestamp * 1000).toLocaleString();
                let route = v.vehicle.trip ? v.vehicle.trip.routeId : 'N/A';

                routes.add(route);
                return { lat, lon, label, speed, timestamp, route, id: v.vehicle.vehicle.id };
            });

            if (!isDropdownInitialized) {
                const sortedRoutes = Array.from(routes).sort((a, b) => a - b);
                routeFilter.innerHTML = ''; // Clear existing options
                
                // Create "All" option first
                const allOption = document.createElement('option');
                allOption.value = "all";
                allOption.textContent = "All Routes";
                routeFilter.appendChild(allOption);
            
                sortedRoutes.forEach(route => {
                    let option = document.createElement('option');
                    option.value = route;
                    
                    const rawName = allBusRoutes[route]?.properties.ROUTENAME || '';
                    // Clean the route name with error handling
                    const cleanedName = cleanRouteName(rawName);
                    option.textContent = cleanedName 
                        ? `Route ${route} - ${cleanedName}`
                        : `Route ${route}`;
                
                    routeFilter.appendChild(option);
                });
                
            
                // Update the dropdown again after GeoJSON loads
                if (routes.has("20")) {
                    routeFilter.value = "20";
                }
            
                isDropdownInitialized = true;
            }

            updateMapAndTable();
        })
        .catch(error => console.error('Error loading vehicle data:', error));
}

// Load bus routes GeoJSON
fetch('busroutes.geojson')
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        data.features.forEach(feature => {
            try {
                let routeId = feature.properties.ROUTE_ID?.toString();
                if (!routeId) throw new Error('Missing ROUTE_ID in feature');
                
                allBusRoutes[routeId] = feature;
                
                const existingOption = routeFilter.querySelector(`option[value="${routeId}"]`);
                if (existingOption) {
                    const rawName = feature.properties.ROUTENAME || '';
                    const cleanedName = cleanRouteName(rawName);
                    existingOption.textContent = cleanedName 
                        ? `Route ${routeId} - ${cleanedName}`
                        : `Route ${routeId}`;
                }
            } catch (e) {
                console.error('Error processing GeoJSON feature:', e);
            }
        });
    })
    .catch(error => {
        console.error('Error loading bus routes:', error);
        // Consider showing user notification here
    });


// Update map and table based on selected route
function updateMapAndTable() {
    let selectedRoute = routeFilter.value;
    let tableBody = document.getElementById('vehicleTable');

    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    tableBody.innerHTML = '';

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
    if (busRoutesLayer) {
        map.removeLayer(busRoutesLayer);
        busRoutesLayer = null;
    }

    if (allBusRoutesLayer) {
        map.removeLayer(allBusRoutesLayer);
        allBusRoutesLayer = null;
    }

    if (selectedRoute === "all") {
        allBusRoutesLayer = L.geoJSON({
            type: "FeatureCollection",
            features: Object.values(allBusRoutes)
        }, {
            style: function (feature) {
                return {
                    color: "#" + (feature.properties.ROUTECOLOR || "ffffff"),
                    weight: 3,
                    opacity: 0.5
                };
            },
            onEachFeature: function (feature, layer) {
                layer.bindPopup(`Route: ${feature.properties.ROUTENAME} (${feature.properties.DIRECTION})`);
                
                // Add hover effects
                layer.on('mouseover', function(e) {
                    this.setStyle({
                        weight: 5, // Thicker line on hover
                        opacity: 1, // Full opacity
                    });
                    this.bringToFront(); // Bring to top
                });
                
                layer.on('mouseout', function(e) {
                    this.setStyle({
                        weight: 3, // Revert to original weight
                        opacity: 0.5, // Revert to original opacity
                        color: this.options.color
                    });
                });
            }
        }).addTo(map);
    } else if (allBusRoutes[selectedRoute]) {
        busRoutesLayer = L.geoJSON(allBusRoutes[selectedRoute], {
            style: function (feature) {
                return {
                    color: "#" + (feature.properties.ROUTECOLOR || "000000"),
                    weight: 4,
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
