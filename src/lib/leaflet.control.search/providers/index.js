import {CoordinatesProvider} from './coordinates';
import {GeoLatvijaProvider} from './geolatvija';
import {LinksProvider} from './links';
import {MapyCzProvider} from './mapycz';
// import {PhotonProvider} from './photon';

const providers = {
    geolatvija: GeoLatvijaProvider,
    mapycz: MapyCzProvider,
    // photon: PhotonProvider,
};

const magicProviders = [LinksProvider, CoordinatesProvider];

export {providers, magicProviders};
