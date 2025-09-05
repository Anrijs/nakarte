import ko from 'knockout';
import L from 'leaflet';

import './metadata.css';
import copyToClipboard from '~/lib/clipboardCopy';
import Contextmenu from '~/lib/contextmenu';
import {makeButtonWithBar} from '~/lib/leaflet.control.commons';
import '~/lib/controls-styles/controls-styles.css';

const MetadataControl = L.Control.extend({
    options: {
        position: 'bottomleft',
    },

    initialize: function (layersControl, options) {
        this.layersControl = layersControl;
        L.Control.prototype.initialize.call(this, options);
    },

    onAdd: function (map) {
        const {container, link, barContainer} = makeButtonWithBar('leaflet-contol-metadata', '', 'icon-metadata');

        this._map = map;
        this._container = container;
        this._link = link;

        barContainer.innerHTML = 'Right click on map to show info';

        ko.applyBindings(this, container);
        L.DomEvent.on(link, 'click', this.onClick, this);

        return container;
    },

    onRemove: function () {
        L.DomEvent.off(this._link, 'click', this.onClick, this);
    },

    setEnabled: function (enabled) {
        if (Boolean(enabled) === this.isEnabled()) {
            return;
        }
        const classFunc = enabled ? 'addClass' : 'removeClass';
        const eventFunc = enabled ? 'on' : 'off';
        L.DomUtil[classFunc](this._container, 'active');
        L.DomUtil[classFunc](this._container, 'highlight');
        L.DomUtil[classFunc](this._map._container, 'coordinates-control-active');
        this._map[eventFunc]('contextmenu', this.onMapRightClick, this);
        this._isEnabled = Boolean(enabled);
    },

    pointInPolygon: function (point, polygon) {
        const [y, x] = point;
        let inside = false;

        let j = polygon.length - 1;
        for (let i = 0; i < polygon.length; i++) {
            const xi = parseFloat(polygon[i][1]);
            const yi = parseFloat(polygon[i][0]);
            const xj = parseFloat(polygon[j][1]);
            const yj = parseFloat(polygon[j][0]);

            const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
            if (intersect) {
                inside = !inside;
            }
            j = i;
        }

        return inside;
    },

    onMapRightClick: function (e) {
        L.DomEvent.stop(e);

        function createItem(text, options = {}) {
            return {
                text: `<span class="leaflet-coordinates-menu-fmt">${text}</span>`,
                callback: () => copyToClipboard(text, e.originalEvent),
                ...options,
            };
        }

        const items = [];
        const latlon = e.latlng;
        for (const l of this.layersControl._layers) {
            const layer = l.layer;
            let layerAdded = false;
            if (!layer.meta || !layer.meta.data || !layer.meta.data.bbox || !this._map.hasLayer(layer)) {
                continue;
            }

            for (const bbox of layer.meta.data.bbox) {
                if (!this.pointInPolygon([latlon.lat, latlon.lng], bbox.bbox)) {
                    continue;
                }
                if (!layerAdded) {
                    items.push(
                        createItem('', {
                            text: layer.meta.title,
                            header: true,
                        })
                    );
                    layerAdded = true;
                }
                items.push(createItem('', {text: `Filename: ${bbox.name}`}));
                items.push(createItem('', {text: `Year: ${bbox.year}`}));
            }
        }

        new Contextmenu(items).show(e);
    },

    isEnabled: function () {
        return Boolean(this._isEnabled);
    },

    onClick: function () {
        this.setEnabled(!this.isEnabled());
    },
});

export {MetadataControl};
