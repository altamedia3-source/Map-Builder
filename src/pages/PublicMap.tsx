import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MapContainer, ImageOverlay, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Search, Layers, Crosshair, Coffee, Bed, Waves, Info, Building } from 'lucide-react';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CATEGORY_COLORS: Record<string, string> = {
  food: 'bg-orange-500',
  room: 'bg-indigo-500',
  pool: 'bg-cyan-500',
  public: 'bg-emerald-500',
  info: 'bg-slate-500'
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  food: <Coffee className="w-4 h-4" />,
  room: <Bed className="w-4 h-4" />,
  pool: <Waves className="w-4 h-4" />,
  public: <Building className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />
};

// Custom HTML Icon for Map
const createCustomIcon = (category: string) => {
  const colorClass = CATEGORY_COLORS[category] || 'bg-indigo-600';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="w-8 h-8 rounded-full ${colorClass} text-white flex items-center justify-center shadow-lg border-2 border-white transform transition-transform hover:scale-110">
            <div class="w-4 h-4"></div>
           </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

export default function PublicMap() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const mapId = id || searchParams.get('id');
  
  const [mapData, setMapData] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{x: number, y: number} | null>(null);
  const [routingTo, setRoutingTo] = useState<any | null>(null);
  
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapId) return;

    const fetchData = async () => {
      try {
        const docRef = doc(db, 'maps', mapId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMapData({ id: docSnap.id, ...docSnap.data() });
        } else {
          alert("Map not found");
        }

        const q = query(collection(db, 'markers'), where('mapId', '==', mapId));
        const querySnapshot = await getDocs(q);
        const markersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMarkers(markersData);
      } catch (error) {
        console.error("Error fetching map:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [mapId]);

  const handleLocateMe = () => {
    // In a real CRS.Simple map, GPS coordinates don't map directly to image pixels
    // without a complex transformation matrix. For this demo, we'll simulate a location
    // or just show an alert explaining this limitation for custom image maps.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Simulated mapping for demo purposes (putting user in center)
          if (mapData) {
            const simulatedX = mapData.imageWidth / 2;
            const simulatedY = mapData.imageHeight / 2;
            setUserLocation({ x: simulatedX, y: simulatedY });
            mapRef.current?.flyTo([simulatedY, simulatedX], 1);
          }
        },
        (error) => {
          alert("Unable to retrieve your location.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading map...</div>;
  }

  if (!mapData) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Map not found.</div>;
  }

  const bounds: L.LatLngBoundsExpression = [[0, 0], [mapData.imageHeight, mapData.imageWidth]];

  const filteredMarkers = markers.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = activeCategory ? m.category === activeCategory : true;
    return matchesSearch && matchesCategory;
  });

  const categories: string[] = Array.from(new Set(markers.map(m => String(m.category || 'info'))));

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden relative">
      {/* Floating Search & Filter UI */}
      <div className="absolute top-4 left-4 z-[1000] w-80 space-y-2">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center gap-2">
            <Search className="w-5 h-5 text-slate-400" />
            <input 
              type="text"
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full outline-none text-sm"
            />
          </div>
          <div className="p-2 flex gap-2 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === null ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap capitalize transition-colors flex items-center gap-1 ${
                  activeCategory === cat ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {CATEGORY_ICONS[cat]}
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Search Results Dropdown */}
        {searchQuery && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto">
            {filteredMarkers.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 text-center">No locations found</div>
            ) : (
              filteredMarkers.map(marker => (
                <button 
                  key={marker.id}
                  onClick={() => {
                    mapRef.current?.flyTo([marker.y, marker.x], 1);
                    setSearchQuery('');
                  }}
                  className="w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${CATEGORY_COLORS[marker.category] || 'bg-indigo-500'}`}>
                    {CATEGORY_ICONS[marker.category]}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-slate-900">{marker.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{marker.category}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Floating Action Buttons */}
      <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-3">
        <button 
          onClick={handleLocateMe}
          className="w-12 h-12 bg-white rounded-full shadow-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
          title="Locate Me"
        >
          <Crosshair className="w-6 h-6" />
        </button>
      </div>

      {/* Map Area */}
      <MapContainer 
        crs={L.CRS.Simple} 
        bounds={bounds} 
        maxZoom={2}
        minZoom={-2}
        className="w-full h-full bg-slate-100 z-0"
        ref={mapRef}
      >
        <ImageOverlay
          url={mapData.imageUrl}
          bounds={bounds}
        />
        
        {filteredMarkers.map(marker => (
          <Marker 
            key={marker.id} 
            position={[marker.y, marker.x]}
            icon={createCustomIcon(marker.category)}
          >
            <Popup className="custom-popup">
              <div className="w-64 -m-3">
                {marker.imageUrl && (
                  <div className="h-32 w-full bg-slate-100 rounded-t-xl overflow-hidden">
                    <img src={marker.imageUrl} alt={marker.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className={`p-4 ${!marker.imageUrl ? 'rounded-t-xl' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold uppercase tracking-wider ${CATEGORY_COLORS[marker.category]?.replace('bg-', 'text-') || 'text-indigo-600'}`}>
                      {marker.category}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-slate-900 leading-tight mb-2">{marker.name}</h3>
                  {marker.description && (
                    <p className="text-sm text-slate-600 mb-4 line-clamp-3">{marker.description}</p>
                  )}
                  <button 
                    onClick={() => {
                      if (userLocation) {
                        setRoutingTo(marker);
                      } else {
                        handleLocateMe();
                        setTimeout(() => setRoutingTo(marker), 1000);
                      }
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Navigation className="w-4 h-4" />
                    Navigate Here
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {userLocation && (
          <Marker 
            position={[userLocation.y, userLocation.x]}
            icon={L.divIcon({
              className: 'user-location-marker',
              html: `<div class="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg animate-pulse"></div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })}
          >
            <Popup>You are here</Popup>
          </Marker>
        )}

        {userLocation && routingTo && (
          <Polyline 
            positions={[
              [userLocation.y, userLocation.x],
              [routingTo.y, routingTo.x]
            ]}
            color="#3b82f6"
            weight={4}
            dashArray="10, 10"
            className="animate-dash"
          />
        )}
      </MapContainer>
    </div>
  );
}
