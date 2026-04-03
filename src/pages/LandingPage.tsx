import React from 'react';
import { useNavigate } from 'react-router';
import { signInWithPopup, googleProvider, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Map, MapPin, Share2, Layers } from 'lucide-react';

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/dashboard');
    } catch (error: any) {
      console.error("Login failed", error);
      alert(`Login failed.\n\nError: ${error.message || error.code || 'Unknown error'}\n\nMake sure your Vercel URL is added to Firebase Authorized Domains.`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl">
          <Map className="w-6 h-6" />
          <span>Map-Builder</span>
        </div>
        <button 
          onClick={handleLogin}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-full font-medium transition-colors"
        >
          Sign In
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6">
          Build interactive maps <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">
            for your business
          </span>
        </h1>
        <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
          Upload your floorplans, resorts, or event layouts. Add interactive markers, and share them instantly with your customers. No coding required.
        </p>
        
        <button 
          onClick={handleLogin}
          className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-full font-semibold text-lg shadow-xl shadow-slate-900/20 transition-all hover:scale-105"
        >
          Get Started for Free
        </button>

        <div className="grid md:grid-cols-3 gap-8 mt-24 text-left">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Custom Layouts</h3>
            <p className="text-slate-600">Upload any PNG or JPG floorplan and turn it into an interactive map instantly.</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-xl flex items-center justify-center mb-4">
              <MapPin className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Rich Markers</h3>
            <p className="text-slate-600">Add points of interest with custom icons, photos, and detailed descriptions.</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
              <Share2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Easy Sharing</h3>
            <p className="text-slate-600">Share your map via a simple link. Works perfectly on desktop and mobile devices.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
