export let state = {
    currentStation: 0,
    stage: 1,
    timeZone: 'Europe/Istanbul',
    isScrolling: false,
    isPlaying: false,
    isSwitching: false,
    isRetrying: false,
    photoIndex: 0,
    activeBgLayer: 1,
    kickImpulse: 0,
    lastVolume: 0.5,
    lowPowerMode: false,
    activePlayerId: 1
};

export let timers = {
    fade: null,
    connection: null,
    debounce: null,
    retry: null,
    detection: null,
    popupSearch: null,
    popupResult: null,
    popupClose: null,
    promptClose: null
};

// Bu nesneler diğer dosyalarda da kullanılacağı için export ediyoruz.
export let audioCtx, analyzer, dataArray;

export function setAudioContext(ctx) { audioCtx = ctx; }
export function setAnalyzer(node) { analyzer = node; }
export function setDataArray(array) { dataArray = array; }