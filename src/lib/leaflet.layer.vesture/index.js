import L from 'leaflet';
import './vesture.css';
import '~/lib/leaflet.layer.geojson-ajax';

class VesturesStastiLayer extends L.Layer {
    options = {
        smZoom: 14,
        pagastiZoom: 12,
    };

    constructor(baseUrl, options) {
        super();

        L.setOptions(this, options);

        this.baseUrl = baseUrl;

        this.datasetTemplates = {
            point: {
                minZoom: this.options.smZoom + 1,
                maxZoom: 24,
            },
            small: {
                minZoom: this.options.pagastiZoom + 1,
                maxZoom: this.options.smZoom,
            },
        };

        this.chunks = [];
        this.datasets = [];

        this.options.defstyle = {
            color: 'red',
            weight: 2.0,
            fillOpacity: 0.01,
            opacity: 0.5,
        };

        this.options.hoverstyle = {
            color: 'blue',
            weight: 2.0,
            fillOpacity: 0.05,
            opacity: 0.5,
        };

        this.chunksLayer = new L.Layer.GeoJSONAjax(baseUrl + 'chunks.json', {
            onEachFeature: this._setChunksZoom.bind(this),
            ...{
                color: 'black',
                weight: 1.0,
                fillOpacity: 0,
                opacity: 0.6,
            },
        });

        this.pagastiLayer = new L.Layer.GeoJSONAjax(baseUrl + 'pagasti.json', {
            onEachFeature: this._setPagastiZoom.bind(this),
            ...this.options.defstyle,
        });

        this.pagastiLayer.setStyle(this.options.defstyle);
    }

    _makePopupText(geojsonPoint, baseUrl) {
        // VEST_AINAV
        const ainava = {
            'MV.1.': 'Mājvietas',
            'MV.2.': 'Pilis un muižas',
            'MV.3.': 'Vecsaimniecības',
            'MV.4.': 'Apdzīvojuma struktūra',
            'MV.5.': 'Rekreācija, slimnīcas',
            'KK.': 'Koki un koku grupas',
            'C.1.': 'Ceļi',
            'C.2.': 'Robežas',
            'C.3.': 'Ģeodēzijas objekti',
            'TR.': 'Senie tīrumi',
            'ME.1.': 'Mežu audzēšana, nosusināšana',
            'ME.2.': 'Vēsturiskās mežaudzes',
            'ME.3.': 'Meža resursi',
            'ME.4.': 'Medniecība',
            'ME.5.': 'Mežu pārvaldība, pētniecība',
            'IND.': 'Industriālie objekti',
            'UD.': 'Ūdeņi',
            'MIL.': 'Militārās būves un vietas',
            'APB.': 'Apbedījumu, piemiņas vietas',
            'SAK.1.': 'Kulta vietas un elementi',
            'SAK.2.': 'Kristīgās ticības un citu reliģiju el',
            'MIT.': 'Mītiskās un nostāstu vietas',
            'KULT.': 'Kultūras, izglītības vietas',
            'NEKL.': 'Neklasificēti un dabas objekti',
        };

        // ZEMES_SEGU
        const segums = {
            A1: 'Pieaugusi audze',
            A2: 'Vidēja vecuma audze',
            A3: 'Jaunaudze',
            A4: 'Izcirtums',
            A5: 'Rets mežs, parkveida ganība, aizaudzis parks',
            A6: 'Parks',
            A7: 'Krūmājs',
            B1: 'Apzstrādāta LIZ (tīrumu, pļavas, ganības)',
            B2: 'Pamesta LIZ (aizaugušas kokiem, krūmiem)',
            B3: 'Mazdārziņi',
            C1: 'Slapja pļava (starppauguru ieplakas, palienes)',
            C2: 'Purvs (zemeais, augstais)',
            D1: 'Upe',
            D2: 'Ezers',
            D3: 'Jūra',
            E1: 'Karjers, iežu atsegumi',
            F1: 'Ceļi, dzelzceļi',
            F2: 'Skraja apbūve',
            F3: 'Blīva apbūve',
            F4: 'Viensēta',
        };

        // ST_VOKLIS
        const stavoklis = {
            1: 'Objekts nedaudz ietekmēts/pārveidots (līdz 25%)',
            2: 'Objekts būtiski ietekmēts/pārveidots (25-75%)',
            3: 'Objekts pilnībā ietekmēts/pārveidots (vairāk kā 75%)',
            4: 'Objekta nav',
        };

        // APSAIMNIEK
        const apsaimniekojums = {
            1: 'Intensīvi apsaimniekots',
            2: 'Daļēji apsaimniekots',
            3: 'Nav apsaimniekots',
        };

        const titl = geojsonPoint.properties.NOSAUKUMS;
        let popupstr = '<div style="min-width:300px"><span style="font-size:2em;">' + titl + '</span><br>';
        popupstr += '<b>' + geojsonPoint.properties.PIEZIMES + '</b><br>';

        let atsauce = '-';
        if (geojsonPoint.properties.ATSAUC_TXT) {
            atsauce = geojsonPoint.properties.ATSAUC_TXT;
        }

        if (geojsonPoint.properties.FOTO) {
            popupstr += '<img style="max-width:300px" src="' + baseUrl + '/images/';
            popupstr += geojsonPoint.properties.FOTO + '"/><br>';
        }

        let vestAinav = '';
        if (geojsonPoint.properties.VEST_AINAV) {
            vestAinav = geojsonPoint.properties.VEST_AINAV;
            if (!vestAinav.endsWith('.')) {
                vestAinav += '.';
            }
        }

        popupstr += '<table>';
        popupstr += '<tr>';
        popupstr += '<tr>';
        popupstr += '<td>Datums:</td><td>' + geojsonPoint.properties.DATUMS + '</td>';
        popupstr += '</tr>';
        popupstr += '<tr>';
        popupstr += '<td>Atsauce:</td><td>' + atsauce + '</td>';
        popupstr += '</tr>';
        popupstr += '<tr>';
        popupstr += '<td>Info Avots:</td><td>' + geojsonPoint.properties.INFO_AVOTS + '</td>';
        popupstr += '</tr>';
        popupstr += '<tr>';
        popupstr += '<td>Ainava:</td><td>' + ainava[vestAinav] + '</td>';
        popupstr += '</tr>';
        popupstr += '<tr>';
        popupstr += '<td>Segums:</td><td>' + segums[geojsonPoint.properties.ZEMES_SEGU] + '</td>';
        popupstr += '</tr>';
        popupstr += '<tr>';
        popupstr += '<td>Stāvoklis:</td><td>' + stavoklis[geojsonPoint.properties.ST_VOKLIS] + '</td>';
        popupstr += '</tr>';
        popupstr += '<tr>';
        popupstr += '<td>Apsaimniekojums:</td><td>' + apsaimniekojums[geojsonPoint.properties.APSAIMNIEK] + '</td>';
        popupstr += '</tr>';
        popupstr += '<table>';

        popupstr += '</div>';

        return popupstr;
    }

