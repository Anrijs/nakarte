import parseGpx from './gpx';
import parseZip from './zip';
import parseCsv from './csv';
import {parseKmz, parseKml} from './kml';
import {parseOziPlt, parseOziRte, parseOziWpt} from './ozi';

const parsers = [
    parseCsv,
    parseKmz,
    parseZip,
    parseGpx,
    parseOziRte,
    parseOziPlt,
    parseOziWpt,
    parseKml,
];

export default parsers;
