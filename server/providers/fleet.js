/**
 * Traccar Client Telemetry Receiver & Live Fleet API
 * Accepts standard Traccar Client HTTP POST/GET reports and serves live GeoJSON fleet positions and breadcrumb trails.
 */

// In-memory vehicle storage: id -> vehicle data
const fleet = new Map();

// Generate smooth realistic waypoints along Costanera de Asunción (~30 km/h)
// Between -57.635, -25.285 and -57.620, -25.275 (step size ~ 25 meters)
const demoWaypoints = [];
const startLon = -57.6400, startLat = -25.2780;
const endLon = -57.6200, endLat = -25.2860;
const steps = 40; // 40 steps over 2.5 km -> ~60 meters per step
for (let i = 0; i <= steps; i++) {
  const t = i / steps;
  demoWaypoints.push([
    startLon + (endLon - startLon) * t,
    startLat + (endLat - startLat) * t,
    115 // heading east-southeast
  ]);
}
for (let i = steps - 1; i >= 0; i--) {
  const t = i / steps;
  demoWaypoints.push([
    startLon + (endLon - startLon) * t,
    startLat + (endLat - startLat) * t,
    295 // heading back west-northwest
  ]);
}

let demoStep = 0;
const demoHistory = [];

// Realistic slow simulation: advances every 4 seconds (~35 km/h along Costanera)
const simTimer = setInterval(() => {
  demoStep = (demoStep + 1) % demoWaypoints.length;
  const dWp = demoWaypoints[demoStep];
  demoHistory.push([dWp[0], dWp[1]]);
  if (demoHistory.length > 20) demoHistory.shift();

  fleet.set('DEMO-FLOTA-01', {
    id: 'DEMO-FLOTA-01',
    lat: dWp[1],
    lon: dWp[0],
    speedKts: 18.9,
    speedKmh: '35.0',
    bearing: dWp[2],
    altitude: 65,
    batt: '92%',
    chofer: 'Móvil de Demostración (Costanera)',
    vehiculo: 'Camión Reparto · Chapa DEMO 01',
    carga: 'Distribución Urbana',
    lugar: 'Costanera de Asunción',
    history: [...demoHistory],
    isSimulated: true,
    updatedAt: Date.now(),
  });
}, 4000);
simTimer.unref();

function parseParams(queryString, bodyString) {
  const params = new URLSearchParams(queryString || '');
  if (bodyString) {
    try {
      // Try JSON body
      const json = JSON.parse(bodyString);
      for (const [k, v] of Object.entries(json)) {
        if (!params.has(k)) params.set(k, String(v));
      }
    } catch {
      // Try form urlencoded
      const bodyParams = new URLSearchParams(bodyString);
      for (const [k, v] of bodyParams.entries()) {
        if (!params.has(k)) params.set(k, v);
      }
    }
  }
  return params;
}

export function fleetProxy() {
  function install(middlewares) {
    // 1. Traccar Client Endpoint: accepts /api/traccar (GET or POST)
    middlewares.use('/api/traccar', (req, res) => {
      let bodyData = '';
      req.on('data', (chunk) => {
        bodyData += chunk;
      });

      req.on('end', () => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const params = parseParams(url.search, bodyData);

          let id = params.get('id') || params.get('deviceid');
          let lat = parseFloat(params.get('lat') || params.get('latitude'));
          let lon = parseFloat(params.get('lon') || params.get('longitude'));
          let speed = parseFloat(params.get('speed') || '0');
          let bearing = parseFloat(params.get('bearing') || params.get('heading') || '0');
          let altitude = parseFloat(params.get('altitude') || '0');
          let batt = params.get('batt') || params.get('battery');

          if (id && Number.isFinite(lat) && Number.isFinite(lon)) {
            const speedKmh = (speed * 1.852).toFixed(1);
            console.log(`[TRACCAR GPS] Recibido de: ${id} | Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)} | Vel: ${speedKmh} km/h | Bat: ${batt || 'N/A'}`);

            const existing = fleet.get(String(id));
            const history = existing?.history ? [...existing.history] : [];
            history.push([lon, lat]);
            if (history.length > 50) history.shift();

            fleet.set(String(id), {
              id: String(id),
              lat,
              lon,
              speedKts: speed,
              speedKmh,
              bearing: Math.round(bearing),
              altitude: Math.round(altitude),
              batt: batt ? `${Math.round(parseFloat(batt))}%` : '100%',
              chofer: 'Conductor Asignado',
              vehiculo: `Móvil ${id}`,
              carga: 'En Operación',
              lugar: 'GPS en Vivo (Teléfono)',
              history,
              isSimulated: false,
              realUpdateAt: Date.now(),
              updatedAt: Date.now(),
            });
          }

          res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          });
          res.end('OK');
        } catch (err) {
          console.error('[TRACCAR ERROR]:', err);
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Bad Request');
        }
      });
    });

    // 2. Live Fleet GeoJSON Feed: /api/fleet
    middlewares.use('/api/fleet', (req, res) => {
      const now = Date.now();
      const features = [];

      for (const [id, v] of fleet.entries()) {
        const ageSec = Math.round((now - v.updatedAt) / 1000);
        // Retain vehicles seen in the last 24 hours
        if (ageSec > 86400) continue;

        const lastSeen = ageSec < 5 ? 'En vivo ahora' : ageSec < 60 ? `Hace ${ageSec} s` : `Hace ${Math.round(ageSec / 60)} min`;
        const isMoving = parseFloat(v.speedKmh) > 2;

        // Vehicle Point Feature
        features.push({
          id: v.id,
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [v.lon, v.lat],
          },
          properties: {
            name: `${v.id} · ${v.speedKmh} km/h`,
            title: `🚛 ${v.id}`,
            operator: 'Aumenta Flota',
            'marker-symbol': 'car',
            'marker-color': isMoving ? '#00e5ff' : '#ff9100',
            'marker-size': 'large',
            tags: {
              name: `Vehículo ${v.id}`,
              estado: isMoving ? '🟢 En movimiento' : '🟡 Detenido',
              velocidad: `${v.speedKmh} km/h`,
              rumbo: `${v.bearing}°`,
              bateria: v.batt,
              ubicacion_actual: v.lugar || 'En Ruta',
              chofer: v.chofer || 'Asignado',
              vehiculo: v.vehiculo || `Móvil ${v.id}`,
              mision_carga: v.carga || 'General',
              ultima_conexion: lastSeen,
              operator: 'Aumenta Telemetría',
              category: 'Flota Móvil GPS',
            },
          },
        });

        // Vehicle Route Trail Feature (LineString)
        if (v.history && v.history.length >= 2) {
          features.push({
            id: `${v.id}-trail`,
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: v.history,
            },
            properties: {
              name: `Ruta de ${v.id}`,
              title: `Ruta de ${v.id}`,
              stroke: '#00e5ff',
              'stroke-width': 4,
              tags: {
                name: `Recorrido de ${v.id}`,
                longitud_puntos: `${v.history.length} posiciones`,
                operator: 'Aumenta Flota',
              },
            },
          });
        }
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ type: 'FeatureCollection', features }));
    });
  }

  return {
    name: 'fleet-proxy',
    configureServer: (server) => install(server.middlewares),
    configurePreviewServer: (server) => install(server.middlewares),
  };
}
