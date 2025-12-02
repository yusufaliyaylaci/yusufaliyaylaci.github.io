// =========================================
// 1. YAPILANDIRMA VE DEĞİŞKENLER
// =========================================
const CONFIG = {
    stations: [
        { name: "Lofi Hip Hop", url: "https://stream.zeno.fm/0r0xa792kwzuv", gradient: "linear-gradient(45deg, #240b36, #c31432, #240b36, #c31432)", accent: "#c31432" },
        { name: "Number 1 FM", url: "https://n10101m.mediatriple.net/numberone", gradient: "linear-gradient(45deg, #8E2DE2, #4A00E0, #8E2DE2, #4A00E0)", accent: "#8E2DE2" },
        { name: "Power FM", url: "https://listen.powerapp.com.tr/powerfm/mpeg/icecast.audio", gradient: "linear-gradient(45deg, #1cb5e0, #000046, #1cb5e0, #000046)", accent: "#1cb5e0" },
        { name: "Joy FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_FM_SC", gradient: "linear-gradient(45deg, #134e5e, #71b280, #134e5e, #71b280)", accent: "#71b280" },
        { name: "Virgin Radio", url: "https://karnaval.mncdn.com/virginradio/mpeg/icecast.audio", gradient: "linear-gradient(45deg, #AA076B, #61045F, #AA076B, #61045F)", accent: "#f093fb" },
        { name: "Power Türk", url: "https://listen.powerapp.com.tr/powerturk/mpeg/icecast.audio", gradient: "linear-gradient(45deg, #e52d27, #b31217, #e52d27, #b31217)", accent: "#e52d27" }
    ],
    photos: ["profil.jpg", "profil.jpg"], 
    weatherApi: "https://api.open-meteo.com/v1/forecast",
    geoApi: "https://geocoding-api.open-meteo.com/v1/search"
};

let state = {
    currentStation: 0,
    stage: 1, 
    timeZone: 'Europe/Istanbul',
    isScrolling: false,
    isPlaying: false,
    isSwitching: false,
    photoIndex: 0,
    activeBgLayer: 1,
    kickImpulse: 0,
    lastVolume: 0.5
};

let timers = {
    fade: null,
    connection: null,
    debounce: null
};

let audioCtx, analyzer, dataArray;

// =========================================
// 2. BAŞLATMA
// =========================================
function startExperience() {
    const overlay = document.getElementById("overlay");
    if(overlay) overlay.classList.add('slide-down-active');
    
    const card = document.getElementById("mainCard");
    card.style.opacity = "1"; 
    card.style.transform = "translateY(0) scale(1.12)"; 
    
    document.getElementById("footerText").classList.add('copyright-visible');
    document.getElementById("weatherWidget").classList.add('visible');

    setupAudioContext();
    initRadio();
    
    setTimeout(() => { togglePlay(); }, 100);

    setTimeout(() => {
        initClock();
        initWeather();
        initSnow();
        setCircularFavicon();
        setupClickInteractions();
        setupVolumeControl();
    }, 100); 

    setTimeout(() => { if(overlay) overlay.style.display = 'none'; }, 1500); 
}

function setupAudioContext() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        const audio = document.getElementById("bgMusic");
        analyzer = audioCtx.createAnalyser();
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(analyzer);
        analyzer.connect(audioCtx.destination);
        analyzer.fftSize = 256;
        dataArray = new Uint8Array(analyzer.frequencyBinCount);
    } catch(e) { console.warn("Audio Context Hatası:", e); }
}

// =========================================
// 3. ETKİLEŞİM VE SCROLL
// =========================================
window.addEventListener('wheel', (e) => {
    if(state.isScrolling) return;
    if(e.deltaY > 0) { 
        if(state.stage < 4) { state.stage++; changeStage(); lockScroll(); } 
        else { triggerBump('bump-up'); lockScroll(400); }
    } else { 
        if(state.stage > 0) { state.stage--; changeStage(); lockScroll(); } 
        else { triggerBump('bump-down'); lockScroll(400); }
    }
});

