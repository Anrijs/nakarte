/* eslint-disable */
function lks2wgs(x, y) {
    try {
        // konstantes
        const a = 6378137.0;
        const F = 298.257223563;
        const f = 1 / F;
        const e2 = 2 * f - f * f;

        const nLongCMerid = 24;
        const K0 = 0.9996;
        const FalseNm = -6000000.0;
        const FalseEm = 500000.0;

        const n1 = 0.00167922038638372;
        const n2 = n1 * n1;
        const n3 = n1 * n2;
        const n4 = n2 * n2;
        const G = 111132.952547919;

        const E4 = x - FalseNm;
        const F4 = E4 / K0;
        const H4 = y - FalseEm;
        const I4 = H4 / K0;
        const J4 = (F4 * Math.PI) / (G * 180);
        const K4 = J4 * 2;
        const L4 = J4 * 4;
        const M4 = J4 * 6;
        const N4 = J4 * 8;
        const X4a = (3 * n1) / 2.0;
        const X4b = (27 * n3) / 32.0;
        const X4z = X4a - X4b;
        const X4 = X4z * Math.sin(K4);
        const AC4a = (21 * n2) / 16.0;
        const AC4b = (55 * n4) / 32.0;
        const AC4z = AC4a - AC4b;
        const AC4 = AC4z * Math.sin(L4);
        const AH4 = (151 * n3 * Math.sin(M4)) / 96.0;
        const AM4 = (1097 * n4 * Math.sin(N4)) / 512.0;
        const AR4 = J4 + X4 + AC4 + AH4 + AM4;
        const AS4 = Math.sin(AR4);
        const AT4 = 1 / Math.cos(AR4);
        const BA4 = a / (1 - e2 * AS4 * AS4) ** 0.5;
        const BL4 = Math.tan(AR4);
        const AZ4 = (a * (1 - e2)) / (1 - e2 * AS4 * AS4) ** 1.5;
        const BB4 = I4 / BA4;
        const BC4 = BB4 * BB4;
        const BD4 = BB4 * BC4;
        const BE4 = BC4 * BC4;
        const BF4 = BE4 * BB4;
        const BG4 = BD4 * BD4;
        const BH4 = BB4 * BG4;
        const BM4 = BL4 * BL4;
        const BN4 = BL4 * BM4;
        const BO4 = BM4 * BM4;
        const BQ4 = BN4 * BN4;
        const BR4 = BA4 / AZ4;
        const BS4 = BR4 * BR4;
        const BT4 = BS4 * BR4;
        const BU4 = BS4 * BS4;
        const CE4 = -(((BL4 / (K0 * AZ4)) * BB4 * H4) / 2.0);
        const CJ4 = (BL4 / (K0 * AZ4)) * ((BD4 * H4) / 24) * (-4 * BS4 + 9 * BR4 * (1 - BM4) + 12 * BM4);
        const CO4a = -(BL4 / (K0 * AZ4));
        const CO4b = (BF4 * H4) / 720.0;
        const CO4c = 11 - 24 * BM4;
        const CO4d = 21 - 71 * BM4;
        const CO4e = 15 - 98 * BM4 + 15 * BO4;
        const CO4f = 5 * BM4 - 3 * BO4;
        const CO4z = CO4a * CO4b;
        const CO4 = CO4z * (8 * BU4 * CO4c - 12 * BT4 * CO4d + 15 * BS4 * CO4e + 180 * BR4 * CO4f + 360 * BO4);
        const CT4 = (BL4 / (K0 * AZ4)) * ((BH4 * H4) / 40320.0) * (1385 + 3633 * BM4 + 4095 * BO4 + 1575 * BQ4);
        const CY4 = AR4 + CE4 + CJ4 + CO4 + CT4;
        const CX4 = (CY4 / Math.PI) * 180;
        const EC4 = (nLongCMerid / 180.0) * Math.PI;
        const EH4 = AT4 * BB4;
        const EM4 = -AT4 * (BD4 / 6.0) * (BR4 + 2 * BM4);
        const ER4a = -4 * BT4 * (1 - 6 * BM4) + BS4 * (9 - 68 * BM4) + 72 * BR4 * BM4 + 24 * BO4;
        const ER4 = AT4 * (BF4 / 120.0) * ER4a;
        const EW4 = -AT4 * (BH4 / 5040.0) * (61 + 662 * BM4 + 1320 * BO4 + 720 * BQ4);
        const FB4 = EC4 + EH4 + EM4 + ER4 + EW4;
        const FA4 = (FB4 / Math.PI) * 180;

        return [CX4, FA4];
    } catch (err) {
        return false;
    }
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

        const dBRad = (dBDeg * Math.PI) / 180.0;
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

function tksQuarterInc(pos, num, step) {
    switch (num) {
        case '1':
            break;
        case '2':
            pos.y += step;
            break;
        case '3':
            pos.x += step;
            break;
        case '4':
            pos.x += step;
            pos.y += step;
            break;
    }
    return pos;
}

function tks2wgs(pageNumber) {
    // Validate format
    const parts = pageNumber.split("-");
    if (parts.length !== 3) {
        throw new Error("Invalid page number format. Use XXXX-XX-XX.");
    }

    /*
        Scalw.      Name                Step
        200_000,    21                  100_000
        100_000,    211                 50_000
        50_000,     2111                25_000
        25_000,     2111.1              12_500
        10_000,     2111-11             5_000
        5_000,      2111-11.1           2_500
        2_000,      2111-11-11          1_000
        1_000,      2111-11-11.1        500
        500,        2111-11-11.1.1      250

        3323-33-41
    */

    let pos = {
        x: 0,
        y: 300_000,
    };

    pos.x += parseInt(parts[0][0] - 1) * 100_000;
    pos.y += parseInt(parts[0][1] - 1) * 100_000;

    pos = tksQuarterInc(pos, parts[0][2], 50_000);
    pos = tksQuarterInc(pos, parts[0][3], 25_000);

    pos.x += parseInt(parts[1][0] - 1) * 5_000;
    pos.y += parseInt(parts[1][1] - 1) * 5_000;

    pos.x += parseInt(parts[2][0] - 1) * 1_000;
    pos.y += parseInt(parts[2][1] - 1) * 1_000;

    // Center
    pos.x += 500;
    pos.y += 500;

    return lks2wgs(pos.x, pos.y);
}
/* eslint-enable */

export {lks2wgs, wgs2lks, tks2wgs};
