import L from 'leaflet';
import './dodies.css';
import '~/lib/leaflet.layer.geojson-ajax';

class DodiesLvLayer extends L.Layer {
    constructor(baseUrl, options) {
        super();

        L.setOptions(this, options);

        this.geojsonUrl = baseUrl + options.geojsonUrl;
        this.routesUrl = baseUrl + options.routesUrl;
        this.aprakstsBaseUrl = options.aprakstsBaseUrl;

        this.layer = new L.Layer.GeoJSONAjax(this.geojsonUrl, {
            pointToLayer: this._makeMarker.bind(this),
            onEachFeature: this._setFeaturePopup.bind(this),
        });
    }

    _b64DecodeUnicode(str) {
        const bytes = atob(str).split('');
        const mapped = bytes.map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        });
        return decodeURIComponent(mapped.join(''));
    }

    _getDistText(geojsonPoint) {
        let distText = '';
        if (geojsonPoint.properties.ti === 'taka' && geojsonPoint.properties.km) {
            distText = `${geojsonPoint.properties.km} km`;
        } else if (geojsonPoint.properties.ti === 'tornis' && geojsonPoint.properties.aug) {
            distText = `${geojsonPoint.properties.aug} m`;
        }
        return distText;
    }

    _setFeaturePopup(geojsonPoint, layer) {
        const txt = this._b64DecodeUnicode(geojsonPoint.properties.txt);
        const imgsrc = geojsonPoint.properties.img;

        const popup = document.createElement('div');
        const header = document.createElement('div');
        header.classList = ['header'];

        const contents = document.createElement('div');
        contents.classList = ['contents'];

        const title = document.createElement('b');
        title.classList = ['title'];
        title.innerText = geojsonPoint.properties.na;

        const desc = document.createElement('p');
        desc.classList = ['desc'];
        desc.innerHTML = txt;

        const apraksts = document.createElement('a');
        apraksts.classList = ['btn'];
        apraksts.innerText = 'Apraksts';
        apraksts.href = this.aprakstsBaseUrl + geojsonPoint.properties.url;

        if (imgsrc) {
            header.style.backgroundImage = `url('${imgsrc}')`;
            popup.appendChild(header);
        }

        contents.appendChild(title);
        contents.appendChild(desc);
        contents.appendChild(apraksts);

        const distText = this._getDistText(geojsonPoint);
        if (distText) {
            const distance = document.createElement('span');
            distance.classList = ['dist'];
            distance.innerText = distText;

            if (geojsonPoint.properties.ma === 'Pārgājiens') {
                distance.onclick = this._showRoute.bind(this, geojsonPoint);
            }

            contents.appendChild(document.createElement('br'));
            contents.appendChild(distance);
        }

        popup.appendChild(contents);

        const myPopup = L.popup({className: 'dodies-popup'}).setContent(popup);
        layer.bindPopup(myPopup);
    }

    _showRoute(geojsonPoint) {
        const routeUrl = `${this.routesUrl}/${geojsonPoint.properties.id}.geojson`;
        const track = this._getTrackForId(geojsonPoint.properties.id, geojsonPoint.properties.na);
        if (!track.loaded) {
            const geolayer = new L.Layer.GeoJSONAjax(routeUrl, {
                onEachFeature: this._addTrackSegment.bind(this, track),
            });
            geolayer.loadData();
        }
        track.loaded = true;
    }

    _addTrackSegment(track, jsonb) {
        if (!this.tracklist || !track) {
            return;
        }

        const segment = [];
        const coordinates = jsonb.geometry.coordinates;

        for (let i = 0; i < coordinates.length; i++) {
            const lat = coordinates[i][1] || false;
            const lon = coordinates[i][0] || false;
            if (lat && lon) {
                segment.push([lat, lon]);
            }
        }

        if (segment.length > 1) {
            this.tracklist.addTrackSegment(track, segment);
        }
    }

    _getTrackForId(id, trname) {
        const tracks = this.tracklist.tracks();
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].uid === id) {
                return tracks[i];
            }
        }
        const track = this.tracklist.addTrack({name: trname});
        track.uid = id;

        return track;
    }

    _makeMarker(geojsonPoint, latlng) {
        let klassName = 'dodi-marker ';
        const type = geojsonPoint.properties.ti;

        if (type === 'taka' || type === 'pargajiens') {
            if (geojsonPoint.properties.ma === 'Pārgājiens') {
                klassName += 'dodies-marker-boot';
            } else {
                klassName += 'dodies-marker-trail';
            }
        } else if (type === 'tornis') {
            klassName += 'dodies-marker-binoculars';
        } else if (type === 'pikniks') {
            klassName += 'dodies-marker-picnic';
        }

        const icon = L.divIcon({
            className: klassName,
            iconSize: [28, 28],
        });
        const marker = L.marker(latlng, {icon: icon});

        const distText = this._getDistText(geojsonPoint);

        if (distText) {
            marker.bindTooltip(geojsonPoint.properties.na + ' (' + distText + ')');
        } else {
            marker.bindTooltip(geojsonPoint.properties.na);
        }

        return marker;
    }

    setLayersVisibility(e) {
        if (!this._map) {
            return;
        }
        const zoomFinished = e ? e.type !== 'zoomanim' : true;
        if (zoomFinished) {
            this._map.addLayer(this.layer);
        }
    }

    onAdd(map) {
        this._map = map;
        this.layer.loadData();
        this.setLayersVisibility();
        map.on('zoomend', this.setLayersVisibility, this);
        map.on('zoomanim', this.setLayersVisibility, this);
    }

    onRemove() {
        this._map.removeLayer(this.layer);
        this._map.off('zoomend', this.setLayersVisibility, this);
        this._map.off('zoomanim', this.setLayersVisibility, this);
        this._map = null;
    }
}

export {DodiesLvLayer};
