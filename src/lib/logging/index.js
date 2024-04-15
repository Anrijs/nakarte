function randId() {
    return Math.random().toString(36).substring(2, 13);
}

function captureMessage(_unused_msg, _unused_extra = {}) {
    // do nothing
}

function captureException(e, description) {
    console.log('captureException', e, description); // eslint-disable-line no-console
}
function captureBreadcrumb(_unused_message, _unused_data = {}) {
    // do nothing
}

function logEvent(_unused_eventName, _unused_extra) {
    // do nothing
}

export {captureMessage, captureException, captureBreadcrumb, logEvent, randId};
