import parsers from './parsers';

function parseGeoFile(name, data, tracklist) {
    for (var i = 0; i < parsers.length; i++) {
        var parsed = parsers[i](data, name, tracklist);
        if (parsed !== null) {
            return parsed;
        }
    }
    return [{name: name, error: 'UNSUPPORTED'}];
}

export default parseGeoFile;