    _makeMarker(geojsonPoint, latlng) {
        let vestAinav = '';
        if (geojsonPoint.properties.VEST_AINAV) {
            vestAinav = geojsonPoint.properties.VEST_AINAV;
            if (!vestAinav.endsWith('.')) {
                vestAinav += '.';
            }
        }

        let klassName = 'dodies-marker dodies-marker-summit'; // klass[vestAinav];

        if (vestAinav.includes('MV.')) {
            klassName = 'dodies-marker dodies-marker-home';
        } else if (vestAinav.includes('ME.') || vestAinav.includes('KK.')) {
            klassName = 'dodies-marker dodies-marker-tree';
        } else if (vestAinav.startsWith('C.')) {
            klassName = 'dodies-marker dodies-marker-road';
        } else if (vestAinav.startsWith('APB.')) {
            klassName = 'dodies-marker dodies-marker-monument';
        } else if (vestAinav.startsWith('UD.')) {
            klassName = 'dodies-marker dodies-marker-water';
        } else if (vestAinav.startsWith('IND.')) {
            klassName = 'dodies-marker dodies-marker-industrial';
        } else if (vestAinav.startsWith('KULT.')) {
            klassName = 'dodies-marker dodies-marker-book';
        } else if (vestAinav.startsWith('MIL.')) {
            klassName = 'dodies-marker dodies-marker-military';
        }

        const icon = L.divIcon({
            className: klassName,
            html: '<span>' + geojsonPoint.properties.NOSAUKUMS + '</span>',
            iconSize: [16, 16],
        });
        const marker = L.marker(latlng, {icon: icon});
        return marker;
    }

    _makeSmMarker(geojsonPoint, latlng) {
        let vestAinav = '';
        if (geojsonPoint.properties.VEST_AINAV) {
            vestAinav = geojsonPoint.properties.VEST_AINAV;
            if (!vestAinav.endsWith('.')) {
                vestAinav += '.';
            }
        }

        let color = 'brown';

        if (vestAinav.includes('ME.') || vestAinav.includes('KK.')) {
            color = 'green';
        } else if (vestAinav.startsWith('APB.')) {
            color = '#AAA';
        } else if (vestAinav.startsWith('UD.')) {
            color = 'blue';
        } else if (vestAinav.startsWith('IND.')) {
            color = '#555';
        } else if (vestAinav.startsWith('MIL.')) {
            color = '#555';
        }

        const circleMarker = L.circleMarker(latlng, {
            color: color,
            radius: 2,
        });

        return circleMarker;
    }

