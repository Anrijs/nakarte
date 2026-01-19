import L from 'leaflet';
import './elevation-profile.css';
import {ElevationProvider} from '~/lib/elevations';
import '~/lib/leaflet.control.commons';
import {notify} from '~/lib/notifications';
import * as logging from '~/lib/logging';
import {DragEvents} from '~/lib/leaflet.events.drag';
import config from '~/config';

function calcSamplingInterval(length) {
    var targetPointsN = 2000;
    var maxPointsN = 9999;
    var samplingIntgerval = length / targetPointsN;
    if (samplingIntgerval < 10) {
        samplingIntgerval = 10;
    }
    if (samplingIntgerval > 50) {
        samplingIntgerval = 50;
    }
    if (length / samplingIntgerval > maxPointsN) {
        samplingIntgerval = length / maxPointsN;
    }
    return samplingIntgerval;
}

function createSvg(tagName, attributes, parent) {
    var element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    if (attributes) {
        var keys = Object.keys(attributes),
            key, value;
        for (var i = 0; i < keys.length; i++) {
            key = keys[i];
            value = attributes[key];
            element.setAttribute(key, value);
        }
    }
    if (parent) {
        parent.appendChild(element);
    }
    return element;
}

function pointOnSegmentAtDistance(p1, p2, dist) {
    // FIXME: we should place markers along projected line to avoid transformation distortions
    var q = dist / p1.distanceTo(p2),
        x = p1.lng + (p2.lng - p1.lng) * q,
        y = p1.lat + (p2.lat - p1.lat) * q;
    return L.latLng(y, x);
}

function gradientToAngle(g) {
    return Math.round(Math.atan(g) * 180 / Math.PI);
}

function pathRegularSamples(latlngs, step) {
    if (!latlngs.length) {
        return {samples: [], splits: []};
    }
    var samples = [],
        splits = [],
        lastSampleDist = 0,
        lastPointDistance = 0,
        nextPointDistance = 0,
        segmentLength, i;

    samples.push(latlngs[0]);
    splits.push(0);
    for (i = 1; i < latlngs.length; i++) {
        segmentLength = latlngs[i].distanceTo(latlngs[i - 1]);
        nextPointDistance = lastPointDistance + segmentLength;
        if (nextPointDistance >= lastSampleDist + step) {
            while (lastSampleDist + step <= nextPointDistance) {
                lastSampleDist += step;
                samples.push(
                    pointOnSegmentAtDistance(latlngs[i - 1], latlngs[i], lastSampleDist - lastPointDistance)
                );
            }
        }
        splits.push(samples.length - 1);
        lastPointDistance = nextPointDistance;
    }
    if (samples.length < 2) {
        samples.push(latlngs[latlngs.length - 1]);
    }
    if (splits.length < 2) {
        splits.push(samples.length);
    }
    return {
        samples: samples,
        splits: splits
    };
}

