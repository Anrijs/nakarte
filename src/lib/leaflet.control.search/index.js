import ko from 'knockout';
import L from 'leaflet';

import '~/lib/leaflet.placemark'; // eslint-disable-line import/no-unassigned-import
import {stopContainerEvents} from '~/lib/leaflet.control.commons';
import '~/lib/leaflet.hashState/leaflet.hashState'; // eslint-disable-line import/no-unassigned-import

import controlTemplate from './control.html';
import {providers, magicProviders} from './providers';
import './style.css';

ko.bindingHandlers.hasFocusNested = {
    init: function (element, valueAccessor) {
        function hasFocusNested() {
            let active = document.activeElement;
            while (active) {
                if (element === active) {
                    return true;
                }
                active = active.parentElement;
            }
            return false;
        }

        function handleFocusChange() {
            // wait for all related focus/blur events to fire
            setTimeout(() => {
                valueAccessor()(hasFocusNested());
            }, 0);
        }
        element.addEventListener('focus', handleFocusChange, true);
        element.addEventListener('blur', handleFocusChange, true);
    },
};

class SearchViewModel {
    query = ko.observable('');
    inputPlaceholder = ko.observable(null);
    helpText = ko.observable(null);
    items = ko.observableArray([]);
    error = ko.observable(null);
    inputHasFocus = ko.observable(false);
    controlOrChildHasFocus = ko.observable(false);
    highlightedIndex = ko.observable(null);
    attribution = ko.observable(null);

    allowMinimize = ko.observable(true);

    /* eslint-disable no-invalid-this */
    controlHasFocus = ko.pureComputed(function () {
        return this.inputHasFocus() || this.controlOrChildHasFocus();
    }, this);

    showResults = ko.pureComputed(function () {
        return this.items().length > 0 && this.controlHasFocus();
    }, this);

    showError = ko.pureComputed(function () {
        return this.error() !== null && this.controlHasFocus();
    }, this);

    isQueryLengthOk = ko.computed(function () {
        return this.query().trim().length >= this.minSearchQueryLength;
    }, this);

    showWarningTooShort = ko.pureComputed(function () {
        return this.controlHasFocus() && this.query() && !this.isQueryLengthOk();
    }, this);

    minimizeToButton = ko.pureComputed(function () {
        return this.allowMinimize() && !this.controlHasFocus();
    }, this);

    onItemMouseOver = (item) => {
        this.highlightedIndex(this.items.indexOf(item));
    };

    onItemClick = (item) => {
        this.itemSelected(item);
    };

    onButtonClick = (_, e) => {
        L.DomEvent.preventDefault(e);
        this.inputHasFocus(true);
    };

    onShowResults(show) {
        if (show) {
            this.highlightedIndex(0);
        }
    }

    onControlHasFocusChange(active) {
        if (!active) {
            this.items.removeAll();
            this.error(null);
        }
    }

    onInputHasFocusChange(active) {
        if (active) {
            this.maybeRequestSearch(this.query());
        }
    }

    onClearClick() {
        this.query('');
        this.inputHasFocus(true);
    }

    onSettingsClick() {
        this.settingsOpened(null);
    }

    defaultEventHandle(_, e) {
        L.DomEvent.stopPropagation(e);
        return true;
    }

    onQueryChange() {
        this.items.removeAll();
        this.error(null);
        this.searchAborted(null);
        this.maybeRequestSearch();
    }

    onKeyDown = (_, e) => {
        let n;
        switch (e.which) {
            case 38: // up
                n = this.highlightedIndex();
                if (n === null) {
                    n = this.items().length - 1;
                } else {
                    n -= 1;
                }
                if (n === -1) {
                    n = this.items().length - 1;
                }
                this.highlightedIndex(n);
                break;
            case 40: // down
                n = this.highlightedIndex();
                if (n === null) {
                    n = 0;
                } else {
                    n += 1;
                }
                if (n === this.items().length) {
                    n = 0;
                }
                this.highlightedIndex(n);
                break;
            case 13: // enter
                if (this.items().length > 0) {
                    this.itemSelected(this.items()[this.highlightedIndex()]);
                }
                break;
            case 27: // esc
                this.escapePressed(null);
                break;
            default:
                return true;
        }
        return false;
    };
    /* eslint-enable no-invalid-this */

    maybeRequestSearch() {
        if (this.isQueryLengthOk() && this.controlHasFocus()) {
            this.searchRequested(null);
        }
    }

