import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, doc, setDoc, getDoc, collection, updateDoc, deleteDoc, onSnapshot, getDocs, query, where } from "firebase/firestore";
import { getDatabase, ref, set, get, onValue, update, remove } from "firebase/database";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyC7N3IOa7GRETNRBo8P-QKVFzg2bLqoEco",
  authDomain: "students-app-deae5.firebaseapp.com",
  databaseURL: "https://students-app-deae5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "students-app-deae5",
  storageBucket: "students-app-deae5.firebasestorage.app",
  messagingSenderId: "128267767708",
  appId: "1:128267767708:web:08ed73b1563b2f3eb60259"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);

// --- EXPORTED HELPERS ---

export const checkFirebaseConnection = () => {
  return true; 
};

export const subscribeToAuth = (callback) => {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
};

// --- DUAL WRITE / SMART READ LOGIC ---

// 1. User Data Sync
export const saveUserToLive = async (user) => {
  try {
    if (!user || !user.id) {
        console.error("SaveUserToLive Error: Missing User ID", user);
        return;
    }
    
    // 1. RTDB (Fastest & Primary for Dashboard)
    const userRef = ref(rtdb, `users/${user.id}`);
    await set(userRef, user);
    
    // 2. Firestore (Dual Write for Backup/Queries)
    await setDoc(doc(db, "users", user.id), user);
    
    console.log("User saved successfully to both DBs");
  } catch (error) {
    console.error("Error saving user:", error);
  }
};

// ** UPDATED FUNCTION: Now listens to RTDB directly **
export const subscribeToUsers = (callback) => {
  const usersRef = ref(rtdb, 'users');
  
  // onValue Realtime Database को सुनता है (Admin Dashboard के लिए सबसे तेज़)
  return onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      
      // Data को Object से Array में convert करें: [{name:..}, {name:..}]
      const userList = data ? Object.values(data) : [];
      
      callback(userList);
  }, (error) => {
      console.error("RTDB Subscription Error:", error);
  });
};

export const getUserData = async (userId) => {
    try {
        // Try RTDB First (Faster)
        const snap = await get(ref(rtdb, `users/${userId}`));
        if (snap.exists()) return snap.val();
        
        // Try Firestore (Fallback)
        const docSnap = await getDoc(doc(db, "users", userId));
        if (docSnap.exists()) return docSnap.data();

        return null;
    } catch (e) { console.error(e); return null; }
};

export const getUserByEmail = async (email) => {
    try {
        const q = query(collection(db, "users"), where("email", "==", email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].data();
        }
        return null; 
    } catch (e) { console.error(e); return null; }
};

// 2. System Settings Sync
export const saveSystemSettings = async (settings) => {
  try {
    await set(ref(rtdb, 'system_settings'), settings);
    await setDoc(doc(db, "config", "system_settings"), settings);
  } catch (error) {
    console.error("Error saving settings:", error);
  }
};

export const subscribeToSettings = (callback) => {
  // Prefer RTDB for Settings too (Faster config load)
  const settingsRef = ref(rtdb, 'system_settings');
  return onValue(settingsRef, (snapshot) => {
       const data = snapshot.val();
       if (data) callback(data);
  }, (error) => {
      // Fallback to Firestore if RTDB fails
      getDoc(doc(db, "config", "system_settings")).then(docSnap => {
        if (docSnap.exists()) callback(docSnap.data());
      });
  });
};

// 3. Content Links Sync (Bulk Uploads)
export const bulkSaveLinks = async (updates) => {
  try {
    // RTDB
    await update(ref(rtdb, 'content_links'), updates);
    
    // Firestore - We save each update as a document in 'content_data' collection
    const batchPromises = Object.entries(updates).map(async ([key, data]) => {
         await setDoc(doc(db, "content_data", key), data);
    });
    await Promise.all(batchPromises);

  } catch (error) {
    console.error("Error bulk saving links:", error);
  }
};

// 4. Chapter Data Sync (Individual)
export const saveChapterData = async (key, data) => {
  try {
    await set(ref(rtdb, `content_data/${key}`), data);
    await setDoc(doc(db, "content_data", key), data);
  } catch (error) {
    console.error("Error saving chapter data:", error);
  }
};

export const getChapterData = async (key) => {
    try {
        // 1. Try RTDB (Faster)
        const snapshot = await get(ref(rtdb, `content_data/${key}`));
        if (snapshot.exists()) {
            return snapshot.val();
        }
        
        // 2. Fallback to Firestore
        const docSnap = await getDoc(doc(db, "content_data", key));
        if (docSnap.exists()) {
            return docSnap.data();
        }
        
        return null;
    } catch (error) {
        console.error("Error getting chapter data:", error);
        return null;
    }
};

// Used by client to listen for realtime changes to a specific chapter
export const subscribeToChapterData = (key, callback) => {
    const rtdbRef = ref(rtdb, `content_data/${key}`);
    return onValue(rtdbRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.val());
        }
    });
};


export const saveTestResult = async (userId, attempt) => {
    try {
        const docId = `${attempt.testId}_${Date.now()}`;
        await setDoc(doc(db, "users", userId, "test_results", docId), attempt);
    } catch(e) { console.error(e); }
};

export const updateUserStatus = async (userId, time) => {
     try {
        const userRef = ref(rtdb, `users/${userId}`);
        await update(userRef, { lastActiveTime: new Date().toISOString() });
    } catch (error) {
        console.error("Status update error", error);
    }
};

export { app, db, rtdb, auth };
