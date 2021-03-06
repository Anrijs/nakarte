[![Build Status](https://travis-ci.com/wladich/nakarte.svg?branch=master)](https://travis-ci.com/wladich/nakarte)

Source code of site http://nakarte.me (former http://nakarte.tk)

Install locally for development

```bash
git clone git://github.com/wladich/nakarte
cd nakarte
yarn
```

Create a dummy `secrets.js` file:
```
cp src/secrets.js.template src/secrets.js
```

Run dev server:
```bash
yarn start
```

Check code for errors:
```bash
yarn run lint
```

Some features require keys stored in src/secrets.js. 
In repository those keys are replaced with dummy ones.
    
Some of server side components:
https://github.com/wladich/westra_passes_for_nakarte
https://github.com/wladich/ElevationServer