function setupClickInteractions() {
    const wWidget = document.getElementById("weatherWidget");
    wWidget.addEventListener('click', (e) => {
        if(wWidget.classList.contains('search-mode')) return;
        if(state.stage === 4) return;
        state.stage = 4; changeStage(); e.stopPropagation();
    });

    const rPlayer = document.getElementById("playerBox");
    rPlayer.addEventListener('click', (e) => {
        if(e.target.closest('button') || e.target.closest('input')) return;
        if(state.stage === 3) return;
        state.stage = 3; changeStage(); e.stopPropagation(); 
    });

    document.addEventListener('click', (e) => {
        if(state.stage === 3 || state.stage === 4) {
            const insideRadio = e.target.closest('.radio-player');
            const insideWeather = e.target.closest('.weather-widget');
            if(state.stage === 3 && !insideRadio) goDefaultPage();
            if(state.stage === 4 && !insideWeather) goDefaultPage();
        }
    });
}

function goDefaultPage() { state.stage = 1; changeStage(); }
function lockScroll(duration = 1200) { state.isScrolling = true; setTimeout(() => { state.isScrolling = false; }, duration); }
function triggerBump(className) { document.body.classList.add(className); setTimeout(() => document.body.classList.remove(className), 400); }

function changeStage() {
    const card = document.getElementById("mainCard");
    card.classList.remove("state-album", "state-bio", "state-social");
    card.setAttribute("data-state", state.stage);
    
    if(state.stage === 3) document.body.classList.add('view-mode-social'); else document.body.classList.remove('view-mode-social');
    if(state.stage === 4) document.body.classList.add('view-mode-weather'); else document.body.classList.remove('view-mode-weather');

    if(state.stage === 0) card.classList.add("state-album");
    else if(state.stage === 2) card.classList.add("state-bio");
}

// =========================================
// 4. RADYO VE SES KONTROLÜ
// =========================================
function initRadio() {
    const audio = document.getElementById("bgMusic");
    if(!audio) return;
    
    updateUI(CONFIG.stations[state.currentStation].name, "Hazırlanıyor...", "#aaa");
    audio.src = CONFIG.stations[state.currentStation].url;
    audio.volume = state.lastVolume;

    audio.addEventListener('playing', () => {
        clearTimeout(timers.connection); 
        state.isSwitching = false; 
        state.isPlaying = true;
        fadeInMusic(); 
        updateBackground('station'); 
        updateThemeColors(false);
        updateUI(null, "Canlı Yayın", CONFIG.stations[state.currentStation].accent);
        document.getElementById("playerBox").classList.add("playing", "active-glow");
        document.getElementById("playIcon").classList.replace("fa-play", "fa-pause");
    });

    audio.addEventListener('error', () => {
        handleConnectionError();
        updateUI(null, "Hata! Geçiliyor...", "red");
        setTimeout(() => forceSkipStation(), 1500); 
    });
}

function setupVolumeControl() {
    const slider = document.getElementById("volRange");
    const audio = document.getElementById("bgMusic");
    slider.value = state.lastVolume;
    updateVolFill(state.lastVolume);
    slider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        audio.volume = val;
        state.lastVolume = val;
        updateVolFill(val);
        const icon = document.getElementById("volIcon");
        if(val === 0) icon.className = "fas fa-volume-mute";
        else if(val < 0.5) icon.className = "fas fa-volume-down";
        else icon.className = "fas fa-volume-up";
    });
}

function updateVolFill(val) {
    const fill = document.getElementById("volFill");
    fill.style.width = (val * 100) + "%";
}

