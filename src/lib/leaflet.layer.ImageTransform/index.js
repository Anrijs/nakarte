import L from 'leaflet';

class ImageTransformLayer extends L.ImageOverlay {
    constructor(url, anchors, options) {
        super();

        this._imgLoaded = false;
        this._clipDone = false;

        // (String, LatLngBounds, Object)
        L.ImageOverlay.prototype.initialize.call(this, url, anchors, options);
        this.setAnchors(anchors);
    }

    setAnchors(anchors) {
        this._anchors = [];
        this._bounds = L.latLngBounds(anchors);
        for (let i = 0, len = anchors.length; i < len; i++) {
            const yx = anchors[i];
            this._anchors.push(L.latLng(yx));
        }

        if (this._map) {
            this._reset();
        }
    }

    _latLngToLayerPoint(latlng) {
        return this._map.project(latlng)._subtract(this._map.getPixelOrigin());
    }

    setClip(clipLatLngs) {
        this.options.clip = clipLatLngs;

        let coordsArr = [[clipLatLngs]];
        if (!L.Util.isArray(clipLatLngs)) {
            this._clipFormat = 'geoJson';
            this._clipType = clipLatLngs.type;
            coordsArr = clipLatLngs.coordinates;
            if (this._clipType.toLowerCase() === 'polygon') {
                coordsArr = [coordsArr];
            }
        }
        this.setClipPixels(this._coordsPixels(coordsArr, true));
    }

    getClip() {
        if (this._clipFormat === 'geoJson') {
            let coords = this._coordsPixels(this._pixelClipPoints);
            if (this._clipType.toLowerCase() === 'polygon') {
                coords = coords[0];
            }
            return {
                type: this._clipType,
                coordinates: coords,
            };
        }
        const arr = this.options.clip.coordinates;
        const res = [];

        for (let i = 0, len = arr.length; i < len; i++) {
            for (let j = 0, len1 = arr[i].length; j < len1; j++) {
                for (let p = 0, len2 = arr[i][j].length; p < len2; p++) {
                    const latlng = arr[i][j][p];
                    res.push([latlng[1], latlng[0]]);
                }
            }
        }
        return res;
    }

    setClipPixels(pixelClipPoints) {
        this._clipDone = false;
        this._pixelClipPoints = pixelClipPoints;
        this._drawCanvas();
    }

    setUrl(url) {
        this._url = url;
        this._imgNode.src = this._url;
    }

    getAnchors() {
        return this._anchors;
    }

    _initImage() {
        this._image = L.DomUtil.create('div', 'leaflet-image-layer');

        if (this._map.options.zoomAnimation && L.Browser.any3d) {
            L.DomUtil.addClass(this._image, 'leaflet-zoom-animated');
        } else {
            L.DomUtil.addClass(this._image, 'leaflet-zoom-hide');
        }

        this._imgNode = L.DomUtil.create('img', 'gmxImageTransform');
        if (this.options.clip) {
            this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-transform');
            this._image.appendChild(this._canvas);
            this._canvas.style[L.DomUtil.TRANSFORM_ORIGIN] = '0 0';
            this._clipDone = false;
        } else {
            this._image.appendChild(this._imgNode);
            this._imgNode.style[L.DomUtil.TRANSFORM_ORIGIN] = '0 0';

            // Hide imgNode until image has loaded
            this._imgNode.style.display = 'none';
        }
        const node = this._canvas || this._imgNode;
        const that = this;

        L.DomEvent.on(node, 'contextmenu', L.DomEvent.stopPropagation);
        L.DomEvent.on(node, 'contextmenu', L.DomEvent.preventDefault);
        L.DomEvent.on(
            node,
            'contextmenu',
            function (ev) {
                const _showLocation = {
                    originalEvent: ev,
                    latlng: that._map.mouseEventToLatLng(ev),
                    layerPoint: that._map.mouseEventToLayerPoint(ev),
                    containerPoint: that._map.mouseEventToContainerPoint(ev),
                };
                that.fire('contextmenu', _showLocation);
            },
            this
        );

        this._updateOpacity();

        this._imgLoaded = false;
        L.extend(this._imgNode, {
            galleryimg: 'no',
            onselectstart: L.Util.falseFn,
            onmousemove: L.Util.falseFn,
            onload: L.bind(this._onImageLoad, this),
            onerror: L.bind(this._onImageError, this),
            src: this._url,
        });
    }

