import ko from 'knockout';
import L from 'leaflet';

import {lks2wgs} from '~/lib/lks92';
import {notify, query} from '~/lib/notifications';

function parseCsv(txt, filename, control) {
    let error;

    if (!filename.toLowerCase().endsWith('.csv')) {
        return null;
    }

    function csv2array(strData, strDelimiter = ',') {
        // Create a regular expression to parse the CSV values.

        /* eslint-disable */
        const objPattern = new RegExp(
            (
                // Delimiters.
                "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

                // Quoted fields.
                "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

                // Standard fields.
                "([^\"\\" + strDelimiter + "\\r\\n]*))"
            ),
            "gi"
        );
        /* eslint-enable */

        const arrData = [[]];
        let arrMatches = null;

        while ((arrMatches = objPattern.exec(strData))) {
            const strMatchedDelimiter = arrMatches[1];

            if (strMatchedDelimiter.length && strMatchedDelimiter !== strDelimiter) {
                arrData.push([]);
            }

            let strMatchedValue;
            if (arrMatches[2]) {
                /* eslint-disable */
                strMatchedValue = arrMatches[ 2 ].replace(
                    new RegExp( "\"\"", "g" ),
                    "\""
                );
                /* eslint-enable */
            } else {
                strMatchedValue = arrMatches[3];
            }
            arrData[arrData.length - 1].push(strMatchedValue);
        }
        return arrData;
    }

    function showImportForm(data) {
        const importWindow = L.DomUtil.create('div', 'leaflet-layers-dialog-wrapper', control._map._controlContainer);

        function closeWindow(wd) {
            if (!wd) {
                return;
            }
            wd.parentNode.removeChild(wd);
        }

        L.DomEvent.disableClickPropagation(importWindow).disableScrollPropagation(importWindow);

        const customLayerWindow = L.DomUtil.create('div', 'custom-layers-window', importWindow);
        const form = L.DomUtil.create('form', '', customLayerWindow);
        L.DomEvent.on(form, 'submit', L.DomEvent.preventDefault);

        const model = {
            x: 1,
            y: 0,
            name: -1,
            type: 'WGS84',
        };

        const buttons = [
            {
                caption: 'Save',
                callback: (fieldValues) => {
                    const maxId = Math.max(fieldValues.x, fieldValues.y, fieldValues.name);
                    const waypoints = [];

                    for (let i = 1; i < data.length; i++) {
                        const point = data[i];
                        if (point.length < maxId + 1) {
                            continue;
                        }

                        let x = point[fieldValues.x].trim();
                        let y = point[fieldValues.y].trim();

                        x = x.replace(',', '.');
                        y = y.replace(',', '.');

                        if (fieldValues.type === 'lks92') {
                            const lks = lks2wgs(x, y);
                            if (!lks) {
                                continue;
                            }
                            x = lks[1];
                            y = lks[0];
                        }

                        if (isNaN(x) || isNaN(y)) {
                            notify(['Failed to parse data: ' + JSON.stringify(point)]);
                            return;
                        }

                        waypoints.push({
                            lat: y,
                            lng: x,
                            name: point[fieldValues.name] || i,
                        });
                    }

                    control.addTracksFromGeodataArray([
                        {
                            name: filename,
                            tracks: [],
                            points: waypoints,
                            error: error,
                        },
                    ]);

                    closeWindow(importWindow);
                },
            },
            {
                caption: 'Cancel',
                callback: () => {
                    closeWindow(importWindow);
                },
            },
        ];

        const csvFields = [
            {
                name: '# Row ID',
                value: -1,
            },
        ];

        data[0].map((field, id) => {
            let short = field;
            if (short.length > 30) {
                short = short.substring(0, 30) + '...';
            }
            return csvFields.push({name: short, value: id});
        });

        const dialogModel = {
            x: ko.observable(model.x),
            y: ko.observable(model.y),
            name: ko.observable(model.y),
            type: ko.observable(model.y),

            csvFields: csvFields,
            types: [
                {
                    name: 'WGS84 (dd.ddddd)',
                    value: 'wgs84',
                },
                {
                    name: 'LKS92',
                    value: 'lks92',
                },
            ],
            buttons: buttons,
            buttonClicked: function buttonClicked(callbackN) {
                const retValues = {
                    x: dialogModel.x(),
                    y: dialogModel.y(),
                    name: dialogModel.name(),
                    type: dialogModel.type(),
                };

                buttons[callbackN].callback(retValues);
            },
        };

        /* eslint-disable max-len */
        const formHtml = `<b><u>Import CSV file</u></b><br>
        <label>Coordinate system</label>
        <select data-bind="options: types, optionsValue: 'value', optionsText: 'name', value: type"></select>
        <br>
        
        <label>Latitude / Y</label>
        <select data-bind="options: csvFields, optionsValue: 'value', optionsText: 'name', value: y"></select>
        <br>

        <label>Longitude / X</label>
        <select data-bind="options: csvFields, optionsValue: 'value', optionsText: 'name', value: x"></select>
        <br>

        <label>Name</label>
        <select data-bind="options: csvFields, optionsValue: 'value', optionsText: 'name', value: name"></select>
        <br>

        <br>
        <div data-bind="foreach: buttons">
        <a class="button" data-bind="click: $root.buttonClicked.bind(null, $index()), text: caption"></a>
    </div>`;
        /* eslint-enable max-len */
        form.innerHTML = formHtml;
        ko.applyBindings(dialogModel, form);
    }

    const delimiter = query('Atdalītāls / delimiter: ', ',');
    const data = csv2array(txt, delimiter);

    if (data.length < 1 || data[0].length < 2) {
        return null;
    }

    showImportForm(data);

    // Return blank. Will add actual track after fields are selected after
    return [
        {
            name: filename,
            tracks: [],
            points: [],
            error: error,
        },
    ];
}

export default parseCsv;
