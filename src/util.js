const STATUS = Object.freeze({
    NOT_INITIALIZED: 1,
    NOT_SUPPORTED: 2,
    NOT_REACHABLE: 3,
    OK: 4,
    NO_VALUE: 5,
    PW_REQUIRED: 6,
    NOT_ENABLED: 7,
    INVALID_CONFIG: 8,
    UNKNOWN: 9
});

const STATUS_MSG = Object.freeze({
    [STATUS.NOT_INITIALIZED]: { fill: 'grey', shape: 'dot', text: 'status.not-initialized' },
    [STATUS.NOT_SUPPORTED]: { fill: 'grey', shape: 'dot', text: 'status.not-supported' },
    [STATUS.NOT_REACHABLE]: { fill: 'red', shape: 'dot', text: 'status.not-reachable' },
    [STATUS.NO_VALUE]: { fill: 'red', shape: 'dot', text: 'status.no-value' },
    [STATUS.PW_REQUIRED]: { fill: 'red', shape: 'dot', text: 'status.pw-required' },
    [STATUS.NOT_ENABLED]: { fill: 'red', shape: 'dot', text: 'status.access-disabled' },
    [STATUS.INVALID_CONFIG]: { fill: 'red', shape: 'dot', text: 'status.invalid-config' },
    [STATUS.UNKNOWN]: { fill: 'red', shape: 'dot', text: 'status.unknown' },
    [STATUS.OK]: { fill: 'red', shape: 'dot', text: 'status.invalid-clamp' } // NOTE: does NOT cover status.connectedON / OFF
});

module.exports = {
    STATUS,
    STATUS_MSG
}