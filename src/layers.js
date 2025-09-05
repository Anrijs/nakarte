import L from 'leaflet';
import '~/lib/leaflet.layer.soviet-topomaps-grid';
import {ImageTransformLayer} from '~/lib/leaflet.layer.ImageTransform';
import {LatviaTopoGrid} from '~/lib/leaflet.layer.latvia-topo-grid';
import {VesturesStastiLayer} from '~/lib/leaflet.layer.vesture';
import {RobezpunktiLayer} from '~/lib/leaflet.layer.robezpunkti';
import {DodiesLvLayer} from '~/lib/leaflet.layer.dodieslv';
import {sources} from '~/sources';

// Define layers and groups in sources.js
const layersDefs = [];
const groupsDefs = [];
const titlesByOrder = [
    // common base layers, last will be on top
    '#custom-bottom',
    '#custom-top',
];

function indexLayersByTitle(layersDefs) {
    return layersDefs.reduce((map, layer) => {
        map[layer.title] = layer;
        return map;
    }, {});
}

function buildGroup(groupDef, layersByTitle) {
    const collapse = groupDef.collapse === true;
    const layers = groupDef.layers.map((title) => {
        const layer = layersByTitle[title];
        if (!layer) {
            throw new Error(`Layer title not found in groupsDefs list: ${title}`);
        }
        layer.layer.group = groupDef.title;
        return layer;
    });

    return {
        group: groupDef.title,
        collapse,
        layers
    };
}

function groupLayers(layersDefs, groupsDefs) {
    const layersByTitle = indexLayersByTitle(layersDefs);
    return groupsDefs.map((groupDef) => buildGroup(groupDef, layersByTitle));
}

function getLefletLayer(layer, type, extras) {
    if (!layer.realurl && type !== "LatviaTopoGrid") {
        throw new Error(`Missing tiles url for layer ${layer.name}`);
    }

    switch (type) {
        case "TileLayer":
            return L.tileLayer(layer.realurl, extras);
        case "WMS":
            return L.tileLayer.wms(layer.realurl, extras);
        case "DodiesLvLayer":
            return new DodiesLvLayer(layer.realurl, extras);
        case "RobezpunktiLayer":
            return new RobezpunktiLayer(layer.realurl, extras);
        case "LatviaTopoGrid":
            return new LatviaTopoGrid(extras);
        case "VesturesStastiLayer":
            return new VesturesStastiLayer(layer.realurl, extras);
        case "ImageTransformLayer":
            return new ImageTransformLayer(layer.realurl, extras.anchors, extras);
        default:
            throw new Error(`Unknown layer type: ${type}`);
    }
}

function getLayers(tracklist) {
    // generate from sources
    const defaultOptions = {
        isOverlay: true,
        tms: false,
        print: true,
        jnx: true,
        scaleDependent: false,
        isOverlayTransparent: false,
        minZoom: 0,
        noOpacity: false,
        code: undefined,
        shortName: undefined,
        maxNativeZoom: undefined,
        hotkey: undefined,
        attribution: undefined,
        modkey: undefined,
        opacity: undefined,
    };

    const config = sources.config;

    for (let group of sources.groups) {
        let groupName = group.name;
        let layers = group.layers;
        let groupLayers = [];

        for (let layer of layers) {
            let title = `${layer.years ?? ''} ${layer.name} ${layer.scale ?? ''}`.trim();

            // Validate layer
            if (!layer.code) {
                if (!layer.name) {
                    continue;
                }
                throw new Error(`Missing code for layer ${title}`);
            }

            const type = layer.type || "TileLayer";
            const isDefault = layer.isDefault || false;
            let extras = {...defaultOptions, ...layer.extras || {}};

            extras.maxNativeZoom = layer.zoom || extras.maxNativeZoom;
            extras.maxZoom = config.maxZoom;
            extras.code = layer.code || extras.code;
            extras.shortName = layer.shortName || extras.shortName || extras.code;

            let lyr = {
                title: title,
                isDefault: isDefault,
                name: layer.name,
                years: layer.years,
                scale: layer.scale,
                layer: undefined,
                bbox: extras.bbox
            };

            layer.realurl = layer.url;
            if (!/^(https?:\/\/|:\/\/)/u.test(layer.realurl)) {
                layer.realurl = `${config.base}${layer.realurl}`;
            }

            lyr.layer = getLefletLayer(layer, type, extras);

            if (lyr.layer) {
                if (titlesByOrder.includes(title)) {
                    throw new Error(`Duplicate layer name: ${title}`);
                }
                layersDefs.push(lyr);
                titlesByOrder.splice(titlesByOrder.length - 1, 0, lyr.title);
                groupLayers.push(lyr.title);
            } else {
                throw new Error(`No layer created for: ${title}`);
            }
        }

        groupsDefs.push(
            {
                title: groupName,
                collapse: true,
                layers: groupLayers,
            }
        );
    }

    // assign order to layers
    const orderByTitle = {};
    for (let i = 0; i < titlesByOrder.length; i++) {
        let title = titlesByOrder[i];
        orderByTitle[title] = i + 1;
    }

    // order layers
    for (let layer of layersDefs) {
        const title = layer.title;
        layer.order = orderByTitle[title];
        layer.layer.tracklist = tracklist;
        layer.maxZoom = 21;
        layer.layer.meta = {
            name: layer.name,
            title: title,
            years: layer.years,
            scale: layer.scale,
        };
        if (!layer.order) {
            throw new Error(`Layer title not found in titlesByOrder list: ${title}`);
        }
    }

    // divide layers by groups
    const grouppedLayers = groupLayers(layersDefs, groupsDefs);

    return {
        layers: grouppedLayers,
        customLayersOrder: {
            top: orderByTitle['#custom-top'],
            bottom: orderByTitle['#custom-bottom'],

        }
    };
}

export {getLayers, layersDefs, groupsDefs, titlesByOrder};
