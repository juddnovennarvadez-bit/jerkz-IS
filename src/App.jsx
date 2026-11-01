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

function isVerifiedAccount(user) {
  return (
    user.emailVerified ||
    user.providerData.some((provider) => provider.providerId === "google.com")
  );
}

async function resolveAppUser(user) {
  const email = String(user.email || "").trim().toLowerCase();
  if (!isVerifiedAccount(user) || !email) return null;

  if (INITIAL_ADMIN_EMAIL && email === INITIAL_ADMIN_EMAIL) {
    return {
      uid: user.uid,
      email,
      username: user.displayName || email.split("@")[0],
      role: "Admin",
    };
  }

  const staffRef = doc(db, "staff", user.uid);
  const staffSnapshot = await getDoc(staffRef);
  let staff = null;

  if (staffSnapshot.exists()) {
    staff = staffSnapshot.data();
  } else {
    const inviteRef = doc(db, "staffInvites", email);
    const approvedStaff = await runTransaction(db, async (transaction) => {
      const latestStaffSnapshot = await transaction.get(staffRef);
      if (latestStaffSnapshot.exists()) return latestStaffSnapshot.data();

      const inviteSnapshot = await transaction.get(inviteRef);
      if (!inviteSnapshot.exists()) return null;

      const invite = inviteSnapshot.data();
      if (
        invite.email !== email ||
        invite.approved !== true ||
        !["Admin", "Technician"].includes(invite.role) ||
        (invite.claimedUid && invite.claimedUid !== user.uid)
      ) {
        return null;
      }

      if (!invite.claimedUid) {
        transaction.update(inviteRef, { claimedUid: user.uid });
      }
      const newStaff = {
        email,
        username: user.displayName || email.split("@")[0],
        role: invite.role,
        approved: true,
        createdAt: serverTimestamp(),
      };
      transaction.set(staffRef, newStaff);
      return newStaff;
    });
    staff = approvedStaff;
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
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user || !isVerifiedAccount(user)) {
          setCurrentUser(null);
          setPendingEmail("");
          setAuthError("");
          setAuthReady(true);
          return;
        }

        try {
          const appUser = await resolveAppUser(user);
          if (!active) return;
          setCurrentUser(appUser);
          setPendingEmail(appUser ? "" : user.email || "");
          setAuthError("");
          setAuthReady(true);
        } catch (error) {
          if (!active) return;
          setCurrentUser(null);
          setPendingEmail("");
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

  async function login(email, password) {
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password,
    );
    if (!credential.user.emailVerified) {
      await signOut(auth);
      throw new Error(
        "Verify your email before signing in. Check your inbox for Firebase's verification message.",
      );
    }
    const appUser = await resolveAppUser(credential.user);
    if (!appUser) {
      throw new Error(
        "Your account is not approved for inventory access yet. Ask an Admin to invite your email.",
      );
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
    const credential = await createUserWithEmailAndPassword(
      auth,
      normalizedEmail,
      password,
    );
    try {
      await updateProfile(credential.user, {
        displayName: normalizedUsername,
      });
      await sendEmailVerification(credential.user);
    } catch (error) {
      throw new Error(
        `Your account was created, but setup did not finish: ${error.message}`,
      );
    }
    await signOut(auth);
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
      throw new Error(
        "Your account is not approved for inventory access yet. Ask an Admin to invite your email.",
      );
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

  if (pendingEmail) {
    return (
      <main className="auth-pending" aria-labelledby="access-pending-title">
        <h1 id="access-pending-title">Waiting for staff approval</h1>
        <p>
          <strong>{pendingEmail}</strong> is signed in, but has not been
          approved for the shared inventory. Ask an Admin to invite this email,
          then sign out and sign in again.
        </p>
        <button type="button" onClick={logout}>
          Sign out
        </button>
      </main>
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
              currentUser ? (
                <Navigate to="/" replace />
              ) : (
                <Login
                  onLogin={login}
                  onSignUp={signUp}
                  onGoogleLogin={loginWithGoogle}
                />
              )
            }
          />
          <Route
            path="/"
            element={
              currentUser ? (
                <Main currentUser={currentUser} onLogout={logout} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="*"
            element={<Navigate to={currentUser ? "/" : "/login"} replace />}
          />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