    _setFeaturePopup(geojson, layer) {
        const popupstr = this.self._makePopupText(geojson, this.baseUrl);
        layer.bindPopup(popupstr);
    }

    _setPagastiZoom(geojson, layer) {
        const opts = this.options;

        layer.on('mouseover', function (_unused_e) {
            layer.setStyle(opts.hoverstyle);
        });

        layer.on('mouseout', function (_unused_e) {
            layer.setStyle(opts.defstyle);
        });

        layer.bindTooltip(geojson.properties.NOSAUKUMS);
        const map = this._map;

        layer.on('click', function (_unused_e) {
            map.fitBounds(layer.getBounds(), {
                animate: false,
            });
            map.setZoom(opts.pagastiZoom + 1);
        });
    }

    _setChunksZoom(geojson, layer) {
        if (geojson.properties.file) {
            this.chunks.push(geojson);
            this.loadChunkFile(geojson);
        } else {
            this.chunksLayer.removeLayer(layer);
            layer.bindTooltip('');
        }
    }

    setLayersVisibility(e) {
        if (!this._map) {
            return;
        }

        let newZoom;
        const zoomFinished = e ? e.type !== 'zoomanim' : true;
        if (e && e.zoom !== undefined) {
            newZoom = e.zoom;
        } else {
            newZoom = this._map.getZoom();
        }

        const showPagasti = newZoom <= this.options.pagastiZoom;

        if (!zoomFinished) {
            return;
        }

        if (showPagasti) {
            this._map.addLayer(this.pagastiLayer);
        } else {
            this._map.removeLayer(this.pagastiLayer);
        }

        for (const ds of this.datasets) {
            const show = this.isChunkVisible(ds.bbox);
            for (const layer of ds.layers) {
                this.setDatasetLayerVisibility(show, layer.template, layer.layer, newZoom);
            }
        }
    }

    isChunkVisible(bbox) {
        const bounds = this._map.getBounds();
        if (bounds.getWest() >= bbox.e || bbox.w >= bounds.getEast()) {
            return false;
        } else if (bounds.getNorth() <= bbox.s || bbox.n <= bounds.getSouth()) {
            return false;
        }
        return true;
    }

    setDatasetLayerVisibility(inbounds, template, layer, zoom) {
        const show = inbounds && zoom >= template.minZoom && zoom <= template.maxZoom;
        if (show) {
            this._map.addLayer(layer);
        } else {
            this._map.removeLayer(layer);
        }
    }

    onAdd(map) {
        this._map = map;

        this.pagastiLayer.loadData();
        this.chunksLayer.loadData();

        this.setLayersVisibility();

        map.on('zoomend', this.setLayersVisibility, this);
        map.on('zoomanim', this.setLayersVisibility, this);
        map.on('moveend', this.setLayersVisibility, this);
    }

    onRemove() {
        for (const ds of this.datasets) {
            for (const layer of ds.layers) {
                this.setDatasetLayerVisibility(false, layer.template, layer.layer, 0);
            }
        }
        this._map.removeLayer(this.pagastiLayer);
        this._map.removeLayer(this.chunksLayer);
        this._map = null;
    }

    loadChunkFile(chunk) {
        if (!chunk.properties.file) {
            return;
        }

        const chunkBbox = {
            n: chunk.geometry.coordinates[0][2][1],
            w: chunk.geometry.coordinates[0][0][0],
            e: chunk.geometry.coordinates[0][2][0],
            s: chunk.geometry.coordinates[0][0][1],
        };

        chunk.properties.BBOX = chunkBbox;

        const file = chunk.properties.file;
        const pointPath = this.baseUrl + 'json/' + file;

        const pointModel = {
            self: this,
            baseUrl: this.baseUrl,
            chunk: file,
        };

        const pointLayer = new L.Layer.GeoJSONAjax(pointPath, {
            pointToLayer: this._makeMarker.bind(this),
            onEachFeature: this._setFeaturePopup.bind(pointModel),
            bbox: chunkBbox,
        });

        const pointSmLayer = new L.Layer.GeoJSONAjax(pointPath, {
            pointToLayer: this._makeSmMarker.bind(this),
            bbox: chunkBbox,
        });

        const dataset = {
            bbox: chunkBbox,
            layers: [
                {
                    template: this.datasetTemplates.point,
                    layer: pointLayer,
                },
                {
                    template: this.datasetTemplates.small,
                    layer: pointSmLayer,
                },
            ],
        };

        this.datasets.push(dataset);
        const show = this.isChunkVisible(chunkBbox);

        for (const layer of dataset.layers) {
            this.setDatasetLayerVisibility(show, layer.template, layer.layer, this._map.getZoom());
        }

        // Chunk POI layers created. Delete files.
        chunk.properties.file = [];
    }
}

export {VesturesStastiLayer};
