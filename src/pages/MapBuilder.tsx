import React, { useState, useEffect, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { useParams, useNavigate } from 'react-router';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MapContainer, ImageOverlay, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Plus, Save, Trash2, X, MapPin, Coffee, Bed, Waves, Info, Building, Undo2, Redo2, Utensils, FerrisWheel, PawPrint, ShoppingBag, Car, Camera, HeartPulse, Ticket, TreePine, Gamepad2, DoorOpen, Shield, Moon, LogOut, BatteryCharging, Droplets, Users } from 'lucide-react';

type ActionType = 'ADD' | 'EDIT' | 'DELETE';

interface Action {
  type: ActionType;
  markerId: string;
  newData?: any;
  oldData?: any;
}

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

const createCustomIcon = (category: string, markerNumber?: string) => {
  const colorClass = CATEGORY_COLORS[category] || 'bg-indigo-600';
  const iconNode = CATEGORY_ICONS[category] || CATEGORY_ICONS['info'];
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
    imageUrl: '',
    markerNumber: ''
  });

  // Undo/Redo state
  const [history, setHistory] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, redoStack]);

  const handleUndo = async () => {
    if (history.length === 0) return;
    const action = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    
    try {
      if (action.type === 'ADD') {
        await deleteDoc(doc(db, 'markers', action.markerId));
      } else if (action.type === 'EDIT') {
        await updateDoc(doc(db, 'markers', action.markerId), action.oldData);
      } else if (action.type === 'DELETE') {
        await setDoc(doc(db, 'markers', action.markerId), action.oldData);
      }
      
      setHistory(newHistory);
      setRedoStack(prev => [...prev, action]);
      
      if (editingMarker?.id === action.markerId) {
        setEditingMarker(null);
      }
    } catch (error) {
      console.error("Undo failed", error);
      alert("Undo failed. Please check your connection.");
    }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    
    try {
      if (action.type === 'ADD') {
        await setDoc(doc(db, 'markers', action.markerId), action.newData);
      } else if (action.type === 'EDIT') {
        await updateDoc(doc(db, 'markers', action.markerId), action.newData);
      } else if (action.type === 'DELETE') {
        await deleteDoc(doc(db, 'markers', action.markerId));
      }
      
      setRedoStack(newRedoStack);
      setHistory(prev => [...prev, action]);
      
      if (editingMarker?.id === action.markerId) {
        setEditingMarker(null);
      }
    } catch (error) {
      console.error("Redo failed", error);
      alert("Redo failed. Please check your connection.");
    }
  };

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (isAddingMarker) {
      setSelectedLocation({ x: e.latlng.lng, y: e.latlng.lat });
      setFormData({ name: '', description: '', category: 'info', imageUrl: '', markerNumber: '' });
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
        const markerToEdit = markers.find(m => m.id === editingMarker.id);
        const { id: _, ...oldData } = markerToEdit;
        const newData = { ...formData };
        await updateDoc(doc(db, 'markers', editingMarker.id), newData);
        
        setHistory(prev => [...prev, {
          type: 'EDIT',
          markerId: editingMarker.id,
          oldData: oldData,
          newData: newData
        }]);
        setRedoStack([]);
      } else if (selectedLocation) {
        const newDocRef = doc(collection(db, 'markers'));
        const markerData = {
          mapId: id,
          x: selectedLocation.x,
          y: selectedLocation.y,
          ...formData
        };
        await setDoc(newDocRef, markerData);
        
        setHistory(prev => [...prev, {
          type: 'ADD',
          markerId: newDocRef.id,
          newData: markerData
        }]);
        setRedoStack([]);
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
        const markerToDelete = markers.find(m => m.id === markerId);
        if (!markerToDelete) return;
        
        const { id: _, ...oldData } = markerToDelete;
        await deleteDoc(doc(db, 'markers', markerId));
        
        setHistory(prev => [...prev, {
          type: 'DELETE',
          markerId: markerId,
          oldData: oldData
        }]);
        setRedoStack([]);
        
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
          <div className="flex items-center gap-1 mr-2 border-r border-slate-200 pr-3">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className={`p-2 rounded-lg transition-colors ${history.length === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className={`p-2 rounded-lg transition-colors ${redoStack.length === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-5 h-5" />
            </button>
          </div>
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
                icon={createCustomIcon(marker.category || 'info', marker.markerNumber)}
                eventHandlers={{
                  click: () => {
                    setEditingMarker(marker);
                    setFormData({
                      name: marker.name,
                      description: marker.description || '',
                      category: marker.category || 'info',
                      imageUrl: marker.imageUrl || '',
                      markerNumber: marker.markerNumber || ''
                    });
                    setSelectedLocation(null);
                  }
                }}
              >
                <Popup className="custom-popup" closeButton={false}>
                  {(() => {
                    const isEditing = editingMarker?.id === marker.id;
                    const currentImageUrl = isEditing ? formData.imageUrl : marker.imageUrl;
                    const currentName = isEditing ? formData.name : marker.name;
                    const currentCategory = isEditing ? formData.category : marker.category;
                    
                    return (
                      <div className="w-48 overflow-hidden rounded-xl shadow-lg bg-white">
                        {currentImageUrl ? (
                          <div className="h-32 w-full bg-slate-100 relative">
                            <img src={currentImageUrl} alt={currentName} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-32 w-full bg-slate-100 flex flex-col items-center justify-center text-slate-400">
                            <Camera className="w-8 h-8 mb-1 opacity-50" />
                            <span className="text-[10px] font-medium uppercase tracking-wider">No Image</span>
                          </div>
                        )}
                        <div className="p-3">
                          <div className="font-bold text-sm text-slate-900 truncate">{currentName || 'Unnamed Marker'}</div>
                          <div className="text-xs text-slate-500 capitalize">{currentCategory}</div>
                        </div>
                      </div>
                    );
                  })()}
                </Popup>
              </Marker>
            ))}

            {selectedLocation && (
              <Marker 
                position={[selectedLocation.y, selectedLocation.x]}
                icon={createCustomIcon(formData.category, formData.markerNumber)}
              >
                <Popup className="custom-popup" closeButton={false}>
                  <div className="w-48 overflow-hidden rounded-xl shadow-lg bg-white">
                    {formData.imageUrl ? (
                      <div className="h-32 w-full bg-slate-100 relative">
                        <img src={formData.imageUrl} alt={formData.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-32 w-full bg-slate-100 flex flex-col items-center justify-center text-slate-400">
                        <Camera className="w-8 h-8 mb-1 opacity-50" />
                        <span className="text-[10px] font-medium uppercase tracking-wider">No Image</span>
                      </div>
                    )}
                    <div className="p-3">
                      <div className="font-bold text-sm text-slate-900 truncate">{formData.name || 'New Marker'}</div>
                      <div className="text-xs text-slate-500 capitalize">{formData.category}</div>
                    </div>
                  </div>
                </Popup>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Marker Number (Optional)</label>
                  <input 
                    type="text" 
                    value={formData.markerNumber}
                    onChange={(e) => setFormData({...formData, markerNumber: e.target.value})}
                    placeholder="e.g. 1, 2, 3, or A, B"
                    maxLength={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
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
                    <option value="entrance">Pintu Masuk / Entrance</option>
                    <option value="ticket">Loket Tiket</option>
                    <option value="security">Pos Keamanan</option>
                    <option value="prayer">Mushola</option>
                    <option value="toilet">Toilet</option>
                    <option value="emergency">Pintu Darurat</option>
                    <option value="assembly">Titik Kumpul</option>
                    <option value="ecar">Stasiun E-Car</option>
                    <option value="ride">Attraction / Ride</option>
                    <option value="animal">Zoo / Fauna</option>
                    <option value="nature">Park / Garden</option>
                    <option value="pool">Water Park / Pool</option>
                    <option value="game">Arcade / Games</option>
                    <option value="photo">Photo Spot</option>
                    <option value="food">Restaurant / Dining</option>
                    <option value="cafe">Cafe / Snack</option>
                    <option value="shop">Shopping / Souvenir</option>
                    <option value="room">Accommodation / Hotel</option>
                    <option value="public">Public Facility</option>
                    <option value="medical">Clinic / First Aid</option>
                    <option value="parking">Parking Area</option>
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
