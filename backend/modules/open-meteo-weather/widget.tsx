import React from 'react';
import { Cloud, Sun, CloudRain, Snow, Zap, Eye, Wind, Droplets } from 'lucide-react';

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

function getWeatherIcon(weatherCode: number) {
  if (weatherCode === 0 || weatherCode === 1) return Sun;
  if (weatherCode === 2 || weatherCode === 3) return Cloud;
  if (weatherCode >= 45 && weatherCode <= 48) return Eye; // Fog
  if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) return CloudRain;
  if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) return Snow;
  if (weatherCode >= 95) return Zap; // Thunderstorm
  return Cloud;
}

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  if (loading) {
    return (
      <div className="h-full p-4 space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-surface-raised rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-surface-raised rounded w-3/4 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-surface-raised rounded w-full"></div>
            <div className="h-3 bg-surface-raised rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <div className="text-center">
          <Cloud className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <p className="text-text-muted">No weather data</p>
      </div>
    );
  }

  const WeatherIcon = getWeatherIcon(data.weather_code);
  const location = data.country ? `${data.city}, ${data.country}` : data.city;

  return (
    <div className="h-full p-4 space-y-3">
      {/* Location */}
      <div className="text-text-secondary text-sm font-medium truncate">
        {location}
      </div>
      
      {/* Temperature and Icon */}
      <div className="flex items-center space-x-3">
        <WeatherIcon className="h-10 w-10 text-accent-primary flex-shrink-0" />
        <div>
          <div className="text-3xl font-display font-bold text-text-primary">
            {data.temperature}{data.temp_unit}
          </div>
          <div className="text-text-secondary text-sm">
            {data.description}
          </div>
        </div>
      </div>
      
      {/* Additional Info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center space-x-2">
          <Droplets className="h-4 w-4 text-text-muted" />
          <span className="text-text-secondary">{data.humidity}%</span>
        </div>
        <div className="flex items-center space-x-2">
          <Wind className="h-4 w-4 text-text-muted" />
          <span className="text-text-secondary">{data.wind_speed} {data.wind_unit}</span>
        </div>
      </div>
    </div>
  );
}