/**
 * Traccar Client Telemetry Receiver & Live Fleet API
 * Accepts standard Traccar Client HTTP POST/GET reports and serves live GeoJSON fleet positions.
 */

// In-memory vehicle storage: id -> vehicle data
const fleet = new Map();

// Initial demo vehicle on Ruta PY02 (Caacupé -> Asunción)
let demoStep = 0;
const demoWaypoints = [
  [-57.1400, -25.3850], // Caacupe
  [-57.2000, -25.3780],
  [-57.2600, -25.3700], // Ypacarai
  [-57.3200, -25.3600],
  [-57.3800, -25.3500], // Itaugua
  [-57.4400, -25.3450], // Capiata
  [-57.5097, -25.3408], // San Lorenzo
  [-57.5800, -25.3100],
  [-57.6433, -25.2822], // Asuncion
];

const demoTimer = setInterval(() => {
  demoStep = (demoStep + 1) % demoWaypoints.length;
  const nextCoord = demoWaypoints[demoStep];
  fleet.set('DEMO-CAMION-01', {
    id: 'DEMO-CAMION-01',
    lat: nextCoord[1],
    lon: nextCoord[0],
    speedKts: 32.4,
    speedKmh: '60.0',
    bearing: 275,
    altitude: 120,
    batt: '94%',
    chofer: 'Juan Silguero (Demostración)',
    vehiculo: 'Scania R450 · Chapa AAB 123',
    carga: 'Granos a Puerto Villeta',
    updatedAt: Date.now(),
  });
}, 4000);

export function fleetProxy() {
  function install(middlewares) {
    // 1. Traccar Client Endpoint: accepts /api/traccar
    middlewares.use('/api/traccar', (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const params = url.searchParams;

        let id = params.get('id') || params.get('deviceid');
        let lat = parseFloat(params.get('lat') || params.get('latitude'));
        let lon = parseFloat(params.get('lon') || params.get('longitude'));
        let speed = parseFloat(params.get('speed') || '0'); // in knots
        let bearing = parseFloat(params.get('bearing') || params.get('heading') || '0');
        let altitude = parseFloat(params.get('altitude') || '0');
        let batt = params.get('batt') || params.get('battery');

        if (id && Number.isFinite(lat) && Number.isFinite(lon)) {
          const speedKmh = (speed * 1.852).toFixed(1);
          fleet.set(String(id), {
            id: String(id),
            lat,
            lon,
            speedKts: speed,
            speedKmh,
            bearing: Math.round(bearing),
            altitude: Math.round(altitude),
            batt: batt ? `${Math.round(parseFloat(batt))}%` : 'N/A',
            chofer: 'Conductor Asignado',
            vehiculo: `Móvil ${id}`,
            carga: 'En Tránsito',
            updatedAt: Date.now(),
          });
        }

        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        });
        res.end('OK');
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
      }
    });

    // 2. Live Fleet GeoJSON Feed: /api/fleet
    middlewares.use('/api/fleet', (req, res) => {
      const now = Date.now();
      const features = [];

      for (const [id, v] of fleet.entries()) {
        const ageSec = Math.round((now - v.updatedAt) / 1000);
        // Retain vehicles seen in the last 24 hours
        if (ageSec > 86400) continue;

        const lastSeen = ageSec < 60 ? `Hace ${ageSec} s` : `Hace ${Math.round(ageSec / 60)} min`;
        const isMoving = parseFloat(v.speedKmh) > 2;

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
            operator: 'Aumenta Fleet Tracking',
            tags: {
              name: `Vehículo ${v.id}`,
              estado: isMoving ? '🟢 En movimiento' : '🟡 Detenido',
              velocidad: `${v.speedKmh} km/h`,
              bateria: v.batt,
              rumbo: `${v.bearing}°`,
              chofer: v.chofer || 'Asignado',
              vehiculo: v.vehiculo || `Móvil ${v.id}`,
              carga_mision: v.carga || 'General',
              ultima_conexion: lastSeen,
              operator: 'Aumenta Flota',
              category: 'Telemetría GPS en Vivo',
            },
          },
        });
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
demoTimer.unref();
