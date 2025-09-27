import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  setLogLevel
} from 'firebase/firestore';

// ====================================================================
// CRITICAL: REPLACE ALL THE PLACEHOLDER VALUES BELOW 
// WITH YOUR OWN FIREBASE CONFIGURATION OBJECT.
// You can find this in your Firebase Project Settings -> General.
// ====================================================================
const YOUR_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY_HERE", 
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID_HERE"
};
// ====================================================================

// Utility to safely retrieve user ID or generate a random one if anonymous/uninitialized
const getUserId = (auth) => auth?.currentUser?.uid || `Guest-${Math.random().toString(36).substr(2, 9)}`;

// Helper to safely format Firestore Timestamps
const formatTimestamp = (timestamp) => {
  if (!timestamp) return '...';
  const date = timestamp.toDate ? timestamp.toDate() : (timestamp instanceof Date ? timestamp : new Date());
  
  const now = new Date();
  const today = now.toDateString();
  const messageDate = date.toDateString();

  if (today === messageDate) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + 
           ' ' + 
           date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
};


// Main application component
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // 1. Initialize Firebase and Authenticate User
  useEffect(() => {
    if (!YOUR_FIREBASE_CONFIG.apiKey || YOUR_FIREBASE_CONFIG.apiKey === "YOUR_API_KEY_HERE") {
        console.error("Firebase configuration is missing or using placeholder values. Please update YOUR_FIREBASE_CONFIG.");
        setIsLoading(false);
        return;
    }

    try {
      setLogLevel('debug');
      const app = initializeApp(YOUR_FIREBASE_CONFIG);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);
      setDb(firestore);
      setAuth(authInstance);

      // Authenticate anonymously (since we don't have a custom token externally)
      const authenticate = async () => {
        try {
            await signInAnonymously(authInstance);
        } catch (error) {
          console.error("Firebase Auth Error:", error);
          setIsLoading(false); 
        }
      };

      // Set up authentication state listener
      const unsubscribeAuth = onAuthStateChanged(authInstance, (user) => {
        if (user) {
          setUserId(user.uid);
          setIsLoading(false);
        } else {
          // If no user, sign in anonymously
          authenticate();
        }
      });
      
      // Initial authentication call
      authenticate();

      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Firebase Initialization Error:", error);
      setIsLoading(false);
    }
  }, []); // Run only once

  // 2. Real-time Message Listener (onSnapshot)
  useEffect(() => {
    if (!db || !userId) return;

    // We use a simple 'messages' collection path now that we are outside the special environment
    const chatCollectionRef = collection(db, 'ctins_messages');
    
    // Simple query without ordering (sorting client-side)
    const q = query(chatCollectionRef); 

    const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Client-side sorting by timestamp
      const sortedMessages = fetchedMessages.sort((a, b) => {
        // Handle cases where timestamp might still be pending (null/undefined)
        const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
        return timeA - timeB;
      });
      
      setMessages(sortedMessages);
    }, (error) => {
      console.error("Firestore Snapshot Error:", error);
    });

    return () => unsubscribeSnapshot();
  }, [db, userId]);

  // 3. Scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. Send Message Function
  const sendMessage = async (e) => {
    e.preventDefault();
    if (messageInput.trim() === '' || !db || !userId) return;

    try {
      const chatCollectionRef = collection(db, 'ctins_messages');
      
      await addDoc(chatCollectionRef, {
        senderId: userId,
        text: messageInput.trim(),
        timestamp: serverTimestamp(),
      });
      
      setMessageInput('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // 5. Loading and Error UI
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="text-xl font-medium">Connecting to ctins...</div>
      </div>
    );
  }

  // --- UI Components ---

  const MessageBubble = ({ message, isCurrentUser }) => {
    const baseClasses = "max-w-[80%] my-1 p-3 rounded-xl shadow-md transition-all duration-300 ease-in-out";
    const userClasses = isCurrentUser 
      ? "bg-blue-600 text-white self-end rounded-br-none" 
      : "bg-gray-700 text-gray-100 self-start rounded-tl-none";

    return (
      <div className={`flex w-full ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`${baseClasses} ${userClasses}`}>
          {!isCurrentUser && (
            <div className="font-bold text-sm mb-1 opacity-90 truncate">
              {message.senderId.substring(0, 8)}...
            </div>
          )}
          <p className="text-base break-words whitespace-pre-wrap">{message.text}</p>
          <span className={`text-xs mt-1 block ${isCurrentUser ? 'text-blue-200' : 'text-gray-400'} text-right`}>
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      </div>
    );
  };


  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-gray-900 text-white shadow-2xl">
      
      {/* Header */}
      <header className="p-4 bg-purple-700 shadow-lg flex flex-col items-center">
        <h1 className="text-3xl font-extrabold tracking-widest uppercase">CTINS</h1>
        <div className="text-sm font-light mt-1 opacity-80">Group Chat ({messages.length} messages)</div>
        <div className="mt-2 p-1 px-3 bg-purple-600 rounded-full text-xs font-mono select-all">
          Your ID: <span className="font-bold">{userId || 'Loading...'}</span>
        </div>
      </header>
      
      {/* Message Area */}
      <main className="flex-grow p-4 overflow-y-auto space-y-3 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            Start the conversation! No messages yet.
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble 
              key={msg.id} 
              message={msg} 
              isCurrentUser={msg.senderId === userId} 
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Footer */}
      <footer className="p-3 bg-gray-800 border-t border-gray-700">
        <form onSubmit={sendMessage} className="flex space-x-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-grow p-3 rounded-full bg-gray-700 text-white border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-150"
            disabled={!userId}
          />
          <button
            type="submit"
            disabled={messageInput.trim() === '' || !userId}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-5 rounded-full shadow-lg disabled:opacity-50 transition duration-150 transform hover:scale-105"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </form>
      </footer>
      
      {/* Tailwind & Font Setup */}
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            background-color: #1f2937;
          }
          /* Custom scrollbar for message area */
          .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #1f2937;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #4b5563;
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
          }
        `}
      </style>
    </div>
  );
};

export default App;

