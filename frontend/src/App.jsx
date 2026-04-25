import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useMapLogic } from "./useMapLogic";
import { useNotifications } from "./useNotifications";
import { fetchPlaces, hasGeometryForCheck, isClosureActive, formatClosureTime } from "./mapUtils";

export default function App() {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);

  useEffect(() => {
    if (window.L && !mapRef.current) {
      const mapInstance = window.L.map("map").setView([9.03, 38.74], 13);
      mapRef.current = mapInstance;
      setMap(mapInstance);

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        referrerPolicy: "strict-origin-when-cross-origin"
      }).addTo(mapInstance);

      if (window.location.protocol === 'file:') {
        alert('Open this app through http://localhost (not file://) to load OpenStreetMap tiles.');
      }
    }
  }, []);

  const {
    status,
    timeEstimate,
    routeAdvice,
    closureLoadState,
    roadClosures,
    handleMapClick,
    useCurrentLocation,
    resetRoute,
    setStartPoint,
    setEndPoint,
    drawRouteLine,
  } = useMapLogic(map);
  
  // Notifications
  const {
    isSupported: notificationsSupported,
    isGranted,
    isDenied,
    requestPermission,
    sendTestNotification,
    checkClosuresNow
  } = useNotifications();
  
  // Helper to get closure status styling
  const getClosureStatusStyle = (c) => {
    const result = isClosureActive(c);
    if (result.status === 'active' || result.status === 'always') {
      return { color: '#dc2626', label: 'ACTIVE' };
    }
    if (result.status === 'scheduled') {
      return { color: '#9ca3af', label: 'SCHEDULED' };
    }
    return { color: '#6b7280', label: 'EXPIRED' };
  };

  useEffect(() => {
    if (map) {
      map.on('click', handleMapClick);
    }
    return () => {
      if (map) {
        map.off('click', handleMapClick);
      }
    };
  }, [map, handleMapClick]);

  const [startSuggestions, setStartSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [startQuery, setStartQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (startQuery.length < 3) {
        setStartSuggestions([]);
        return;
      }
      try {
        const places = await fetchPlaces(startQuery);
        setStartSuggestions(places);
      } catch (error) {
        console.error(error);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [startQuery]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (destinationQuery.length < 3) {
        setDestinationSuggestions([]);
        return;
      }
      try {
        const places = await fetchPlaces(destinationQuery);
        setDestinationSuggestions(places);
      } catch (error) {
        console.error(error);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [destinationQuery]);

  const handleSuggestionClick = (place, type) => {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    const label = place.display_name;
    
    if (type === 'start') {
      setStartSuggestions([]);
      setStartQuery(label);
      setStartPoint(lat, lon);
    } else {
      setDestinationSuggestions([]);
      setDestinationQuery(label);
      setEndPoint(lat, lon);
    }
    
    if (map) map.setView([lat, lon], 14);
    drawRouteLine();
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.input-group')) {
        setStartSuggestions([]);
        setDestinationSuggestions([]);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const resetBtn = document.getElementById('resetBtn');
    const useLocationBtn = document.getElementById('useLocationBtn');
    
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        resetRoute();
        setStartQuery('');
        setDestinationQuery('');
      });
    }
    if (useLocationBtn) {
      useLocationBtn.addEventListener('click', useCurrentLocation);
    }

    return () => {
      if (resetBtn) resetBtn.removeEventListener('click', resetRoute);
      if (useLocationBtn) useLocationBtn.removeEventListener('click', useCurrentLocation);
    };
  }, [resetRoute, useCurrentLocation]);

  return (
    <main className="app-shell">
      <section className="top-panel">
        <h1>Smart Route Recommender</h1>

        <p className="subtitle">
          Search start and destination like a maps app, or use your current location.
        </p>

        <div className="search-grid">
          <div className="input-group">
            <label htmlFor="startInput">Start</label>
            <input
              id="startInput"
              type="text"
              placeholder="Search starting point"
              autoComplete="off"
              value={startQuery}
              onChange={(e) => setStartQuery(e.target.value)}
            />
            <ul id="startSuggestions" className="suggestions">
              {startSuggestions.map((place) => (
                <li key={place.place_id} className="suggestion-item">
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(place, 'start')}
                  >
                    {place.display_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="input-group">
            <label htmlFor="destinationInput">Destination</label>
            <input
              id="destinationInput"
              type="text"
              placeholder="Search destination"
              autoComplete="off"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
            />
            <ul id="destinationSuggestions" className="suggestions">
              {destinationSuggestions.map((place) => (
                <li key={place.place_id} className="suggestion-item">
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(place, 'destination')}
                  >
                    {place.display_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="controls-row">
          <button id="useLocationBtn" type="button">
            Use Current Location
          </button>
          <button id="resetBtn" type="button">
            Reset Route
          </button>
        </div>

        <p id="status">{status}</p>

        <p id="timeEstimate">{timeEstimate}</p>

        <div
          id="routeAdvice"
          className={`advice-box ${routeAdvice.isOk ? 'advice-ok' : ''}`}
          role="status"
          aria-live="polite"
          hidden={routeAdvice.hidden}
          dangerouslySetInnerHTML={{ __html: routeAdvice.html }}
        ></div>

        {/* Notification Settings Panel */}
        {notificationsSupported && (
          <section className="notification-panel" style={{ 
            padding: '12px', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '8px',
            marginBottom: '12px'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>
              🔔 Closure Alerts
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#6b7280' }}>
              Get notified before road closures start (up to 4 hours ahead)
            </p>
            
            {!isGranted && !isDenied && (
              <button 
                onClick={requestPermission}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Enable Notifications
              </button>
            )}
            
            {isGranted && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => sendTestNotification('🚧 Test Alert', 'Road closure notifications are enabled and working!')}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Test Notification
                </button>
                <button 
                  onClick={checkClosuresNow}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Check Now
                </button>
                <span style={{ fontSize: '0.8rem', color: '#10b981', alignSelf: 'center' }}>
                  ✓ Notifications enabled
                </span>
              </div>
            )}
            
            {isDenied && (
              <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0 }}>
                Notifications blocked. Please enable them in your browser settings to receive closure alerts.
              </p>
            )}
          </section>
        )}

        <section
          className="closure-panel"
          aria-labelledby="closureHeading"
        >
          <h2 id="closureHeading" className="closure-heading">
            Active Road Closures
          </h2>

          <p id="closureLoadState" className="closure-meta">
            {closureLoadState}
          </p>

          <ul id="closureList" className="closure-list">
            {roadClosures.map((c, i) => {
              const statusStyle = getClosureStatusStyle(c);
              const timeStr = formatClosureTime(c);
              return (
                <li key={i}>
                  <span className="closure-road">
                    {c.road}
                    {!hasGeometryForCheck(c) && (
                      <span className="closure-badge">no map zone</span>
                    )}
                    <span 
                      className="closure-status-badge" 
                      style={{ 
                        backgroundColor: statusStyle.color,
                        color: 'white',
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        marginLeft: '8px'
                      }}
                    >
                      {statusStyle.label}
                    </span>
                  </span>
                  <span className="closure-why">{c.reason}</span>
                  <span className="closure-time" style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                    {timeStr}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </section>

      <div id="map"></div>
    </main>
  );
}