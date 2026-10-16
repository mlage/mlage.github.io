(() => {
    const canvas = document.querySelector('#autark-map');
    const status = document.querySelector('#autark-map-status');

    if (!canvas || !status) return;

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

            const response = await fetch('assets/data/sao-domingos-autark.json');
            if (!response.ok) {
                throw new Error('The São Domingos map data could not be loaded.');
            }
            const data = await response.json();
            const map = new toolkit.AutkMap(canvas, false);

            map.style.setPredefinedStyle('poster');
            await map.init();
            map.loadCollection('surface', { collection: data.surface, type: 'surface' });
            map.loadCollection('buildings', {
                collection: data.buildings,
                type: 'buildings',
                loadConfig: { buildingsZeroHeight: true },
            });
            map.loadCollection('roads', { collection: data.roads, type: 'roads' });
            map.loadCollection('ic-uff', { collection: data.ic, type: 'points' });
            map.updateRenderInfo('roads', { renderInfo: { polylinesWidth: 8 } });
            map.updateRenderInfo('ic-uff', { renderInfo: { pointSize: 30 } });

            const origin = map.layerManager.origin;
            const center = [
                (data.bbox.west + data.bbox.east) / 2 - origin[0],
                (data.bbox.south + data.bbox.north) / 2 - origin[1],
                0,
            ];
            const aspect = canvas.clientWidth / canvas.clientHeight;
            const height = Math.max(
                data.bbox.north - data.bbox.south,
                (data.bbox.east - data.bbox.west) / aspect,
            );
            const distance = height * 1.08 / (2 * Math.tan(map.camera.getFovyRadians() / 2));

            map.camera.resetCamera([0, 1, 0], center, [center[0], center[1], distance]);
            map.draw();
            setStatus('');
        } catch (error) {
            console.error('Autark map failed to initialize:', error);
            setStatus('This interactive map requires a WebGPU-enabled browser.', true);
        }
    };

    start();
})();
