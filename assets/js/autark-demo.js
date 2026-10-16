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
                const buildings = layer.type === 'buildings';
                const collection = await db.getLayer(layer.name, buildings ? { osmElements: true } : undefined);
                map.loadCollection(layer.name, {
                    collection,
                    type: layer.type,
                    loadConfig: buildings ? { buildingsZeroHeight: true } : undefined,
                });
                if (buildings) {
                    buildingLayerId = layer.name;
                    icUffBuildingIndex = collection.features.findIndex((feature) =>
                        feature.id === IC_UFF_BUILDING_ID,
                    );
                }
            }

            if (icUffBuildingIndex < 0) {
                throw new Error('The Instituto de Computação building could not be found.');
            }
            map.setHighlightedIds(buildingLayerId, [icUffBuildingIndex]);
            map.enableTerrainMode(await db.getRaster('niteroi_elevation'), 'band_1');

            // Focus on Gragoatá / Praia Vermelha, not the entire OSM selection.
            // Target coordinates use the database's EPSG:3395 projection.
            const origin = map.layerManager.origin;
            const center = [-4801265.298 - origin[0], -2603645.938 - origin[1], 0];
            const height = Math.max(1450, 1900 / (canvas.clientWidth / canvas.clientHeight));
            const distance = height / (2 * Math.tan(map.camera.getFovyRadians() / 2));
            const bearing = 25 * Math.PI / 180;
            const tilt = 25 * Math.PI / 180;
            const north = [-Math.sin(bearing), Math.cos(bearing)];

            map.camera.resetCamera(
                [north[0] * Math.cos(tilt), north[1] * Math.cos(tilt), Math.sin(tilt)],
                center,
                [
                    center[0] - north[0] * distance * Math.sin(tilt),
                    center[1] - north[1] * distance * Math.sin(tilt),
                    distance * Math.cos(tilt),
                ],
            );
            map.draw();
            setStatus('');
        } catch (error) {
            console.error('Autark map failed to initialize:', error);
            setStatus('This map requires WebGPU and network access.', true);
        }
    };

    start();
}
