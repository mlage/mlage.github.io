import { AutkDb } from '@urban-toolkit/autk-db';

const BBOX = [-43.1368, -22.9090, -43.1000, -22.8800];
const LAYERS = ['surface', 'parks', 'water', 'roads', 'buildings'];
const IC_UFF_BUILDING_ID = 'way/291725373';

const canvas = document.querySelector('#autark-map');
const status = document.querySelector('#autark-map-status');

if (canvas && status) {
    const setStatus = (message, isError = false) => {
        status.textContent = message;
        status.classList.toggle('is-error', isError);
        status.hidden = !message;
    };

    const start = async () => {
        try {
            if (!navigator.gpu) {
                throw new Error('WebGPU is required to run this demo.');
            }

            const toolkit = window['autk-map'];
            if (!toolkit?.AutkMap) {
                throw new Error('The Autark map library could not be loaded.');
            }

            const db = new AutkDb();
            await db.init();

            setStatus('Reading Niterói PBF…');
            await db.loadOsm({
                pbfFileUrl: 'assets/data/niteroi.osm.pbf',
                queryArea: { bbox: BBOX },
                outputTableName: 'sao_domingos',
                autoLoadLayers: { layers: LAYERS },
            });

            setStatus('Loading Niterói terrain…');
            await db.loadGeoTiff({
                geotiffFileUrl: 'assets/data/niteroi-elevation.tif',
                coordinateFormat: 'EPSG:3395',
                outputTableName: 'niteroi_elevation',
            });

            const map = new toolkit.AutkMap(canvas);
            map.style.setPredefinedStyle('apple');
            await map.init();

            const layers = db.getLayersMetadata();
            let buildingLayerId = '';
            let icUffBuildingIndex = -1;

            for (const layer of layers) {
                const collection = await db.getLayer(layer.name);
                map.loadCollection(layer.name, {
                    collection,
                    type: layer.type,
                    loadConfig: layer.type === 'buildings' ? { buildingsZeroHeight: true } : undefined,
                });
                if (layer.type === 'buildings') {
                    buildingLayerId = layer.name;
                    icUffBuildingIndex = collection.features.findIndex((feature) =>
                        feature.id === IC_UFF_BUILDING_ID ||
                        feature.properties?.name === 'Instituto de Computação',
                    );
                }
            }

            if (icUffBuildingIndex < 0) {
                throw new Error('The Instituto de Computação building could not be found.');
            }
            map.setHighlightedIds(buildingLayerId, [icUffBuildingIndex]);
            map.enableTerrainMode(await db.getRaster('niteroi_elevation'), 'band_1');

            const surface = layers.find((layer) => layer.type === 'surface');
            if (!surface) {
                throw new Error('The São Domingos surface layer could not be loaded.');
            }
            const { minLon: west, minLat: south, maxLon: east, maxLat: north } =
                await db.getBoundingBoxFromLayer(surface.name);
            const origin = map.layerManager.origin;
            const center = [(west + east) / 2 - origin[0], (south + north) / 2 - origin[1], 0];
            const height = Math.max(north - south, (east - west) / (canvas.clientWidth / canvas.clientHeight));
            const distance = height * 1.08 / (2 * Math.tan(map.camera.getFovyRadians() / 2));

            map.camera.resetCamera([0, 1, 0], center, [center[0], center[1], distance]);
            map.draw();
            setStatus('');
        } catch (error) {
            console.error('Autark map failed to initialize:', error);
            setStatus('This map requires WebGPU and network access.', true);
        }
    };

    start();
}
