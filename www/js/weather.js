import { CONFIG } from './config.js';
import { state, timers } from './state.js';

export function initWeather() {
    const defaultFail = () => fetchWeather(38.41, 27.13, "İzmir (Varsayılan)");
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude), defaultFail);
    } else {
        defaultFail();
    }
    setupCitySearch();
}

export function fetchWeather(lat, lon, cityName = "Konumunuz") {
    const url = `${CONFIG.weatherApi}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,relative_humidity_2m&timezone=auto&forecast_days=1`;
    fetch(url).then(res => res.json()).then(data => {
        if(data.timezone) state.timeZone = data.timezone;
        updateWeatherUI(data.current, cityName, data.hourly);
    }).catch(err => console.error("Hava durumu hatası:", err));
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
    iconEl.className = `fas ${icon} weather-icon`;
    iconEl.style.color = color;
    
    const descEl = document.getElementById("w-desc");
    if(descEl) { descEl.innerText = desc; descEl.style.color = color; }
    
    if(hourlyData) updateExtendedInfo(hourlyData);
}

function updateExtendedInfo(hourly) {
    const now = new Date(); const currentHour = now.getHours();
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
        if(index < 24) nextHours.push({ time: index, temp: hourly.temperature_2m[index], rain: hourly.precipitation_probability[index] });
    }
    
    const maxTemp = Math.max(...nextHours.map(h => h.temp)) + 5;
    const minTemp = Math.min(...nextHours.map(h => h.temp)) - 5;
    
    nextHours.forEach(h => {
        let heightPercent = 50;
        if(maxTemp !== minTemp) { heightPercent = ((h.temp - minTemp) / (maxTemp - minTemp)) * 80 + 10; }
        const wrapper = document.createElement("div");
        wrapper.className = "graph-bar-wrapper";
        wrapper.innerHTML = `<span class="graph-temp">${Math.round(h.temp)}°</span><div class="graph-bar" style="height: ${heightPercent}%;"></div><div class="rain-indicator" title="Yağış: %${h.rain}"><div class="rain-fill" style="width: ${h.rain}%"></div></div><span class="graph-time">${h.time}:00</span>`;
        graphContainer.appendChild(wrapper);
    });
}

function setupCitySearch() {
    document.getElementById("cityInput")?.addEventListener("input", function() {
        const query = this.value;
        clearTimeout(timers.debounce);
        const list = document.getElementById("suggestionsList");
        list.innerHTML = ""; list.style.display = "none";
        if (query.length < 2) return;
        
        timers.debounce = setTimeout(() => {
            fetch(`${CONFIG.geoApi}?name=${query}&count=5&language=tr&format=json`)
                .then(res => res.json())
                .then(data => {
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

export function enableSearchMode(e) {
    if(e) e.stopPropagation();
    document.getElementById("weatherWidget").classList.add("search-mode");
    document.getElementById("cityInput").focus();
}

export function disableSearchMode(e) {
    if(e) e.stopPropagation();
    document.getElementById("weatherWidget").classList.remove("search-mode");
    document.getElementById("cityInput").value = "";
}