function truncToFixed(x, precision) {
    let s = x.toString();
    let point = s.indexOf('.');
    if (point === -1) {
        point = s.length;
        s += '.';
    }
    let sliceEnd = point + precision;
    if (precision > 0) {
        s = s.padEnd(point + precision + 1, '0');
        sliceEnd += 1;
    }
    s = s.slice(0, sliceEnd);
    return s;
}

function formatNumber(value, size, precision = 0) {
    if (value < 0) {
      throw new Error('Negative values not supported');
    }

    if (precision > 0) {
        size += 1;
    }
    return truncToFixed(value, precision).padStart(size + precision, '0');
}

function coordinatePresentations(coordinate, isLat) {
    const degrees = Math.abs(coordinate);
    const intDegrees = Math.floor(degrees);
    const minutes = (degrees - intDegrees) * 60;
    const intMinutes = Math.floor(minutes);
    const seconds = (minutes - intMinutes) * 60;

    let direction;
    if (isLat) {
        direction = (coordinate < 0) ? 'S' : 'N';
    } else {
        direction = (coordinate < 0) ? 'W' : 'E';
    }

    return {
        signedDegrees: coordinate.toFixed(5),
        degrees: formatNumber(degrees, 0, 5),
        intDegrees: formatNumber(intDegrees, 0),
        minutes: formatNumber(minutes, 2, 3),
        intMinutes: formatNumber(intMinutes, 2),
        seconds: formatNumber(seconds, 2, 2),
        direction
    };
}

function formatLatLng(latlng, format) {
    return {
        lat: format.formatter(coordinatePresentations(latlng.lat, true)),
        lng: format.formatter(coordinatePresentations(latlng.lng, false)),
        extra: format.eformatter ? format.eformatter(latlng) : null,
    };
}

function wgs2lks(lat, lon) {
    try {
        // globalas konstantes
        const a = 6378137.0;
        const F = 298.257223563;
        const f = 1 / F;
        const e2 = 2 * f - f * f;

        const nLongCMerid = 24;
        const K0 = 0.9996;
        const FalseNm = -6000000.0;
        const FalseEm = 500000.0;

        // konstantes
        const A0 = 0.998324298452795;
        const A2 = 0.0025146070605187;
        const A4 = 0.00000263904659433762;
        const A6 = 0.00000000341804608659579;

        // aprekins
        const dBDeg = lat;
        const dLDeg = lon;

        const dBRad = dBDeg * Math.PI / 180.0;
        const dSin = Math.sin(dBRad);
        const dCos = Math.cos(dBRad);

        const m = a * (A0 * dBRad - A2 * Math.sin(2 * dBRad) + A4 * Math.sin(4 * dBRad) - A6 * Math.sin(6 * dBRad));
        const Rho = a * (1 - e2) / ((1 - e2 * (dSin ** 2)) ** 1.5);
        const Nu = a / ((1 - e2 * (dSin ** 2)) ** 0.5);
        const Psi = Nu / Rho;
        const t = Math.tan(dBRad);

        const t2 = t ** 2;
        const t4 = t ** 4;
        const t6 = t ** 6;

        const c2 = dCos ** 2;
        const c3 = dCos ** 3;
        const c4 = dCos ** 4;
        const c5 = dCos ** 5;
        const c6 = dCos ** 6;
        const c7 = dCos ** 7;

        const p2 = Psi ** 2;
        const p3 = Psi ** 3;
        const p4 = Psi ** 4;

        const DiffLong = dLDeg - nLongCMerid;
        const DiffRad = DiffLong * Math.PI / 180.0;
        const NTerm1 = (DiffRad ** 2) / 2 * Nu * dSin * dCos;
        const NTerm2 = (DiffRad ** 4) / 24 * Nu * dSin * c3 * (4 * p2 + Psi - t2);
        const n3a = 8 * p4 * (11 - 24 * t2) - 28 * p3 * (1 - 6 * t2) + p2 * (1 - 32 * t2) - Psi * 2 * t2 + t4;
        const NTerm3 = (DiffRad ** 6) / 720 * Nu * dSin * c5 * n3a;
        const NTerm4 = (DiffRad ** 8) / 40320 * Nu * dSin * c7 * (1385 - 3111 * t2 + 543 * t4 - t6);

        const ETerm1 = (DiffRad ** 2) / 6 * c2 * (Psi - t2);
        const ETerm2 = (DiffRad ** 4) / 120 * c4 * (4 * p3 * (1 - 6 * t2) + p2 * (1 + 8 * t2) - Psi * 2 * t2 + t4);
        const ETerm3 = (DiffRad ** 6) / 5040 * c6 * (61 - 479 * t2 + 179 * t4 - t6);

        // aprekins LKS xy
        let X = K0 * (m + NTerm1 + NTerm2 + NTerm3 + NTerm4) + FalseNm;
        let Y = K0 * Nu * DiffRad * dCos * (1 + ETerm1 + ETerm2 + ETerm3) + FalseEm;

        X = Math.round(X * 1000) / 1000;
        Y = Math.round(Y * 1000) / 1000;

        return [X, Y];
    } catch (err) {
        return null;
    }
}

const SIGNED_DEGREES = {
    code: 'd',
    label: '±ddd.ddddd',
    wrapperClass: 'leaflet-coordinates-wrapper-signed-degrees',
    formatter: ({signedDegrees}) => signedDegrees
};

const DEGREES = {
    code: 'D',
    label: 'ddd.ddddd°',
    wrapperClass: 'leaflet-coordinates-wrapper-degrees',
    formatter: ({degrees, direction}) => `${direction} ${degrees}°`
};

const DEGREES_AND_MINUTES = {
    code: 'DM',
    label: 'ddd°mm.mmm′',
    wrapperClass: 'leaflet-coordinates-wrapper-degrees-and-minutes',
    formatter: ({intDegrees, minutes, direction}) => `${direction} ${intDegrees}°${minutes}′`
};

const DEGREES_AND_MINUTES_AND_SECONDS = {
    code: 'DMS',
    label: 'ddd°mm′ss.s″',
    wrapperClass: 'leaflet-coordinates-wrapper-degrees-and-minutes-and-seconds',
    formatter: ({intDegrees, intMinutes, seconds, direction}) => `${direction} ${intDegrees}°${intMinutes}′${seconds}″`
};

const LKS92 = {
    code: 'LKS92',
    label: 'LKS92',
    wrapperClass: 'leaflet-coordinates-wrapper-degrees',
    formatter: (_unused) => '',
    eformatter: (latlng) => {
        const lks = wgs2lks(latlng.lat, latlng.lng);
        if (lks) {
            return `${lks[1]}, ${lks[0]}`;
        }
        return null;
    }
};

export {
    SIGNED_DEGREES,
    DEGREES,
    DEGREES_AND_MINUTES,
    DEGREES_AND_MINUTES_AND_SECONDS,
    LKS92,
    formatLatLng
};