function toggleMute(e) {
    if(e) e.stopPropagation();
    const audio = document.getElementById("bgMusic");
    const slider = document.getElementById("volRange");
    if(audio.volume > 0) {
        state.lastVolume = audio.volume; 
        audio.volume = 0;
        slider.value = 0;
        updateVolFill(0);
        document.getElementById("volIcon").className = "fas fa-volume-mute";
    } else {
        let restore = state.lastVolume > 0 ? state.lastVolume : 0.5;
        audio.volume = restore;
        slider.value = restore;
        updateVolFill(restore);
        document.getElementById("volIcon").className = "fas fa-volume-up";
    }
}

function togglePlay() {
    const audio = document.getElementById("bgMusic");
    if(!audio) return;
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    
    if (audio.paused) {
        audio.play().catch(() => handleConnectionError());
    } else {
        clearInterval(timers.fade); 
        updateUI(null, "Durduruluyor...", "#aaa");
        
        timers.fade = setInterval(() => {
            if (audio.volume > 0.02) audio.volume -= 0.02;
            else { 
                audio.pause(); audio.volume = 0; clearInterval(timers.fade); state.isPlaying = false;
                updateUI(null, "Durduruldu", "#aaa"); 
                updateBackground('default'); updateThemeColors(false);
                document.getElementById("playerBox").classList.remove("playing", "active-glow");
                document.getElementById("playIcon").classList.replace("fa-pause", "fa-play");
            }
        }, 100);
    }
}

function triggerChangeStation(direction) {
    if(state.isSwitching) return; 
    state.isSwitching = true; 
    clearTimeout(timers.connection);
    
    const audio = document.getElementById("bgMusic");
    if(audio && !audio.paused) {
        updateUI(null, "Değiştiriliyor...", "#f093fb");
        clearInterval(timers.fade);
        timers.fade = setInterval(() => {
            if (audio.volume > 0.05) audio.volume -= 0.05;
            else { clearInterval(timers.fade); audio.pause(); finalizeStationChange(direction); }
        }, 50);
    } else { finalizeStationChange(direction); }
}

function finalizeStationChange(direction) {
    state.currentStation = (state.currentStation + (direction === 1 ? 1 : -1) + CONFIG.stations.length) % CONFIG.stations.length;
    const audio = document.getElementById("bgMusic");
    if(audio) {
        audio.src = CONFIG.stations[state.currentStation].url; audio.load();
        audio.volume = state.lastVolume;
        updateUI(CONFIG.stations[state.currentStation].name, "Bağlanıyor...", "#fff");
        timers.connection = setTimeout(() => { handleConnectionError(); forceSkipStation(); }, 8000);
        audio.play().catch(()=>{});
    }
}

function updateUI(name, msg, color) {
    if(name) document.getElementById("stationName").innerText = name;
    if(msg) {
        const s = document.getElementById("statusText");
        s.innerText = msg; s.style.color = color;
    }
}

function fadeInMusic() {
    const audio = document.getElementById("bgMusic");
    const targetVol = state.lastVolume || 0.5;
    audio.volume = 0; clearInterval(timers.fade);
    timers.fade = setInterval(() => { if (audio.volume < targetVol - 0.05) audio.volume += 0.02; else { audio.volume = targetVol; clearInterval(timers.fade); } }, 100);
}

function handleConnectionError() {
    clearTimeout(timers.connection);
    document.getElementById("error-overlay").classList.add('active-error'); 
    document.getElementById("shockwave").classList.add('active-swipe'); 
    document.getElementById("playerBox").classList.add('player-error');
    updateBackground('error'); updateThemeColors(true);
    setTimeout(() => {
        document.getElementById("error-overlay").classList.remove('active-error'); 
        document.getElementById("shockwave").classList.remove('active-swipe'); 
        document.getElementById("playerBox").classList.remove('player-error');
    }, 1200);
}

function forceSkipStation() { clearInterval(timers.fade); state.isSwitching = false; finalizeStationChange(1); }

