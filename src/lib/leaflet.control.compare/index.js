import './layout.css';
import './range.css';

import L from 'leaflet';

let mapWasDragEnabled;
let mapWasTapEnabled;

// Leaflet v0.7 backwards compatibility
function on(el, types, fn, context) {
    types.split(' ').forEach((type) => {
        L.DomEvent.on(el, type, fn, context);
    });
}

// Leaflet v0.7 backwards compatibility
function off(el, types, fn, context) {
    types.split(' ').forEach((type) => {
        L.DomEvent.off(el, type, fn, context);
    });
}

function getRangeEvent(rangeInput) {
    return 'oninput' in rangeInput ? 'input' : 'change';
}

// convert arg to an array - returns empty array if arg is undefined
function asArray(arg) {
    if (typeof arg === 'undefined') {
        return [];
    }
    if (Array.isArray(arg)) {
        return arg;
    }
    return [arg];
}

const LeafletCompare = L.Control.extend({
    options: {
        thumbSize: 42,
        padding: 0,
        position: 0.5,
        width: 4,
    },

    initialize(leftLayers, rightLayers, options) {
        this._mode = 0; // 0 - slide, 1 - search
        this._leftLayers = asArray(leftLayers);
        this._rightLayers = asArray(rightLayers);
        this._updateClip();
        L.setOptions(this, options);
    },

    updateLayers(leftLayers, rightLayers) {
        this._clearClip();
        this._leftLayers = asArray(leftLayers);
        this._rightLayers = asArray(rightLayers);
        this._updateClip();
    },

    _clearClip() {
        [...this._leftLayers, ...this._rightLayers].forEach((layer) => {
            if (layer.getContainer) {
                layer.getContainer().style.clip = '';
                layer.getContainer().style.clipPath = '';
                if (layer.__originalIndex) {
                    layer.getContainer().style.zIndex = layer.__originalIndex;
                    layer.__originalIndex = undefined;
                }
            }
            if (layer.getPane) {
                layer.getPane().style.clip = '';
                layer.getPane().style.clipPath = '';
                if (layer.__originalIndex) {
                    layer.getPane().style.zIndex = layer.__originalIndex;
                    layer.__originalIndex = undefined;
                }
            }
        });
    },

    getPosition() {
        const rangeValue = this._range.value;
        const offset = (0.5 - rangeValue) * (2 * this.options.padding + this.options.thumbSize);
        return this._map.getSize().x * rangeValue + offset;
    },

    setPosition(offset) {
        if (!this._map) {
            return this;
        }
        this._range.value = offset;
        this._updateClip();
        return this;
    },

    setMode(mode) {
        if (mode < 0 || mode > 1) {
            this._mode = 0;
        } else {
            this._mode = mode;
        }

        this._clearClip();

        if (this._mode === 0) {
            this._container.hidden = false;
        } else if (this._mode === 1) {
            this._container.hidden = true;
        }

        this._updateClip();
    },

    includes: L.Evented.prototype,

    addTo(map) {
        this.remove();
        this._map = map;
        this._container = L.DomUtil.create(
            'div',
            'leaflet-sbs',
            // eslint-disable-next-line no-underscore-dangle
            map._controlContainer
        );
        this._divider = L.DomUtil.create('div', 'leaflet-sbs-divider', this._container);
        this._divider.style.width = `${this.options.width}px`;
        this._divider.style.marginLeft = `${this.options.width / -2}px`;
        this._range = L.DomUtil.create('input', 'leaflet-sbs-range', this._container);
        this._range.type = 'range';
        this._range.min = 0;
        this._range.max = 1;
        this._range.step = 'any';
        this._range.value = 0.5;
        // eslint-disable-next-line no-multi-assign
        this._range.style.paddingLeft = this._range.style.paddingRight = `${this.options.padding}px`;
        this._addEvents();
        this._updateClip();
        if (this.options.position) {
            this.setPosition(this.options.position);
        }
        return this;
    },

    remove() {
        if (!this._map) {
            return this;
        }
        this._clearClip();
        this._removeEvents();
        L.DomUtil.remove(this._container);
        this._map = null;
        return this;
    },

    _updateClipSlide() {
        if (!this._map || this._mode !== 0) {
            return this;
        }
        const map = this._map;
        const nw = map.containerPointToLayerPoint([0, 0]);
        const se = map.containerPointToLayerPoint(map.getSize());
        const clipX = nw.x + this.getPosition();
        const dividerX = this.getPosition();
        this._divider.style.left = `${dividerX}px`;
        this.fire('dividermove', {x: dividerX});
        const clipLeft = `rect(${[nw.y, clipX, se.y, nw.x].join('px,')}px)`;
        const clipRight = `rect(${[nw.y, se.x, se.y, clipX].join('px,')}px)`;

        this._leftLayers.forEach((leftLayer) => {
            if (leftLayer.getContainer) {
                leftLayer.getContainer().style.clip = clipLeft;
            } else {
                leftLayer.getPane().style.clip = clipLeft;
            }
        });

        this._rightLayers.forEach((rightLayer) => {
            if (rightLayer.getContainer) {
                rightLayer.getContainer().style.clip = clipRight;
            } else {
                rightLayer.getPane().style.clip = clipRight;
            }
        });
        return this;
    },

    _updateClipSearch(e = null) {
        if (!this._map || this._mode !== 1 || !e || !e.containerPoint) {
            return this;
        }

        const point = e.containerPoint;
        const map = this._map;

        const se = map.containerPointToLayerPoint([point.x, point.y]);
        const clipLeft = `circle(150px at ${se.x}px ${se.y}px)`;

        this._leftLayers.forEach((leftLayer) => {
            if (leftLayer.getContainer) {
                leftLayer.getContainer().style.clipPath = clipLeft;
                if (!leftLayer.__originalIndex) {
                    leftLayer.__originalIndex = leftLayer.getContainer().style.zIndex;
                    leftLayer.getContainer().style.zIndex = leftLayer.__originalIndex + 1000;
                }
            } else {
                leftLayer.getPane().style.clipPath = clipLeft;
                if (!leftLayer.__originalIndex) {
                    leftLayer.__originalIndex = leftLayer.getPane().style.zIndex;
                    leftLayer.getPane().style.zIndex = leftLayer.__originalIndex + 1000;
                }
            }
        });

        this._rightLayers.forEach((rightLayer) => {
            if (rightLayer.getContainer) {
                rightLayer.getContainer().style.clipPath = null;
                rightLayer.getContainer().style.clipPath = null;
                if (rightLayer.__originalIndex) {
                    rightLayer.getContainer().style.zIndex = rightLayer.__originalIndex;
                    rightLayer.__originalIndex = undefined;
                }
            } else {
                rightLayer.getPane().style.clip = null;
                rightLayer.getPane().style.clipPath = null;
                if (rightLayer.__originalIndex) {
                    rightLayer.getPane().style.zIndex = rightLayer.__originalIndex;
                    rightLayer.__originalIndex = undefined;
                }
            }
        });

        return this;
    },

    _updateClip(e) {
        switch (this._mode) {
            case 0:
                return this._updateClipSlide();
            case 1:
                return this._updateClipSearch(e);
            default:
                return this;
        }
    },

    _addEvents() {
        const range = this._range;
        const map = this._map;
        if (!map || !range) {
            return;
        }
        map.on('mousemove', this._updateClipSearch, this);
        map.on('move', this._updateClip, this);
        map.on('layeradd layerremove', this._updateLayers, this);
        on(range, getRangeEvent(range), this._updateClip, this);
        on(range, L.Browser.touch ? 'touchstart' : 'mousedown', this._cancelMapDrag, this);
        on(range, L.Browser.touch ? 'touchend' : 'mouseup', this._uncancelMapDrag, this);
    },

    _removeEvents() {
        const range = this._range;
        const map = this._map;
        if (range) {
            off(range, getRangeEvent(range), this._updateClip, this);
            off(range, L.Browser.touch ? 'touchstart' : 'mousedown', this._cancelMapDrag, this);
            off(range, L.Browser.touch ? 'touchend' : 'mouseup', this._uncancelMapDrag, this);
        }
        if (map) {
            map.off('mousemove', this._updateClipSearch, this);
            map.off('layeradd layerremove', this._updateLayers, this);
            map.off('move', this._updateClip, this);
        }
    },

    _updateLayers(e) {
        if (!e.layer.getContainer || !e.layer.options.isOverlay) {
            return; // custom layers dont clip until re-toggled...
        }

        if (e.type === 'layeradd') {
            if (e.layer.__compareSide === 'R') {
                this._rightLayers.push(e.layer);
            } else if (e.layer.__compareSide === 'L') {
                this._leftLayers.push(e.layer);
            } else {
                this._leftLayers = this._leftLayers.filter((el) => el !== e.layer);
                this._rightLayers = this._rightLayers.filter((el) => el !== e.layer);
            }
        } else if (e.type === 'layerremove') {
            this._leftLayers = this._leftLayers.filter((el) => el !== e.layer);
            this._rightLayers = this._rightLayers.filter((el) => el !== e.layer);
        }
        this._updateClip();
    },

    _cancelMapDrag() {
        mapWasDragEnabled = this._map.dragging.enabled();
        mapWasTapEnabled = this._map.tap && this._map.tap.enabled();
        this._map.dragging.disable();
        if (this._map.tap) {
            this._map.tap.disable();
        }
    },

    _uncancelMapDrag(e) {
        this._refocusOnMap(e);
        if (mapWasDragEnabled) {
            this._map.dragging.enable();
        }
        if (mapWasTapEnabled) {
            this._map.tap.enable();
        }
    },
});

export {LeafletCompare};
