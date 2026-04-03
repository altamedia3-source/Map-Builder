import React, { useState, useEffect, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { useParams, useSearchParams } from 'react-router';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MapContainer, ImageOverlay, Marker, Popup, Polyline, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Search, Layers, Crosshair, Coffee, Bed, Waves, Info, Building, Utensils, FerrisWheel, PawPrint, ShoppingBag, Car, Camera, HeartPulse, Ticket, TreePine, Gamepad2, Download, CheckCircle2, DoorOpen, Shield, Moon, LogOut, BatteryCharging, Droplets, Users, Waypoints } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

// Pathfinding helper
interface Point { x: number; y: number; }
interface Node extends Point { id: string; }

const findShortestPath = (start: Point, end: Point, paths: any[]) => {
  if (paths.length === 0) return [start, end];

  // 1. Create nodes from all path points
  const nodes: Node[] = [];
  const edges: { from: string, to: string, dist: number }[] = [];

  paths.forEach((path, pathIdx) => {
    path.points.forEach((p: Point, pointIdx: number) => {
      const id = `p${pathIdx}-${pointIdx}`;
      nodes.push({ ...p, id });
      
      if (pointIdx > 0) {
        const prevId = `p${pathIdx}-${pointIdx - 1}`;
        const dist = Math.sqrt(Math.pow(p.x - path.points[pointIdx-1].x, 2) + Math.pow(p.y - path.points[pointIdx-1].y, 2));
        edges.push({ from: prevId, to: id, dist });
        edges.push({ from: id, to: prevId, dist });
      }
    });
  });

  // 2. Connect close nodes from different paths
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.sqrt(Math.pow(nodes[i].x - nodes[j].x, 2) + Math.pow(nodes[i].y - nodes[j].y, 2));
      if (dist < 15) { // Connection threshold
        edges.push({ from: nodes[i].id, to: nodes[j].id, dist });
        edges.push({ from: nodes[j].id, to: nodes[i].id, dist });
      }
    }
  }

  // 3. Find nearest nodes to start and end
  let startNodeId = '';
  let endNodeId = '';
  let minDistStart = Infinity;
  let minDistEnd = Infinity;

  nodes.forEach(node => {
    const dStart = Math.sqrt(Math.pow(node.x - start.x, 2) + Math.pow(node.y - start.y, 2));
    const dEnd = Math.sqrt(Math.pow(node.x - end.x, 2) + Math.pow(node.y - end.y, 2));
    if (dStart < minDistStart) { minDistStart = dStart; startNodeId = node.id; }
    if (dEnd < minDistEnd) { minDistEnd = dEnd; endNodeId = node.id; }
  });

  if (!startNodeId || !endNodeId) return [start, end];

  // 4. Dijkstra's Algorithm
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const queue = new Set<string>();

  nodes.forEach(node => {
    distances[node.id] = Infinity;
    previous[node.id] = null;
    queue.add(node.id);
  });

  distances[startNodeId] = 0;

  while (queue.size > 0) {
    let uId = '';
    let minD = Infinity;
    queue.forEach(id => {
      if (distances[id] < minD) { minD = distances[id]; uId = id; }
    });

    if (!uId || distances[uId] === Infinity) break;
    if (uId === endNodeId) break;

    queue.delete(uId);

    edges.filter(e => e.from === uId).forEach(edge => {
      const alt = distances[uId] + edge.dist;
      if (alt < distances[edge.to]) {
        distances[edge.to] = alt;
        previous[edge.to] = uId;
      }
    });
  }

  // 5. Reconstruct path
  const result: Point[] = [];
  let curr: string | null = endNodeId;
  
  if (previous[endNodeId] || endNodeId === startNodeId) {
    while (curr) {
      const node = nodes.find(n => n.id === curr);
      if (node) result.unshift({ x: node.x, y: node.y });
      curr = previous[curr];
    }
    result.unshift(start);
    result.push(end);
    return result;
  }

  return [start, end];
};

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="w-4 h-4" />,
  food: <Utensils className="w-4 h-4" />,
  cafe: <Coffee className="w-4 h-4" />,
  room: <Bed className="w-4 h-4" />,
  pool: <Waves className="w-4 h-4" />,
  public: <Building className="w-4 h-4" />,
  ride: <FerrisWheel className="w-4 h-4" />,
  animal: <PawPrint className="w-4 h-4" />,
  shop: <ShoppingBag className="w-4 h-4" />,
  parking: <Car className="w-4 h-4" />,
  photo: <Camera className="w-4 h-4" />,
  medical: <HeartPulse className="w-4 h-4" />,
  ticket: <Ticket className="w-4 h-4" />,
  nature: <TreePine className="w-4 h-4" />,
  game: <Gamepad2 className="w-4 h-4" />,
  entrance: <DoorOpen className="w-4 h-4" />,
  security: <Shield className="w-4 h-4" />,
  prayer: <Moon className="w-4 h-4" />,
  emergency: <LogOut className="w-4 h-4" />,
  ecar: <BatteryCharging className="w-4 h-4" />,
  toilet: <Droplets className="w-4 h-4" />,
  assembly: <Users className="w-4 h-4" />
};

