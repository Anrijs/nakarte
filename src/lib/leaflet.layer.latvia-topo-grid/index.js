import L from 'leaflet';

import copyToClipboard from '~/lib/clipboardCopy';
import Contextmenu from '~/lib/contextmenu';
import {lks2wgs, wgs2lks} from '~/lib/lks92';
import './style.css';

const tks93defs = {
    x: {
        min: 100000,
        max: 500000,
    },
    y: {
        min: 300000,
        max: 800000,
    },
};

const Nomenclature = {
    getQuadName: function (column, row, level) {
        // base name
        let x = Math.floor(column / 100_000) + 1;
        let y = Math.floor(row / 100_000) - 2;
        let qname = `${x}${y}`;

        const parts = [];
        parts.push(qname);

        const divisions = {
            0: [2, 100_000, '{0}'],
            1: [2, 50_000, '{0}{1}'],
            2: [2, 25_000, '{0}{1}{2}'],
            3: [2, 12_500, '{0}{1}{2}.{3}'], // leaf
            4: [5, 5_000, '{0}{1}{2}-{4}'],
            5: [2, 2_500, '{0}{1}{2}-{4}.{5}'], // leaf
            6: [5, 1_000, '{0}{1}{2}-{4}-{6}'],
            7: [2, 500, '{0}{1}{2}-{4}-{6}.{7}'],
            8: [2, 250, '{0}{1}{2}-{4}-{6}.{7}.{8}'], // leaf
        };

        for (let i = 1; i <= level; i++) {
            const division = divisions[i];
            const scale = division[1];
            x = Math.floor(column / scale) % division[0];
            y = Math.floor(row / scale) % division[0];

            let q = 0;
            if (division[0] === 5) {
                q = `${x + 1}${y + 1}`;
            } else {
                q = 1 + (y ? 1 : 0) + (x ? 2 : 0);
            }

            parts.push(q);
        }

        qname = divisions[level][2];

        for (let i = 0; i < parts.length; i++) {
            qname = qname.replace(`{${i}}`, parts[i]);
        }

        return [qname];
    },

    _lksBounds: function (bounds) {
        const boundsLks1 = wgs2lks(bounds.getSouth(), bounds.getWest());
        const boundsLks2 = wgs2lks(bounds.getNorth(), bounds.getEast());

        return {
            north: boundsLks2[0],
            east: boundsLks2[1],
            south: boundsLks1[0],
            west: boundsLks1[1],
        };
    },

    _getTksQuads: function (latlonBounds, level, nameFactory) {
        const quads = [];
        const lksBounds = this._lksBounds(L.latLngBounds(latlonBounds));

        const size = {
            0: 100_000,
            1: 50_000,
            2: 25_000,
            3: 12_500,
            4: 5_000,
            5: 2_500,
            6: 1_000,
            7: 500,
            8: 250,
        }[level];

        const bounds = {
            x: {
                min: Math.max(lksBounds.south, tks93defs.x.min),
                max: Math.min(lksBounds.north, tks93defs.x.max),
                start: 0,
                end: 0,
            },
            y: {
                min: Math.max(lksBounds.west, tks93defs.y.min),
                max: Math.min(lksBounds.east, tks93defs.y.max),
                start: 0,
                end: 0,
            },
        };

        bounds.x.start = bounds.x.min - (bounds.x.min % size);
        bounds.y.start = bounds.y.min - (bounds.y.min % size);
        bounds.x.end = bounds.x.max;
        bounds.y.end = bounds.y.max;

        let x = bounds.x.start;
        while (x < bounds.x.end) {
            let y = bounds.y.start;
            while (y < bounds.y.end) {
                const points = [];
                points.push(lks2wgs(x, y)); // bottom left
                points.push(lks2wgs(x, y + size)); // bottom right
                points.push(lks2wgs(x + size, y + size)); // top right
                points.push(lks2wgs(x + size, y)); // top left

                const names = nameFactory(x, y, level);
                quads.push({names: names, bounds: points});
                y += size;
            }
            x += size;
        }

        return quads;
    },

    getQuads200k: function (bounds) {
        return this._getTksQuads(bounds, 0, this.getQuadName.bind(this));
    },

    getQuads100k: function (bounds) {
        return this._getTksQuads(bounds, 1, this.getQuadName.bind(this));
    },

    getQuads50k: function (bounds) {
        return this._getTksQuads(bounds, 2, this.getQuadName.bind(this));
    },

    getQuads25k: function (bounds) {
        return this._getTksQuads(bounds, 3, this.getQuadName.bind(this));
    },

    getQuads10k: function (bounds) {
        return this._getTksQuads(bounds, 4, this.getQuadName.bind(this));
    },

    getQuads5k: function (bounds) {
        return this._getTksQuads(bounds, 5, this.getQuadName.bind(this));
    },

    getQuads2k: function (bounds) {
        return this._getTksQuads(bounds, 6, this.getQuadName.bind(this));
    },

    getQuads1k: function (bounds) {
        return this._getTksQuads(bounds, 7, this.getQuadName.bind(this));
    },

    getQuads5c: function (bounds) {
        return this._getTksQuads(bounds, 8, this.getQuadName.bind(this));
    },
};

