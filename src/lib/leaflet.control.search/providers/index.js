import {CoordinatesProvider} from './coordinates';
import {GeoLatvijaProvider} from './geolatvija';
import {KadastrsProvider} from './kadastrs';
import {LinksProvider} from './links';
// import {MapyCzProvider} from './mapycz';
// import {PhotonProvider} from './photon';

const providers = {
    geolatvija: GeoLatvijaProvider,
    kadastrs: KadastrsProvider,
    // mapycz: MapyCzProvider,
    // photon: PhotonProvider,
};

const magicProviders = [LinksProvider, CoordinatesProvider];

export {providers, magicProviders};
