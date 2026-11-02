import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import "./App.css";
import "./App.scss";
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import Login from "./Pages/1_Login/login.jsx";
import Main from "./Pages/2_Main/main.jsx";
import { auth, db } from "./firebase.js";

const INITIAL_ADMIN_EMAIL = String(
  import.meta.env.VITE_FIREBASE_ADMIN_EMAIL || "",
)
  .trim()
  .toLowerCase();
const PENDING_ACCESS_MESSAGE =
  "Your access request was sent to an Admin. This page will update automatically when approved.";

function isVerifiedAccount(user) {
  return (
    user.emailVerified ||
    user.providerData.some((provider) => provider.providerId === "google.com")
  );
}

async function resolveAppUser(user) {
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) return null;

  if (
    INITIAL_ADMIN_EMAIL &&
    email === INITIAL_ADMIN_EMAIL &&
    isVerifiedAccount(user)
  ) {
    return {
      uid: user.uid,
      email,
      username: user.displayName || email.split("@")[0],
      role: "Admin",
    };
  }

  const staffRef = doc(db, "staff", user.uid);
  const staffSnapshot = await getDoc(staffRef);
  const staff = staffSnapshot.exists() ? staffSnapshot.data() : null;

  if (!staff) {
    const requestRef = doc(db, "staffRequests", user.uid);
    await runTransaction(db, async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists()) {
        transaction.set(requestRef, {
          uid: user.uid,
          email,
          username: user.displayName || email.split("@")[0],
          status: "pending",
          requestedAt: serverTimestamp(),
        });
      } else if (requestSnapshot.data().status === "rejected") {
        transaction.update(requestRef, {
          status: "pending",
          requestedAt: serverTimestamp(),
        });
      }
    });
  }

  if (
    !staff ||
    staff.email !== email ||
    staff.approved !== true ||
    !["Admin", "Technician"].includes(staff.role)
  ) {
    return null;
  }

  return {
    uid: user.uid,
    email,
    username: user.displayName || staff.username || email.split("@")[0],
    role: staff.role,
  };
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingAccessMessage, setPendingAccessMessage] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          setCurrentUser(null);
          setPendingEmail("");
          setPendingAccessMessage("");
          setAuthError("");
          setAuthReady(true);
          return;
        }

        try {
          const appUser = await resolveAppUser(user);
          if (!active) return;
          setCurrentUser(appUser);
          setPendingEmail(appUser ? "" : user.email || "");
          setPendingAccessMessage(
            appUser ? "" : PENDING_ACCESS_MESSAGE,
          );
          setAuthError("");
          setAuthReady(true);
        } catch (error) {
          if (!active) return;
          setCurrentUser(null);
          setPendingEmail("");
          setPendingAccessMessage("");
          setAuthError(`Could not check staff access: ${error.message}`);
          setAuthReady(true);
        }
      },
      (error) => {
        if (!active) return;
        setAuthError(`Could not restore your sign-in: ${error.message}`);
        setAuthReady(true);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!pendingEmail || !user || user.email !== pendingEmail) return undefined;

    let active = true;
    let requestRejected = false;
    const unsubscribe = onSnapshot(
      doc(db, "staff", user.uid),
      async (snapshot) => {
        if (!snapshot.exists()) return;

        try {
          const appUser = await resolveAppUser(user);
          if (!active || !appUser) return;
          setCurrentUser(appUser);
          setPendingEmail("");
          setPendingAccessMessage("");
          setAuthError("");
        } catch (error) {
          if (!active) return;
          setAuthError(`Could not check Admin approval: ${error.message}`);
        }
      },
      (error) => {
        if (!active) return;
        setAuthError(`Could not listen for Admin approval: ${error.message}`);
      },
    );
    const unsubscribeRequest = onSnapshot(
      doc(db, "staffRequests", user.uid),
      (snapshot) => {
        if (
          !active ||
          requestRejected ||
          !snapshot.exists() ||
          snapshot.data().status !== "rejected"
        ) {
          return;
        }

        requestRejected = true;
        const rejectionMessage =
          "Your access request was rejected by an Admin. You can sign out and submit another request later.";
        setPendingAccessMessage(rejectionMessage);
        setLoginNotice(rejectionMessage);
      },
      (error) => {
        if (!active) return;
        setAuthError(`Could not listen for access request status: ${error.message}`);
      },
    );
    return () => {
      active = false;
      unsubscribe();
      unsubscribeRequest();
    };
  }, [pendingEmail]);

  async function login(email, password) {
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password,
    );
    const appUser = await resolveAppUser(credential.user);
    if (!appUser) {
      setPendingEmail(credential.user.email || "");
      setPendingAccessMessage(PENDING_ACCESS_MESSAGE);
    }
    return appUser;
  }

  async function signUp({ email, username, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = String(username || "").trim();
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(normalizedUsername)) {
      throw new Error(
        "Username must be 3–32 characters and use only letters, numbers, dots, underscores, or hyphens.",
      );
    }
    if (password.length < 8 || password.length > 128) {
      throw new Error("Password must be between 8 and 128 characters.");
    }
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password,
      );
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        return login(normalizedEmail, password);
      }
      throw error;
    }
    try {
      await updateProfile(credential.user, {
        displayName: normalizedUsername,
      });
      await sendEmailVerification(credential.user);
      const requestRef = doc(db, "staffRequests", credential.user.uid);
      await runTransaction(db, async (transaction) => {
        const requestSnapshot = await transaction.get(requestRef);
        if (!requestSnapshot.exists()) {
          transaction.set(requestRef, {
            uid: credential.user.uid,
            email: normalizedEmail,
            username: normalizedUsername,
            status: "pending",
            requestedAt: serverTimestamp(),
          });
        }
      });
    } catch (error) {
      throw new Error(
        `Your account was created, but the access request could not be submitted: ${error.message}`,
      );
    }
    setCurrentUser(null);
    setPendingEmail(credential.user.email || normalizedEmail);
    setPendingAccessMessage(PENDING_ACCESS_MESSAGE);
  }

  async function loginWithGoogle() {
    let credential;
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle({
        skipNativeAuth: true,
      });
      const idToken = result.credential?.idToken;
      if (!idToken) {
        throw new Error("Google sign-in did not return an ID token.");
      }
      credential = await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(idToken),
      );
    } else {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      credential = await signInWithPopup(auth, provider);
    }
    const appUser = await resolveAppUser(credential.user);
    if (!appUser) {
      setPendingEmail(credential.user.email || "");
      setPendingAccessMessage(PENDING_ACCESS_MESSAGE);
    }
    return appUser;
  }

  async function logout() {
    setAuthError("");
    try {
      await signOut(auth);
    } catch (error) {
      setAuthError(`Could not sign out: ${error.message}`);
    }
  }

  if (!authReady) {
    return (
      <div className="App" role="status">
        Checking sign-in...
      </div>
    );
  }

  return (
    <div className="App">
      {authError && (
        <p className="app-auth-error" role="alert">
          {authError}
        </p>
      )}
      <Router>
        <Routes>
          <Route
            path="/login"
            element={
              pendingEmail ? (
                <PendingAccess
                  email={pendingEmail}
                  message={pendingAccessMessage}
                  error={authError}
                  onLogout={logout}
                />
              ) : currentUser ? (
                <Navigate to="/" replace />
              ) : (
                <Login
                  onLogin={login}
                  onSignUp={signUp}
                  onGoogleLogin={loginWithGoogle}
                  initialNotice={loginNotice}
                />
              )
            }
          />
          <Route
            path="/"
            element={
              pendingEmail ? (
                <PendingAccess
                  email={pendingEmail}
                  message={pendingAccessMessage}
                  error={authError}
                  onLogout={logout}
                />
              ) : currentUser ? (
                <Main currentUser={currentUser} onLogout={logout} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="*"
            element={
              pendingEmail ? (
                <PendingAccess
                  email={pendingEmail}
                  message={pendingAccessMessage}
                  error={authError}
                  onLogout={logout}
                />
              ) : (
                <Navigate to={currentUser ? "/" : "/login"} replace />
              )
            }
          />
        </Routes>
      </Router>
    </div>
  );
}

function PendingAccess({ email, message, error, onLogout }) {
  return (
    <main className="auth-pending" aria-labelledby="access-pending-title">
      <h1 id="access-pending-title">Waiting for Admin approval</h1>
      <p>
        <strong>{email}</strong>{" "}
        {message ||
          "Your access request is waiting for Admin approval. This page will update automatically when approved."}
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </main>
  );
}

export default App;