const LatviaTopoGrid = L.LayerGroup.extend({
    options: {},

    initialize: function (options) {
        L.LayerGroup.prototype.initialize.call(this);
        L.Util.setOptions(this, options);
        this.renderer = L.svg({padding: 0.5});
        this._quads = {};
        this._updateRenderer = L.Util.throttle(this._updateRenderer, 100, this);
    },

    onAdd: function (map) {
        this._map = map;
        map.on('zoomend', this._reset, this);
        map.on('move', this._update, this);
        map.on('move', this._updateRenderer, this);
        this._update();
    },

    onRemove: function (map) {
        map.off('zoomend', this._reset, this);
        map.off('move', this._update, this);
        this._cleanupQuads(true);
    },

    _addQuad: function (bounds, id, titles, color, layer, scale, label) {
        if (id in this._quads) {
            return;
        }
        const rectOptions = {
            smoothFactor: 0,
            noClip: true,
            interactive: false,
            fill: false,
            opacity: {1: 0.7, 2: 0.4}[layer],
            color: color,
            weight: {1: 1, 2: 3}[layer],
            renderer: this.renderer,
        };

        const rect = L.polygon(bounds, rectOptions);
        this.addLayer(rect);
        if (layer === 1 && label) {
            rect.bringToBack();
        }
        const objects = [rect];
        const title = titles[0].replace(/-/gu, ' &ndash; ');
        const html = L.Util.template('<span style="color:{color}">{title}</span>', {color: color, title: title});
        const klass = 'leaflet-tksgrid-quadtitle-' + layer + ' leaflet-tksgrid-label-' + scale;
        const icon = L.divIcon({html: html, className: klass, iconSize: null});
        if (label) {
            const marker = L.marker(L.latLngBounds(bounds).getCenter(), {icon: icon});
            this.addLayer(marker);
            objects.push(marker);
            marker.on('click contextmenu', this._showContextMenu.bind(this, scale, titles));
        }
        this._quads[id] = objects;
    },

    _showContextMenu: function (scale, titles, e) {
        const scaleString = {
            '200k': '1:200 000',
            '100k': '1:100 000',
            '50k': '1:50 000',
            '25k': '1:25 000',
            '10k': '1:10 000',
            '5k': '1:5 000',
            '2k': '1:2 000',
            '1k': '1:1 000',
            '5c': '1:500',
        }[scale];

        const items = [
            {text: scaleString, header: true},
            {text: 'Click name to copy to clibpoard', header: true},
            {
                text: titles[0],
                callback: () => {
                    copyToClipboard(titles[0], e.originalEvent);
                },
            },
        ];
        const menu = new Contextmenu(items);
        menu.show(e);
    },

    _removeQuad: function (id) {
        this._quads[id].forEach(this.removeLayer.bind(this));
        delete this._quads[id];
    },

    _addQuads: function (quads, scale, color, layer, label) {
        quads.forEach(
            function (quad) {
                const id = scale + quad.names[0];
                this._addQuad(quad.bounds, id, quad.names, color, layer, scale, label);
            }.bind(this)
        );
    },

    /* eslint-disable complexity */
    _addGrid: function () {
        let quads;
        let layer;
        const label = true;
        const mapBbox = this._map.getBounds();
        const zoom = this._map.getZoom();

        const show200kRaw = zoom < 11;
        const show100kRaw = zoom >= 8 && zoom < 12;
        const show50kRaw = zoom >= 10 && zoom < 13;
        const show25kRaw = zoom >= 11 && zoom < 13;
        const show10kRaw = zoom >= 12 && zoom < 15;
        const show5kRaw = zoom >= 13;
        const show2kRaw = zoom >= 14 && zoom < 17;
        const show1kRaw = zoom >= 15;
        const show5cRaw = zoom >= 16;

        const show200k = show200kRaw || show100kRaw;
        const show100k = show100kRaw || show50kRaw;
        const show50k = show50kRaw || show25kRaw || show10kRaw;
        const show25k = (show25kRaw && !show10kRaw) || show5kRaw; // leaf
        const show10k = show10kRaw || show5kRaw || show2kRaw;
        const show5k = show5kRaw && !show2kRaw; // leaf
        const show2k = show2kRaw || show1kRaw || show5cRaw;
        const show1k = show1kRaw || show5cRaw;
        const show5c = show5cRaw; // leaf

        if (show5c) {
            quads = Nomenclature.getQuads5c(mapBbox);
            layer = show1k ? 1 : 2;
            this._addQuads(quads, '5c', '#E91E63', layer, label);
        }

        if (show1k) {
            quads = Nomenclature.getQuads1k(mapBbox);
            layer = show2k ? 1 : 2;
            this._addQuads(quads, '1k', '#795548', layer, label);
        }

        if (show2k) {
            quads = Nomenclature.getQuads2k(mapBbox);
            layer = show5k || !show5c ? 2 : 1;
            this._addQuads(quads, '2k', '#FF5722', layer, !show5c);
        }

        if (show5k) {
            quads = Nomenclature.getQuads5k(mapBbox);
            layer = show10k ? 2 : 1;
            this._addQuads(quads, '5k', '#5E35B1', layer, label);
        }

        if (show10k) {
            quads = Nomenclature.getQuads10k(mapBbox);
            layer = show50k ? 1 : 2;
            this._addQuads(quads, '10k', '#009688', layer, !show2k);
        }

        if (show25k) {
            quads = Nomenclature.getQuads25k(mapBbox);
            layer = show50k ? 2 : 1;
            this._addQuads(quads, '25k', '#03A9F4', layer, !show5kRaw);
        }

        if (show50k) {
            quads = Nomenclature.getQuads50k(mapBbox);
            layer = show100k || !show10k ? 2 : 1;
            this._addQuads(quads, '50k', '#3F51B5', layer, !show10k);
        }

        if (show100k) {
            quads = Nomenclature.getQuads100k(mapBbox);
            layer = show200k ? 2 : 1;
            this._addQuads(quads, '100k', '#9C27B0', layer, label);
        }

        if (show200k) {
            quads = Nomenclature.getQuads200k(mapBbox);
            layer = zoom >= 8 ? 2 : 1;
            this._addQuads(quads, '200k', '#F44336', layer, label);
        }
    },
    /* eslint-enable complexity */

    _reset: function () {
        this._update(true);
    },

    _cleanupQuads: function (reset) {
        if (reset === true) {
            this.clearLayers();
            this._quads = {};
        } else {
            const mapBbox = this._map.getBounds();
            for (const quadId of Object.keys(this._quads)) {
                const rect = this._quads[quadId][0];
                if (!mapBbox.intersects(rect.getBounds())) {
                    this._removeQuad(quadId);
                }
            }
        }
    },

    _updateRenderer: function () {
        if (this.renderer._map) {
            this.renderer._update();
        }
    },

    _update: function (reset) {
        this._cleanupQuads(reset);
        this._addGrid();
    },
});

export {LatviaTopoGrid};