const CATEGORY_COLORS: Record<string, string> = {
  info: 'bg-slate-500',
  food: 'bg-orange-500',
  cafe: 'bg-amber-600',
  room: 'bg-indigo-500',
  pool: 'bg-cyan-500',
  public: 'bg-emerald-500',
  ride: 'bg-purple-500',
  animal: 'bg-yellow-600',
  shop: 'bg-pink-500',
  parking: 'bg-slate-700',
  photo: 'bg-teal-500',
  medical: 'bg-red-500',
  ticket: 'bg-blue-600',
  nature: 'bg-green-600',
  game: 'bg-violet-500',
  entrance: 'bg-emerald-600',
  security: 'bg-blue-700',
  prayer: 'bg-emerald-800',
  emergency: 'bg-red-600',
  ecar: 'bg-green-500',
  toilet: 'bg-cyan-600',
  assembly: 'bg-green-700'
};

// Helper to get icon node for a marker
const getMarkerIcon = (category: string, iconName?: string) => {
  if (iconName && (LucideIcons as any)[iconName]) {
    const IconComponent = (LucideIcons as any)[iconName];
    return <IconComponent className="w-3 h-3" />;
  }
  return CATEGORY_ICONS[category] || CATEGORY_ICONS['info'];
};

// Custom HTML Icon for Map
const createCustomIcon = (category: string, markerNumber?: string, iconName?: string) => {
  const colorClass = CATEGORY_COLORS[category] || 'bg-indigo-600';
  let iconNode = CATEGORY_ICONS[category] || CATEGORY_ICONS['info'];
  
  if (iconName && (LucideIcons as any)[iconName]) {
    const IconComponent = (LucideIcons as any)[iconName];
    iconNode = <IconComponent className="w-4 h-4" />;
  }
  
  const iconHtml = renderToString(iconNode);
  
  if (markerNumber) {
    return L.divIcon({
      className: 'custom-marker bg-transparent border-none',
      html: `<div class="flex flex-col items-center transform transition-transform hover:scale-110 drop-shadow-md">
              <div class="px-2 py-1 min-w-[2.5rem] rounded-xl ${colorClass} text-white flex flex-col items-center justify-center border-2 border-white z-10">
                ${iconHtml}
                <span class="text-xs font-bold mt-0.5">${markerNumber}</span>
              </div>
              <div class="w-3 h-3 ${colorClass} rotate-45 -mt-2 border-r-2 border-b-2 border-white"></div>
             </div>`,
      iconSize: [40, 50],
      iconAnchor: [20, 50],
      popupAnchor: [0, -50],
    });
  }

  return L.divIcon({
    className: 'custom-marker bg-transparent border-none',
    html: `<div class="flex flex-col items-center transform transition-transform hover:scale-110 drop-shadow-md">
            <div class="w-8 h-8 rounded-full ${colorClass} text-white flex items-center justify-center border-2 border-white z-10">
              ${iconHtml}
            </div>
            <div class="w-3 h-3 ${colorClass} rotate-45 -mt-2 border-r-2 border-b-2 border-white"></div>
           </div>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42],
  });
};

export default function PublicMap() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const mapId = id || searchParams.get('id');
  
  const [mapData, setMapData] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [paths, setPaths] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{x: number, y: number} | null>(null);
  const [routingTo, setRoutingTo] = useState<any | null>(null);
  const [route, setRoute] = useState<{x: number, y: number}[]>([]);
  
  // PWA & UX States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    // PWA Install Prompt Logic
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    });

    window.addEventListener('appinstalled', () => {
      setShowInstallBtn(false);
      showToast("App successfully installed!");
    });
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBtn(false);
      }
      setDeferredPrompt(null);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    if (!mapId) return;

    const fetchData = async () => {
      try {
        const docRef = doc(db, 'maps', mapId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMapData({ id: docSnap.id, ...docSnap.data() });
          showToast("Map berhasil dimuat");
        } else {
          alert("Map not found");
        }

        const q = query(collection(db, 'markers'), where('mapId', '==', mapId));
        const querySnapshot = await getDocs(q);
        const markersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMarkers(markersData);

        const qPaths = query(collection(db, 'paths'), where('mapId', '==', mapId));
        const pathsSnapshot = await getDocs(qPaths);
        const pathsData = pathsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPaths(pathsData);
      } catch (error) {
        console.error("Error fetching map data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [mapId]);

  useEffect(() => {
    if (userLocation && routingTo) {
      const calculatedRoute = findShortestPath(userLocation, routingTo, paths);
      setRoute(calculatedRoute);
    } else {
      setRoute([]);
    }
  }, [userLocation, routingTo, paths]);

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
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium animate-pulse">Loading map...</p>
      </div>
    );
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
    <div className="h-[100dvh] flex flex-col bg-slate-50 overflow-hidden relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Install PWA Button */}
      {showInstallBtn && (
        <button 
          onClick={handleInstallClick}
          className="absolute top-4 right-4 z-[2000] bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium transition-transform active:scale-95"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Install App</span>
        </button>
      )}

      {/* Floating Search & Filter UI (Desktop) / Top Bar (Mobile) */}
      <div className="absolute top-4 left-4 right-4 sm:right-auto z-[1000] sm:w-80 space-y-2 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden pointer-events-auto transition-all duration-300">
          <div className="p-3 border-b border-slate-100 flex items-center gap-2">
            <Search className="w-5 h-5 text-slate-400" />
            <input 
              type="text"
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full outline-none text-sm sm:text-base"
            />
          </div>
          
          {/* Categories (Hidden on mobile unless menu is open, visible on desktop) */}
          <div className={`p-2 flex gap-2 overflow-x-auto no-scrollbar ${showMobileMenu ? 'block' : 'hidden sm:flex'}`}>
            <button 
              onClick={() => setActiveCategory(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === null ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap capitalize transition-colors flex items-center gap-2 ${
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
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-h-[40vh] overflow-y-auto pointer-events-auto">
            {filteredMarkers.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 text-center">No locations found</div>
            ) : (
              filteredMarkers.map(marker => (
                <button 
                  key={marker.id}
                  onClick={() => {
                    mapRef.current?.flyTo([marker.y, marker.x], 2, { duration: 1.5 });
                    setSearchQuery('');
                    setShowMobileMenu(false);
                  }}
                  className="w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50 flex items-center gap-4 transition-colors active:bg-slate-100"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 ${CATEGORY_COLORS[marker.category] || 'bg-indigo-500'}`}>
                    {CATEGORY_ICONS[marker.category]}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{marker.name}</div>
                    <div className="text-sm text-slate-500 capitalize">{marker.category}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Floating Action Buttons (FAB) */}
      <div className="absolute bottom-24 sm:bottom-6 right-4 sm:right-6 z-[1000] flex flex-col gap-3">
        <button 
          onClick={handleLocateMe}
          className="w-14 h-14 bg-white rounded-full shadow-xl border border-slate-200 flex items-center justify-center text-indigo-600 hover:bg-slate-50 transition-transform active:scale-90"
          title="Locate Me"
        >
          <Crosshair className="w-6 h-6" />
        </button>
      </div>

      {/* Navigation Overlay */}
      {userLocation && routingTo && (
        <div className="absolute bottom-20 sm:bottom-6 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-96 z-[1000] animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white rounded-2xl shadow-2xl border border-indigo-100 overflow-hidden">
            <div className="bg-indigo-600 px-4 py-2 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider">Navigation Active</span>
              </div>
              <button 
                onClick={() => setRoutingTo(null)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <LogOut className="w-4 h-4 rotate-180" />
              </button>
            </div>
            <div className="p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 ${CATEGORY_COLORS[routingTo.category] || 'bg-indigo-500'}`}>
                {CATEGORY_ICONS[routingTo.category]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 font-medium uppercase mb-0.5">Navigating to</div>
                <div className="font-bold text-slate-900 truncate">{routingTo.name}</div>
                <div className="text-xs text-indigo-600 font-semibold mt-1 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping"></div>
                  {Math.round(Math.sqrt(Math.pow(userLocation.x - routingTo.x, 2) + Math.pow(userLocation.y - routingTo.y, 2)))} units away
                </div>
              </div>
              <button 
                onClick={() => {
                  mapRef.current?.flyTo([routingTo.y, routingTo.x], 2, { duration: 1.5 });
                }}
                className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-colors"
                title="Focus Target"
              >
                <MapPin className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation (Mobile Only) */}
      <div className="sm:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-[1000] shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex justify-around items-center h-16">
          <button 
            onClick={() => {
              setShowMobileMenu(false);
              mapRef.current?.flyTo([mapData.imageHeight / 2, mapData.imageWidth / 2], -1, { duration: 1 });
            }}
            className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-indigo-600 active:bg-slate-50"
          >
            <MapPin className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium">Map</span>
          </button>
          <button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className={`flex flex-col items-center justify-center w-full h-full ${showMobileMenu ? 'text-indigo-600' : 'text-slate-500'} hover:text-indigo-600 active:bg-slate-50`}
          >
            <Layers className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium">Categories</span>
          </button>
        </div>
      </div>

      {/* Map Area */}
      <MapContainer 
        crs={L.CRS.Simple} 
        bounds={bounds} 
        maxZoom={3}
        minZoom={-3}
        zoomSnap={0.5}
        wheelPxPerZoomLevel={120}
        zoomControl={false}
        className="w-full h-full bg-slate-100 z-0"
        ref={mapRef}
      >
        <ZoomControl position="bottomright" />
        <ImageOverlay
          url={mapData.imageUrl}
          bounds={bounds}
        />
        
        {filteredMarkers.map(marker => (
          <Marker 
            key={marker.id} 
            position={[marker.y, marker.x]}
            icon={createCustomIcon(marker.category, marker.markerNumber, marker.icon)}
          >
            <Popup className="custom-popup" closeButton={false}>
              <div className="w-[280px] sm:w-80 -m-3 overflow-hidden rounded-2xl shadow-xl bg-white">
                {marker.imageUrl && (
                  <div className="h-40 w-full bg-slate-100 relative">
                    <img src={marker.imageUrl} alt={marker.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${CATEGORY_COLORS[marker.category]?.replace('bg-', 'bg-opacity-10 text- border-') || 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                      {getMarkerIcon(marker.category, marker.icon)}
                      {marker.category}
                    </span>
                  </div>
                  <h3 className="font-bold text-xl leading-tight mb-2 text-slate-900">{marker.name}</h3>
                  {marker.description && (
                    <p className="text-sm mb-5 line-clamp-3 text-slate-600">{marker.description}</p>
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
                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    <Navigation className="w-4 h-4" />
                    Navigate Here
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Render Paths (Subtle background) */}
        {paths.map(path => (
          <Polyline
            key={path.id}
            positions={path.points.map((p: any) => [p.y, p.x])}
            color="#6366f1"
            weight={3}
            opacity={0.15}
            lineCap="round"
            lineJoin="round"
          />
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

        {route.length > 0 && (
          <Polyline 
            positions={route.map(p => [p.y, p.x])}
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
