import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MapContainer, ImageOverlay, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Plus, Save, Trash2, X, MapPin, Coffee, Bed, Waves, Info, Building } from 'lucide-react';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  food: <Coffee className="w-4 h-4" />,
  room: <Bed className="w-4 h-4" />,
  pool: <Waves className="w-4 h-4" />,
  public: <Building className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />
};

export default function MapBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mapData, setMapData] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Builder state
  const [isAddingMarker, setIsAddingMarker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{x: number, y: number} | null>(null);
  const [editingMarker, setEditingMarker] = useState<any>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'info',
    imageUrl: ''
  });

  useEffect(() => {
    if (!id) return;

    const fetchMap = async () => {
      try {
        const docRef = doc(db, 'maps', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMapData({ id: docSnap.id, ...docSnap.data() });
        } else {
          alert("Map not found");
          navigate('/dashboard');
        }
      } catch (error) {
        console.error("Error fetching map:", error);
      }
    };

    fetchMap();

    // Listen to markers
    const q = query(collection(db, 'markers'), where('mapId', '==', id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const markersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMarkers(markersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id, navigate]);

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (isAddingMarker) {
      setSelectedLocation({ x: e.latlng.lng, y: e.latlng.lat });
      setFormData({ name: '', description: '', category: 'info', imageUrl: '' });
      setEditingMarker(null);
      setIsAddingMarker(false);
    }
  };

  const MapEvents = () => {
    useMapEvents({
      click: handleMapClick,
    });
    return null;
  };

  const handleSaveMarker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || (!selectedLocation && !editingMarker)) return;

    try {
      if (editingMarker) {
        await updateDoc(doc(db, 'markers', editingMarker.id), {
          ...formData
        });
      } else if (selectedLocation) {
        await addDoc(collection(db, 'markers'), {
          mapId: id,
          x: selectedLocation.x,
          y: selectedLocation.y,
          ...formData
        });
      }
      setSelectedLocation(null);
      setEditingMarker(null);
    } catch (error) {
      console.error("Error saving marker:", error);
      alert("Failed to save marker");
    }
  };

  const handleDeleteMarker = async (markerId: string) => {
    if (window.confirm("Delete this marker?")) {
      try {
        await deleteDoc(doc(db, 'markers', markerId));
        if (editingMarker?.id === markerId) {
          setEditingMarker(null);
        }
      } catch (error) {
        console.error("Error deleting marker:", error);
      }
    }
  };

  if (loading || !mapData) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading map...</div>;
  }

  // Calculate bounds for CRS.Simple
  // We map the image dimensions to coordinates [0, 0] to [height, width]
  const bounds: L.LatLngBoundsExpression = [[0, 0], [mapData.imageHeight, mapData.imageWidth]];

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">{mapData.title}</h1>
            <p className="text-xs text-slate-500">Builder Mode</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsAddingMarker(!isAddingMarker)}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
              isAddingMarker 
                ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
            }`}
          >
            {isAddingMarker ? (
              <>Click on map to place</>
            ) : (
              <><Plus className="w-4 h-4" /> Add Marker</>
            )}
          </button>
          <a 
            href={`/map/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors"
          >
            Preview
          </a>
        </div>
      </header>

      <div className="flex-1 flex relative overflow-hidden">
        {/* Map Area */}
        <div className={`flex-1 relative ${isAddingMarker ? 'cursor-crosshair' : ''}`}>
          <MapContainer 
            crs={L.CRS.Simple} 
            bounds={bounds} 
            maxZoom={2}
            minZoom={-2}
            className="w-full h-full bg-slate-100"
            style={{ height: '100%', width: '100%' }}
          >
            <MapEvents />
            <ImageOverlay
              url={mapData.imageUrl}
              bounds={bounds}
            />
            
            {markers.map(marker => (
              <Marker 
                key={marker.id} 
                position={[marker.y, marker.x]}
                eventHandlers={{
                  click: () => {
                    setEditingMarker(marker);
                    setFormData({
                      name: marker.name,
                      description: marker.description || '',
                      category: marker.category || 'info',
                      imageUrl: marker.imageUrl || ''
                    });
                    setSelectedLocation(null);
                  }
                }}
              >
                <Popup>
                  <div className="font-semibold">{marker.name}</div>
                  <div className="text-xs text-slate-500">{marker.category}</div>
                </Popup>
              </Marker>
            ))}

            {selectedLocation && (
              <Marker position={[selectedLocation.y, selectedLocation.x]}>
                <Popup>New Marker Location</Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        {/* Sidebar Form */}
        {(selectedLocation || editingMarker) && (
          <div className="w-80 bg-white border-l border-slate-200 shadow-xl flex flex-col z-20 shrink-0">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="font-semibold text-slate-800">
                {editingMarker ? 'Edit Marker' : 'New Marker'}
              </h2>
              <button 
                onClick={() => {
                  setSelectedLocation(null);
                  setEditingMarker(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto">
              <form id="marker-form" onSubmit={handleSaveMarker} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  >
                    <option value="info">General Info</option>
                    <option value="food">Food & Dining</option>
                    <option value="room">Accommodation</option>
                    <option value="pool">Pool & Leisure</option>
                    <option value="public">Public Facility</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm h-24 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Image URL (Optional)</label>
                  <input 
                    type="url" 
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    placeholder="https://..."
                  />
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
              {editingMarker && (
                <button 
                  type="button"
                  onClick={() => handleDeleteMarker(editingMarker.id)}
                  className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-medium transition-colors flex items-center justify-center"
                  title="Delete Marker"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button 
                type="submit"
                form="marker-form"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Marker
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