// =========================================
// 5. GÖRSEL EFEKTLER VE TEMA
// =========================================
function updateBackground(mode) {
    let newGradient;
    if (mode === 'default') newGradient = "linear-gradient(45deg, #000000, #434343, #1a1a1a, #000000)";
    else if (mode === 'error') newGradient = "linear-gradient(45deg, #000000, #3a0000, #000000, #3a0000)";
    else newGradient = CONFIG.stations[state.currentStation].gradient;

    const target = state.activeBgLayer === 1 ? document.getElementById("bg-layer-2") : document.getElementById("bg-layer-1");
    const current = state.activeBgLayer === 1 ? document.getElementById("bg-layer-1") : document.getElementById("bg-layer-2");
    
    target.style.backgroundImage = newGradient;
    current.classList.remove('active'); target.classList.add('active');
    state.activeBgLayer = state.activeBgLayer === 1 ? 2 : 1;
}

function updateThemeColors(isError) {
    const color = isError ? "red" : CONFIG.stations[state.currentStation].accent;
    document.documentElement.style.setProperty('--theme-color', color);
    document.getElementById("playBtn").style.color = color;
    document.querySelectorAll('.equalizer .bar').forEach(b => b.style.backgroundColor = color);
    document.getElementById("playerBox").style.borderColor = isError ? "red" : "rgba(255,255,255,0.15)";
}

function nextPhoto() { state.photoIndex = (state.photoIndex + 1) % CONFIG.photos.length; updatePhoto(); }
function prevPhoto() { state.photoIndex = (state.photoIndex - 1 + CONFIG.photos.length) % CONFIG.photos.length; updatePhoto(); }
function updatePhoto() { document.getElementById("profileImg").src = CONFIG.photos[state.photoIndex]; }

function initClock() {
    function update() {
        try {
            const now = new Date();
            const timeString = new Intl.DateTimeFormat('tr-TR', { timeZone: state.timeZone, hour12: false, hour: '2-digit', minute: '2-digit' }).format(now);
            const [hour, minute] = timeString.split(':');
            document.getElementById("clock-hour").innerText = hour;
            document.getElementById("clock-minute").innerText = minute;
            const dateString = new Intl.DateTimeFormat('tr-TR', { timeZone: state.timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
            document.getElementById("date-display").innerText = dateString;
        } catch(e) {}
    }
    setInterval(update, 1000); update();
}

// =========================================
// 6. HAVA DURUMU İŞLEMLERİ
// =========================================
function initWeather() {
    const defaultFail = () => updateWeatherUI({temperature_2m: "--", wind_speed_10m: "--", relative_humidity_2m: "--", weather_code: 0}, "Şehir Seçin");
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude), defaultFail);
    else defaultFail();

    setupCitySearch();
}

function setupCitySearch() {
    document.getElementById("cityInput")?.addEventListener("input", function() {
        const query = this.value; clearTimeout(timers.debounce);
        const list = document.getElementById("suggestionsList");
        list.innerHTML = ""; list.style.display = "none";
        
        if (query.length < 2) return;
        
        timers.debounce = setTimeout(() => {
            fetch(`${CONFIG.geoApi}?name=${query}&count=5&language=tr&format=json`)
                .then(res => res.json()).then(data => {
                    if (data.results) {
                        list.style.display = "block";
                        data.results.forEach(city => {
                            const item = document.createElement("div");
                            item.className = "suggestion-item";
                            item.innerText = `${city.name}, ${city.country || ''}`;
                            item.onclick = (e) => {
                                e.stopPropagation();
                                if(city.timezone) state.timeZone = city.timezone;
                                fetchWeather(city.latitude, city.longitude, city.name);
                                disableSearchMode(new Event('click'));
                            };
                            list.appendChild(item);
                        });
                    }
                }).catch(()=>{});
        }, 300);
    });
}

