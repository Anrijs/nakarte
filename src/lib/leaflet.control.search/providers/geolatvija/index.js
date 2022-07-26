import ko from 'knockout';
import L from 'leaflet';

import * as logging from '~/lib/logging';
import {fetch} from '~/lib/xhr-promise';

import {BaseProvider} from '../remoteBase';

const icons = {
    'viensēta': 'house-with-a-garden',
    'skrajciems': 'village',
    'upe': 'creek',
    'kalns': 'hills',
    'ezers': 'lake',
    'kapsēta': 'cemetery',
    'mazciems': 'village',
    'mežs': 'forest',
    'purvs': 'swamp',
    'apvidus': 'region',
    'vidējciems': 'village',
    'dīķis': 'lake',
    'pļava': 'field',
    'pagasts': 'region',
    'strauts': 'creek',
    'pilsētas daļa': 'downtown',
    'dzirnavezers': 'lake',
    'pilskalns': 'top-of-a-hill',
    'bijušā ciema vieta': 'village',
    'sala': 'island-on-water',
    'vasarnīcu ciems': 'village',
    'lielciems': 'village',
    'dzc. pietura': 'tracks',
    'HES': 'dam',
    'karjers': 'spade',
    'krauja': 'cliff',
    'ferma': 'farm',
    'māja': 'house-with-a-garden',
    'novads': 'region',
    'vēsturiskā kapsēta': 'cemetery',
    'kanāls': 'creek',
    'pussala': 'island-on-water',
    'novada pilsēta': 'downtown',
    'viesnīca, viesu māja': 'house-with-a-garden',
    'avots': 'creek',
    'ala': 'cave',
    'upes līcis': 'creek',
    'klints': 'cliff',
    'formāli apstiprināts ciems': 'village',
    'aprūpes ciems': 'village',
    'atteka': 'creek',
    'lauks': 'field',
    'senkapi': 'cemetery',
    'rajons': 'region',
    'pilsēta ar lauku teritoriju': 'downtown',
    'nogāze': 'cliff',
    'republikas pilsēta': 'downtown',
    'būvējamais ciems': 'village',
    'dzc. stacija': 'tracks',
    'dzc. blokpostenis': 'tracks',
    'dzc. izmaiņas punkts': 'tracks',
    'galvaspilsēta': 'downtown',
    'baznīca': 'chapel',
    'pilsdrupas': 'castle',
    'vēsturiskā pils': 'castle',
};

const GeoLatvijaProvider = BaseProvider.extend({
    name: 'Vietvārdu datubāze',
    description: '<a href="https://geolatvija.lv/geo/p/303">https://geolatvija.lv/geo/p/303</a>',
    options: {
        apiUrl: 'https://anrijs.lv/dodi.php',
        attribution: {
            text: 'anrijs.lv',
            url: 'https://anrijs.lv',
        },
        delay: 500,
        languages: ['lv'],
        categoriesLanguages: ['lv'],
        defaultLanguage: 'lv',
        tooltip: 'Meklēt vietvārdu datubāzē',
    },

    initialize: function (options) {
        BaseProvider.prototype.initialize.call(this, options);
        this.langStr = this.getRequestLanguages(this.options.languages).join(',');
        this.categoriesLanguage = this.getRequestLanguages(
            this.options.categoriesLanguages,
            this.options.defaultLanguage
        )[0];
    },

    search: async function (query, {latlng, zoom}) {
        if (!(await this.waitNoNewRequestsSent())) {
            return {error: 'Request cancelled'};
        }

        const url = new URL(this.options.apiUrl);
        url.searchParams.append('q', query);
        url.searchParams.append('lat', latlng.lat);
        url.searchParams.append('lng', latlng.lng);
        url.searchParams.append('z', zoom);
        let xhr;
        try {
            xhr = await fetch(url.href, {
                responseType: 'json',
                timeout: 5000,
                referrer: 'anrijs.lv',
            });
        } catch (e) {
            if (e.name === 'XMLHttpRequestPromiseError') {
                logging.captureException(e, 'Error response from mapy.cz search api');
                return {error: `Search failed: ${e.message}`};
            }
            throw e;
        }

        const places = xhr.responseJSON.map((it) => {
            let html = `${it.galv_novads}, agrāk ${it.galv_rajons_agrak}`;
            const extra = {
                visible: ko.observable(false),
                items: [],
            };

            if (it.galv_pagasts.length > 0) {
                html = `${it.galv_pagasts}, ${html}`;
            }

            if (it.citi_nosaukumi.length) {
                html += `<br>Citi nosaukumi: ${it.citi_nosaukumi}`;
            }

            if (it.raksturojums.length) {
                extra.items.push({key: 'Raksturojums', value: it.raksturojums});
            }

            if (it.zinas_par_objektu.length) {
                extra.items.push({key: 'Ziņas par objektu', value: it.zinas_par_objektu});
            }

            if (it.papildus_zinas_par_nosaukumu.length) {
                extra.items.push({key: 'Papildus ziņas par nosaukumu', value: it.papildus_zinas_par_nosaukumu});
            }

            if (it.stavoklis.trim() !== 'pastāv') {
                html += `<br>- Stāvoklis: ${it.stavoklis}`;
            }

            let iconcss = null;
            const veids = it.objekta_veids.trim();
            if (veids in icons) {
                iconcss = `icons8 icons8-${icons[veids]}`;
            }

            const place = {
                latlng: L.latLng(it.latitude, it.longitude),
                title: it.pamatnosaukums,
                subtitle: html,
                address: null,
                category: null,
                icon: null,
                extra,
                iconcss,
                onShowDetailsClick: function () {
                    extra.visible(!extra.visible());
                },
            };

            return place;
        });

        return {results: places};
    },
});

export {GeoLatvijaProvider};
