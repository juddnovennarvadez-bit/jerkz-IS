import "./login.scss";
import { FaGoogle, FaLock, FaUser } from "react-icons/fa";
import logo from "../../assets/jerks-logo.png";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login({
  onLogin,
  onSignUp,
  onGoogleLogin,
  initialNotice = "",
}) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await onSignUp({ email: email.trim(), username: username.trim(), password });
        setPassword("");
        setNotice(
          "Your account and access request were submitted. Wait for an Admin to approve your request.",
        );
        setIsSignUp(false);
        return;
      }

      await onLogin(email.trim(), password);
      navigate("/", { replace: true });
    } catch (authError) {
      setError(authError.message || "Could not complete sign-in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      await onGoogleLogin();
      navigate("/", { replace: true });
    } catch (authError) {
      setError(authError.message || "Could not sign in with Google.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeMode() {
    setIsSignUp((current) => !current);
    setError("");
    setNotice("");
  }

  return (
    <div className="login-background">
      <div className="logo-space">
        <img src={logo} alt="Jerks Auto Tech" className="logo" />
      </div>
      <div className="login-container">
        <div className="login-form">
          <div className="header">
            <h1>{isSignUp ? "Create Account" : "Login"}</h1>
            <p>
              {isSignUp
                ? "Create a Jerks account with your email."
                : "Sign in with Google or your Jerks account."}
            </p>
          </div>
          <form className="form" onSubmit={handleSubmit}>
            {isSignUp && (
              <div className="input-field">
                <FaUser className="input-icon" aria-hidden="true" />
                <input
                  type="text"
                  id="username"
                  placeholder=" "
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9._-]+"
                  title="Use 3–32 letters, numbers, dots, underscores, or hyphens."
                  required
                />
                <label htmlFor="username">Username</label>
              </div>
            )}
            <div className="input-field">
              <FaUser className="input-icon" aria-hidden="true" />
              <input
                type="email"
                id="email"
                placeholder=" "
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <label htmlFor="email">Email</label>
            </div>
            <div className="input-field">
              <FaLock className="input-icon" aria-hidden="true" />
              <input
                type="password"
                id="password"
                placeholder=" "
                autoComplete={isSignUp ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={isSignUp ? 8 : undefined}
                maxLength={128}
                required
              />
              <label htmlFor="password">Password</label>
            </div>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="login-notice" role="status">
                {notice}
              </p>
            )}
            <button className="login-button" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "PLEASE WAIT..."
                : isSignUp
                  ? "CREATE ACCOUNT"
                  : "SIGN IN WITH EMAIL"}
            </button>
          </form>
          {!isSignUp && (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <button
                className="google-login-button"
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSubmitting}
              >
                <FaGoogle aria-hidden="true" />
                Continue with Google
              </button>
            </>
          )}
          <button
            className="auth-mode-toggle"
            type="button"
            onClick={changeMode}
            disabled={isSubmitting}
          >
            {isSignUp
              ? "Already have a Jerks account? Sign in"
              : "Need an account? Sign up"}
          </button>
          <div className="form-footer">
            <h2>AUTO TECH</h2>
            <hr />
            <p>Inventory System v1.0</p>
          </div>
        </div>
      </div>
    </div>
  );
}