function fetchWeather(lat, lon, cityName = "Konumunuz") {
    const url = `${CONFIG.weatherApi}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,relative_humidity_2m&timezone=auto&forecast_days=1`;
    fetch(url)
        .then(res => res.json())
        .then(data => { 
            if(data.timezone) state.timeZone = data.timezone; 
            updateWeatherUI(data.current, cityName, data.hourly); 
        })
        .catch(err => console.error("Hava durumu hatası:", err));
}

function updateWeatherUI(current, name, hourlyData) {
    document.getElementById("w-temp").innerText = `${current.temperature_2m !== "--" ? Math.round(current.temperature_2m) : "--"}°C`;
    document.getElementById("w-city").innerText = name;
    document.getElementById("w-wind").innerText = `${current.wind_speed_10m} km/s`;
    document.getElementById("w-hum").innerText = `%${current.relative_humidity_2m}`;
    
    const code = current.weather_code;
    let icon = "fa-sun", color = "#ffd700", desc = "Açık";
    if (code === 0) { icon = "fa-sun"; color = "#ffd700"; desc = "Güneşli"; }
    else if (code <= 3) { icon = "fa-cloud-sun"; color = "#d4d4d4"; desc = "Parçalı Bulutlu"; }
    else if (code <= 48) { icon = "fa-smog"; color = "#aaa"; desc = "Sisli"; }
    else if (code <= 67) { icon = "fa-cloud-rain"; color = "#00bfff"; desc = "Yağmurlu"; }
    else if (code <= 77) { icon = "fa-snowflake"; color = "#fff"; desc = "Karlı"; }
    else if (code > 80) { icon = "fa-bolt"; color = "#663399"; desc = "Fırtına"; }

    const iconEl = document.getElementById("w-icon");
    iconEl.className = `fas ${icon} weather-icon`; iconEl.style.color = color;

    const descEl = document.getElementById("w-desc");
    if(descEl) { descEl.innerText = desc; descEl.style.color = color; }

    if(hourlyData) { updateExtendedInfo(hourlyData); }
}

function updateExtendedInfo(hourly) {
    const now = new Date();
    const currentHour = now.getHours();
    
    document.getElementById("ex-hum").innerText = `%${hourly.relative_humidity_2m[currentHour] || '--'}`;
    document.getElementById("ex-wind").innerText = `${document.getElementById("w-wind").innerText}`; 
    document.getElementById("ex-uv").innerText = `%${hourly.precipitation_probability[currentHour] || '0'}`; 
    document.querySelector(".extra-card:last-child small").innerText = "Yağış İhtimali";
    document.querySelector(".extra-card:last-child i").className = "fas fa-umbrella";

    const graphContainer = document.getElementById("hourlyGraph");
    graphContainer.innerHTML = ""; 

    let nextHours = [];
    for(let i = 0; i < 6; i++) {
        let index = currentHour + i;
        if(index < 24) { 
            nextHours.push({ time: index, temp: hourly.temperature_2m[index], rain: hourly.precipitation_probability[index] });
        }
    }

    const maxTemp = Math.max(...nextHours.map(h => h.temp)) + 5; 
    const minTemp = Math.min(...nextHours.map(h => h.temp)) - 5;

    nextHours.forEach(h => {
        let heightPercent = 50;
        if(maxTemp !== minTemp) { heightPercent = ((h.temp - minTemp) / (maxTemp - minTemp)) * 80 + 10; }

        const wrapper = document.createElement("div");
        wrapper.className = "graph-bar-wrapper";
        wrapper.innerHTML = `
            <span class="graph-temp">${Math.round(h.temp)}°</span>
            <div class="graph-bar" style="height: ${heightPercent}%;"></div>
            <div class="rain-indicator" title="Yağış: %${h.rain}"><div class="rain-fill" style="width: ${h.rain}%"></div></div>
            <span class="graph-time">${h.time}:00</span>
        `;
        graphContainer.appendChild(wrapper);
    });
}