    _onImageError() {
        this.fire('error');
    }

    _onImageLoad() {
        if (this._imgNode.decode) {
            this._imgNode
                .decode({notifyWhen: 'paintable'}) // {firstFrameOnly: true}
                .then(L.bind(this._imageReady, this))
                .catch(this._onImageError.bind(this));
        } else {
            this._imageReady();
        }
    }

    _imageReady() {
        if (this.options.clip) {
            this._canvas.width = this._imgNode.width;
            this._canvas.height = this._imgNode.height;
        } else {
            // Show imgNode once image has loaded
            this._imgNode.style.display = 'inherit';
        }
        this._imgLoaded = true;

        this._reset();
        this.fire('load');
    }

    _reset() {
        if (this.options.clip && !this._imgLoaded) {
            return;
        }
        const div = this._image;
        const imgNode = this.options.clip ? this._canvas : this._imgNode;
        const topLeft = this._latLngToLayerPoint(this._bounds.getNorthWest());
        const size = this._latLngToLayerPoint(this._bounds.getSouthEast())._subtract(topLeft);
        const anchors = this._anchors;
        const w = imgNode.width;
        const h = imgNode.height;
        const pixels = [];
        const len = anchors.length;
        let i;
        let p;

        for (i = 0; i < len; i++) {
            p = this._latLngToLayerPoint(anchors[i]);
            pixels.push(L.point(p.x - topLeft.x, p.y - topLeft.y));
        }

        L.DomUtil.setPosition(div, topLeft);

        div.style.width = size.x + 'px';
        div.style.height = size.y + 'px';

        const matrix3d = this._utilGeneral2DProjection(
            0,
            0,
            pixels[0].x,
            pixels[0].y,
            w,
            0,
            pixels[1].x,
            pixels[1].y,
            w,
            h,
            pixels[2].x,
            pixels[2].y,
            0,
            h,
            pixels[3].x,
            pixels[3].y
        );
        this._matrix3d = matrix3d;

        // something went wrong (for example, target image size is less then one pixel)
        if (!matrix3d[8]) {
            return;
        }

        // matrix normalization
        for (i = 0; i !== 9; ++i) {
            matrix3d[i] /= matrix3d[8];
        }

        this._matrix3dInverse = this._utilAdj(matrix3d);

        imgNode.style[L.DomUtil.TRANSFORM] = this._getMatrix3dCSS(this._matrix3d);
        if (this.options.clip) {
            if (this._pixelClipPoints) {
                this._drawCanvas();
            } else {
                this.setClip(this.options.clip);
            }
        }
    }

    _coordsPixels(fromCoords, toPixelFlag) {
        const topLeft = this._latLngToLayerPoint(this._bounds.getNorthWest());
        const toCoords = [];

        for (let i = 0, len = fromCoords.length; i < len; i++) {
            const ringHells = [];
            for (let j = 0, len1 = fromCoords[i].length; j < len1; j++) {
                const arr = [];
                const ring = fromCoords[i][j];
                for (let p = 0, len2 = ring.length, pixel, tp, mp; p < len2; p++) {
                    if (toPixelFlag) {
                        tp = this._clipFormat === 'geoJson' ? [ring[p][1], ring[p][0]] : ring[p];
                        mp = this._latLngToLayerPoint(tp);
                        pixel = this._utilProject(this._matrix3dInverse, mp.x - topLeft.x, mp.y - topLeft.y);
                        arr.push(L.point(pixel[0], pixel[1]));
                    } else {
                        pixel = ring[p];
                        tp = this._utilProject(this._matrix3d, pixel.x, pixel.y);
                        mp = this._map.layerPointToLatLng(L.point(tp[0] + topLeft.x, tp[1] + topLeft.y));
                        arr.push([mp.lng, mp.lat]);
                    }
                }
                ringHells.push(arr);
            }
            toCoords.push(ringHells);
        }

        return toCoords;
    }