    // public events
    itemSelected = ko.observable().extend({notify: 'always'});
    searchRequested = ko.observable().extend({notify: 'always'});
    searchAborted = ko.observable().extend({notify: 'always'});
    escapePressed = ko.observable().extend({notify: 'always'});
    settingsOpened = ko.observable().extend({notify: 'always'});

    // public methods
    setResult(items, attribution) {
        this.items.splice(0, this.items().length, ...items);
        this.error(null);
        this.attribution(attribution);
    }

    setResultError(error) {
        this.items.removeAll();
        this.error(error);
    }

    setFocus() {
        this.inputHasFocus(true);
    }

    setInputPlaceholder(s) {
        this.inputPlaceholder(s);
    }

    setHelpText(s) {
        this.helpText(s);
    }

    setMinimizeAllowed(allowed) {
        this.allowMinimize(allowed);
    }

    constructor(minSearchQueryLength) {
        this.minSearchQueryLength = minSearchQueryLength;
        this.query.subscribe(this.onQueryChange.bind(this));
        this.showResults.subscribe(this.onShowResults.bind(this));
        this.controlHasFocus.subscribe(this.onControlHasFocusChange.bind(this));
        this.inputHasFocus.subscribe(this.onInputHasFocusChange.bind(this));
    }
}

const SearchControl = L.Control.extend({
    includes: L.Mixin.Events,

    options: {
        providerOptions: {
            maxResponses: 5,
        },
        minQueryLength: 3,
        hotkey: 'L',
        maxMapHeightToMinimize: 567,
        maxMapWidthToMinimize: 450,
        tooltip: 'Search places, coordinates, links',
        help: '',
    },

    updateTooltip: function () {
        const tooltip = this.provider.options.tooltip ?? this.options.tooltip;
        this.viewModel.setInputPlaceholder(L.Util.template(tooltip + ' (Alt-{hotkey})', this.options));
    },

    initialize: function (options) {
        // init providers
        this.providers = [];
        for (const [key, Klass] of Object.entries(providers)) {
            this.providers.push({
                key: key,
                provider: new Klass(this.options.providerOptions),
            });
        }

        L.Control.prototype.initialize.call(this, options);
        this.provider = this.providers[0].provider;
        this.magicProviders = magicProviders.map((Cls) => new Cls());
        this.searchPromise = null;
        this.viewModel = new SearchViewModel(this.options.minQueryLength);
        this.viewModel.setHelpText(this.options.help);
        this.viewModel.searchRequested.subscribe(this.onSearchRequested.bind(this));
        this.viewModel.searchAborted.subscribe(this.onSearchAborted.bind(this));
        this.viewModel.itemSelected.subscribe(this.onResultItemClicked.bind(this));
        this.viewModel.query.subscribe(() => this.fire('querychange'));
        this.viewModel.escapePressed.subscribe(this.setFocusToMap.bind(this));
        this.viewModel.settingsOpened.subscribe(this.onSettingsOpened.bind(this));
        this.updateTooltip();
        this.providerkey = this.providers[0].key;
    },

    selectProvider: function (key) {
        for (let i = 0; this.providers.length; i++) {
            const p = this.providers[i];
            if (p.key === key) {
                this.providerkey = key;
                this.provider = p.provider;
                this.updateTooltip();
                break;
            }
        }
    },

    onAdd: function (map) {
        this._map = map;
        const container = L.DomUtil.create('div', 'leaflet-search-container');
        container.innerHTML = controlTemplate;
        stopContainerEvents(container);
        ko.applyBindings(this.viewModel, container);

        this.searchPromise = null;

        L.DomEvent.on(document, 'keyup', this.onDocumentKeyUp, this);
        map.on('resize', this.updateMinimizeAllowed, this);
        this.updateMinimizeAllowed();

        // enable setting focus to map container
        const mapContainer = map.getContainer();
        if (mapContainer.tabIndex === undefined) {
            mapContainer.tabIndex = -1;
        }
        return container;
    },

    setFocusToMap: function () {
        this._map.getContainer().focus();
    },

    hideSelectWindow: function () {
        if (!this._configWindowVisible) {
            return;
        }
        this._map._controlContainer.removeChild(this._configWindow);
        this._configWindowVisible = false;
    },

    showProviderSettingsWindow: function (buttons, providerList) {
        if (this._providerSelectionWindow || this._configWindowVisible) {
            return;
        }

        this._providerSelectionWindow = L.DomUtil.create(
            'div',
            'leaflet-layers-dialog-wrapper',
            this._map._controlContainer
        );

        L.DomEvent.disableClickPropagation(this._providerSelectionWindow);
        L.DomEvent.disableScrollPropagation(this._providerSelectionWindow);

        const customLayerWindow = L.DomUtil.create('div', 'custom-layers-window', this._providerSelectionWindow);
        const form = L.DomUtil.create('form', '', customLayerWindow);
        L.DomEvent.on(form, 'submit', L.DomEvent.preventDefault);

        const dialogModel = {
            selected: ko.observable(),
            buttons: buttons,
            providers: providerList,
            buttonClicked: function buttonClicked(callbackN) {
                const retValues = {
                    selected: dialogModel.selected,
                };
                buttons[callbackN].callback(retValues);
            },
        };

        dialogModel.selected(this.providerkey);

        /* eslint-disable max-len */
        const formHtml = `
        <b>Search provider:</b>
        <!-- ko foreach: providers -->
        <div>
            <label class="provider-label provider-settings">
                <input type="radio" name="provider" data-bind="checked: $root.selected, checkedValue: key"/>
                <span class="provider-text">
                    <span data-bind="text: provider.name"></span>
                    <!--  ko if: provider.description -->
                    <br>
                    <span class="provider-desc" data-bind="html: provider.description || ''"></span>
                    <!-- /ko -->
                </span>
            </label>
        </div>
        <!-- /ko -->
        <br>
        <div data-bind="foreach: buttons">
        <a class="button" data-bind="click: $root.buttonClicked.bind(null, $index()), text: caption"></a>
        </div>`;
        /* eslint-enable max-len */
        form.innerHTML = formHtml;
        ko.applyBindings(dialogModel, form);
    },

    hideProviderSettingsWindow: function () {
        if (!this._providerSelectionWindow) {
            return;
        }
        this._providerSelectionWindow.parentNode.removeChild(this._providerSelectionWindow);
        this._providerSelectionWindow = null;
    },

    onProviderSettingsWindowCancelClicked: function () {
        this.hideProviderSettingsWindow();
    },

    onSettingsOpened: function () {
        this.showProviderSettingsWindow(
            [
                {
                    caption: 'Save',
                    callback: (fieldValues) => {
                        this.selectProvider(fieldValues.selected());
                        this.hideProviderSettingsWindow();
                    },
                },
                {
                    caption: 'Cancel',
                    callback: () => this.onProviderSettingsWindowCancelClicked(),
                },
            ],
            this.providers
        );
    },

    onSearchRequested: async function () {
        const query = this.viewModel.query();
        const searchOptions = {
            bbox: this._map.getBounds(),
            latlng: this._map.getCenter(),
            zoom: this._map.getZoom(),
        };
        let provider = this.provider;
        for (const magicProvider of this.magicProviders) {
            if (magicProvider.isOurQuery(query)) {
                provider = magicProvider;
            }
        }
        this.searchPromise = provider.search(query, searchOptions);
        const searchPromise = this.searchPromise;
        const result = await searchPromise;
        this.fire('resultreceived', {provider: provider.name, query, result});
        if (this.searchPromise === searchPromise) {
            if (result.error) {
                this.viewModel.setResultError(result.error);
            } else if (result.results.length === 0) {
                this.viewModel.setResultError('Nothing found');
            } else {
                this.viewModel.setResult(result.results, provider.attribution);
            }
        }
    },

    onSearchAborted: function () {
        this.searchPromise = null;
    },

    onResultItemClicked: function (item) {
        if (item.bbox) {
            this._map.fitBounds(item.bbox);
        } else {
            this._map.setView(item.latlng, item.zoom);
        }
        this._map.showPlacemark(item.latlng, item.title);
        this.setFocusToMap();
    },

    onDocumentKeyUp: function (e) {
        if (e.keyCode === this.options.hotkey.codePointAt(0) && e.altKey) {
            this.viewModel.setFocus();
        }
    },

    updateMinimizeAllowed: function () {
        const mapSize = this._map.getSize();
        this.viewModel.setMinimizeAllowed(
            mapSize.y < this.options.maxMapHeightToMinimize || mapSize.x < this.options.maxMapWidthToMinimize
        );
    },
});

SearchControl.include(L.Mixin.HashState);
SearchControl.include({
    stateChangeEvents: ['querychange'],

    serializeState: function () {
        const query = this.viewModel.query();
        if (query) {
            return [encodeURIComponent(query)];
        }
        return null;
    },

    unserializeState: function (state) {
        if (state?.length === 1) {
            this.viewModel.query(decodeURIComponent(state[0]));
            return true;
        }
        return false;
    },
});

export {SearchControl};
