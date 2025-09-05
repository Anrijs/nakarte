const sources = {
    config: {
        base: 'https://tiles.anrijs.lv/',
    },
    groups: [
        {
            name: 'Pamatnes',
            layers: [
                {
                    years: '',
                    name: 'OpenStreetMap',
                    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    zoom: 19,
                    scale: '',
                    code: 'O',
                    isDefault: true,
                    extras: {
                        isOverlay: false,
                        scaleDependent: true,
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">' +
                            'OpenStreetMap</a> contributors'
                    },
                },
                {
                    years: '',
                    name: 'ESRI Sat',
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    zoom: 19,
                    scale: '',
                    code: 'E',
                    isDefault: true,
                    extras: {
                        isOverlay: false,
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">' +
                            'OpenStreetMap</a> contributors'
                    },
                }
            ],
        },
        {
            name: 'Datu Slāņi',
            layers: [
                {
                    name: 'TKS-93 karšu nomenklatūras lapas',
                    code: 'tks',
                    type: 'LatviaTopoGrid',
                    isDefault: true,
                    extras: {
                        print: false,
                        jnx: false,
                        hotkey: '+T',
                    },
                },
            ]
        },
    ],
};

export {sources};