    _getMatrix3dCSS(arr) {
        // get CSS atribute matrix3d
        let css = 'matrix3d(';
        css += arr[0].toFixed(9) + ',' + arr[3].toFixed(9) + ', 0,' + arr[6].toFixed(9);
        css += ',' + arr[1].toFixed(9) + ',' + arr[4].toFixed(9) + ', 0,' + arr[7].toFixed(9);
        css += ',0, 0, 1, 0';
        css += ',' + arr[2].toFixed(9) + ',' + arr[5].toFixed(9) + ', 0, ' + arr[8].toFixed(9) + ')';
        return css;
    }

    _drawCanvas() {
        if (!this._clipDone && this._imgNode) {
            const canvas = this._canvas;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = ctx.createPattern(this._imgNode, 'no-repeat');

            for (let i = 0, len = this._pixelClipPoints.length; i < len; i++) {
                ctx.beginPath();
                for (let j = 0, len1 = this._pixelClipPoints[i].length; j < len1; j++) {
                    const ring = this._pixelClipPoints[i][j];
                    for (let p = 0, len2 = ring.length; p < len2; p++) {
                        const pix = ring[p];
                        ctx[p ? 'lineTo' : 'moveTo'](pix.x, pix.y);
                    }
                }
                ctx.closePath();
                ctx.fill();
            }

            ctx.fillStyle = null;
            if (this.options.disableSetClip) {
                this._imgNode = null;
            }
            this._clipDone = true;
        }
    }

    // Utils

    // Based on http://math.stackexchange.com/questions/296794
    _utilAdj(m) {
        // Compute the adjugate of m
        return [
            m[4] * m[8] - m[5] * m[7],
            m[2] * m[7] - m[1] * m[8],
            m[1] * m[5] - m[2] * m[4],
            m[5] * m[6] - m[3] * m[8],
            m[0] * m[8] - m[2] * m[6],
            m[2] * m[3] - m[0] * m[5],
            m[3] * m[7] - m[4] * m[6],
            m[1] * m[6] - m[0] * m[7],
            m[0] * m[4] - m[1] * m[3],
        ];
    }

    _utilMultmm(a, b) {
        // multiply two matrices
        const c = Array(9);
        for (let i = 0; i !== 3; ++i) {
            for (let j = 0; j !== 3; ++j) {
                let cij = 0;
                for (let k = 0; k !== 3; ++k) {
                    cij += a[3 * i + k] * b[3 * k + j];
                }
                c[3 * i + j] = cij;
            }
        }
        return c;
    }

    _utilMultmv(m, v) {
        // multiply matrix and vector
        return [
            m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
            m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
            m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
        ];
    }

    _utilBasisToPoints(x1, y1, x2, y2, x3, y3, x4, y4) {
        const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
        const v = this._utilMultmv(this._utilAdj(m), [x4, y4, 1]);
        return this._utilMultmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
    }

    _utilGeneral2DProjection(x1s, y1s, x1d, y1d, x2s, y2s, x2d, y2d, x3s, y3s, x3d, y3d, x4s, y4s, x4d, y4d) {
        const s = this._utilBasisToPoints(x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s);
        const d = this._utilBasisToPoints(x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d);
        return this._utilMultmm(d, this._utilAdj(s));
    }

    _utilProject(m, x, y) {
        const v = this._utilMultmv(m, [x, y, 1]);
        return [v[0] / v[2], v[1] / v[2]];
    }
}

L.DomUtil.TRANSFORM_ORIGIN = L.DomUtil.testProp([
    'transformOrigin',
    'WebkitTransformOrigin',
    'OTransformOrigin',
    'MozTransformOrigin',
    'msTransformOrigin',
]);

export {ImageTransformLayer};
