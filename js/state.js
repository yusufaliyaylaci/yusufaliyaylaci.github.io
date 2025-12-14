export let audioCtx = null;
export let analyzer = null;
export let dataArray = null;

export const state = {
    stage: 0, 
    photoIndex: 0,
    currentStation: 0,
    activePlayerId: 1,
    lastVolume: 0.5,
    isPlaying: false,
    isSwitching: false,
    isRetrying: false,
    activeBgLayer: 1,
    timeZone: 'Europe/Istanbul',
    isScrolling: false,
    kickImpulse: 0,
    lowPowerMode: false,
    lastDirection: 1,
    gainNodes: null, // GainNode'ları saklamak için
    isListenerMode: false // YENİ: Dinleyici modu kontrolü
};

export const timers = {
    fade: null,
    connection: null,
    retry: null,
    debounce: null,
    detection: null,
    popupSearch: null,
    popupResult: null,
    popupClose: null
};

export function setAudioContext(ctx) { audioCtx = ctx; }
export function setAnalyzer(node) { analyzer = node; }
export function setDataArray(arr) { dataArray = arr; }