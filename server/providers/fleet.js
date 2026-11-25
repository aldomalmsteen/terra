/**
 * Traccar Client Telemetry Receiver & Live Fleet API
 * Accepts standard Traccar Client HTTP POST/GET reports and serves live GeoJSON fleet positions and breadcrumb trails.
 */

// In-memory vehicle storage: id -> vehicle data
const fleet = new Map();

// Waypoints for CAMION-ALDO in Asunción (Av. Mariscal López / Villa Morra / Centro)
const aldoWaypoints = [
  [-57.6350, -25.2950, 45, 'Av. Mariscal López'],
  [-57.6300, -25.2930, 48, 'Av. Mariscal López y Kubitschek'],
  [-57.6250, -25.2910, 52, 'Av. Mariscal López y Choferes'],
  [-57.6180, -25.2890, 55, 'Av. Mariscal López y San Martín'],
  [-57.6100, -25.2860, 50, 'Paseo La Galería / Villa Morra'],
  [-57.6180, -25.2890, 230, 'Retorno hacia Centro'],
  [-57.6250, -25.2910, 230, 'Av. Mariscal López'],
  [-57.6300, -25.2930, 230, 'Aproximación Centro Histórico'],
  [-57.6350, -25.2950, 230, 'Costanera de Asunción'],
];
let aldoStep = 0;
const aldoHistory = [];

// Waypoints for DEMO-CAMION-01 along Ruta PY02 (Caacupé -> Asunción)
const demoWaypoints = [
  [-57.1400, -25.3850, 275, 'Caacupé (Ruta PY02)'],
  [-57.2000, -25.3780, 275, 'Bajada Cerro Caacupé'],
  [-57.2600, -25.3700, 275, 'Ypacaraí'],
  [-57.3200, -25.3600, 275, 'Peaje Ypacaraí'],
  [-57.3800, -25.3500, 275, 'Itauguá'],
  [-57.4400, -25.3450, 275, 'Capiatá'],
  [-57.5097, -25.3408, 275, 'San Lorenzo'],
  [-57.5800, -25.3100, 290, 'Fernando de la Mora'],
  [-57.6433, -25.2822, 310, 'Puerto de Asunción'],
];
let demoStep = 0;
const demoHistory = [];

let aldoIsRealDevice = false;

// Auto-advance simulated movements every 3 seconds
const simTimer = setInterval(() => {
  // 1. Advance DEMO-CAMION-01
  demoStep = (demoStep + 1) % demoWaypoints.length;
  const dWp = demoWaypoints[demoStep];
  demoHistory.push([dWp[0], dWp[1]]);
  if (demoHistory.length > 25) demoHistory.shift();

  fleet.set('DEMO-CAMION-01', {
    id: 'DEMO-CAMION-01',
    lat: dWp[1],
    lon: dWp[0],
    speedKts: 32.4,
    speedKmh: '60.0',
    bearing: dWp[2],
    altitude: 120,
    batt: '94%',
    chofer: 'Juan Silguero (Ruta PY02)',
    vehiculo: 'Scania R450 · Chapa AAB 123',
    carga: 'Granos a Puerto Villeta',
    lugar: dWp[3],
    history: [...demoHistory],
    updatedAt: Date.now(),
  });

  // 2. Advance CAMION-ALDO if no real phone is actively transmitting
  const realAge = Date.now() - (fleet.get('CAMION-ALDO')?.realUpdateAt || 0);
  if (!aldoIsRealDevice || realAge > 45000) {
    aldoStep = (aldoStep + 1) % aldoWaypoints.length;
    const aWp = aldoWaypoints[aldoStep];
    aldoHistory.push([aWp[0], aWp[1]]);
    if (aldoHistory.length > 25) aldoHistory.shift();

    fleet.set('CAMION-ALDO', {
      id: 'CAMION-ALDO',
      lat: aWp[1],
      lon: aWp[0],
      speedKts: 22.0,
      speedKmh: '42.0',
      bearing: aWp[2],
      altitude: 95,
      batt: '88%',
      chofer: 'Aldo (Móvil en Ruta)',
      vehiculo: 'Camioneta Flota · Chapa ALD 001',
      carga: 'Supervisión de Carga',
      lugar: aWp[3],
      history: [...aldoHistory],
      updatedAt: Date.now(),
    });
  }
}, 3000);
simTimer.unref();

export function fleetProxy() {
  function install(middlewares) {
    // 1. Traccar Client Endpoint: accepts /api/traccar (GET or POST)
    middlewares.use('/api/traccar', (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const params = url.searchParams;

        let id = params.get('id') || params.get('deviceid');
        let lat = parseFloat(params.get('lat') || params.get('latitude'));
        let lon = parseFloat(params.get('lon') || params.get('longitude'));
        let speed = parseFloat(params.get('speed') || '0');
        let bearing = parseFloat(params.get('bearing') || params.get('heading') || '0');
        let altitude = parseFloat(params.get('altitude') || '0');
        let batt = params.get('batt') || params.get('battery');

        if (id && Number.isFinite(lat) && Number.isFinite(lon)) {
          const speedKmh = (speed * 1.852).toFixed(1);
          if (id === 'CAMION-ALDO' || id.toLowerCase().includes('aldo')) {
            aldoIsRealDevice = true;
          }

          const existing = fleet.get(String(id));
          const history = existing?.history ? [...existing.history] : [];
          history.push([lon, lat]);
          if (history.length > 40) history.shift();

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
