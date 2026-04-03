import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface UserData {
  role?: string;
  email?: string;
  name?: string;
  createdAt?: any;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userData: null, isAdmin: false, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData(data);
          
          // Check if admin based on role or email
          const isUserAdmin = data.role === 'admin' || 
                             (currentUser.email === 'altamedia3@gmail.com' && currentUser.emailVerified);
          setIsAdmin(isUserAdmin);
        } else {
          // Create user doc if it doesn't exist
          const newUserData = {
            name: currentUser.displayName || 'User',
            email: currentUser.email || '',
            role: currentUser.email === 'altamedia3@gmail.com' ? 'admin' : 'user',
            createdAt: serverTimestamp()
          };
          await setDoc(userDocRef, newUserData);
          setUserData(newUserData);
          setIsAdmin(newUserData.role === 'admin');
        }
      } else {
        setUserData(null);
        setIsAdmin(false);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, isAdmin, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
