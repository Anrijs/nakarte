import ko from 'knockout';
import L from 'leaflet';
import './robezpunkti.css';
import '~/lib/leaflet.layer.geojson-ajax';

const RobezpunktiLayer = L.TileLayer.extend({
    options: {
        minPtsZoom: 14,
    },

    pages: {
        min: 1,
        max: 106,
    },

    initialize: function (baseUrl, options) {
        L.Util.setOptions(this, options);

        this.baseUrl = baseUrl;

        const pointPath = `${this.baseUrl}json/points.json`;

        const pointModel = {
            self: this,
        };

        this.pointsLayer = new L.Layer.GeoJSONAjax(pointPath, {
            pointToLayer: this._makeMarker.bind(this),
            onEachFeature: this._setFeaturePopup.bind(pointModel),
        });
    },

    getTileUrl: function (tilePoint) {
        const z = this._getZoomForUrl();
        const x = tilePoint.x;
        const y = tilePoint.y;
        return `${this.baseUrl}/${z}/${x}/${y}.png`;
    },

    _makeMarker: function (geojsonPoint, latlng) {
        const marker = L.circle(latlng, {
            radius: 30,
            color: 'red',
            opacity: 0.4,
            weight: 3,
            fillOpacity: 0,
        });
        return marker;
    },

    onClosePageWindowClicked: function () {
        this.hidePageWindow();
    },

    openImageWindow: function (url) {
        window.open(url, '_blank').focus();
    },

    setPage: function (model, page) {
        if (page >= this.pages.min && page <= this.pages.max) {
            model.pagenum(page);
            model.imageUrl(this.getPageImageUrl(page));
            model.pageName(this.getPageName(page));
        }
    },

    _setFeaturePopup: function (geojson, marker) {
        const selfa = this.self;
        marker.on('click', function () {
            selfa.showPageWindow(
                [
                    {
                        caption: 'Iepriekšējā Lapa',
                        callback: (model) => selfa.setPage(model, model.pagenum() - 1),
                        isDisabled: (model) => model.pagenum() <= selfa.pages.min,
                        newln: false,
                    },
                    {
                        caption: 'Nākošā Lapa',
                        callback: (model) => selfa.setPage(model, model.pagenum() + 1),
                        isDisabled: (model) => model.pagenum() >= selfa.pages.max,
                        newln: false,
                    },
                    {
                        caption: 'Atvērt attēlu jaunā logā',
                        callback: (model) => selfa.openImageWindow(model.imageUrl()),
                        isDisabled: () => false,
                        newln: false,
                    },
                    {
                        caption: 'Aizvērt',
                        callback: () => selfa.onClosePageWindowClicked(),
                        isDisabled: () => false,
                        newln: true,
                    },
                ],
                geojson
            );
        });
    },

    hidePageWindow: function () {
        if (!this._pageWindow) {
            return;
        }

        this._map._controlContainer.removeChild(this._pageWindow);
        this._pageWindow = null;
    },

    getPageImageUrl: function (page) {
        return `${this.baseUrl}lapas/${page}.JPG`;
    },

    getPageName: function (page) {
        return `${page}. lapa no ${this.pages.max}`;
    },

    showPageWindow: function (buttons, geojson) {
        if (this._pageWindow) {
            return;
        }

        this._pageWindow = L.DomUtil.create('div', 'leaflet-layers-dialog-wrapper', this._map._controlContainer);

        L.DomEvent.disableClickPropagation(this._pageWindow);
        L.DomEvent.disableScrollPropagation(this._pageWindow);

        const customLayerWindow = L.DomUtil.create('div', 'custom-layers-window robezpunkti-window', this._pageWindow);

        const dialogModel = {
            title: `Robežpunkts ${geojson['properties']['name']}`,
            pagenum: ko.observable(),
            imageUrl: ko.observable(),
            pageName: ko.observable(),
            buttons: buttons,
        };

        dialogModel.buttonClicked = function (callbackN) {
            buttons[callbackN].callback(dialogModel);
        };

        dialogModel.buttonDisabled = function (id) {
            return buttons[id].isDisabled(dialogModel);
        };

        const pagenum = geojson['properties']['page'];
        dialogModel.pagenum(pagenum);
        dialogModel.imageUrl(this.getPageImageUrl(pagenum));
        dialogModel.pageName(this.getPageName(pagenum));

        /* eslint-disable max-len */
        const boxHtml = `
        <h3 class="robezpunkti-title" data-bind="text: title"></h3>
        <h4 class="robezpunkti-subtitle" data-bind="text: pageName"></h4>
        <img class="robezpunkti-lapa" data-bind="attr:{src: imageUrl}">
        <div data-bind="foreach: buttons">
        <!-- ko if: newln -->
        <hr>
        <!-- /ko -->
        <a class="button" data-bind="click: $root.buttonClicked.bind(null, $index()), text: caption, css: {
            'robezpunkti-disabled': isDisabled($root)
        }"></a>
        </div>`;
        /* eslint-enable max-len */
        customLayerWindow.innerHTML = boxHtml;
        ko.applyBindings(dialogModel, customLayerWindow);
    },

    setLayersVisibility: function (e) {
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

        if (!zoomFinished) {
            return;
        }

        const showPoints = newZoom >= this.options.minPtsZoom;

        if (showPoints) {
            this._map.addLayer(this.pointsLayer);
        } else {
            this._map.removeLayer(this.pointsLayer);
        }
    },

    onAdd: function (map) {
        this.pointsLayer.loadData();

        this.setLayersVisibility();

        map.on('zoomend', this.setLayersVisibility, this);
        map.on('zoomanim', this.setLayersVisibility, this);
        map.on('moveend', this.setLayersVisibility, this);

        L.TileLayer.prototype.onAdd.apply(this, [map]);
    },

    onRemove: function (map) {
        map.removeLayer(this.pointsLayer);
        L.TileLayer.prototype.onRemove.apply(this, [map]);
    },
});

export {RobezpunktiLayer};
