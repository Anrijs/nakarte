import L from 'leaflet';
import './style.css';
import enableTopRow from '~/lib/leaflet.control.layers.top-row';
import ko from 'knockout';
import {notify} from '~/lib/notifications';
import * as logging from '~/lib/logging';
import safeLocalStorage from '~/lib/safe-localstorage';
import './customLayer';
import config from '~/config';
import {LeafletCompare} from '~/lib/leaflet.control.compare';

function enableConfig(control, {layers, customLayersOrder}) {
    const originalOnAdd = control.onAdd;
    const originalUnserializeState = control.unserializeState;
    const originalAddItem = control._addItem;
    if (control._configEnabled) {
        return;
    }
    enableTopRow(control);

    L.Util.extend(control, {
            _configEnabled: true,
            _allLayersGroups: layers,
            _allLayers: [].concat(...layers.map((group) => group.layers)),
            _customLayers: ko.observableArray(),

            onAdd: function(map) {
                const container = originalOnAdd.call(this, map);
                this.__injectConfigButton();
                return container;
            },

            _initializeHotkeys() {
                L.DomEvent.on(document, 'keydown', this._onKeyDown, this);
            },

            _onKeyDown: function(e) {
                const targetTag = e.target.tagName.toLowerCase();
                if (
                    (targetTag === 'input' && ['text', 'search', 'number'].includes(e.target.type)) ||
                    targetTag === 'textarea'
                ) {
                    return;
                }

                if (typeof this._layerIndex === 'undefined') {
                    this._layerIndex = -1;
                }

                const overlays = [...this._allLayers, ...this._customLayers()]
                    .filter((l) => l.enabled && l.layer.options.isOverlay);
                overlays.sort((l1, l2) => l1.order - l2.order);

                if (e.keyCode === 188) { // [<] prev
                    this._layerIndex -= 1;
                    if (this._layerIndex < 0) {
                        this._layerIndex = overlays.length - 1;
                    }
                } else if (e.keyCode === 190) { // [>] next
                    this._layerIndex += 1;
                    if (this._layerIndex >= overlays.length) {
                        this._layerIndex = 0;
                    }
                } else {
                    return;
                }

                overlays.forEach((layer, id) => {
                    if (id === this._layerIndex) {
                        this._map.addLayer(layer.layer);
                    } else {
                        this._map.removeLayer(layer.layer);
                    }
                    layer.checked(id === this._layerIndex);
                });
            },

            __injectConfigButton: function() {
                const configButton = L.DomUtil.create('div', 'button icon-settings');
                configButton.title = 'Configure layers';
                this._topRow.appendChild(configButton);
                L.DomEvent.on(configButton, 'click', this._onConfigButtonClick, this);

                const newCustomLayerButton = L.DomUtil.create('div', 'button icon-edit');
                newCustomLayerButton.title = 'Add custom layer';
                this._topRow.appendChild(newCustomLayerButton);
                L.DomEvent.on(newCustomLayerButton, 'click', this.onCustomLayerCreateClicked, this);

                const compareButton = L.DomUtil.create('div', 'button button-text');
                compareButton.title = 'Add custom layer';
                compareButton.innerText = "Compare";
                this._topRow.appendChild(compareButton);
                L.DomEvent.on(compareButton, 'click', this.onCompareButtonClicked, this);

                const compareSliderButton = L.DomUtil.create('div', 'button button-alt icon-split');
                compareSliderButton.title = 'Split View';
                L.DomEvent.on(compareSliderButton, 'click', this.onCompareModeClicked, this);

                const compareMagnifyButton = L.DomUtil.create('div', 'button button-alt icon-layer-search');
                compareMagnifyButton.title = 'Explore View';
                L.DomEvent.on(compareMagnifyButton, 'click', this.onCompareModeClicked, this);

                this.__compareButtons = [
                    [0, compareSliderButton],
                    [1, compareMagnifyButton]
                ];
            },

            _initializeLayersState: function() {
                let storedLayersEnabled = {};
                const serialized = safeLocalStorage.getItem('layersEnabled');
                if (serialized) {
                    try {
                        storedLayersEnabled = JSON.parse(serialized);
                    } catch (e) {
                        logging.captureMessage('Failed to load enabled layers from localstorage - invalid json', {
                            "localstorage.layersEnabled": serialized.slice(0, 1000)
                        });
                    }
                }
                // restore custom layers;
                // custom layers can be upgraded in loadCustomLayerFromString and their code will change
                const storedLayersEnabled2 = {};
                for (let [code, isEnabled] of Object.entries(storedLayersEnabled)) {
                    let newCode = this.loadCustomLayerFromString(code) || code;
                    storedLayersEnabled2[newCode] = isEnabled;
                }

                for (let layer of [...this._allLayers, ...this._customLayers()]) {
                    let enabled = storedLayersEnabled2[layer.layer.options.code];
                    // if storage is empty enable only default layers
                    // if new default layer appears it will be enabled
                    if (typeof enabled === 'undefined') {
                        enabled = layer.isDefault;
                    }
                    layer.enabled = enabled;
                    layer.checked = ko.observable(enabled);
                    layer.description = layer.description || '';
                    layer.__compareSide = 'L';
                }
                this.updateEnabledLayers();
            },

            _onConfigButtonClick: function() {
                this.showLayersSelectWindow();
            },

            _initLayersSelectWindow: function() {
                if (this._configWindow) {
                    return;
                }

                var layerGroups = [];

                for (let grp of this._allLayersGroups) {
                    const grpModel = {
                        raw: grp,
                        group: grp.group,
                        layers: grp.layers,
                        collapsed: ko.observable(grp.collapse)
                    };

                    layerGroups.push(grpModel);
                }

                const dialogModel = {
                    self: this,
                    layerGroups: layerGroups,
                    customLayers: this._customLayers,
                    onSelectWindowCancelClicked: function() {
                        dialogModel.self.hideSelectWindow();
                    },
                    onSelectWindowResetClicked: function() {
                        if (!dialogModel.self._configWindow) {
                            return;
                        }
                        [
                            ...dialogModel.self._allLayers,
                            ...dialogModel.self._customLayers()
                        ].forEach((layer) => layer.checked(layer.isDefault));
                    },
                    onSelectWindowSelNoneClicked: function() {
                        if (!dialogModel.self._configWindow) {
                            return;
                        }
                        [
                            ...dialogModel.self._allLayers,
                            ...dialogModel.self._customLayers()
                        ].forEach((l) => l.checked(l.isDefault && !l.layer.options.isOverlay));
                    },
                    onSelectWindowSelAllClicked: function() {
                        if (!dialogModel.self._configWindow) {
                            return;
                        }
                        [
                            ...dialogModel.self._allLayers,
                            ...dialogModel.self._customLayers()
                        ].forEach((l) => l.checked(true));
                    },
                    onSelectWindowOkClicked: function() {
                        const newEnabledLayers = [];
                        for (let layer of [...dialogModel.self._allLayers, ...dialogModel.self._customLayers()]) {
                            if (layer.checked()) {
                                if (!layer.enabled) {
                                    newEnabledLayers.push(layer);
                                }
                                layer.enabled = true;
                            } else {
                                layer.enabled = false;
                            }
                        }
                        dialogModel.self.updateEnabledLayers(newEnabledLayers);
                        dialogModel.self.hideSelectWindow();
                    },
                    toggleLayer: function(grp) {
                        return grp.collapsed(!grp.collapsed());
                    },
                    toggledHtml: function(grp) {
                        return grp.collapsed() ? "[+]" : "[-]";
                    }
                };

                const container = this._configWindow =
                    L.DomUtil.create('div', 'leaflet-layers-dialog-wrapper');
                L.DomEvent
                    .disableClickPropagation(container)
                    .disableScrollPropagation(container);
                container.innerHTML = `
<div class="leaflet-layers-select-window">
    <form>
        <!-- ko foreach: { data:layerGroups, as: 'grp' } -->
            <div class="section-header section-header-toggle" data-bind="click: $parent.toggleLayer">
                <label>
                    <span style="font-family: monospace;" data-bind="text: $parent.toggledHtml(grp)"></span>
                    <span data-bind="html: grp.group"></span>
                </label>
            </div>
            <!-- ko foreach: layers -->
                <label style="margin-left: 16px;" data-bind="if: !grp.collapsed()">
                    <input type="checkbox" data-bind="checked: checked"/>
                    <span data-bind="text: title">
                    </span><!--  ko if: description -->
                    <span data-bind="html: description || ''"></span>
                    <!-- /ko -->
                </label>
            <!-- /ko -->
        <!-- /ko -->
        <div data-bind="if: customLayers().length" class="section-header">Custom layers</div>
        <!-- ko foreach: customLayers -->
                <label>
                    <input type="checkbox" data-bind="checked: checked"/>
                    <span data-bind="text: title"></span>
                </label>
        <!-- /ko -->
    </form>
    <div class="buttons-row">
        <div href="#" class="button" data-bind="click: onSelectWindowOkClicked">Ok</div>
        <div href="#" class="button" data-bind="click: onSelectWindowCancelClicked">Cancel</div>
        <div href="#" class="button button-sm" data-bind="click: onSelectWindowResetClicked">Reset</div>
        <div href="#" class="button button-sm" data-bind="click: onSelectWindowSelNoneClicked">None</div>
        <div href="#" class="button button-sm" data-bind="click: onSelectWindowSelAllClicked">All</div>
    </div>
</div>
                `;
                ko.applyBindings(dialogModel, container);
            },

            showLayersSelectWindow: function() {
                if (this._configWindowVisible || this._customLayerWindow) {
                    return;
                }
                [...this._allLayers, ...this._customLayers()].forEach((layer) => layer.checked(layer.enabled));
                this._initLayersSelectWindow();
                this._map._controlContainer.appendChild(this._configWindow);
                this._configWindowVisible = true;
            },

            hideSelectWindow: function() {
                if (!this._configWindowVisible) {
                    return;
                }
                this._map._controlContainer.removeChild(this._configWindow);
                this._configWindowVisible = false;
            },

            onCustomLayerCreateClicked: function() {
                this.showCustomLayerForm(
                    [
                        {
                            caption: 'Add layer',
                            callback: (fieldValues) => this.onCustomLayerAddClicked(fieldValues)
                        },
                        {
                            caption: 'Cancel',
                            callback: () => this.onCustomLayerCancelClicked()
                        }
                    ],
                    {
                        name: 'Custom layer',
                        url: '',
                        tms: false,
                        maxZoom: 18,
                        isOverlay: false,
                        scaleDependent: false,
                        isTop: true,
                        type: 'tiles',
                        wmsLayers: '',
                        wmsFormat: '',
                        wmsTransparent: true,
                    }
                );
            },

            compareLayers: function() {
                let leftList = [];
                let rightList = [];

                const enabledLayers = [...this._allLayers, ...this._customLayers()].filter((l) => l.enabled);
                enabledLayers.sort((l1, l2) => l1.order - l2.order);
                enabledLayers.forEach((l) => {
                        const {layer: {options: {isOverlay}}} = l;
                        if (isOverlay && l.layer.getContainer) {
                            if (this._map.hasLayer(l.layer)) {
                                if (l.layer.__compareSide === 'R') {
                                    rightList.push(l.layer);
                                } else if (l.layer.__compareSide === 'L') {
                                    leftList.push(l.layer);
                                }
                            }
                        }
                    }
                );

                if (this.compare) {
                    this.compare.updateLayers(leftList, rightList);
                } else {
                    this.compare = new LeafletCompare(leftList, rightList, {
                        thumbSize: 36,
                        padding: 0,
                        width: 2,
                    });
                    this.compare.addTo(this._map);
                }
            },

            onCompareButtonClicked: function(e) {
                if (this.compareEnabled) {
                    e.target.classList.remove("button-active");
                    this.__compareButtons.forEach((b) => this._topRow.removeChild(b[1]));
                    this.compareEnabled = false;
                    this.compare.remove();
                    this.compare = null;
                } else {
                    e.target.classList.add("button-active");
                    this.__compareButtons.forEach((b) => this._topRow.appendChild(b[1]));
                    this.__compareButtons[0][1].click();
                    this.compareEnabled = true;
                    this.compareLayers();
                }
                this.updateEnabledLayers();
            },

            onCompareModeClicked: function(e) {
                let id = 0;
                this.__compareButtons.forEach((b) => {
                    b[1].classList.remove("button-active-alt");
                    if (b[1] === e.target) {
                        id = b[0];
                    }
                });
                e.target.classList.add("button-active-alt");
                if (this.compare) {
                    this.compare.setMode(id);
                }
                this.updateEnabledLayers();
            },

            updateEnabledLayers: function(addedLayers) {
                const disabledLayers = [...this._allLayers, ...this._customLayers()].filter((l) => !l.enabled);
                disabledLayers.forEach((l) => this._map.removeLayer(l.layer));
                [...this._layers].forEach((l) => this.removeLayer(l.layer));

                let hasBaselayerOnMap = false;
                const enabledLayers = [...this._allLayers, ...this._customLayers()].filter((l) => l.enabled);
                enabledLayers.sort((l1, l2) => l1.order - l2.order);
                enabledLayers.forEach((l) => {
                        l.layer._justAdded = addedLayers && addedLayers.includes(l);
                        const {layer: {options: {isOverlay}}} = l;

                        if (isOverlay) {
                            this.addOverlay(l.layer, l.title);
                        } else {
                            this.addBaseLayer(l.layer, l.title);
                        }
                        if (!isOverlay && this._map.hasLayer(l.layer)) {
                              hasBaselayerOnMap = true;
                        }

                        if (!l.layer.__compareSide) {
                            l.layer.__compareSide = 'L';
                        }
                    }
                );
                // если нет активного базового слоя, включить первый, если он есть
                if (!hasBaselayerOnMap) {
                    for (let layer of enabledLayers) {
                        if (!layer.layer.options.isOverlay) {
                            this._map.addLayer(layer.layer);
                            break;
                        }
                    }
                }
                this.storeEnabledLayers();
            },

            storeEnabledLayers: function() {
                const layersState = {};
                for (let layer of [...this._allLayers, ...this._customLayers()]) {
                    if (layer.isDefault || layer.enabled || layer.isCustom) {
                        layersState[layer.layer.options.code] = layer.enabled;
                    }
                }
                const serialized = JSON.stringify(layersState);
                safeLocalStorage.setItem('layersEnabled', serialized);
            },

            unserializeState: function(values) {
                if (values) {
                    values = values.map((code) => {
                        let newCode = this.loadCustomLayerFromString(code);
                        return newCode || code;
                    });
                    for (let layer of [...this._allLayers, ...this._customLayers()]) {
                        if (layer.layer.options && values.includes(layer.layer.options.code)) {
                            layer.enabled = true;
                        }
                    }
                    this.updateEnabledLayers();
                }
                this.storeEnabledLayers();
                return originalUnserializeState.call(this, values);
            },

            showLayerOpacityForm: function(buttons, options) {
                if (this._layerOpacityWindow || this._configWindowVisible) {
                    return;
                }
                this._layerOpacityWindow =
                    L.DomUtil.create('div', 'leaflet-layers-dialog-wrapper', this._map._controlContainer);

                L.DomEvent
                    .disableClickPropagation(this._layerOpacityWindow)
                    .disableScrollPropagation(this._layerOpacityWindow);

                let customLayerWindow = L.DomUtil.create('div', 'custom-layers-window', this._layerOpacityWindow);
                let form = L.DomUtil.create('form', '', customLayerWindow);
                L.DomEvent.on(form, 'submit', L.DomEvent.preventDefault);

                const dialogModel = {
                    opacity: ko.observable(Math.round(options.opacity * 100)),
                    buttons: buttons,
                    buttonClicked: function buttonClicked(callbackN) {
                        const retValues = {
                            opacity: dialogModel.opacity() / 100
                        };
                        buttons[callbackN].callback(retValues);
                    }
                };

/* eslint-disable max-len */
                const formHtml = `<b><u>Change layer opacity</u></b><br><br>
<label>New opacity: &nbsp;<input type="number" data-bind="value: opacity" min="0" max="100" step="1"></input>%</label><br/>
<br>
<div data-bind="foreach: buttons">
    <a class="button" data-bind="click: $root.buttonClicked.bind(null, $index()), text: caption"></a>
</div>`;
/* eslint-enable max-len */
                form.innerHTML = formHtml;
                ko.applyBindings(dialogModel, form);
            },

            showCustomLayerForm: function(buttons, fieldValues) {
                if (this._customLayerWindow || this._configWindowVisible) {
                    return;
                }
                this._customLayerWindow =
                    L.DomUtil.create('div', 'leaflet-layers-dialog-wrapper', this._map._controlContainer);

                L.DomEvent
                    .disableClickPropagation(this._customLayerWindow)
                    .disableScrollPropagation(this._customLayerWindow);

                let customLayerWindow = L.DomUtil.create('div', 'custom-layers-window', this._customLayerWindow);
                let form = L.DomUtil.create('form', '', customLayerWindow);
                L.DomEvent.on(form, 'submit', L.DomEvent.preventDefault);

                const dialogModel = {
                    name: ko.observable(fieldValues.name),
                    url: ko.observable(fieldValues.url),
                    tms: ko.observable(fieldValues.tms),
                    scaleDependent: ko.observable(fieldValues.scaleDependent),
                    maxZoom: ko.observable(fieldValues.maxZoom),
                    isOverlay: ko.observable(fieldValues.isOverlay),
                    isTop: ko.observable(fieldValues.isTop),
                    type: ko.observable(fieldValues.type),
                    wmsLayers: ko.observable(fieldValues.wmsLayers),
                    wmsFormat: ko.observable(fieldValues.wmsFormat),
                    wmsTransparent: ko.observable(fieldValues.wmsTransparent),
                    buttons: buttons,
                    availableWmsData: {
                        layers: ko.observableArray(),
                        formats: ko.observableArray(),
                        selectedLayer: ko.observable(),
                        selectedFormat: ko.observable(),
                        received: ko.observable(false),
                        error: ko.observable(""),
                    },
                    buttonClicked: function buttonClicked(callbackN) {
                        const fieldValues = {
                            name: dialogModel.name().trim(),
                            url: dialogModel.url().trim(),
                            tms: dialogModel.tms(),
                            scaleDependent: dialogModel.scaleDependent(),
                            maxZoom: dialogModel.maxZoom(),
                            isOverlay: dialogModel.isOverlay(),
                            isTop: dialogModel.isTop(),
                            type: dialogModel.type(),
                            wmsLayers: dialogModel.wmsLayers(),
                            wmsFormat: dialogModel.wmsFormat(),
                            wmsTransparent: dialogModel.wmsTransparent(),
                        };
                        buttons[callbackN].callback(fieldValues);
                    },
                    isWMS: function isWMS() {
                        return this.type() === 'wms';
                    },
                    testWMS: function testWMS() {
                        // get wms capabilities
                        const url = `${dialogModel.url().split('?')[0]}?request=GetCapabilities&service=WMS`;
                        const xhr = new XMLHttpRequest();
                        xhr.onload = () => {
                            dialogModel.availableWmsData.layers.removeAll();
                            dialogModel.availableWmsData.formats.removeAll();

                            const capability = xhr.responseXML.getElementsByTagName("GetMap")[0];
                            if (!capability) {
                                dialogModel.availableWmsData.error("Failed to get WMS capabilities");
                                return;
                            }

                            const validFormats = [
                                "image/png",
                                "image/gif",
                                "image/png",
                                "image/gif",
                                "image/jpeg",
                                "image/svg",
                            ];

                            for (let format of capability.getElementsByTagName("Format")) {
                                const formatStr = format.textContent;
                                if (validFormats.includes(formatStr)) {
                                    dialogModel.availableWmsData.formats.push(formatStr);
                                }
                            }

                            const layers = xhr.responseXML.getElementsByTagName("Layer");
                            for (let layer of layers) {
                                if (layer.getAttribute("queryable") === '1') {
                                    const name = layer.getElementsByTagName('Name')[0].textContent;
                                    const title = `${layer.getElementsByTagName('Title')[0].textContent} - ${name}`;
                                    dialogModel.availableWmsData.layers.push({
                                        name: name,
                                        title: title
                                    });
                                }
                            }

                            dialogModel.availableWmsData.error("");
                            dialogModel.availableWmsData.received(true);
                        };
                        xhr.onerror = () => {
                            dialogModel.availableWmsData.error("Failed to get WMS capabilities");
                            dialogModel.availableWmsData.received(false);
                        };

                        xhr.open("GET", url);
                        xhr.responseType = "document";
                        xhr.send();
                    },
                    wmsAppendLayer: function wmsAppendLayer() {
                        let layersStr = dialogModel.wmsLayers() ?? '';
                        if (layersStr.trim()) {
                            layersStr += ',';
                        }
                        layersStr += dialogModel.availableWmsData.selectedLayer();
                        dialogModel.wmsLayers(layersStr);
                    },
                    wmsSetFormat: function wmsSetFormat() {
                        dialogModel.wmsFormat(dialogModel.availableWmsData.selectedFormat());
                    }
                };

                let zooms = '9';
                for (let z = 10; z <= config.maxZoom; z++) {
                    zooms += `,${z}`;
                }
/* eslint-disable max-len */
                const formHtml = `
<p><a class="doc-link" href="https://leafletjs.com/reference-1.0.3.html#tilelayer" target="_blank">See Leaflet TileLayer documentation for url format</a></p>
<label>Layer name<br/>
<span class="hint">Maximum 40 characters</span><br/>
<input maxlength="40" class="layer-name" data-bind="value: name"/></label><br/>
<label ><input type="radio" name="map_type" value="tiles" data-bind="checked: type">Tile Layer</label>
<label ><input type="radio" name="map_type" value="wms" data-bind="checked: type">WMS</label><br>
<label>Tile url template<br/><textarea data-bind="value: url" class="layer-url"></textarea></label><br/>
<label><input type="radio" name="overlay" data-bind="checked: isOverlay, checkedValue: false">Base layer</label><br/>
<label><input type="radio" name="overlay" data-bind="checked: isOverlay, checkedValue: true">Overlay</label><br/>
<hr/>
<label><input type="radio" name="top-or-bottom"
        data-bind="checked: isTop, checkedValue: false, enable: isOverlay">Place below other layers</label><br/>
<label><input type="radio" name="top-or-bottom"
        data-bind="checked: isTop, checkedValue: true, enable: isOverlay">Place above other layers</label><br/>
<hr/>

<div data-bind="hidden: isWMS()">
<label><input type="checkbox" data-bind="checked: scaleDependent"/>Content depends on scale(like OSM or Google maps)</label><br/>
<label><input type="checkbox" data-bind="checked: tms" />TMS rows order</label><br/>
<label>Max zoom<br>
<select data-bind="options: [${zooms}], value: maxZoom,"></select></label>
</div>
<div data-bind="visible: isWMS()">
<b>WMS Settings</b><div class="button button-text button-sm button-right" data-bind="visible: isWMS(), click: testWMS.bind(null)">Get capabilities</div><br>
<div data-bind="visible: availableWmsData.error">
<span class="error" data-bind="text: availableWmsData.error"></span>
</div>
<label>Layers<br/>
<input maxlength="120" class="layer-name" data-bind="value: wmsLayers"/></label>
<div data-bind="visible: availableWmsData.received">
    <select data-bind="options: availableWmsData.layers(), optionsValue: 'name', optionsText: 'title', value: availableWmsData.selectedLayer"></select>
    <div class="button button-sm button-plus" data-bind="click: wmsAppendLayer.bind(null)">+</div><br/>
</div>
<label>Format<br/>
<input maxlength="80" class="layer-name" placeholder="image/jpeg" data-bind="value: wmsFormat"/></label>
<div data-bind="visible: availableWmsData.received">
<select data-bind="options: availableWmsData.formats(), value: availableWmsData.selectedFormat"></select>
<div class="button button-sm button-plus" data-bind="click: wmsSetFormat.bind(null)">Set</div><br/>
</div>
<label><input type="checkbox" data-bind="checked: wmsTransparent"/> Transparent</label><br/>
<br/>
</div>
</div>

<div data-bind="foreach: buttons">
    <a class="button" data-bind="click: $root.buttonClicked.bind(null, $index()), text: caption"></a>
</div>`;
/* eslint-enable max-len */
                form.innerHTML = formHtml;
                ko.applyBindings(dialogModel, form);
            },

            updateCompareButton: function(obj, editButton) {
                editButton.classList.remove('icon-left');
                editButton.classList.remove('icon-right');
                editButton.classList.remove('icon-left-right');
                editButton.classList.remove('icon-layer-search');
                editButton.classList.remove('icon-background');

                if (this.compare && this.compare._mode === 1) {
                    if (obj.layer.__compareSide === 'L') {
                        editButton.classList.add('icon-layer-search');
                    } else {
                        editButton.classList.add('icon-background');
                    }
                } else {
                    if (obj.layer.__compareSide === 'L') {
                        editButton.classList.add('icon-left');
                    } else if (obj.layer.__compareSide === 'R') {
                        editButton.classList.add('icon-right');
                    } else {
                        editButton.classList.add('icon-left-right');
                    }
                }
            },

            onLayerSideClicked: function(obj, editButton, e) {
                L.DomEvent.stop(e);

                switch (obj.layer.__compareSide) {
                    case 'L':
                        if (this.compare && this.compare._mode === 1) {
                            obj.layer.__compareSide = 'R';
                        } else {
                            obj.layer.__compareSide = '-';
                        }
                        break;
                    case '-':
                        obj.layer.__compareSide = 'R';
                        break;
                    default:
                        obj.layer.__compareSide = 'L';
                        break;
                }

                this.updateCompareButton(obj, editButton);
                this.compareLayers();
            },

            _addItem: function(obj) {
                var label = originalAddItem.call(this, obj);
                if (obj.layer.__customLayer) {
                    const editButton = L.DomUtil.create('div', 'layer-extra-button icon-edit', label.children[0]);
                    editButton.title = 'Edit layer';
                    L.DomEvent.on(editButton, 'click', (e) =>
                        this.onCustomLayerEditClicked(obj.layer.__customLayer, e)
                    );
                }
                if (obj.layer.options.isOverlay && this.compareEnabled) {
                    const editButton = L.DomUtil.create('div', 'layer-extra-button', label.children[0]);
                    editButton.title = 'Change side';
                    this.updateCompareButton(obj, editButton);

                    L.DomEvent.on(editButton, 'click', (e) =>
                        this.onLayerSideClicked(obj, editButton, e)
                    );
                }
                if (obj.layer.options.isOverlay && !obj.layer.options.noOpacity) {
                    const settingsButton = L.DomUtil.create(
                        'div',
                        'layer-extra-button layer-extra-button-text icon-opacity',
                        label.children[0]
                    );
                    settingsButton.title = 'Opacity';

                    const opacityValue = L.DomUtil.create('span', 'layer-opacity-value', settingsButton);
                    opacityValue.innerText = (obj.layer.options.opacity * 100) + "%";

                    L.DomEvent.on(settingsButton, 'click', (e) =>
                        this.onOpacityEditClicked(obj.layer, opacityValue, e)
                    );
                }
                if (obj.layer._justAdded) {
                    L.DomUtil.addClass(label, 'leaflet-layers-configure-just-added-1');
                    setTimeout(() => {
                        L.DomUtil.addClass(label, 'leaflet-layers-configure-just-added-2');
                    }, 0);
                }
                return label;
            },

            serializeCustomLayer: function(fieldValues) {
                let s = JSON.stringify(fieldValues);
                s = s.replace(/[\u007f-\uffff]/ug,
                    function(c) {
                        return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
                    }
                );

                function encodeUrlSafeBase64(s) {
                    return btoa(s)
                        .replace(/\+/ug, '-')
                        .replace(/\//ug, '_');
                }

                return '-cs' + encodeUrlSafeBase64(s);
            },

            customLayerExists: function(fieldValues, ignoreLayer) {
                const serialized = this.serializeCustomLayer(fieldValues);
                for (let layer of this._customLayers()) {
                    if (layer !== ignoreLayer && layer.serialized === serialized) {
                        return layer;
                    }
                }
                return false;
            },

            checkCustomLayerValues: function(fieldValues) {
                if (!fieldValues.url) {
                    return {error: 'Url is empty'};
                }
                if (!fieldValues.name) {
                    return {error: 'Name is empty'};
                }
                return {};
            },

            onCustomLayerAddClicked: function(fieldValues) {
                const error = this.checkCustomLayerValues(fieldValues).error;
                if (error) {
                    notify(error);
                    return;
                }

                const duplicateLayer = this.customLayerExists(fieldValues);
                if (duplicateLayer) {
                    let msg = 'Same layer already exists';
                    if (!duplicateLayer.enabled) {
                        msg += ' but it is hidden. You can enable it in layers setting.';
                    }
                    notify(msg);
                    return;
                }

                const layer = this.createCustomLayer(fieldValues);
                layer.enabled = true;
                layer.checked = ko.observable(true);
                this._customLayers.push(layer);
                this.hideCustomLayerForm();
                this.updateEnabledLayers();
            },

            createCustomLayer: function(fieldValues) {
                const serialized = this.serializeCustomLayer(fieldValues);
                let tileLayer;

                if (fieldValues.type === 'wms') {
                    const options = {
                        isOverlay: fieldValues.isOverlay,
                        maxNativeZoom: fieldValues.maxZoom,
                        maxZoom: config.maxZoom,
                        code: serialized,
                        layers: fieldValues.wmsLayers,
                        format: fieldValues.wmsFormat,
                        transparent: fieldValues.wmsTransparent,
                    };
                    Object.keys(options).forEach((key) => {
                        if (options[key] === '') {
                          delete options[key];
                        }
                      });
                    tileLayer = L.tileLayer.wms(fieldValues.url.split('?')[0], options);
                    delete tileLayer.wmsParams['isOverlay'];
                    delete tileLayer.wmsParams['maxNativeZoom'];
                    delete tileLayer.wmsParams['maxZoom'];
                    delete tileLayer.wmsParams['code'];
                } else {
                    tileLayer = new L.Layer.CustomLayer(fieldValues.url, {
                        isOverlay: fieldValues.isOverlay,
                        tms: fieldValues.tms,
                        maxNativeZoom: fieldValues.maxZoom,
                        maxZoom: config.maxZoom,
                        scaleDependent: fieldValues.scaleDependent,
                        print: true,
                        jnx: true,
                        code: serialized,
                        noCors: true,
                        isTop: fieldValues.isTop
                    });
                }

                const customLayer = {
                    title: fieldValues.name,
                    isDefault: false,
                    isCustom: true,
                    serialized: serialized,
                    layer: tileLayer,
                    order:
                        (fieldValues.isOverlay && fieldValues.isTop) ? customLayersOrder.top : customLayersOrder.bottom,
                    fieldValues: fieldValues,
                    enabled: true,
                    checked: ko.observable(true)
                };
                tileLayer.__customLayer = customLayer;
                return customLayer;
            },

            onCustomLayerCancelClicked: function() {
                this.hideCustomLayerForm();
            },

            onLayerOpacityCancelClicked: function() {
                this.hideLayerOpacityForm();
            },

            hideCustomLayerForm: function() {
                if (!this._customLayerWindow) {
                    return;
                }
                this._customLayerWindow.parentNode.removeChild(this._customLayerWindow);
                this._customLayerWindow = null;
            },
            hideLayerOpacityForm: function() {
                if (!this._layerOpacityWindow) {
                    return;
                }
                this._layerOpacityWindow.parentNode.removeChild(this._layerOpacityWindow);
                this._layerOpacityWindow = null;
            },

            onCustomLayerEditClicked: function(layer, e) {
                L.DomEvent.stop(e);
                this.showCustomLayerForm([
                    {
                        caption: 'Save',
                        callback: (fieldValues) => this.onCustomLayerChangeClicked(layer, fieldValues),
                    },
                    {caption: 'Delete', callback: () => this.onCustomLayerDeletelClicked(layer)},
                        {caption: 'Cancel', callback: () => this.onCustomLayerCancelClicked()}
                    ], layer.fieldValues
                );
            },

            onOpacityEditClicked: function(layer, opacityValue, e) {
                L.DomEvent.stop(e);
                this.showLayerOpacityForm([
                    {
                        caption: 'Save',
                        callback: (fieldValues) => {
                            layer.setOpacity(fieldValues.opacity);
                            opacityValue.innerText = Math.round(fieldValues.opacity * 100) + "%";
                            this.updateEnabledLayers();
                            this.hideLayerOpacityForm();
                        }
                    },
                    {caption: 'Cancel', callback: () => this.onLayerOpacityCancelClicked()}
                    ], layer.options
                );
            },

            onCustomLayerChangeClicked: function(layer, newFieldValues) {
                const error = this.checkCustomLayerValues(newFieldValues).error;
                if (error) {
                    notify(error);
                    return;
                }
                const duplicateLayer = this.customLayerExists(newFieldValues, layer);
                if (duplicateLayer) {
                    let msg = 'Same layer already exists';
                    if (!duplicateLayer.enabled) {
                        msg += ' but it is hidden. You can enable it in layers setting.';
                    }
                    notify(msg);
                    return;
                }

                const layerPos = this._customLayers.indexOf(layer);
                this._customLayers.remove(layer);

                const newLayer = this.createCustomLayer(newFieldValues);
                this._customLayers.splice(layerPos, 0, newLayer);
                const newLayerVisible = (
                    this._map.hasLayer(layer.layer) &&
                    // turn off layer if changing from overlay to baselayer
                    (!layer.layer.options.isOverlay || newLayer.layer.options.isOverlay)
                );
                if (newLayerVisible) {
                    this._map.addLayer(newLayer.layer);
                }
                this._map.removeLayer(layer.layer);
                this.updateEnabledLayers();
                if (newLayerVisible) {
                    newLayer.layer.fire('add');
                }
                this.hideCustomLayerForm();
            },

            onCustomLayerDeletelClicked: function(layer) {
                this._map.removeLayer(layer.layer);
                this._customLayers.remove(layer);
                this.updateEnabledLayers();
                this.hideCustomLayerForm();
            },

            loadCustomLayerFromString: function(s) {
                let fieldValues;
                const m = s.match(/^-cs(.+)$/u);
                if (m) {
                    s = m[1].replace(/-/ug, '+').replace(/_/ug, '/');
                    try {
                        s = atob(s);
                        fieldValues = JSON.parse(s);
                    } catch (e) {
                        // ignore malformed data
                    }

                    if (fieldValues) {
                        // upgrade
                        if (fieldValues.isTop === undefined) {
                            fieldValues.isTop = true;
                        }
                        if (!this.customLayerExists(fieldValues)) {
                            this._customLayers.push(this.createCustomLayer(fieldValues));
                        }
                        return this.serializeCustomLayer(fieldValues);
                    }
                }
                return null;
            }

        }
    );
    if (control._map) {
        control.__injectConfigButton();
    }
    control._initializeLayersState();
    control._initializeHotkeys();
}

export default enableConfig;
