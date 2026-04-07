import json
import httpx
from os import environ

def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    location = config.get("location", "Atlanta, US")
    units = config.get("units", "fahrenheit")
    
    try:
        # First, geocode the location
        geocode_response = httpx.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": location, "count": 1, "language": "en", "format": "json"},
            timeout=10.0
        )
        geocode_response.raise_for_status()
        geocode_data = geocode_response.json()
        
        if not geocode_data.get("results"):
            return {
                "status": "error",
                "data": {},
                "notifications": [],
                "error_message": f"Location '{location}' not found"
            }
        
        result = geocode_data["results"][0]
        lat = result["latitude"]
        lon = result["longitude"]
        city_name = result["name"]
        country = result.get("country", "")
        
        # Get current weather
        weather_response = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                "temperature_unit": units,
                "wind_speed_unit": "mph" if units == "fahrenheit" else "kmh",
                "timezone": "auto"
            },
            timeout=10.0
        )
        weather_response.raise_for_status()
        weather_data = weather_response.json()
        
        current = weather_data["current"]
        
        # Map weather codes to descriptions
        weather_code = current["weather_code"]
        weather_descriptions = {
            0: "Clear sky",
            1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Fog", 48: "Depositing rime fog",
            51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
            56: "Light freezing drizzle", 57: "Dense freezing drizzle",
            61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
            66: "Light freezing rain", 67: "Heavy freezing rain",
            71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
            77: "Snow grains",
            80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
            85: "Slight snow showers", 86: "Heavy snow showers",
            95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
        }
        
        description = weather_descriptions.get(weather_code, "Unknown")
        temp_unit = "°F" if units == "fahrenheit" else "°C"
        wind_unit = "mph" if units == "fahrenheit" else "km/h"
        
        return {
            "status": "ok",
            "data": {
                "temperature": round(current["temperature_2m"], 1),
                "temp_unit": temp_unit,
                "description": description,
                "humidity": current["relative_humidity_2m"],
                "wind_speed": round(current["wind_speed_10m"], 1),
                "wind_unit": wind_unit,
                "city": city_name,
                "country": country,
                "weather_code": weather_code
            },
            "notifications": []
        }
        
    except Exception as e:
        return {
            "status": "error",
            "data": {},
            "notifications": [],
            "error_message": f"Failed to fetch weather data: {str(e)}"
        }

print(json.dumps(fetch()))