import L from "leaflet";
import 'lib/leaflet.layer.canvasMarkers'

L.Layer.CanvasMarkers.include({
        _printProgressWeight: 0.1,

        cloneMarkers: function() {
            const markers = this.rtree.all();

            function cloneMarker(marker) {
                return {
                    latlng: {lat: marker.latlng.lat, lng: marker.latlng.lng},
                    label: marker.label,
                    icon: marker.icon
                };
            }

            const markersCopy = markers.map(cloneMarker);
            return markersCopy;
        },

        cloneForPrint: function(options) {
            options = L.Util.extend({}, this.options);
            return new L.Layer.CanvasMarkers(this.cloneMarkers(), options);

        },

        getTilesInfo: async function(printOptions) {
            this.options.iconScale = printOptions.resolution / 90 * 0.75;
            const scale = printOptions.pixelBounds.getSize().x / printOptions.destPixelSize.x;
            const pixelExtents = {
                tileN: printOptions.pixelBounds.getTopRight().y / scale,
                tileS: printOptions.pixelBounds.getBottomLeft().y / scale,
                tileE: printOptions.pixelBounds.getTopRight().x / scale,
                tileW: printOptions.pixelBounds.getBottomLeft().x / scale
            };
            const crs = L.CRS.EPSG3857;
            if (!this._map) {
                const dummyMap = {
                    project: crs.latLngToPoint.bind(crs),
                    unproject: crs.pointToLatLng.bind(crs),
                };
                this._map = dummyMap;
            }
            const zoom = crs.zoom((1 / scale) * crs.scale(printOptions.zoom));
            const {iconUrls, markerJobs, pointsForLabels} = this.selectMarkersForDraw(pixelExtents, zoom, false);
            await this.preloadIcons(iconUrls);
            return {
                iterateTilePromises: (function*() {
                    yield {
                        tilePromise: Promise.resolve({
                                draw: (canvas) => {
                                    this.drawSelectedMarkers(canvas, pixelExtents, markerJobs, pointsForLabels, zoom);
                                },
                                isOverlay: true,
                                overlaySolid: true
                            }
                        ),
                        abortLoading: () => {
                        }
                    }
                }).bind(this),
                count: 1
            };
        }
    }
);