const ElevationProfile = L.Class.extend({
        options: {
            samplingInterval: 50,
            sightLine: false,
        },

        includes: L.Mixin.Events,

        initialize: function(map, latlngs, options) {
            L.setOptions(this, options);
            this.map = map;
            this.path = latlngs;
            var {samples, splits} = pathRegularSamples(this.path, this.options.samplingInterval);
            this.samples = samples;
            this.splits = splits;
            samples = samples.map((latlng) => latlng.wrap());
            if (!samples.length) {
                notify('Track is empty');
                return;
            }
            this.horizZoom = 1;
            this.dragStart = null;

            this.elevationServer = config.elevationServer;
            if (Array.isArray(this.elevationServer)) {
                this.elevationServer = this.elevationServer[0].url;
            }

            const that = this;
            this.getElevationData(this.elevationServer, function() {
                that._addTo(that.map);
            });

            this.intersectionMarkers = {};
            this.towerHeights = {};
            this.values = null;
            this.settings = {
                radioFreq: 868,
                curveRelief: false,
            };
        },

        getElevationData: function(server, onload = undefined) {
            const that = this;
            new ElevationProvider(server, false).get(this.samples)
                .then(function(values) {
                        that.values = values;
                        if (onload) {
                            onload();
                        }
                    }
                )
                .catch((e) => {
                    logging.captureException(e, 'error getting elevation');
                    notify(`Failed to get elevation data: ${e.message}`);
                });
        },

        _onWindowResize: function() {
            this._resizeGraph();
        },

        _resizeGraph: function() {
            const newSvgWidth = this.drawingContainer.clientWidth * this.horizZoom;
            if (this.svgWidth < this.drawingContainer.clientWidth) {
                this.svgWidth = newSvgWidth;
                this.svg.setAttribute('width', this.svgWidth + 'px');
                this.updateGraph();
                this.updateGraphSelection();
            }
        },

        _addTo: function(map) {
            this._map = map;
            var container = this._container = L.DomUtil.create('div', 'elevation-profile-container');
            L.Control.prototype._stopContainerEvents.call(this);
            this._map._controlContainer.appendChild(container);
            this.setupContainerLayout();
            this.updateGraph();
            const icon = L.divIcon({
                    className: 'elevation-profile-marker',
                    html:
                        '<div class="elevation-profile-marker-icon"></div>' +
                        '<div class="elevation-profile-marker-label"></div>'
                }
            );
            this.trackMarker = L.marker([1000, 0], {interactive: false, icon: icon});
            this.intersectionMarkers = {};
            this.polyline = L.polyline(this.path, {weight: 30, opacity: 0}).addTo(map);
            this.polyline.on('mousemove', this.onLineMouseMove, this);
            this.polyline.on('mouseover', this.onLineMouseEnter, this);
            this.polyline.on('mouseout', this.onLineMouseLeave, this);
            this.polyLineSelection = L.polyline([], {weight: 20, opacity: 0.5, color: 'yellow', lineCap: 'butt'});
            return this;
        },

        isRadioToolsAvailable: function() {
            return this.splits.length <= 11;
        },

        isTowerHeightSet: function() {
            return Object.values(this.towerHeights).some((v) => v.value && v.value !== 0);
        },

        getTowerHeight: function(pos) {
            if (pos in this.towerHeights) {
                let val = parseFloat(this.towerHeights[pos].value);
                if (!isNaN(val)) {
                    return val;
                }
            }
            return 0;
        },

        setTowerHeightDom: function(pos, x, y, w) {
            let heightInput;
            if (pos in this.towerHeights) {
                heightInput = this.towerHeights[pos];
            } else {
                heightInput = L.DomUtil.create('input', 'elevation-profile-grid-label', this.drawingContainer);
                heightInput.type = 'number';
                heightInput.value = '0';
                this.towerHeights[pos] = heightInput;
                L.DomEvent.on(heightInput, 'change', this.onSettingsChange, this);
            }
            heightInput.style.top = y + 'px';
            heightInput.style.left = x + 'px';
            heightInput.style.width = w + 'px';
        },

        isSightlineVisible: function() {
            return this.isRadioToolsAvailable() && (this.options.sightLine || this.isTowerHeightSet());
        },

        setupContainerLayout: function() {
            var horizZoom = this.horizZoom = 1;
            var container = this._container;
            this.leftContainer = L.DomUtil.create('div', 'elevation-profile-properties', container);
            this.providerSelector = L.DomUtil.create('select', 'elevation-profile-server', this.leftContainer);
            this.propsContainer = L.DomUtil.create('div', '', this.leftContainer);
            this.leftAxisLables = L.DomUtil.create('div', 'elevation-profile-left-axis', container);
            this.closeButton = L.DomUtil.create('div', 'elevation-profile-close', container);
            L.DomEvent.on(this.closeButton, 'click', this.onCloseButtonClick, this);
            this.drawingContainer = L.DomUtil.create('div', 'elevation-profile-drawingContainer', container);
            this.graphCursor = L.DomUtil.create('div', 'elevation-profile-cursor elevation-profile-cursor-hidden',
                this.drawingContainer
            );
            this.graphCursorLabel =
                L.DomUtil.create('div', 'elevation-profile-cursor-label elevation-profile-cursor-hidden',
                    this.drawingContainer
                );
            this.graphSelection = L.DomUtil.create('div', 'elevation-profile-selection elevation-profile-cursor-hidden',
                this.drawingContainer
            );
            var svgWidth = this.svgWidth = this.drawingContainer.clientWidth * horizZoom,
                svgHeight = this.svgHeight = this.drawingContainer.clientHeight;
            var svg = this.svg = createSvg('svg', {width: svgWidth, height: svgHeight}, this.drawingContainer);
            L.DomEvent.on(svg, 'mousemove', this.onSvgMouseMove, this);
            // We should handle mouseenter event, but due to a
            // bug in Chrome (https://bugs.chromium.org/p/chromium/issues/detail?id=846738)
            // this event is emitted while resizing window by dragging right window frame
            // which causes cursor to appeat while resizing
            L.DomEvent.on(svg, 'mousemove', this.onSvgEnter, this);
            L.DomEvent.on(svg, 'mouseleave', this.onSvgLeave, this);
            L.DomEvent.on(svg, 'mousewheel', this.onSvgMouseWheel, this);
            this.svgDragEvents = new DragEvents(this.svg, {dragButtons: [0, 2], stopOnLeave: true});
            this.svgDragEvents.on('dragstart', this.onSvgDragStart, this);
            this.svgDragEvents.on('dragend', this.onSvgDragEnd, this);
            this.svgDragEvents.on('drag', this.onSvgDrag, this);
            this.svgDragEvents.on('click', this.onSvgClick, this);
            L.DomEvent.on(svg, 'dblclick', this.onSvgDblClick, this);
            L.DomEvent.on(window, 'resize', this._onWindowResize, this);

            this.inputsTable = L.DomUtil.create('table', 'elevation-profile-inputs', this.leftContainer);

            const radioRow = this.inputsTable.insertRow();
            const labelCell = radioRow.insertCell();
            labelCell.innerText = "Radio frequency (MHz)";
            const freqCell = radioRow.insertCell();
            this.radioFreq = L.DomUtil.create('input', '', freqCell);
            this.radioFreq.type = 'number';
            this.radioFreq.value = this.settings.radioFreq;
            this.radioFreq.dataset['target'] = 'radioFreq';

            this.curveEarthLabel = L.DomUtil.create('label', 'elevation-profile-radio', this.leftContainer);
            this.curveSightLabel = L.DomUtil.create('label', 'elevation-profile-radio', this.leftContainer);
            this.curveEarthLabel.innerText = 'Curve Earth';
            this.curveSightLabel.innerText = 'Curve Sight Line';
            this.curveEarth = L.DomUtil.create('input', '');
            this.curveSight = L.DomUtil.create('input', '');
            this.curveEarthLabel.insertBefore(this.curveEarth, this.curveEarthLabel.firstChild);
            this.curveSightLabel.insertBefore(this.curveSight, this.curveSightLabel.firstChild);
            this.curveEarth.type = 'radio';
            this.curveSight.type = 'radio';
            this.curveEarth.name = 'curve_radio';
            this.curveSight.name = 'curve_radio';
            this.curveEarth.dataset['target'] = 'curveRelief';
            this.curveSight.dataset['target'] = 'curveRelief';
            this.curveEarth.dataset['inv'] = true;
            this.curveSight.checked = !this.settings.curveRelief;
            this.curveEarth.checked = this.settings.curveRelief;

            this.curveEarthLabel.for = this.curveEarth;
            this.curveSightLabel.for = this.curveSight;

            if (Array.isArray(config.elevationsServer)) {
                for (let i = 0; i < config.elevationsServer.length; i++) {
                    const srv = config.elevationsServer[i];
                    const option = L.DomUtil.create('option', '', null);
                    option.value = srv.url;
                    option.text = srv.name;
                    if (srv.url === this.elevationServer) {
                        option.selected = "yes";
                    }
                    this.providerSelector.add(option);
                }

                const that = this;
                this.providerSelector.onchange = function(e) {
                    that.elevationServer = e.target.value;
                    that.getElevationData(that.elevationServer, that.updateGraph.bind(that));
                    return true;
                };
            } else {
                this.providerSelector.style.visibility = 'hidden';
            }

            if (!this.isRadioToolsAvailable()) {
                this.inputsTable.style.visibility = 'hidden';
                this.curveEarth.style.visibility = 'hidden';
                this.curveSight.style.visibility = 'hidden';
                this.curveEarthLabel.style.visibility = 'hidden';
                this.curveSightLabel.style.visibility = 'hidden';
            }

            L.DomEvent.on(this.radioFreq, 'change', this.onSettingsChange, this);
            L.DomEvent.on(this.curveEarth, 'change', this.onSettingsChange, this);
            L.DomEvent.on(this.curveSight, 'change', this.onSettingsChange, this);
        },

        onSettingsChange: function(e) {
            let value = e.target.value;
            if (e.target.type === 'number') {
                value = parseFloat(value);
            }
            if (e.target.type === 'radio') {
                const inv = e.target.dataset['inv'] || false;
                value = (e.target.checked === 'on') !== inv;
            }
            this.settings[e.target.dataset['target']] = value;
            this.updateGraph();
        },

        removeFrom: function(map) {
            if (this.abortLoading) {
                this.abortLoading();
            }
            if (!this._map) {
                return this;
            }
            this._map._controlContainer.removeChild(this._container);
            map.removeLayer(this.polyline);
            map.removeLayer(this.trackMarker);
            map.removeLayer(this.polyLineSelection);
            Object.entries(this.intersectionMarkers).forEach(([_unused, v]) => {
                map.removeLayer(v);
            });
            this.intersectionMarkers = {};
            L.DomEvent.off(window, 'resize', this._onWindowResize, this);
            this._map = null;
            this.fire('remove');
            return this;
        },

        onSvgDragStart: function(e) {
            if (e.dragButton === 0) {
                // FIXME: restore hiding when we make display of selection on map
                // this.cursorHide();
                this.polyLineSelection.addTo(this._map).bringToBack();
                this.selStartIndex = this.roundedSampleIndexFromMouseEvent(e);
            }
        },

        graphContainerOffsetFromMouseEvent: function(e) {
            if (e.originalEvent) {
                e = e.originalEvent;
            }
            let x = e.clientX - this.svg.getBoundingClientRect().left;
            if (x < 0) {
                x = 0;
            }
            if (x > this.svgWidth - 1) {
                x = this.svgWidth - 1;
            }
            return x;
        },

        sampleIndexFromMouseEvent: function(e) {
            const x = this.graphContainerOffsetFromMouseEvent(e);
            return x / (this.svgWidth - 1) * (this.values.length - 1);
        },

        roundedSampleIndexFromMouseEvent: function(e) {
            return Math.round(this.sampleIndexFromMouseEvent(e));
        },

        setTrackMarkerLabel: function(label) {
            const icon = this.trackMarker._icon;
            if (!icon) {
                return;
            }
            icon.getElementsByClassName('elevation-profile-marker-label')[0].innerHTML = label;
        },

        setGraphSelection: function(cursorIndex) {
            this.selMinInd = Math.min(cursorIndex, this.selStartIndex);
            this.selMaxInd = Math.max(cursorIndex, this.selStartIndex);

            if (this.selMinInd < 0) {
                this.selMinInd = 0;
            }
            if (this.selMaxInd > this.values.length - 1) {
                this.selMaxInd = this.values.length - 1;
            }
            this.updateGraphSelection();
            L.DomUtil.removeClass(this.graphSelection, 'elevation-profile-cursor-hidden');
        },

        updateGraphSelection: function() {
            const selStart = this.selMinInd * (this.svgWidth - 1) / (this.values.length - 1);
            const selEnd = this.selMaxInd * (this.svgWidth - 1) / (this.values.length - 1);
            this.graphSelection.style.left = selStart + 'px';
            this.graphSelection.style.width = (selEnd - selStart) + 'px';
        },

        onSvgDragEnd: function(e) {
            if (e.dragButton === 0) {
                this.cursorShow();
                this.setGraphSelection(this.roundedSampleIndexFromMouseEvent(e));
                var stats = this.calcProfileStats(this.values.slice(this.selMinInd, this.selMaxInd + 1));
                this.updatePropsDisplay(stats);
                L.DomUtil.addClass(this.propsContainer, 'elevation-profile-properties-selected');
            }
            if (e.dragButton === 2) {
                this.drawingContainer.scrollLeft -= e.dragMovement.x;
            }
        },

        onSvgDrag: function(e) {
            if (e.dragButton === 0) {
                this.setGraphSelection(this.roundedSampleIndexFromMouseEvent(e));
                this.polyLineSelection.setLatLngs(this.samples.slice(this.selMinInd, this.selMaxInd + 1));
            }
            if (e.dragButton === 2) {
                this.drawingContainer.scrollLeft -= e.dragMovement.x;
            }
        },

        onSvgClick: function(e) {
            const button = e.originalEvent.button;
            if (button === 0) {
                this.dragStart = null;
                L.DomUtil.addClass(this.graphSelection, 'elevation-profile-cursor-hidden');
                L.DomUtil.removeClass(this.propsContainer, 'elevation-profile-properties-selected');
                this._map.removeLayer(this.polyLineSelection);
                if (this.stats) {
                    this.updatePropsDisplay(this.stats);
                }
            }
            if (button === 2) {
                this.setMapPositionAtIndex(this.roundedSampleIndexFromMouseEvent(e));
            }
        },

        onSvgDblClick: function(e) {
            this.setMapPositionAtIndex(this.roundedSampleIndexFromMouseEvent(e));
        },

        setMapPositionAtIndex: function(ind) {
            var latlng = this.samples[ind];
            if (latlng) {
                this._map.panTo(latlng);
            }
        },

        onSvgMouseWheel: function(e) {
            var oldHorizZoom = this.horizZoom;
            this.horizZoom += L.DomEvent.getWheelDelta(e) > 0 ? 1 : -1;
            if (this.horizZoom < 1) {
                this.horizZoom = 1;
            }
            if (this.horizZoom > 10) {
                this.horizZoom = 10;
            }

            var ind = this.sampleIndexFromMouseEvent(e);

            var newScrollLeft = this.drawingContainer.scrollLeft +
                this.graphContainerOffsetFromMouseEvent(e) * (this.horizZoom / oldHorizZoom - 1);
            if (newScrollLeft < 0) {
                newScrollLeft = 0;
            }

            this.svgWidth = this.drawingContainer.clientWidth * this.horizZoom;
            this.svg.setAttribute('width', this.svgWidth + 'px');
            this.setupGraph();
            if (newScrollLeft > this.svgWidth - this.drawingContainer.clientWidth) {
                newScrollLeft = this.svgWidth - this.drawingContainer.clientWidth;
            }
            this.drawingContainer.scrollLeft = newScrollLeft;

            this.cursorHide();
            this.setCursorPosition(ind);
            this.cursorShow();
            this.updateGraphSelection();
        },

        updateGraph: function() {
            if (!this._map || !this.values) {
                return;
            }

            this.stats = this.calcProfileStats(this.values);
            this.updatePropsDisplay(this.stats);
            this.setupGraph();
        },

        updatePropsDisplay: function(stats) {
            if (!this._map) {
                return;
            }
            let d;
            if (stats.noData) {
                d = {
                    maxElev: '-',
                    minElev: '-',
                    startElev: '-',
                    endElev: '-',
                    change: '-',
                    ascentAngleStr: '-',
                    descentAngleStr: '-',
                    ascent: '-',
                    descent: '-',
                    startApprox: '',
                    endApprox: '',
                    approx: '',
                    incomplete: 'No elevation data',
                };
            } else {
                d = {
                    maxElev: Math.round(stats.max),
                    minElev: Math.round(stats.min),
                    startElev: Math.round(stats.start),
                    endElev: Math.round(stats.end),
                    change: Math.round(stats.finalAscent),
                    ascentAngleStr: isNaN(stats.angleAvgAscent) ? '-' : L.Util.template('{avg} / {max}&deg;',
                            {avg: stats.angleAvgAscent, max: stats.angleMaxAscent}
                        ),
                    descentAngleStr: isNaN(stats.angleAvgDescent) ? '-' : L.Util.template('{avg} / {max}&deg;',
                            {avg: stats.angleAvgDescent, max: stats.angleMaxDescent}
                        ),
                    ascent: Math.round(stats.ascent),
                    descent: Math.round(stats.descent),
                    dist: (stats.distance / 1000).toFixed(1),
                    startApprox: stats.dataLostAtStart > 0.02 ? '~ ' : '',
                    endApprox: stats.dataLostAtEnd > 0.02 ? '~ ' : '',
                    approx: stats.dataLost > 0.02 ? '~ ' : '',
                    incomplete: stats.dataLost > 0.02 ? 'Some elevation data missing' : '',
                };
            }
            d.dist = (stats.distance / 1000).toFixed(1);

            this.propsContainer.innerHTML = `
                <table>
                <tr class="start-group"><td>Max elevation:</td><td>${d.maxElev}</td></tr>
                <tr><td>Min elevation:</td><td>${d.minElev}</td></tr>
                <tr class="start-group"><td>Start elevation:</td><td>${d.startApprox}${d.startElev}</td></tr>
                <tr><td>Finish elevation:</td><td>${d.endApprox}${d.endElev}</td></tr>
                <tr><td>Start to finish elevation change:</td><td>${d.startApprox || d.endApprox}${d.change}</td></tr>
                <tr class="start-group"><td>Avg / Max ascent inclination:</td><td>${d.ascentAngleStr}</td></tr>
                <tr><td>Avg / Max descent inclination:</td><td>${d.descentAngleStr}</td></tr>
                <tr class="start-group"><td>Total ascent:</td><td>${d.approx}${d.ascent}</td></tr>
                <tr><td>Total descent:</td><td>${d.approx}${d.descent}</td></tr>
                <tr class="start-group"><td>Distance:</td><td>${d.dist} km</td></tr>
                <tr><td colspan="2" style="text-align: center">${d.incomplete}</td></tr>
                </table>
                `;
        },

        calcGridValues: function(minValue, maxValue) {
            var ticksNs = [3, 4, 5],
                tickSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
                ticks = [],
                i, j, k, ticksN, tickStep, tick1, tick2,
                matchFound = false;

            for (i = 0; i < tickSteps.length; i++) {
                tickStep = tickSteps[i];
                for (j = 0; j < ticksNs.length; j++) {
                    ticksN = ticksNs[j];
                    tick1 = Math.floor(minValue / tickStep);
                    tick2 = Math.ceil(maxValue / tickStep);
                    if ((tick2 - tick1) < ticksN) {
                        matchFound = true;
                        break;
                    }
                }
                if (matchFound) {
                    break;
                }
            }
            for (k = tick1; k < tick1 + ticksN; k++) {
                ticks.push(k * tickStep);
            }
            return ticks;
        },

        filterElevations: function(values, tolerance) {
            var filtered = values.slice(0);
            if (filtered.length < 3) {
                return filtered;
            }
            var scanStart, scanEnd, job, linearValue, linearDelta, maxError, maxErrorInd, i, error;
            var queue = [[0, filtered.length - 1]];
            while (queue.length) {
                job = queue.pop();
                scanStart = job[0];
                scanEnd = job[1];
                linearValue = filtered[scanStart];
                linearDelta = (filtered[scanEnd] - filtered[scanStart]) / (scanEnd - scanStart);
                maxError = null;
                maxErrorInd = null;
                for (i = scanStart + 1; i < scanEnd; i++) {
                    linearValue += linearDelta;
                    if (filtered[i] === null) {
                        continue;
                    }
                    error = Math.abs(filtered[i] - linearValue);
                    if (error === null || error > maxError) {
                        maxError = error;
                        maxErrorInd = i;
                    }
                }
                if (maxError > tolerance) {
                    if (scanEnd > scanStart + 2) {
                        queue.push([scanStart, maxErrorInd]);
                        queue.push([maxErrorInd, scanEnd]);
                    }
                } else {
                    filtered.splice(scanStart + 1, scanEnd - scanStart - 1);
                }
            }
            return filtered;
        },

        calcProfileStats: function(values) {
            const stats = {
                distance: (values.length - 1) * this.options.samplingInterval
            };
            const notNullValues = values.filter((value) => value !== null);
            if (notNullValues.length === 0) {
                stats.noData = true;
                return stats;
            }
            stats.min = Math.min(...notNullValues);
            stats.max = Math.max(...notNullValues);
            let firstNotNullIndex = true,
                lastNotNullIndex = true,
                firstNotNullValue,
                lastNotNullValue;
            for (let i = 0; i < values.length; i++) {
                let value = values[i];
                if (value !== null) {
                    firstNotNullValue = value;
                    firstNotNullIndex = i;
                    break;
                }
            }
            for (let i = values.length - 1; i >= 0; i--) {
                let value = values[i];
                if (value !== null) {
                    lastNotNullValue = value;
                    lastNotNullIndex = i;
                    break;
                }
            }
            stats.finalAscent = lastNotNullValue - firstNotNullValue;

            const ascents = [],
                descents = [];
            let prevNotNullValue = values[firstNotNullIndex],
                prevNotNullIndex = firstNotNullIndex;
            for (let i = firstNotNullIndex + 1; i <= lastNotNullIndex; i++) {
                let value = values[i];
                if (value === null) {
                    continue;
                }
                let length = i - prevNotNullIndex;
                let gradient = (value - prevNotNullValue) / length;
                if (gradient > 0) {
                    for (let j = 0; j < length; j++) {
                        ascents.push(gradient);
                    }
                } else if (gradient < 0) {
                    for (let j = 0; j < length; j++) {
                        descents.push(-gradient);
                    }
                }
                prevNotNullIndex = i;
                prevNotNullValue = value;
            }
            function sum(a, b) {
                return a + b;
            }
            if (ascents.length !== 0) {
                stats.gradientAvgAscent = ascents.reduce(sum, 0) / ascents.length / this.options.samplingInterval;
                stats.gradientMinAscent = Math.min(...ascents) / this.options.samplingInterval;
                stats.gradientMaxAscent = Math.max(...ascents) / this.options.samplingInterval;
                stats.angleAvgAscent = gradientToAngle(stats.gradientAvgAscent);
                stats.angleMinAscent = gradientToAngle(stats.gradientMinAscent);
                stats.angleMaxAscent = gradientToAngle(stats.gradientMaxAscent);
            }
            if (descents.length !== 0) {
                stats.gradientAvgDescent = descents.reduce(sum, 0) / descents.length / this.options.samplingInterval;
                stats.gradientMinDescent = Math.min(...descents) / this.options.samplingInterval;
                stats.gradientMaxDescent = Math.max(...descents) / this.options.samplingInterval;
                stats.angleAvgDescent = gradientToAngle(stats.gradientAvgDescent);
                stats.angleMinDescent = gradientToAngle(stats.gradientMinDescent);
                stats.angleMaxDescent = gradientToAngle(stats.gradientMaxDescent);
            }

            stats.start = firstNotNullValue;
            stats.end = lastNotNullValue;
            stats.distance = (values.length - 1) * this.options.samplingInterval;
            stats.dataLostAtStart = firstNotNullIndex / values.length;
            stats.dataLostAtEnd = 1 - lastNotNullIndex / (values.length - 1);
            stats.dataLost = 1 - notNullValues.length / values.length;

            const filterTolerance = 5;
            const filtered = this.filterElevations(values.slice(firstNotNullIndex, lastNotNullIndex), filterTolerance);
            let ascent = 0,
                descent = 0,
                delta;
            for (let i = 1; i < filtered.length; i++) {
                delta = filtered[i] - filtered[i - 1];
                if (delta < 0) {
                    descent += -delta;
                } else {
                    ascent += delta;
                }
            }
            stats.ascent = ascent;
            stats.descent = descent;

            return stats;
        },

        setIntersectionPostition: function(id, pos, xOffset) {
            if (!this._map || !this.values) {
                return;
            }

            let marker = null;
            if (id in this.intersectionMarkers) {
                marker = this.intersectionMarkers[id];
            } else {
                const iconIntersection = L.divIcon({
                    className: 'elevation-profile-marker',
                    html:
                        '<div class="elevation-profile-marker-intersection-icon"></div>'
                });
                marker = L.marker([1000, 0], {interactive: false, icon: iconIntersection});
                this.intersectionMarkers[id] = marker;
            }

            let markerPos;
            if (pos < 0 || (pos + xOffset) < 0) {
                this._map.removeLayer(marker);
                return;
            } else if ((pos + xOffset) >= this.samples.length - 1) {
                markerPos = this.samples[this.samples.length - 1];
            } else {
                markerPos = this.samples[pos + xOffset];
            }
            marker.setLatLng(markerPos);
            this._map.addLayer(marker);
        },

        setCursorPosition: function(ind) {
            if (!this._map || !this.values) {
                return;
            }
            const samplingInterval = this.options.samplingInterval;
            const distanceKm = samplingInterval * ind / 1000;
            const distanceStr = `${distanceKm.toFixed(2)} km`;
            const sample1 = this.values[Math.ceil(ind)];
            const sample2 = this.values[Math.floor(ind)];
            let angleStr;
            if (sample1 !== null && sample2 !== null) {
                const gradient = (sample2 - sample1) / samplingInterval;
                angleStr = `${Math.round(Math.atan(gradient) * 180 / Math.PI)}&deg`;
            } else {
                angleStr = '-';
            }

            const x = Math.round(ind / (this.values.length - 1) * (this.svgWidth - 1));
            const indInt = Math.round(ind);
            let elevation = this.values[indInt];
            if (elevation === null) {
                elevation = sample1;
            }
            if (elevation === null) {
                elevation = sample2;
            }
            const elevationStr = (elevation === null) ? '-' : `${elevation} m`;

            const cursorLabel = `${elevationStr}<br>${distanceStr}<br>${angleStr}`;

            this.graphCursorLabel.innerHTML = cursorLabel;

            this.graphCursor.style.left = x + 'px';
            this.graphCursorLabel.style.left = x + 'px';
            if (this.drawingContainer.getBoundingClientRect().left - this.drawingContainer.scrollLeft + x +
                this.graphCursorLabel.offsetWidth >= this.drawingContainer.getBoundingClientRect().right) {
                L.DomUtil.addClass(this.graphCursorLabel, 'elevation-profile-cursor-label-left');
            } else {
                L.DomUtil.removeClass(this.graphCursorLabel, 'elevation-profile-cursor-label-left');
            }

            let markerPos;
            if (ind <= 0) {
                markerPos = this.samples[0];
            } else if (ind >= this.samples.length - 1) {
                markerPos = this.samples[this.samples.length - 1];
            } else {
                const p1 = this.samples[Math.floor(ind)],
                    p2 = this.samples[Math.ceil(ind)],
                    indFrac = ind - Math.floor(ind);
                markerPos = [p1.lat + (p2.lat - p1.lat) * indFrac, p1.lng + (p2.lng - p1.lng) * indFrac];
            }
            this.trackMarker.setLatLng(markerPos);

            this.setTrackMarkerLabel(cursorLabel);
        },

        onSvgMouseMove: function(e) {
            if (!this.values) {
                return;
            }
            this.setCursorPosition(this.sampleIndexFromMouseEvent(e));
        },

        cursorShow: function() {
            L.DomUtil.removeClass(this.graphCursor, 'elevation-profile-cursor-hidden');
            L.DomUtil.removeClass(this.graphCursorLabel, 'elevation-profile-cursor-hidden');
            this._map.addLayer(this.trackMarker);
        },

        cursorHide: function() {
            L.DomUtil.addClass(this.graphCursor, 'elevation-profile-cursor-hidden');
            L.DomUtil.addClass(this.graphCursorLabel, 'elevation-profile-cursor-hidden');
            this._map.removeLayer(this.trackMarker);
        },

        onSvgEnter: function() {
            this.cursorShow();
        },

        onSvgLeave: function() {
            this.cursorHide();
        },

        onLineMouseEnter: function() {
            this.cursorShow();
        },

        onLineMouseLeave: function() {
            this.cursorHide();
        },

        onLineMouseMove: function(e) {
            function sqrDist(latlng1, latlng2) {
                var dx = (latlng1.lng - latlng2.lng);
                var dy = (latlng1.lat - latlng2.lat);
                return dx * dx + dy * dy;
            }

            var nearestInd = null,
                ind,
                minDist = null,
                mouseLatlng = e.latlng,
                i, sampleLatlng, dist, di;
            let nextDist,
                nextSampleDist,
                prevDist,
                prevSampleDist;
            for (i = 0; i < this.samples.length; i++) {
                sampleLatlng = this.samples[i];
                dist = sqrDist(sampleLatlng, mouseLatlng);
                if (nearestInd === null || dist < minDist) {
                    nearestInd = i;
                    minDist = dist;
                }
            }

            if (nearestInd !== null) {
                ind = nearestInd;
                if (nearestInd > 0) {
                    prevDist = sqrDist(mouseLatlng, this.samples[nearestInd - 1]);
                    prevSampleDist = sqrDist(this.samples[nearestInd], this.samples[nearestInd - 1]);
                }
                if (nearestInd < this.samples.length - 1) {
                    nextDist = sqrDist(mouseLatlng, this.samples[nearestInd + 1]);
                    nextSampleDist = sqrDist(this.samples[nearestInd], this.samples[nearestInd + 1]);
                }

                if (nearestInd === 0) {
                    if (nextDist < minDist + nextSampleDist) {
                        di = (minDist - nextDist) / 2 / nextSampleDist + 1 / 2;
                    } else {
                        di = 0.001;
                    }
                } else if (nearestInd === this.samples.length - 1) {
                    if (prevDist < minDist + prevSampleDist) {
                        di = -((minDist - prevDist) / 2 / prevSampleDist + 1 / 2);
                    } else {
                        di = -0.001;
                    }
                } else {
                    if (prevDist < nextDist) {
                        di = -((minDist - prevDist) / 2 / prevSampleDist + 1 / 2);
                    } else {
                        di = (minDist - nextDist) / 2 / nextSampleDist + 1 / 2;
                    }
                }
                if (di < -1) {
                    di = -1;
                }
                if (di > 1) {
                    di = 1;
                }
                this.setCursorPosition(ind + di);
            }
        },

        _buildPath: function(losPoints, horizStep, valueToSvgCoord, xOffset = 0) {
            let losPath = [];
            for (let i = 0; i < losPoints.length; i++) {
                let cx = (xOffset + i) * horizStep;
                let cy = valueToSvgCoord(losPoints[i]);
                losPath.push(losPath.length ? 'L' : 'M');
                losPath.push(cx + ' ' + cy + ' ');
            }
            losPath = losPath.join('');
            return losPath;
        },

        _curveLine: function(xvals, points, distance, inv = false) {
            const R = 6371000;
            return xvals.map((d, i) =>
                points[i] + (inv ? 1 : -1) * ((d * (distance - d)) / (2 * R))
            );
        },

        // eslint-disable-next-line complexity
        setupGraph: function() {
            if (!this._map || !this.values) {
                return;
            }

            while (this.svg.hasChildNodes()) {
                this.svg.removeChild(this.svg.lastChild);
            }
            while (this.leftAxisLables.hasChildNodes()) {
                this.leftAxisLables.removeChild(this.leftAxisLables.lastChild);
            }

            var maxValue = Math.max.apply(null, this.values),
                minValue = Math.min.apply(null, this.values),
                svg = this.svg,
                path, i, horizStep, verticalMultiplier, x, y, gridValues, label;

            var paddingBottom = 8 + 16,
                paddingTop = 8;

            // Line of sight, adjusted for curvature
            let splitLines = [];
            let reliefLine = [];

            // sight line consts
            const c = 3e8;
            const f = this.settings.radioFreq * 1000000;
            const lambda = c / f;

            if (!this.isRadioToolsAvailable()) {
                // reduce to 1
                this.splits = [0, this.values.length - 1];
            }

            // Use splits
            for (i = 1; i < this.splits.length; i++) {
                let splitStart = this.splits[i - 1];
                let splitEnd = this.splits[i];
                const extend = i + 1 < this.splits.length;
                const splitSize = splitEnd - splitStart;

                if (extend) {
                    splitEnd += 1;
                }

                const firstSample = L.latLng(this.samples[splitStart]);
                const lastSample = L.latLng(this.samples[splitEnd]);
                const splitDist = firstSample.distanceTo(lastSample);

                let slicedValues = this.values.slice(splitStart, splitEnd);
                let slicedXValues = Array.from(
                    {length: slicedValues.length},
                    (_, j) => (j / (slicedValues.length - 1)) * splitDist
                );

                let splitReliefLine = slicedValues;
                let splitLosLine = [];
                let losFrensel = {
                    top: [],
                    bottom: []
                };
                let slicedMaxValue = Math.max.apply(null, slicedValues);
                let slicedMinValue = Math.min.apply(null, slicedValues);

                if (this.isSightlineVisible()) {
                    let h0 = slicedValues[0] + this.getTowerHeight(i - 1);
                    let hn = slicedValues[slicedValues.length - 1] + this.getTowerHeight(i);
                    splitLosLine = slicedXValues.map((d) => h0 + ((hn - h0) / splitDist) * d);

                    let fresnelRadius = slicedXValues.map((d) => Math.sqrt((lambda * d * (splitDist - d)) / splitDist));
                    losFrensel.top = splitLosLine.map((y, i) => y + fresnelRadius[i]);
                    losFrensel.bottom = splitLosLine.map((y, i) => y - fresnelRadius[i]);
                }

                if (this.settings.curveRelief) {
                    splitReliefLine = this._curveLine(slicedXValues, splitReliefLine, splitDist, true);
                    slicedMinValue = Math.min(slicedMinValue, Math.min.apply(null, splitReliefLine));
                    slicedMaxValue = Math.max(slicedMaxValue, Math.max.apply(null, splitReliefLine));
                } else {
                    splitLosLine = this._curveLine(slicedXValues, splitLosLine, splitDist);
                    losFrensel.top = this._curveLine(slicedXValues, losFrensel.top, splitDist);
                    losFrensel.bottom = this._curveLine(slicedXValues, losFrensel.bottom, splitDist);
                }

                if (this.isSightlineVisible()) {
                    slicedMinValue = Math.min(slicedMinValue, Math.min.apply(null, splitLosLine));
                    slicedMaxValue = Math.max(slicedMaxValue, Math.max.apply(null, splitLosLine));
                }

                minValue = Math.min(slicedMinValue, minValue);
                maxValue = Math.max(slicedMaxValue, maxValue);

                splitReliefLine.pop();

                reliefLine.push(...splitReliefLine);
                splitLines.push({
                    line: splitLosLine,
                    frensel: losFrensel,
                    xvals: slicedXValues,
                    dist: splitDist,
                    start: splitStart,
                    end: splitEnd,
                    size: splitSize
                });
            }

            gridValues = this.calcGridValues(minValue, maxValue);
            horizStep = this.svgWidth / (this.values.length - 1);
            verticalMultiplier =
                (this.svgHeight - paddingTop - paddingBottom) / (gridValues[gridValues.length - 1] - gridValues[0]);

            const valueToSvgCoord = (el) => {
                const y = (el - gridValues[0]) * verticalMultiplier;
                return this.svgHeight - y - paddingBottom;
            };

            path = [];
            let startNewSegment = true;
            for (i = 0; i < reliefLine.length; i++) {
                let value = reliefLine[i];
                if (value === null) {
                    startNewSegment = true;
                    continue;
                }
                path.push(startNewSegment ? 'M' : 'L');
                x = i * horizStep;
                y = valueToSvgCoord(value);
                path.push(x + ' ' + y + ' ');
                startNewSegment = false;
            }
            path = path.join('');
            createSvg('path', {'d': path, 'stroke-width': '1px', 'stroke': 'brown', 'fill': 'none'}, svg);

            const drawSplit = (x) => {
                let splitPath = L.Util.template('M{x1} {y1} L{x2} {y2}', {
                    x1: x,
                    x2: x,
                    y1: 0,
                    y2: this.svgHeight
                });
                createSvg(
                    'path',
                    {
                        'd': splitPath,
                        'stroke-width': '2px',
                        'stroke': '#aa11ff',
                        'fill': 'none',
                        'stroke-opacity': '0.35'
                    },
                    svg
                );
            };

            // Split lines
            let losOffset = 0;
            for (i = 0; i < splitLines.length; i++) {
                let los = splitLines[i];
                let losLine = los.line;
                let losFrensel = los.frensel;
                let splitXvals = los.xvals;
                let splitDist = los.dist;
                let splitStart = los.start;
                let splitEnd = los.end;
                let splitSize = los.size;
                let isLast = (i + 1) === splitLines.length;

                // Vertical split line
                let x = ((this.svgWidth) / reliefLine.length) * splitStart;
                if (splitLines.length > 1 && i < splitLines.length) {
                    drawSplit(x);
                }

                let inw = 60;
                if (i !== 0) {
                    x -= (inw / 2);
                }

                this.setTowerHeightDom(i, x, paddingTop, inw);

                // add end input
                if (isLast) {
                    let x = ((this.svgWidth) / reliefLine.length) * splitEnd;
                    drawSplit(x);

                    x -= (inw + 8);
                    this.setTowerHeightDom(i + 1, x, paddingTop, inw);
                }

                // Horizontal elevation lines
                var gridStep = (this.svgHeight - paddingBottom - paddingTop) / (gridValues.length - 1);
                for (let j = 0; j < gridValues.length; j++) {
                    const y = gridValues[gridValues.length - j - 1];

                    let gridLine = splitXvals.map(() => y);
                    if (this.settings.curveRelief) {
                        gridLine = this._curveLine(splitXvals, gridLine, splitDist, true);
                    }

                    path = this._buildPath(gridLine, horizStep, valueToSvgCoord, losOffset);

                    createSvg(
                        'path',
                        {'d': path, 'stroke-width': '1px', 'stroke': 'green', 'fill': 'none', 'stroke-opacity': '0.5'},
                        svg
                    );

                    if (i === 0) {
                        label = L.DomUtil.create('div', 'elevation-profile-grid-label', this.leftAxisLables);
                        label.innerHTML = gridValues[gridValues.length - j - 1];
                        label.style.top = (gridStep * j + paddingTop) + 'px';
                    }
                }

                // LOS lines
                if (this.isSightlineVisible()) {
                    const losPath = this._buildPath(losLine, horizStep, valueToSvgCoord, losOffset);
                    const losFresnelTopPath = this._buildPath(losFrensel.top, horizStep, valueToSvgCoord, losOffset);
                    const losFresnelBottomPath = this._buildPath(
                        losFrensel.bottom,
                        horizStep,
                        valueToSvgCoord,
                        losOffset
                    );

                    createSvg('path', {'d': losPath, 'stroke-width': '1px', 'stroke': 'blue', 'fill': 'none'}, svg);
                    createSvg('path', {
                        'd': losFresnelTopPath,
                        'stroke-width': '1px',
                        'stroke-dasharray': '5,5',
                        'stroke': 'blue',
                        'fill':
                        'none'
                    }, svg);
                    createSvg('path', {
                        'd': losFresnelBottomPath,
                        'stroke-width': '1px',
                        'stroke-dasharray': '5,5',
                        'stroke': 'blue',
                        'fill': 'none'
                    }, svg);

                    const y1 = reliefLine[0] + this.settings.towerStart;
                    const y2 = reliefLine[reliefLine.length - 1] + this.settings.towerEnd;
                    path = L.Util.template('M{x1} {y1} L{x2} {y2}', {
                            x1: 0,
                            x2: horizStep * reliefLine.length,
                            y1: valueToSvgCoord(y1),
                            y2: valueToSvgCoord(y2)
                        }
                    );

                    // intersections
                    let intersectX = -1;
                    for (let j = 0; j < reliefLine.length; j++) {
                        const yTerrain = reliefLine[j + losOffset];
                        const yVisibility = losLine[j];

                        if (yTerrain > yVisibility) {
                            intersectX = j;
                            break;
                        }
                    }

                    this.setIntersectionPostition(i, intersectX, losOffset); // TODO: change to add
                    if (intersectX > 0) {
                        let x = ((this.svgWidth) / reliefLine.length) * (intersectX + losOffset);
                        let intersectPath = L.Util.template('M{x1} {y1} L{x2} {y2}', {
                            x1: x,
                            x2: x,
                            y1: 0,
                            y2: this.svgHeight
                        });
                        createSvg(
                            'path',
                            {
                                'd': intersectPath,
                                'stroke-width': '1px',
                                'stroke': '#ff4411',
                                'fill': 'none',
                                'stroke-opacity': '0.8'
                            },
                            svg
                        );
                    }
                }

                losOffset += splitSize;
            }
        },

        onCloseButtonClick: function() {
            this.removeFrom(this._map);
        }
    }
);

export {ElevationProfile, calcSamplingInterval};
