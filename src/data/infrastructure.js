import { createLocalGeoJsonLayer } from './localGeojsonCore.js';
import { INFRASTRUCTURE_DATA_URLS } from '../sources/infrastructureData.js';

/**
 * Create fresh datacenter and dam layers without starting or loading them.
 * @param {object} services Caller-owned context, overlay and render operations.
 * @returns {object[]} Datacenters then dams, with stable standalone identities.
 */
export function createInfrastructureLayers(services) {
  const datacentersUrl = INFRASTRUCTURE_DATA_URLS['local-datacenters'];
  const damsUrl = INFRASTRUCTURE_DATA_URLS['local-dams'];
  const datacenters = createLocalGeoJsonLayer(
    {
      id: 'local-datacenters',
      url: datacentersUrl,
      name: 'Datacenters',
      color: '#00ffff', // Cyan
      icon: '▣',
      source: 'Local',
      osmDerived: true,
      labels: true,
      labelMax: 700,
      labelGridPx: 138,
    },
    services,
  );

  const dams = createLocalGeoJsonLayer(
    {
      id: 'local-dams',
      url: damsUrl,
      name: 'Dams',
      color: '#0088ff', // Blue
      icon: '▰',
      source: 'OpenStreetMap / OpenInfraMap',
      osmDerived: true,
      labels: true,
      labelMax: 900,
      labelGridPx: 132,
    },
    services,
  );

  const paraguayUrl = INFRASTRUCTURE_DATA_URLS['paraguay-infraestructura'];
  const paraguay = createLocalGeoJsonLayer(
    {
      id: 'paraguay-infraestructura',
      url: paraguayUrl,
      name: 'Paraguay: Hidrovía y Puertos',
      color: '#00e5ff',
      icon: '⚓',
      source: 'DMH / ANNP / MADES',
      osmDerived: false,
      labels: true,
      labelMax: 900,
      labelGridPx: 64,
    },
    services,
  );

  const energiaUrl = INFRASTRUCTURE_DATA_URLS['paraguay-energia'];
  const paraguayEnergia = createLocalGeoJsonLayer(
    {
      id: 'paraguay-energia',
      url: energiaUrl,
      name: 'Paraguay: Red Eléctrica 500 kV y ANDE',
      color: '#ffea00',
      icon: '⚡',
      source: 'ANDE / Itaipú / EBY',
      osmDerived: false,
      labels: true,
      labelMax: 900,
      labelGridPx: 64,
    },
    services,
  );

  const aerodromosUrl = INFRASTRUCTURE_DATA_URLS['paraguay-aerodromos'];
  const paraguayAerodromos = createLocalGeoJsonLayer(
    {
      id: 'paraguay-aerodromos',
      url: aerodromosUrl,
      name: 'Paraguay: Aeródromos y Pistas',
      color: '#ff9100',
      icon: '🛫',
      source: 'DINAC',
      osmDerived: false,
      labels: true,
      labelMax: 900,
      labelGridPx: 64,
    },
    services,
  );

  const flota = createLocalGeoJsonLayer(
    {
      id: 'aumenta-flota',
      url: '/api/fleet',
      name: 'Flota Aumenta (GPS en Vivo)',
      color: '#00e5ff',
      icon: '🚛',
      source: 'Telemetría Móvil',
      osmDerived: false,
      labels: true,
      labelMax: 900,
      labelGridPx: 48,
      updateInterval: 3000,
      loadFeatures: async () => {
        try {
          const res = await fetch('/api/fleet');
          if (res.ok) {
            const data = await res.json();
            return data.features || [];
          }
        } catch {}
        return [];
      },
    },
    services,
  );

  return [datacenters, dams, paraguay, paraguayEnergia, paraguayAerodromos, flota];
}