function enableSearchMode(e) { e.stopPropagation(); document.getElementById("weatherWidget").classList.add("search-mode"); document.getElementById("cityInput").focus(); }
function disableSearchMode(e) { e.stopPropagation(); document.getElementById("weatherWidget").classList.remove("search-mode"); document.getElementById("cityInput").value = ""; }

// =========================================
// 7. KAR EFEKTİ VE VISUALIZER
// =========================================
function initSnow() {
    const canvas = document.getElementById("snowCanvas"); if(!canvas) return;
    const ctx = canvas.getContext("2d"); let snowflakes = [];
    
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize); resize();

    class Snowflake {
        constructor() { this.reset(); this.angle = Math.random() * Math.PI * 2; this.angleSpeed = Math.random() * 0.01 + 0.005; this.swing = Math.random() * 1.5 + 0.5; }
        reset() { this.x = Math.random() * canvas.width; this.y = Math.random() * -canvas.height; this.size = Math.random() * 3 + 1; this.speed = Math.random() * 0.5 + 0.3; this.opacity = Math.random() * 0.5 + 0.3; }
        update() { 
            this.y += this.speed + state.kickImpulse; 
            this.angle += this.angleSpeed; 
            this.x += Math.cos(this.angle) * this.swing * 0.3; 
            if (this.y > canvas.height) this.reset(); 
            if (this.x > canvas.width) this.x = 0; if (this.x < 0) this.x = canvas.width; 
        }
        draw() { ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); }
    }
    
    for (let i = 0; i < 90; i++) snowflakes.push(new Snowflake());

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (analyzer && state.isPlaying) {
            try { 
                analyzer.getByteFrequencyData(dataArray); 
                
                // Kar Efekti İçin Bass
                let bassSum = dataArray[0] + dataArray[1] + dataArray[2]; 
                if ((bassSum / 3) > 210) state.kickImpulse = 2.0;

                // Radyo Visualizer (Sadece Stage 3)
                if (state.stage === 3) {
                    const player = document.getElementById("playerBox");
                    let visualSum = 0;
                    for(let i = 0; i < 20; i++) visualSum += dataArray[i];
                    let avg = visualSum / 20;
                    
                    // 1. Zıplama Efekti (Scale) - Geri geldi
                    const scaleAmount = 1 + (avg / 255) * 0.05; 
                    player.style.transform = `scale(${scaleAmount})`;

                    // 2. LED Dönüş Hızı (Bass vurunca hızlan, yoksa yavaşla)
                    // Normalde 60s, ağır kickte 2s'e düşsün
                    let targetSpeed = 60; // Varsayılan çok yavaş
                    if (avg > 180) targetSpeed = 2; // Bass vurduğunda hızlan
                    
                    player.style.setProperty('--spin-speed', `${targetSpeed}s`);

                    // 3. Parlama (Box Shadow)
                    const color = CONFIG.stations[state.currentStation].accent;
                    const shadowOpacity = Math.floor((avg / 255) * 100).toString(16);
                    const shadowSize = 20 + (avg * 0.2);
                    player.style.boxShadow = `0 10px ${shadowSize}px ${color}${shadowOpacity}`;

                } else {
                    const player = document.getElementById("playerBox");
                    if(player.style.transform) player.style.transform = "";
                    if(player.style.boxShadow) player.style.boxShadow = "";
                }
            } catch(e) {}
        }
        
        state.kickImpulse *= 0.90; 
        snowflakes.forEach(flake => { flake.update(); flake.draw(); }); 
        requestAnimationFrame(animate);
    }
    animate();
}

function setCircularFavicon() {
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const img = new Image(); img.src = 'profil.jpg';
    img.onload = () => { canvas.width = 64; canvas.height = 64; ctx.beginPath(); ctx.arc(32, 32, 32, 0, 2 * Math.PI); ctx.closePath(); ctx.clip(); ctx.drawImage(img, 0, 0, 64, 64); document.getElementById('dynamicFavicon').href = canvas.toDataURL(); };
}