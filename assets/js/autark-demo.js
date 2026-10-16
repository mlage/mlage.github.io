import { AutkDb } from '@urban-toolkit/autk-db';

const BBOX = [-43.1368, -22.9090, -43.1000, -22.8800];
const LAYERS = ['surface', 'parks', 'water', 'roads', 'buildings'];
const IC_UFF_BUILDING_ID = 'way/291725373';

const canvas = document.querySelector('#autark-map');
const status = document.querySelector('#autark-map-status');

if (canvas && status) {
    const setStatus = (message, isError = false, note = '') => {
        status.querySelector('.autark-loading-title').textContent = isError ? 'Loading Error' : 'Loading';
        status.querySelector('.autark-loading-text').textContent = message;
        status.querySelector('.autark-loading-note').textContent = note;
        status.classList.toggle('is-error', isError);
        status.hidden = !message;
        canvas.setAttribute('aria-busy', String(Boolean(message) && !isError));
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

            setStatus('Initializing spatial database…');
            const db = new AutkDb();
            await db.init();

            setStatus('Loading Niterói map data…');
            await db.loadOsm({
                pbfFileUrl: 'assets/data/niteroi.osm.pbf',
                queryArea: { bbox: BBOX },
                outputTableName: 'sao_domingos',
                autoLoadLayers: { layers: LAYERS },
            });

            setStatus('Loading Niterói terrain…', false, 'Preparing the elevation dataset.');
            await db.loadGeoTiff({
                geotiffFileUrl: 'assets/data/niteroi-elevation.tif',
                coordinateFormat: 'EPSG:3395',
                outputTableName: 'niteroi_elevation',
            });

            setStatus('Initializing map renderer…');
            const map = new toolkit.AutkMap(canvas, false);
            map.style.setPredefinedStyle('apple');
            // Keep the Apple layer palette; only the canvas background is black.
            const appleColors = Object.fromEntries(
                [...LAYERS, 'points', 'polylines', 'polygons'].map((type) => {
                    const { r, g, b } = map.style.getColor(type);
                    return [type, '#' + [r, g, b].map((value) =>
                        Math.round(value).toString(16).padStart(2, '0'),
                    ).join('')];
                }),
            );
            map.style.setCustomStyle({ ...appleColors, background: '#000000' });
            await map.init();

            setStatus('Building map layers…');
            const layers = db.getLayersMetadata();
            let buildingLayerId = '';
            let icUffBuildingIndex = -1;

            for (const layer of layers) {
                const buildings = layer.type === 'buildings';
                const collection = await db.getLayer(layer.name, buildings ? { osmElements: true } : undefined);
                // Let the loading overlay paint before triangulating each layer.
                await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
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
            map.updateRenderInfo(buildingLayerId, { isPick: true });
            map.setHighlightedIds(buildingLayerId, [icUffBuildingIndex]);
            map.enableTerrainMode(await db.getRaster('niteroi_elevation'), 'band_1');

            // Exact view captured from the interactively adjusted map.
            const capturedOrigin = [-4799918.33, -2602648.74];
            const origin = map.layerManager.origin;
            const offsetX = capturedOrigin[0] - origin[0];
            const offsetY = capturedOrigin[1] - origin[1];

            map.camera.resetCamera(
                [0.5294870734214783, 0.34587764739990234, 0.7746044993400574],
                [-3100.33447265625 + offsetX, -2011.8787841796875 + offsetY, 2038.4637451171875],
                [-3100.98291015625 + offsetX, -2012.3023681640625 + offsetY, 2039.09619140625],
            );
            setStatus('Rendering the map…');
            map.draw();
            // draw() schedules a frame: keep the spinner until it is submitted and completed.
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            await map.renderer.device.queue.onSubmittedWorkDone();
            await new Promise((resolve) => requestAnimationFrame(resolve));
            // Allow the initial view to be calibrated from an interactively adjusted camera.
            window.autarkMap = map;
            setStatus('');
        } catch (error) {
            console.error('Autark map failed to initialize:', error);
            setStatus('The map could not be loaded.', true,
                error instanceof Error ? error.message : 'Check WebGPU support and your network connection.');
        }
    };

    start();
}
