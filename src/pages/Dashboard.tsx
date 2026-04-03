import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth, signOut } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Map, Plus, LogOut, MoreVertical, Edit2, Trash2, ExternalLink } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [maps, setMaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newMapTitle, setNewMapTitle] = useState('');
  const [newMapUrl, setNewMapUrl] = useState('');

  useEffect(() => {
    if (user) {
      fetchMaps();
    }
  }, [user]);

  const fetchMaps = async () => {
    try {
      const q = query(collection(db, 'maps'), where('userId', '==', user?.uid));
      const querySnapshot = await getDocs(q);
      const mapsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMaps(mapsData);
    } catch (error) {
      console.error("Error fetching maps:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMapTitle || !newMapUrl) return;

    try {
      const img = new Image();
      img.onload = async () => {
        try {
          const docRef = await addDoc(collection(db, 'maps'), {
            userId: user?.uid,
            title: newMapTitle,
            imageUrl: newMapUrl,
            imageWidth: img.width,
            imageHeight: img.height,
            createdAt: serverTimestamp()
          });
          setIsCreating(false);
          setNewMapTitle('');
          setNewMapUrl('');
          navigate(`/builder/${docRef.id}`);
        } catch (dbError: any) {
          console.error("Database error:", dbError);
          alert(`Failed to save to database.\n\nError: ${dbError.message || dbError.code}\n\nMake sure Firestore Database is created and Security Rules allow writing.`);
        }
      };
      img.onerror = () => {
        alert("Failed to load image. Please check the URL.");
      };
      img.src = newMapUrl;
    } catch (error) {
      console.error("Error creating map:", error);
      alert("Failed to create map.");
    }
  };

  const handleDeleteMap = async (mapId: string) => {
    if (window.confirm("Are you sure you want to delete this map?")) {
      try {
        await deleteDoc(doc(db, 'maps', mapId));
        setMaps(maps.filter(m => m.id !== mapId));
      } catch (error) {
        console.error("Error deleting map:", error);
      }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl">
          <Map className="w-6 h-6" />
          <span>Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600 hidden md:block">{user?.email}</span>
          <button 
            onClick={handleSignOut}
            className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Your Maps</h1>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Map
          </button>
        </div>

        {isCreating && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
            <h2 className="text-xl font-semibold mb-4">Create New Map</h2>
            <form onSubmit={handleCreateMap} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Map Title</label>
                <input 
                  type="text" 
                  value={newMapTitle}
                  onChange={(e) => setNewMapTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g., Grand Resort Layout"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Floorplan Image URL</label>
                <input 
                  type="url" 
                  value={newMapUrl}
                  onChange={(e) => setNewMapUrl(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="https://example.com/floorplan.jpg"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Provide a direct link to a high-resolution PNG or JPG image.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading your maps...</div>
        ) : maps.length === 0 && !isCreating ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
            <Map className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">No maps yet</h3>
            <p className="text-slate-500 mb-6">Create your first interactive map to get started.</p>
            <button 
              onClick={() => setIsCreating(true)}
              className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Create Map
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {maps.map(map => (
              <div key={map.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden group">
                <div className="h-48 bg-slate-100 relative overflow-hidden">
                  <img 
                    src={map.imageUrl} 
                    alt={map.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <button 
                      onClick={() => navigate(`/builder/${map.id}`)}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium w-full text-center"
                    >
                      Open Builder
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 text-lg mb-1 truncate">{map.title}</h3>
                  <div className="flex items-center justify-between mt-4 border-t border-slate-100 pt-4">
                    <a 
                      href={`/map/${map.id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Public
                    </a>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => navigate(`/builder/${map.id}`)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit Map"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteMap(map.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Map"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
