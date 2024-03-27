import ko from 'knockout';
import L from 'leaflet';

import * as logging from '~/lib/logging';
import {fetch} from '~/lib/xhr-promise';

import {BaseProvider} from '../remoteBase';

const KadastrsProvider = BaseProvider.extend({
    name: 'Kadastrs WFS',
    description: '<a href="https://www.kadastrs.lv">https://www.kadastrs.lv</a>',
    options: {
        queryUrl:
            'https://grafws.kadastrs.lv/gateway/gateto/GEOPRODUKTS-WFS-INSPIRE-CP-bd4a685d-2bc3-411a-bc40-1f0eb924cd71',
        attribution: {
            text: 'kadastrs.lv',
            url: 'https://www.kadastrs.lv',
        },
        delay: 1000,
        languages: ['lv'],
        categoriesLanguages: ['lv'],
        defaultLanguage: 'lv',
        tooltip: 'Meklēt kadastra numuru',
    },

    initialize: function (options) {
        BaseProvider.prototype.initialize.call(this, options);
        this.langStr = this.getRequestLanguages(this.options.languages).join(',');
        this.categoriesLanguage = this.getRequestLanguages(
            this.options.categoriesLanguages,
            this.options.defaultLanguage
        )[0];
    },

    parseKml: function (txt) {
        let dom;
        try {
            dom = new DOMParser().parseFromString(txt, 'text/xml');
        } catch (e) {
            return null;
        }
        if (dom.documentElement.nodeName === 'parsererror') {
            return null;
        }
        if (dom.getElementsByTagName('kml').length === 0) {
            return null;
        }

        const results = [];
        for (const placemark of dom.getElementsByTagName('Placemark')) {
            const attrs = {};
            for (const attr of placemark.getElementsByTagName('SimpleData')) {
                const key = attr.getAttribute('name');
                const value = attr.innerHTML;
                attrs[key] = value;
            }

            const coordsDom = placemark.getElementsByTagName('coordinates');
            if (coordsDom.length > 0) {
                const parts = coordsDom[0].innerHTML.split(' ');
                const points = [];

                for (let i = 0; i < parts.length; i++) {
                    const cparts = parts[i].split(',');
                    const lng = cparts[0];
                    const lat = cparts[1];
                    points.push([lat, lng]);
                }

                const centroid = this.getCentroid(points);

                results.push({
                    attrs: attrs,
                    lat: centroid[0],
                    lng: centroid[1],
                    points: points,
                });
            }
        }
        return results;
    },

    getCentroid: function (arr) {
        return arr.reduce(
            function (x, y) {
                const ax = x[0] + y[0] / arr.length;
                const ay = x[1] + y[1] / arr.length;
                return [ax, ay];
            },
            [0, 0]
        );
    },

    search: async function (inquery, {_unused_latlng, _unused_zoom}) {
        if (!(await this.waitNoNewRequestsSent())) {
            return {error: 'Request cancelled'};
        }

        const query = inquery.trim();

        if (isNaN(query) || query.length > 12) {
            return {error: 'Nederīgs numurs'};
        }

        const url = new URL(this.options.queryUrl);
        url.searchParams.append('service', 'wfs');
        url.searchParams.append('version', '1.0.0');
        url.searchParams.append('request', 'getfeature');
        url.searchParams.append('typename', 'cp:CadastralParcel');
        url.searchParams.append('srsname', 'EPSG:4326');
        url.searchParams.append('outputFormat', 'KML');
        url.searchParams.append('cql_filter', `label like '%${query}%'`);

        let xhr;
        try {
            xhr = await fetch(url.href, {
                timeout: 5000,
            });
        } catch (e) {
            if (e.name === 'XMLHttpRequestPromiseError') {
                logging.captureException(e, 'Error response from grafws.kadastrs.lv');
                return {error: `Search failed: ${e.message}`};
            }
            throw e;
        }

        const kml = this.parseKml(xhr.response);

        const places = kml.map((it) => {
            const extra = {
                visible: ko.observable(false),
                items: [],
            };

            const iconcss = 'icons8 icons8-location';
            const html = `${it.attrs.areavalue} ${it.attrs.areavalue_uom}`;

            return {
                latlng: L.latLng(it.lat, it.lng),
                title: it.attrs.label,
                subtitle: html,
                address: null,
                category: null,
                icon: null,
                extra,
                iconcss,
            };
        });

        return {results: places};
    },
});

export {KadastrsProvider};
